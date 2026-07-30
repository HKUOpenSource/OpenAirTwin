import {
  drawRadarRangeDoppler,
  drawRadarRangeProfile,
  radarPowerScale,
  radarRangeDopplerHover,
} from "/js/features/radar/charts.js?v=20260723-radar-processing-views";
import {
  RADAR_CLUTTER_COLOR,
  RADAR_UNASSOCIATED_DETECTION_COLOR,
  RADAR_UNASSOCIATED_TARGET_COLOR,
  radarTargetColor,
} from "/js/features/radar/colors.js?v=20260722-radar-color-contract";
import {
  radarProcessingView,
  radarProcessingViewAvailable,
} from "/js/features/radar/processing_views.js?v=20260723-radar-processing-views";
import {
  radarAssetDisplayName,
  radarObservabilityLabel,
  radarTargetDisplayName,
} from "/js/features/radar/presentation.js?v=20260722-radar-ui-consistency";

const MAX_LIST_PATHS = 120;
const MAX_KEY_CLUTTER_DETECTIONS = 10;

function fmt(value, digits = 2, suffix = "") {
  return Number.isFinite(Number(value)) ? `${Number(value).toFixed(digits)}${suffix}` : "--";
}

function countLabel(count, singular, plural = `${singular}s`) {
  const value = Number(count) || 0;
  return `${value} ${value === 1 ? singular : plural}`;
}

function pathClassificationLabel(classification) {
  switch (classification) {
    case "target": return "Target Echo";
    case "clutter": return "Clutter";
    case "direct": return "Direct Tx–Rx Path";
    default: return String(classification || "Path");
  }
}

function buttonRow({title, meta, detail, selected, className = "", data = {}}) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = `radarResultRow oat-list-card oat-list-card--interactive ${className}${selected ? " selected" : ""}`;
  Object.entries(data).forEach(([key, value]) => { button.dataset[key] = value; });
  const heading = document.createElement("span");
  heading.className = "radarResultRowHead";
  const strong = document.createElement("strong"); strong.textContent = title;
  const small = document.createElement("small"); small.textContent = meta;
  heading.append(strong, small);
  const copy = document.createElement("span"); copy.textContent = detail;
  button.append(heading, copy);
  return button;
}

function visiblePathEntries(radar, result) {
  const entries = (result.paths || []).map((path, index) => ({path, index}));
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

export function createRadarResultView({state, ui, dom, renderAll, focusTarget}) {
  const radar = state.radar;
  let chartLayout = null;
  let rangeDopplerView = "focus";
  let detectionFilter = "all";
  let showAllDetections = false;
  let renderedResult = null;
  let powerScales = new Map();

  function activeProcessingView(result = radar.result) {
    return radarProcessingView(result, radar.processingView);
  }

  function selectTarget(targetId) {
    if (!targetId) return;
    radar.selectedTargetId = targetId;
    radar.selectedDetectionId = activeProcessingView().detections.find((item) => item.target_id === targetId)?.detection_id || null;
    radar.selectedPath = radar.result?.paths.findIndex((item) => item.target_ids?.includes(targetId)) ?? -1;
    renderAll();
    focusTarget?.(targetId);
  }

  function selectDetection(detectionId) {
    const detection = activeProcessingView().detections.find((item) => item.detection_id === detectionId);
    if (!detection) return;
    radar.selectedDetectionId = detectionId;
    if (detection.target_id) radar.selectedTargetId = detection.target_id;
    radar.selectedPath = detection.target_id ? radar.result.paths.findIndex((item) => item.target_ids?.includes(detection.target_id)) : -1;
    renderAll();
    if (detection.target_id) focusTarget?.(detection.target_id);
  }

  function selectPath(index) {
    const path = radar.result?.paths[index];
    if (!path) return;
    radar.selectedPath = index;
    if (path.target_ids?.[0]) {
      radar.selectedTargetId = path.target_ids[0];
      radar.selectedDetectionId = activeProcessingView().detections.find((item) => item.target_id === path.target_ids[0])?.detection_id || null;
    }
    renderAll();
    if (path.target_ids?.[0]) focusTarget?.(path.target_ids[0]);
  }

  function drawRangeDoppler(result, processingView) {
    const rd = rangeDopplerView === "focus" && processingView.rangeDopplerFocus
      ? processingView.rangeDopplerFocus
      : processingView.rangeDoppler;
    const legendTargetId = radar.selectedTargetId || result.targets?.[0]?.id;
    dom.radarPlotLegend?.style.setProperty("--radar-legend-target-color", radarTargetColor(legendTargetId));
    dom.radarPlotLegend?.style.setProperty("--radar-legend-clutter-color", RADAR_CLUTTER_COLOR);
    dom.radarPlotLegend?.style.setProperty("--radar-legend-unassociated-target-color", RADAR_UNASSOCIATED_TARGET_COLOR);
    dom.radarPlotLegend?.style.setProperty("--radar-legend-unassociated-detection-color", RADAR_UNASSOCIATED_DETECTION_COLOR);
    if (dom.radarPlotLegend) dom.radarPlotLegend.dataset.targetId = legendTargetId || "";
    if (!powerScales.has(processingView.id)) {
      powerScales.set(processingView.id, radarPowerScale({
        range_doppler: processingView.rangeDoppler,
        statistics: result.statistics,
      }));
    }
    chartLayout = drawRadarRangeDoppler({
      canvas: dom.radarRangeDopplerCanvas,
      result,
      rangeDoppler: rd,
      detections: processingView.detections,
      selectedDetectionId: radar.selectedDetectionId,
      selectedTargetId: radar.selectedTargetId,
      powerScale: powerScales.get(processingView.id),
    });
  }

  function drawRangeProfile(processingView) {
    const rd = rangeDopplerView === "focus" && processingView.rangeDopplerFocus
      ? processingView.rangeDopplerFocus
      : processingView.rangeDoppler;
    drawRadarRangeProfile({
      canvas: dom.radarRangeProfileCanvas,
      profile: processingView.rangeProfile,
      maxRangeM: rd.equivalent_range_axis_m?.at(-1) ?? null,
    });
  }

  function renderDetections(processingView) {
    dom.radarDetectionList.replaceChildren();
    const detections = processingView.detections;
    const summary = processingView.detectionSummary;
    if (!detections.length) {
      dom.radarDetectionCount.textContent = "0";
      dom.radarDetectionMore.classList.add("hidden");
      const empty = document.createElement("p"); empty.className = "radarEmptyState oat-empty-state"; empty.textContent = "No detections passed the CA-CFAR threshold."; dom.radarDetectionList.append(empty); return;
    }
    const targets = detections.filter((item) => item.classification === "target" || item.target_id);
    const clutter = detections.filter((item) => item.classification !== "target" && !item.target_id);
    const boundedClutter = showAllDetections ? clutter : clutter.slice(0, MAX_KEY_CLUTTER_DETECTIONS);
    const visible = detectionFilter === "target" ? targets : detectionFilter === "clutter" ? boundedClutter : [...targets, ...boundedClutter];
    const filterTotal = detectionFilter === "target" ? targets.length : detectionFilter === "clutter" ? clutter.length : detections.length;
    const canExpand = detectionFilter !== "target" && clutter.length > MAX_KEY_CLUTTER_DETECTIONS;
    dom.radarDetectionCount.textContent = `${visible.length} / ${filterTotal}${summary.detections_truncated ? "+" : ""}`;
    dom.radarDetectionMore.classList.toggle("hidden", !canExpand);
    dom.radarDetectionMore.textContent = showAllDetections ? "Show strongest only" : `Show all ${clutter.length}`;
    visible.forEach((item) => dom.radarDetectionList.append(buttonRow({
      title: item.target_id ? radarTargetDisplayName(item.target_id) : item.classification === "target" ? "Unassociated Target" : item.classification === "clutter" ? "Clutter Detection" : "Unassociated Detection",
      meta: `Range ${fmt(item.equivalent_range_m, 2, " m")} · Radial velocity ${fmt(item.equivalent_radial_velocity_mps, 2, " m/s")}`,
      detail: `SNR ${fmt(item.snr_db, 1, " dB")} · Arrival azimuth ${fmt(item.arrival_azimuth_deg, 1, "°")}`,
      selected: item.detection_id === radar.selectedDetectionId, className: item.classification === "target" || item.target_id ? "associated" : item.classification === "clutter" ? "path-clutter" : "unassociated", data: {detectionId: item.detection_id},
    })));
  }

  function renderTruth(result) {
    dom.radarTruthList.replaceChildren();
    if (!result.targets.length) {
      const empty = document.createElement("p"); empty.className = "radarEmptyState oat-empty-state"; empty.textContent = "No targets were configured for this solve."; dom.radarTruthList.append(empty); return;
    }
    result.targets.forEach((target) => dom.radarTruthList.append(buttonRow({
      title: radarTargetDisplayName(target.id), meta: radarAssetDisplayName(radar.assets, target.asset_id),
      detail: `${radarObservabilityLabel(target.observability?.status)} · Position [${target.position_m.map((value) => fmt(value, 1)).join(", ")}] m · Speed ${fmt(Math.hypot(...target.velocity_mps), 1, " m/s")} · RCS ${fmt(target.rcs_m2, 4, " m²")}`,
      selected: target.id === radar.selectedTargetId, data: {targetId: target.id},
    })));
  }

  function renderPaths(result) {
    dom.radarPathList.replaceChildren();
    if (!result.paths.length) {
      dom.radarPathCount.textContent = "0";
      const empty = document.createElement("p"); empty.className = "radarEmptyState oat-empty-state"; empty.textContent = "No propagation paths returned."; dom.radarPathList.append(empty); return;
    }
    const entries = visiblePathEntries(radar, result);
    dom.radarPathCount.textContent = `${entries.length} / ${result.summary.returned_path_count}${result.summary.paths_truncated ? "+" : ""}`;
    entries.slice(0, MAX_LIST_PATHS).forEach(({path, index}) => dom.radarPathList.append(buttonRow({
      title: pathClassificationLabel(path.classification), meta: path.target_ids.map(radarTargetDisplayName).join(", ") || path.path_id,
      detail: `Range ${fmt(path.equivalent_range_m, 2, " m")} · Doppler ${fmt(path.doppler_hz, 1, " Hz")} · Gain ${fmt(path.path_gain_db, 1, " dB")}`,
      selected: index === radar.selectedPath, className: `path-${path.classification}`, data: {pathIndex: index},
    })));
    if (entries.length > MAX_LIST_PATHS) {
      const note = document.createElement("p"); note.className = "radarListNote"; note.textContent = `Showing the first ${MAX_LIST_PATHS} of ${entries.length} visible paths.`; dom.radarPathList.append(note);
    }
  }

  function hideOtherResultSections() {
    for (const child of ui.channelAnalysisScroll.children) {
      if (child !== dom.radarResultSections) child.classList.add("radarSiblingHidden");
    }
  }

  function restoreOtherResultSections() {
    for (const child of ui.channelAnalysisScroll.children) child.classList.remove("radarSiblingHidden");
    ui.linkChannelSection.classList.remove("radarResultMode");
  }

  function renderRadarResult() {
    if (state.mode !== "radar") {
      restoreOtherResultSections();
      dom.radarResultSections.classList.add("hidden");
      dom.radarResultSections.setAttribute("aria-hidden", "true");
      return;
    }
    hideOtherResultSections();
    const result = radar.result;
    ui.resultDockTitle.textContent = "Radar Sensing Results";
    ui.resultDockSubtitle.textContent = "Range–Doppler & CA-CFAR";
    if (!result) {
      ui.linkChannelSection.classList.remove("radarResultMode");
      dom.radarResultSections.classList.add("hidden");
      dom.radarResultSections.setAttribute("aria-hidden", "true");
      ui.linkChannelSection.classList.add("hidden");
      ui.linkChannelSection.setAttribute("aria-hidden", "true");
      return;
    }
    ui.linkChannelSection.classList.remove("hidden");
    ui.linkChannelSection.classList.add("radarResultMode");
    ui.linkChannelSection.setAttribute("aria-hidden", "false");
    dom.radarResultSections.classList.remove("hidden");
    dom.radarResultSections.setAttribute("aria-hidden", "false");
    dom.radarResult.style.display = "block";
    if (renderedResult !== result) {
      renderedResult = result;
      radar.processingView = "raw";
      detectionFilter = "all";
      showAllDetections = false;
      powerScales = new Map();
      dom.radarDetectionFilter.value = detectionFilter;
    }
    const processingView = activeProcessingView(result);
    dom.radarPathDisplayMode.value = radar.pathDisplayMode;
    dom.radarPathDisplayHint.textContent = radar.pathDisplayMode === "target"
      ? "Only target echo paths are shown in 3D."
      : radar.pathDisplayMode === "all"
        ? "All returned target, clutter, and direct paths are shown."
        : `Target echoes plus the ${radar.keyClutterLimit} strongest clutter paths.`;
    const targetDetectionCount = processingView.detectionSummary.target_detection_count ?? processingView.detections.filter((item) => item.target_id).length;
    dom.radarDetectionMetric.textContent = `${countLabel(targetDetectionCount, "target detection")} · ${processingView.detectionSummary.total_detection_count} total`;
    dom.radarPathMetric.textContent = `${result.summary.total_target_path_count} target · ${result.summary.total_clutter_path_count} clutter`;
    dom.radarSnrMetric.textContent = fmt(processingView.peakSnrDb, 1, " dB");
    dom.radarNoiseMetric.textContent = fmt(result.statistics.noise_power_dbm, 1, " dBm");
    if (!processingView.rangeDopplerFocus) rangeDopplerView = "full";
    const displayedRd = rangeDopplerView === "focus" ? processingView.rangeDopplerFocus : processingView.rangeDoppler;
    dom.radarRdMeta.textContent = `${processingView.label.toUpperCase()} · ${rangeDopplerView === "focus" ? "TARGET DETAIL" : "SCENE OVERVIEW"}`;
    dom.radarRdTruncated.classList.toggle("hidden", !displayedRd.truncated);
    for (const [viewId, button] of [["raw", dom.radarRdRaw], ["mean_subtracted", dom.radarRdMean], ["ideal_clutter_cancelled", dom.radarRdIdeal]]) {
      button.disabled = !radarProcessingViewAvailable(result, viewId);
      button.classList.toggle("active", processingView.id === viewId);
      button.setAttribute("aria-pressed", processingView.id === viewId ? "true" : "false");
    }
    dom.radarRdProcessingHint.textContent = processingView.hint;
    dom.radarRdFocus.classList.toggle("active", rangeDopplerView === "focus");
    dom.radarRdFull.classList.toggle("active", rangeDopplerView === "full");
    dom.radarRdFocus.disabled = !processingView.rangeDopplerFocus;
    drawRangeDoppler(result, processingView); drawRangeProfile(processingView); renderDetections(processingView); renderTruth(result); renderPaths(result);
  }

  function selectProcessingView(viewId) {
    if (!radarProcessingViewAvailable(radar.result, viewId)) return;
    radar.processingView = viewId;
    const processingView = activeProcessingView();
    if (!processingView.detections.some((item) => item.detection_id === radar.selectedDetectionId)) {
      const preferred = processingView.detections.find((item) => item.target_id || item.classification === "target");
      radar.selectedDetectionId = preferred?.detection_id || null;
    }
    renderAll();
  }

  function attachEvents() {
    dom.radarDetectionList.addEventListener("click", (event) => { const row = event.target.closest("[data-detection-id]"); if (row) selectDetection(row.dataset.detectionId); });
    dom.radarTruthList.addEventListener("click", (event) => { const row = event.target.closest("[data-target-id]"); if (row) selectTarget(row.dataset.targetId); });
    dom.radarPathList.addEventListener("click", (event) => { const row = event.target.closest("[data-path-index]"); if (row) selectPath(Number(row.dataset.pathIndex)); });
    dom.radarRdRaw.addEventListener("click", () => selectProcessingView("raw"));
    dom.radarRdMean.addEventListener("click", () => selectProcessingView("mean_subtracted"));
    dom.radarRdIdeal.addEventListener("click", () => selectProcessingView("ideal_clutter_cancelled"));
    dom.radarRdFocus.addEventListener("click", () => { if (!activeProcessingView().rangeDopplerFocus) return; rangeDopplerView = "focus"; renderRadarResult(); });
    dom.radarRdFull.addEventListener("click", () => { rangeDopplerView = "full"; renderRadarResult(); });
    dom.radarDetectionFilter.addEventListener("change", () => { detectionFilter = dom.radarDetectionFilter.value; showAllDetections = false; renderRadarResult(); });
    dom.radarDetectionMore.addEventListener("click", () => { showAllDetections = !showAllDetections; renderRadarResult(); });
    dom.radarRangeDopplerCanvas.addEventListener("mousemove", (event) => {
      const rect = dom.radarRangeDopplerCanvas.getBoundingClientRect();
      const x = event.clientX - rect.left; const y = event.clientY - rect.top;
      const cell = radarRangeDopplerHover(chartLayout, x, y);
      dom.radarRdHover.textContent = cell
        ? `Range ${fmt(cell.rangeM, 2, " m")} · Doppler ${fmt(cell.dopplerHz, 1, " Hz")} · Power ${fmt(cell.powerDbm, 1, " dBm")}`
        : "Hover for range, Doppler, and power.";
      dom.radarChartCrosshair.classList.toggle("hidden", !cell);
      if (cell) {
        dom.radarChartCrosshair.style.setProperty("--radar-crosshair-x", `${x}px`);
        dom.radarChartCrosshair.style.setProperty("--radar-crosshair-y", `${y}px`);
        dom.radarChartTooltip.style.left = `${Math.min(Math.max(8, x + 12), Math.max(8, rect.width - 164))}px`;
        dom.radarChartTooltip.style.top = `${Math.max(8, y - 48)}px`;
        dom.radarChartTooltip.textContent = `Range ${fmt(cell.rangeM, 2, " m")} · Doppler ${fmt(cell.dopplerHz, 1, " Hz")} · Power ${fmt(cell.powerDbm, 1, " dBm")}`;
      }
    });
    dom.radarRangeDopplerCanvas.addEventListener("mouseleave", () => { dom.radarRdHover.textContent = "Hover for range, Doppler, and power."; dom.radarChartCrosshair.classList.add("hidden"); });
    dom.radarRangeDopplerCanvas.addEventListener("click", (event) => {
      const rect = dom.radarRangeDopplerCanvas.getBoundingClientRect(); const x = event.clientX - rect.left; const y = event.clientY - rect.top;
      const closest = chartLayout?.points.map((point) => ({...point, distance: Math.hypot(point.x - x, point.y - y)})).sort((a, b) => a.distance - b.distance)[0];
      if (closest?.distance <= 18) {
        if (closest.type === "target") selectTarget(closest.id);
        else selectDetection(closest.id);
      }
    });
  }

  return Object.freeze({attachEvents, renderRadarResult, restoreOtherResultSections, selectDetection, selectPath, selectTarget});
}
