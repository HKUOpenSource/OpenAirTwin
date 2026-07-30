import {formatExp, formatFixed, svgNode} from "/js/ui/result_formatters.js?v=20260519-mode-isolation";

const PATH_TYPE_LABELS = {
  LOS: "Line-of-sight",
  SPECULAR: "Specular",
  DIFFUSE: "Diffuse",
  DIFFRACTION: "Diffraction",
  REFRACTION: "Refraction",
  MIXED: "Mixed interactions",
};

function describeInteractionSequence(path) {
  return path.interaction_sequence?.length ? path.interaction_sequence.join(" -> ") : "LOS";
}

function pathVariantCount(path) {
  const count = Number(path.raw_path_count);
  return Number.isFinite(count) && count > 1 ? Math.round(count) : 0;
}

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

function formatDelay(delaySeconds) {
  const value = Number(delaySeconds);
  if (!Number.isFinite(value)) {
    return "N/A";
  }
  const ns = value * 1e9;
  return `${ns.toFixed(Math.abs(ns) >= 10 ? 1 : 2)} ns`;
}

function detailField(id, label, value, wide = false) {
  return {id, label, value, wide};
}

export function createPathResultsViewModel(paths, selectedIndex, summary = null, featureId = "link") {
  if (!paths.length) {
    return {
      visible: false,
      featureId,
      countLabel: "0 paths",
      meta: "",
      selectedIndex: -1,
      rows: [],
      detail: null,
    };
  }
  const rows = paths.map((path, index) => {
    const variants = pathVariantCount(path);
    const typeLabel = formatPathTypeLabel(path);
    const gain = formatPathGainValue(path);
    const delay = formatPathDelayValue(path);
    return {
      index,
      name: `Path ${index + 1}`,
      typeLabel,
      typeClassName: pathTypeClass(path),
      variantLabel: variants > 1 ? `${variants} variants` : null,
      gain,
      delay,
      ariaLabel: `Path ${index + 1}, ${typeLabel}, path gain ${gain}, delay ${delay}`,
      selected: selectedIndex === index,
    };
  });
  const path = selectedIndex >= 0 && selectedIndex < paths.length ? paths[selectedIndex] : null;
  const variants = path ? pathVariantCount(path) : 0;
  const fields = path ? [
    detailField("interaction", "Interaction Chain", describeInteractionSequence(path), true),
    ...(variants > 1 ? [
      detailField("variants", "Variants", `${variants} variants`),
      detailField("raw-paths", "Raw Paths", formatRawPathIndices(path), true),
      detailField("representative", "Representative", String(path.representative_path_index ?? path.path_index ?? "N/A")),
    ] : []),
    detailField("gain", "Path Gain", formatFixed(path.path_gain_db, 2, " dB")),
    detailField("power", "Power (Linear)", formatExp(path.path_gain_linear)),
    detailField("array-pairs", "Array Pairs", String(path.array_pair_count ?? 1)),
    detailField("strongest-pair", "Strongest Pair", formatFixed(path.strongest_pair_power_db, 2, " dB")),
    detailField("coefficient-abs", "|a|", formatExp(path.coefficient_abs)),
    detailField("phase", "Phase", formatFixed(path.coefficient_phase_deg, 1, " deg")),
    detailField("delay", "Delay", formatFixed(path.delay_ns, 2, " ns")),
    detailField("length", "Length", formatFixed(path.path_length_m, 2, " m")),
    detailField("doppler", "Doppler", formatFixed(path.doppler_hz, 2, " Hz")),
    detailField("aod", "AoD (zen/azi)", `${formatFixed(path.departure_zenith_deg, 1)} / ${formatFixed(path.departure_azimuth_deg, 1)} deg`),
    detailField("aoa", "AoA (zen/azi)", `${formatFixed(path.arrival_zenith_deg, 1)} / ${formatFixed(path.arrival_azimuth_deg, 1)} deg`),
    detailField("real", "Re(a)", formatExp(path.coefficient_real)),
    detailField("imaginary", "Im(a)", formatExp(path.coefficient_imag)),
  ] : [];
  return {
    visible: true,
    featureId,
    countLabel: formatPathSelectionCount(paths, summary),
    meta: formatPathSelectionMeta(paths, summary),
    selectedIndex,
    rows,
    detail: path ? {
      title: `Path ${selectedIndex + 1}`,
      typeLabel: formatPathTypeLabel(path),
      fields,
    } : null,
  };
}

export function createChannelViewModel(channel) {
  if (!channel) {
    return {
      visible: false,
      metrics: [
        {id: "tap-total", valueId: "linkTapTotalPower", label: "Total Tap Power", value: "--"},
        {id: "tap-peak", valueId: "linkTapPeak", label: "Strongest Tap", value: "--"},
        {id: "cir-count", valueId: "linkCirCoeffCount", label: "Channel Coefficients", value: "--"},
        {id: "cir-strongest", valueId: "linkCirStrongest", label: "Largest Coefficient |h|", value: "--"},
      ],
    };
  }
  const peakPower = Number(channel.peak_tap_power_db);
  const peak = channel.peak_tap_index === null
    || channel.peak_tap_index === undefined
    || !Number.isFinite(peakPower)
    ? "N/A"
    : `${channel.peak_tap_index} / ${peakPower.toFixed(2)} dB`;
  const cirSummary = channel.cir_summary || {};
  return {
    visible: true,
    metrics: [
      {id: "tap-total", valueId: "linkTapTotalPower", label: "Total Tap Power", value: Number.isFinite(channel.total_power_db) ? `${channel.total_power_db.toFixed(2)} dB` : "N/A"},
      {id: "tap-peak", valueId: "linkTapPeak", label: "Strongest Tap", value: peak},
      {id: "cir-count", valueId: "linkCirCoeffCount", label: "Channel Coefficients", value: String(cirSummary.coefficient_count ?? "--")},
      {id: "cir-strongest", valueId: "linkCirStrongest", label: "Largest Coefficient |h|", value: formatExp(Number(cirSummary.strongest_coefficient_abs))},
    ],
  };
}

export function drawLinkTapChart(svg, channel) {
  svg.replaceChildren();
  if (!channel) return;
  const indices = Array.isArray(channel.tap_indices) ? channel.tap_indices : [];
  const powers = Array.isArray(channel.power_db) ? channel.power_db.map(Number) : [];
  const delays = Array.isArray(channel.delays_s) ? channel.delays_s : [];
  const rows = indices
    .map((index, i) => ({index, power: powers[i], delay: delays[i]}))
    .filter((row) => Number.isFinite(row.power));
  if (!rows.length) return;

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
  if (!(displayMin < maxPower)) displayMin = maxPower - 1;
  const scaleY = (value) => top + (1 - ((Math.max(value, displayMin) - displayMin) / (maxPower - displayMin))) * plotHeight;

  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.setAttribute("aria-label", "Power delay profile chart: x-axis Tap Index, y-axis Power in dB");
  const title = svgNode("title");
  title.textContent = "Power delay profile chart";
  const desc = svgNode("desc");
  desc.textContent = "X-axis shows Tap Index. Y-axis shows tap power in dB. Delay is available in each bar tooltip.";
  svg.append(title, desc);

  const yTicks = [maxPower, (maxPower + displayMin) / 2, displayMin];
  for (const value of yTicks) {
    const y = scaleY(value);
    svg.appendChild(svgNode("line", {x1: left, y1: y, x2: width - right, y2: y, class: "tapGrid"}));
  }
  const yAxisTitle = svgNode("text", {x: 15, y: top + (plotHeight / 2), class: "tapAxisTitle", "text-anchor": "middle", transform: `rotate(-90 15 ${top + (plotHeight / 2)})`});
  yAxisTitle.textContent = "Power (dB)";
  const xAxisTitle = svgNode("text", {x: left + (plotWidth / 2), y: height - 10, class: "tapAxisTitle", "text-anchor": "middle"});
  xAxisTitle.textContent = "Tap Index";
  svg.append(
    svgNode("line", {x1: left, y1: top, x2: left, y2: top + plotHeight, class: "tapAxis"}),
    svgNode("line", {x1: left, y1: top + plotHeight, x2: width - right, y2: top + plotHeight, class: "tapAxis"}),
    yAxisTitle,
    xAxisTitle,
  );
  for (const value of yTicks) {
    const text = svgNode("text", {x: left - 9, y: scaleY(value), class: "tapAxisLabel", "text-anchor": "end", "dominant-baseline": "middle"});
    text.textContent = `${value.toFixed(0)} dB`;
    svg.appendChild(text);
  }
  const barGap = Math.min(4, plotWidth / rows.length * 0.25);
  const barWidth = Math.max(2, (plotWidth / rows.length) - barGap);
  rows.forEach((row, i) => {
    const x = left + i * (plotWidth / rows.length) + barGap / 2;
    const y = scaleY(row.power);
    const rect = svgNode("rect", {x, y, width: barWidth, height: Math.max(1, top + plotHeight - y), class: row.index === channel.peak_tap_index ? "tapBar peak" : "tapBar"});
    const tooltip = svgNode("title");
    tooltip.textContent = `Tap ${row.index}\nPower: ${row.power.toFixed(2)} dB\nDelay: ${formatDelay(row.delay)}`;
    rect.appendChild(tooltip);
    svg.appendChild(rect);
  });
  const peakRowIndex = rows.findIndex((row) => row.index === channel.peak_tap_index);
  const xTicks = [
    {row: rows[0], i: 0},
    {row: peakRowIndex >= 0 ? rows[peakRowIndex] : null, i: peakRowIndex},
    {row: rows[rows.length - 1], i: rows.length - 1},
  ];
  const seen = new Set();
  for (const tick of xTicks) {
    if (!tick.row || tick.i < 0 || seen.has(tick.i)) continue;
    seen.add(tick.i);
    const x = left + (tick.i + 0.5) * (plotWidth / rows.length);
    const label = svgNode("text", {x, y: top + plotHeight + 18, class: tick.row.index === channel.peak_tap_index ? "tapAxisLabel tapPeakLabel" : "tapAxisLabel", "text-anchor": "middle"});
    label.textContent = String(tick.row.index);
    svg.append(svgNode("line", {x1: x, y1: top + plotHeight, x2: x, y2: top + plotHeight + 5, class: "tapAxis"}), label);
  }
}

export function createLinkResultView({state, ui, getViewer, resultDock}) {
  const unregisterCommands = resultDock.registerCommandHandler("link", (command) => {
    if (command.name !== "link.path.select") return;
    const result = state.link.result;
    if (!result) return;
    const index = Number(command.payload?.index);
    state.link.selectedPath = Number.isInteger(index) ? index : -1;
    getViewer().renderPaths(result.paths, state.link.selectedPath);
    renderLinkResult();
  });

  function syncLivePreviewStatusUi() {
    const visible = state.livePreview.status !== "Idle"
      && state.livePreview.mode === "link"
      && state.mode === "link";
    ui.livePreviewStatus.classList.toggle("hidden", !visible);
    ui.livePreviewStatus.textContent = visible ? state.livePreview.status : "Idle";
  }

  function renderLinkResult() {
    const result = state.link.result;
    const liveActive = state.mode === "link"
      && state.livePreview.mode === "link"
      && state.livePreview.status !== "Idle";
    const visible = state.mode === "link" && (Boolean(result) || liveActive);
    syncLivePreviewStatusUi();
    if (state.mode === "link") {
      ui.linkChannelSection.classList.toggle("hidden", !visible);
      ui.linkChannelSection.classList.remove("radarResultMode");
      ui.linkChannelSection.setAttribute("aria-hidden", String(!visible));
      if (visible) {
        ui.resultDockTitle.textContent = "Link Results";
        ui.resultDockSubtitle.textContent = "Path Gains & Taps";
      } else if (!result) {
        getViewer().clearPaths();
      }
    } else if (!["mobility", "radiomap", "radar"].includes(state.mode)) {
      ui.linkChannelSection.classList.add("hidden");
      ui.linkChannelSection.classList.remove("radarResultMode");
      ui.linkChannelSection.setAttribute("aria-hidden", "true");
    }
    const hasLos = (result?.summary?.los_paths ?? 0) > 0;
    const channel = createChannelViewModel(result?.channel);
    const paths = createPathResultsViewModel(
      result?.paths || [],
      state.link.selectedPath,
      result?.summary,
      "link",
    );
    resultDock.update("link", {
      status: result ? "success" : liveActive ? "loading" : "empty",
      visible,
      summary: [
        {id: "link-power", valueId: "linkPower", label: "Total Path Gain", value: result && Number.isFinite(result.summary.received_power_db) ? `${result.summary.received_power_db.toFixed(2)} dB` : result ? "N/A" : "--"},
        {id: "link-best", valueId: "linkBest", label: "Strongest Path Gain", value: result && Number.isFinite(result.summary.strongest_path_db) ? `${result.summary.strongest_path_db.toFixed(2)} dB` : result ? "N/A" : "--"},
        {id: "link-paths", valueId: "linkPaths", label: "Paths", value: result ? String(result.summary.valid_paths ?? 0) : "--"},
        {id: "link-los", valueId: "linkLos", label: "Line of Sight", value: result ? (hasLos ? "Yes" : "No") : "--", valueClassName: `pill ${hasLos ? "yes" : "no"} oat-badge`},
      ],
      channel,
      paths,
    }, ["link", "mobility", "radiomap", "radar"].includes(state.mode) ? state.mode : null);
    const chart = resultDock.element("linkTapChart");
    if (state.mode === "link") drawLinkTapChart(chart, result?.channel || null);
    if (result && state.mode === "link") getViewer().renderPaths(result.paths, state.link.selectedPath);
  }

  return {
    createChannelViewModel,
    createPathResultsViewModel,
    dispose: unregisterCommands,
    drawLinkTapChart,
    renderLinkResult,
    syncLivePreviewStatusUi,
  };
}
