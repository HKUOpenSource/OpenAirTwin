const SVG_NS = "http://www.w3.org/2000/svg";

export function createSolverControlsController(context) {
  const {state, ui, inputs, viewerRef, api} = context;
  const getViewer = () => viewerRef.current;
  const scene = () => context.controllers.scene;

  function showOverlay(options) {
    scene().showOverlay(options);
  }

  function hideOverlay() {
    scene().hideOverlay();
  }

  function renderAll() {
    scene().renderAll();
  }

  const {
    createMobilityJob,
    createRadiomapJob,
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
  for (const [kind, config] of [["tx", state.antenna.txArray], ["rx", state.antenna.rxArray]]) {
    const refs = antennaInputs(kind);
    refs.pattern.value = config.pattern;
    refs.polarization.value = config.polarization;
    refs.rows.value = String(config.numRows);
    refs.cols.value = String(config.numCols);
    refs.verticalSpacing.value = String(config.verticalSpacing);
    refs.horizontalSpacing.value = String(config.horizontalSpacing);
  }
}

function readAntennaArrayInputs() {
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

function commonSolverConfig() {
  return {
    frequency_hz: Number(inputs.cfgFrequency.value) * 1e9,
    max_depth: Number(inputs.cfgMaxDepth.value),
    los: inputs.cfgLos.checked,
    specular_reflection: inputs.cfgSpecular.checked,
    diffuse_reflection: inputs.cfgDiffuse.checked,
    refraction: inputs.cfgRefraction.checked,
    seed: Number(inputs.cfgSeed.value),
    tx_array: antennaArrayPayload(state.antenna.txArray),
  };
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

function renderMobilityWaypoints() {
  ui.mobilityWaypointList.innerHTML = "";
  state.mobility.trajectory.points.forEach((point, index) => {
    const item = document.createElement("div");
    item.className = "waypointItem";
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
    remove.disabled = state.mobility.trajectory.points.length <= 2;
    remove.setAttribute("aria-label", `Remove waypoint ${index + 1}`);
    remove.addEventListener("click", () => {
      if (state.mobility.trajectory.points.length <= 2) {
        return;
      }
      state.mobility.trajectory.points.splice(index, 1);
      state.mobility.result = null;
      state.mobility.selectedStep = 0;
      state.mobility.selectedPath = -1;
      renderAll();
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
    result ? state.mobility.selectedStep : -1,
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
  const [rtx, rty, rtz] = state.radiomap.tx;
  const [sx, sy] = state.radiomap.surface.size;
  const heightOffset = state.radiomap.surface.heightOffset;
  const densityLevel = state.radiomap.surface.densityLevel;
  const colorMinDb = state.radiomap.display.colorMinDb;
  const colorMaxDb = state.radiomap.display.colorMaxDb;

  inputs.linkTxX.value = ltx.toFixed(1);
  inputs.linkTxY.value = lty.toFixed(1);
  inputs.linkTxZ.value = ltz.toFixed(1);
  inputs.linkRxX.value = lrx.toFixed(1);
  inputs.linkRxY.value = lry.toFixed(1);
  inputs.linkRxZ.value = lrz.toFixed(1);
  inputs.rmTxX.value = rtx.toFixed(1);
  inputs.rmTxY.value = rty.toFixed(1);
  inputs.rmTxZ.value = rtz.toFixed(1);
  inputs.rmSizeX.value = sx.toFixed(1);
  inputs.rmSizeY.value = sy.toFixed(1);
  inputs.rmHeightOffset.value = heightOffset.toFixed(1);
  inputs.rmDensityLevel.value = String(densityLevel);
  inputs.rmColorMin.value = colorMinDb.toFixed(0);
  inputs.rmColorMax.value = colorMaxDb.toFixed(0);
  syncAntennaArrayInputs();
  syncLinkAdvancedInputs();
  syncMobilityInputs();
}


function setVector(target, values) {
  target.splice(0, target.length, ...values.map((value) => Number(value)));
}

function setLogicalAndVisual(logicalTarget, visualTarget, logicalValues, visualValues = logicalValues) {
  setVector(logicalTarget, logicalValues);
  setVector(visualTarget, visualValues);
}

function syncViewerMarkers() {
  if (state.mode === "radiomap") {
    getViewer().setTx(state.radiomap.txVisual);
    getViewer().setRx(state.link.rxVisual);
    return;
  }
  getViewer().setTx(state.link.txVisual);
  const sample = state.mode === "mobility" ? state.mobility.result?.samples?.[state.mobility.selectedStep] : null;
  getViewer().setRx(sample?.rx_position || state.link.rxVisual);
}

function markerRadiusForPickTarget(target) {
  return target === "link-rx" ? getViewer().rxMarkerRadius : getViewer().txMarkerRadius;
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

function readRadiomapInputs() {
  setLogicalAndVisual(state.radiomap.tx, state.radiomap.txVisual, [
    Number(inputs.rmTxX.value),
    Number(inputs.rmTxY.value),
    Number(inputs.rmTxZ.value),
  ]);
  state.radiomap.surface.size = [Number(inputs.rmSizeX.value), Number(inputs.rmSizeY.value)];
  state.radiomap.surface.heightOffset = Number(inputs.rmHeightOffset.value);
  state.radiomap.surface.densityLevel = Number(inputs.rmDensityLevel.value);
  state.radiomap.display.colorMinDb = Number(inputs.rmColorMin.value);
  state.radiomap.display.colorMaxDb = Number(inputs.rmColorMax.value);
  readAntennaArrayInputs();
}

function readMobilityInputs() {
  readLinkInputs();
  state.mobility.trajectory.velocityMps = Number(inputs.mobilityVelocity.value);
  state.mobility.trajectory.timeStepS = Number(inputs.mobilityTimeStep.value);
  state.mobility.trajectory.maxSteps = Number(inputs.mobilityMaxSteps.value);
}

function radiomapColorRange() {
  const minDb = Number(state.radiomap.display.colorMinDb);
  const maxDb = Number(state.radiomap.display.colorMaxDb);
  if (!(minDb < maxDb)) {
    throw new Error("Radio map color range must satisfy Color Min < Color Max");
  }
  return {minDb, maxDb};
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

function formatExp(value, digits = 3) {
  return Number.isFinite(value) ? value.toExponential(digits) : "N/A";
}

function describeInteractionSequence(path) {
  return path.interaction_sequence?.length ? path.interaction_sequence.join(" -> ") : "LOS";
}

function renderPathDetails(paths, selectedIndex) {
  ui.pathDetailList.innerHTML = "";
  if (selectedIndex < 0 || selectedIndex >= paths.length) {
    ui.pathDetailSection.classList.add("hidden");
    return;
  }

  ui.pathDetailSection.classList.remove("hidden");
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
  typeTag.textContent = path.type;
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
  ui.pathSelectionSection.classList.add("hidden");
  ui.pathSelectionSection.setAttribute("aria-hidden", "true");
}

function renderPathSelection(paths, selectedIndex, onSelect) {
  ui.pathButtons.innerHTML = "";
  if (!paths.length) {
    clearPathSelection();
    return;
  }

  ui.pathSelectionSection.classList.remove("hidden");
  ui.pathSelectionSection.setAttribute("aria-hidden", "false");
  ui.pathSelectionCount.textContent = `${paths.length} ${paths.length === 1 ? "path" : "paths"}`;

  const addButton = (label, index) => {
    const button = document.createElement("button");
    button.className = "pbtn" + (selectedIndex === index ? " active" : "");
    button.textContent = label;
    button.addEventListener("click", () => onSelect(index));
    ui.pathButtons.appendChild(button);
  };

  addButton("All", -1);
  paths.forEach((_, index) => addButton(`Path ${index + 1}`, index));
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
  ui.linkTapChart.setAttribute("aria-label", "Channel tap power chart: x-axis Tap Index, y-axis Power in dB");
  const title = svgNode("title");
  title.textContent = "Channel tap power chart";
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
  if (!result || state.mode !== "link") {
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
      ui.pathDetailList.innerHTML = "";
      ui.pathDetailSection.classList.add("hidden");
    }
    return;
  }

  ui.linkChannelSection.classList.remove("hidden");
  ui.linkChannelSection.setAttribute("aria-hidden", "false");
  ui.resultDockTitle.textContent = "Link Results";
  ui.resultDockSubtitle.textContent = "Paths / Channel";
  ui.linkResult.style.display = "block";
  ui.mobilityResult.style.display = "none";
  ui.mobilityTimelineSection.classList.add("hidden");
  ui.mobilityTimelineSection.setAttribute("aria-hidden", "true");
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

  renderPathDetails(result.paths, state.link.selectedPath);
  renderPathSelection(result.paths, state.link.selectedPath, (index) => {
    state.link.selectedPath = index;
    getViewer().renderPaths(result.paths, index);
    renderLinkResult();
  });
}

const MOBILITY_METRICS = {
  received_power_db: {label: "Received Power", unit: "dB"},
  valid_paths: {label: "Valid Paths", unit: "paths"},
  max_abs_doppler_hz: {label: "Max Doppler", unit: "Hz"},
  peak_tap_power_db: {label: "Peak Tap", unit: "dB"},
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
      ui.pathDetailList.innerHTML = "";
      ui.pathDetailSection.classList.add("hidden");
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
  ui.resultDockSubtitle.textContent = "Rx trajectory / Channel";
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
    ui.pathDetailList.innerHTML = "";
    ui.pathDetailSection.classList.add("hidden");
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
  });
}

function renderRadiomapResult() {
  ui.radiomapResult.style.display = "block";
  ui.rmStatus.textContent = state.radiomap.status;
  ui.rmMetric.textContent = "path_gain";
  if (state.radiomap.result) {
    ui.rmGrid.textContent = `${state.radiomap.result.surface.cell_count.toLocaleString()} cells - D${state.radiomap.result.surface.density_level}`;
    ui.rmRange.textContent = `${state.radiomap.result.range.min.toFixed(1)} .. ${state.radiomap.result.range.max.toFixed(1)} dB | color ${state.radiomap.display.colorMinDb.toFixed(0)} .. ${state.radiomap.display.colorMaxDb.toFixed(0)} dB`;
  } else {
    ui.rmGrid.textContent = "--";
    ui.rmRange.textContent = "--";
  }
}
async function runLinkSolve() {
  readLinkInputs();
  getViewer().clearOverlay();
  showOverlay({
    title: "Solving Link",
    message: "Computing link paths with Sionna RT...",
    indeterminate: true,
  });
  try {
    const result = await solveLink({
      tx: {position: state.link.tx, orientation: [0, 0, 0]},
      rx: {position: state.link.rx, orientation: [0, 0, 0]},
      solver: linkSolverConfig(),
      channel: linkChannelConfig(),
    });
    state.link.result = result;
    state.link.selectedPath = -1;
    getViewer().renderPaths(result.paths, -1);
  } finally {
    hideOverlay();
    renderAll();
  }
}

function resetMobilityTrajectoryFromRx() {
  const [x, y, z] = state.link.rx;
  state.mobility.trajectory.points = [
    [x, y, z],
    [x + 15, y + 8, z],
  ];
  state.mobility.result = null;
  state.mobility.selectedStep = 0;
  state.mobility.selectedPath = -1;
}

function addCurrentRxWaypoint() {
  readLinkInputs();
  const point = [...state.link.rx];
  const points = state.mobility.trajectory.points;
  const last = points[points.length - 1];
  if (last && Math.hypot(point[0] - last[0], point[1] - last[1], point[2] - last[2]) < 1e-6) {
    return;
  }
  points.push(point);
  state.mobility.result = null;
  state.mobility.selectedStep = 0;
  state.mobility.selectedPath = -1;
  renderAll();
}

async function pollMobility(jobId) {
  while (true) {
    const job = await getMobilityJob(jobId);
    state.mobility.status = job.status;

    if (job.status === "succeeded") {
      state.mobility.result = await getMobilityResult(jobId);
      state.mobility.selectedStep = 0;
      state.mobility.selectedPath = -1;
      const sample = state.mobility.result.samples?.[0];
      getViewer().renderPaths(sample?.paths || [], -1);
      renderMobilityResult();
      hideOverlay();
      return;
    }

    if (job.status === "failed") {
      hideOverlay();
      throw new Error(job.error || job.message || "Mobility job failed");
    }

    showOverlay({
      title: "Running Mobility",
      message: job.message || "Computing Rx trajectory with Sionna RT...",
      indeterminate: true,
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
  if (!Number.isInteger(estimate.maxSteps) || estimate.maxSteps < 2 || estimate.maxSteps > 500) {
    throw new Error("Mobility Max Steps must be an integer between 2 and 500");
  }
  if (estimate.steps > estimate.maxSteps) {
    throw new Error(
      `Mobility trajectory computes ${estimate.steps} steps; increase Max Steps, increase Time Step, or shorten the trajectory`,
    );
  }

  stopMobilityPlayback();
  getViewer().clearOverlay();
  state.mobility.status = "Queued";
  state.mobility.result = null;
  state.mobility.selectedStep = 0;
  state.mobility.selectedPath = -1;
  renderMobilityTrajectoryPreview();
  showOverlay({
    title: "Running Mobility",
    message: "Submitting mobility job...",
    indeterminate: true,
  });

  const job = await createMobilityJob({
    tx: {position: state.link.tx, orientation: [0, 0, 0]},
    rx_trajectory: {
      points: state.mobility.trajectory.points,
      velocity_mps: state.mobility.trajectory.velocityMps,
      time_step_s: state.mobility.trajectory.timeStepS,
      max_steps: state.mobility.trajectory.maxSteps,
    },
    solver: linkSolverConfig(),
    channel: linkChannelConfig(),
  });

  state.mobility.jobId = job.job_id;
  await pollMobility(job.job_id);
}

async function pollRadiomap(jobId, colorRange) {
  while (true) {
    const job = await getRadiomapJob(jobId);
    state.radiomap.status = job.status;
    renderRadiomapResult();

    if (job.status === "succeeded") {
      state.radiomap.result = await getRadiomapResult(jobId);
      getViewer().renderRadiomap(state.radiomap.result, colorRange);
      renderRadiomapResult();
      hideOverlay();
      return;
    }

    if (job.status === "failed") {
      hideOverlay();
      throw new Error(job.message || "Radio map job failed");
    }

    showOverlay({
      title: "Running Radio Map",
      message: job.message || "Computing radio map with Sionna RT...",
      indeterminate: true,
    });
    await new Promise((resolve) => window.setTimeout(resolve, 1200));
  }
}

async function runRadiomap() {
  readRadiomapInputs();
  const colorRange = radiomapColorRange();
  getViewer().clearOverlay();

  state.radiomap.status = "Queued";
  state.radiomap.result = null;
  renderRadiomapResult();
  showOverlay({
    title: "Running Radio Map",
    message: "Submitting radio map job...",
    indeterminate: true,
  });

  const job = await createRadiomapJob({
    tx: {position: state.radiomap.tx, orientation: [0, 0, 0]},
    metric: "path_gain",
    surface: {
      type: "terrain_patch",
      size: state.radiomap.surface.size,
      height_offset: state.radiomap.surface.heightOffset,
      density_level: state.radiomap.surface.densityLevel,
    },
    solver: {
      ...commonSolverConfig(),
      samples_per_tx: 1000000,
    },
  });

  state.radiomap.jobId = job.job_id;
  await pollRadiomap(job.job_id, colorRange);
}

function applyPick(pick) {
  if (!pick || !state.pickTarget) {
    return;
  }

  if (state.pickTarget === "link-tx") {
    setLogicalAndVisual(state.link.tx, state.link.txVisual, pick.logicalPosition, pick.markerPosition);
  } else if (state.pickTarget === "link-rx") {
    setLogicalAndVisual(state.link.rx, state.link.rxVisual, pick.logicalPosition, pick.markerPosition);
  } else if (state.pickTarget === "rm-tx") {
    setLogicalAndVisual(state.radiomap.tx, state.radiomap.txVisual, pick.logicalPosition, pick.markerPosition);
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
    markerRadiusForPickTarget,
    readAntennaArrayInputs,
    readLinkInputs,
    readMobilityInputs,
    readRadiomapInputs,
    rerenderRadiomapOverlay,
    renderLinkResult,
    renderMobilityResult,
    renderMobilityTrajectoryPreview,
    renderRadiomapResult,
    runLinkSolve,
    runMobility,
    runRadiomap,
    addCurrentRxWaypoint,
    resetMobilityTrajectoryFromRx,
    selectMobilityStep,
    startMobilityPlayback,
    stopMobilityPlayback,
    applyPick,
  };
}
