import {normalizeColormapName} from "/js/colormaps.js";
import {createDeepMimoController} from "/js/controllers/deepmimo_controller.js?v=20260519-mode-isolation";
import {createLinkController} from "/js/controllers/link_controller.js?v=20260519-mode-isolation";
import {createMobilityController} from "/js/controllers/mobility_controller.js?v=20260519-mode-isolation";
import {createRadiomapController} from "/js/controllers/radiomap_controller.js?v=20260519-mode-isolation";
import {
  DEEPMIMO_FIXED_ANTENNA_ARRAY,
  antennaArrayPayload,
  normalizeAntennaArrayConfig,
} from "/js/solvers/antenna_config.js?v=20260519-mode-isolation";
import {
  commonSolverConfig as buildCommonSolverConfig,
  deepMimoPayload as buildDeepMimoPayload,
  deepMimoReceiverEstimate as estimateDeepMimoReceivers,
  linkChannelConfig as buildLinkChannelConfig,
  linkSolvePayload as buildLinkSolvePayload,
  linkSolverConfig as buildLinkSolverConfig,
  mobilityJobPayload as buildMobilityJobPayload,
  radiomapJobPayload as buildRadiomapJobPayload,
  radiomapSurfacePayload as buildRadiomapSurfacePayload,
} from "/js/solvers/solver_payloads.js?v=20260519-mode-isolation";
import {createDeepMimoDatasetView} from "/js/ui/deepmimo_dataset_view.js?v=20260519-mode-isolation";
import {createLinkResultView} from "/js/ui/link_result_view.js?v=20260519-mode-isolation";
import {createMobilityResultView} from "/js/ui/mobility_result_view.js?v=20260519-mode-isolation";
import {createRadiomapResultView} from "/js/ui/radiomap_result_view.js?v=20260519-mode-isolation";
import {formatCount} from "/js/ui/result_formatters.js?v=20260519-mode-isolation";

export function createSolverControlsController(context) {
  const {state, ui, inputs, viewerRef, api} = context;
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

  const {
    createDeepMimoJob,
    createMobilityJob,
    createRadiomapJob,
    cancelDeepMimoJob,
    deepMimoDownloadUrl,
    getDeepMimoJob,
    getMobilityJob,
    getMobilityResult,
    getRadiomapJob,
    getRadiomapResult,
    solveLink,
  } = api;

  const linkResultView = createLinkResultView({
    state,
    ui,
    getViewer,
  });
  const mobilityResultView = createMobilityResultView({
    state,
    ui,
    getViewer,
    renderAll,
    renderLinkChannel,
    clearPathSelection,
    hidePathDetails,
    renderPathDetails,
    renderPathSelection,
    scrollSelectedPathDetailsIntoView,
  });
  const radiomapResultView = createRadiomapResultView({
    state,
    ui,
    getViewer,
    radiomapColorRange,
    syncLivePreviewStatusUi,
    hidePathDetails,
  });
  const deepMimoDatasetView = createDeepMimoDatasetView({
    state,
    ui,
    getViewer,
    deepMimoRoiBounds,
    deepMimoReceiverEstimate,
    deepMimoDownloadUrl,
  });
  const linkController = createLinkController({
    state,
    ui,
    getViewer,
    solveLink,
    readLinkInputs,
    readLivePreviewInputs,
    linkSolvePayload,
    showOverlay,
    hideOverlay,
    renderAll,
    setLivePreviewStatus,
    clearLivePreviewStatus,
  });
  const radiomapController = createRadiomapController({
    state,
    getViewer,
    createRadiomapJob,
    getRadiomapJob,
    getRadiomapResult,
    readRadiomapInputs,
    radiomapJobPayload,
    radiomapColorRange,
    showOverlay,
    hideOverlay,
    renderRadiomapResult,
  });
  const mobilityController = createMobilityController({
    state,
    getViewer,
    createMobilityJob,
    getMobilityJob,
    getMobilityResult,
    readMobilityInputs,
    mobilityEstimate,
    mobilityJobPayload,
    showOverlay,
    hideOverlay,
    renderMobilityResult,
    renderMobilityTrajectoryPreview,
    stopMobilityPlayback,
  });
  const deepMimoController = createDeepMimoController({
    state,
    getViewer,
    createDeepMimoJob,
    cancelDeepMimoJob,
    getDeepMimoJob,
    deepMimoPayload,
    showOverlay,
    hideOverlay,
    renderDeepMimoState,
    addDeepMimoDataset,
  });

function antennaInputs(kind) {
  return {
    pattern: inputs[`${kind}ArrayPattern`],
    polarization: inputs[`${kind}ArrayPolarization`],
    rows: inputs[`${kind}ArrayRows`],
    cols: inputs[`${kind}ArrayCols`],
    verticalSpacing: inputs[`${kind}ArrayVerticalSpacing`],
    horizontalSpacing: inputs[`${kind}ArrayHorizontalSpacing`],
  };
}

function setAntennaInputsDisabled(refs, disabled) {
  for (const input of Object.values(refs)) {
    input.disabled = disabled;
  }
}

function writeAntennaArrayInputs(refs, config) {
  refs.pattern.value = config.pattern;
  refs.polarization.value = config.polarization;
  refs.rows.value = String(config.numRows);
  refs.cols.value = String(config.numCols);
  refs.verticalSpacing.value = String(config.verticalSpacing);
  refs.horizontalSpacing.value = String(config.horizontalSpacing);
}

function populateSelect(select, values, selectedValue) {
  const selected = String(selectedValue);
  const options = [...values];
  if (!options.includes(selected)) {
    options.unshift(selected);
  }
  select.replaceChildren();
  for (const value of options) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = value;
    option.selected = value === selected;
    select.appendChild(option);
  }
}

function applyAntennaArrayLimits(kind, limits = {}) {
  const refs = antennaInputs(kind);
  const rowLimits = limits.num_rows || {};
  const colLimits = limits.num_cols || {};
  const verticalLimits = limits.vertical_spacing || {};
  const horizontalLimits = limits.horizontal_spacing || {};
  refs.rows.min = String(rowLimits.min ?? 1);
  refs.rows.max = String(rowLimits.max ?? 16);
  refs.cols.min = String(colLimits.min ?? 1);
  refs.cols.max = String(colLimits.max ?? 16);
  refs.verticalSpacing.min = String(verticalLimits.min ?? 0.01);
  refs.verticalSpacing.max = String(verticalLimits.max ?? 10);
  refs.horizontalSpacing.min = String(horizontalLimits.min ?? 0.01);
  refs.horizontalSpacing.max = String(horizontalLimits.max ?? 10);
}

function syncAntennaArrayInputs() {
  const fixedForDeepMimo = state.mode === "deepmimo";
  for (const [kind, config] of [["tx", state.antenna.txArray], ["rx", state.antenna.rxArray]]) {
    const refs = antennaInputs(kind);
    writeAntennaArrayInputs(refs, fixedForDeepMimo ? DEEPMIMO_FIXED_ANTENNA_ARRAY : config);
    setAntennaInputsDisabled(refs, fixedForDeepMimo);
  }
}

function readAntennaArrayInputs() {
  if (state.mode === "deepmimo") {
    return;
  }
  for (const [kind, target] of [["tx", state.antenna.txArray], ["rx", state.antenna.rxArray]]) {
    const refs = antennaInputs(kind);
    target.pattern = refs.pattern.value;
    target.polarization = refs.polarization.value;
    target.numRows = Number(refs.rows.value);
    target.numCols = Number(refs.cols.value);
    target.verticalSpacing = Number(refs.verticalSpacing.value);
    target.horizontalSpacing = Number(refs.horizontalSpacing.value);
  }
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

  for (const [kind, config] of [["tx", state.antenna.txArray], ["rx", state.antenna.rxArray]]) {
    const refs = antennaInputs(kind);
    populateSelect(refs.pattern, patterns, config.pattern);
    populateSelect(refs.polarization, polarizations, config.polarization);
    applyAntennaArrayLimits(kind, antenna.limits || {});
  }
  syncAntennaArrayInputs();
}

function commonSolverConfig({includeTxArray = true} = {}) {
  return buildCommonSolverConfig({state, inputs, includeTxArray});
}

function linkSolverConfig() {
  return buildLinkSolverConfig({state, inputs});
}

function linkChannelConfig() {
  return buildLinkChannelConfig({state});
}

function linkSolvePayload({preview = false} = {}) {
  return buildLinkSolvePayload({state, inputs, preview});
}

function derivedSubcarrierSpacingHz() {
  const bandwidthHz = Number(state.link.advanced.bandwidthMhz) * 1e6;
  const fftSize = Number(state.link.advanced.tapFftSize);
  if (!Number.isFinite(bandwidthHz) || !Number.isFinite(fftSize) || fftSize <= 0) {
    return NaN;
  }
  return bandwidthHz / fftSize;
}

function syncDerivedChannelInputs() {
  const spacingHz = derivedSubcarrierSpacingHz();
  state.link.advanced.tapSubcarrierSpacingHz = spacingHz;
  inputs.linkTapSubcarrierSpacing.value = Number.isFinite(spacingHz) ? String(spacingHz) : "";
  inputs.linkSubcarrierSpacingKhz.value = Number.isFinite(spacingHz)
    ? (spacingHz / 1000).toFixed(2)
    : "";
}

function syncLinkAdvancedInputs() {
  const advanced = state.link.advanced;
  inputs.linkBandwidthMhz.value = String(advanced.bandwidthMhz);
  inputs.linkSamplesPerSrc.value = String(advanced.samplesPerSrc);
  inputs.linkMaxNumPaths.value = String(advanced.maxNumPathsPerSrc);
  inputs.linkSyntheticArray.checked = advanced.syntheticArray;
  inputs.linkDiffraction.checked = advanced.diffraction;
  inputs.linkEdgeDiffraction.checked = advanced.edgeDiffraction;
  inputs.linkDiffractionLitRegion.checked = advanced.diffractionLitRegion;
  inputs.linkComputeTaps.checked = advanced.computeTaps;
  inputs.linkTapLMin.value = String(advanced.tapLMin);
  inputs.linkTapLMax.value = String(advanced.tapLMax);
  inputs.linkTapFftSize.value = String(advanced.tapFftSize);
  syncDerivedChannelInputs();

  for (const input of [
    inputs.linkTapLMin,
    inputs.linkTapLMax,
  ]) {
    input.disabled = !advanced.computeTaps;
  }
}

function syncLivePreviewInputs() {
  const live = state.livePreview;
  inputs.livePreviewEnabled.checked = Boolean(live.enabled);
  inputs.livePreviewLinkSamples.value = String(live.link.previewSamplesPerSrc);
  inputs.livePreviewPathsDelay.value = String(live.link.pathsDelayS);
}

function readLivePreviewInputs() {
  const live = state.livePreview;
  live.enabled = Boolean(inputs.livePreviewEnabled.checked);
  live.link.previewSamplesPerSrc = Number(inputs.livePreviewLinkSamples.value);
  live.link.pathsDelayS = Number(inputs.livePreviewPathsDelay.value);
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
  linkController.invalidateLinkResult({clearPaths, clearOverlay});
}

function invalidateRadiomapResult({clearOverlay = true} = {}) {
  radiomapController.invalidateRadiomapResult({clearOverlay});
}

function invalidateMobilityResult({clearOverlay = true, clearPaths = true} = {}) {
  mobilityController.invalidateMobilityResult({clearOverlay, clearPaths});
}

function invalidateDeepMimoResult({clearOverlay = true} = {}) {
  deepMimoController.invalidateDeepMimoResult({clearOverlay});
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

function renderMobilityWaypoints() {
  ui.mobilityWaypointList.innerHTML = "";
  normalizeMobilityWaypointSelection();
  if (!state.mobility.trajectory.points.length) {
    const empty = document.createElement("div");
    empty.className = "waypointEmpty";
    empty.textContent = "No Rx waypoints yet";
    ui.mobilityWaypointList.appendChild(empty);
    return;
  }
  state.mobility.trajectory.points.forEach((point, index) => {
    const item = document.createElement("div");
    item.className = "waypointItem";
    item.classList.toggle("active", index === state.mobility.selectedWaypointIndex);
    item.addEventListener("click", () => {
      state.mobility.selectedWaypointIndex = index;
      renderAll();
    });
    const badge = document.createElement("span");
    badge.className = "waypointIndex";
    badge.textContent = String(index + 1);
    const coord = document.createElement("span");
    coord.className = "waypointCoord";
    coord.textContent = `[${formatCoord(point)}]`;
    const remove = document.createElement("button");
    remove.className = "waypointRemove";
    remove.type = "button";
    remove.textContent = "×";
    remove.setAttribute("aria-label", `Remove waypoint ${index + 1}`);
    remove.addEventListener("click", (event) => {
      event.stopPropagation();
      deleteMobilityWaypoint(index);
    });
    item.append(badge, coord, remove);
    ui.mobilityWaypointList.appendChild(item);
  });
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

function syncMobilityInputs() {
  inputs.mobilityVelocity.value = String(state.mobility.trajectory.velocityMps);
  inputs.mobilityTimeStep.value = String(state.mobility.trajectory.timeStepS);
  inputs.mobilityMaxSteps.value = String(state.mobility.trajectory.maxSteps);
  renderMobilityWaypoints();
  const estimate = mobilityEstimate();
  ui.mobilityEstimate.textContent = Number.isFinite(estimate.duration)
    ? `${estimate.distance.toFixed(1)} m | ${estimate.duration.toFixed(1)} s | ${estimate.steps} / ${estimate.maxSteps} steps`
    : "--";
  renderMobilityTrajectoryPreview();
}

function syncNumericInputs() {
  const [ltx, lty, ltz] = state.link.tx;
  const [lrx, lry, lrz] = state.link.rx;
  const [mtx, mty, mtz] = state.mobility.tx;
  const [mrx, mry, mrz] = state.mobility.rx;
  const [rtx, rty, rtz] = state.radiomap.tx;
  const [sx, sy] = state.radiomap.surface.size;
  const heightOffset = state.radiomap.surface.heightOffset;
  const densityLevel = state.radiomap.surface.densityLevel;
  const cellSize = state.radiomap.surface.cellSize;
  const samplesPerTx = state.radiomap.solver.samplesPerTx;
  const colorMinDb = state.radiomap.display.colorMinDb;
  const colorMaxDb = state.radiomap.display.colorMaxDb;
  const colormap = state.radiomap.display.colormap;
  const [dtx, dty, dtz] = state.deepmimo.tx;
  const dmGrid = state.deepmimo.rxGrid;
  const dmSolver = state.deepmimo.solver;

  inputs.linkTxX.value = ltx.toFixed(1);
  inputs.linkTxY.value = lty.toFixed(1);
  inputs.linkTxZ.value = ltz.toFixed(1);
  inputs.linkRxX.value = lrx.toFixed(1);
  inputs.linkRxY.value = lry.toFixed(1);
  inputs.linkRxZ.value = lrz.toFixed(1);
  inputs.mobilityTxX.value = mtx.toFixed(1);
  inputs.mobilityTxY.value = mty.toFixed(1);
  inputs.mobilityTxZ.value = mtz.toFixed(1);
  inputs.mobilityRxX.value = mrx.toFixed(1);
  inputs.mobilityRxY.value = mry.toFixed(1);
  inputs.mobilityRxZ.value = mrz.toFixed(1);
  const clearanceScope = state.deviceControl.activeTarget === "rm-tx"
    ? "radiomap"
    : state.deviceControl.activeTarget === "deepmimo-tx"
      ? "deepmimo"
      : state.deviceControl.activeTarget === "mobility-tx" || state.deviceControl.activeTarget === "mobility-rx"
        ? "mobility"
      : "link";
  inputs.linkSurfaceClearance.value = String(surfaceClearanceM(clearanceScope));
  inputs.rmTxX.value = rtx.toFixed(1);
  inputs.rmTxY.value = rty.toFixed(1);
  inputs.rmTxZ.value = rtz.toFixed(1);
  inputs.rmSizeX.value = sx.toFixed(1);
  inputs.rmSizeY.value = sy.toFixed(1);
  inputs.rmHeightOffset.value = heightOffset.toFixed(1);
  inputs.rmSamplesPerTx.value = String(samplesPerTx);
  inputs.rmCellSize.value = cellSize == null ? "" : String(cellSize);
  inputs.rmDensityLevel.value = String(densityLevel);
  inputs.rmColormap.value = normalizeColormapName(colormap);
  inputs.rmColorMin.value = colorMinDb.toFixed(0);
  inputs.rmColorMax.value = colorMaxDb.toFixed(0);
  inputs.deepMimoScenarioName.value = state.deepmimo.export.scenarioName;
  inputs.deepMimoTxX.value = dtx.toFixed(1);
  inputs.deepMimoTxY.value = dty.toFixed(1);
  inputs.deepMimoTxZ.value = dtz.toFixed(1);
  const dmBounds = deepMimoRoiBounds();
  inputs.deepMimoRoiCenterX.value = dmBounds ? dmBounds.center[0].toFixed(1) : "";
  inputs.deepMimoRoiCenterY.value = dmBounds ? dmBounds.center[1].toFixed(1) : "";
  inputs.deepMimoRoiWidth.value = dmBounds ? dmBounds.size[0].toFixed(1) : "";
  inputs.deepMimoRoiLength.value = dmBounds ? dmBounds.size[1].toFixed(1) : "";
  inputs.deepMimoGridSpacing.value = String(dmGrid.spacing);
  inputs.deepMimoRxHeight.value = String(dmGrid.height);
  inputs.deepMimoMaxReceivers.value = String(dmGrid.maxReceivers);
  inputs.deepMimoChunkSize.value = String(dmGrid.chunkSize);
  inputs.deepMimoFilterBuildings.checked = Boolean(dmGrid.filterBuildings);
  inputs.deepMimoSamplesPerSrc.value = String(dmSolver.samplesPerSrc);
  inputs.deepMimoMaxPaths.value = String(dmSolver.maxNumPathsPerSrc);
  syncAntennaArrayInputs();
  syncLinkAdvancedInputs();
  syncLivePreviewInputs();
  syncMobilityInputs();
}


function setVector(target, values) {
  target.splice(0, target.length, ...values.map((value) => Number(value)));
}

function setLogicalAndVisual(logicalTarget, visualTarget, logicalValues, visualValues = logicalValues) {
  setVector(logicalTarget, logicalValues);
  setVector(visualTarget, visualValues);
}

function surfaceClearanceM(scope = "link") {
  const value = Number(
    scope === "radiomap"
      ? state.radiomap.surfaceClearanceM
      : scope === "deepmimo"
        ? state.deepmimo.surfaceClearanceM
        : scope === "mobility"
          ? state.mobility.surfaceClearanceM
        : state.link.surfaceClearanceM,
  );
  if (!Number.isFinite(value)) {
    return 1.5;
  }
  return Math.max(0, Math.min(50, value));
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

function linkPickPosition(pick) {
  return pickPositionWithSurfaceClearance(pick, "link");
}

function mobilityPickPosition(pick) {
  return pickPositionWithSurfaceClearance(pick, "mobility");
}

function radiomapTxPickPosition(pick) {
  return pickPositionWithSurfaceClearance(pick, "radiomap");
}

function deepMimoTxPickPosition(pick) {
  return pickPositionWithSurfaceClearance(pick, "deepmimo");
}

function readSurfaceClearanceInput(scope = state.deviceControl.activeTarget === "rm-tx"
  ? "radiomap"
  : state.deviceControl.activeTarget === "deepmimo-tx"
    ? "deepmimo"
    : state.deviceControl.activeTarget === "mobility-tx" || state.deviceControl.activeTarget === "mobility-rx"
      ? "mobility"
    : "link") {
  const clearance = Number(inputs.linkSurfaceClearance.value);
  const nextClearance = Number.isFinite(clearance)
    ? Math.max(0, Math.min(50, clearance))
    : 1.5;
  if (scope === "radiomap") {
    state.radiomap.surfaceClearanceM = nextClearance;
  } else if (scope === "deepmimo") {
    state.deepmimo.surfaceClearanceM = nextClearance;
  } else if (scope === "mobility") {
    state.mobility.surfaceClearanceM = nextClearance;
  } else {
    state.link.surfaceClearanceM = nextClearance;
  }
}

function syncViewerMarkers() {
  if (state.mode === "radiomap") {
    getViewer().setTx(state.radiomap.txVisual);
    getViewer().setRx(null);
    return;
  }
  if (state.mode === "deepmimo") {
    getViewer().setTx(state.deepmimo.txVisual);
    getViewer().setRx(null);
    return;
  }
  if (state.mode === "mobility") {
    getViewer().setTx(state.mobility.txVisual);
    const sample = state.mobility.result?.samples?.[state.mobility.selectedStep];
    getViewer().setRx(sample?.rx_position || state.mobility.rxVisual);
    return;
  }
  getViewer().setTx(state.link.txVisual);
  getViewer().setRx(state.link.rxVisual);
}

function syncModeVisuals() {
  if (state.mode !== "radiomap") {
    getViewer().clearRadiomap();
  }
  if (state.mode !== "deepmimo") {
    getViewer().clearDeepMimoRoi();
  }
  if (state.mode !== "mobility") {
    getViewer().clearMobility();
  }
  if (state.mode !== "link" && state.mode !== "mobility") {
    getViewer().clearPaths();
  }
}

function markerRadiusForPickTarget(target) {
  if (target === "deepmimo-roi") {
    return 0;
  }
  return target === "link-rx" || target === "mobility-rx"
    ? getViewer().rxMarkerRadius
    : getViewer().txMarkerRadius;
}

function readLinkAdvancedInputs() {
  state.link.advanced.samplesPerSrc = Number(inputs.linkSamplesPerSrc.value);
  state.link.advanced.maxNumPathsPerSrc = Number(inputs.linkMaxNumPaths.value);
  state.link.advanced.bandwidthMhz = Number(inputs.linkBandwidthMhz.value);
  state.link.advanced.syntheticArray = inputs.linkSyntheticArray.checked;
  state.link.advanced.diffraction = inputs.linkDiffraction.checked;
  state.link.advanced.edgeDiffraction = inputs.linkEdgeDiffraction.checked;
  state.link.advanced.diffractionLitRegion = inputs.linkDiffractionLitRegion.checked;
  state.link.advanced.computeTaps = inputs.linkComputeTaps.checked;
  state.link.advanced.tapLMin = Number(inputs.linkTapLMin.value);
  state.link.advanced.tapLMax = Number(inputs.linkTapLMax.value);
  state.link.advanced.tapFftSize = Number(inputs.linkTapFftSize.value);
  readAntennaArrayInputs();
  syncDerivedChannelInputs();
  syncLinkAdvancedInputs();
}

function readLinkInputs() {
  setLogicalAndVisual(state.link.tx, state.link.txVisual, [
    Number(inputs.linkTxX.value),
    Number(inputs.linkTxY.value),
    Number(inputs.linkTxZ.value),
  ]);
  setLogicalAndVisual(state.link.rx, state.link.rxVisual, [
    Number(inputs.linkRxX.value),
    Number(inputs.linkRxY.value),
    Number(inputs.linkRxZ.value),
  ]);
  readSurfaceClearanceInput("link");
  readLinkAdvancedInputs();
}

function readRadiomapInputs() {
  setLogicalAndVisual(state.radiomap.tx, state.radiomap.txVisual, [
    Number(inputs.rmTxX.value),
    Number(inputs.rmTxY.value),
    Number(inputs.rmTxZ.value),
  ]);
  state.radiomap.surface.size = [Number(inputs.rmSizeX.value), Number(inputs.rmSizeY.value)];
  state.radiomap.surface.heightOffset = Number(inputs.rmHeightOffset.value);
  state.radiomap.solver.samplesPerTx = Number(inputs.rmSamplesPerTx.value);
  const cellSizeText = inputs.rmCellSize.value.trim();
  state.radiomap.surface.cellSize = cellSizeText === "" ? null : Number(cellSizeText);
  state.radiomap.surface.densityLevel = Number(inputs.rmDensityLevel.value);
  state.radiomap.display.colormap = normalizeColormapName(inputs.rmColormap.value);
  const colorMinDb = Number(inputs.rmColorMin.value);
  const colorMaxDb = Number(inputs.rmColorMax.value);
  if (Number.isFinite(colorMinDb) && Number.isFinite(colorMaxDb) && colorMinDb < colorMaxDb) {
    state.radiomap.display.colorMinDb = colorMinDb;
    state.radiomap.display.colorMaxDb = colorMaxDb;
  }
  readAntennaArrayInputs();
}

function readDeepMimoInputs() {
  setLogicalAndVisual(state.deepmimo.tx, state.deepmimo.txVisual, [
    Number(inputs.deepMimoTxX.value),
    Number(inputs.deepMimoTxY.value),
    Number(inputs.deepMimoTxZ.value),
  ]);
  readSurfaceClearanceInput("deepmimo");
  readDeepMimoRoiInputs();
  state.deepmimo.rxGrid.spacing = Number(inputs.deepMimoGridSpacing.value);
  state.deepmimo.rxGrid.height = Number(inputs.deepMimoRxHeight.value);
  state.deepmimo.rxGrid.maxReceivers = Number(inputs.deepMimoMaxReceivers.value);
  state.deepmimo.rxGrid.chunkSize = Number(inputs.deepMimoChunkSize.value);
  state.deepmimo.rxGrid.filterBuildings = inputs.deepMimoFilterBuildings.checked;
  state.deepmimo.solver.samplesPerSrc = Number(inputs.deepMimoSamplesPerSrc.value);
  state.deepmimo.solver.maxNumPathsPerSrc = Number(inputs.deepMimoMaxPaths.value);
  state.deepmimo.export.scenarioName = inputs.deepMimoScenarioName.value.trim() || "hku_deepmimo_roi";
}

function readMobilityInputs() {
  setLogicalAndVisual(state.mobility.tx, state.mobility.txVisual, [
    Number(inputs.mobilityTxX.value),
    Number(inputs.mobilityTxY.value),
    Number(inputs.mobilityTxZ.value),
  ]);
  setLogicalAndVisual(state.mobility.rx, state.mobility.rxVisual, [
    Number(inputs.mobilityRxX.value),
    Number(inputs.mobilityRxY.value),
    Number(inputs.mobilityRxZ.value),
  ]);
  readSurfaceClearanceInput("mobility");
  readLinkAdvancedInputs();
  state.mobility.trajectory.velocityMps = Number(inputs.mobilityVelocity.value);
  state.mobility.trajectory.timeStepS = Number(inputs.mobilityTimeStep.value);
  state.mobility.trajectory.maxSteps = Number(inputs.mobilityMaxSteps.value);
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
  linkResultView.syncLivePreviewStatusUi();
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

function renderLinkChannel(channel) {
  linkResultView.renderLinkChannel(channel);
}

function renderLinkResult() {
  linkResultView.renderLinkResult();
}

function clearPathSelection() {
  linkResultView.clearPathSelection();
}

function hidePathDetails() {
  linkResultView.hidePathDetails();
}

function renderPathDetails(paths, selectedIndex) {
  linkResultView.renderPathDetails(paths, selectedIndex);
}

function renderPathSelection(paths, selectedIndex, onSelect, summary = null) {
  linkResultView.renderPathSelection(paths, selectedIndex, onSelect, summary);
}

function scrollSelectedPathDetailsIntoView() {
  linkResultView.scrollSelectedPathDetailsIntoView();
}

function stopMobilityPlayback() {
  mobilityResultView.stopMobilityPlayback();
}

function selectMobilityStep(index) {
  mobilityResultView.selectMobilityStep(index);
}

function startMobilityPlayback() {
  mobilityResultView.startMobilityPlayback();
}

function renderMobilityResult() {
  mobilityResultView.renderMobilityResult();
}

function renderRadiomapResult() {
  radiomapResultView.renderRadiomapResult();
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

function readDeepMimoRoiInputs() {
  const centerX = Number(inputs.deepMimoRoiCenterX.value);
  const centerY = Number(inputs.deepMimoRoiCenterY.value);
  const width = Number(inputs.deepMimoRoiWidth.value);
  const length = Number(inputs.deepMimoRoiLength.value);
  if (![centerX, centerY, width, length].every(Number.isFinite) || width <= 0 || length <= 0) {
    return;
  }
  const visualZ = Number.isFinite(Number(state.deepmimo.roi.visualZ))
    ? Number(state.deepmimo.roi.visualZ)
    : 0;
  setDeepMimoRoiFromCenter(centerX, centerY, width, length, visualZ);
}

function deepMimoReceiverEstimate(bounds = deepMimoRoiBounds()) {
  return estimateDeepMimoReceivers(bounds, state.deepmimo.rxGrid);
}

function deepMimoPayload() {
  readDeepMimoInputs();
  const bounds = deepMimoRoiBounds();
  const receiverEstimate = deepMimoReceiverEstimate(bounds);
  return buildDeepMimoPayload({state, inputs, bounds, receiverEstimate, formatCount});
}

function renderDeepMimoState() {
  deepMimoDatasetView.renderDeepMimoState();
}

function addDeepMimoDataset(job) {
  deepMimoDatasetView.addDeepMimoDataset(job);
}

function renderDeepMimoDatasetTray() {
  deepMimoDatasetView.renderDeepMimoDatasetTray();
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
}

function finishDeepMimoRoiDrag(position) {
  updateDeepMimoRoiDrag(position);
  state.deepmimo.roi.pickingStep = "a";
  state.deepmimo.message = deepMimoRoiBounds() ? "ROI updated" : "Drag a larger ROI";
  renderDeepMimoState();
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
}

async function cancelDeepMimoExport(jobId) {
  return deepMimoController.cancelDeepMimoExport(jobId);
}

async function runDeepMimo() {
  return deepMimoController.runDeepMimo();
}
async function runLinkSolve() {
  return linkController.runLinkSolve();
}

function cancelLivePreview({clearStatus = true} = {}) {
  linkController.cancelLivePreview({clearStatus});
}

function radiomapSurfacePayload() {
  return buildRadiomapSurfacePayload({state});
}

function radiomapJobPayload() {
  return buildRadiomapJobPayload({state, inputs});
}

function mobilityJobPayload() {
  return buildMobilityJobPayload({state, inputs});
}

function handleLivePreviewDeviceUpdate(target, phase = "change") {
  linkController.handleLivePreviewDeviceUpdate(target, phase);
}

function resetMobilityTrajectoryFromRx() {
  state.mobility.trajectory.points = [];
  state.mobility.selectedWaypointIndex = -1;
  invalidateMobilityResult();
}

function addCurrentRxWaypoint() {
  readMobilityInputs();
  const point = [...state.mobility.rx];
  const points = state.mobility.trajectory.points;
  const last = points[points.length - 1];
  if (last && Math.hypot(point[0] - last[0], point[1] - last[1], point[2] - last[2]) < 1e-6) {
    state.mobility.selectedWaypointIndex = points.length - 1;
    renderAll();
    return;
  }
  points.push(point);
  state.mobility.selectedWaypointIndex = points.length - 1;
  invalidateMobilityResult();
  renderAll();
}

async function runMobility() {
  return mobilityController.runMobility();
}

async function runRadiomap() {
  return radiomapController.runRadiomap();
}

function applyPick(pick) {
  if (!pick || !state.pickTarget) {
    return;
  }

  if (state.pickTarget === "link-tx") {
    const position = linkPickPosition(pick);
    setLogicalAndVisual(state.link.tx, state.link.txVisual, position);
    invalidateLinkResult();
  } else if (state.pickTarget === "link-rx") {
    const position = linkPickPosition(pick);
    setLogicalAndVisual(state.link.rx, state.link.rxVisual, position);
    invalidateLinkResult();
  } else if (state.pickTarget === "mobility-tx") {
    const position = mobilityPickPosition(pick);
    setLogicalAndVisual(state.mobility.tx, state.mobility.txVisual, position);
    invalidateMobilityResult();
  } else if (state.pickTarget === "mobility-rx") {
    const position = mobilityPickPosition(pick);
    setLogicalAndVisual(state.mobility.rx, state.mobility.rxVisual, position);
    invalidateMobilityResult();
  } else if (state.pickTarget === "rm-tx") {
    const position = radiomapTxPickPosition(pick);
    setLogicalAndVisual(state.radiomap.tx, state.radiomap.txVisual, position);
    invalidateRadiomapResult();
  } else if (state.pickTarget === "deepmimo-tx") {
    const position = deepMimoTxPickPosition(pick);
    setLogicalAndVisual(state.deepmimo.tx, state.deepmimo.txVisual, position);
    invalidateDeepMimoResult();
  } else if (state.pickTarget === "deepmimo-roi") {
    const position = Array.isArray(pick.surfacePosition) ? pick.surfacePosition : pick.logicalPosition;
    setDeepMimoRoiCorner(position);
  }

  renderAll();
}

  return {
    applyRtCapabilities,
    commonSolverConfig,
    linkSolverConfig,
    linkChannelConfig,
    syncNumericInputs,
    syncViewerMarkers,
    syncModeVisuals,
    markerRadiusForPickTarget,
    readAntennaArrayInputs,
    readLinkInputs,
    readSurfaceClearanceInput,
    readLivePreviewInputs,
    readMobilityInputs,
    readRadiomapInputs,
    invalidateLinkResult,
    invalidateRadiomapResult,
    invalidateMobilityResult,
    invalidateDeepMimoResult,
    readDeepMimoInputs,
    rerenderRadiomapOverlay,
    renderLinkResult,
    renderMobilityResult,
    renderMobilityTrajectoryPreview,
    renderRadiomapResult,
    renderDeepMimoState,
    renderDeepMimoDatasetTray,
    runLinkSolve,
    runMobility,
    runRadiomap,
    runDeepMimo,
    setDeepMimoRoiCorner,
    startDeepMimoRoiDrag,
    updateDeepMimoRoiDrag,
    finishDeepMimoRoiDrag,
    clearDeepMimoRoi,
    addCurrentRxWaypoint,
    deleteMobilityWaypoint,
    resetMobilityTrajectoryFromRx,
    selectMobilityStep,
    startMobilityPlayback,
    stopMobilityPlayback,
    cancelLivePreview,
    handleLivePreviewDeviceUpdate,
    applyPick,
  };
}
