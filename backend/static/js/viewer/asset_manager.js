import * as THREE from "/lib/three.module.js";
import {GLTFLoader} from "/lib/GLTFLoader.js";
import {PLYLoader} from "/lib/PLYLoader.js";
import {disposeObject3D} from "/js/viewer/dispose.js";

const SUPPORTED_FORMATS = new Set(["glb", "ply"]);

function normalizeDescriptor(descriptor) {
  if (!descriptor || typeof descriptor.id !== "string" || !descriptor.id.trim()) {
    throw new Error("Asset descriptor requires an id");
  }
  if (typeof descriptor.url !== "string" || !descriptor.url.trim()) {
    throw new Error(`Asset ${descriptor.id} requires a URL`);
  }
  const format = String(descriptor.format || descriptor.url.split(".").pop() || "").toLowerCase();
  if (!SUPPORTED_FORMATS.has(format)) {
    throw new Error(`Asset ${descriptor.id} has unsupported format: ${format}`);
  }
  const units = Number(descriptor.units ?? descriptor.unitScaleM ?? 1);
  if (!Number.isFinite(units) || units <= 0) {
    throw new Error(`Asset ${descriptor.id} units must be a positive scale in metres`);
  }
  return Object.freeze({
    units,
    upAxis: "Z",
    pivot: "origin",
    defaultScale: descriptor.defaultTransform?.scale || [1, 1, 1],
    defaultRotation: descriptor.defaultTransform?.rotation || [0, 0, 0],
    defaultPosition: descriptor.defaultTransform?.position || [0, 0, 0],
    material: Object.freeze({color: "#8c929b", roughness: 0.8, metalness: 0}),
    license: Object.freeze({name: "unspecified", source: "", attribution: ""}),
    ...descriptor,
    format,
  });
}

function vector3(value, fallback) {
  const source = Array.isArray(value) ? value : fallback;
  return new THREE.Vector3(Number(source[0]), Number(source[1]), Number(source[2]));
}

function materialFor(descriptor, geometry) {
  const material = descriptor.material || {};
  return new THREE.MeshStandardMaterial({
    color: material.color || "#8c929b",
    roughness: material.roughness ?? 0.8,
    metalness: material.metalness ?? 0,
    vertexColors: Boolean(geometry.getAttribute("color")),
    side: THREE.DoubleSide,
  });
}

export class AssetManager {
  constructor({gltfLoader = new GLTFLoader(), plyLoader = new PLYLoader()} = {}) {
    this.gltfLoader = gltfLoader;
    this.plyLoader = plyLoader;
    this._descriptors = new Map();
    this._records = new Map();
    this._sourceRecords = new Map();
    this._instances = new WeakMap();
  }

  register(descriptor) {
    const normalized = normalizeDescriptor(descriptor);
    if (this._descriptors.has(normalized.id)) {
      throw new Error(`Asset already registered: ${normalized.id}`);
    }
    this._descriptors.set(normalized.id, normalized);
    return normalized;
  }

  descriptor(id) {
    return this._descriptors.get(id) || null;
  }

  async preload(id, {onProgress = () => {}} = {}) {
    const descriptor = this.descriptor(id);
    if (!descriptor) {
      throw new Error(`Unknown asset: ${id}`);
    }
    const existing = this._records.get(id);
    if (existing?.sourceRecord.source) {
      return existing.sourceRecord.source;
    }
    if (existing?.sourceRecord.promise) {
      return existing.sourceRecord.promise;
    }
    const sourceKey = `${descriptor.format}:${descriptor.url}`;
    const shared = this._sourceRecords.get(sourceKey);
    if (shared) {
      this._records.set(id, {descriptor, sourceRecord: shared});
      return shared.source || shared.promise;
    }
    const sourceRecord = {sourceKey, source: null, promise: null, references: 0, evictWhenUnused: false};
    sourceRecord.promise = this._load(descriptor, onProgress)
      .then((source) => {
        source.traverse((child) => {
          child.userData.assetManaged = true;
        });
        sourceRecord.source = source;
        sourceRecord.promise = null;
        return source;
      })
      .catch((error) => {
        for (const [assetId, record] of [...this._records.entries()]) {
          if (record.sourceRecord === sourceRecord) {
            this._records.delete(assetId);
          }
        }
        if (this._sourceRecords.get(sourceKey) === sourceRecord) {
          this._sourceRecords.delete(sourceKey);
        }
        throw error;
      });
    this._records.set(id, {descriptor, sourceRecord});
    this._sourceRecords.set(sourceKey, sourceRecord);
    return sourceRecord.promise;
  }

  async instantiate(id, transform = {}) {
    const source = await this.preload(id, {onProgress: transform.onProgress});
    const record = this._records.get(id);
    const descriptor = record.descriptor;
    const sourceRecord = record.sourceRecord;
    const instance = source.clone(true);
    instance.userData.assetManaged = true;
    instance.userData.assetId = id;
    const baseScale = vector3(descriptor.defaultScale, [1, 1, 1]).multiplyScalar(descriptor.units);
    const requestedScale = vector3(transform.scale, [1, 1, 1]);
    instance.scale.copy(baseScale.multiply(requestedScale));
    const rotation = vector3(transform.rotation, descriptor.defaultRotation);
    instance.rotation.set(rotation.x, rotation.y, rotation.z);
    const position = vector3(transform.position, descriptor.defaultPosition);
    instance.position.copy(position);
    if (String(descriptor.upAxis).toUpperCase() === "Y") {
      instance.rotateX(Math.PI / 2);
    } else if (String(descriptor.upAxis).toUpperCase() === "X") {
      instance.rotateY(-Math.PI / 2);
    }
    if (descriptor.pivot === "center" || descriptor.pivot === "bottom") {
      const box = new THREE.Box3().setFromObject(instance);
      const center = box.getCenter(new THREE.Vector3());
      const pivotZ = descriptor.pivot === "bottom" ? box.min.z : center.z;
      instance.position.sub(new THREE.Vector3(center.x, center.y, pivotZ));
      instance.position.add(position);
    }
    sourceRecord.references += 1;
    this._instances.set(instance, {record, sourceRecord});
    return instance;
  }

  release(instance) {
    const tracked = this._instances.get(instance);
    if (!tracked) {
      return false;
    }
    instance.removeFromParent?.();
    this._instances.delete(instance);
    tracked.sourceRecord.references = Math.max(0, tracked.sourceRecord.references - 1);
    if (tracked.sourceRecord.references === 0 && tracked.sourceRecord.evictWhenUnused) {
      this._disposeSourceRecord(tracked.sourceRecord);
    }
    return true;
  }

  clearCache({force = false} = {}) {
    for (const sourceRecord of new Set(this._sourceRecords.values())) {
      if (force || sourceRecord.references === 0) {
        this._disposeSourceRecord(sourceRecord);
      } else {
        sourceRecord.evictWhenUnused = true;
      }
    }
  }

  async _load(descriptor, onProgress) {
    if (descriptor.format === "glb") {
      const gltf = await this.gltfLoader.loadAsync(descriptor.url, onProgress);
      const source = gltf?.scene || gltf?.scenes?.[0] || gltf;
      if (!source?.isObject3D) {
        throw new Error(`GLB asset ${descriptor.id} did not contain a Three.js scene`);
      }
      return source;
    }
    const geometry = await new Promise((resolve, reject) => {
      this.plyLoader.load(descriptor.url, resolve, onProgress, reject);
    });
    if (!geometry.getAttribute("normal")) {
      geometry.computeVertexNormals();
    }
    const mesh = new THREE.Mesh(geometry, materialFor(descriptor, geometry));
    const group = new THREE.Group();
    group.name = `asset:${descriptor.id}`;
    group.add(mesh);
    return group;
  }

  _disposeSourceRecord(sourceRecord) {
    if (sourceRecord.source) {
      sourceRecord.source.traverse((child) => {
        child.userData.assetManaged = false;
      });
      disposeObject3D(sourceRecord.source, {removeFromParent: false});
    }
    for (const [id, candidate] of [...this._records.entries()]) {
      if (candidate.sourceRecord === sourceRecord) {
        this._records.delete(id);
      }
    }
    for (const [key, candidate] of [...this._sourceRecords.entries()]) {
      if (candidate === sourceRecord) {
        this._sourceRecords.delete(key);
      }
    }
  }
}
