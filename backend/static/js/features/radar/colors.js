export const RADAR_TARGET_COLORS = Object.freeze([
  "#e58a28",
  "#4d86ca",
  "#16886e",
  "#9569c7",
  "#d35f65",
  "#aa8a22",
  "#2f96b1",
  "#c56c9e",
]);

export const RADAR_CLUTTER_COLOR = "#718299";
export const RADAR_UNASSOCIATED_TARGET_COLOR = "#16886e";
export const RADAR_UNASSOCIATED_DETECTION_COLOR = "#d34f59";

function stableTargetIndex(targetId) {
  const value = String(targetId || "");
  const numbered = /^target-(\d+)$/i.exec(value);
  if (numbered) return Math.max(0, Number(numbered[1]) - 1);
  let hash = 0;
  for (const character of value) hash = (hash * 31 + character.codePointAt(0)) >>> 0;
  return hash;
}

export function radarTargetColor(targetId) {
  return RADAR_TARGET_COLORS[stableTargetIndex(targetId) % RADAR_TARGET_COLORS.length];
}
