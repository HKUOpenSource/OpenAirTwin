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
const PROCESSING_OPTIONS = [
  {id: "raw", label: "Raw"},
  {id: "mean_subtracted", label: "Mean-subtracted"},
  {id: "ideal_clutter_cancelled", label: "Ideal Clutter-cancelled"},
];

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

function emptyModel() {
  return {
    status: "empty",
    visible: false,
    summary: [
      {id: "detections", label: "Detections", value: "--", valueId: "radarDetectionMetric"},
      {id: "paths", label: "Propagation Paths", value: "--", valueId: "radarPathMetric"},
      {id: "snr", label: "Peak SNR", value: "--", valueId: "radarSnrMetric"},
      {id: "noise", label: "Noise Power", value: "--", valueId: "radarNoiseMetric"},
    ],
    rangeDoppler: {
      meta: "Power heatmap with CA-CFAR detections",
      truncated: false,
      processingView: "raw",
      processingHint: "No additional clutter suppression; configured direct-path cancellation still applies.",
      processingOptions: PROCESSING_OPTIONS.map((option) => ({...option, available: option.id === "raw"})),
      viewport: "focus",
      focusAvailable: false,
    },
    detectionFilter: "all",
    detectionCount: "0",
    detectionMoreLabel: "Show all",
    detectionMoreVisible: false,
    detectionEmptyMessage: "",
    detections: [],
    truthEmptyMessage: "",
    truth: [],
    pathDisplayMode: "key",
    pathDisplayHint: "Target echoes plus the 12 strongest clutter paths.",
    pathCount: "0",
    pathEmptyMessage: "",
    paths: [],
    pathNote: "",
  };
}

export function createRadarResultView({state, ui, renderAll, focusTarget, resultDock}) {
  const radar = state.radar;
  let chartLayout = null;
  let rangeDopplerView = "focus";
  let detectionFilter = "all";
  let showAllDetections = false;
  let renderedResult = null;
  let powerScales = new Map();
  let eventController = null;

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

  function detectionRows(processingView) {
    const detections = processingView.detections;
    if (!detections.length) {
      return {count: "0", moreVisible: false, rows: [], emptyMessage: "No detections passed the CA-CFAR threshold."};
    }
    const targets = detections.filter((item) => item.classification === "target" || item.target_id);
    const clutter = detections.filter((item) => item.classification !== "target" && !item.target_id);
    const boundedClutter = showAllDetections ? clutter : clutter.slice(0, MAX_KEY_CLUTTER_DETECTIONS);
    const visible = detectionFilter === "target" ? targets : detectionFilter === "clutter" ? boundedClutter : [...targets, ...boundedClutter];
    const filterTotal = detectionFilter === "target" ? targets.length : detectionFilter === "clutter" ? clutter.length : detections.length;
    return {
      count: `${visible.length} / ${filterTotal}${processingView.detectionSummary.detections_truncated ? "+" : ""}`,
      moreVisible: detectionFilter !== "target" && clutter.length > MAX_KEY_CLUTTER_DETECTIONS,
      rows: visible.map((item) => ({
        id: `detection-${item.detection_id}`,
        title: item.target_id ? radarTargetDisplayName(item.target_id) : item.classification === "target" ? "Unassociated Target" : item.classification === "clutter" ? "Clutter Detection" : "Unassociated Detection",
        meta: `Range ${fmt(item.equivalent_range_m, 2, " m")} · Radial velocity ${fmt(item.equivalent_radial_velocity_mps, 2, " m/s")}`,
        detail: `SNR ${fmt(item.snr_db, 1, " dB")} · Arrival azimuth ${fmt(item.arrival_azimuth_deg, 1, "°")}`,
        selected: item.detection_id === radar.selectedDetectionId,
        className: item.classification === "target" || item.target_id ? "associated" : item.classification === "clutter" ? "path-clutter" : "unassociated",
        dataAttribute: "detectionId",
        dataValue: item.detection_id,
      })),
      emptyMessage: "",
    };
  }

  function truthRows(result) {
    return result.targets.map((target) => ({
      id: `target-${target.id}`,
      title: radarTargetDisplayName(target.id),
      meta: radarAssetDisplayName(radar.assets, target.asset_id),
      detail: `${radarObservabilityLabel(target.observability?.status)} · Position [${target.position_m.map((value) => fmt(value, 1)).join(", ")}] m · Speed ${fmt(Math.hypot(...target.velocity_mps), 1, " m/s")} · RCS ${fmt(target.rcs_m2, 4, " m²")}`,
      selected: target.id === radar.selectedTargetId,
      className: "",
      dataAttribute: "targetId",
      dataValue: target.id,
    }));
  }

  function pathRows(result) {
    if (!result.paths.length) {
      return {count: "0", rows: [], emptyMessage: "No propagation paths returned.", note: ""};
    }
    const entries = visiblePathEntries(radar, result);
    return {
      count: `${entries.length} / ${result.summary.returned_path_count}${result.summary.paths_truncated ? "+" : ""}`,
      rows: entries.slice(0, MAX_LIST_PATHS).map(({path, index}) => ({
        id: `path-${index}`,
        title: pathClassificationLabel(path.classification),
        meta: path.target_ids.map(radarTargetDisplayName).join(", ") || path.path_id,
        detail: `Range ${fmt(path.equivalent_range_m, 2, " m")} · Doppler ${fmt(path.doppler_hz, 1, " Hz")} · Gain ${fmt(path.path_gain_db, 1, " dB")}`,
        selected: index === radar.selectedPath,
        className: `path-${path.classification}`,
        dataAttribute: "pathIndex",
        dataValue: String(index),
      })),
      emptyMessage: "",
      note: entries.length > MAX_LIST_PATHS ? `Showing the first ${MAX_LIST_PATHS} of ${entries.length} visible paths.` : "",
    };
  }

  function drawRangeDoppler(result, processingView) {
    const rangeDoppler = rangeDopplerView === "focus" && processingView.rangeDopplerFocus
      ? processingView.rangeDopplerFocus
      : processingView.rangeDoppler;
    const legend = resultDock.element("radarPlotLegend");
    const legendTargetId = radar.selectedTargetId || result.targets?.[0]?.id;
    legend.style.setProperty("--radar-legend-target-color", radarTargetColor(legendTargetId));
    legend.style.setProperty("--radar-legend-clutter-color", RADAR_CLUTTER_COLOR);
    legend.style.setProperty("--radar-legend-unassociated-target-color", RADAR_UNASSOCIATED_TARGET_COLOR);
    legend.style.setProperty("--radar-legend-unassociated-detection-color", RADAR_UNASSOCIATED_DETECTION_COLOR);
    legend.dataset.targetId = legendTargetId || "";
    if (!powerScales.has(processingView.id)) {
      powerScales.set(processingView.id, radarPowerScale({range_doppler: processingView.rangeDoppler, statistics: result.statistics}));
    }
    chartLayout = drawRadarRangeDoppler({
      canvas: resultDock.element("radarRangeDopplerCanvas"),
      result,
      rangeDoppler,
      detections: processingView.detections,
      selectedDetectionId: radar.selectedDetectionId,
      selectedTargetId: radar.selectedTargetId,
      powerScale: powerScales.get(processingView.id),
    });
  }

  function drawRangeProfile(processingView) {
    const rangeDoppler = rangeDopplerView === "focus" && processingView.rangeDopplerFocus
      ? processingView.rangeDopplerFocus
      : processingView.rangeDoppler;
    drawRadarRangeProfile({
      canvas: resultDock.element("radarRangeProfileCanvas"),
      profile: processingView.rangeProfile,
      maxRangeM: rangeDoppler.equivalent_range_axis_m?.at(-1) ?? null,
    });
  }

  function restoreOtherResultSections() {
    ui.linkChannelSection.classList.remove("radarResultMode");
  }

  function renderRadarResult() {
    if (state.mode !== "radar") {
      restoreOtherResultSections();
      resultDock.update("radar", emptyModel(), ["link", "mobility", "radiomap", "radar"].includes(state.mode) ? state.mode : null);
      return;
    }
    ui.resultDockTitle.textContent = "Radar Sensing Results";
    ui.resultDockSubtitle.textContent = "Range–Doppler & CA-CFAR";
    const result = radar.result;
    if (!result) {
      restoreOtherResultSections();
      ui.linkChannelSection.classList.add("hidden");
      ui.linkChannelSection.setAttribute("aria-hidden", "true");
      resultDock.update("radar", emptyModel(), "radar");
      return;
    }
    ui.linkChannelSection.classList.remove("hidden");
    ui.linkChannelSection.classList.add("radarResultMode");
    ui.linkChannelSection.setAttribute("aria-hidden", "false");
    if (renderedResult !== result) {
      renderedResult = result;
      radar.processingView = "raw";
      detectionFilter = "all";
      showAllDetections = false;
      powerScales = new Map();
    }
    const processingView = activeProcessingView(result);
    if (!processingView.rangeDopplerFocus) rangeDopplerView = "full";
    const displayedRangeDoppler = rangeDopplerView === "focus" ? processingView.rangeDopplerFocus : processingView.rangeDoppler;
    const targetDetectionCount = processingView.detectionSummary.target_detection_count
      ?? processingView.detections.filter((item) => item.target_id).length;
    const detections = detectionRows(processingView);
    const truth = truthRows(result);
    const paths = pathRows(result);
    const pathDisplayHint = radar.pathDisplayMode === "target"
      ? "Only target echo paths are shown in 3D."
      : radar.pathDisplayMode === "all"
        ? "All returned target, clutter, and direct paths are shown."
        : `Target echoes plus the ${radar.keyClutterLimit} strongest clutter paths.`;

    resultDock.update("radar", {
      status: "success",
      visible: true,
      summary: [
        {id: "detections", label: "Detections", value: `${countLabel(targetDetectionCount, "target detection")} · ${processingView.detectionSummary.total_detection_count} total`, valueId: "radarDetectionMetric"},
        {id: "paths", label: "Propagation Paths", value: `${result.summary.total_target_path_count} target · ${result.summary.total_clutter_path_count} clutter`, valueId: "radarPathMetric"},
        {id: "snr", label: "Peak SNR", value: fmt(processingView.peakSnrDb, 1, " dB"), valueId: "radarSnrMetric"},
        {id: "noise", label: "Noise Power", value: fmt(result.statistics.noise_power_dbm, 1, " dBm"), valueId: "radarNoiseMetric"},
      ],
      rangeDoppler: {
        meta: `${processingView.label.toUpperCase()} · ${rangeDopplerView === "focus" ? "TARGET DETAIL" : "SCENE OVERVIEW"}`,
        truncated: Boolean(displayedRangeDoppler?.truncated),
        processingView: processingView.id,
        processingHint: processingView.hint,
        processingOptions: PROCESSING_OPTIONS.map((option) => ({...option, available: radarProcessingViewAvailable(result, option.id)})),
        viewport: rangeDopplerView,
        focusAvailable: Boolean(processingView.rangeDopplerFocus),
      },
      detectionFilter,
      detectionCount: detections.count,
      detectionMoreLabel: showAllDetections ? "Show strongest only" : `Show all ${processingView.detections.filter((item) => item.classification !== "target" && !item.target_id).length}`,
      detectionMoreVisible: detections.moreVisible,
      detectionEmptyMessage: detections.emptyMessage,
      detections: detections.rows,
      truthEmptyMessage: truth.length ? "" : "No targets were configured for this solve.",
      truth,
      pathDisplayMode: radar.pathDisplayMode,
      pathDisplayHint,
      pathCount: paths.count,
      pathEmptyMessage: paths.emptyMessage,
      paths: paths.rows,
      pathNote: paths.note,
    }, "radar");
    drawRangeDoppler(result, processingView);
    drawRangeProfile(processingView);
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

  const unregisterCommands = resultDock.registerCommandHandler("radar", (command) => {
    const value = command.payload?.value;
    if (command.name === "radar.detection.select") selectDetection(String(value || ""));
    else if (command.name === "radar.truth.select") selectTarget(String(value || ""));
    else if (command.name === "radar.path.select") selectPath(Number(value));
    else if (command.name === "radar.processing.select") selectProcessingView(String(value || ""));
    else if (command.name === "radar.rangeDoppler.scope.select") {
      if (value === "focus" && !activeProcessingView().rangeDopplerFocus) return;
      rangeDopplerView = value === "full" ? "full" : "focus";
      renderRadarResult();
    } else if (command.name === "radar.detections.filter") {
      detectionFilter = String(value || "all");
      showAllDetections = false;
      renderRadarResult();
    } else if (command.name === "radar.detections.toggleAll") {
      showAllDetections = !showAllDetections;
      renderRadarResult();
    } else if (command.name === "radar.paths.displayMode.change") {
      radar.pathDisplayMode = String(value || "key");
      renderAll();
    }
  });

  function attachEvents() {
    if (eventController) return;
    eventController = new AbortController();
    const {signal} = eventController;
    const canvas = resultDock.element("radarRangeDopplerCanvas");
    canvas.addEventListener("mousemove", (event) => {
      const rect = canvas.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      const cell = radarRangeDopplerHover(chartLayout, x, y);
      const hover = resultDock.element("radarRdHover");
      const crosshair = resultDock.element("radarChartCrosshair");
      hover.textContent = cell
        ? `Range ${fmt(cell.rangeM, 2, " m")} · Doppler ${fmt(cell.dopplerHz, 1, " Hz")} · Power ${fmt(cell.powerDbm, 1, " dBm")}`
        : "Hover for range, Doppler, and power.";
      crosshair.classList.toggle("hidden", !cell);
      if (cell) {
        crosshair.style.setProperty("--radar-crosshair-x", `${x}px`);
        crosshair.style.setProperty("--radar-crosshair-y", `${y}px`);
        const tooltip = resultDock.element("radarChartTooltip");
        tooltip.style.left = `${Math.min(Math.max(8, x + 12), Math.max(8, rect.width - 164))}px`;
        tooltip.style.top = `${Math.max(8, y - 48)}px`;
        tooltip.textContent = `Range ${fmt(cell.rangeM, 2, " m")} · Doppler ${fmt(cell.dopplerHz, 1, " Hz")} · Power ${fmt(cell.powerDbm, 1, " dBm")}`;
      }
    }, {signal});
    canvas.addEventListener("mouseleave", () => {
      resultDock.element("radarRdHover").textContent = "Hover for range, Doppler, and power.";
      resultDock.element("radarChartCrosshair").classList.add("hidden");
    }, {signal});
    canvas.addEventListener("click", (event) => {
      const rect = canvas.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      const closest = chartLayout?.points
        .map((point) => ({...point, distance: Math.hypot(point.x - x, point.y - y)}))
        .sort((left, right) => left.distance - right.distance)[0];
      if (closest?.distance <= 18) {
        if (closest.type === "target") selectTarget(closest.id);
        else selectDetection(closest.id);
      }
    }, {signal});
  }

  function dispose() {
    eventController?.abort();
    eventController = null;
    unregisterCommands();
  }

  return Object.freeze({attachEvents, dispose, renderRadarResult, restoreOtherResultSections, selectDetection, selectPath, selectTarget});
}
