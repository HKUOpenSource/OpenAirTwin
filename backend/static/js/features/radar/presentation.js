export const RADAR_FALLBACK_ASSETS = Object.freeze([
  Object.freeze({id: "dji-air-2s", display_name: "DJI Air 2S", default_effective_rcs_m2: 0.01}),
  Object.freeze({id: "dji-mavic-3-cine", display_name: "DJI Mavic 3 Cine", default_effective_rcs_m2: 0.01}),
  Object.freeze({id: "dji-mini-3", display_name: "DJI Mini 3", default_effective_rcs_m2: 0.01}),
  Object.freeze({id: "dji-mini-3-pro", display_name: "DJI Mini 3 Pro", default_effective_rcs_m2: 0.01}),
]);

export function radarTargetDisplayName(targetId) {
  const value = String(targetId || "").trim();
  const numbered = /^target-(\d+)$/i.exec(value);
  return numbered ? `Target ${numbered[1]}` : value || "Target";
}

export function radarAssetDisplayName(assets, assetId) {
  const id = String(assetId || "").trim();
  const available = Array.isArray(assets) && assets.length ? assets : RADAR_FALLBACK_ASSETS;
  const asset = available.find((candidate) => candidate?.id === id)
    || RADAR_FALLBACK_ASSETS.find((candidate) => candidate.id === id);
  return asset?.display_name || asset?.displayName || id || "Unknown drone";
}

export function radarObservabilityLabel(status) {
  switch (String(status || "unknown").toLowerCase()) {
    case "direct": return "Directly visible";
    case "multipath": return "Visible via multipath";
    case "blocked": return "Blocked";
    default: return "Visibility unknown";
  }
}
