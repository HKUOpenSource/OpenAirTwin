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
  renderLinkChannel,
  clearPathSelection,
  hidePathDetails,
  renderPathDetails,
  renderPathSelection,
  scrollSelectedPathDetailsIntoView,
}) {
  function renderMobilitySeriesChart(result) {
    ui.mobilitySeriesChart.replaceChildren();
    if (!result) {
      return;
    }
    const metric = MOBILITY_METRICS[state.mobility.metric] ? state.mobility.metric : "received_power_db";
    const metricInfo = MOBILITY_METRICS[metric];
    const times = Array.isArray(result.series?.time_s) ? result.series.time_s.map(Number) : [];
    const values = Array.isArray(result.series?.[metric])
      ? result.series[metric].map((value) => value === null ? NaN : Number(value))
      : [];
    const rows = times
      .map((time, index) => ({time, value: values[index], index}))
      .filter((row) => Number.isFinite(row.time) && Number.isFinite(row.value));
    if (!rows.length) {
      return;
    }

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

    ui.mobilitySeriesChart.setAttribute("viewBox", `0 0 ${width} ${height}`);
    ui.mobilitySeriesChart.setAttribute("aria-label", `Mobility ${metricInfo.label} time series`);
    const title = svgNode("title");
    title.textContent = `Mobility ${metricInfo.label}`;
    const desc = svgNode("desc");
    desc.textContent = `X-axis shows time in seconds. Y-axis shows ${metricInfo.label} in ${metricInfo.unit}.`;
    ui.mobilitySeriesChart.append(title, desc);

    for (const value of [maxY, (maxY + minY) / 2, minY]) {
      const y = scaleY(value);
      ui.mobilitySeriesChart.appendChild(svgNode("line", {
        x1: left,
        y1: y,
        x2: width - right,
        y2: y,
        class: "tapGrid",
      }));
      const text = svgNode("text", {
        x: left - 9,
        y,
        class: "tapAxisLabel",
        "text-anchor": "end",
        "dominant-baseline": "middle",
      });
      text.textContent = Number.isInteger(value) ? String(value) : value.toFixed(1);
      ui.mobilitySeriesChart.appendChild(text);
    }

    const yAxisTitle = svgNode("text", {
      x: 15,
      y: top + (plotHeight / 2),
      class: "tapAxisTitle",
      "text-anchor": "middle",
      transform: `rotate(-90 15 ${top + (plotHeight / 2)})`,
    });
    yAxisTitle.textContent = metricInfo.unit;
    const xAxisTitle = svgNode("text", {
      x: left + (plotWidth / 2),
      y: height - 10,
      class: "tapAxisTitle",
      "text-anchor": "middle",
    });
    xAxisTitle.textContent = "Time (s)";
    ui.mobilitySeriesChart.append(
      svgNode("line", {x1: left, y1: top, x2: left, y2: top + plotHeight, class: "tapAxis"}),
      svgNode("line", {x1: left, y1: top + plotHeight, x2: width - right, y2: top + plotHeight, class: "tapAxis"}),
      yAxisTitle,
      xAxisTitle,
    );

    const points = rows.map((row) => `${scaleX(row.time)},${scaleY(row.value)}`).join(" ");
    ui.mobilitySeriesChart.appendChild(svgNode("polyline", {points, class: "mobilityLine"}));
    for (const row of rows) {
      const point = svgNode("circle", {
        cx: scaleX(row.time),
        cy: scaleY(row.value),
        r: row.index === state.mobility.selectedStep ? 4.3 : 3.0,
        class: row.index === state.mobility.selectedStep ? "mobilityPoint active" : "mobilityPoint",
      });
      const pointTitle = svgNode("title");
      pointTitle.textContent = `Step ${row.index + 1}\nTime: ${row.time.toFixed(2)} s\n${metricInfo.label}: ${row.value.toFixed(2)} ${metricInfo.unit}`;
      point.appendChild(pointTitle);
      ui.mobilitySeriesChart.appendChild(point);
    }
  }

  function stopMobilityPlayback() {
    if (state.mobility.playbackTimer !== null) {
      window.clearInterval(state.mobility.playbackTimer);
      state.mobility.playbackTimer = null;
    }
    state.mobility.playing = false;
    ui.btnMobilityPlay.textContent = "Play";
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
    if (!result?.samples?.length) {
      return;
    }
    stopMobilityPlayback();
    state.mobility.playing = true;
    ui.btnMobilityPlay.textContent = "Pause";
    const intervalMs = Math.max(120, 900 / Math.max(Number(state.mobility.playbackSpeed), 0.1));
    state.mobility.playbackTimer = window.setInterval(() => {
      const nextStep = state.mobility.selectedStep + 1 >= result.samples.length
        ? 0
        : state.mobility.selectedStep + 1;
      selectMobilityStep(nextStep);
    }, intervalMs);
  }

  function renderMobilityResult() {
    const result = state.mobility.result;
    if (!result || state.mode !== "mobility") {
      if (state.mode !== "link") {
        ui.linkChannelSection.classList.add("hidden");
        ui.linkChannelSection.setAttribute("aria-hidden", "true");
        renderLinkChannel(null);
        clearPathSelection();
        hidePathDetails();
      }
      if (state.mode === "mobility" && !result) {
        getViewer().clearPaths();
      }
      ui.mobilityResult.style.display = "none";
      ui.mobilityTimelineSection.classList.add("hidden");
      ui.mobilityTimelineSection.setAttribute("aria-hidden", "true");
      if (state.mode !== "mobility") {
        stopMobilityPlayback();
      }
      return;
    }

    ui.linkChannelSection.classList.remove("hidden");
    ui.linkChannelSection.setAttribute("aria-hidden", "false");
    ui.resultDockTitle.textContent = "Mobility Results";
    ui.resultDockSubtitle.textContent = "Trajectory & Taps";
    ui.linkResult.style.display = "none";
    ui.mobilityResult.style.display = "block";
    ui.mobilityTimelineSection.classList.remove("hidden");
    ui.mobilityTimelineSection.setAttribute("aria-hidden", "false");

    const summary = result.summary || {};
    ui.mobilitySteps.textContent = String(summary.step_count ?? "--");
    ui.mobilityPowerRange.textContent = (
      Number.isFinite(summary.min_received_power_db)
      && Number.isFinite(summary.max_received_power_db)
    )
      ? `${summary.min_received_power_db.toFixed(1)} .. ${summary.max_received_power_db.toFixed(1)} dB`
      : "N/A";
    ui.mobilityDuration.textContent = Number.isFinite(summary.duration_s)
      ? `${summary.duration_s.toFixed(1)} s`
      : "N/A";
    ui.mobilityMaxDoppler.textContent = Number.isFinite(summary.max_abs_doppler_hz)
      ? `${summary.max_abs_doppler_hz.toFixed(1)} Hz`
      : "N/A";

    const sample = result.samples?.[state.mobility.selectedStep] || result.samples?.[0];
    if (!sample) {
      clearPathSelection();
      hidePathDetails();
      return;
    }
    state.mobility.selectedStep = sample.step_index;
    ui.mobilityStepSlider.max = String(Math.max((result.samples?.length || 1) - 1, 0));
    ui.mobilityStepSlider.value = String(state.mobility.selectedStep);
    ui.mobilityStepLabel.textContent = `Step ${sample.step_index + 1} | ${sample.time_s.toFixed(2)} s | ${sample.distance_m.toFixed(1)} m`;
    ui.mobilityMetric.value = state.mobility.metric;
    ui.mobilityPlaybackSpeed.value = String(state.mobility.playbackSpeed);
    ui.btnMobilityPlay.textContent = state.mobility.playing ? "Pause" : "Play";
    renderMobilitySeriesChart(result);
    renderLinkChannel(sample.channel);

    const paths = sample.paths || [];
    renderPathDetails(paths, state.mobility.selectedPath);
    getViewer().renderPaths(paths, state.mobility.selectedPath);
    getViewer().renderMobilityTrajectory(state.mobility.trajectory.points, result.samples, state.mobility.selectedStep);
    renderPathSelection(paths, state.mobility.selectedPath, (index) => {
      state.mobility.selectedPath = index;
      getViewer().renderPaths(paths, index);
      renderMobilityResult();
      scrollSelectedPathDetailsIntoView();
    }, sample.summary);
  }

  return {
    renderMobilityResult,
    selectMobilityStep,
    startMobilityPlayback,
    stopMobilityPlayback,
  };
}
