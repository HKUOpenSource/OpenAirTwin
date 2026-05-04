import * as THREE from "/lib/three.module.js";
import {OrbitControls} from "/lib/OrbitControls.js";
import {GLBGeometryLoader} from "/lib/GLBGeometryLoader.js";
import {Line2} from "/lib/Line2.js";
import {LineGeometry} from "/lib/LineGeometry.js";
import {LineMaterial} from "/lib/LineMaterial.js";

const DEFAULT_VIEW = {
  position: new THREE.Vector3(-120, -180, 150),
  target: new THREE.Vector3(72, 37, 10),
};

const CAMERA_NEAR_MIN = 0.05;
const CAMERA_NEAR_MAX = 5;
const CAMERA_FAR_MIN = 20000;
const CAMERA_FAR_MULTIPLIER = 150;
const BUNDLE_LOAD_CONCURRENCY = 2;

const MATERIAL_COLORS = {
  itu_concrete: "#5b5d61",
  itu_medium_dry_ground: "#d9cfbb",
  itu_wet_ground: "#87aec1",
  itu_wood: "#5c7a57",
};

const CATEGORY_DISPLAY_LAYERS = {
  TERRAIN_TB: {
    renderOrder: 0,
    polygonOffsetFactor: 4,
    polygonOffsetUnits: 4,
    depthWrite: true,
  },
  WATERBODY: {
    renderOrder: 1,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
    depthWrite: false,
  },
  GENERIC: {
    renderOrder: 2,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
    depthWrite: true,
  },
  INFRASTRUCTURE: {
    renderOrder: 3,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
    depthWrite: true,
  },
  INFRASTRUCTURE_TB: {
    renderOrder: 3,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
    depthWrite: true,
  },
  VEGETATION_TB: {
    renderOrder: 4,
    polygonOffsetFactor: -0.5,
    polygonOffsetUnits: -0.5,
    depthWrite: true,
  },
  BUILDING: {
    renderOrder: 5,
    polygonOffsetFactor: -0.5,
    polygonOffsetUnits: -0.5,
    depthWrite: true,
  },
};

function pathColor(t) {
  const stops = [
    {t: 0.0, c: [62, 76, 154]},
    {t: 0.33, c: [69, 156, 206]},
    {t: 0.5, c: [90, 188, 170]},
    {t: 0.66, c: [146, 200, 116]},
    {t: 0.82, c: [201, 178, 101]},
    {t: 1.0, c: [196, 113, 113]},
  ];
  for (let i = 0; i < stops.length - 1; i += 1) {
    const a = stops[i];
    const b = stops[i + 1];
    if (t >= a.t && t <= b.t) {
      const u = (t - a.t) / (b.t - a.t);
      const r = Math.round(a.c[0] + (b.c[0] - a.c[0]) * u);
      const g = Math.round(a.c[1] + (b.c[1] - a.c[1]) * u);
      const bCol = Math.round(a.c[2] + (b.c[2] - a.c[2]) * u);
      return new THREE.Color(`rgb(${r},${g},${bCol})`);
    }
  }
  return new THREE.Color("#c47171");
}

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

function jetColor(t) {
  const x = clamp01(t);
  const stops = [
    {t: 0.0, c: [0, 0, 128]},
    {t: 0.16, c: [0, 0, 255]},
    {t: 0.36, c: [0, 160, 255]},
    {t: 0.5, c: [0, 255, 255]},
    {t: 0.68, c: [255, 255, 0]},
    {t: 0.82, c: [255, 160, 0]},
    {t: 0.93, c: [255, 0, 0]},
    {t: 1.0, c: [128, 0, 0]},
  ];

  for (let i = 0; i < stops.length - 1; i += 1) {
    const a = stops[i];
    const b = stops[i + 1];
    if (x >= a.t && x <= b.t) {
      const u = (x - a.t) / (b.t - a.t);
      const r = (a.c[0] + (b.c[0] - a.c[0]) * u) / 255;
      const g = (a.c[1] + (b.c[1] - a.c[1]) * u) / 255;
      const blue = (a.c[2] + (b.c[2] - a.c[2]) * u) / 255;
      return new THREE.Color(r, g, blue);
    }
  }

  return new THREE.Color("#800000");
}

function heatmapColor(t) {
  return jetColor(t);
}

function normalize(values) {
  const finite = values.filter(Number.isFinite);
  if (!finite.length) {
    return {min: 0, max: 1};
  }
  return {min: Math.min(...finite), max: Math.max(...finite)};
}

function colorForMesh(mesh) {
  return new THREE.Color(MATERIAL_COLORS[mesh.bsdf_id] || "#7a8088");
}

function displayLayerForBundle(bundle) {
  return CATEGORY_DISPLAY_LAYERS[bundle.category] || {
    renderOrder: 2,
    polygonOffsetFactor: 0,
    polygonOffsetUnits: 0,
    depthWrite: true,
  };
}

function bundleSizeBytes(bundle) {
  const size = Number(bundle.size_bytes);
  return Number.isFinite(size) && size > 0 ? size : null;
}

export class Viewer {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({canvas, antialias: true});
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.18;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xe7eaef);
    this.scene.fog = null;

    this.camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, CAMERA_NEAR_MIN, CAMERA_FAR_MIN);
    this.camera.up.set(0, 0, 1);
    this.camera.position.copy(DEFAULT_VIEW.position);

    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.target.copy(DEFAULT_VIEW.target);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;
    this.controls.screenSpacePanning = true;
    this.controls.maxDistance = CAMERA_FAR_MIN * 0.5;

    this.loader = new GLBGeometryLoader();
    this.modelGroup = new THREE.Group();
    this.pathGroup = new THREE.Group();
    this.overlayGroup = new THREE.Group();
    this.markerGroup = new THREE.Group();
    this.scene.add(this.modelGroup, this.pathGroup, this.overlayGroup, this.markerGroup);

    this.pathMaterials = [];
    this.meshMaterials = [];
    this.modelEntries = new Map();
    this.tileMeshCounts = new Map();
    this.meshesLoaded = 0;
    this.loadedTileIds = new Set();

    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();
    this.freeLook = {
      active: false,
      pointerId: null,
      yaw: 0,
      pitch: 0,
    };
    this.fly = {
      yaw: 0,
      pitch: 0,
      moveSpeed: 85,
      boostMultiplier: 2.6,
      lookSpeed: 0.0022,
      moveState: {
        forward: false,
        backward: false,
        left: false,
        right: false,
        up: false,
        down: false,
        boost: false,
      },
    };
    this.lastFrameTime = performance.now();

    this.txMarkerRadius = 1.6;
    this.rxMarkerRadius = 1.2;
    this.txMarker = this.#createMarker("#1f6fff", this.txMarkerRadius);
    this.rxMarker = this.#createMarker("#ff8b3d", this.rxMarkerRadius);
    this.markerGroup.add(this.txMarker, this.rxMarker);

    const ambient = new THREE.AmbientLight(0xffffff, 1.35);
    const keyLight = new THREE.DirectionalLight(0xffffff, 1.05);
    keyLight.position.set(-120, -180, 220);
    const fillLight = new THREE.DirectionalLight(0xc5d3f1, 0.65);
    fillLight.position.set(180, 120, 120);
    this.scene.add(ambient, keyLight, fillLight);

    window.addEventListener("resize", () => this.#onResize());
    this.canvas.addEventListener("pointerdown", (event) => this.#onPointerDown(event), {capture: true});
    window.addEventListener("pointermove", (event) => this.#onPointerMove(event), {capture: true});
    window.addEventListener("pointerup", (event) => this.#onPointerUp(event), {capture: true});
    window.addEventListener("pointercancel", (event) => this.#onPointerUp(event), {capture: true});
    window.addEventListener("keydown", (event) => this.#onKeyDown(event), {capture: true});
    window.addEventListener("keyup", (event) => this.#onKeyUp(event), {capture: true});
    window.addEventListener("blur", () => this.#clearFlyMovement());
    this.#animate();
  }

  #createMarker(color, radius) {
    const geometry = new THREE.SphereGeometry(radius, 24, 24);
    const material = new THREE.MeshStandardMaterial({
      color,
      roughness: 0.25,
      metalness: 0.0,
      emissive: color,
      emissiveIntensity: 0.12,
    });
    return new THREE.Mesh(geometry, material);
  }

  #onResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    for (const material of this.pathMaterials) {
      material.resolution.set(window.innerWidth, window.innerHeight);
    }
  }

  #animate(time = performance.now()) {
    requestAnimationFrame((nextTime) => this.#animate(nextTime));
    const deltaSeconds = Math.min((time - this.lastFrameTime) / 1000, 0.05);
    this.lastFrameTime = time;
    if (this.#hasFlyMovement()) {
      this.#updateFlyMotion(deltaSeconds);
    }
    if (!this.freeLook.active) {
      this.controls.update(deltaSeconds);
    }
    this.#syncClipPlanes();
    this.renderer.render(this.scene, this.camera);
  }

  #syncClipPlanes() {
    const orbitDistance = Math.max(this.camera.position.distanceTo(this.controls.target), 1);
    const nextNear = THREE.MathUtils.clamp(orbitDistance / 5000, CAMERA_NEAR_MIN, CAMERA_NEAR_MAX);
    const nextFar = Math.max(orbitDistance * CAMERA_FAR_MULTIPLIER, CAMERA_FAR_MIN);

    if (Math.abs(this.camera.near - nextNear) < 1e-6 && Math.abs(this.camera.far - nextFar) < 1e-3) {
      return;
    }

    this.camera.near = nextNear;
    this.camera.far = nextFar;
    this.controls.maxDistance = nextFar * 0.5;
    this.camera.updateProjectionMatrix();
  }

  #cameraDirection() {
    const direction = new THREE.Vector3();
    this.camera.getWorldDirection(direction);
    return direction.normalize();
  }

  #syncLookAngles(state) {
    const direction = this.#cameraDirection();
    const planarLength = Math.hypot(direction.x, direction.y);
    state.yaw = planarLength > 1e-8 ? Math.atan2(direction.x, direction.y) : 0;
    state.pitch = Math.atan2(direction.z, Math.max(planarLength, 1e-8));
  }

  #applyLookOrientation(yaw, pitch) {
    const cosPitch = Math.cos(pitch);
    const direction = new THREE.Vector3(
      Math.sin(yaw) * cosPitch,
      Math.cos(yaw) * cosPitch,
      Math.sin(pitch),
    ).normalize();
    const distance = Math.max(this.camera.position.distanceTo(this.controls.target), 1.0);
    this.controls.target.copy(this.camera.position).addScaledVector(direction, distance);
    this.camera.lookAt(this.controls.target);
  }

  #clearFlyMovement() {
    for (const key of Object.keys(this.fly.moveState)) {
      this.fly.moveState[key] = false;
    }
  }

  #cancelFreeLook() {
    if (!this.freeLook.active) {
      return;
    }
    this.freeLook.active = false;
    const pointerId = this.freeLook.pointerId;
    this.freeLook.pointerId = null;
    this.canvas.style.cursor = "";
    try {
      if (pointerId !== null) {
        this.canvas.releasePointerCapture(pointerId);
      }
    } catch {}
  }

  #hasFlyMovement() {
    return this.fly.moveState.forward
      || this.fly.moveState.backward
      || this.fly.moveState.left
      || this.fly.moveState.right
      || this.fly.moveState.up
      || this.fly.moveState.down;
  }

  #isFormTarget(target) {
    if (!(target instanceof Element)) {
      return false;
    }
    const tag = target.tagName;
    return target.isContentEditable || tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || tag === "BUTTON";
  }

  #updateFlyMotion(deltaSeconds) {
    if (deltaSeconds <= 0) {
      return;
    }

    const movement = new THREE.Vector3();
    const forward = this.#cameraDirection();
    const right = new THREE.Vector3().crossVectors(forward, this.camera.up).normalize();
    const up = this.camera.up.clone().normalize();

    if (this.fly.moveState.forward) {
      movement.add(forward);
    }
    if (this.fly.moveState.backward) {
      movement.sub(forward);
    }
    if (this.fly.moveState.right) {
      movement.add(right);
    }
    if (this.fly.moveState.left) {
      movement.sub(right);
    }
    if (this.fly.moveState.up) {
      movement.add(up);
    }
    if (this.fly.moveState.down) {
      movement.sub(up);
    }

    if (movement.lengthSq() === 0) {
      return;
    }

    const speed = this.fly.moveState.boost ? this.fly.moveSpeed * this.fly.boostMultiplier : this.fly.moveSpeed;
    movement.normalize().multiplyScalar(speed * deltaSeconds);
    this.camera.position.add(movement);
    this.controls.target.add(movement);
    this.camera.lookAt(this.controls.target);
  }

  #onKeyDown(event) {
    if (this.#isFormTarget(event.target)) {
      return;
    }
    const handled = this.#setFlyMovementKey(event.code, true);
    if (handled) {
      event.preventDefault();
    }
  }

  #onKeyUp(event) {
    if (this.#isFormTarget(event.target)) {
      return;
    }
    const handled = this.#setFlyMovementKey(event.code, false);
    if (handled) {
      event.preventDefault();
    }
  }

  #setFlyMovementKey(code, pressed) {
    switch (code) {
      case "KeyW":
        this.fly.moveState.forward = pressed;
        return true;
      case "KeyS":
        this.fly.moveState.backward = pressed;
        return true;
      case "KeyA":
        this.fly.moveState.left = pressed;
        return true;
      case "KeyD":
        this.fly.moveState.right = pressed;
        return true;
      case "KeyE":
        this.fly.moveState.up = pressed;
        return true;
      case "KeyQ":
        this.fly.moveState.down = pressed;
        return true;
      case "ShiftLeft":
      case "ShiftRight":
        this.fly.moveState.boost = pressed;
        return true;
      default:
        return false;
    }
  }

  #onPointerDown(event) {
    if (event.button !== 0 || !event.shiftKey || this.freeLook.active) {
      return;
    }
    this.freeLook.active = true;
    this.freeLook.pointerId = event.pointerId;
    this.controls.enabled = false;
    this.canvas.style.cursor = "grabbing";
    this.#syncLookAngles(this.freeLook);
    this.#syncLookAngles(this.fly);
    try {
      this.canvas.setPointerCapture(event.pointerId);
    } catch {}
    event.preventDefault();
    event.stopPropagation();
  }

  #onPointerMove(event) {
    if (!this.freeLook.active || event.pointerId !== this.freeLook.pointerId) {
      return;
    }
    const rotateSpeed = 0.0032;
    this.freeLook.yaw += event.movementX * rotateSpeed;
    this.freeLook.pitch = THREE.MathUtils.clamp(
      this.freeLook.pitch - event.movementY * rotateSpeed,
      -Math.PI / 2 + 0.01,
      Math.PI / 2 - 0.01,
    );
    this.#applyLookOrientation(this.freeLook.yaw, this.freeLook.pitch);
    this.fly.yaw = this.freeLook.yaw;
    this.fly.pitch = this.freeLook.pitch;
    event.preventDefault();
    event.stopPropagation();
  }

  #onPointerUp(event) {
    if (!this.freeLook.active || event.pointerId !== this.freeLook.pointerId) {
      return;
    }
    this.freeLook.active = false;
    this.freeLook.pointerId = null;
    this.controls.enabled = true;
    this.canvas.style.cursor = "";
    try {
      this.canvas.releasePointerCapture(event.pointerId);
    } catch {}
    this.controls.update();
    event.preventDefault();
    event.stopPropagation();
  }

  resetView() {
    this.camera.position.copy(DEFAULT_VIEW.position);
    this.controls.target.copy(DEFAULT_VIEW.target);
    this.camera.lookAt(this.controls.target);
    this.#cancelFreeLook();
    this.canvas.style.cursor = "";
    this.controls.enabled = true;
    this.controls.update();
  }

  setTx(position) {
    this.txMarker.position.set(position[0], position[1], position[2]);
  }

  setRx(position) {
    this.rxMarker.position.set(position[0], position[1], position[2]);
  }

  focusOnTiles(tileIds = [...this.loadedTileIds], {padding = 1.35, minDistance = 120} = {}) {
    const ids = new Set(tileIds);
    const box = new THREE.Box3();
    let hasGeometry = false;

    for (const entry of this.modelEntries.values()) {
      if (!ids.has(entry.bundle.tile)) {
        continue;
      }
      entry.object.updateWorldMatrix(true, false);
      box.expandByObject(entry.object);
      hasGeometry = true;
    }

    if (!hasGeometry || box.isEmpty()) {
      return false;
    }

    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const radius = Math.max(size.length() * 0.5, 1);
    const verticalFov = THREE.MathUtils.degToRad(this.camera.fov);
    const horizontalFov = 2 * Math.atan(Math.tan(verticalFov / 2) * this.camera.aspect);
    const fitHeight = size.y / (2 * Math.tan(verticalFov / 2));
    const fitWidth = size.x / (2 * Math.tan(horizontalFov / 2));
    const fitDepth = size.z * 1.1;
    const distance = Math.max(fitHeight, fitWidth, fitDepth, radius, minDistance) * padding;

    const direction = this.camera.position.clone().sub(this.controls.target);
    if (direction.lengthSq() < 1e-6) {
      direction.set(-1, -1.35, 0.9);
    }
    direction.normalize();

    this.controls.target.copy(center);
    this.camera.position.copy(center).addScaledVector(direction, distance);
    this.#syncClipPlanes();
    this.camera.lookAt(this.controls.target);
    this.#cancelFreeLook();
    this.canvas.style.cursor = "";
    this.controls.enabled = true;
    this.controls.update();
    return true;
  }

  #setRayFromClient(clientX, clientY) {
    const rect = this.canvas.getBoundingClientRect();
    this.mouse.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.mouse, this.camera);
  }

  pickOnSurface(clientX, clientY, markerOffset = 0) {
    this.#setRayFromClient(clientX, clientY);
    const hits = this.raycaster.intersectObjects(this.modelGroup.children, false);
    if (!hits.length) {
      return null;
    }

    const hit = hits[0];
    const logicalPosition = hit.point.clone();
    const markerPosition = hit.point.clone();

    if (markerOffset > 0 && hit.face?.normal) {
      const worldNormal = hit.face.normal.clone();
      const normalMatrix = new THREE.Matrix3().getNormalMatrix(hit.object.matrixWorld);
      worldNormal.applyNormalMatrix(normalMatrix).normalize();
      if (worldNormal.dot(this.raycaster.ray.direction) > 0) {
        worldNormal.negate();
      }
      markerPosition.addScaledVector(worldNormal, markerOffset);
    }

    return {
      logicalPosition: [logicalPosition.x, logicalPosition.y, logicalPosition.z],
      markerPosition: [markerPosition.x, markerPosition.y, markerPosition.z],
    };
  }

  async loadMeshes(meshes, onProgress = () => {}) {
    return this.syncBundles(meshes, ({completed, total}) => onProgress(completed, total));
  }

  async syncBundles(bundles, onProgress = () => {}) {
    const desiredBundleIds = new Set(bundles.map((bundle) => bundle.bundle_id));
    const toRemove = [];
    for (const bundleId of this.modelEntries.keys()) {
      if (!desiredBundleIds.has(bundleId)) {
        toRemove.push(bundleId);
      }
    }

    const toAdd = bundles.filter((bundle) => !this.modelEntries.has(bundle.bundle_id));
    const total = toRemove.length + toAdd.length;
    const progressByBundle = new Map();
    const activeBundleStates = new Map();
    const knownTotalBytes = toAdd.reduce((sum, bundle) => sum + (bundleSizeBytes(bundle) || 0), 0);
    const hasUnknownBytes = toAdd.some((bundle) => bundleSizeBytes(bundle) === null);
    let completed = 0;

    const report = (payload) => {
      const downloadedBytes = [...progressByBundle.values()].reduce((sum, bytes) => sum + bytes, 0);
      const activeBundles = [...activeBundleStates.values()].sort((left, right) => left.bundleIndex - right.bundleIndex);
      const activeSpeedBytesPerSec = activeBundles.reduce((sum, item) => {
        return sum + (item.phase === "downloading" && Number.isFinite(item.speedBytesPerSec) ? item.speedBytesPerSec : 0);
      }, 0);
      const phaseSummary = activeBundles
        .slice(0, BUNDLE_LOAD_CONCURRENCY)
        .map((item) => `${item.phase}:${item.bundleId}`)
        .join(",");
      onProgress({
        completed,
        total,
        added: toAdd.length,
        removed: toRemove.length,
        completedDownloads: Math.max(0, completed - toRemove.length),
        downloadedBytes,
        totalBytes: knownTotalBytes,
        hasUnknownBytes,
        speedBytesPerSec: activeSpeedBytesPerSec,
        activeBundles,
        phaseSummary,
        ...payload,
      });
    };

    const updateActiveBundle = (bundle, bundleIndex, event = {}) => {
      const previous = activeBundleStates.get(bundle.bundle_id) || {};
      const loadedBytes = Number.isFinite(event.loadedBytes)
        ? event.loadedBytes
        : previous.loadedBytes || 0;
      const sizeBytes = bundleSizeBytes(bundle);
      const totalBytes = Number.isFinite(event.totalBytes)
        ? event.totalBytes
        : sizeBytes;
      const nextState = {
        bundle,
        bundleId: bundle.bundle_id,
        tile: bundle.tile,
        category: bundle.category,
        bundleIndex,
        bundleTotal: toAdd.length,
        phase: event.phase || previous.phase || "waiting",
        loadedBytes,
        totalBytes,
        sizeBytes,
        speedBytesPerSec: Number.isFinite(event.speedBytesPerSec) ? event.speedBytesPerSec : 0,
        downloadMs: Number.isFinite(event.downloadMs) ? event.downloadMs : previous.downloadMs || 0,
        parseMs: Number.isFinite(event.parseMs) ? event.parseMs : previous.parseMs || 0,
        streamSupported: event.streamSupported ?? previous.streamSupported ?? true,
      };
      activeBundleStates.set(bundle.bundle_id, nextState);
      if (Number.isFinite(loadedBytes)) {
        progressByBundle.set(bundle.bundle_id, loadedBytes);
      }
      return nextState;
    };

    report({
      phase: total > 0 ? "start" : "idle",
      bundle: null,
    });

    for (let index = 0; index < toRemove.length; index += 1) {
      const bundleId = toRemove[index];
      const entry = this.modelEntries.get(bundleId);
      this.#removeBundle(bundleId);
      completed += 1;
      report({
        phase: "removing",
        bundle: entry?.bundle ?? null,
      });
      if ((index + 1) % 20 === 0) {
        await new Promise((resolve) => window.setTimeout(resolve, 0));
      }
    }

    let nextBundleIndex = 0;
    let firstLoadError = null;
    const loadNextBundle = async () => {
      while (nextBundleIndex < toAdd.length && firstLoadError === null) {
        const index = nextBundleIndex;
        nextBundleIndex += 1;
        const bundle = toAdd[index];
        progressByBundle.set(bundle.bundle_id, 0);

        let object;
        try {
          object = await this.#createBundleObject(bundle, (event) => {
            const activeBundle = updateActiveBundle(bundle, index + 1, event);
            report({
              phase: "loading",
              activeBundle,
            });
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          firstLoadError = new Error(`Failed to load ${bundle.bundle_id}: ${message}`);
          return;
        }

        const addingBundle = updateActiveBundle(bundle, index + 1, {phase: "adding"});
        report({phase: "loading", activeBundle: addingBundle});
        this.#storeBundle(bundle, object);
        completed += 1;
        progressByBundle.set(bundle.bundle_id, bundleSizeBytes(bundle) || progressByBundle.get(bundle.bundle_id) || 0);
        const readyBundle = updateActiveBundle(bundle, index + 1, {
          phase: "ready",
          loadedBytes: progressByBundle.get(bundle.bundle_id) || bundleSizeBytes(bundle) || 0,
          totalBytes: bundleSizeBytes(bundle),
        });
        report({phase: "loading", activeBundle: readyBundle, force: true});
        activeBundleStates.delete(bundle.bundle_id);
      }
    };

    const workerCount = Math.min(BUNDLE_LOAD_CONCURRENCY, toAdd.length);
    await Promise.all(Array.from({length: workerCount}, () => loadNextBundle()));
    if (firstLoadError) {
      throw firstLoadError;
    }

    return {
      added: toAdd.length,
      removed: toRemove.length,
      total,
    };
  }

  clearModels() {
    for (const bundleId of [...this.modelEntries.keys()]) {
      this.#removeBundle(bundleId);
    }
    this.meshMaterials = [];
    this.meshesLoaded = 0;
    this.loadedTileIds.clear();
    this.tileMeshCounts.clear();
    this.modelEntries.clear();
  }

  clearOverlay() {
    this.clearPaths();
    this.clearRadiomap();
    this.clearSurfacePreview();
  }

  clearPaths() {
    while (this.pathGroup.children.length) {
      const object = this.pathGroup.children.pop();
      object.geometry?.dispose();
      object.material?.dispose();
    }
    this.pathMaterials = [];
  }

  renderPaths(paths, selectedIndex = -1) {
    this.clearPaths();
    if (!paths.length) {
      return;
    }

    const powers = paths.map((path) => Number(path.path_gain_db));
    const {min, max} = normalize(powers);

    paths.forEach((path, index) => {
      const flat = [];
      for (const point of path.polyline) {
        flat.push(point[0], point[1], point[2]);
      }

      const geometry = new LineGeometry();
      geometry.setPositions(flat);
      const t = max > min ? (path.path_gain_db - min) / (max - min) : 1.0;
      const emphasized = selectedIndex < 0 || index === selectedIndex;
      const material = new LineMaterial({
        color: pathColor(t),
        linewidth: emphasized ? 3.2 : 1.6,
        transparent: true,
        opacity: emphasized ? 0.92 : 0.18,
        depthTest: true,
        depthWrite: false,
        toneMapped: false,
      });
      material.resolution.set(window.innerWidth, window.innerHeight);
      const line = new Line2(geometry, material);
      this.pathGroup.add(line);
      this.pathMaterials.push(material);
    });
  }

  previewSurface(surface) {
    this.clearSurfacePreview();
    const geometry = new THREE.PlaneGeometry(surface.size[0], surface.size[1]);
    const material = new THREE.MeshBasicMaterial({
      color: "#b8d7f8",
      opacity: 0.18,
      transparent: true,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(surface.center[0], surface.center[1], surface.center[2] + 0.04);
    this.overlayGroup.add(mesh);
    this.surfacePreview = mesh;
  }

  clearSurfacePreview() {
    if (!this.surfacePreview) {
      return;
    }
    this.overlayGroup.remove(this.surfacePreview);
    this.surfacePreview.geometry.dispose();
    this.surfacePreview.material.dispose();
    this.surfacePreview = null;
  }

  clearRadiomap() {
    if (!this.radiomapMesh) {
      return;
    }
    this.overlayGroup.remove(this.radiomapMesh);
    this.radiomapMesh.geometry.dispose();
    this.radiomapMesh.material.map?.dispose?.();
    this.radiomapMesh.material.dispose();
    this.radiomapMesh = null;
  }

  renderRadiomap(result, colorRange = {minDb: -140, maxDb: -80}) {
    this.clearRadiomap();
    this.clearSurfacePreview();

    const triangleCount = result.values.count;
    const trianglePositions = result.geometry.triangle_positions;
    const rawValues = result.values.data;
    const displayMin = Number(colorRange.minDb);
    const displayMax = Number(colorRange.maxDb);
    const displayRange = Math.max(displayMax - displayMin, 1e-6);
    const colors = new Float32Array(triangleCount * 9);

    for (let triangleIndex = 0; triangleIndex < triangleCount; triangleIndex += 1) {
      const value = rawValues[triangleIndex];
      const t = clamp01((value - displayMin) / displayRange);
      const color = heatmapColor(t);
      for (let vertexIndex = 0; vertexIndex < 3; vertexIndex += 1) {
        const base = triangleIndex * 9 + vertexIndex * 3;
        colors[base] = color.r;
        colors[base + 1] = color.g;
        colors[base + 2] = color.b;
      }
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(trianglePositions, 3));
    geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    geometry.computeBoundingSphere();
    const material = new THREE.MeshBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.92,
      side: THREE.DoubleSide,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
      toneMapped: false,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.renderOrder = 12;
    this.overlayGroup.add(mesh);
    this.radiomapMesh = mesh;
  }

  async #createBundleObject(bundle, onProgress = () => {}) {
    const geometry = await this.loader.loadAsync(
      `/api/scene/bundle/${encodeURIComponent(bundle.bundle_id)}`,
      {onProgress},
    );
    if (!geometry.getAttribute("normal")) {
      onProgress({phase: "parsing", loadedBytes: bundleSizeBytes(bundle), totalBytes: bundleSizeBytes(bundle)});
      geometry.computeVertexNormals();
    }

    const transparent = bundle.bsdf_id === "itu_wet_ground";
    const layer = displayLayerForBundle(bundle);

    const material = new THREE.MeshStandardMaterial({
      color: colorForMesh(bundle),
      roughness: 0.88,
      metalness: 0.0,
      side: THREE.DoubleSide,
      transparent,
      opacity: transparent ? 0.86 : 1.0,
      depthWrite: transparent ? layer.depthWrite : true,
      polygonOffset: layer.polygonOffsetFactor !== 0 || layer.polygonOffsetUnits !== 0,
      polygonOffsetFactor: layer.polygonOffsetFactor,
      polygonOffsetUnits: layer.polygonOffsetUnits,
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.renderOrder = layer.renderOrder;
    return mesh;
  }

  #storeBundle(bundle, object) {
    this.modelGroup.add(object);
    this.modelEntries.set(bundle.bundle_id, {bundle, object});
    this.meshMaterials.push(object.material);
    this.meshesLoaded += bundle.mesh_count;

    const nextCount = (this.tileMeshCounts.get(bundle.tile) || 0) + bundle.mesh_count;
    this.tileMeshCounts.set(bundle.tile, nextCount);
    this.loadedTileIds.add(bundle.tile);
  }

  #removeBundle(bundleId) {
    const entry = this.modelEntries.get(bundleId);
    if (!entry) {
      return;
    }

    this.modelGroup.remove(entry.object);
    entry.object.geometry?.dispose();
    entry.object.material?.dispose();
    this.modelEntries.delete(bundleId);
    this.meshMaterials = this.meshMaterials.filter((material) => material !== entry.object.material);
    this.meshesLoaded -= entry.bundle.mesh_count;

    const nextCount = (this.tileMeshCounts.get(entry.bundle.tile) || entry.bundle.mesh_count) - entry.bundle.mesh_count;
    if (nextCount <= 0) {
      this.tileMeshCounts.delete(entry.bundle.tile);
      this.loadedTileIds.delete(entry.bundle.tile);
    } else {
      this.tileMeshCounts.set(entry.bundle.tile, nextCount);
    }
  }
}
