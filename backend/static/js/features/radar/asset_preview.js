import * as THREE from "/lib/three.module.js";
import {OrbitControls} from "/lib/OrbitControls.js";
import {RADAR_MAX_TARGETS} from "/js/features/radar/controls.js?v=20260723-radar-empty-scene";
import {radarAssetDisplayName} from "/js/features/radar/presentation.js?v=20260722-radar-ui-consistency";

const PREVIEW_PIXEL_RATIO_CAP = 1.5;
const CAMERA_DIRECTION = new THREE.Vector3(1.45, -1.8, 0.95).normalize();

function availableAssets(values) {
  return (Array.isArray(values) ? values : []).filter((asset) => asset?.id && asset?.visual?.url);
}

export function createRadarAssetPreview({hosts, state, viewerRef, onStateChange = () => {}}) {
  const radar = state.radar;
  let assets = [];
  let selectedIndex = 0;
  let active = false;
  let groupOpen = true;
  let disposed = false;
  let scene = null;
  let camera = null;
  let webglRenderer = null;
  let orbitControls = null;
  let resizeObserver = null;
  let mountedCanvas = null;
  let animationFrame = 0;
  let previousFrameTime = 0;
  let loadGeneration = 0;
  let loadState = "loading";
  let statusMessage = "Loading drone models...";
  let currentRecord = null;

  function selectedAsset() {
    return assets[selectedIndex] || null;
  }

  function assetManager() {
    const manager = viewerRef.current?.assets;
    return manager?.instantiate && manager?.release ? manager : null;
  }

  function assetName(asset = selectedAsset()) {
    return asset ? radarAssetDisplayName(assets, asset.id) : "No drone models";
  }

  function publishPickerState() {
    const asset = selectedAsset();
    const atLimit = radar.targets.length >= RADAR_MAX_TARGETS;
    const canAdd = Boolean(asset) && loadState === "ready" && !atLimit;
    let hint = "";
    let addTargetDisabledReason = "";
    if (atLimit) {
      hint = `Maximum ${RADAR_MAX_TARGETS} targets reached.`;
      addTargetDisabledReason = `Radar supports at most ${RADAR_MAX_TARGETS} targets.`;
    } else if (loadState === "ready") {
      hint = "Drag to rotate · Model turns automatically";
    } else if (loadState === "error") {
      hint = "Choose another model or return to this model to retry.";
      addTargetDisabledReason = "The selected drone preview could not be loaded.";
    } else {
      hint = assets.length ? "Preparing the selected drone preview..." : "Add a compatible drone asset to continue.";
      addTargetDisabledReason = "Drone preview is not ready yet.";
    }

    radar.picker = {
      assetId: asset?.id || "",
      assetName: assetName(asset),
      countLabel: asset ? `${selectedIndex + 1} / ${assets.length}` : "0 / 0",
      status: loadState === "ready" ? "" : statusMessage,
      state: loadState === "ready" ? "ready" : loadState === "error" ? "error" : "loading",
      hint,
      hasMultipleAssets: assets.length > 1,
      canAddTarget: canAdd,
      addTargetDisabledReason,
    };
    onStateChange();
  }

  function setLoadState(nextState, message = "") {
    loadState = nextState;
    statusMessage = message;
    publishPickerState();
    syncAnimation();
  }

  function teardownRenderer() {
    resizeObserver?.disconnect();
    resizeObserver = null;
    orbitControls?.dispose();
    orbitControls = null;
    webglRenderer?.dispose();
    webglRenderer = null;
    mountedCanvas = null;
    scene = null;
    camera = null;
  }

  function ensureRenderer() {
    const canvas = hosts?.get("radarAssetPreviewCanvas");
    if (!canvas) return false;
    if (webglRenderer && mountedCanvas === canvas) return true;
    if (webglRenderer && mountedCanvas !== canvas) {
      releaseCurrent();
      teardownRenderer();
    }
    try {
      mountedCanvas = canvas;
      webglRenderer = new THREE.WebGLRenderer({
        canvas,
        alpha: true,
        antialias: true,
        powerPreference: "low-power",
      });
      webglRenderer.debug.checkShaderErrors = false;
      webglRenderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, PREVIEW_PIXEL_RATIO_CAP));
      webglRenderer.setClearColor(0x000000, 0);
      webglRenderer.outputColorSpace = THREE.SRGBColorSpace;
      webglRenderer.toneMapping = THREE.ACESFilmicToneMapping;
      webglRenderer.toneMappingExposure = 1.08;

      scene = new THREE.Scene();
      camera = new THREE.PerspectiveCamera(34, 1, 0.01, 100);
      camera.up.set(0, 0, 1);
      scene.add(new THREE.HemisphereLight(0xf5f8ff, 0x41516b, 2.35));
      const keyLight = new THREE.DirectionalLight(0xffffff, 3.1);
      keyLight.position.set(-3, -4, 6);
      scene.add(keyLight);
      const fillLight = new THREE.DirectionalLight(0x8db9ff, 1.35);
      fillLight.position.set(4, 2, 2);
      scene.add(fillLight);

      orbitControls = new OrbitControls(camera, canvas);
      orbitControls.enableDamping = true;
      orbitControls.dampingFactor = 0.065;
      orbitControls.enablePan = false;
      orbitControls.enableZoom = false;
      orbitControls.autoRotate = true;
      orbitControls.autoRotateSpeed = 1.15;
      orbitControls.minPolarAngle = Math.PI * 0.23;
      orbitControls.maxPolarAngle = Math.PI * 0.48;

      resizeObserver = new ResizeObserver(resize);
      resizeObserver.observe(canvas);
      resize();
      return true;
    } catch (error) {
      console.warn("Radar drone preview initialization failed", error);
      setLoadState("error", "3D preview is unavailable in this browser.");
      return false;
    }
  }

  function resize() {
    if (!webglRenderer || !camera || !mountedCanvas) return;
    const rect = mountedCanvas.getBoundingClientRect();
    const width = Math.max(1, Math.round(rect.width));
    const height = Math.max(1, Math.round(rect.height));
    webglRenderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderFrame();
  }

  function releaseCurrent() {
    if (!currentRecord) return;
    currentRecord.manager.release(currentRecord.instance);
    currentRecord = null;
  }

  function fitCamera(instance) {
    instance.updateWorldMatrix(true, true);
    const bounds = new THREE.Box3().setFromObject(instance);
    const center = bounds.getCenter(new THREE.Vector3());
    const size = bounds.getSize(new THREE.Vector3());
    instance.position.sub(center);
    instance.updateWorldMatrix(true, true);
    const radius = Math.max(size.length() * 0.5, 0.05);
    const distance = Math.max(radius / Math.sin(THREE.MathUtils.degToRad(camera.fov * 0.5)) * 1.12, radius * 2.8);
    camera.near = Math.max(distance / 100, 0.002);
    camera.far = Math.max(distance * 30, 20);
    camera.position.copy(CAMERA_DIRECTION).multiplyScalar(distance);
    camera.updateProjectionMatrix();
    orbitControls.target.set(0, 0, 0);
    orbitControls.minDistance = distance * 0.72;
    orbitControls.maxDistance = distance * 1.45;
    orbitControls.update(0);
  }

  function shouldAnimate() {
    return active
      && groupOpen
      && !document.hidden
      && loadState === "ready"
      && Boolean(currentRecord)
      && Boolean(webglRenderer)
      && Boolean(mountedCanvas && document.contains(mountedCanvas));
  }

  function renderFrame(timestamp = performance.now()) {
    if (!webglRenderer || !scene || !camera) return;
    const deltaSeconds = previousFrameTime ? Math.min((timestamp - previousFrameTime) / 1000, 0.1) : 0;
    previousFrameTime = timestamp;
    orbitControls?.update(deltaSeconds);
    webglRenderer.render(scene, camera);
  }

  function animate(timestamp) {
    animationFrame = 0;
    if (!shouldAnimate()) return;
    renderFrame(timestamp);
    animationFrame = requestAnimationFrame(animate);
  }

  function syncAnimation() {
    if (shouldAnimate()) {
      if (!animationFrame) {
        previousFrameTime = 0;
        animationFrame = requestAnimationFrame(animate);
      }
      return;
    }
    if (animationFrame) cancelAnimationFrame(animationFrame);
    animationFrame = 0;
    previousFrameTime = 0;
  }

  async function loadSelected() {
    const asset = selectedAsset();
    const manager = assetManager();
    const generation = ++loadGeneration;
    releaseCurrent();
    if (!asset) {
      setLoadState("empty", "No drone models available.");
      return;
    }
    if (!manager) {
      setLoadState("waiting", "3D preview is available after the scene loads.");
      return;
    }
    if (!manager.descriptor?.(asset.id)) {
      setLoadState("error", `Preview unavailable for ${assetName(asset)}.`);
      return;
    }
    if (!ensureRenderer()) {
      setLoadState("waiting", "Open Targets panel to preview drone.");
      return;
    }
    setLoadState("loading", `Loading ${assetName(asset)}...`);
    try {
      const instance = await manager.instantiate(asset.id);
      if (disposed || generation !== loadGeneration) {
        manager.release(instance);
        return;
      }
      scene.add(instance);
      currentRecord = {instance, manager};
      fitCamera(instance);
      setLoadState("ready");
      renderFrame();
    } catch (error) {
      if (disposed || generation !== loadGeneration) return;
      console.warn(`Radar drone preview failed for ${asset.id}`, error);
      setLoadState("error", `Preview unavailable for ${assetName(asset)}.`);
    }
  }

  function selectOffset(offset) {
    if (assets.length < 2) return;
    selectedIndex = (selectedIndex + offset + assets.length) % assets.length;
    publishPickerState();
    loadSelected();
  }

  function setAssets(values) {
    const previousId = selectedAsset()?.id;
    assets = availableAssets(values);
    const preservedIndex = assets.findIndex((asset) => asset.id === previousId);
    selectedIndex = preservedIndex >= 0 ? preservedIndex : 0;
    publishPickerState();
    loadSelected();
  }

  function handleVisibilityChange() {
    syncAnimation();
  }

  document.addEventListener("visibilitychange", handleVisibilityChange);
  setLoadState("loading", "Loading drone models...");

  return Object.freeze({
    activate() {
      active = true;
      if (assets.length && (loadState === "waiting" || !mountedCanvas)) loadSelected();
      syncAnimation();
    },
    deactivate() {
      active = false;
      syncAnimation();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      active = false;
      loadGeneration += 1;
      syncAnimation();
      releaseCurrent();
      teardownRenderer();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    },
    next() {
      selectOffset(1);
    },
    previous() {
      selectOffset(-1);
    },
    syncGroup(open) {
      groupOpen = Boolean(open);
      if (groupOpen && assets.length && (loadState === "waiting" || !mountedCanvas || !document.contains(mountedCanvas))) {
        loadSelected();
      }
      syncAnimation();
    },
    selectedAssetId: () => selectedAsset()?.id || null,
    setAssets,
    syncState: publishPickerState,
  });
}
