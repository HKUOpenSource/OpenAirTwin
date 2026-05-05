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

  const {createRadiomapJob, getRadiomapJob, getRadiomapResult, solveLink} = api;

function commonSolverConfig() {
  return {
    frequency_hz: Number(inputs.cfgFrequency.value) * 1e9,
    max_depth: Number(inputs.cfgMaxDepth.value),
    los: inputs.cfgLos.checked,
    specular_reflection: inputs.cfgSpecular.checked,
    diffuse_reflection: inputs.cfgDiffuse.checked,
    refraction: inputs.cfgRefraction.checked,
    seed: Number(inputs.cfgSeed.value),
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
  syncLinkAdvancedInputs();
}


function setVector(target, values) {
  target.splice(0, target.length, ...values.map((value) => Number(value)));
}

function setLogicalAndVisual(logicalTarget, visualTarget, logicalValues, visualValues = logicalValues) {
  setVector(logicalTarget, logicalValues);
  setVector(visualTarget, visualValues);
}

function syncViewerMarkers() {
  getViewer().setTx(state.mode === "link" ? state.link.txVisual : state.radiomap.txVisual);
  getViewer().setRx(state.link.rxVisual);
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

function renderPathDetails(paths) {
  ui.pathDetailList.innerHTML = "";
  const selectedIndex = state.link.selectedPath;
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

  const width = 360;
  const height = 128;
  const left = 36;
  const right = 12;
  const top = 12;
  const bottom = 25;
  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;
  const maxPower = Math.max(...rows.map((row) => row.power));
  const minPower = Math.min(...rows.map((row) => row.power));
  let displayMin = Math.max(minPower, maxPower - 60);
  if (!(displayMin < maxPower)) {
    displayMin = maxPower - 1;
  }
  const scaleY = (value) => top + (1 - ((Math.max(value, displayMin) - displayMin) / (maxPower - displayMin))) * plotHeight;

  ui.linkTapChart.append(
    svgNode("line", {x1: left, y1: top, x2: left, y2: top + plotHeight, class: "tapAxis"}),
    svgNode("line", {x1: left, y1: top + plotHeight, x2: width - right, y2: top + plotHeight, class: "tapAxis"}),
  );

  for (const [label, value] of [["max", maxPower], ["min", displayMin]]) {
    const y = label === "max" ? top + 3 : top + plotHeight;
    const text = svgNode("text", {x: left - 7, y, class: "tapAxisLabel", "text-anchor": "end"});
    text.textContent = `${value.toFixed(0)} dB`;
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
    title.textContent = `tap ${row.index}: ${row.power.toFixed(2)} dB at ${formatDelay(row.delay)}`;
    rect.appendChild(title);
    ui.linkTapChart.appendChild(rect);
  });
}

function renderLinkChannel(channel) {
  if (!channel || state.mode !== "link") {
    ui.linkChannelSection.classList.add("hidden");
    ui.linkChannelSection.setAttribute("aria-hidden", "true");
    ui.linkTapChart.replaceChildren();
    return;
  }

  ui.linkChannelSection.classList.remove("hidden");
  ui.linkChannelSection.setAttribute("aria-hidden", "false");
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
  if (!result) {
    ui.linkResult.style.display = "none";
    renderLinkChannel(null);
    ui.pathButtons.innerHTML = "";
    ui.pathDetailList.innerHTML = "";
    ui.pathDetailSection.classList.add("hidden");
    return;
  }

  ui.linkResult.style.display = "block";
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

  ui.pathButtons.innerHTML = "";
  renderPathDetails(result.paths);
  if (!result.paths.length) {
    return;
  }

  const addButton = (label, index) => {
    const button = document.createElement("button");
    button.className = "pbtn" + (state.link.selectedPath === index ? " active" : "");
    button.textContent = label;
    button.addEventListener("click", () => {
      state.link.selectedPath = index;
      getViewer().renderPaths(result.paths, index);
      renderLinkResult();
    });
    ui.pathButtons.appendChild(button);
  };

  addButton("All", -1);
  result.paths.forEach((_, index) => addButton(`Path ${index + 1}`, index));
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
    commonSolverConfig,
    linkSolverConfig,
    linkChannelConfig,
    syncNumericInputs,
    syncViewerMarkers,
    markerRadiusForPickTarget,
    readLinkInputs,
    readRadiomapInputs,
    rerenderRadiomapOverlay,
    renderLinkResult,
    renderRadiomapResult,
    runLinkSolve,
    runRadiomap,
    applyPick,
  };
}
