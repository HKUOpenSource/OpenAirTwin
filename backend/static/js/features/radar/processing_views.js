export const RADAR_PROCESSING_VIEWS = Object.freeze({
  raw: Object.freeze({
    id: "raw",
    label: "Raw",
    method: "raw",
    hint: "No additional clutter suppression; configured direct-path cancellation still applies.",
  }),
  mean_subtracted: Object.freeze({
    id: "mean_subtracted",
    label: "Mean-subtracted",
    method: "slow_time_complex_mean_subtraction",
    hint: "Subtracts the complex slow-time mean before Doppler processing to suppress stationary returns.",
  }),
  ideal_clutter_cancelled: Object.freeze({
    id: "ideal_clutter_cancelled",
    label: "Ideal Clutter-cancelled",
    method: "ideal_coherent_known_clutter_subtraction",
    hint: "Removes solver-classified clutter paths coherently; this is an ideal simulation reference.",
  }),
});

function rawDetectionSummary(result) {
  const detections = result?.detections || [];
  const targetCount = detections.filter((item) => item.classification === "target" || item.target_id).length;
  const clutterCount = detections.filter((item) => item.classification === "clutter" && !item.target_id).length;
  const unassociatedCount = Math.max(0, detections.length - targetCount - clutterCount);
  return {
    total_detection_count: Number(result?.summary?.total_detection_count) || 0,
    returned_detection_count: Number(result?.summary?.returned_detection_count) || 0,
    detections_truncated: Boolean(result?.summary?.detections_truncated),
    target_detection_count: Number.isFinite(Number(result?.summary?.target_detection_count)) ? Number(result.summary.target_detection_count) : targetCount,
    clutter_detection_count: Number.isFinite(Number(result?.summary?.clutter_detection_count)) ? Number(result.summary.clutter_detection_count) : clutterCount,
    unassociated_detection_count: Number.isFinite(Number(result?.summary?.unassociated_detection_count)) ? Number(result.summary.unassociated_detection_count) : unassociatedCount,
  };
}

export function radarProcessingViewAvailable(result, viewId) {
  return viewId === "raw" || Boolean(result?.processing_views?.[viewId]);
}

export function radarProcessingView(result, requestedViewId = "raw") {
  const requested = RADAR_PROCESSING_VIEWS[requestedViewId] || RADAR_PROCESSING_VIEWS.raw;
  const available = radarProcessingViewAvailable(result, requested.id);
  const definition = available ? requested : RADAR_PROCESSING_VIEWS.raw;
  const source = definition.id === "raw" ? null : result?.processing_views?.[definition.id];
  return {
    ...definition,
    detections: source?.detections || result?.detections || [],
    detectionSummary: source?.detection_summary || rawDetectionSummary(result),
    rangeProfile: source?.range_profile || result?.range_profile,
    rangeDoppler: source?.range_doppler || result?.range_doppler,
    rangeDopplerFocus: source?.range_doppler_focus || result?.range_doppler_focus,
    peakSnrDb: Number(source?.peak_snr_db ?? result?.statistics?.peak_snr_db),
  };
}
