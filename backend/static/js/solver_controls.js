import {normalizeColormapName} from "/js/colormaps.js";
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
  radiomapJobPayload as buildRadiomapJobPayload,
  radiomapSurfacePayload as buildRadiomapSurfacePayload,
} from "/js/solvers/solver_payloads.js?v=20260723-empty-devices";
import {formatCount} from "/js/ui/result_formatters.js?v=20260519-mode-isolation";

export function createSolverControlsController(context) {
  const {state, ui, inputs, viewerRef} = context;
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
  const fixedForDeepMimo = context.features.get(state.mode)?.sharedControlPolicy?.antenna === "fixed";
  for (const [kind, config] of [["tx", state.antenna.txArray], ["rx", state.antenna.rxArray]]) {
    const refs = antennaInputs(kind);
    writeAntennaArrayInputs(refs, fixedForDeepMimo ? DEEPMIMO_FIXED_ANTENNA_ARRAY : config);
    setAntennaInputsDisabled(refs, fixedForDeepMimo);
  }
}

function readAntennaArrayInputs() {
  if (context.features.get(state.mode)?.sharedControlPolicy?.antenna === "fixed") {
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
  const [sx, sy] = state.radiomap.surface.size;
  const heightOffset = state.radiomap.surface.heightOffset;
  const densityLevel = state.radiomap.surface.densityLevel;
  const cellSize = state.radiomap.surface.cellSize;
  const samplesPerTx = state.radiomap.solver.samplesPerTx;
  const colorMinDb = state.radiomap.display.colorMinDb;
  const colorMaxDb = state.radiomap.display.colorMaxDb;
  const colormap = state.radiomap.display.colormap;
  const dmGrid = state.deepmimo.rxGrid;
  const dmSolver = state.deepmimo.solver;

  syncDeviceVectorInputs([inputs.linkTxX, inputs.linkTxY, inputs.linkTxZ], state.link.tx, "link-tx");
  syncDeviceVectorInputs([inputs.linkRxX, inputs.linkRxY, inputs.linkRxZ], state.link.rx, "link-rx");
  syncDeviceVectorInputs([inputs.mobilityTxX, inputs.mobilityTxY, inputs.mobilityTxZ], state.mobility.tx, "mobility-tx");
  syncDeviceVectorInputs([inputs.mobilityRxX, inputs.mobilityRxY, inputs.mobilityRxZ], state.mobility.rx, "mobility-rx");
  const clearanceScope = context.picking.get(state.deviceControl.activeTarget)?.scope || "link";
  inputs.linkSurfaceClearance.value = String(surfaceClearanceM(clearanceScope));
  syncDeviceVectorInputs([inputs.rmTxX, inputs.rmTxY, inputs.rmTxZ], state.radiomap.tx, "rm-tx");
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
  syncDeviceVectorInputs(
    [inputs.deepMimoTxX, inputs.deepMimoTxY, inputs.deepMimoTxZ],
    state.deepmimo.tx,
    "deepmimo-tx",
  );
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
  context.features.instance(state.mode)?.syncInputs?.();
}


function normalizeDevicePosition(values) {
  if (!Array.isArray(values) || values.length !== 3) {
    return null;
  }
  const position = values.map(Number);
  return position.every(Number.isFinite) ? position : null;
}

function readDeviceVector(inputRefs) {
  const values = inputRefs.map((input) => input.value.trim());
  if (values.some((value) => value === "")) {
    return null;
  }
  return normalizeDevicePosition(values);
}

function syncDeviceVectorInputs(inputRefs, values, targetId) {
  const position = normalizeDevicePosition(values);
  if (position) {
    inputRefs.forEach((input, index) => {
      input.value = position[index].toFixed(1);
    });
    return;
  }
  if (state.deviceControl.activeTarget !== targetId) {
    inputRefs.forEach((input) => {
      input.value = "";
    });
  }
}

function setLogicalAndVisual(featureState, role, logicalValues, visualValues = logicalValues) {
  featureState[role] = normalizeDevicePosition(logicalValues);
  featureState[`${role}Visual`] = normalizeDevicePosition(visualValues);
}

function surfaceClearanceM(scope = "link") {
  const value = Number(context.features.store.get(scope).surfaceClearanceM);
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

function readSurfaceClearanceInput(scope = context.picking.get(state.deviceControl.activeTarget)?.scope || "link") {
  const clearance = Number(inputs.linkSurfaceClearance.value);
  const nextClearance = Number.isFinite(clearance)
    ? Math.max(0, Math.min(50, clearance))
    : 1.5;
  context.features.store.get(scope).surfaceClearanceM = nextClearance;
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
  setLogicalAndVisual(state.link, "tx", readDeviceVector([inputs.linkTxX, inputs.linkTxY, inputs.linkTxZ]));
  setLogicalAndVisual(state.link, "rx", readDeviceVector([inputs.linkRxX, inputs.linkRxY, inputs.linkRxZ]));
  readSurfaceClearanceInput("link");
  readLinkAdvancedInputs();
}

function readRadiomapInputs() {
  setLogicalAndVisual(state.radiomap, "tx", readDeviceVector([inputs.rmTxX, inputs.rmTxY, inputs.rmTxZ]));
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
  setLogicalAndVisual(
    state.deepmimo,
    "tx",
    readDeviceVector([inputs.deepMimoTxX, inputs.deepMimoTxY, inputs.deepMimoTxZ]),
  );
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
  setLogicalAndVisual(
    state.mobility,
    "tx",
    readDeviceVector([inputs.mobilityTxX, inputs.mobilityTxY, inputs.mobilityTxZ]),
  );
  setLogicalAndVisual(
    state.mobility,
    "rx",
    readDeviceVector([inputs.mobilityRxX, inputs.mobilityRxY, inputs.mobilityRxZ]),
  );
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

function renderLinkChannel(channel) {
  callFeature("renderLinkChannel", channel);
}

function renderLinkResult() {
  callFeature("renderLinkResult");
}

function clearPathSelection() {
  callFeature("clearPathSelection");
}

function hidePathDetails() {
  callFeature("hidePathDetails");
}

function renderPathDetails(paths, selectedIndex) {
  callFeature("renderPathDetails", paths, selectedIndex);
}

function renderPathSelection(paths, selectedIndex, onSelect, summary = null) {
  callFeature("renderPathSelection", paths, selectedIndex, onSelect, summary);
}

function scrollSelectedPathDetailsIntoView() {
  callFeature("scrollSelectedPathDetailsIntoView");
}

function stopMobilityPlayback() {
  callFeature("stopMobilityPlayback");
}

function selectMobilityStep(index) {
  callFeature("selectMobilityStep", index);
}

function startMobilityPlayback() {
  callFeature("startMobilityPlayback");
}

function renderMobilityResult() {
  callFeature("renderMobilityResult");
}

function renderRadiomapResult() {
  callFeature("renderRadiomapResult");
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
  return buildDeepMimoPayload({
    state,
    inputs,
    bounds,
    receiverEstimate,
    formatCount,
    linkDomain: context.featureServices.linkDomain,
  });
}

function renderDeepMimoState() {
  callFeature("renderDeepMimoState");
}

function addDeepMimoDataset(job) {
  callFeature("addDeepMimoDataset", job);
}

function renderDeepMimoDatasetTray() {
  callFeature("renderDeepMimoDatasetTray");
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
  return callFeature("cancelDeepMimoExport", jobId);
}

async function runDeepMimo() {
  return callFeature("runDeepMimo");
}
async function runLinkSolve() {
  return callFeature("runLinkSolve");
}

function cancelLivePreview({clearStatus = true} = {}) {
  callFeature("cancelLivePreview", {clearStatus});
}

function radiomapSurfacePayload() {
  return buildRadiomapSurfacePayload({state});
}

function radiomapJobPayload() {
  return buildRadiomapJobPayload({state, inputs});
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
  readMobilityInputs();
  if (!Array.isArray(state.mobility.rx)) {
    ui.hintText.textContent = "Place Mobility Rx before adding a waypoint.";
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

async function runMobility() {
  return callFeature("runMobility");
}

async function runRadiomap() {
  return callFeature("runRadiomap");
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
    readLinkInputs,
    readLivePreviewInputs,
    linkSolvePayload,
    setLivePreviewStatus,
    clearLivePreviewStatus,
    syncLivePreviewStatusUi,
    renderLinkChannel,
    clearPathSelection,
    hidePathDetails,
    renderPathDetails,
    renderPathSelection,
    scrollSelectedPathDetailsIntoView,
    readMobilityInputs,
    mobilityEstimate,
    renderMobilityResult,
    renderMobilityTrajectoryPreview,
    stopMobilityPlayback,
    readRadiomapInputs,
    radiomapJobPayload,
    radiomapColorRange,
    renderRadiomapResult,
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
    invalidateRadarResult,
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
