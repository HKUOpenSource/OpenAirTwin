import * as THREE from "/lib/three.module.js";
import {OrbitControls} from "/lib/OrbitControls.js";
import {RADAR_MAX_TARGETS} from "/js/features/radar/controls.js?v=20260723-radar-empty-scene";
import {radarAssetDisplayName} from "/js/features/radar/presentation.js?v=20260722-radar-ui-consistency";

const PREVIEW_PIXEL_RATIO_CAP = 1.5;
const CAMERA_DIRECTION = new THREE.Vector3(1.45, -1.8, 0.95).normalize();

function availableAssets(values) {
  return (Array.isArray(values) ? values : []).filter((asset) => asset?.id && asset?.visual?.url);
}

export function createRadarAssetPreview({dom, state, viewerRef}) {
  const radar = state.radar;
  let assets = [];
  let selectedIndex = 0;
  let active = false;
  let disposed = false;
  let scene = null;
  let camera = null;
  let webglRenderer = null;
  let orbitControls = null;
  let resizeObserver = null;
  let animationFrame = 0;
  let previousFrameTime = 0;
  let loadGeneration = 0;
  let loadState = "loading";
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

  function updateMeta() {
    const asset = selectedAsset();
    const name = assetName(asset);
    dom.radarAssetPreviewName.textContent = name;
    dom.radarAssetPreviewCount.textContent = asset ? `${selectedIndex + 1} / ${assets.length}` : "0 / 0";
    dom.radarAssetPreviewCanvas.setAttribute("aria-label", asset ? `Interactive 3D preview of ${name}` : "Drone model preview unavailable");
    const multiple = assets.length > 1;
    dom.btnRadarAssetPrevious.disabled = !multiple;
    dom.btnRadarAssetNext.disabled = !multiple;
  }

  function setLoadState(nextState, message = "") {
    loadState = nextState;
    dom.radarAssetPicker.dataset.state = nextState;
    dom.radarAssetPreviewStatus.textContent = message;
    dom.radarAssetPreviewStatus.classList.toggle("hidden", nextState === "ready");
    syncState();
  }

  function syncState() {
    if (disposed) return;
    const atLimit = radar.targets.length >= RADAR_MAX_TARGETS;
    const canAdd = Boolean(selectedAsset()) && loadState === "ready" && !atLimit;
    dom.btnAddRadarTarget.disabled = !canAdd;
    if (atLimit) {
      dom.radarAssetPickerHint.textContent = `Maximum ${RADAR_MAX_TARGETS} targets reached.`;
      dom.btnAddRadarTarget.title = `Radar supports at most ${RADAR_MAX_TARGETS} targets`;
    } else if (loadState === "ready") {
      dom.radarAssetPickerHint.textContent = "Drag to rotate · Model turns automatically";
      dom.btnAddRadarTarget.removeAttribute("title");
    } else if (loadState === "error") {
      dom.radarAssetPickerHint.textContent = "Choose another model or return to this model to retry.";
      dom.btnAddRadarTarget.title = "The selected drone preview could not be loaded";
    } else {
      dom.radarAssetPickerHint.textContent = assets.length ? "Preparing the selected drone preview…" : "Add a compatible drone asset to continue.";
      dom.btnAddRadarTarget.removeAttribute("title");
    }
    syncAnimation();
  }

  function ensureRenderer() {
    if (webglRenderer) return true;
    try {
      webglRenderer = new THREE.WebGLRenderer({
        canvas: dom.radarAssetPreviewCanvas,
        alpha: true,
        antialias: true,
        powerPreference: "low-power",
      });
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

      orbitControls = new OrbitControls(camera, dom.radarAssetPreviewCanvas);
      orbitControls.enableDamping = true;
      orbitControls.dampingFactor = 0.065;
      orbitControls.enablePan = false;
      orbitControls.enableZoom = false;
      orbitControls.autoRotate = true;
      orbitControls.autoRotateSpeed = 1.15;
      orbitControls.minPolarAngle = Math.PI * 0.23;
      orbitControls.maxPolarAngle = Math.PI * 0.48;

      resizeObserver = new ResizeObserver(resize);
      resizeObserver.observe(dom.radarAssetPreviewCanvas);
      resize();
      return true;
    } catch (error) {
      console.warn("Radar drone preview initialization failed", error);
      setLoadState("error", "3D preview is unavailable in this browser.");
      return false;
    }
  }

  function resize() {
    if (!webglRenderer || !camera) return;
    const rect = dom.radarAssetPreviewCanvas.getBoundingClientRect();
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
      && dom.radarTargetsGroup.open
      && !document.hidden
      && loadState === "ready"
      && Boolean(currentRecord)
      && Boolean(webglRenderer);
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
    if (!ensureRenderer()) return;
    setLoadState("loading", `Loading ${assetName(asset)}…`);
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
    updateMeta();
    loadSelected();
  }

  function setAssets(values) {
    const previousId = selectedAsset()?.id;
    assets = availableAssets(values);
    const preservedIndex = assets.findIndex((asset) => asset.id === previousId);
    selectedIndex = preservedIndex >= 0 ? preservedIndex : 0;
    updateMeta();
    loadSelected();
  }

  function handleVisibilityChange() {
    syncAnimation();
  }

  function handleGroupToggle() {
    if (dom.radarTargetsGroup.open && loadState === "waiting" && assetManager()) loadSelected();
    syncAnimation();
  }

  document.addEventListener("visibilitychange", handleVisibilityChange);
  updateMeta();
  setLoadState("loading", "Loading drone models…");

  return Object.freeze({
    activate() {
      active = true;
      if (assets.length && loadState === "waiting") loadSelected();
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
      resizeObserver?.disconnect();
      orbitControls?.dispose();
      webglRenderer?.dispose();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    },
    next() {
      selectOffset(1);
    },
    previous() {
      selectOffset(-1);
    },
    syncGroup(open) {
      dom.radarTargetsGroup.open = Boolean(open);
      handleGroupToggle();
    },
    selectedAssetId: () => selectedAsset()?.id || null,
    setAssets,
    syncState,
  });
}
