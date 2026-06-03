import {colormapGradient, normalizeColormapName} from "/js/colormaps.js";

const SVG_NS = "http://www.w3.org/2000/svg";
const TERMINAL_DEEPMIMO_STATUSES = new Set(["succeeded", "failed", "cancelled"]);
const DEEPMIMO_FIXED_ANTENNA_ARRAY = Object.freeze({
  numRows: 1,
  numCols: 1,
  verticalSpacing: 0.5,
  horizontalSpacing: 0.5,
  pattern: "iso",
  polarization: "V",
});

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

  let linkRunOwner = null;
  let radiomapRunOwner = null;
  let mobilityRunOwner = null;
  let deepMimoRunOwner = null;

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

function normalizeAntennaArrayConfig(config = {}) {
  return {
    numRows: Number(config.num_rows ?? config.numRows ?? 1),
    numCols: Number(config.num_cols ?? config.numCols ?? 1),
    verticalSpacing: Number(config.vertical_spacing ?? config.verticalSpacing ?? 0.5),
    horizontalSpacing: Number(config.horizontal_spacing ?? config.horizontalSpacing ?? 0.5),
    pattern: String(config.pattern ?? "iso"),
    polarization: String(config.polarization ?? "V"),
  };
}

function antennaArrayPayload(arrayConfig) {
  return {
    num_rows: Number(arrayConfig.numRows),
    num_cols: Number(arrayConfig.numCols),
    vertical_spacing: Number(arrayConfig.verticalSpacing),
    horizontal_spacing: Number(arrayConfig.horizontalSpacing),
    pattern: String(arrayConfig.pattern),
    polarization: String(arrayConfig.polarization),
  };
}

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
  const solverConfig = {
    frequency_hz: Number(inputs.cfgFrequency.value) * 1e9,
    max_depth: Number(inputs.cfgMaxDepth.value),
    los: inputs.cfgLos.checked,
    specular_reflection: inputs.cfgSpecular.checked,
    diffuse_reflection: inputs.cfgDiffuse.checked,
    refraction: inputs.cfgRefraction.checked,
    seed: Number(inputs.cfgSeed.value),
  };
  if (includeTxArray) {
    solverConfig.tx_array = antennaArrayPayload(state.antenna.txArray);
  }
  return solverConfig;
}

function linkSolverConfig() {
  const advanced = state.link.advanced;
  return {
    ...commonSolverConfig(),
    samples_per_src: advanced.samplesPerSrc,
    max_num_paths_per_src: advanced.maxNumPathsPerSrc,
    synthetic_array: advanced.syntheticArray,
    diffraction: advanced.diffraction,
    edge_diffraction: advanced.edgeDiffraction,
    diffraction_lit_region: advanced.diffractionLitRegion,
    rx_array: antennaArrayPayload(state.antenna.rxArray),
  };
}

function linkChannelConfig() {
  const advanced = state.link.advanced;
  return {
    compute_taps: advanced.computeTaps,
    l_min: advanced.tapLMin,
    l_max: advanced.tapLMax,
    fft_size: advanced.tapFftSize,
    subcarrier_spacing_hz: advanced.tapSubcarrierSpacingHz,
  };
}

function linkSolvePayload({preview = false} = {}) {
  const solver = linkSolverConfig();
  const channel = linkChannelConfig();
  if (preview) {
    solver.samples_per_src = Math.max(1, Math.floor(Number(state.livePreview.link.previewSamplesPerSrc)));
    solver.max_num_paths_per_src = Math.min(Number(solver.max_num_paths_per_src), 10000);
    channel.compute_taps = false;
  }
  return {
    tx: {position: state.link.tx, orientation: [0, 0, 0]},
    rx: {position: state.link.rx, orientation: [0, 0, 0]},
    solver,
    channel,
  };
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

function resetMobilityResultState() {
  stopMobilityPlayback();
  state.mobility.result = null;
  state.mobility.selectedStep = 0;
  state.mobility.selectedPath = -1;
}

function invalidateLinkResult({clearPaths = true, clearOverlay = true} = {}) {
  cancelLivePreview();
  state.link.generation += 1;
  state.link.result = null;
  state.link.selectedPath = -1;
  if (clearOverlay && linkRunOwner) {
    hideOverlay(linkRunOwner);
  }
  linkRunOwner = null;
  if (clearPaths && state.mode === "link") {
    getViewer().clearPaths();
  }
}

function invalidateRadiomapResult({clearOverlay = true} = {}) {
  state.radiomap.generation += 1;
  state.radiomap.jobId = null;
  state.radiomap.result = null;
  state.radiomap.status = "Idle";
  if (clearOverlay && radiomapRunOwner) {
    hideOverlay(radiomapRunOwner);
  }
  radiomapRunOwner = null;
  if (clearOverlay) {
    getViewer().clearRadiomap();
  }
}

function invalidateMobilityResult({clearOverlay = true, clearPaths = true} = {}) {
  state.mobility.generation += 1;
  state.mobility.jobId = null;
  state.mobility.status = "Idle";
  resetMobilityResultState();
  if (clearPaths && state.mode === "mobility") {
    getViewer().clearPaths();
  }
  if (clearOverlay && mobilityRunOwner) {
    hideOverlay(mobilityRunOwner);
  }
  mobilityRunOwner = null;
  renderMobilityTrajectoryPreview();
}

function invalidateDeepMimoResult({clearOverlay = true} = {}) {
  state.deepmimo.generation += 1;
  state.deepmimo.jobId = null;
  state.deepmimo.result = null;
  state.deepmimo.status = "Idle";
  state.deepmimo.progress = 0;
  state.deepmimo.message = "Idle";
  state.deepmimo.pendingDataset = null;
  if (clearOverlay && deepMimoRunOwner) {
    hideOverlay(deepMimoRunOwner);
  }
  deepMimoRunOwner = null;
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

function formatFixed(value, digits = 2, suffix = "") {
  return Number.isFinite(value) ? `${value.toFixed(digits)}${suffix}` : "N/A";
}

function formatCount(value) {
  return Number.isFinite(value) ? Math.round(value).toLocaleString() : "N/A";
}

function renderRadiomapColorbar(visible) {
  ui.rmColorbarSection.classList.toggle("hidden", !visible);
  ui.rmColorbarSection.setAttribute("aria-hidden", String(!visible));
  if (!visible) {
    return;
  }
  const {minDb, maxDb, colormap} = radiomapColorRange();
  ui.rmColorbar.style.background = colormapGradient(colormap);
  ui.rmColormapLabel.textContent = `Colormap: ${colormap}`;
  ui.rmColorbarRange.textContent = `Display limits: ${minDb.toFixed(0)} .. ${maxDb.toFixed(0)} dB`;
  ui.rmColorbarMin.textContent = `${minDb.toFixed(0)} dB`;
  ui.rmColorbarMax.textContent = `${maxDb.toFixed(0)} dB`;
}

function formatStatus(status) {
  const text = String(status || "Idle");
  return text ? `${text[0].toUpperCase()}${text.slice(1)}` : "Idle";
}

function formatArea(size) {
  const [width, height] = Array.isArray(size) ? size : [];
  return `${formatFixed(Number(width), 1)} x ${formatFixed(Number(height), 1, " m")}`;
}

function hideRadiomapDockContent() {
  ui.radiomapResult.style.display = "none";
  ui.radiomapResolutionSection.classList.add("hidden");
  ui.radiomapResolutionSection.setAttribute("aria-hidden", "true");
  renderRadiomapColorbar(false);
}

function livePreviewStatusAppliesToCurrentMode() {
  return state.livePreview.mode === "link" && state.mode === "link";
}

function syncLivePreviewStatusUi() {
  const visible = state.livePreview.status !== "Idle" && livePreviewStatusAppliesToCurrentMode();
  ui.livePreviewStatus.classList.toggle("hidden", !visible);
  ui.livePreviewStatus.textContent = visible ? state.livePreview.status : "Idle";
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

function formatExp(value, digits = 3) {
  return Number.isFinite(value) ? value.toExponential(digits) : "N/A";
}

function describeInteractionSequence(path) {
  return path.interaction_sequence?.length ? path.interaction_sequence.join(" -> ") : "LOS";
}

function pathVariantCount(path) {
  const count = Number(path.raw_path_count);
  return Number.isFinite(count) && count > 1 ? Math.round(count) : 0;
}

const PATH_TYPE_LABELS = {
  LOS: "Line-of-sight",
  SPECULAR: "Specular",
  DIFFUSE: "Diffuse",
  DIFFRACTION: "Diffraction",
  REFRACTION: "Refraction",
  MIXED: "Mixed interactions",
};

function formatRawPathIndices(path) {
  const indices = Array.isArray(path.raw_path_indices) ? path.raw_path_indices : [];
  return indices.length ? indices.map((index) => String(index)).join(", ") : "N/A";
}

function pathTypeKey(path) {
  return String(path.type || "PATH").toUpperCase();
}

function formatPathTypeLabel(path) {
  return PATH_TYPE_LABELS[pathTypeKey(path)] || pathTypeKey(path);
}

function pathTypeClass(path) {
  return pathTypeKey(path).toLowerCase().replace(/[^a-z0-9]+/g, "-");
}

function formatPathGainValue(path) {
  return formatFixed(path.path_gain_db, 2, " dB");
}

function formatPathDelayValue(path) {
  return formatFixed(path.delay_ns, 2, " ns");
}

function formatPathSelectionCount(paths, summary = null) {
  const displayCount = Number(summary?.display_paths ?? summary?.valid_paths ?? paths.length);
  const count = Number.isFinite(displayCount) ? Math.max(0, Math.round(displayCount)) : paths.length;
  return `${count} ${count === 1 ? "path" : "paths"}`;
}

function formatPathSelectionMeta(paths, summary = null) {
  const displayCount = Number(summary?.display_paths ?? summary?.valid_paths ?? paths.length);
  const count = Number.isFinite(displayCount) ? Math.max(0, Math.round(displayCount)) : paths.length;
  const rawCount = Number(summary?.raw_valid_paths);
  if (Number.isFinite(rawCount) && rawCount > count) {
    const solverPaths = Math.round(rawCount);
    const summaryMerged = Number(summary?.deduplicated_paths);
    const mergedCount = Number.isFinite(summaryMerged)
      ? Math.max(0, Math.round(summaryMerged))
      : Math.max(0, solverPaths - count);
    const mergedLabel = mergedCount > 0
      ? ` · ${mergedCount} merged ${mergedCount === 1 ? "variant" : "variants"}`
      : "";
    return `${solverPaths} solver ${solverPaths === 1 ? "path" : "paths"}${mergedLabel}`;
  }
  return "";
}

function makePathText(className, text) {
  const element = document.createElement("span");
  element.className = className;
  element.textContent = text;
  return element;
}

function makePathMetric(label, value) {
  const metric = document.createElement("span");
  metric.className = "pathMetric";
  metric.append(makePathText("pathMetricLabel", label), makePathText("pathMetricValue", value));
  return metric;
}

function hidePathDetails() {
  ui.pathDetailList.innerHTML = "";
  ui.pathDetailTitle.textContent = "Selected Path";
  ui.pathDetailSection.classList.add("hidden");
  ui.pathDetailSection.setAttribute("aria-hidden", "true");
}

function scrollSelectedPathDetailsIntoView() {
  requestAnimationFrame(() => {
    if (!ui.pathDetailSection.classList.contains("hidden")) {
      ui.pathDetailSection.scrollIntoView({block: "nearest"});
    }
  });
}

function renderPathDetails(paths, selectedIndex) {
  if (!paths.length) {
    hidePathDetails();
    return;
  }
  if (selectedIndex < 0 || selectedIndex >= paths.length) {
    hidePathDetails();
    return;
  }

  ui.pathDetailList.innerHTML = "";
  ui.pathDetailTitle.textContent = "Selected Path";
  ui.pathDetailSection.classList.remove("hidden");
  ui.pathDetailSection.setAttribute("aria-hidden", "false");
  const path = paths[selectedIndex];
  const card = document.createElement("div");
  card.className = "pathDetailCard active";

  const head = document.createElement("div");
  head.className = "pathDetailHead";
  const title = document.createElement("div");
  title.className = "pathDetailTitle";
  title.textContent = `Path ${selectedIndex + 1}`;
  const typeTag = document.createElement("span");
  typeTag.className = "pathTypeTag";
  typeTag.textContent = formatPathTypeLabel(path);
  head.append(title, typeTag);

  const grid = document.createElement("div");
  grid.className = "pathDetailGrid";

  const addField = (label, value, wide = false) => {
    const item = document.createElement("div");
    item.className = "pathDetailItem" + (wide ? " wide" : "");
    const key = document.createElement("b");
    key.textContent = label;
    const text = document.createElement("span");
    text.textContent = value;
    item.append(key, text);
    grid.appendChild(item);
  };

  addField("Interaction Chain", describeInteractionSequence(path), true);
  const variants = pathVariantCount(path);
  if (variants > 1) {
    addField("Variants", `${variants} variants`);
    addField("Raw Paths", formatRawPathIndices(path), true);
    addField("Representative", String(path.representative_path_index ?? path.path_index ?? "N/A"));
  }
  addField("Path Gain", formatFixed(path.path_gain_db, 2, " dB"));
  addField("Power (Linear)", formatExp(path.path_gain_linear));
  addField("Array Pairs", String(path.array_pair_count ?? 1));
  addField("Strongest Pair", formatFixed(path.strongest_pair_power_db, 2, " dB"));
  addField("|a|", formatExp(path.coefficient_abs));
  addField("Phase", formatFixed(path.coefficient_phase_deg, 1, " deg"));
  addField("Delay", formatFixed(path.delay_ns, 2, " ns"));
  addField("Length", formatFixed(path.path_length_m, 2, " m"));
  addField("Doppler", formatFixed(path.doppler_hz, 2, " Hz"));
  addField(
    "AoD (zen/azi)",
    `${formatFixed(path.departure_zenith_deg, 1)} / ${formatFixed(path.departure_azimuth_deg, 1)} deg`,
  );
  addField(
    "AoA (zen/azi)",
    `${formatFixed(path.arrival_zenith_deg, 1)} / ${formatFixed(path.arrival_azimuth_deg, 1)} deg`,
  );
  addField("Re(a)", formatExp(path.coefficient_real));
  addField("Im(a)", formatExp(path.coefficient_imag));

  card.append(head, grid);
  ui.pathDetailList.appendChild(card);
}

function clearPathSelection() {
  ui.pathButtons.innerHTML = "";
  ui.pathSelectionCount.textContent = "0 paths";
  ui.pathSelectionMeta.textContent = "";
  ui.pathSelectionMeta.classList.add("hidden");
  ui.pathSelectionSection.classList.add("hidden");
  ui.pathSelectionSection.setAttribute("aria-hidden", "true");
}

function scrollSelectedPathRowIntoView() {
  requestAnimationFrame(() => {
    const active = ui.pathButtons.querySelector(".pathRow.active, .pathAllButton.active");
    if (active) {
      active.scrollIntoView({block: "nearest"});
    }
  });
}

function renderPathSelection(paths, selectedIndex, onSelect, summary = null) {
  ui.pathButtons.innerHTML = "";
  if (!paths.length) {
    clearPathSelection();
    return;
  }

  ui.pathSelectionSection.classList.remove("hidden");
  ui.pathSelectionSection.setAttribute("aria-hidden", "false");
  ui.pathSelectionCount.textContent = formatPathSelectionCount(paths, summary);
  const meta = formatPathSelectionMeta(paths, summary);
  ui.pathSelectionMeta.textContent = meta;
  ui.pathSelectionMeta.classList.toggle("hidden", !meta);

  const allButton = document.createElement("button");
  allButton.type = "button";
  allButton.className = "pathAllButton" + (selectedIndex === -1 ? " active" : "");
  allButton.setAttribute("aria-pressed", String(selectedIndex === -1));
  allButton.textContent = "Show all paths";
  allButton.addEventListener("click", () => onSelect(-1));
  ui.pathButtons.appendChild(allButton);

  paths.forEach((path, index) => {
    const variants = pathVariantCount(path);
    const row = document.createElement("button");
    row.type = "button";
    row.className = "pathRow" + (selectedIndex === index ? " active" : "");
    row.setAttribute("aria-pressed", String(selectedIndex === index));
    row.setAttribute(
      "aria-label",
      `Path ${index + 1}, ${formatPathTypeLabel(path)}, path gain ${formatPathGainValue(path)}, delay ${formatPathDelayValue(path)}`,
    );
    row.addEventListener("click", () => onSelect(index));

    const head = document.createElement("span");
    head.className = "pathRowHead";
    head.appendChild(makePathText("pathRowName", `Path ${index + 1}`));
    const badges = document.createElement("span");
    badges.className = "pathRowBadges";
    badges.appendChild(makePathText(`pathRowBadge type-${pathTypeClass(path)}`, formatPathTypeLabel(path)));
    if (variants > 1) {
      badges.appendChild(makePathText("pathRowBadge pathVariantBadge", `${variants} variants`));
    }
    head.appendChild(badges);

    const metrics = document.createElement("span");
    metrics.className = "pathRowMetrics";
    metrics.append(
      makePathMetric("Path gain", formatPathGainValue(path)),
      makePathMetric("Delay", formatPathDelayValue(path)),
    );

    row.append(head, metrics);
    ui.pathButtons.appendChild(row);
  });
  scrollSelectedPathRowIntoView();
}

function svgNode(name, attrs = {}) {
  const node = document.createElementNS(SVG_NS, name);
  for (const [key, value] of Object.entries(attrs)) {
    node.setAttribute(key, String(value));
  }
  return node;
}

function formatDelay(delaySeconds) {
  const value = Number(delaySeconds);
  if (!Number.isFinite(value)) {
    return "N/A";
  }
  const ns = value * 1e9;
  return `${ns.toFixed(Math.abs(ns) >= 10 ? 1 : 2)} ns`;
}

function renderTapChart(channel) {
  ui.linkTapChart.replaceChildren();
  const indices = Array.isArray(channel.tap_indices) ? channel.tap_indices : [];
  const powers = Array.isArray(channel.power_db) ? channel.power_db.map(Number) : [];
  const delays = Array.isArray(channel.delays_s) ? channel.delays_s : [];
  const rows = indices
    .map((index, i) => ({index, power: powers[i], delay: delays[i]}))
    .filter((row) => Number.isFinite(row.power));
  if (!rows.length) {
    return;
  }

  const width = 420;
  const height = 172;
  const left = 68;
  const right = 16;
  const top = 22;
  const bottom = 48;
  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;
  const maxPower = Math.max(...rows.map((row) => row.power));
  const minPower = Math.min(...rows.map((row) => row.power));
  let displayMin = Math.max(minPower, maxPower - 60);
  if (!(displayMin < maxPower)) {
    displayMin = maxPower - 1;
  }
  const scaleY = (value) => top + (1 - ((Math.max(value, displayMin) - displayMin) / (maxPower - displayMin))) * plotHeight;

  ui.linkTapChart.setAttribute("viewBox", `0 0 ${width} ${height}`);
  ui.linkTapChart.setAttribute("aria-label", "Power delay profile chart: x-axis Tap Index, y-axis Power in dB");
  const title = svgNode("title");
  title.textContent = "Power delay profile chart";
  const desc = svgNode("desc");
  desc.textContent = "X-axis shows Tap Index. Y-axis shows tap power in dB. Delay is available in each bar tooltip.";
  ui.linkTapChart.append(title, desc);

  const yTicks = [
    {label: "max", value: maxPower},
    {label: "mid", value: (maxPower + displayMin) / 2},
    {label: "min", value: displayMin},
  ];
  for (const tick of yTicks) {
    const y = scaleY(tick.value);
    ui.linkTapChart.appendChild(svgNode("line", {
      x1: left,
      y1: y,
      x2: width - right,
      y2: y,
      class: "tapGrid",
    }));
  }

  const yAxisTitle = svgNode("text", {
    x: 15,
    y: top + (plotHeight / 2),
    class: "tapAxisTitle",
    "text-anchor": "middle",
    transform: `rotate(-90 15 ${top + (plotHeight / 2)})`,
  });
  yAxisTitle.textContent = "Power (dB)";
  const xAxisTitle = svgNode("text", {
    x: left + (plotWidth / 2),
    y: height - 10,
    class: "tapAxisTitle",
    "text-anchor": "middle",
  });
  xAxisTitle.textContent = "Tap Index";
  ui.linkTapChart.append(
    svgNode("line", {x1: left, y1: top, x2: left, y2: top + plotHeight, class: "tapAxis"}),
    svgNode("line", {x1: left, y1: top + plotHeight, x2: width - right, y2: top + plotHeight, class: "tapAxis"}),
    yAxisTitle,
    xAxisTitle,
  );

  for (const tick of yTicks) {
    const text = svgNode("text", {
      x: left - 9,
      y: scaleY(tick.value),
      class: "tapAxisLabel",
      "text-anchor": "end",
      "dominant-baseline": "middle",
    });
    text.textContent = `${tick.value.toFixed(0)} dB`;
    ui.linkTapChart.appendChild(text);
  }

  const barGap = Math.min(4, plotWidth / rows.length * 0.25);
  const barWidth = Math.max(2, (plotWidth / rows.length) - barGap);
  rows.forEach((row, i) => {
    const x = left + i * (plotWidth / rows.length) + barGap / 2;
    const y = scaleY(row.power);
    const barHeight = Math.max(1, top + plotHeight - y);
    const rect = svgNode("rect", {
      x,
      y,
      width: barWidth,
      height: barHeight,
      class: row.index === channel.peak_tap_index ? "tapBar peak" : "tapBar",
    });
    const title = svgNode("title");
    title.textContent = `Tap ${row.index}\nPower: ${row.power.toFixed(2)} dB\nDelay: ${formatDelay(row.delay)}`;
    rect.appendChild(title);
    ui.linkTapChart.appendChild(rect);
  });

  const peakRowIndex = rows.findIndex((row) => row.index === channel.peak_tap_index);
  const xTicks = [
    {row: rows[0], i: 0},
    {row: peakRowIndex >= 0 ? rows[peakRowIndex] : null, i: peakRowIndex},
    {row: rows[rows.length - 1], i: rows.length - 1},
  ];
  const seenTickPositions = new Set();
  for (const tick of xTicks) {
    if (!tick.row || tick.i < 0 || seenTickPositions.has(tick.i)) {
      continue;
    }
    seenTickPositions.add(tick.i);
    const x = left + (tick.i + 0.5) * (plotWidth / rows.length);
    const label = svgNode("text", {
      x,
      y: top + plotHeight + 18,
      class: tick.row.index === channel.peak_tap_index ? "tapAxisLabel tapPeakLabel" : "tapAxisLabel",
      "text-anchor": "middle",
    });
    label.textContent = String(tick.row.index);
    ui.linkTapChart.append(
      svgNode("line", {
        x1: x,
        y1: top + plotHeight,
        x2: x,
        y2: top + plotHeight + 5,
        class: "tapAxis",
      }),
      label,
    );
  }
}

function renderLinkChannel(channel) {
  if (!channel) {
    ui.linkTapAnalysisSection.classList.add("hidden");
    ui.linkTapAnalysisSection.setAttribute("aria-hidden", "true");
    ui.linkTapChart.replaceChildren();
    return;
  }

  ui.linkTapAnalysisSection.classList.remove("hidden");
  ui.linkTapAnalysisSection.setAttribute("aria-hidden", "false");
  ui.linkTapTotalPower.textContent = Number.isFinite(channel.total_power_db)
    ? `${channel.total_power_db.toFixed(2)} dB`
    : "N/A";
  const peakPower = Number(channel.peak_tap_power_db);
  ui.linkTapPeak.textContent = (
    channel.peak_tap_index === null
    || channel.peak_tap_index === undefined
    || !Number.isFinite(peakPower)
  )
    ? "N/A"
    : `${channel.peak_tap_index} / ${peakPower.toFixed(2)} dB`;
  const cirSummary = channel.cir_summary || {};
  ui.linkCirCoeffCount.textContent = String(cirSummary.coefficient_count ?? "--");
  ui.linkCirStrongest.textContent = formatExp(Number(cirSummary.strongest_coefficient_abs));
  renderTapChart(channel);
}

function renderLinkResult() {
  const result = state.link.result;
  const liveActive = state.mode === "link"
    && state.livePreview.mode === "link"
    && state.livePreview.status !== "Idle";
  syncLivePreviewStatusUi();
  if ((!result && !liveActive) || state.mode !== "link") {
    if (state.mode !== "mobility") {
      ui.linkChannelSection.classList.add("hidden");
      ui.linkChannelSection.setAttribute("aria-hidden", "true");
    }
    ui.linkResult.style.display = "none";
    ui.mobilityResult.style.display = "none";
    ui.mobilityTimelineSection.classList.add("hidden");
    ui.mobilityTimelineSection.setAttribute("aria-hidden", "true");
    renderLinkChannel(null);
    if (state.mode !== "mobility") {
      clearPathSelection();
      hidePathDetails();
    }
    if (state.mode === "link" && !result) {
      getViewer().clearPaths();
    }
    return;
  }

  ui.linkChannelSection.classList.remove("hidden");
  ui.linkChannelSection.setAttribute("aria-hidden", "false");
  ui.resultDockTitle.textContent = "Link Results";
  ui.resultDockSubtitle.textContent = "Path Gains & Taps";
  ui.linkResult.style.display = "block";
  ui.mobilityResult.style.display = "none";
  ui.mobilityTimelineSection.classList.add("hidden");
  ui.mobilityTimelineSection.setAttribute("aria-hidden", "true");
  if (!result) {
    ui.linkPower.textContent = "--";
    ui.linkBest.textContent = "--";
    ui.linkPaths.textContent = "--";
    ui.linkLos.textContent = "--";
    ui.linkLos.className = "pill no";
    renderLinkChannel(null);
    clearPathSelection();
    hidePathDetails();
    return;
  }
  ui.linkPower.textContent = Number.isFinite(result.summary.received_power_db)
    ? `${result.summary.received_power_db.toFixed(2)} dB`
    : "N/A";
  ui.linkBest.textContent = Number.isFinite(result.summary.strongest_path_db)
    ? `${result.summary.strongest_path_db.toFixed(2)} dB`
    : "N/A";
  ui.linkPaths.textContent = String(result.summary.valid_paths ?? 0);
  const hasLos = (result.summary.los_paths ?? 0) > 0;
  ui.linkLos.textContent = hasLos ? "Yes" : "No";
  ui.linkLos.className = `pill ${hasLos ? "yes" : "no"}`;
  renderLinkChannel(result.channel);
  getViewer().renderPaths(result.paths, state.link.selectedPath);

  renderPathDetails(result.paths, state.link.selectedPath);
  renderPathSelection(result.paths, state.link.selectedPath, (index) => {
    state.link.selectedPath = index;
    getViewer().renderPaths(result.paths, index);
    renderLinkResult();
    scrollSelectedPathDetailsIntoView();
  }, result.summary);
}

const MOBILITY_METRICS = {
  received_power_db: {label: "Total Path Gain", unit: "dB"},
  valid_paths: {label: "Valid Paths", unit: "paths"},
  max_abs_doppler_hz: {label: "Max Doppler", unit: "Hz"},
  peak_tap_power_db: {label: "Strongest Tap", unit: "dB"},
};

function renderMobilitySeriesChart(result) {
  ui.mobilitySeriesChart.replaceChildren();
  if (!result) {
    return;
  }
  const metric = MOBILITY_METRICS[state.mobility.metric] ? state.mobility.metric : "received_power_db";
  const metricInfo = MOBILITY_METRICS[metric];
  const times = Array.isArray(result.series?.time_s) ? result.series.time_s.map(Number) : [];
  const values = Array.isArray(result.series?.[metric]) ? result.series[metric].map((value) => value === null ? NaN : Number(value)) : [];
  const rows = times
    .map((time, index) => ({time, value: values[index], index}))
    .filter((row) => Number.isFinite(row.time) && Number.isFinite(row.value));
  if (!rows.length) {
    return;
  }

  const width = 420;
  const height = 172;
  const left = 68;
  const right = 18;
  const top = 22;
  const bottom = 48;
  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;
  const minX = Math.min(...rows.map((row) => row.time));
  const maxX = Math.max(...rows.map((row) => row.time));
  let minY = Math.min(...rows.map((row) => row.value));
  let maxY = Math.max(...rows.map((row) => row.value));
  if (!(minY < maxY)) {
    minY -= 1;
    maxY += 1;
  }
  const scaleX = (value) => left + ((value - minX) / Math.max(maxX - minX, 1e-9)) * plotWidth;
  const scaleY = (value) => top + (1 - ((value - minY) / (maxY - minY))) * plotHeight;

  ui.mobilitySeriesChart.setAttribute("viewBox", `0 0 ${width} ${height}`);
  ui.mobilitySeriesChart.setAttribute("aria-label", `Mobility ${metricInfo.label} time series`);
  const title = svgNode("title");
  title.textContent = `Mobility ${metricInfo.label}`;
  const desc = svgNode("desc");
  desc.textContent = `X-axis shows time in seconds. Y-axis shows ${metricInfo.label} in ${metricInfo.unit}.`;
  ui.mobilitySeriesChart.append(title, desc);

  for (const value of [maxY, (maxY + minY) / 2, minY]) {
    const y = scaleY(value);
    ui.mobilitySeriesChart.appendChild(svgNode("line", {
      x1: left,
      y1: y,
      x2: width - right,
      y2: y,
      class: "tapGrid",
    }));
    const text = svgNode("text", {
      x: left - 9,
      y,
      class: "tapAxisLabel",
      "text-anchor": "end",
      "dominant-baseline": "middle",
    });
    text.textContent = Number.isInteger(value) ? String(value) : value.toFixed(1);
    ui.mobilitySeriesChart.appendChild(text);
  }

  const yAxisTitle = svgNode("text", {
    x: 15,
    y: top + (plotHeight / 2),
    class: "tapAxisTitle",
    "text-anchor": "middle",
    transform: `rotate(-90 15 ${top + (plotHeight / 2)})`,
  });
  yAxisTitle.textContent = metricInfo.unit;
  const xAxisTitle = svgNode("text", {
    x: left + (plotWidth / 2),
    y: height - 10,
    class: "tapAxisTitle",
    "text-anchor": "middle",
  });
  xAxisTitle.textContent = "Time (s)";
  ui.mobilitySeriesChart.append(
    svgNode("line", {x1: left, y1: top, x2: left, y2: top + plotHeight, class: "tapAxis"}),
    svgNode("line", {x1: left, y1: top + plotHeight, x2: width - right, y2: top + plotHeight, class: "tapAxis"}),
    yAxisTitle,
    xAxisTitle,
  );

  const points = rows.map((row) => `${scaleX(row.time)},${scaleY(row.value)}`).join(" ");
  ui.mobilitySeriesChart.appendChild(svgNode("polyline", {points, class: "mobilityLine"}));
  for (const row of rows) {
    const point = svgNode("circle", {
      cx: scaleX(row.time),
      cy: scaleY(row.value),
      r: row.index === state.mobility.selectedStep ? 4.3 : 3.0,
      class: row.index === state.mobility.selectedStep ? "mobilityPoint active" : "mobilityPoint",
    });
    const pointTitle = svgNode("title");
    pointTitle.textContent = `Step ${row.index + 1}\nTime: ${row.time.toFixed(2)} s\n${metricInfo.label}: ${row.value.toFixed(2)} ${metricInfo.unit}`;
    point.appendChild(pointTitle);
    ui.mobilitySeriesChart.appendChild(point);
  }
}

function stopMobilityPlayback() {
  if (state.mobility.playbackTimer !== null) {
    window.clearInterval(state.mobility.playbackTimer);
    state.mobility.playbackTimer = null;
  }
  state.mobility.playing = false;
  ui.btnMobilityPlay.textContent = "Play";
}

function selectMobilityStep(index) {
  const result = state.mobility.result;
  if (!result?.samples?.length) {
    state.mobility.selectedStep = 0;
    return;
  }
  const nextIndex = Math.max(0, Math.min(result.samples.length - 1, Number(index)));
  state.mobility.selectedStep = nextIndex;
  state.mobility.selectedPath = -1;
  const sample = result.samples[nextIndex];
  getViewer().setRx(sample.rx_position);
  getViewer().renderPaths(sample.paths || [], -1);
  renderAll();
}

function startMobilityPlayback() {
  const result = state.mobility.result;
  if (!result?.samples?.length) {
    return;
  }
  stopMobilityPlayback();
  state.mobility.playing = true;
  ui.btnMobilityPlay.textContent = "Pause";
  const intervalMs = Math.max(120, 900 / Math.max(Number(state.mobility.playbackSpeed), 0.1));
  state.mobility.playbackTimer = window.setInterval(() => {
    const nextStep = state.mobility.selectedStep + 1 >= result.samples.length
      ? 0
      : state.mobility.selectedStep + 1;
    selectMobilityStep(nextStep);
  }, intervalMs);
}

function renderMobilityResult() {
  const result = state.mobility.result;
  if (!result || state.mode !== "mobility") {
    if (state.mode !== "link") {
      ui.linkChannelSection.classList.add("hidden");
      ui.linkChannelSection.setAttribute("aria-hidden", "true");
      renderLinkChannel(null);
      clearPathSelection();
      hidePathDetails();
    }
    if (state.mode === "mobility" && !result) {
      getViewer().clearPaths();
    }
    ui.mobilityResult.style.display = "none";
    ui.mobilityTimelineSection.classList.add("hidden");
    ui.mobilityTimelineSection.setAttribute("aria-hidden", "true");
    if (state.mode !== "mobility") {
      stopMobilityPlayback();
    }
    return;
  }

  ui.linkChannelSection.classList.remove("hidden");
  ui.linkChannelSection.setAttribute("aria-hidden", "false");
  ui.resultDockTitle.textContent = "Mobility Results";
  ui.resultDockSubtitle.textContent = "Trajectory & Taps";
  ui.linkResult.style.display = "none";
  ui.mobilityResult.style.display = "block";
  ui.mobilityTimelineSection.classList.remove("hidden");
  ui.mobilityTimelineSection.setAttribute("aria-hidden", "false");

  const summary = result.summary || {};
  ui.mobilitySteps.textContent = String(summary.step_count ?? "--");
  ui.mobilityPowerRange.textContent = (
    Number.isFinite(summary.min_received_power_db)
    && Number.isFinite(summary.max_received_power_db)
  )
    ? `${summary.min_received_power_db.toFixed(1)} .. ${summary.max_received_power_db.toFixed(1)} dB`
    : "N/A";
  ui.mobilityDuration.textContent = Number.isFinite(summary.duration_s)
    ? `${summary.duration_s.toFixed(1)} s`
    : "N/A";
  ui.mobilityMaxDoppler.textContent = Number.isFinite(summary.max_abs_doppler_hz)
    ? `${summary.max_abs_doppler_hz.toFixed(1)} Hz`
    : "N/A";

  const sample = result.samples?.[state.mobility.selectedStep] || result.samples?.[0];
  if (!sample) {
    clearPathSelection();
    hidePathDetails();
    return;
  }
  state.mobility.selectedStep = sample.step_index;
  ui.mobilityStepSlider.max = String(Math.max((result.samples?.length || 1) - 1, 0));
  ui.mobilityStepSlider.value = String(state.mobility.selectedStep);
  ui.mobilityStepLabel.textContent = `Step ${sample.step_index + 1} | ${sample.time_s.toFixed(2)} s | ${sample.distance_m.toFixed(1)} m`;
  ui.mobilityMetric.value = state.mobility.metric;
  ui.mobilityPlaybackSpeed.value = String(state.mobility.playbackSpeed);
  ui.btnMobilityPlay.textContent = state.mobility.playing ? "Pause" : "Play";
  renderMobilitySeriesChart(result);
  renderLinkChannel(sample.channel);

  const paths = sample.paths || [];
  renderPathDetails(paths, state.mobility.selectedPath);
  getViewer().renderPaths(paths, state.mobility.selectedPath);
  getViewer().renderMobilityTrajectory(state.mobility.trajectory.points, result.samples, state.mobility.selectedStep);
  renderPathSelection(paths, state.mobility.selectedPath, (index) => {
    state.mobility.selectedPath = index;
    getViewer().renderPaths(paths, index);
    renderMobilityResult();
    scrollSelectedPathDetailsIntoView();
  }, sample.summary);
}

function renderRadiomapResult() {
  const shouldShow = state.mode === "radiomap"
    && (state.radiomap.status !== "Idle" || Boolean(state.radiomap.result));
  syncLivePreviewStatusUi();
  if (!shouldShow) {
    hideRadiomapDockContent();
    if (state.mode === "radiomap") {
      ui.linkChannelSection.classList.add("hidden");
      ui.linkChannelSection.setAttribute("aria-hidden", "true");
    }
    return;
  }

  ui.linkChannelSection.classList.remove("hidden");
  ui.linkChannelSection.setAttribute("aria-hidden", "false");
  ui.resultDockTitle.textContent = "Radio Map Results";
  ui.resultDockSubtitle.textContent = "Path gain / Terrain grid";
  ui.linkResult.style.display = "none";
  ui.mobilityResult.style.display = "none";
  ui.mobilityTimelineSection.classList.add("hidden");
  ui.mobilityTimelineSection.setAttribute("aria-hidden", "true");
  ui.linkTapAnalysisSection.classList.add("hidden");
  ui.linkTapAnalysisSection.setAttribute("aria-hidden", "true");
  ui.pathSelectionSection.classList.add("hidden");
  ui.pathSelectionSection.setAttribute("aria-hidden", "true");
  hidePathDetails();
  ui.radiomapResolutionSection.classList.remove("hidden");
  ui.radiomapResolutionSection.setAttribute("aria-hidden", "false");
  ui.radiomapResult.style.display = "block";
  ui.rmStatus.textContent = formatStatus(state.radiomap.status);
  ui.rmMetric.textContent = "Path gain (dB)";
  ui.rmArea.textContent = formatArea(state.radiomap.surface.size);

  if (state.radiomap.result) {
    const {surface, solver, range} = state.radiomap.result;
    if (!getViewer().radiomapMesh) {
      getViewer().renderRadiomap(state.radiomap.result, radiomapColorRange());
    }
    const requestedCellSize = Number(surface.requested_cell_size);
    if (surface.resolution_mode === "cell_size_grid") {
      const [nx, ny] = Array.isArray(surface.grid_shape) ? surface.grid_shape : ["?", "?"];
      ui.rmGrid.textContent = `${nx} x ${ny} cells (${formatCount(surface.grid_cell_count)})`;
      ui.rmMesh.textContent = `${formatCount(surface.triangle_count)} triangles`;
      ui.rmCellSizeSummary.textContent = `${formatFixed(requestedCellSize, 1, " m")} target | ${formatFixed(Number(surface.resolved_cell_size_x), 1)} x ${formatFixed(Number(surface.resolved_cell_size_y), 1, " m")} resolved`;
    } else {
      ui.rmGrid.textContent = `Auto D${surface.density_level} terrain cells (${formatCount(surface.cell_count)})`;
      ui.rmMesh.textContent = `${formatCount(surface.cell_count)} triangles`;
      ui.rmCellSizeSummary.textContent = `Auto D${surface.density_level} | terrain-derived`;
    }
    ui.rmSamples.textContent = `${formatCount(solver?.base_samples_per_tx)} base | ${formatCount(solver?.effective_samples_per_tx)} effective`;
    const rangeMin = Number(range?.min);
    const rangeMax = Number(range?.max);
    ui.rmRange.textContent = Number.isFinite(rangeMin) && Number.isFinite(rangeMax)
      ? `${rangeMin.toFixed(1)} .. ${rangeMax.toFixed(1)} dB`
      : "N/A";
  } else {
    const cellSize = state.radiomap.surface.cellSize;
    const densityLevel = state.radiomap.surface.densityLevel;
    ui.rmGrid.textContent = cellSize == null ? `Auto D${densityLevel} terrain cells` : "Pending grid";
    ui.rmMesh.textContent = "Pending";
    ui.rmCellSizeSummary.textContent = cellSize == null
      ? `Auto D${densityLevel} | terrain-derived`
      : `${formatFixed(Number(cellSize), 1, " m")} target | pending`;
    ui.rmSamples.textContent = `${formatCount(state.radiomap.solver.samplesPerTx)} base | pending`;
    ui.rmRange.textContent = "--";
  }
  renderRadiomapColorbar(true);
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

function deepMimoReceiverAxisCount(size, spacing) {
  // Match backend receiver_grid_axis_count in deepmimo_payload.py:
  // inclusive floor + 1, with the same 1e-9 epsilon so float rounding
  // doesn't shave a sample off near integer step boundaries.
  const numericSize = Number(size);
  const numericSpacing = Number(spacing);
  if (!Number.isFinite(numericSize) || !Number.isFinite(numericSpacing) || numericSpacing <= 0) {
    return NaN;
  }
  if (numericSize < 0) {
    return 0;
  }
  return Math.floor((numericSize / numericSpacing) + 1e-9) + 1;
}

function deepMimoReceiverEstimate(bounds = deepMimoRoiBounds()) {
  if (!bounds) {
    return 0;
  }
  const spacing = Number(state.deepmimo.rxGrid.spacing);
  if (!Number.isFinite(spacing) || spacing <= 0) {
    return NaN;
  }
  const nx = deepMimoReceiverAxisCount(bounds.size[0], spacing);
  const ny = deepMimoReceiverAxisCount(bounds.size[1], spacing);
  return Math.max(0, nx) * Math.max(0, ny);
}

function deepMimoPayload() {
  readDeepMimoInputs();
  const bounds = deepMimoRoiBounds();
  if (!bounds) {
    throw new Error("Select a rectangular DeepMIMO ROI with two terrain clicks first");
  }
  const receiverEstimate = deepMimoReceiverEstimate(bounds);
  if (!Number.isFinite(receiverEstimate) || receiverEstimate < 1) {
    throw new Error("DeepMIMO receiver grid is empty; check ROI and grid spacing");
  }
  if (receiverEstimate > Number(state.deepmimo.rxGrid.maxReceivers)) {
    throw new Error(
      `DeepMIMO ROI creates ${formatCount(receiverEstimate)} receiver candidates; increase spacing or Max Rx`,
    );
  }
  return {
    tx: {position: state.deepmimo.tx, orientation: [0, 0, 0]},
    roi: bounds,
    rx_grid: {
      spacing: state.deepmimo.rxGrid.spacing,
      height: state.deepmimo.rxGrid.height,
      max_receivers: state.deepmimo.rxGrid.maxReceivers,
      chunk_size: state.deepmimo.rxGrid.chunkSize,
      filter_buildings: state.deepmimo.rxGrid.filterBuildings,
    },
    solver: {
      ...commonSolverConfig({includeTxArray: false}),
      samples_per_src: state.deepmimo.solver.samplesPerSrc,
      max_num_paths_per_src: state.deepmimo.solver.maxNumPathsPerSrc,
      synthetic_array: true,
      diffraction: state.link.advanced.diffraction,
      edge_diffraction: state.link.advanced.edgeDiffraction,
      diffraction_lit_region: state.link.advanced.diffractionLitRegion,
    },
    export: {
      scenario_name: state.deepmimo.export.scenarioName,
    },
  };
}

function renderDeepMimoState() {
  const bounds = deepMimoRoiBounds();
  const estimate = deepMimoReceiverEstimate(bounds);
  ui.deepMimoRxCandidates.value = bounds && Number.isFinite(estimate)
    ? formatCount(estimate)
    : "--";
  if (bounds && state.mode === "deepmimo") {
    getViewer().renderDeepMimoRoi(bounds, state.deepmimo.roi.visualZ);
  } else {
    getViewer().clearDeepMimoRoi();
  }
  renderDeepMimoDatasetTray();
}

function shortDeepMimoJobId(jobId) {
  const id = String(jobId || "");
  return id.startsWith("dm_") ? id.slice(3, 11) : id.slice(0, 8);
}

function formatDeepMimoDatasetTime(value) {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) {
    return "--";
  }
  return new Date(timestamp).toLocaleTimeString([], {hour: "2-digit", minute: "2-digit"});
}

function addDeepMimoDataset(job) {
  const jobId = String(job.job_id || job.jobId || "");
  if (!jobId) {
    return;
  }
  const pending = state.deepmimo.pendingDataset?.jobId === jobId
    ? state.deepmimo.pendingDataset
    : null;
  const item = {
    jobId,
    scenarioName: pending?.scenarioName || state.deepmimo.export.scenarioName || "hku_deepmimo_roi",
    readyAt: job.updated_at || new Date().toISOString(),
    archiveName: job.result?.archive_name || `deepmimo_${jobId}.zip`,
    downloadUrl: deepMimoDownloadUrl(jobId),
  };
  state.deepmimo.datasets = [
    item,
    ...state.deepmimo.datasets.filter((dataset) => dataset.jobId !== jobId),
  ];
}

function renderDeepMimoDatasetTray() {
  const datasets = state.deepmimo.datasets;
  const hasDatasets = datasets.length > 0;
  const expanded = hasDatasets && state.deepmimo.datasetTrayOpen;

  ui.deepMimoDatasetTray.classList.toggle("hidden", !hasDatasets);
  ui.deepMimoDatasetTray.setAttribute("aria-hidden", String(!hasDatasets));
  ui.deepMimoDatasetTray.classList.toggle("open", expanded);
  ui.deepMimoDatasetToggle.setAttribute("aria-expanded", String(expanded));
  ui.deepMimoDatasetCount.textContent = String(datasets.length);
  ui.deepMimoDatasetPanel.classList.toggle("hidden", !expanded);
  ui.deepMimoDatasetPanel.setAttribute("aria-hidden", String(!expanded));

  ui.deepMimoDatasetList.replaceChildren(...datasets.map((dataset) => {
    const item = document.createElement("div");
    item.className = "deepMimoDatasetItem";

    const meta = document.createElement("div");
    meta.className = "deepMimoDatasetMeta";

    const name = document.createElement("div");
    name.className = "deepMimoDatasetName";
    name.textContent = dataset.scenarioName;

    const detail = document.createElement("div");
    detail.className = "deepMimoDatasetDetail";
    detail.textContent = `Job ${shortDeepMimoJobId(dataset.jobId)} · ${formatDeepMimoDatasetTime(dataset.readyAt)}`;

    const link = document.createElement("a");
    link.className = "deepMimoDatasetDownload";
    link.href = dataset.downloadUrl;
    link.download = dataset.archiveName;
    link.textContent = "Download";

    meta.append(name, detail);
    item.append(meta, link);
    return item;
  }));
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

async function pollDeepMimo(jobId) {
  const token = state.deepmimo.generation;
  const overlayOwner = deepMimoRunOwner;
  while (state.deepmimo.jobId === jobId && token === state.deepmimo.generation) {
    const job = await getDeepMimoJob(jobId);
    if (state.deepmimo.jobId !== jobId || token !== state.deepmimo.generation) {
      return;
    }
    const preservingCancel = state.deepmimo.status === "cancelling" && !TERMINAL_DEEPMIMO_STATUSES.has(job.status);
    if (preservingCancel) {
      state.deepmimo.message = "Cancelling DeepMIMO export...";
      renderDeepMimoState();
      showOverlay({
        title: "Exporting DeepMIMO Dataset",
        message: "Cancelling DeepMIMO export...",
        indeterminate: true,
        owner: overlayOwner,
      });
      await new Promise((resolve) => window.setTimeout(resolve, 1500));
      continue;
    }
    state.deepmimo.status = job.status;
    state.deepmimo.progress = Number(job.progress || 0);
    state.deepmimo.message = job.message || "";
    if (job.result) {
      state.deepmimo.result = job.result;
    }
    renderDeepMimoState();

    if (job.status === "succeeded") {
      state.deepmimo.message = "Dataset ready";
      addDeepMimoDataset(job);
      state.deepmimo.jobId = null;
      state.deepmimo.pendingDataset = null;
      renderDeepMimoState();
      showOverlay({
        title: "Exporting DeepMIMO Dataset",
        message: "Dataset ready",
        percent: 100,
        owner: overlayOwner,
      });
      hideOverlay(overlayOwner);
      if (deepMimoRunOwner === overlayOwner) {
        deepMimoRunOwner = null;
      }
      return;
    }
    if (job.status === "failed") {
      const overlayWasCurrent = hideOverlay(overlayOwner);
      if (deepMimoRunOwner === overlayOwner) {
        deepMimoRunOwner = null;
      }
      if (!overlayWasCurrent) {
        return;
      }
      throw new Error(job.error || job.message || "DeepMIMO export failed");
    }
    if (job.status === "cancelled") {
      state.deepmimo.jobId = null;
      state.deepmimo.pendingDataset = null;
      state.deepmimo.progress = 1;
      state.deepmimo.message = job.message || "Cancelled";
      renderDeepMimoState();
      hideOverlay(overlayOwner);
      if (deepMimoRunOwner === overlayOwner) {
        deepMimoRunOwner = null;
      }
      return;
    }
    showOverlay({
      title: "Exporting DeepMIMO Dataset",
      message: job.message || "Preparing DeepMIMO dataset...",
      percent: Math.round(Math.max(0, Math.min(1, Number(job.progress || 0))) * 100),
      cancelLabel: "Cancel Export",
      onCancel: () => {
        cancelDeepMimoExport(jobId);
      },
      owner: overlayOwner,
    });
    await new Promise((resolve) => window.setTimeout(resolve, 1500));
  }
}

async function cancelDeepMimoExport(jobId) {
  if (!jobId || state.deepmimo.jobId !== jobId) {
    return;
  }
  if (state.deepmimo.status === "cancelling") {
    return;
  }
  state.deepmimo.status = "cancelling";
  state.deepmimo.message = "Cancelling DeepMIMO export...";
  renderDeepMimoState();
  showOverlay({
    title: "Exporting DeepMIMO Dataset",
    message: "Cancelling DeepMIMO export...",
    indeterminate: true,
    owner: deepMimoRunOwner,
    force: true,
  });
  try {
    const job = await cancelDeepMimoJob(jobId);
    if (state.deepmimo.jobId !== jobId) {
      return;
    }
    if (job.status === "succeeded") {
      state.deepmimo.jobId = null;
      state.deepmimo.result = job.result || state.deepmimo.result;
      state.deepmimo.status = "succeeded";
      state.deepmimo.progress = 1;
      state.deepmimo.message = "Dataset ready";
      addDeepMimoDataset(job);
      state.deepmimo.pendingDataset = null;
      renderDeepMimoState();
      hideOverlay(deepMimoRunOwner);
      deepMimoRunOwner = null;
      return;
    }
    if (TERMINAL_DEEPMIMO_STATUSES.has(job.status)) {
      state.deepmimo.jobId = null;
      state.deepmimo.pendingDataset = null;
      state.deepmimo.status = job.status;
      state.deepmimo.progress = Number(job.progress ?? 1);
      // Status-appropriate fallback so a failed cancel response does not
      // misreport itself as "Cancelled".
      const fallbackMessage =
        job.status === "failed"
          ? "DeepMIMO export failed"
          : job.status === "succeeded"
          ? "Dataset ready"
          : "Cancelled";
      state.deepmimo.message = job.message || fallbackMessage;
      renderDeepMimoState();
      hideOverlay(deepMimoRunOwner);
      deepMimoRunOwner = null;
      return;
    }
    // Non-terminal cancel ack (e.g. status="cancelling"): keep jobId so
    // pollDeepMimo's preservingCancel branch continues to drive the UI
    // until the worker reaches a terminal status.
    if (typeof job.progress === "number") {
      state.deepmimo.progress = job.progress;
    }
    if (job.message) {
      state.deepmimo.message = job.message;
    }
    renderDeepMimoState();
  } catch (error) {
    if (state.deepmimo.jobId !== jobId) {
      return;
    }
    state.deepmimo.status = "running";
    state.deepmimo.message = error.message || "Could not cancel DeepMIMO export";
    renderDeepMimoState();
  }
}

async function runDeepMimo() {
  if (!getViewer().__ready || getViewer().loadedTileIds.size === 0) {
    throw new Error("Load at least one selected tile before exporting DeepMIMO");
  }
  const payload = deepMimoPayload();
  const token = ++state.deepmimo.generation;
  const overlayOwner = `deepmimo:${token}`;
  deepMimoRunOwner = overlayOwner;
  const submittedScenarioName = payload.export?.scenario_name || state.deepmimo.export.scenarioName || "hku_deepmimo_roi";
  state.deepmimo.status = "Queued";
  state.deepmimo.progress = 0;
  state.deepmimo.message = "Submitting DeepMIMO export job...";
  state.deepmimo.jobId = null;
  state.deepmimo.result = null;
  state.deepmimo.pendingDataset = null;
  renderDeepMimoState();
  showOverlay({
    title: "Exporting DeepMIMO Dataset",
    message: "Submitting DeepMIMO export job...",
    percent: 0,
    owner: overlayOwner,
    force: true,
  });

  try {
    const job = await createDeepMimoJob(payload);
    if (token !== state.deepmimo.generation) {
      return;
    }
    state.deepmimo.jobId = job.job_id;
    state.deepmimo.pendingDataset = {
      jobId: job.job_id,
      scenarioName: submittedScenarioName,
    };
    state.deepmimo.status = job.status || "running";
    state.deepmimo.progress = Number(job.progress || 0);
    state.deepmimo.message = job.message || "Worker started";
    renderDeepMimoState();
    await pollDeepMimo(job.job_id);
  } catch (error) {
    if (token !== state.deepmimo.generation) {
      return;
    }
    state.deepmimo.jobId = null;
    state.deepmimo.status = "failed";
    state.deepmimo.progress = 1;
    state.deepmimo.message = error.message;
    state.deepmimo.pendingDataset = null;
    renderDeepMimoState();
    const overlayWasCurrent = hideOverlay(overlayOwner);
    if (deepMimoRunOwner === overlayOwner) {
      deepMimoRunOwner = null;
    }
    if (!overlayWasCurrent) {
      return;
    }
    throw error;
  } finally {
    if (token !== state.deepmimo.generation && deepMimoRunOwner === overlayOwner) {
      deepMimoRunOwner = null;
    }
  }
}
async function runLinkSolve() {
  readLinkInputs();
  const token = ++state.link.generation;
  const overlayOwner = `link:${token}`;
  linkRunOwner = overlayOwner;
  getViewer().clearOverlay();
  showOverlay({
    title: "Solving Link",
    message: "Computing link paths with Sionna RT...",
    indeterminate: true,
    owner: overlayOwner,
    force: true,
  });
  try {
    const result = await solveLink(linkSolvePayload());
    if (token !== state.link.generation) {
      return;
    }
    state.link.result = result;
    state.link.selectedPath = -1;
    if (state.mode === "link") {
      getViewer().renderPaths(result.paths, -1);
    }
  } catch (error) {
    if (token !== state.link.generation) {
      return;
    }
    const overlayWasCurrent = hideOverlay(overlayOwner);
    if (!overlayWasCurrent) {
      return;
    }
    throw error;
  } finally {
    if (token === state.link.generation) {
      hideOverlay(overlayOwner);
      renderAll();
    }
    if (linkRunOwner === overlayOwner) {
      linkRunOwner = null;
    }
  }
}

function clearTimer(handle) {
  if (handle !== null && handle !== undefined) {
    window.clearTimeout(handle);
  }
  return null;
}

function cancelLivePreview({clearStatus = true} = {}) {
  const live = state.livePreview;
  live.link.generation += 1;
  live.link.previewTimer = clearTimer(live.link.previewTimer);
  live.link.finalTimer = clearTimer(live.link.finalTimer);
  live.link.previewController?.abort();
  live.link.finalController?.abort();
  live.link.previewController = null;
  live.link.finalController = null;
  if (clearStatus) {
    clearLivePreviewStatus();
  }
}

function livePreviewEnabledForTarget(target) {
  readLivePreviewInputs();
  if (!state.livePreview.enabled || ui.loadingScreen.style.display !== "none") {
    return false;
  }
  return (target === "link-tx" || target === "link-rx") && state.mode === "link";
}

function scheduleLinkPreview(token) {
  const live = state.livePreview.link;
  live.previewTimer = clearTimer(live.previewTimer);
  const delayMs = Math.max(0, Number(live.pathsDelayS) || 0) * 1000;
  const now = window.performance.now();
  const waitMs = Math.max(0, delayMs - (now - Number(live.lastPreviewStartedAt || 0)));
  live.previewTimer = window.setTimeout(() => {
    runLinkLiveSolve(token, {preview: true}).catch((error) => {
      if (error?.name !== "AbortError" && token === state.livePreview.link.generation) {
        setLivePreviewStatus("link", "Preview failed");
        renderAll();
      }
    });
  }, waitMs);
}

function scheduleLinkFinal(token) {
  const live = state.livePreview.link;
  live.finalTimer = clearTimer(live.finalTimer);
  const delayMs = Math.max(0, Number(live.pathsDelayS) || 0) * 1000;
  live.finalTimer = window.setTimeout(() => {
    runLinkLiveSolve(token, {preview: false}).catch((error) => {
      if (error?.name !== "AbortError" && token === state.livePreview.link.generation) {
        setLivePreviewStatus("link", "Final failed");
        renderAll();
      }
    });
  }, delayMs);
}

async function runLinkLiveSolve(token, {preview}) {
  const live = state.livePreview.link;
  if (!state.livePreview.enabled || state.mode !== "link" || token !== live.generation) {
    return;
  }
  if (preview) {
    live.lastPreviewStartedAt = window.performance.now();
    live.previewController?.abort();
    live.previewController = new AbortController();
  } else {
    live.previewController?.abort();
    live.finalController?.abort();
    live.finalController = new AbortController();
  }
  const controller = preview ? live.previewController : live.finalController;
  setLivePreviewStatus("link", preview ? "Previewing" : "Finalizing");
  renderAll();
  try {
    const result = await solveLink(linkSolvePayload({preview}), {signal: controller.signal});
    if (controller.signal.aborted || token !== live.generation || state.mode !== "link") {
      return;
    }
    state.link.result = result;
    state.link.selectedPath = -1;
    getViewer().renderPaths(result.paths, -1);
    setLivePreviewStatus("link", preview ? "Preview ready" : "Final ready");
    renderAll();
  } finally {
    if (preview && live.previewController === controller) {
      live.previewController = null;
    }
    if (!preview && live.finalController === controller) {
      live.finalController = null;
    }
  }
}

function radiomapSurfacePayload() {
  const surface = {
    type: "terrain_patch",
    size: state.radiomap.surface.size,
    height_offset: state.radiomap.surface.heightOffset,
    density_level: state.radiomap.surface.densityLevel,
  };
  if (state.radiomap.surface.cellSize != null) {
    if (!Number.isFinite(state.radiomap.surface.cellSize)) {
      throw new Error("Radio map cell size must be a finite number or blank for Auto");
    }
    surface.cell_size = state.radiomap.surface.cellSize;
  }
  return surface;
}

function radiomapJobPayload() {
  return {
    tx: {position: state.radiomap.tx, orientation: [0, 0, 0]},
    metric: "path_gain",
    surface: radiomapSurfacePayload(),
    solver: {
      ...commonSolverConfig(),
      samples_per_tx: state.radiomap.solver.samplesPerTx,
    },
  };
}

function handleLivePreviewDeviceUpdate(target, phase = "change") {
  if (!livePreviewEnabledForTarget(target)) {
    return;
  }
  if (target === "link-tx" || target === "link-rx") {
    const live = state.livePreview.link;
    live.generation += 1;
    live.previewController?.abort();
    live.finalController?.abort();
    const token = live.generation;
    if (phase === "move") {
      scheduleLinkPreview(token);
      scheduleLinkFinal(token);
      return;
    }
    scheduleLinkPreview(token);
    scheduleLinkFinal(token);
    return;
  }
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

async function pollMobility(jobId, token = state.mobility.generation, overlayOwner = mobilityRunOwner) {
  while (state.mobility.jobId === jobId && token === state.mobility.generation) {
    const job = await getMobilityJob(jobId);
    if (state.mobility.jobId !== jobId || token !== state.mobility.generation) {
      return;
    }
    state.mobility.status = job.status;

    if (job.status === "succeeded") {
      const result = await getMobilityResult(jobId);
      if (state.mobility.jobId !== jobId || token !== state.mobility.generation) {
        return;
      }
      state.mobility.result = result;
      state.mobility.jobId = null;
      state.mobility.selectedStep = 0;
      state.mobility.selectedPath = -1;
      const sample = state.mobility.result.samples?.[0];
      if (state.mode === "mobility") {
        getViewer().renderPaths(sample?.paths || [], -1);
      }
      renderMobilityResult();
      hideOverlay(overlayOwner);
      if (mobilityRunOwner === overlayOwner) {
        mobilityRunOwner = null;
      }
      return;
    }

    if (job.status === "failed") {
      const overlayWasCurrent = hideOverlay(overlayOwner);
      if (mobilityRunOwner === overlayOwner) {
        mobilityRunOwner = null;
      }
      if (!overlayWasCurrent) {
        return;
      }
      throw new Error(job.error || job.message || "Mobility job failed");
    }

    showOverlay({
      title: "Running Mobility",
      message: job.message || "Computing Rx trajectory with Sionna RT...",
      indeterminate: true,
      owner: overlayOwner,
    });
    await new Promise((resolve) => window.setTimeout(resolve, 1200));
  }
}

async function runMobility() {
  readMobilityInputs();
  const estimate = mobilityEstimate();
  if (state.mobility.trajectory.points.length < 2) {
    throw new Error("Mobility trajectory needs at least two Rx waypoints");
  }
  if (!Number.isInteger(estimate.maxSteps) || estimate.maxSteps < 2) {
    throw new Error("Mobility Max Steps must be an integer of at least 2");
  }
  if (estimate.steps > estimate.maxSteps) {
    throw new Error(
      `Mobility trajectory computes ${estimate.steps} steps; increase Max Steps, increase Time Step, or shorten the trajectory`,
    );
  }

  stopMobilityPlayback();
  getViewer().clearOverlay();
  const token = ++state.mobility.generation;
  const overlayOwner = `mobility:${token}`;
  mobilityRunOwner = overlayOwner;
  state.mobility.status = "Queued";
  state.mobility.jobId = null;
  state.mobility.result = null;
  state.mobility.selectedStep = 0;
  state.mobility.selectedPath = -1;
  renderMobilityTrajectoryPreview();
  showOverlay({
    title: "Running Mobility",
    message: "Submitting mobility job...",
    indeterminate: true,
    owner: overlayOwner,
    force: true,
  });

  try {
    const job = await createMobilityJob({
      tx: {position: state.mobility.tx, orientation: [0, 0, 0]},
      rx_trajectory: {
        points: state.mobility.trajectory.points,
        velocity_mps: state.mobility.trajectory.velocityMps,
        time_step_s: state.mobility.trajectory.timeStepS,
        max_steps: state.mobility.trajectory.maxSteps,
      },
      solver: linkSolverConfig(),
      channel: linkChannelConfig(),
    });

    if (token !== state.mobility.generation) {
      return;
    }
    state.mobility.jobId = job.job_id;
    await pollMobility(job.job_id, token, overlayOwner);
  } catch (error) {
    if (token !== state.mobility.generation) {
      return;
    }
    state.mobility.jobId = null;
    state.mobility.status = "failed";
    state.mobility.result = null;
    state.mobility.selectedStep = 0;
    state.mobility.selectedPath = -1;
    renderMobilityResult();
    const overlayWasCurrent = hideOverlay(overlayOwner);
    if (mobilityRunOwner === overlayOwner) {
      mobilityRunOwner = null;
    }
    if (!overlayWasCurrent) {
      return;
    }
    throw error;
  } finally {
    if (token !== state.mobility.generation && mobilityRunOwner === overlayOwner) {
      mobilityRunOwner = null;
    }
  }
}

async function pollRadiomap(jobId, token = state.radiomap.generation, overlayOwner = radiomapRunOwner) {
  while (state.radiomap.jobId === jobId && token === state.radiomap.generation) {
    const job = await getRadiomapJob(jobId);
    if (state.radiomap.jobId !== jobId || token !== state.radiomap.generation) {
      return;
    }
    state.radiomap.status = job.status;
    renderRadiomapResult();

    if (job.status === "succeeded") {
      const result = await getRadiomapResult(jobId);
      if (state.radiomap.jobId !== jobId || token !== state.radiomap.generation) {
        return;
      }
      state.radiomap.result = result;
      state.radiomap.jobId = null;
      if (state.mode === "radiomap") {
        getViewer().renderRadiomap(state.radiomap.result, radiomapColorRange());
      }
      renderRadiomapResult();
      hideOverlay(overlayOwner);
      if (radiomapRunOwner === overlayOwner) {
        radiomapRunOwner = null;
      }
      return;
    }

    if (job.status === "failed") {
      const overlayWasCurrent = hideOverlay(overlayOwner);
      if (radiomapRunOwner === overlayOwner) {
        radiomapRunOwner = null;
      }
      if (!overlayWasCurrent) {
        return;
      }
      throw new Error(job.error || job.message || "Radio map job failed");
    }

    showOverlay({
      title: "Running Radio Map",
      message: job.message || "Computing radio map with Sionna RT...",
      indeterminate: true,
      owner: overlayOwner,
    });
    await new Promise((resolve) => window.setTimeout(resolve, 1200));
  }
}

async function runRadiomap() {
  readRadiomapInputs();
  radiomapColorRange();
  getViewer().clearOverlay();
  const token = ++state.radiomap.generation;
  const overlayOwner = `radiomap:${token}`;
  radiomapRunOwner = overlayOwner;

  state.radiomap.status = "Queued";
  state.radiomap.jobId = null;
  state.radiomap.result = null;
  renderRadiomapResult();
  showOverlay({
    title: "Running Radio Map",
    message: "Submitting radio map job...",
    indeterminate: true,
    owner: overlayOwner,
    force: true,
  });

  try {
    const job = await createRadiomapJob(radiomapJobPayload());

    if (token !== state.radiomap.generation) {
      return;
    }
    state.radiomap.jobId = job.job_id;
    await pollRadiomap(job.job_id, token, overlayOwner);
  } catch (error) {
    if (token !== state.radiomap.generation) {
      return;
    }
    state.radiomap.jobId = null;
    state.radiomap.status = "failed";
    state.radiomap.result = null;
    renderRadiomapResult();
    const overlayWasCurrent = hideOverlay(overlayOwner);
    if (radiomapRunOwner === overlayOwner) {
      radiomapRunOwner = null;
    }
    if (!overlayWasCurrent) {
      return;
    }
    throw error;
  } finally {
    if (token !== state.radiomap.generation && radiomapRunOwner === overlayOwner) {
      radiomapRunOwner = null;
    }
  }
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
