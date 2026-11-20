import {normalizeColormapName} from "/js/colormaps.js";
import {
  DEEPMIMO_FIXED_ANTENNA_ARRAY,
  normalizeAntennaArrayConfig,
} from "/js/solvers/antenna_config.js?v=20260519-mode-isolation";
import {
  commonSolverConfig as buildCommonSolverConfig,
  deepMimoPayload as buildDeepMimoPayload,
  deepMimoReceiverEstimate as estimateDeepMimoReceivers,
  linkChannelConfig as buildLinkChannelConfig,
  linkSolvePayload as buildLinkSolvePayload,
  linkSolverConfig as buildLinkSolverConfig,
  radiomapJobPayload as buildRadiomapJobPayload,
  radiomapSurfacePayload as buildRadiomapSurfacePayload,
} from "/js/solvers/solver_payloads.js?v=20260723-empty-devices";
import {formatCount} from "/js/ui/result_formatters.js?v=20260519-mode-isolation";

export function createSolverControlsController(context) {
  const {state, viewerRef} = context;
  const controlsStore = context.featureServices.controls;
  const getViewer = () => viewerRef.current;
  const scene = () => context.controllers.scene;

  function showOverlay(options) {
    return scene().showOverlay(options);
  }

  function hideOverlay(owner = null) {
    return scene().hideOverlay(owner);
  }

  function renderAll() {
    scene().renderAll();
  }

  function featureMethod(method) {
    const activeCandidate = context.features.instance(state.mode)?.[method];
    if (typeof activeCandidate === "function") {
      return activeCandidate;
    }
    for (const definition of context.features.definitions()) {
      const candidate = context.features.instance(definition.id)?.[method];
      if (typeof candidate === "function") {
        return candidate;
      }
    }
    throw new Error(`No feature implements ${method}()`);
  }

  function callFeature(method, ...args) {
    return featureMethod(method)(...args);
  }

  function applyRtCapabilities(capabilities) {
    const antenna = capabilities?.antenna_arrays || {};
    const defaults = normalizeAntennaArrayConfig(antenna.defaults || {});
    Object.assign(state.antenna.txArray, defaults);
    Object.assign(state.antenna.rxArray, defaults);

    const patterns = Array.isArray(antenna.patterns) && antenna.patterns.length
      ? antenna.patterns
      : [defaults.pattern];
    const polarizations = Array.isArray(antenna.polarizations) && antenna.polarizations.length
      ? antenna.polarizations
      : [defaults.polarization];
    const limits = antenna.limits || {};

    state.capabilities = {
      antennaPatterns: [...patterns],
      antennaPolarizations: [...polarizations],
      antennaLimits: {
        numRows: {min: Number(limits.num_rows?.min ?? 1), max: Number(limits.num_rows?.max ?? 16)},
        numCols: {min: Number(limits.num_cols?.min ?? 1), max: Number(limits.num_cols?.max ?? 16)},
        verticalSpacing: {min: Number(limits.vertical_spacing?.min ?? 0.01), max: Number(limits.vertical_spacing?.max ?? 10)},
        horizontalSpacing: {min: Number(limits.horizontal_spacing?.min ?? 0.01), max: Number(limits.horizontal_spacing?.max ?? 10)},
      },
      colormaps: [...state.capabilities.colormaps],
    };
    publishControls();
  }

  function commonSolverConfig({includeTxArray = true} = {}) {
    return buildCommonSolverConfig({state, includeTxArray});
  }

  function linkSolverConfig() {
    return buildLinkSolverConfig({state});
  }

  function linkChannelConfig() {
    return buildLinkChannelConfig({state});
  }

  function linkSolvePayload({preview = false} = {}) {
    return buildLinkSolvePayload({state, preview});
  }

  function mobilityDistance(points = state.mobility.trajectory.points) {
    let total = 0;
    for (let i = 1; i < points.length; i += 1) {
      const prev = points[i - 1];
      const point = points[i];
      total += Math.hypot(point[0] - prev[0], point[1] - prev[1], point[2] - prev[2]);
    }
    return total;
  }

  function mobilityEstimatedSteps(distance, velocity, timeStep) {
    if (!(distance > 0) || !(velocity > 0) || !(timeStep > 0)) {
      return 0;
    }
    const duration = distance / velocity;
    return Math.floor((duration - 1e-9) / timeStep) + 2;
  }

  function mobilityEstimate() {
    const distance = mobilityDistance();
    const velocity = Number(state.mobility.trajectory.velocityMps);
    const timeStep = Number(state.mobility.trajectory.timeStepS);
    const maxSteps = Number(state.mobility.trajectory.maxSteps);
    const duration = velocity > 0 ? distance / velocity : NaN;
    const steps = mobilityEstimatedSteps(distance, velocity, timeStep);
    return {distance, duration, steps, maxSteps};
  }

  function formatCoord(point) {
    return point.map((value) => Number(value).toFixed(1)).join(", ");
  }

  function invalidateLinkResult({clearPaths = true, clearOverlay = true} = {}) {
    callFeature("invalidateLinkResult", {clearPaths, clearOverlay});
  }

  function invalidateRadarResult({clearPaths = true, clearOverlay = true} = {}) {
    context.features.instance("radar")?.invalidateRadarResult?.({clearPaths, clearOverlay});
  }

  function invalidateRadiomapResult({clearOverlay = true} = {}) {
    callFeature("invalidateRadiomapResult", {clearOverlay});
  }

  function invalidateMobilityResult({clearOverlay = true, clearPaths = true} = {}) {
    callFeature("invalidateMobilityResult", {clearOverlay, clearPaths});
  }

  function invalidateDeepMimoResult({clearOverlay = true} = {}) {
    callFeature("invalidateDeepMimoResult", {clearOverlay});
  }

  function normalizeMobilityWaypointSelection() {
    const count = state.mobility.trajectory.points.length;
    if (count <= 0) {
      state.mobility.selectedWaypointIndex = -1;
      return;
    }
    const selected = Number(state.mobility.selectedWaypointIndex);
    state.mobility.selectedWaypointIndex = Number.isInteger(selected)
      ? Math.min(Math.max(selected, 0), count - 1)
      : count - 1;
  }

  function deleteMobilityWaypoint(index = state.mobility.selectedWaypointIndex) {
    const points = state.mobility.trajectory.points;
    if (!Number.isInteger(index) || index < 0 || index >= points.length) {
      return false;
    }
    points.splice(index, 1);
    state.mobility.selectedWaypointIndex = points.length ? Math.min(index, points.length - 1) : -1;
    invalidateMobilityResult();
    renderAll();
    return true;
  }

  function renderMobilityTrajectoryPreview() {
    if (state.mode !== "mobility") {
      getViewer().clearMobility();
      return;
    }
    const result = state.mobility.result;
    getViewer().renderMobilityTrajectory(
      state.mobility.trajectory.points,
      result?.samples || [],
      result ? state.mobility.selectedStep : state.mobility.selectedWaypointIndex,
    );
  }

  function normalizeDevicePosition(values) {
    if (!Array.isArray(values) || values.length !== 3) {
      return null;
    }
    const position = values.map(Number);
    return position.every(Number.isFinite) ? position : null;
  }

  function setLogicalAndVisual(featureState, role, logicalValues, visualValues = logicalValues) {
    featureState[role] = normalizeDevicePosition(logicalValues);
    featureState[`${role}Visual`] = normalizeDevicePosition(visualValues);
  }

  function surfaceClearanceM(scope = "link") {
    const featureState = context.features.store.get(scope);
    const value = Number(featureState?.surfaceClearanceM);
    if (!Number.isFinite(value)) {
      return 1.5;
    }
    return Math.max(0, Math.min(50, value));
  }

  function setSurfaceClearanceM(scope, value) {
    const clearance = Number(value);
    const nextClearance = Number.isFinite(clearance)
      ? Math.max(0, Math.min(50, clearance))
      : 1.5;
    context.features.store.get(scope).surfaceClearanceM = nextClearance;
  }

  function pickPositionWithSurfaceClearance(pick, scope = "link") {
    const base = Array.isArray(pick.surfacePosition) ? pick.surfacePosition : pick.logicalPosition;
    const normal = Array.isArray(pick.surfaceNormal) ? pick.surfaceNormal : null;
    const clearance = surfaceClearanceM(scope);
    if (!base || !normal || !normal.every(Number.isFinite)) {
      return pick.logicalPosition;
    }
    return base.map((value, index) => Number(value) + (normal[index] * clearance));
  }

  function syncViewerMarkers() {
    const positions = context.features.instance(state.mode)?.markerPositions?.() || {tx: null, rx: null};
    getViewer().setTx(positions.tx);
    getViewer().setRx(positions.rx);
  }

  function syncModeVisuals() {
    const activeLayers = new Set(context.features.get(state.mode)?.renderLayers || []);
    for (const [layer, clear] of [
      ["radiomap", () => getViewer().clearRadiomap()],
      ["roi", () => getViewer().clearDeepMimoRoi()],
      ["trajectory", () => getViewer().clearMobility()],
      ["paths", () => getViewer().clearPaths()],
    ]) {
      if (!activeLayers.has(layer)) {
        clear();
      }
    }
  }

  function markerRadiusForPickTarget(target) {
    const definition = context.picking.get(target);
    if (definition?.role === "roi") {
      return 0;
    }
    return definition?.role === "rx"
      ? getViewer().rxMarkerRadius
      : getViewer().txMarkerRadius;
  }

  function radiomapColorRange() {
    const minDb = Number(state.radiomap.display.colorMinDb);
    const maxDb = Number(state.radiomap.display.colorMaxDb);
    if (!(minDb < maxDb)) {
      return {minDb: -140, maxDb: -80, colormap: normalizeColormapName(state.radiomap.display.colormap)};
    }
    const colormap = normalizeColormapName(state.radiomap.display.colormap);
    state.radiomap.display.colormap = colormap;
    return {minDb, maxDb, colormap};
  }

  function rerenderRadiomapOverlay() {
    if (!state.radiomap.result) {
      return;
    }
    const colorRange = radiomapColorRange();
    getViewer().renderRadiomap(state.radiomap.result, colorRange);
  }

  function syncLivePreviewStatusUi() {
    callFeature("syncLivePreviewStatusUi");
  }

  function setLivePreviewStatus(mode, status) {
    state.livePreview.mode = mode;
    state.livePreview.status = status;
    syncLivePreviewStatusUi();
  }

  function clearLivePreviewStatus() {
    state.livePreview.mode = null;
    state.livePreview.status = "Idle";
    syncLivePreviewStatusUi();
  }

  function deepMimoRoiBounds() {
    const cornerA = state.deepmimo.roi.cornerA;
    const cornerB = state.deepmimo.roi.cornerB;
    if (!Array.isArray(cornerA) || !Array.isArray(cornerB)) {
      return null;
    }
    const minX = Math.min(Number(cornerA[0]), Number(cornerB[0]));
    const minY = Math.min(Number(cornerA[1]), Number(cornerB[1]));
    const maxX = Math.max(Number(cornerA[0]), Number(cornerB[0]));
    const maxY = Math.max(Number(cornerA[1]), Number(cornerB[1]));
    if (![minX, minY, maxX, maxY].every(Number.isFinite) || maxX <= minX || maxY <= minY) {
      return null;
    }
    return {
      min: [minX, minY],
      max: [maxX, maxY],
      center: [(minX + maxX) * 0.5, (minY + maxY) * 0.5],
      size: [maxX - minX, maxY - minY],
    };
  }

  function setDeepMimoRoiCorners(cornerA, cornerB, {message = "ROI updated"} = {}) {
    invalidateDeepMimoResult();
    const visualZ = Number.isFinite(Number(state.deepmimo.roi.visualZ))
      ? Number(state.deepmimo.roi.visualZ)
      : Number(cornerA[2] || cornerB[2] || 0);
    state.deepmimo.roi.visualZ = visualZ;
    state.deepmimo.roi.cornerA = [Number(cornerA[0]), Number(cornerA[1]), visualZ];
    state.deepmimo.roi.cornerB = [Number(cornerB[0]), Number(cornerB[1]), visualZ];
    state.deepmimo.roi.pickingStep = "a";
    state.deepmimo.status = "Idle";
    state.deepmimo.progress = 0;
    state.deepmimo.message = message;
  }

  function setDeepMimoRoiFromCenter(centerX, centerY, width, length, z = 0) {
    const halfWidth = Number(width) * 0.5;
    const halfLength = Number(length) * 0.5;
    setDeepMimoRoiCorners(
      [Number(centerX) - halfWidth, Number(centerY) - halfLength, z],
      [Number(centerX) + halfWidth, Number(centerY) + halfLength, z],
    );
  }

  function deepMimoReceiverEstimate(bounds = deepMimoRoiBounds()) {
    return estimateDeepMimoReceivers(bounds, state.deepmimo.rxGrid);
  }

  function deepMimoPayload() {
    const bounds = deepMimoRoiBounds();
    const receiverEstimate = deepMimoReceiverEstimate(bounds);
    return buildDeepMimoPayload({
      state,
      bounds,
      receiverEstimate,
      formatCount,
      linkDomain: context.featureServices.linkDomain,
    });
  }

  function renderDeepMimoState() {
    callFeature("renderDeepMimoState");
  }

  function setDeepMimoRoiCorner(position) {
    invalidateDeepMimoResult();
    const nextVisualZ = Number(position[2] || 0);
    const visualZ = (state.deepmimo.roi.pickingStep === "a" || !Number.isFinite(Number(state.deepmimo.roi.visualZ)))
      ? nextVisualZ
      : Number(state.deepmimo.roi.visualZ);
    const point = [Number(position[0]), Number(position[1]), visualZ];
    if (state.deepmimo.roi.pickingStep === "a" || !state.deepmimo.roi.cornerA) {
      state.deepmimo.roi.visualZ = visualZ;
      state.deepmimo.roi.cornerA = point;
      state.deepmimo.roi.cornerB = null;
      state.deepmimo.roi.pickingStep = "b";
    } else {
      state.deepmimo.roi.cornerB = point;
      state.deepmimo.roi.pickingStep = "a";
    }
    state.deepmimo.status = "Idle";
    state.deepmimo.progress = 0;
    state.deepmimo.message = "ROI updated";
    renderDeepMimoState();
    publishControls();
  }

  function startDeepMimoRoiDrag(position) {
    invalidateDeepMimoResult();
    const visualZ = Number(position[2] || 0);
    const point = [Number(position[0]), Number(position[1]), visualZ];
    state.deepmimo.roi.visualZ = visualZ;
    state.deepmimo.roi.cornerA = point;
    state.deepmimo.roi.cornerB = point;
    state.deepmimo.roi.pickingStep = "drag";
    state.deepmimo.status = "Idle";
    state.deepmimo.progress = 0;
    state.deepmimo.message = "Drawing ROI";
    renderDeepMimoState();
    publishControls();
  }

  function updateDeepMimoRoiDrag(position) {
    if (!Array.isArray(state.deepmimo.roi.cornerA)) {
      startDeepMimoRoiDrag(position);
      return;
    }
    const visualZ = Number.isFinite(Number(state.deepmimo.roi.visualZ))
      ? Number(state.deepmimo.roi.visualZ)
      : Number(position[2] || 0);
    state.deepmimo.roi.cornerB = [Number(position[0]), Number(position[1]), visualZ];
    state.deepmimo.message = "Drawing ROI";
    renderDeepMimoState();
    publishControls();
  }

  function finishDeepMimoRoiDrag(position) {
    updateDeepMimoRoiDrag(position);
    state.deepmimo.roi.pickingStep = "a";
    state.deepmimo.message = deepMimoRoiBounds() ? "ROI updated" : "Drag a larger ROI";
    renderDeepMimoState();
    publishControls();
  }

  function clearDeepMimoRoi() {
    invalidateDeepMimoResult();
    state.deepmimo.roi.cornerA = null;
    state.deepmimo.roi.cornerB = null;
    state.deepmimo.roi.pickingStep = "a";
    state.deepmimo.roi.visualZ = null;
    state.deepmimo.status = "Idle";
    state.deepmimo.progress = 0;
    state.deepmimo.message = "Idle";
    getViewer().clearDeepMimoRoi();
    renderDeepMimoState();
    publishControls();
  }

  function radiomapJobPayload() {
    return buildRadiomapJobPayload({state});
  }

  function radiomapSurfacePayload() {
    return buildRadiomapSurfacePayload({state});
  }

  function handleLivePreviewDeviceUpdate(target, phase = "change") {
    callFeature("handleLivePreviewDeviceUpdate", target, phase);
  }

  function resetMobilityTrajectoryFromRx() {
    state.mobility.trajectory.points = [];
    state.mobility.selectedWaypointIndex = -1;
    invalidateMobilityResult();
  }

  function addCurrentRxWaypoint() {
    if (!Array.isArray(state.mobility.rx)) {
      state.deviceControl.hintText = "Place Mobility Rx before adding a waypoint.";
      publishControls();
      return false;
    }
    const point = [...state.mobility.rx];
    const points = state.mobility.trajectory.points;
    const last = points[points.length - 1];
    if (last && Math.hypot(point[0] - last[0], point[1] - last[1], point[2] - last[2]) < 1e-6) {
      state.mobility.selectedWaypointIndex = points.length - 1;
      renderAll();
      return false;
    }
    points.push(point);
    state.mobility.selectedWaypointIndex = points.length - 1;
    invalidateMobilityResult();
    renderAll();
    return true;
  }

  function updateDeviceCoordinate(mode, role, axis, value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return;
    const featureState = context.features.store.get(mode);
    if (!featureState) return;
    const current = Array.isArray(featureState[role]) ? [...featureState[role]] : [0, 0, 0];
    current[axis] = numeric;
    setLogicalAndVisual(featureState, role, current);
    if (mode === "radar" && state.radar.mode === "monostatic" && role === "tx") {
      setLogicalAndVisual(state.radar, "rx", current);
    }
    if (mode === "link") {
      context.settings.publish("link-device");
      handleLivePreviewDeviceUpdate(role === "tx" ? "link-tx" : "link-rx", "change");
    } else if (mode === "mobility") {
      invalidateMobilityResult();
    } else if (mode === "radiomap") {
      invalidateRadiomapResult();
    } else if (mode === "deepmimo") {
      invalidateDeepMimoResult();
    } else if (mode === "radar") {
      context.settings.publish("radar-device");
    }
    renderAll();
  }

  function buildControlsSnapshot() {
    const activeFeature = context.features.get(state.mode) || context.features.definitions()[0];
    const policy = activeFeature?.sharedControlPolicy || {tx: true, rx: false, antenna: "none"};
    const activeTargetMeta = context.picking.get(state.deviceControl.activeTarget);
    const sceneControlsVisible = Boolean(
      getViewer().__ready
      && !state.entry.visible
      && state.sceneVisible
      && !state.loading.visible,
    );
    const activeFeatureState = context.features.store.get(state.mode);
    const activeTx = context.features.instance(state.mode)?.markerPositions?.().tx;
    const txReady = Array.isArray(activeTx) && activeTx.length === 3;
    const clearanceScope = activeTargetMeta?.scope || state.mode;
    const showRx = state.mode === "radar"
      ? state.radar.mode === "bistatic"
      : Boolean(policy.rx);

    const dmBounds = deepMimoRoiBounds();
    const dmEstimate = deepMimoReceiverEstimate(dmBounds);
    const rxCandidatesText = dmBounds && Number.isFinite(dmEstimate)
      ? formatCount(dmEstimate)
      : "--";
    const mobEst = mobilityEstimate();
    normalizeMobilityWaypointSelection();

    const antennaPolicy = policy.antenna === "both" || policy.antenna === "tx" || policy.antenna === "fixed"
      ? policy.antenna
      : "none";
    const effectiveTxArray = antennaPolicy === "fixed" ? DEEPMIMO_FIXED_ANTENNA_ARRAY : state.antenna.txArray;
    const effectiveRxArray = antennaPolicy === "fixed" ? DEEPMIMO_FIXED_ANTENNA_ARRAY : state.antenna.rxArray;

    const radarVm = context.featureServices.radarControls?.buildControlsViewModel() || {
      mode: state.radar.mode,
      modeHint: "",
      job: {visible: false, status: "idle", failureKind: "", message: "Ready", progress: 0, canCancel: false, canRetry: false, active: false},
      assets: [],
      pickerAssetId: "",
      pickerAssetName: "Loading...",
      pickerCountLabel: "0 / 0",
      pickerStatus: "",
      pickerState: "loading",
      pickerHint: "",
      hasMultipleAssets: false,
      canAddTarget: false,
      addTargetDisabledReason: "",
      targetCountLabel: "0 / 16",
      targets: [],
      selectedTarget: null,
      waveform: {
        ...state.radar.waveform,
        rangeResolutionText: "--",
        dopplerResolutionText: "--",
        velocityResolutionText: "--",
      },
      signal: {...state.radar.signal},
      cfar: {...state.radar.cfar},
      solver: {...state.radar.solver},
      inputError: state.radar.error || "",
      runDisabledReason: "",
    };

    return {
      activeMode: state.mode,
      tileLoadBusy: Boolean(state.tileLoadBusy),
      busyActionId: state.busyActionId,
      deviceBar: {
        visible: sceneControlsVisible,
        activeTarget: state.deviceControl.activeTarget,
        hintText: state.deviceControl.hintText,
        txOrbiting: Boolean(getViewer().isTxOrbiting()),
        canOrbitTx: txReady,
        surfaceClearanceM: surfaceClearanceM(clearanceScope),
        txPosition: Array.isArray(activeFeatureState?.tx) ? [...activeFeatureState.tx] : null,
        rxPosition: Array.isArray(activeFeatureState?.rx) ? [...activeFeatureState.rx] : null,
        showRx,
        txLabel: "Tx",
        rxLabel: "Rx",
        precisionTitle: activeTargetMeta?.role === "rx" ? "Rx" : "Tx",
        showClearance: Boolean(activeTargetMeta?.clearance),
      },
      capabilities: state.capabilities,
      solver: {...state.solver},
      antenna: {
        policy: antennaPolicy,
        txArray: {...effectiveTxArray},
        rxArray: {...effectiveRxArray},
      },
      link: {
        bandwidthMhz: Number(state.link.advanced.bandwidthMhz),
        samplesPerSrc: Number(state.link.advanced.samplesPerSrc),
        maxNumPathsPerSrc: Number(state.link.advanced.maxNumPathsPerSrc),
        syntheticArray: Boolean(state.link.advanced.syntheticArray),
        diffraction: Boolean(state.link.advanced.diffraction),
        edgeDiffraction: Boolean(state.link.advanced.edgeDiffraction),
        diffractionLitRegion: Boolean(state.link.advanced.diffractionLitRegion),
        computeTaps: Boolean(state.link.advanced.computeTaps),
        tapLMin: Number(state.link.advanced.tapLMin),
        tapLMax: Number(state.link.advanced.tapLMax),
        tapFftSize: Number(state.link.advanced.tapFftSize),
        tapSubcarrierSpacingHz: Number(state.link.advanced.tapSubcarrierSpacingHz),
        livePreviewEnabled: Boolean(state.livePreview.enabled),
        livePreviewSamples: Number(state.livePreview.link.previewSamplesPerSrc),
        livePreviewPathsDelay: Number(state.livePreview.link.pathsDelayS),
        runDisabledReason: context.features.instance("link")?.runRequirementMessage?.() || "",
      },
      mobility: {
        velocityMps: Number(state.mobility.trajectory.velocityMps),
        timeStepS: Number(state.mobility.trajectory.timeStepS),
        maxSteps: Number(state.mobility.trajectory.maxSteps),
        estimateText: Number.isFinite(mobEst.duration)
          ? `${mobEst.distance.toFixed(1)} m · ${mobEst.duration.toFixed(1)} s · ${mobEst.steps} / ${mobEst.maxSteps} steps`
          : "Add at least 2 waypoints to build a trajectory.",
        waypoints: state.mobility.trajectory.points.map((point, index) => ({
          index,
          label: `Waypoint ${index + 1}`,
          coords: formatCoord(point),
          selected: index === state.mobility.selectedWaypointIndex,
        })),
        canAddRxWaypoint: Array.isArray(state.mobility.rx),
        runDisabledReason: context.features.instance("mobility")?.runRequirementMessage?.() || "",
      },
      radiomap: {
        sizeX: Number(state.radiomap.surface.size[0]),
        sizeY: Number(state.radiomap.surface.size[1]),
        heightOffset: Number(state.radiomap.surface.heightOffset),
        samplesPerTx: Number(state.radiomap.solver.samplesPerTx),
        cellSize: state.radiomap.surface.cellSize == null ? null : Number(state.radiomap.surface.cellSize),
        densityLevel: Number(state.radiomap.surface.densityLevel),
        colormap: normalizeColormapName(state.radiomap.display.colormap),
        colorMinDb: Number(state.radiomap.display.colorMinDb),
        colorMaxDb: Number(state.radiomap.display.colorMaxDb),
        runDisabledReason: context.features.instance("radiomap")?.runRequirementMessage?.() || "",
      },
      deepmimo: {
        scenarioName: String(state.deepmimo.export.scenarioName || ""),
        roiCenterX: dmBounds ? Number(dmBounds.center[0].toFixed(1)) : null,
        roiCenterY: dmBounds ? Number(dmBounds.center[1].toFixed(1)) : null,
        roiWidth: dmBounds ? Number(dmBounds.size[0].toFixed(1)) : null,
        roiLength: dmBounds ? Number(dmBounds.size[1].toFixed(1)) : null,
        hasRoi: Boolean(dmBounds),
        gridSpacing: Number(state.deepmimo.rxGrid.spacing),
        rxHeight: Number(state.deepmimo.rxGrid.height),
        maxReceivers: Number(state.deepmimo.rxGrid.maxReceivers),
        chunkSize: Number(state.deepmimo.rxGrid.chunkSize),
        samplesPerSrc: Number(state.deepmimo.solver.samplesPerSrc),
        maxNumPathsPerSrc: Number(state.deepmimo.solver.maxNumPathsPerSrc),
        filterBuildings: Boolean(state.deepmimo.rxGrid.filterBuildings),
        rxCandidatesText,
        runDisabledReason: context.features.instance("deepmimo")?.runRequirementMessage?.() || "",
      },
      radar: radarVm,
    };
  }

  function publishControls() {
    controlsStore?.publish(buildControlsSnapshot());
  }

  function applyPick(pick, targetId = state.pickTarget) {
    const target = context.picking?.get(targetId);
    const feature = target ? context.features.instance(target.featureId) : null;
    if (!pick || !target || typeof feature?.applyPick !== "function") {
      return;
    }
    feature.applyPick(pick, target);
    renderAll();
  }

  context.featureServices.solver = Object.freeze({
    getViewer,
    showOverlay,
    hideOverlay,
    renderAll,
    readLinkInputs: () => {},
    readLivePreviewInputs: () => {},
    linkSolvePayload,
    setLivePreviewStatus,
    clearLivePreviewStatus,
    syncLivePreviewStatusUi,
    readMobilityInputs: () => {},
    mobilityEstimate,
    renderMobilityTrajectoryPreview,
    readRadiomapInputs: () => {},
    radiomapJobPayload,
    radiomapSurfacePayload,
    radiomapColorRange,
    deepMimoRoiBounds,
    deepMimoReceiverEstimate,
    deepMimoPayload,
    renderDeepMimoState,
    linkSolverConfig,
    linkChannelConfig,
    pickPositionWithSurfaceClearance,
    setLogicalAndVisual,
  });

  return {
    applyRtCapabilities,
    commonSolverConfig,
    linkSolverConfig,
    linkChannelConfig,
    publishControls,
    syncNumericInputs: publishControls,
    syncViewerMarkers,
    syncModeVisuals,
    markerRadiusForPickTarget,
    setSurfaceClearanceM,
    updateDeviceCoordinate,
    invalidateLinkResult,
    invalidateRadarResult,
    invalidateRadiomapResult,
    invalidateMobilityResult,
    invalidateDeepMimoResult,
    rerenderRadiomapOverlay,
    renderMobilityTrajectoryPreview,
    renderDeepMimoState,
    deepMimoRoiBounds,
    setDeepMimoRoiFromCenter,
    setDeepMimoRoiCorner,
    startDeepMimoRoiDrag,
    updateDeepMimoRoiDrag,
    finishDeepMimoRoiDrag,
    clearDeepMimoRoi,
    addCurrentRxWaypoint,
    deleteMobilityWaypoint,
    resetMobilityTrajectoryFromRx,
    cancelLivePreview: ({clearStatus = true} = {}) => callFeature("cancelLivePreview", {clearStatus}),
    handleLivePreviewDeviceUpdate,
    applyPick,
  };
}
