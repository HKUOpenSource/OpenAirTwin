import {
  RADAR_CLUTTER_COLOR,
  RADAR_UNASSOCIATED_DETECTION_COLOR,
  RADAR_UNASSOCIATED_TARGET_COLOR,
  radarTargetColor,
} from "/js/features/radar/colors.js?v=20260722-radar-color-contract";
import {radarTargetDisplayName} from "/js/features/radar/presentation.js?v=20260722-radar-ui-consistency";

const SPEED_OF_LIGHT_MPS = 299792458;

function finiteValues(values) {
  return values.map(Number).filter(Number.isFinite);
}

function extent(values, fallback = [0, 1]) {
  const numbers = finiteValues(values);
  if (!numbers.length) return [...fallback];
  let minimum = Infinity;
  let maximum = -Infinity;
  for (const value of numbers) {
    if (value < minimum) minimum = value;
    if (value > maximum) maximum = value;
  }
  return [minimum, maximum];
}

function finitePowerValues(rows) {
  const values = [];
  for (const row of rows || []) {
    for (const rawValue of row || []) {
      const value = Number(rawValue);
      if (!Number.isFinite(value)) continue;
      values.push(value);
    }
  }
  return values;
}

export function radarPowerScale(result) {
  const values = finitePowerValues(result?.range_doppler?.power_dbm);
  if (!values.length) return {floorDbm: -160, peakDbm: -100};
  values.sort((a, b) => a - b);
  const peakDbm = values.at(-1);
  const medianDbm = values[Math.floor((values.length - 1) * 0.5)];
  const reportedNoiseDbm = Number(result?.statistics?.noise_power_dbm);
  const displayedNoiseDbm = Number.isFinite(reportedNoiseDbm)
    ? Math.max(reportedNoiseDbm, medianDbm)
    : medianDbm;
  // The scene overview is max-pooled, so its median sits above the physical
  // per-cell noise power. Keeping the color floor 6 dB above that median hides
  // pooled noise, while a bounded 72 dB dynamic range preserves real echoes.
  const floorDbm = Math.min(peakDbm - 1, Math.max(displayedNoiseDbm + 6, peakDbm - 72));
  return {floorDbm, peakDbm};
}

function prepareCanvas(canvas) {
  const rect = canvas.getBoundingClientRect();
  const width = Math.max(1, rect.width || 320);
  const height = Math.max(1, rect.height || 180);
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  if (canvas.width !== Math.round(width * ratio) || canvas.height !== Math.round(height * ratio)) {
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
  }
  const context = canvas.getContext("2d");
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  context.clearRect(0, 0, width, height);
  return {context, width, height};
}

function heatColor(level) {
  const stops = [[247, 249, 252], [215, 231, 241], [80, 157, 179], [242, 177, 67], [181, 73, 42]];
  const scaled = Math.max(0, Math.min(1, level)) * (stops.length - 1);
  const start = Math.min(stops.length - 2, Math.floor(scaled));
  const mix = scaled - start;
  const rgb = stops[start].map((channel, index) => Math.round(channel + (stops[start + 1][index] - channel) * mix));
  return `rgb(${rgb.join(",")})`;
}

function drawAxes(context, width, height, margin, xExtent, yExtent, {xTitle, yTitle} = {}) {
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  context.strokeStyle = "rgba(75,99,130,.18)";
  context.fillStyle = "#62738a";
  context.font = "9px ui-monospace, SFMono-Regular, monospace";
  for (const ratio of [0, 0.5, 1]) {
    const x = margin.left + ratio * plotWidth;
    context.beginPath(); context.moveTo(x, margin.top); context.lineTo(x, margin.top + plotHeight); context.stroke();
    context.textAlign = "center";
    context.fillText(`${Math.round(xExtent[0] + ratio * (xExtent[1] - xExtent[0]))}`, x, margin.top + plotHeight + 12);
    const y = margin.top + ratio * plotHeight;
    context.beginPath(); context.moveTo(margin.left, y); context.lineTo(margin.left + plotWidth, y); context.stroke();
    context.textAlign = "right";
    context.fillText(`${Math.round(yExtent[1] - ratio * (yExtent[1] - yExtent[0]))}`, margin.left - 5, y + 3);
  }
  context.fillStyle = "#46556c";
  context.font = "600 10px Inter, Segoe UI, sans-serif";
  if (xTitle) {
    context.textAlign = "center";
    context.fillText(xTitle, margin.left + plotWidth / 2, height - 5);
  }
  if (yTitle) {
    context.save();
    context.translate(11, margin.top + plotHeight / 2);
    context.rotate(-Math.PI / 2);
    context.textAlign = "center";
    context.fillText(yTitle, 0, 0);
    context.restore();
  }
}

function vectorSubtract(a, b) {
  return a.map((value, index) => Number(value) - Number(b[index]));
}

function norm(vector) {
  return Math.hypot(...vector);
}

function unit(vector) {
  const length = norm(vector);
  return length > 0 ? vector.map((value) => value / length) : [0, 0, 0];
}

function targetTruthPoints(result) {
  const strongestPaths = new Map();
  for (const path of result.paths || []) {
    if (path.classification !== "target") continue;
    for (const targetId of path.target_ids || []) {
      const old = strongestPaths.get(targetId);
      if (!old || Number(path.path_gain_db) > Number(old.path_gain_db)) strongestPaths.set(targetId, path);
    }
  }
  const wavelengthM = SPEED_OF_LIGHT_MPS / Number(result.radar.carrier_frequency_hz);
  return (result.targets || []).map((target) => {
    const path = strongestPaths.get(target.id);
    if (path) return {targetId: target.id, rangeM: Number(path.equivalent_range_m), dopplerHz: Number(path.doppler_hz), observability: target.observability?.status || "direct"};
    const fromTx = vectorSubtract(target.position_m, result.radar.tx_position_m);
    const fromRx = vectorSubtract(target.position_m, result.radar.rx_position_m);
    const rangeM = (norm(fromTx) + norm(fromRx)) / 2;
    const pathRateMps = target.velocity_mps.reduce(
      (total, velocity, index) => total + Number(velocity) * (unit(fromTx)[index] + unit(fromRx)[index]),
      0,
    );
    return {targetId: target.id, rangeM, dopplerHz: -pathRateMps / wavelengthM, observability: target.observability?.status || "unknown"};
  });
}

export function drawRadarRangeDoppler({
  canvas,
  result,
  rangeDoppler,
  selectedDetectionId = null,
  selectedTargetId = null,
  powerScale = null,
  detections = null,
}) {
  const {context, width, height} = prepareCanvas(canvas);
  const margin = {left: 58, right: 9, top: 9, bottom: 38};
  const ranges = rangeDoppler?.equivalent_range_axis_m || [];
  const dopplers = rangeDoppler?.doppler_axis_hz || [];
  const powers = rangeDoppler?.power_dbm || [];
  const xExtent = extent(ranges);
  const yExtent = extent(dopplers, [-1, 1]);
  if (xExtent[0] === xExtent[1]) xExtent[1] += 1;
  if (yExtent[0] === yExtent[1]) { yExtent[0] -= 1; yExtent[1] += 1; }
  const plotWidth = Math.max(1, width - margin.left - margin.right);
  const plotHeight = Math.max(1, height - margin.top - margin.bottom);
  const resolvedScale = powerScale || radarPowerScale({
    range_doppler: rangeDoppler,
    statistics: result?.statistics,
  });
  const floorDbm = Number(resolvedScale.floorDbm);
  const peakDbm = Number(resolvedScale.peakDbm);
  context.fillStyle = "#f7f9fc";
  context.fillRect(0, 0, width, height);
  for (let row = 0; row < dopplers.length; row += 1) {
    for (let column = 0; column < ranges.length; column += 1) {
      const valueDbm = Number(powers[row]?.[column]);
      context.fillStyle = heatColor((valueDbm - floorDbm) / Math.max(1, peakDbm - floorDbm));
      context.fillRect(
        margin.left + column / Math.max(1, ranges.length) * plotWidth,
        margin.top + (dopplers.length - 1 - row) / Math.max(1, dopplers.length) * plotHeight,
        plotWidth / Math.max(1, ranges.length) + 0.5,
        plotHeight / Math.max(1, dopplers.length) + 0.5,
      );
    }
  }
  drawAxes(context, width, height, margin, xExtent, yExtent, {
    xTitle: "Equivalent Range (m)",
    yTitle: "Doppler Shift (Hz)",
  });
  if (yExtent[0] <= 0 && yExtent[1] >= 0) {
    const zeroY = margin.top + yExtent[1] / (yExtent[1] - yExtent[0]) * plotHeight;
    context.strokeStyle = "rgba(49,82,122,.46)";
    context.lineWidth = 1.2;
    context.beginPath(); context.moveTo(margin.left, zeroY); context.lineTo(margin.left + plotWidth, zeroY); context.stroke();
  }

  const xFor = (rangeM) => margin.left + (rangeM - xExtent[0]) / (xExtent[1] - xExtent[0]) * plotWidth;
  const yFor = (dopplerHz) => margin.top + (yExtent[1] - dopplerHz) / (yExtent[1] - yExtent[0]) * plotHeight;
  const inside = (x, y) => x >= margin.left && x <= width - margin.right && y >= margin.top && y <= height - margin.bottom;
  const points = [];
  const labelBounds = [];
  const labelPosition = (x, y, text) => {
    const width = context.measureText(text).width;
    const candidates = [y - 7, y + 14, y - 19, y + 26];
    for (const baseline of candidates) {
      const bounds = {left: x + 7, right: x + 11 + width, top: baseline - 9, bottom: baseline + 3};
      if (bounds.top < margin.top || bounds.bottom > margin.top + plotHeight) continue;
      if (labelBounds.every((other) => bounds.right < other.left || bounds.left > other.right || bounds.bottom < other.top || bounds.top > other.bottom)) {
        labelBounds.push(bounds);
        return baseline;
      }
    }
    return null;
  };
  context.font = "8px ui-monospace, SFMono-Regular, monospace";
  for (const truth of targetTruthPoints(result)) {
    const x = xFor(truth.rangeM); const y = yFor(truth.dopplerHz);
    if (!inside(x, y)) continue;
    const selected = truth.targetId === selectedTargetId;
    const radius = selected ? 6 : 5;
    const blocked = truth.observability === "blocked";
    const color = radarTargetColor(truth.targetId);
    context.strokeStyle = color;
    context.lineWidth = selected ? 2 : 1.4;
    context.setLineDash(blocked ? [3, 3] : []);
    context.beginPath(); context.moveTo(x, y - radius); context.lineTo(x + radius, y); context.lineTo(x, y + radius); context.lineTo(x - radius, y); context.closePath(); context.stroke();
    context.setLineDash([]);
    const label = `${radarTargetDisplayName(truth.targetId)}${blocked ? " · Blocked" : ""}`;
    const labelY = labelPosition(x, y, label);
    if (labelY != null) {
      context.fillStyle = color; context.textAlign = "left";
      context.fillText(label, x + 7, labelY);
    }
    points.push({x, y, type: "target", id: truth.targetId, targetId: truth.targetId, color});
  }
  for (const detection of detections ?? result.detections ?? []) {
    const x = xFor(Number(detection.equivalent_range_m)); const y = yFor(Number(detection.doppler_hz));
    if (!inside(x, y)) continue;
    const selected = detection.detection_id === selectedDetectionId;
    const color = detection.target_id
      ? radarTargetColor(detection.target_id)
      : detection.classification === "target"
        ? RADAR_UNASSOCIATED_TARGET_COLOR
        : detection.classification === "clutter"
          ? RADAR_CLUTTER_COLOR
          : RADAR_UNASSOCIATED_DETECTION_COLOR;
    context.strokeStyle = color;
    context.lineWidth = selected ? 2 : 1.3;
    context.beginPath(); context.arc(x, y, selected ? 6 : 4.5, 0, Math.PI * 2); context.stroke();
    points.push({x, y, type: "detection", id: detection.detection_id, targetId: detection.target_id || null, color});
  }
  return {points, plot: {margin, width, height, plotWidth, plotHeight, xExtent, yExtent}, ranges, dopplers, powers, powerScale: {floorDbm, peakDbm}};
}

export function radarRangeDopplerHover(layout, x, y) {
  if (!layout?.ranges?.length || !layout?.dopplers?.length) return null;
  const {margin, plotWidth, plotHeight} = layout.plot;
  if (x < margin.left || x > margin.left + plotWidth || y < margin.top || y > margin.top + plotHeight) return null;
  const column = Math.min(layout.ranges.length - 1, Math.max(0, Math.floor((x - margin.left) / plotWidth * layout.ranges.length)));
  const displayRow = Math.min(layout.dopplers.length - 1, Math.max(0, Math.floor((y - margin.top) / plotHeight * layout.dopplers.length)));
  const row = layout.dopplers.length - 1 - displayRow;
  return {rangeM: Number(layout.ranges[column]), dopplerHz: Number(layout.dopplers[row]), powerDbm: Number(layout.powers[row]?.[column])};
}

export function drawRadarRangeProfile({canvas, profile, maxRangeM = null}) {
  const {context, width, height} = prepareCanvas(canvas);
  const margin = {left: 58, right: 9, top: 9, bottom: 38};
  const points = (profile?.equivalent_range_axis_m || []).map((rangeM, index) => ({rangeM: Number(rangeM), powerDbm: Number(profile.power_dbm?.[index])})).filter((item) => Number.isFinite(item.rangeM) && Number.isFinite(item.powerDbm) && (maxRangeM == null || item.rangeM <= maxRangeM));
  const ranges = points.map((item) => item.rangeM);
  const powers = points.map((item) => item.powerDbm);
  const xExtent = extent(ranges);
  if (xExtent[0] === xExtent[1]) xExtent[1] += 1;
  const yExtent = extent(powers, [-120, -20]);
  if (yExtent[0] === yExtent[1]) yExtent[1] += 1;
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  context.fillStyle = "#f7f9fc"; context.fillRect(0, 0, width, height);
  drawAxes(context, width, height, margin, xExtent, yExtent, {
    xTitle: "Equivalent Range (m)",
    yTitle: "Power (dBm)",
  });
  const xFor = (value) => margin.left + (value - xExtent[0]) / (xExtent[1] - xExtent[0]) * plotWidth;
  const yFor = (value) => margin.top + (yExtent[1] - value) / (yExtent[1] - yExtent[0]) * plotHeight;
  const gradient = context.createLinearGradient(0, margin.top, 0, margin.top + plotHeight);
  gradient.addColorStop(0, "rgba(229,138,40,.28)"); gradient.addColorStop(1, "rgba(77,134,202,.025)");
  context.beginPath();
  points.forEach((point, index) => { if (index) context.lineTo(xFor(point.rangeM), yFor(point.powerDbm)); else context.moveTo(xFor(point.rangeM), yFor(point.powerDbm)); });
  if (points.length) { context.lineTo(xFor(points.at(-1).rangeM), margin.top + plotHeight); context.lineTo(xFor(points[0].rangeM), margin.top + plotHeight); context.closePath(); context.fillStyle = gradient; context.fill(); }
  context.beginPath();
  points.forEach((point, index) => { if (index) context.lineTo(xFor(point.rangeM), yFor(point.powerDbm)); else context.moveTo(xFor(point.rangeM), yFor(point.powerDbm)); });
  context.strokeStyle = "#d97a1c"; context.lineWidth = 1.7; context.stroke();
}
