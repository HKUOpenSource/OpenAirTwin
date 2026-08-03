import {svgNode} from "/js/ui/result_formatters.js?v=20260519-mode-isolation";

const MOBILITY_METRICS = {
  received_power_db: {label: "Total Path Gain", unit: "dB"},
  valid_paths: {label: "Valid Paths", unit: "paths"},
  max_abs_doppler_hz: {label: "Max Doppler", unit: "Hz"},
  peak_tap_power_db: {label: "Strongest Tap", unit: "dB"},
};

export function createMobilityResultView({
  state,
  ui,
  getViewer,
  renderAll,
  resultDock,
  createChannelViewModel,
  createPathResultsViewModel,
  drawLinkTapChart,
}) {
  function renderMobilitySeriesChart(result) {
    const svg = resultDock.element("mobilitySeriesChart");
    svg.replaceChildren();
    if (!result) return;
    const metric = MOBILITY_METRICS[state.mobility.metric] ? state.mobility.metric : "received_power_db";
    const metricInfo = MOBILITY_METRICS[metric];
    const times = Array.isArray(result.series?.time_s) ? result.series.time_s.map(Number) : [];
    const values = Array.isArray(result.series?.[metric])
      ? result.series[metric].map((value) => value === null ? NaN : Number(value))
      : [];
    const rows = times
      .map((time, index) => ({time, value: values[index], index}))
      .filter((row) => Number.isFinite(row.time) && Number.isFinite(row.value));
    if (!rows.length) return;

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

    svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
    svg.setAttribute("aria-label", `Mobility ${metricInfo.label} time series`);
    const title = svgNode("title");
    title.textContent = `Mobility ${metricInfo.label}`;
    const desc = svgNode("desc");
    desc.textContent = `X-axis shows time in seconds. Y-axis shows ${metricInfo.label} in ${metricInfo.unit}.`;
    svg.append(title, desc);

    for (const value of [maxY, (maxY + minY) / 2, minY]) {
      const y = scaleY(value);
      svg.appendChild(svgNode("line", {x1: left, y1: y, x2: width - right, y2: y, class: "tapGrid"}));
      const text = svgNode("text", {x: left - 9, y, class: "tapAxisLabel", "text-anchor": "end", "dominant-baseline": "middle"});
      text.textContent = Number.isInteger(value) ? String(value) : value.toFixed(1);
      svg.appendChild(text);
    }
    const yAxisTitle = svgNode("text", {x: 15, y: top + (plotHeight / 2), class: "tapAxisTitle", "text-anchor": "middle", transform: `rotate(-90 15 ${top + (plotHeight / 2)})`});
    yAxisTitle.textContent = metricInfo.unit;
    const xAxisTitle = svgNode("text", {x: left + (plotWidth / 2), y: height - 10, class: "tapAxisTitle", "text-anchor": "middle"});
    xAxisTitle.textContent = "Time (s)";
    svg.append(
      svgNode("line", {x1: left, y1: top, x2: left, y2: top + plotHeight, class: "tapAxis"}),
      svgNode("line", {x1: left, y1: top + plotHeight, x2: width - right, y2: top + plotHeight, class: "tapAxis"}),
      yAxisTitle,
      xAxisTitle,
    );
    svg.appendChild(svgNode("polyline", {
      points: rows.map((row) => `${scaleX(row.time)},${scaleY(row.value)}`).join(" "),
      class: "mobilityLine",
    }));
    for (const row of rows) {
      const point = svgNode("circle", {
        cx: scaleX(row.time),
        cy: scaleY(row.value),
        r: row.index === state.mobility.selectedStep ? 4.3 : 3.0,
        class: row.index === state.mobility.selectedStep ? "mobilityPoint active" : "mobilityPoint",
      });
      const tooltip = svgNode("title");
      tooltip.textContent = `Step ${row.index + 1}\nTime: ${row.time.toFixed(2)} s\n${metricInfo.label}: ${row.value.toFixed(2)} ${metricInfo.unit}`;
      point.appendChild(tooltip);
      svg.appendChild(point);
    }
  }

  function stopMobilityPlayback() {
    if (state.mobility.playbackTimer !== null) {
      window.clearInterval(state.mobility.playbackTimer);
      state.mobility.playbackTimer = null;
    }
    state.mobility.playing = false;
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
    if (!result?.samples?.length) return;
    stopMobilityPlayback();
    state.mobility.playing = true;
    const intervalMs = Math.max(120, 900 / Math.max(Number(state.mobility.playbackSpeed), 0.1));
    state.mobility.playbackTimer = window.setInterval(() => {
      const nextStep = state.mobility.selectedStep + 1 >= result.samples.length
        ? 0
        : state.mobility.selectedStep + 1;
      selectMobilityStep(nextStep);
    }, intervalMs);
    renderMobilityResult();
  }

  const unregisterCommands = resultDock.registerCommandHandler("mobility", (command) => {
    const value = command.payload?.value;
    if (command.name === "mobility.timeline.metric.change") {
      state.mobility.metric = String(value);
      renderMobilityResult();
    } else if (command.name === "mobility.timeline.seek") {
      selectMobilityStep(Number(value));
    } else if (command.name === "mobility.playback.speed.change") {
      state.mobility.playbackSpeed = Number(value);
      if (state.mobility.playing) startMobilityPlayback();
      else renderMobilityResult();
    } else if (command.name === "mobility.playback.toggle") {
      if (state.mobility.playing) {
        stopMobilityPlayback();
        renderMobilityResult();
      } else {
        startMobilityPlayback();
      }
    } else if (command.name === "mobility.path.select") {
      const result = state.mobility.result;
      const sample = result?.samples?.[state.mobility.selectedStep];
      if (!sample) return;
      const index = Number(command.payload?.index);
      state.mobility.selectedPath = Number.isInteger(index) ? index : -1;
      getViewer().renderPaths(sample.paths || [], state.mobility.selectedPath);
      renderMobilityResult();
    }
  });

  function renderMobilityResult() {
    const result = state.mobility.result;
    const visible = state.mode === "mobility" && Boolean(result);
    if (state.mode === "mobility") {
      ui.linkChannelSection.classList.toggle("hidden", !visible);
      ui.linkChannelSection.classList.remove("radarResultMode");
      ui.linkChannelSection.setAttribute("aria-hidden", String(!visible));
      if (visible) {
        ui.resultDockTitle.textContent = "Mobility Results";
        ui.resultDockSubtitle.textContent = "Trajectory & Taps";
      } else {
        getViewer().clearPaths();
      }
    } else {
      stopMobilityPlayback();
    }

    const summary = result?.summary || {};
    const sample = result?.samples?.[state.mobility.selectedStep] || result?.samples?.[0] || null;
    if (sample) state.mobility.selectedStep = sample.step_index;
    const channel = createChannelViewModel(sample?.channel);
    const paths = createPathResultsViewModel(
      sample?.paths || [],
      state.mobility.selectedPath,
      sample?.summary,
      "mobility",
    );
    resultDock.update("mobility", {
      status: result ? "success" : "empty",
      visible,
      summary: [
        {id: "mobility-steps", valueId: "mobilitySteps", label: "Steps", value: result ? String(summary.step_count ?? "--") : "--"},
        {id: "mobility-power", valueId: "mobilityPowerRange", label: "Path Gain Range", value: result && Number.isFinite(summary.min_received_power_db) && Number.isFinite(summary.max_received_power_db) ? `${summary.min_received_power_db.toFixed(1)} .. ${summary.max_received_power_db.toFixed(1)} dB` : result ? "N/A" : "--"},
        {id: "mobility-duration", valueId: "mobilityDuration", label: "Duration", value: result && Number.isFinite(summary.duration_s) ? `${summary.duration_s.toFixed(1)} s` : result ? "N/A" : "--"},
        {id: "mobility-doppler", valueId: "mobilityMaxDoppler", label: "Max Doppler", value: result && Number.isFinite(summary.max_abs_doppler_hz) ? `${summary.max_abs_doppler_hz.toFixed(1)} Hz` : result ? "N/A" : "--"},
      ],
      stepLabel: sample ? `Step ${sample.step_index + 1} | ${sample.time_s.toFixed(2)} s | ${sample.distance_m.toFixed(1)} m` : "Step --",
      metric: state.mobility.metric,
      selectedStep: state.mobility.selectedStep,
      maxStep: Math.max((result?.samples?.length || 1) - 1, 0),
      playbackSpeed: String(state.mobility.playbackSpeed),
      playing: state.mobility.playing,
      channel,
      paths,
    }, ["link", "mobility", "radiomap", "radar"].includes(state.mode) ? state.mode : null);

    if (state.mode !== "mobility") return;
    renderMobilitySeriesChart(result);
    drawLinkTapChart(resultDock.element("linkTapChart"), sample?.channel || null);
    if (!sample) return;
    const samplePaths = sample.paths || [];
    getViewer().renderPaths(samplePaths, state.mobility.selectedPath);
    getViewer().renderMobilityTrajectory(state.mobility.trajectory.points, result.samples, state.mobility.selectedStep);
  }

  return {
    dispose() {
      unregisterCommands();
      stopMobilityPlayback();
    },
    renderMobilityResult,
    selectMobilityStep,
    startMobilityPlayback,
    stopMobilityPlayback,
  };
}
