import * as THREE from "/lib/three.module.js";
import {RADAR_CLUTTER_COLOR, radarTargetColor} from "/js/features/radar/colors.js?v=20260722-radar-color-contract";
import {radarTargetDisplayName} from "/js/features/radar/presentation.js?v=20260722-radar-ui-consistency";
import {radarProcessingView} from "/js/features/radar/processing_views.js?v=20260723-radar-processing-views";
import {RadarTargetScene} from "/js/features/radar/target_scene.js?v=20260721-rs08";

const PATH_COLORS = Object.freeze({clutter: RADAR_CLUTTER_COLOR, direct: "#3e82d8"});
const DIRECTION_ARROW_LENGTH_M = 8;
const DIRECTION_ARROW_HEAD_LENGTH_M = 1.8;
const DIRECTION_ARROW_HEAD_WIDTH_M = 0.8;
const TARGET_LABEL_OFFSET_PX = 12;
const TARGET_LABEL_MAX_WIDTH_PX = 168;
const TARGET_LABEL_MAX_HEIGHT_PX = 42;
const TARGET_LABEL_SAFE_GAP_PX = 8;
const TARGET_LABEL_VIEWPORT_MARGIN_PX = 4;
const TARGET_LABEL_REFERENCE_DEPTH_M = 90;
const TARGET_LABEL_MIN_SCALE = 0.60;
const TARGET_LABEL_MAX_SCALE = 1.00;

function targetSpeed(target) {
  return Math.hypot(...target.velocity.map(Number));
}

function targetInfoText(target) {
  return `${targetSpeed(target).toFixed(1)} m/s · RCS ${Number(target.rcs_m2).toFixed(3)} m²`;
}

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function targetLabelScale(depthM) {
  return clamp(TARGET_LABEL_REFERENCE_DEPTH_M / Math.max(1, depthM), TARGET_LABEL_MIN_SCALE, TARGET_LABEL_MAX_SCALE);
}

function horizontalRangesOverlap(left, right) {
  return left.left < right.right + TARGET_LABEL_SAFE_GAP_PX
    && left.right + TARGET_LABEL_SAFE_GAP_PX > right.left;
}

function closestAvailableTop({left, width, height, desiredTop, minimumTop, maximumBottom, placed}) {
  const blocking = placed
    .filter((item) => horizontalRangesOverlap({left, right: left + width}, item))
    .sort((first, second) => first.top - second.top || first.left - second.left);
  const slots = [];
  let cursor = minimumTop;
  for (const item of blocking) {
    if (item.top - TARGET_LABEL_SAFE_GAP_PX - cursor >= height) {
      slots.push([cursor, item.top - TARGET_LABEL_SAFE_GAP_PX - height]);
    }
    cursor = Math.max(cursor, item.bottom + TARGET_LABEL_SAFE_GAP_PX);
  }
  if (maximumBottom - cursor >= height) slots.push([cursor, maximumBottom - height]);
  if (!slots.length) return null;
  return slots
    .map(([minimum, maximum]) => clamp(desiredTop, minimum, maximum))
    .sort((first, second) => Math.abs(first - desiredTop) - Math.abs(second - desiredTop) || first - second)[0];
}

function placeTargetLabels(candidates, rect) {
  const placed = [];
  const minimumTop = rect.top + TARGET_LABEL_VIEWPORT_MARGIN_PX;
  const maximumBottom = rect.bottom - TARGET_LABEL_VIEWPORT_MARGIN_PX;
  const laneStride = TARGET_LABEL_MAX_WIDTH_PX + TARGET_LABEL_SAFE_GAP_PX;
  for (const candidate of candidates) {
    const width = TARGET_LABEL_MAX_WIDTH_PX * candidate.scale;
    const height = TARGET_LABEL_MAX_HEIGHT_PX * candidate.scale;
    const desiredTop = candidate.anchorY - height / 2;
    let placement = null;
    for (let lane = 0; lane < candidates.length && !placement; lane += 1) {
      const left = candidate.anchorX + TARGET_LABEL_OFFSET_PX + lane * laneStride;
      const top = closestAvailableTop({left, width, height, desiredTop, minimumTop, maximumBottom, placed});
      if (top !== null) placement = {left, top, width, height, lane};
    }
    if (!placement) {
      const left = Math.max(
        candidate.anchorX + TARGET_LABEL_OFFSET_PX,
        ...placed.map((item) => item.right + TARGET_LABEL_SAFE_GAP_PX),
      );
      const top = clamp(desiredTop, minimumTop, Math.max(minimumTop, maximumBottom - height));
      placement = {left, top, width, height, lane: candidates.length};
    }
    placement.right = placement.left + placement.width;
    placement.bottom = placement.top + placement.height;
    placed.push({...candidate, ...placement});
  }
  return placed;
}

function visiblePathEntries(radar) {
  const entries = (radar.result?.paths || []).map((path, index) => ({path, index}));
  if (radar.pathDisplayMode === "all") return entries;
  if (radar.pathDisplayMode === "target") return entries.filter(({path}) => path.classification === "target");
  const strongestClutter = entries
    .filter(({path}) => path.classification === "clutter")
    .sort((left, right) => Number(right.path.path_gain_db) - Number(left.path.path_gain_db))
    .slice(0, Math.max(0, Number(radar.keyClutterLimit) || 12));
  const included = new Set([
    ...entries.filter(({path}) => path.classification === "target" || path.classification === "direct").map(({index}) => index),
    ...strongestClutter.map(({index}) => index),
  ]);
  if (radar.selectedPath >= 0) included.add(radar.selectedPath);
  return entries.filter(({index}) => included.has(index));
}

function targetVelocityArrow(target, selected) {
  const velocity = new THREE.Vector3(...target.velocity.map(Number));
  const speed = velocity.length();
  if (speed < 1e-6) return null;
  const arrow = new THREE.ArrowHelper(
    velocity.normalize(),
    new THREE.Vector3(...target.position.map(Number)),
    DIRECTION_ARROW_LENGTH_M,
    radarTargetColor(target.id),
    DIRECTION_ARROW_HEAD_LENGTH_M,
    DIRECTION_ARROW_HEAD_WIDTH_M,
  );
  arrow.name = `radar-target-velocity-${target.id}`;
  arrow.userData.radarDirectionArrowLengthM = DIRECTION_ARROW_LENGTH_M;
  for (const child of arrow.children) {
    child.material.transparent = true;
    child.material.opacity = selected ? 0.98 : 0.72;
    child.material.depthTest = false;
    child.material.depthWrite = false;
    child.renderOrder = 118;
  }
  return arrow;
}

export function createRadarRenderer({state, viewerRef}) {
  const radar = state.radar;
  let active = false;
  let boundViewer = null;
  let targetScene = null;
  let targetLayer = null;
  let targetOverlayLayer = null;
  let pathLayer = null;
  let detectionLayer = null;
  let targetLabelLayer = null;
  let targetConnectorLayer = null;
  let unsubscribeFrame = null;
  const targetLabels = new Map();
  const projectedPosition = new THREE.Vector3();
  const cameraPosition = new THREE.Vector3();
  let syncError = null;

  function viewer() {
    return viewerRef.current;
  }

  function ensureTargetLabelLayer() {
    const shell = document.querySelector(".shell");
    if (!shell) return null;
    if (targetLabelLayer?.isConnected) {
      if (targetLabelLayer.parentElement !== shell) shell.prepend(targetLabelLayer);
      return targetLabelLayer;
    }
    targetLabelLayer = document.createElement("div");
    targetLabelLayer.className = "radarTargetLabelLayer hidden";
    targetLabelLayer.dataset.radarTargetLabels = "true";
    targetLabelLayer.setAttribute("aria-hidden", "true");
    targetConnectorLayer = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    targetConnectorLayer.classList.add("radarTargetConnectorLayer");
    targetConnectorLayer.setAttribute("aria-hidden", "true");
    targetLabelLayer.append(targetConnectorLayer);
    shell.prepend(targetLabelLayer);
    return targetLabelLayer;
  }

  function createTargetLabel(targetId) {
    const layer = ensureTargetLabelLayer();
    if (!layer || !targetConnectorLayer) return null;
    const connector = document.createElementNS("http://www.w3.org/2000/svg", "line");
    connector.classList.add("radarTargetConnector", "hidden");
    connector.dataset.targetId = targetId;
    targetConnectorLayer.append(connector);
    const element = document.createElement("div");
    element.className = "radarTargetLabel hidden";
    element.dataset.targetId = targetId;
    const title = document.createElement("strong");
    const details = document.createElement("small");
    element.append(title, details);
    layer.append(element);
    const record = {element, connector, title, details};
    targetLabels.set(targetId, record);
    return record;
  }

  function updateTargetLabelPositions(frame = {}) {
    if (!targetLabelLayer) return;
    const visible = active && state.mode === "radar";
    targetLabelLayer.classList.toggle("hidden", !visible);
    if (!visible) return;
    const current = frame.viewer || boundViewer;
    if (!current || current !== boundViewer) return;
    const camera = frame.camera || current.camera;
    const canvas = frame.canvas || current.canvas;
    if (!camera || !canvas) return;
    const rect = canvas.getBoundingClientRect();
    if (!(rect.width > 0 && rect.height > 0)) return;
    if (!frame.camera) camera.updateMatrixWorld();
    const candidates = [];
    for (const target of radar.targets) {
      const record = targetLabels.get(target.id);
      if (!record) continue;
      projectedPosition.set(...target.position.map(Number));
      cameraPosition.copy(projectedPosition).applyMatrix4(camera.matrixWorldInverse);
      projectedPosition.project(camera);
      const inView = cameraPosition.z < 0
        && projectedPosition.z >= -1 && projectedPosition.z <= 1
        && projectedPosition.x >= -1 && projectedPosition.x <= 1
        && projectedPosition.y >= -1 && projectedPosition.y <= 1;
      if (!inView) {
        record.element.classList.add("hidden");
        record.connector.classList.add("hidden");
        record.element.dataset.visible = "false";
        continue;
      }
      const anchorX = rect.left + (projectedPosition.x * 0.5 + 0.5) * rect.width;
      const anchorY = rect.top + (-projectedPosition.y * 0.5 + 0.5) * rect.height;
      candidates.push({
        targetId: target.id,
        record,
        anchorX,
        anchorY,
        scale: targetLabelScale(-cameraPosition.z),
      });
    }
    candidates.sort((left, right) => left.anchorY - right.anchorY || left.targetId.localeCompare(right.targetId));
    for (const candidate of placeTargetLabels(candidates, rect)) {
      const {element, connector} = candidate.record;
      const labelCenterY = candidate.top + candidate.height / 2;
      element.classList.remove("hidden");
      connector.classList.remove("hidden");
      element.dataset.visible = "true";
      element.dataset.scale = candidate.scale.toFixed(3);
      element.dataset.lane = String(candidate.lane);
      element.dataset.anchorX = candidate.anchorX.toFixed(2);
      element.dataset.anchorY = candidate.anchorY.toFixed(2);
      element.style.setProperty("--radar-target-label-scale", candidate.scale.toFixed(4));
      element.style.left = `${candidate.left}px`;
      element.style.top = `${labelCenterY}px`;
      connector.setAttribute("x1", candidate.anchorX.toFixed(2));
      connector.setAttribute("y1", candidate.anchorY.toFixed(2));
      connector.setAttribute("x2", candidate.left.toFixed(2));
      connector.setAttribute("y2", labelCenterY.toFixed(2));
    }
  }

  function syncTargetLabels() {
    ensureTargetLabelLayer();
    const currentIds = new Set();
    for (const target of radar.targets) {
      currentIds.add(target.id);
      const record = targetLabels.get(target.id) || createTargetLabel(target.id);
      if (!record) continue;
      const selected = target.id === radar.selectedTargetId;
      const color = radarTargetColor(target.id);
      record.element.classList.toggle("selected", selected);
      record.connector.classList.toggle("selected", selected);
      record.element.dataset.selected = String(selected);
      record.element.dataset.targetColor = color;
      record.element.style.setProperty("--radar-target-label-accent", color);
      record.connector.style.stroke = color;
      record.title.textContent = radarTargetDisplayName(target.id);
      record.details.textContent = targetInfoText(target);
    }
    for (const [targetId, record] of targetLabels) {
      if (currentIds.has(targetId)) continue;
      record.element.remove();
      record.connector.remove();
      targetLabels.delete(targetId);
    }
    updateTargetLabelPositions();
  }

  function subscribeToFrames() {
    if (unsubscribeFrame || !boundViewer?.subscribeFrame) return;
    unsubscribeFrame = boundViewer.subscribeFrame(updateTargetLabelPositions);
  }

  function unsubscribeFromFrames() {
    unsubscribeFrame?.();
    unsubscribeFrame = null;
  }

  function ensureLayers() {
    const current = viewer();
    if (!current?.__ready || !current.layers || !current.assets || !current.primitives) return false;
    if (boundViewer === current && targetScene) return true;
    if (boundViewer && boundViewer !== current) dispose();
    boundViewer = current;
    targetLayer = current.layers.create("radar", "targets", {order: 6, pickable: true});
    pathLayer = current.layers.create("radar", "paths", {order: 8, pickable: false});
    targetOverlayLayer = current.layers.create("radar", "target-overlays", {order: 9, pickable: false});
    detectionLayer = current.layers.create("radar", "detections", {order: 10, pickable: true});
    targetScene = new RadarTargetScene({assetManager: current.assets, group: targetLayer.group});
    ensureTargetLabelLayer();
    if (active) subscribeToFrames();
    current.layers.setFeatureVisible("radar", active);
    return true;
  }

  function registerAssets(manifest) {
    if (!ensureLayers()) return 0;
    let registered = 0;
    for (const asset of manifest?.assets || []) {
      if (!asset?.id || !asset?.visual?.url || boundViewer.assets.descriptor(asset.id)) continue;
      boundViewer.assets.register({
        id: asset.id,
        url: asset.visual.url,
        format: asset.visual.format || "glb",
        units: 1,
        upAxis: "Z",
        pivot: "origin",
        defaultTransform: {position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1]},
        license: asset.license,
      });
      registered += 1;
    }
    return registered;
  }

  async function syncTargets() {
    if (!ensureLayers()) return;
    const visibleTargets = radar.targets.filter((target) => boundViewer.assets.descriptor(target.asset_id));
    try {
      await targetScene.sync(visibleTargets);
      syncError = null;
    } catch (error) {
      syncError = error;
      console.warn("Radar target visualization failed", error);
    }
  }

  function detectionPosition(detection) {
    return Array.isArray(detection.position_m) && detection.position_m.length === 3
      ? detection.position_m.map(Number)
      : null;
  }

  function renderPaths() {
    if (!ensureLayers()) return;
    const paths = radar.result?.paths || [];
    const visibleEntries = visiblePathEntries(radar);
    const finiteGains = paths.map((path) => Number(path.path_gain_db)).filter(Number.isFinite);
    const minimum = finiteGains.length ? Math.min(...finiteGains) : -160;
    const maximum = finiteGains.length ? Math.max(...finiteGains) : -80;
    const span = Math.max(1, maximum - minimum);
    boundViewer.primitives.renderPolylineSet(pathLayer, {
      type: "polyline-set",
      items: visibleEntries.filter(({path}) => Array.isArray(path.polyline) && path.polyline.length >= 2).map(({path}) => {
        const strength = Math.max(0, Math.min(1, (Number(path.path_gain_db) - minimum) / span));
        const color = path.classification === "target"
          ? radarTargetColor(path.target_ids?.[0])
          : PATH_COLORS[path.classification];
        return {points: path.polyline, value: Number(path.path_gain_db), color, width: 1.2 + 2.2 * strength, opacity: 0.14 + 0.66 * strength};
      }),
      selectedIndex: visibleEntries.findIndex(({index}) => index === radar.selectedPath),
      selectedWidth: 3.4,
      dimmedWidth: 1.4,
      selectedOpacity: 0.94,
      dimmedOpacity: 0.16,
    });
  }

  function renderTargetOverlays() {
    if (!ensureLayers()) return;
    targetOverlayLayer.clear();
    for (const target of radar.targets) {
      const selected = target.id === radar.selectedTargetId;
      const group = new THREE.Group();
      group.name = `radar-target-overlay-${target.id}`;
      group.userData.radarTargetOverlay = {
        targetId: target.id,
        displayColor: radarTargetColor(target.id),
        speedMps: targetSpeed(target),
        rcsM2: Number(target.rcs_m2),
      };
      const arrow = targetVelocityArrow(target, selected);
      if (arrow) group.add(arrow);
      targetOverlayLayer.add(group);
    }
    syncTargetLabels();
  }

  function renderMarkers() {
    if (!ensureLayers()) return;
    // Target-associated detections already have a precise visual anchor: the drone
    // model, its motion arrow, and its screen-space information label. Drawing a second spherical
    // marker at the same coordinate obscures the aircraft, unlike the Radar demo.
    const positioned = radarProcessingView(radar.result, radar.processingView).detections
      .filter((detection) => !detection.target_id && detection.classification !== "target")
      .map((detection) => ({detection, position: detectionPosition(detection)}))
      .filter((item) => item.position);
    const selectedDetectionIndex = positioned.findIndex((item) => item.detection.detection_id === radar.selectedDetectionId);
    boundViewer.primitives.renderMarkerSet(detectionLayer, {type: "marker-set", points: positioned.map((item) => item.position), selectedIndex: selectedDetectionIndex, radius: 0.8, markerColor: "#f2a13e", selectedColor: "#1eb980"});
  }

  function render() {
    if (!ensureLayers()) return;
    boundViewer.layers.setFeatureVisible("radar", active && state.mode === "radar");
    if (!active || state.mode !== "radar") {
      targetLabelLayer?.classList.add("hidden");
      return;
    }
    subscribeToFrames();
    syncTargets().then(() => { if (active) renderMarkers(); });
    renderPaths();
    renderTargetOverlays();
    renderMarkers();
  }

  function focusTarget(targetId) {
    if (!ensureLayers()) return false;
    const target = radar.targets.find((item) => item.id === targetId);
    if (!target) return false;
    const center = new THREE.Vector3(...target.position);
    const direction = boundViewer.camera.position.clone().sub(boundViewer.controls.target);
    if (direction.lengthSq() < 1e-6) direction.set(-1, -1.2, 0.8);
    direction.normalize();
    boundViewer.controls.target.copy(center);
    boundViewer.camera.position.copy(center).addScaledVector(direction, 18);
    boundViewer.camera.lookAt(center);
    boundViewer.controls.update();
    return true;
  }

  function pickTarget(clientX, clientY) {
    if (!ensureLayers() || !targetScene?.size) return null;
    const rect = boundViewer.canvas.getBoundingClientRect();
    const pointer = new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    boundViewer.raycaster.setFromCamera(pointer, boundViewer.camera);
    const hit = boundViewer.raycaster.intersectObject(targetLayer.group, true)[0];
    let object = hit?.object || null;
    while (object && object.parent !== targetLayer.group) object = object.parent;
    return object?.userData?.radarTargetId || null;
  }

  function activate() {
    active = true;
    if (ensureLayers()) {
      boundViewer.layers.setFeatureVisible("radar", true);
      subscribeToFrames();
      targetLabelLayer.classList.remove("hidden");
    }
    render();
  }

  function deactivate() {
    active = false;
    unsubscribeFromFrames();
    targetLabelLayer?.classList.add("hidden");
    if (ensureLayers()) boundViewer.layers.setFeatureVisible("radar", false);
  }

  function clearResult() {
    pathLayer?.clear();
    detectionLayer?.clear();
  }

  function dispose() {
    unsubscribeFromFrames();
    targetLabelLayer?.remove();
    targetLabelLayer = null;
    targetConnectorLayer = null;
    targetLabels.clear();
    targetScene?.dispose();
    if (boundViewer?.layers) boundViewer.layers.disposeFeature("radar");
    targetScene = null; targetLayer = null; targetOverlayLayer = null; pathLayer = null; detectionLayer = null; boundViewer = null;
  }

  return Object.freeze({activate, clearResult, deactivate, dispose, focusTarget, pickTarget, registerAssets, render, syncTargets, getSyncError: () => syncError});
}
