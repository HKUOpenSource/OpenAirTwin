export const SVG_NS = "http://www.w3.org/2000/svg";

export function svgNode(name, attrs = {}) {
  const node = document.createElementNS(SVG_NS, name);
  for (const [key, value] of Object.entries(attrs)) {
    node.setAttribute(key, String(value));
  }
  return node;
}

export function formatFixed(value, digits = 2, suffix = "") {
  return Number.isFinite(value) ? `${value.toFixed(digits)}${suffix}` : "N/A";
}

export function formatCount(value) {
  return Number.isFinite(value) ? Math.round(value).toLocaleString() : "N/A";
}

export function formatExp(value, digits = 3) {
  return Number.isFinite(value) ? value.toExponential(digits) : "N/A";
}

export function formatStatus(status) {
  const text = String(status || "Idle");
  return text ? `${text[0].toUpperCase()}${text.slice(1)}` : "Idle";
}
