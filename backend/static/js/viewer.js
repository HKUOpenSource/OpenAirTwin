import * as THREE from "/lib/three.module.js";
import {OrbitControls} from "/lib/OrbitControls.js";
import {GLBGeometryLoader} from "/lib/GLBGeometryLoader.js";
import {Line2} from "/lib/Line2.js";
import {LineGeometry} from "/lib/LineGeometry.js";
import {LineMaterial} from "/lib/LineMaterial.js";
import {colorForColormap} from "/js/colormaps.js";

const DEFAULT_VIEW = {
  position: new THREE.Vector3(-120, -180, 150),
  target: new THREE.Vector3(72, 37, 10),
};

const CAMERA_NEAR_MIN = 0.3;
const CAMERA_NEAR_MAX = 20;
const CAMERA_FAR_MIN = 2500;
const CAMERA_FAR_SCENE_PADDING = 3.5;
const CAMERA_FAR_EXTRA_MARGIN = 500;
const VIEW_GROUND_Z = 0;
const VIEW_CAMERA_MIN_CLEARANCE_M = 2.0;
const VIEW_TARGET_MIN_Z = 0;
const BUNDLE_LOAD_CONCURRENCY = 2;
const DEFAULT_PERFORMANCE_MODE = "auto";
const PERFORMANCE_MODES = new Set(["auto", "quality", "fast"]);
const AUTO_INTERACTION_PIXEL_RATIO = 1.0;
const QUALITY_PIXEL_RATIO_CAP = 1.5;
const AUTO_RESTORE_DELAY_MS = 600;
const LARGE_BUNDLE_YIELD_VERTEX_THRESHOLD = 500000;
const LARGE_BUNDLE_YIELD_FACE_THRESHOLD = 150000;
const FPS_SAMPLE_WINDOW_MS = 1000;
const TX_ORBIT_SPEED_RAD_PER_SEC = THREE.MathUtils.degToRad(18);
const TX_ORBIT_MIN_RADIUS = 45;
const TX_ORBIT_DEFAULT_RADIUS = 130;
const TX_ORBIT_MIN_HEIGHT = 20;
const TX_ORBIT_DEFAULT_HEIGHT = 55;

const MATERIAL_FALLBACK_COLORS = {
  itu_concrete: "#5b5d61",
  itu_medium_dry_ground: "#d9cfbb",
  itu_wet_ground: "#87aec1",
  itu_wood: "#5c7a57",
};

const CATEGORY_MATERIAL_STYLES = {
  BUILDING: {
    color: "#d8d2c4",
    roughness: 0.86,
    metalness: 0.0,
    lightnessVariation: 0.045,
    saturationVariation: 0.012,
  },
  INFRASTRUCTURE: {
    color: "#50565c",
    roughness: 0.82,
    metalness: 0.0,
  },
  INFRASTRUCTURE_TB: {
    color: "#50565c",
    roughness: 0.82,
    metalness: 0.0,
  },
  GENERIC: {
    color: "#8c8981",
    roughness: 0.84,
    metalness: 0.0,
  },
  TERRAIN_TB: {
    color: "#8c8981",
    roughness: 0.92,
    metalness: 0.0,
  },
  VEGETATION_TB: {
    color: "#557b5c",
    roughness: 0.96,
    metalness: 0.0,
    lightnessVariation: 0.025,
    saturationVariation: 0.02,
  },
  WATERBODY: {
    color: "#245766",
    roughness: 0.56,
    metalness: 0.0,
    transparent: true,
    opacity: 0.84,
  },
};

const CATEGORY_DISPLAY_LAYERS = {
  TERRAIN_TB: {
    renderOrder: 0,
    polygonOffsetFactor: 8,
    polygonOffsetUnits: 8,
    depthWrite: false,
    depthTest: true,
  },
  WATERBODY: {
    renderOrder: 1,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
    depthWrite: false,
    depthTest: true,
  },
  GENERIC: {
    renderOrder: 2,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
    depthWrite: true,
    depthTest: true,
  },
  INFRASTRUCTURE: {
    renderOrder: 3,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
    depthWrite: true,
    depthTest: true,
  },
  INFRASTRUCTURE_TB: {
    renderOrder: 3,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
    depthWrite: true,
    depthTest: true,
  },
  VEGETATION_TB: {
    renderOrder: 4,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
    depthWrite: true,
    depthTest: true,
  },
  BUILDING: {
    renderOrder: 5,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
    depthWrite: true,
    depthTest: true,
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

function normalize(values) {
  const finite = values.filter(Number.isFinite);
  if (!finite.length) {
    return {min: 0, max: 1};
  }
  return {min: Math.min(...finite), max: Math.max(...finite)};
}

function hashString(text) {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function centeredByte(hash, shift) {
  return (((hash >>> shift) & 0xff) / 255) * 2 - 1;
}

function styleForBundle(bundle) {
  return CATEGORY_MATERIAL_STYLES[bundle.category] || {
    color: MATERIAL_FALLBACK_COLORS[bundle.bsdf_id] || "#7a8088",
    roughness: 0.86,
    metalness: 0.0,
  };
}

function colorForBundle(bundle) {
  const style = styleForBundle(bundle);
  const color = new THREE.Color(style.color);
  const lightnessVariation = Number(style.lightnessVariation) || 0;
  const saturationVariation = Number(style.saturationVariation) || 0;
  if (lightnessVariation > 0 || saturationVariation > 0) {
    const hsl = {};
    const hash = hashString(bundle.bundle_id || `${bundle.tile || ""}:${bundle.category || ""}:${bundle.bsdf_id || ""}`);
    color.getHSL(hsl);
    color.setHSL(
      hsl.h,
      clamp01(hsl.s + centeredByte(hash, 8) * saturationVariation),
      clamp01(hsl.l + centeredByte(hash, 16) * lightnessVariation),
    );
  }
  return color;
}

function displayLayerForBundle(bundle) {
  return CATEGORY_DISPLAY_LAYERS[bundle.category] || {
    renderOrder: 2,
    polygonOffsetFactor: 0,
    polygonOffsetUnits: 0,
    depthWrite: true,
    depthTest: true,
  };
}

function bundleSizeBytes(bundle) {
  return positiveSizeBytes(bundle.size_bytes);
}

function bundleCompressedSizeBytes(bundle) {
  const size = positiveSizeBytes(bundle.compressed_size_bytes);
  return bundle.compressed_cache_exists && size !== null ? size : null;
}

function bundleTransferSizeBytes(bundle) {
  return bundleCompressedSizeBytes(bundle) || bundleSizeBytes(bundle);
}

function positiveSizeBytes(value) {
  const size = Number(value);
  return Number.isFinite(size) && size > 0 ? size : null;
}

function bundleUrl(bundle) {
  const url = `/api/scene/bundle/${encodeURIComponent(bundle.bundle_id)}`;
  return bundle.cache_key ? `${url}?v=${encodeURIComponent(bundle.cache_key)}` : url;
}

export class Viewer {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: "high-performance",
    });
    this.performanceMode = DEFAULT_PERFORMANCE_MODE;
    this.lightweightMaterials = true;
    this.hiddenCategories = new Set();
    this.lastInteractionAt = 0;
    this.currentPixelRatio = this.#targetPixelRatio();
    this.renderer.setPixelRatio(this.currentPixelRatio);
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;

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
    this.controls.addEventListener("start", () => {
      this.stopTxOrbit();
      this.#markInteraction();
    });
    this.controls.addEventListener("change", () => this.#markInteraction());
    this.controls.addEventListener("end", () => this.#markInteraction());

    this.loader = new GLBGeometryLoader();
    this.modelGroup = new THREE.Group();
    this.pathGroup = new THREE.Group();
    this.overlayGroup = new THREE.Group();
    this.mobilityGroup = new THREE.Group();
    this.markerGroup = new THREE.Group();
    this.scene.add(this.modelGroup, this.pathGroup, this.overlayGroup, this.mobilityGroup, this.markerGroup);

    this.pathMaterials = [];
    this.meshMaterials = [];
    this.modelEntries = new Map();
    this.modelBounds = new THREE.Box3();
    this.modelBoundsDirty = true;
    this.deepMimoRoi = null;
    this.tileMeshCounts = new Map();
    this.tileBundleCounts = new Map();
    this.tileExpectedBundleCounts = new Map();
    this.meshesLoaded = 0;
    this.loadedTileIds = new Set();
    this.fpsSamples = [];
    this.performanceStats = {
      fps: 0,
      dpr: this.currentPixelRatio,
      renderCalls: 0,
      renderTriangles: 0,
      estimatedFaces: 0,
      estimatedVertices: 0,
      bundleCount: 0,
      visibleBundleCount: 0,
      loadedTileCount: 0,
      visibleTileCount: 0,
    };

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
    this.txOrbit = {
      active: false,
      center: new THREE.Vector3(),
      radius: TX_ORBIT_DEFAULT_RADIUS,
      height: TX_ORBIT_DEFAULT_HEIGHT,
      angle: 0,
      speed: TX_ORBIT_SPEED_RAD_PER_SEC,
    };
    this.lastFrameTime = performance.now();

    this.txMarkerRadius = 1.6;
    this.rxMarkerRadius = 1.2;
    this.txMarker = this.#createMarker("#1f6fff", this.txMarkerRadius);
    this.rxMarker = this.#createMarker("#ff8b3d", this.rxMarkerRadius);
    this.markerGroup.add(this.txMarker, this.rxMarker);

    const ambient = new THREE.AmbientLight(0xffffff, 0.28);
    const hemisphere = new THREE.HemisphereLight(0xe8eefb, 0x6f756f, 0.62);
    const keyLight = new THREE.DirectionalLight(0xfff1d6, 1.65);
    keyLight.position.set(-260, -150, 360);
    const fillLight = new THREE.DirectionalLight(0xb7c5df, 0.24);
    fillLight.position.set(230, 150, 160);
    const rimLight = new THREE.DirectionalLight(0xdbe5f7, 0.42);
    rimLight.position.set(180, 260, 240);
    this.scene.add(ambient, hemisphere, keyLight, fillLight, rimLight);

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

  #qualityPixelRatio() {
    return Math.min(window.devicePixelRatio || 1, QUALITY_PIXEL_RATIO_CAP);
  }

  #targetPixelRatio(now = performance.now()) {
    if (this.performanceMode === "fast") {
      return AUTO_INTERACTION_PIXEL_RATIO;
    }
    if (this.performanceMode === "quality") {
      return this.#qualityPixelRatio();
    }
    return now - this.lastInteractionAt < AUTO_RESTORE_DELAY_MS
      ? AUTO_INTERACTION_PIXEL_RATIO
      : this.#qualityPixelRatio();
  }

  #setRendererPixelRatio(pixelRatio, forceResize = false) {
    const nextRatio = Math.max(0.5, Number(pixelRatio) || 1);
    const ratioChanged = Math.abs(nextRatio - this.currentPixelRatio) > 0.01;
    if (ratioChanged) {
      this.currentPixelRatio = nextRatio;
      this.renderer.setPixelRatio(nextRatio);
    }
    if (forceResize || ratioChanged) {
      this.renderer.setSize(window.innerWidth, window.innerHeight, false);
      for (const material of this.pathMaterials || []) {
        material.resolution.set(window.innerWidth, window.innerHeight);
      }
    }
    if (this.performanceStats) {
      this.performanceStats.dpr = this.currentPixelRatio;
    }
  }

  #syncRendererPixelRatio(now = performance.now()) {
    this.#setRendererPixelRatio(this.#targetPixelRatio(now));
  }

  #markInteraction(now = performance.now()) {
    this.lastInteractionAt = now;
    this.#syncRendererPixelRatio(now);
  }

  #dispatchTxOrbitChange() {
    window.dispatchEvent(new CustomEvent("hku-tx-orbit-change", {
      detail: {active: this.txOrbit.active},
    }));
  }

  setPerformanceMode(mode) {
    if (!PERFORMANCE_MODES.has(mode)) {
      return;
    }
    this.performanceMode = mode;
    this.#syncRendererPixelRatio();
  }

  setLightweightMaterials(enabled) {
    const next = Boolean(enabled);
    if (this.lightweightMaterials === next) {
      return;
    }
    this.lightweightMaterials = next;
    for (const entry of this.modelEntries.values()) {
      this.#replaceBundleMaterial(entry);
    }
    this.meshMaterials = [...this.modelEntries.values()].map((entry) => entry.object.material);
  }

  setCategoryVisible(category, visible) {
    if (!category) {
      return;
    }
    if (visible) {
      this.hiddenCategories.delete(category);
    } else {
      this.hiddenCategories.add(category);
    }
    for (const entry of this.modelEntries.values()) {
      if (entry.bundle.category === category) {
        entry.object.visible = this.isCategoryVisible(category);
      }
    }
    this.#refreshPerformanceStats();
  }

  isCategoryVisible(category) {
    return !this.hiddenCategories.has(category);
  }

  getLoadedCategoryStats() {
    const byCategory = new Map();
    for (const entry of this.modelEntries.values()) {
      const category = entry.bundle.category || "UNKNOWN";
      const stats = byCategory.get(category) || {
        category,
        bundles: 0,
        visibleBundles: 0,
        tiles: new Set(),
        visibleTiles: new Set(),
        faces: 0,
        vertices: 0,
        visibleFaces: 0,
        visibleVertices: 0,
        visible: this.isCategoryVisible(category),
      };
      stats.bundles += 1;
      stats.tiles.add(entry.bundle.tile);
      stats.faces += entry.faceCount;
      stats.vertices += entry.vertexCount;
      stats.visible = this.isCategoryVisible(category);
      if (entry.object.visible) {
        stats.visibleBundles += 1;
        stats.visibleTiles.add(entry.bundle.tile);
        stats.visibleFaces += entry.faceCount;
        stats.visibleVertices += entry.vertexCount;
      }
      byCategory.set(category, stats);
    }

    return [...byCategory.values()].map((stats) => ({
      category: stats.category,
      bundles: stats.bundles,
      visibleBundles: stats.visibleBundles,
      tiles: stats.tiles.size,
      visibleTiles: stats.visibleTiles.size,
      faces: stats.faces,
      vertices: stats.vertices,
      visibleFaces: stats.visibleFaces,
      visibleVertices: stats.visibleVertices,
      visible: stats.visible,
    }));
  }

  getPerformanceStats() {
    this.#refreshPerformanceStats();
    return {...this.performanceStats};
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
    this.#setRendererPixelRatio(this.#targetPixelRatio(), true);
    for (const material of this.pathMaterials) {
      material.resolution.set(window.innerWidth, window.innerHeight);
    }
  }

  #animate(time = performance.now()) {
    requestAnimationFrame((nextTime) => this.#animate(nextTime));
    const deltaSeconds = Math.min((time - this.lastFrameTime) / 1000, 0.05);
    this.lastFrameTime = time;
    if (this.txOrbit.active) {
      this.#updateTxOrbit(deltaSeconds, time);
    } else if (this.#hasFlyMovement()) {
      this.#markInteraction(time);
      this.#updateFlyMotion(deltaSeconds);
    }
    if (!this.freeLook.active) {
      this.controls.update(deltaSeconds);
      this.#clampViewAboveGround();
    }
    this.#syncRendererPixelRatio(time);
    this.#syncClipPlanes();
    this.renderer.render(this.scene, this.camera);
    this.#updatePerformanceStats(time, deltaSeconds);
  }

  #updatePerformanceStats(time, deltaSeconds) {
    if (deltaSeconds > 0) {
      this.fpsSamples.push({time, fps: 1 / deltaSeconds});
      while (this.fpsSamples.length && time - this.fpsSamples[0].time > FPS_SAMPLE_WINDOW_MS) {
        this.fpsSamples.shift();
      }
      const fpsTotal = this.fpsSamples.reduce((sum, sample) => sum + sample.fps, 0);
      this.performanceStats.fps = this.fpsSamples.length ? fpsTotal / this.fpsSamples.length : 0;
    }

    const renderInfo = this.renderer.info.render;
    this.performanceStats.dpr = this.currentPixelRatio;
    this.performanceStats.renderCalls = renderInfo.calls || 0;
    this.performanceStats.renderTriangles = renderInfo.triangles || 0;
    this.#refreshPerformanceStats();
  }

  #refreshPerformanceStats() {
    let estimatedFaces = 0;
    let estimatedVertices = 0;
    let visibleBundleCount = 0;
    const visibleTiles = new Set();

    for (const entry of this.modelEntries.values()) {
      if (!entry.object.visible) {
        continue;
      }
      visibleBundleCount += 1;
      visibleTiles.add(entry.bundle.tile);
      estimatedFaces += entry.faceCount;
      estimatedVertices += entry.vertexCount;
    }

    this.performanceStats.estimatedFaces = estimatedFaces;
    this.performanceStats.estimatedVertices = estimatedVertices;
    this.performanceStats.bundleCount = this.modelEntries.size;
    this.performanceStats.visibleBundleCount = visibleBundleCount;
    this.performanceStats.loadedTileCount = this.loadedTileIds.size;
    this.performanceStats.visibleTileCount = visibleTiles.size;
  }

  #markModelBoundsDirty() {
    this.modelBoundsDirty = true;
  }

  #currentModelBounds() {
    if (this.modelBoundsDirty) {
      this.modelBounds.makeEmpty();
      for (const entry of this.modelEntries.values()) {
        entry.object.updateWorldMatrix(true, false);
        this.modelBounds.expandByObject(entry.object);
      }
      this.modelBoundsDirty = false;
    }
    return this.modelBounds.isEmpty() ? null : this.modelBounds;
  }

  #syncClipPlanes() {
    const orbitDistance = Math.max(this.camera.position.distanceTo(this.controls.target), 1);
    const targetNear = THREE.MathUtils.clamp(orbitDistance / 1000, CAMERA_NEAR_MIN, CAMERA_NEAR_MAX);
    const modelBounds = this.#currentModelBounds();
    let nextFar = CAMERA_FAR_MIN;
    if (modelBounds) {
      const boundsSphere = modelBounds.getBoundingSphere(new THREE.Sphere());
      nextFar = Math.max(
        CAMERA_FAR_MIN,
        this.camera.position.distanceTo(boundsSphere.center)
          + boundsSphere.radius * CAMERA_FAR_SCENE_PADDING
          + CAMERA_FAR_EXTRA_MARGIN,
      );
    }
    const nextNear = Math.min(targetNear, Math.max(CAMERA_NEAR_MIN, nextFar / 100));

    if (Math.abs(this.camera.near - nextNear) < 1e-6 && Math.abs(this.camera.far - nextFar) < 1e-3) {
      return;
    }

    this.camera.near = nextNear;
    this.camera.far = nextFar;
    this.controls.maxDistance = nextFar * 0.5;
    this.camera.updateProjectionMatrix();
  }

  #clampViewAboveGround({preserveOffset = false} = {}) {
    const minCameraZ = VIEW_GROUND_Z + VIEW_CAMERA_MIN_CLEARANCE_M;
    if (preserveOffset) {
      const lift = Math.max(
        VIEW_TARGET_MIN_Z - this.controls.target.z,
        minCameraZ - this.camera.position.z,
        0,
      );
      if (lift <= 0) {
        return false;
      }
      this.controls.target.z += lift;
      this.camera.position.z += lift;
      return true;
    }

    let changed = false;
    if (this.controls.target.z < VIEW_TARGET_MIN_Z) {
      this.controls.target.z = VIEW_TARGET_MIN_Z;
      changed = true;
    }
    if (this.camera.position.z < minCameraZ) {
      this.camera.position.z = minCameraZ;
      changed = true;
    }
    if (changed) {
      this.camera.lookAt(this.controls.target);
    }
    return changed;
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
    this.#clampViewAboveGround();
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
    const right = new THREE.Vector3().crossVectors(forward, this.camera.up);
    if (right.lengthSq() < 1e-10) {
      right.set(forward.y, -forward.x, 0);
      if (right.lengthSq() < 1e-10) {
        right.set(1, 0, 0);
      }
    }
    right.normalize();
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
    this.#clampViewAboveGround({preserveOffset: true});
    this.camera.lookAt(this.controls.target);
  }

  #updateTxOrbit(deltaSeconds, time) {
    if (!this.txOrbit.active || deltaSeconds <= 0) {
      return;
    }
    this.txOrbit.angle += this.txOrbit.speed * deltaSeconds;
    const center = this.txOrbit.center;
    this.controls.target.copy(center);
    this.camera.position.set(
      center.x + Math.cos(this.txOrbit.angle) * this.txOrbit.radius,
      center.y + Math.sin(this.txOrbit.angle) * this.txOrbit.radius,
      center.z + this.txOrbit.height,
    );
    this.#clampViewAboveGround();
    this.camera.lookAt(this.controls.target);
    this.#markInteraction(time);
  }

  #onKeyDown(event) {
    if (this.#isFormTarget(event.target)) {
      return;
    }
    const handled = this.#setFlyMovementKey(event.code, true);
    if (handled) {
      this.stopTxOrbit();
      this.#markInteraction();
      event.preventDefault();
    }
  }

  #onKeyUp(event) {
    const handled = this.#setFlyMovementKey(event.code, false);
    if (!handled || this.#isFormTarget(event.target)) {
      return;
    }
    this.#markInteraction();
    event.preventDefault();
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
    this.stopTxOrbit();
    this.freeLook.active = true;
    this.freeLook.pointerId = event.pointerId;
    this.controls.enabled = false;
    this.canvas.style.cursor = "grabbing";
    this.#syncLookAngles(this.freeLook);
    this.#syncLookAngles(this.fly);
    this.#markInteraction();
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
    this.#markInteraction();
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
    this.#markInteraction();
    try {
      this.canvas.releasePointerCapture(event.pointerId);
    } catch {}
    this.controls.update();
    event.preventDefault();
    event.stopPropagation();
  }

  resetView() {
    this.stopTxOrbit();
    this.camera.position.copy(DEFAULT_VIEW.position);
    this.controls.target.copy(DEFAULT_VIEW.target);
    this.#clampViewAboveGround();
    this.camera.lookAt(this.controls.target);
    this.#cancelFreeLook();
    this.canvas.style.cursor = "";
    this.controls.enabled = true;
    this.controls.update();
    this.#clampViewAboveGround();
  }

  setTx(position) {
    if (!Array.isArray(position)) {
      this.stopTxOrbit();
      this.txMarker.visible = false;
      return;
    }
    this.txMarker.visible = true;
    this.txMarker.position.set(position[0], position[1], position[2]);
    if (this.txOrbit.active) {
      this.startTxOrbit(position);
    }
  }

  setRx(position) {
    if (!Array.isArray(position)) {
      this.rxMarker.visible = false;
      return;
    }
    this.rxMarker.visible = true;
    this.rxMarker.position.set(position[0], position[1], position[2]);
  }

  startTxOrbit(center) {
    const nextCenter = new THREE.Vector3(center?.[0], center?.[1], center?.[2]);
    if (![nextCenter.x, nextCenter.y, nextCenter.z].every(Number.isFinite)) {
      return false;
    }

    const wasActive = this.txOrbit.active;
    this.#cancelFreeLook();
    this.#clearFlyMovement();
    this.txOrbit.active = true;
    this.txOrbit.center.copy(nextCenter);

    const offset = this.camera.position.clone().sub(nextCenter);
    const horizontalRadius = Math.hypot(offset.x, offset.y);
    this.txOrbit.radius = horizontalRadius >= TX_ORBIT_MIN_RADIUS
      ? horizontalRadius
      : TX_ORBIT_DEFAULT_RADIUS;
    this.txOrbit.height = Math.abs(offset.z) >= TX_ORBIT_MIN_HEIGHT
      ? offset.z
      : TX_ORBIT_DEFAULT_HEIGHT;
    this.txOrbit.angle = horizontalRadius >= 1e-6 ? Math.atan2(offset.y, offset.x) : -Math.PI / 4;

    this.controls.enabled = true;
    this.controls.target.copy(nextCenter);
    this.#clampViewAboveGround();
    this.camera.lookAt(this.controls.target);
    this.controls.update();
    this.#clampViewAboveGround();
    this.#markInteraction();
    if (!wasActive) {
      this.#dispatchTxOrbitChange();
    }
    return true;
  }

  stopTxOrbit() {
    if (!this.txOrbit.active) {
      return false;
    }
    this.txOrbit.active = false;
    this.controls.enabled = true;
    this.controls.update();
    this.#dispatchTxOrbitChange();
    return true;
  }

  isTxOrbiting() {
    return this.txOrbit.active;
  }

  focusOnTiles(tileIds = [...this.loadedTileIds], {padding = 1.35, minDistance = 120} = {}) {
    this.stopTxOrbit();
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
    this.#clampViewAboveGround();
    this.#syncClipPlanes();
    this.camera.lookAt(this.controls.target);
    this.#cancelFreeLook();
    this.canvas.style.cursor = "";
    this.controls.enabled = true;
    this.controls.update();
    this.#clampViewAboveGround();
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
    const hits = this.raycaster.intersectObjects(this.modelGroup.children.filter((object) => object.visible), false);
    if (!hits.length) {
      return null;
    }

    const hit = hits[0];
    const logicalPosition = hit.point.clone();
    const markerPosition = hit.point.clone();
    let surfaceNormal = null;

    if (markerOffset > 0 && hit.face?.normal) {
      surfaceNormal = hit.face.normal.clone();
      const normalMatrix = new THREE.Matrix3().getNormalMatrix(hit.object.matrixWorld);
      surfaceNormal.applyNormalMatrix(normalMatrix).normalize();
      if (surfaceNormal.dot(this.raycaster.ray.direction) > 0) {
        surfaceNormal.negate();
      }
      markerPosition.addScaledVector(surfaceNormal, markerOffset);
    } else if (hit.face?.normal) {
      surfaceNormal = hit.face.normal.clone();
      const normalMatrix = new THREE.Matrix3().getNormalMatrix(hit.object.matrixWorld);
      surfaceNormal.applyNormalMatrix(normalMatrix).normalize();
      if (surfaceNormal.dot(this.raycaster.ray.direction) > 0) {
        surfaceNormal.negate();
      }
    }

    return {
      surfacePosition: [hit.point.x, hit.point.y, hit.point.z],
      surfaceNormal: surfaceNormal ? [surfaceNormal.x, surfaceNormal.y, surfaceNormal.z] : null,
      logicalPosition: [logicalPosition.x, logicalPosition.y, logicalPosition.z],
      markerPosition: [markerPosition.x, markerPosition.y, markerPosition.z],
    };
  }

  async loadMeshes(meshes, onProgress = () => {}) {
    return this.syncBundles(meshes, ({completed, total}) => onProgress(completed, total));
  }

  async syncBundles(bundles, onProgress = () => {}) {
    const desiredBundleIds = new Set(bundles.map((bundle) => bundle.bundle_id));
    this.tileExpectedBundleCounts = this.#bundleCountsByTile(bundles);
    this.#refreshLoadedTileIds();
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
    const bundleTransferSizeById = new Map();
    const bundleOriginalSizeById = new Map();
    const bundleCompressedSizeById = new Map();
    const unresolvedBundleIds = new Set();
    let completed = 0;

    for (const bundle of toAdd) {
      const transferSize = bundleTransferSizeBytes(bundle);
      const originalSize = bundleSizeBytes(bundle);
      const compressedSize = bundleCompressedSizeBytes(bundle);
      if (transferSize !== null) {
        bundleTransferSizeById.set(bundle.bundle_id, transferSize);
      } else {
        unresolvedBundleIds.add(bundle.bundle_id);
      }
      if (originalSize !== null) {
        bundleOriginalSizeById.set(bundle.bundle_id, originalSize);
      }
      if (compressedSize !== null) {
        bundleCompressedSizeById.set(bundle.bundle_id, compressedSize);
      }
    }

    const updateBundleSizeHints = (bundle, event = {}, fallbackLoadedBytes = null) => {
      const transferSize = positiveSizeBytes(event.totalBytes) || positiveSizeBytes(fallbackLoadedBytes);
      const originalSize = positiveSizeBytes(event.originalSizeBytes);
      const compressedSize = positiveSizeBytes(event.compressedSizeBytes);

      if (transferSize !== null) {
        bundleTransferSizeById.set(bundle.bundle_id, transferSize);
        unresolvedBundleIds.delete(bundle.bundle_id);
      }
      if (originalSize !== null) {
        bundleOriginalSizeById.set(bundle.bundle_id, originalSize);
      } else if (transferSize !== null && event.compressed === false) {
        bundleOriginalSizeById.set(bundle.bundle_id, transferSize);
      }
      if (compressedSize !== null) {
        bundleCompressedSizeById.set(bundle.bundle_id, compressedSize);
      }
    };

    const totalTransferBytes = () => {
      return [...bundleTransferSizeById.values()].reduce((sum, bytes) => sum + bytes, 0);
    };

    const totalOriginalBytes = () => {
      return toAdd.reduce((sum, bundle) => {
        return sum + (bundleOriginalSizeById.get(bundle.bundle_id) || bundleTransferSizeById.get(bundle.bundle_id) || 0);
      }, 0);
    };

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
        totalBytes: totalTransferBytes(),
        originalTotalBytes: totalOriginalBytes(),
        hasUnknownBytes: unresolvedBundleIds.size > 0,
        hasCompressedBundles: bundleCompressedSizeById.size > 0,
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
      updateBundleSizeHints(bundle, event);
      const sizeBytes = bundleTransferSizeById.get(bundle.bundle_id) || null;
      const originalSizeBytes = bundleOriginalSizeById.get(bundle.bundle_id) || null;
      const compressedSizeBytes = bundleCompressedSizeById.get(bundle.bundle_id) || null;
      const totalBytes = positiveSizeBytes(event.totalBytes) || sizeBytes;
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
        originalSizeBytes,
        compressedSizeBytes,
        compressed: event.compressed ?? (compressedSizeBytes !== null),
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
        const entry = this.#storeBundle(bundle, object);
        completed += 1;
        const completedBytes = progressByBundle.get(bundle.bundle_id) || bundleTransferSizeById.get(bundle.bundle_id) || 0;
        updateBundleSizeHints(bundle, {}, completedBytes);
        progressByBundle.set(bundle.bundle_id, bundleTransferSizeById.get(bundle.bundle_id) || completedBytes);
        const readyBundle = updateActiveBundle(bundle, index + 1, {
          phase: "ready",
          loadedBytes: progressByBundle.get(bundle.bundle_id) || 0,
          totalBytes: bundleTransferSizeById.get(bundle.bundle_id),
        });
        report({phase: "loading", activeBundle: readyBundle, force: true});
        activeBundleStates.delete(bundle.bundle_id);
        if (this.#shouldYieldAfterBundleAdd(entry)) {
          await new Promise((resolve) => requestAnimationFrame(() => resolve()));
        }
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
    this.tileBundleCounts.clear();
    this.tileExpectedBundleCounts.clear();
    this.modelEntries.clear();
    this.#refreshPerformanceStats();
  }

  clearOverlay() {
    this.clearPaths();
    this.clearRadiomap();
    this.clearSurfacePreview();
    this.clearMobility();
    this.clearDeepMimoRoi();
  }

  clearPaths() {
    while (this.pathGroup.children.length) {
      const object = this.pathGroup.children.pop();
      object.geometry?.dispose();
      object.material?.dispose();
    }
    this.pathMaterials = [];
  }

  clearMobility() {
    while (this.mobilityGroup.children.length) {
      const object = this.mobilityGroup.children.pop();
      object.geometry?.dispose();
      object.material?.dispose();
    }
  }

  renderMobilityTrajectory(points = [], samples = [], selectedIndex = -1) {
    this.clearMobility();
    if (!Array.isArray(points) || points.length < 1) {
      return;
    }

    if (points.length >= 2) {
      const flat = [];
      for (const point of points) {
        flat.push(point[0], point[1], point[2]);
      }
      const geometry = new LineGeometry();
      geometry.setPositions(flat);
      const material = new LineMaterial({
        color: new THREE.Color("#1f6fff"),
        linewidth: 2.6,
        transparent: true,
        opacity: 0.78,
        depthTest: true,
        depthWrite: false,
        toneMapped: false,
      });
      material.resolution.set(window.innerWidth, window.innerHeight);
      this.mobilityGroup.add(new Line2(geometry, material));
    }

    const samplePoints = Array.isArray(samples) && samples.length
      ? samples.map((sample) => sample.rx_position)
      : points;
    samplePoints.forEach((point, index) => {
      const isSelected = index === selectedIndex;
      const markerMaterial = new THREE.MeshBasicMaterial({
        color: isSelected ? "#1eb980" : "#70a7ff",
        transparent: true,
        opacity: isSelected ? 0.95 : 0.7,
        depthWrite: false,
      });
      const marker = new THREE.Mesh(new THREE.SphereGeometry(0.7, 12, 12), markerMaterial);
      marker.position.set(point[0], point[1], point[2]);
      marker.scale.setScalar(isSelected ? 1.35 : 1.0);
      this.mobilityGroup.add(marker);
    });
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

  clearDeepMimoRoi() {
    if (!this.deepMimoRoi) {
      return;
    }
    this.overlayGroup.remove(this.deepMimoRoi);
    for (const object of this.deepMimoRoi.children) {
      object.geometry?.dispose();
      object.material?.dispose();
    }
    this.deepMimoRoi = null;
  }

  renderDeepMimoRoi(bounds, visualZ = 0) {
    this.clearDeepMimoRoi();
    if (!bounds || !Array.isArray(bounds.min) || !Array.isArray(bounds.max)) {
      return;
    }
    const [minX, minY] = bounds.min;
    const [maxX, maxY] = bounds.max;
    const z = Number(visualZ || 0) + 0.18;
    const group = new THREE.Group();

    const fillGeometry = new THREE.PlaneGeometry(Math.max(maxX - minX, 0.01), Math.max(maxY - minY, 0.01));
    const fillMaterial = new THREE.MeshBasicMaterial({
      color: "#35c2a1",
      transparent: true,
      opacity: 0.18,
      side: THREE.DoubleSide,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    });
    const fill = new THREE.Mesh(fillGeometry, fillMaterial);
    fill.position.set((minX + maxX) * 0.5, (minY + maxY) * 0.5, z);
    group.add(fill);

    const lineGeometry = new LineGeometry();
    lineGeometry.setPositions([
      minX, minY, z + 0.08,
      maxX, minY, z + 0.08,
      maxX, maxY, z + 0.08,
      minX, maxY, z + 0.08,
      minX, minY, z + 0.08,
    ]);
    const lineMaterial = new LineMaterial({
      color: new THREE.Color("#14a886"),
      linewidth: 2.4,
      transparent: true,
      opacity: 0.96,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    });
    lineMaterial.resolution.set(window.innerWidth, window.innerHeight);
    group.add(new Line2(lineGeometry, lineMaterial));
    group.renderOrder = 16;
    this.overlayGroup.add(group);
    this.deepMimoRoi = group;
  }

  renderRadiomap(result, colorRange = {minDb: -140, maxDb: -80, colormap: "jet"}) {
    this.clearRadiomap();
    this.clearSurfacePreview();

    const triangleCount = result.values.count;
    const trianglePositions = result.geometry.triangle_positions;
    const rawValues = result.values.data;
    const displayMin = Number(colorRange.minDb);
    const displayMax = Number(colorRange.maxDb);
    const displayRange = Math.max(displayMax - displayMin, 1e-6);
    const colormap = colorRange.colormap || "jet";
    const colors = new Float32Array(triangleCount * 9);
    const invalidColor = {r: 112, g: 118, b: 128};

    for (let triangleIndex = 0; triangleIndex < triangleCount; triangleIndex += 1) {
      const rawValue = rawValues[triangleIndex];
      const value = Number(rawValue);
      const color = rawValue !== null && Number.isFinite(value)
        ? colorForColormap(colormap, clamp01((value - displayMin) / displayRange))
        : invalidColor;
      for (let vertexIndex = 0; vertexIndex < 3; vertexIndex += 1) {
        const base = triangleIndex * 9 + vertexIndex * 3;
        colors[base] = color.r / 255;
        colors[base + 1] = color.g / 255;
        colors[base + 2] = color.b / 255;
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
      bundleUrl(bundle),
      {onProgress},
    );
    if (!geometry.getAttribute("normal")) {
      onProgress({phase: "parsing", loadedBytes: bundleSizeBytes(bundle), totalBytes: bundleSizeBytes(bundle)});
      geometry.computeVertexNormals();
    }

    const layer = displayLayerForBundle(bundle);
    const material = this.#createBundleMaterial(bundle);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.renderOrder = layer.renderOrder;
    return mesh;
  }

  #createBundleMaterial(bundle) {
    const style = styleForBundle(bundle);
    const transparent = Boolean(style.transparent) || bundle.bsdf_id === "itu_wet_ground";
    const layer = displayLayerForBundle(bundle);
    const base = {
      color: colorForBundle(bundle),
      side: THREE.DoubleSide,
      transparent,
      opacity: transparent ? (style.opacity ?? 0.86) : 1.0,
      depthWrite: layer.depthWrite,
      depthTest: layer.depthTest ?? true,
      polygonOffset: layer.polygonOffsetFactor !== 0 || layer.polygonOffsetUnits !== 0,
      polygonOffsetFactor: layer.polygonOffsetFactor,
      polygonOffsetUnits: layer.polygonOffsetUnits,
    };

    if (this.lightweightMaterials) {
      return new THREE.MeshLambertMaterial(base);
    }

    return new THREE.MeshStandardMaterial({
      ...base,
      roughness: style.roughness ?? 0.88,
      metalness: style.metalness ?? 0.0,
    });
  }

  #replaceBundleMaterial(entry) {
    const previous = entry.object.material;
    entry.object.material = this.#createBundleMaterial(entry.bundle);
    previous?.dispose?.();
  }

  #geometryVertexCount(geometry) {
    const position = geometry?.getAttribute?.("position");
    return Number.isFinite(position?.count) ? position.count : 0;
  }

  #geometryFaceCount(geometry) {
    const indexCount = geometry?.index?.count;
    if (Number.isFinite(indexCount) && indexCount > 0) {
      return Math.floor(indexCount / 3);
    }
    return Math.floor(this.#geometryVertexCount(geometry) / 3);
  }

  #shouldYieldAfterBundleAdd(entry) {
    return entry.vertexCount >= LARGE_BUNDLE_YIELD_VERTEX_THRESHOLD
      || entry.faceCount >= LARGE_BUNDLE_YIELD_FACE_THRESHOLD;
  }

  #bundleCountsByTile(bundles) {
    const counts = new Map();
    for (const bundle of bundles) {
      counts.set(bundle.tile, (counts.get(bundle.tile) || 0) + 1);
    }
    return counts;
  }

  #refreshLoadedTileIds() {
    this.loadedTileIds.clear();
    for (const [tileId, expectedCount] of this.tileExpectedBundleCounts.entries()) {
      const loadedCount = this.tileBundleCounts.get(tileId) || 0;
      if (expectedCount > 0 && loadedCount === expectedCount) {
        this.loadedTileIds.add(tileId);
      }
    }
  }

  #storeBundle(bundle, object) {
    object.visible = this.isCategoryVisible(bundle.category);
    this.modelGroup.add(object);
    const entry = {
      bundle,
      object,
      vertexCount: this.#geometryVertexCount(object.geometry),
      faceCount: this.#geometryFaceCount(object.geometry),
    };
    this.modelEntries.set(bundle.bundle_id, entry);
    this.#markModelBoundsDirty();
    this.meshMaterials.push(object.material);
    this.meshesLoaded += bundle.mesh_count;

    const nextCount = (this.tileMeshCounts.get(bundle.tile) || 0) + bundle.mesh_count;
    this.tileMeshCounts.set(bundle.tile, nextCount);
    const nextBundleCount = (this.tileBundleCounts.get(bundle.tile) || 0) + 1;
    this.tileBundleCounts.set(bundle.tile, nextBundleCount);
    this.#refreshLoadedTileIds();
    this.#refreshPerformanceStats();
    return entry;
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
    this.#markModelBoundsDirty();
    this.meshMaterials = this.meshMaterials.filter((material) => material !== entry.object.material);
    this.meshesLoaded -= entry.bundle.mesh_count;

    const nextCount = (this.tileMeshCounts.get(entry.bundle.tile) || entry.bundle.mesh_count) - entry.bundle.mesh_count;
    if (nextCount <= 0) {
      this.tileMeshCounts.delete(entry.bundle.tile);
    } else {
      this.tileMeshCounts.set(entry.bundle.tile, nextCount);
    }
    const nextBundleCount = (this.tileBundleCounts.get(entry.bundle.tile) || 1) - 1;
    if (nextBundleCount <= 0) {
      this.tileBundleCounts.delete(entry.bundle.tile);
    } else {
      this.tileBundleCounts.set(entry.bundle.tile, nextBundleCount);
    }
    this.#refreshLoadedTileIds();
    this.#refreshPerformanceStats();
  }
}
