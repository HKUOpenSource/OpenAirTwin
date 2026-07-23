import * as THREE from "/lib/three.module.js";

export const RADAR_VISUAL_INSTANCE_PREFIX = "radar-target-visual-";
export const RADAR_SIONNA_OBJECT_PREFIX = "radar-target-";

export function radarVisualInstanceId(targetId) {
  return `${RADAR_VISUAL_INSTANCE_PREFIX}${targetId}`;
}

export function radarSionnaObjectName(targetId) {
  return `${RADAR_SIONNA_OBJECT_PREFIX}${targetId}`;
}

function vector3(value, name) {
  if (!Array.isArray(value) || value.length !== 3) {
    throw new Error(`${name} must contain three coordinates`);
  }
  const parsed = value.map(Number);
  if (!parsed.every(Number.isFinite)) {
    throw new Error(`${name} must contain only finite coordinates`);
  }
  return Object.freeze(parsed);
}

function normalizeTarget(value) {
  if (!value || typeof value !== "object") {
    throw new Error("Radar target must be an object");
  }
  const id = String(value.id || "").trim();
  const assetId = String(value.asset_id || value.assetId || "").trim();
  if (!/^[A-Za-z][A-Za-z0-9_-]*$/.test(id)) {
    throw new Error("Radar target id is invalid");
  }
  if (!assetId) {
    throw new Error(`Radar target ${id} requires an asset id`);
  }
  const rcsM2 = Number(value.rcs_m2 ?? value.rcsM2);
  if (!Number.isFinite(rcsM2) || rcsM2 <= 0) {
    throw new Error(`Radar target ${id} requires a positive effective RCS`);
  }
  return Object.freeze({
    id,
    assetId,
    position: vector3(value.position, `Radar target ${id} position`),
    orientation: vector3(value.orientation, `Radar target ${id} orientation`),
    velocity: vector3(value.velocity, `Radar target ${id} velocity`),
    rcsM2,
    visualInstanceId: radarVisualInstanceId(id),
    sionnaObjectName: radarSionnaObjectName(id),
  });
}

function applyTargetTransform(instance, target) {
  instance.name = target.visualInstanceId;
  instance.position.fromArray(target.position);
  instance.rotation.set(...target.orientation);
  instance.userData.radarTargetId = target.id;
  instance.userData.radarVisualInstanceId = target.visualInstanceId;
  instance.userData.radarSionnaObjectName = target.sionnaObjectName;
  instance.userData.radarAssetId = target.assetId;
  instance.userData.radarVelocityMps = [...target.velocity];
  instance.userData.radarEffectiveRcsM2 = target.rcsM2;
}

export class RadarTargetScene {
  constructor({assetManager, group = new THREE.Group()} = {}) {
    if (!assetManager?.instantiate || !assetManager?.release) {
      throw new Error("RadarTargetScene requires an AssetManager-compatible instance");
    }
    this.assetManager = assetManager;
    this.group = group;
    this.group.name ||= "radar-targets";
    this._records = new Map();
    this._generation = 0;
    this._disposed = false;
  }

  get size() {
    return this._records.size;
  }

  instanceForTarget(targetId) {
    return this._records.get(targetId)?.instance || null;
  }

  targetIdForVisualInstance(visualInstanceId) {
    for (const record of this._records.values()) {
      if (record.target.visualInstanceId === visualInstanceId) {
        return record.target.id;
      }
    }
    return null;
  }

  snapshot() {
    return Object.freeze([...this._records.values()].map((record) => record.target));
  }

  remove(targetId) {
    const record = this._records.get(targetId);
    if (!record) {
      return false;
    }
    this._records.delete(targetId);
    this.assetManager.release(record.instance);
    return true;
  }

  async sync(targetValues) {
    if (this._disposed) {
      throw new Error("RadarTargetScene has been disposed");
    }
    if (!Array.isArray(targetValues)) {
      throw new Error("Radar targets must be an array");
    }
    const targets = targetValues.map(normalizeTarget);
    const ids = new Set(targets.map((target) => target.id));
    if (ids.size !== targets.length) {
      throw new Error("Radar targets must have unique ids");
    }

    const generation = ++this._generation;
    for (const targetId of [...this._records.keys()]) {
      if (!ids.has(targetId)) {
        this.remove(targetId);
      }
    }

    for (const target of targets) {
      if (generation !== this._generation || this._disposed) {
        break;
      }
      const current = this._records.get(target.id);
      if (current?.target.assetId === target.assetId) {
        applyTargetTransform(current.instance, target);
        current.target = target;
        continue;
      }

      const instance = await this.assetManager.instantiate(target.assetId);
      if (generation !== this._generation || this._disposed) {
        this.assetManager.release(instance);
        continue;
      }
      if (current) {
        this.remove(target.id);
      }
      applyTargetTransform(instance, target);
      this.group.add(instance);
      this._records.set(target.id, {target, instance});
    }
    return this.snapshot();
  }

  dispose() {
    if (this._disposed) {
      return;
    }
    this._disposed = true;
    this._generation += 1;
    for (const targetId of [...this._records.keys()]) {
      this.remove(targetId);
    }
  }
}
