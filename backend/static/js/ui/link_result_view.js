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

function makePathText(className, text) {
  const element = document.createElement("span");
  element.className = className;
  element.textContent = text;
  return element;
}

function makePathMetric(label, value) {
  const metric = document.createElement("span");
  metric.className = "pathMetric";
  metric.append(makePathText("pathMetricLabel", label), makePathText("pathMetricValue", value));
  return metric;
}

function formatDelay(delaySeconds) {
  const value = Number(delaySeconds);
  if (!Number.isFinite(value)) {
    return "N/A";
  }
  const ns = value * 1e9;
  return `${ns.toFixed(Math.abs(ns) >= 10 ? 1 : 2)} ns`;
}

export function createLinkResultView({state, ui, getViewer}) {
  function livePreviewStatusAppliesToCurrentMode() {
    return state.livePreview.mode === "link" && state.mode === "link";
  }

  function syncLivePreviewStatusUi() {
    const visible = state.livePreview.status !== "Idle" && livePreviewStatusAppliesToCurrentMode();
    ui.livePreviewStatus.classList.toggle("hidden", !visible);
    ui.livePreviewStatus.textContent = visible ? state.livePreview.status : "Idle";
  }

  function hidePathDetails() {
    ui.pathDetailList.innerHTML = "";
    ui.pathDetailTitle.textContent = "Selected Path";
    ui.pathDetailSection.classList.add("hidden");
    ui.pathDetailSection.setAttribute("aria-hidden", "true");
  }

  function scrollSelectedPathDetailsIntoView() {
    requestAnimationFrame(() => {
      if (!ui.pathDetailSection.classList.contains("hidden")) {
        ui.pathDetailSection.scrollIntoView({block: "nearest"});
      }
    });
  }

  function renderPathDetails(paths, selectedIndex) {
    if (!paths.length || selectedIndex < 0 || selectedIndex >= paths.length) {
      hidePathDetails();
      return;
    }

    ui.pathDetailList.innerHTML = "";
    ui.pathDetailTitle.textContent = "Selected Path";
    ui.pathDetailSection.classList.remove("hidden");
    ui.pathDetailSection.setAttribute("aria-hidden", "false");
    const path = paths[selectedIndex];
    const card = document.createElement("div");
    card.className = "pathDetailCard active";

    const head = document.createElement("div");
    head.className = "pathDetailHead";
    const title = document.createElement("div");
    title.className = "pathDetailTitle";
    title.textContent = `Path ${selectedIndex + 1}`;
    const typeTag = document.createElement("span");
    typeTag.className = "pathTypeTag";
    typeTag.textContent = formatPathTypeLabel(path);
    head.append(title, typeTag);

    const grid = document.createElement("div");
    grid.className = "pathDetailGrid";

    const addField = (label, value, wide = false) => {
      const item = document.createElement("div");
      item.className = "pathDetailItem" + (wide ? " wide" : "");
      const key = document.createElement("b");
      key.textContent = label;
      const text = document.createElement("span");
      text.textContent = value;
      item.append(key, text);
      grid.appendChild(item);
    };

    addField("Interaction Chain", describeInteractionSequence(path), true);
    const variants = pathVariantCount(path);
    if (variants > 1) {
      addField("Variants", `${variants} variants`);
      addField("Raw Paths", formatRawPathIndices(path), true);
      addField("Representative", String(path.representative_path_index ?? path.path_index ?? "N/A"));
    }
    addField("Path Gain", formatFixed(path.path_gain_db, 2, " dB"));
    addField("Power (Linear)", formatExp(path.path_gain_linear));
    addField("Array Pairs", String(path.array_pair_count ?? 1));
    addField("Strongest Pair", formatFixed(path.strongest_pair_power_db, 2, " dB"));
    addField("|a|", formatExp(path.coefficient_abs));
    addField("Phase", formatFixed(path.coefficient_phase_deg, 1, " deg"));
    addField("Delay", formatFixed(path.delay_ns, 2, " ns"));
    addField("Length", formatFixed(path.path_length_m, 2, " m"));
    addField("Doppler", formatFixed(path.doppler_hz, 2, " Hz"));
    addField(
      "AoD (zen/azi)",
      `${formatFixed(path.departure_zenith_deg, 1)} / ${formatFixed(path.departure_azimuth_deg, 1)} deg`,
    );
    addField(
      "AoA (zen/azi)",
      `${formatFixed(path.arrival_zenith_deg, 1)} / ${formatFixed(path.arrival_azimuth_deg, 1)} deg`,
    );
    addField("Re(a)", formatExp(path.coefficient_real));
    addField("Im(a)", formatExp(path.coefficient_imag));

    card.append(head, grid);
    ui.pathDetailList.appendChild(card);
  }

  function clearPathSelection() {
    ui.pathButtons.innerHTML = "";
    ui.pathSelectionCount.textContent = "0 paths";
    ui.pathSelectionMeta.textContent = "";
    ui.pathSelectionMeta.classList.add("hidden");
    ui.pathSelectionSection.classList.add("hidden");
    ui.pathSelectionSection.setAttribute("aria-hidden", "true");
  }

  function scrollSelectedPathRowIntoView() {
    requestAnimationFrame(() => {
      const active = ui.pathButtons.querySelector(".pathRow.active, .pathAllButton.active");
      if (active) {
        active.scrollIntoView({block: "nearest"});
      }
    });
  }

  function renderPathSelection(paths, selectedIndex, onSelect, summary = null) {
    ui.pathButtons.innerHTML = "";
    if (!paths.length) {
      clearPathSelection();
      return;
    }

    ui.pathSelectionSection.classList.remove("hidden");
    ui.pathSelectionSection.setAttribute("aria-hidden", "false");
    ui.pathSelectionCount.textContent = formatPathSelectionCount(paths, summary);
    const meta = formatPathSelectionMeta(paths, summary);
    ui.pathSelectionMeta.textContent = meta;
    ui.pathSelectionMeta.classList.toggle("hidden", !meta);

    const allButton = document.createElement("button");
    allButton.type = "button";
    allButton.className = "pathAllButton" + (selectedIndex === -1 ? " active" : "");
    allButton.setAttribute("aria-pressed", String(selectedIndex === -1));
    allButton.textContent = "Show all paths";
    allButton.addEventListener("click", () => onSelect(-1));
    ui.pathButtons.appendChild(allButton);

    paths.forEach((path, index) => {
      const variants = pathVariantCount(path);
      const row = document.createElement("button");
      row.type = "button";
      row.className = "pathRow" + (selectedIndex === index ? " active" : "");
      row.setAttribute("aria-pressed", String(selectedIndex === index));
      row.setAttribute(
        "aria-label",
        `Path ${index + 1}, ${formatPathTypeLabel(path)}, path gain ${formatPathGainValue(path)}, delay ${formatPathDelayValue(path)}`,
      );
      row.addEventListener("click", () => onSelect(index));

      const head = document.createElement("span");
      head.className = "pathRowHead";
      head.appendChild(makePathText("pathRowName", `Path ${index + 1}`));
      const badges = document.createElement("span");
      badges.className = "pathRowBadges";
      badges.appendChild(makePathText(`pathRowBadge type-${pathTypeClass(path)}`, formatPathTypeLabel(path)));
      if (variants > 1) {
        badges.appendChild(makePathText("pathRowBadge pathVariantBadge", `${variants} variants`));
      }
      head.appendChild(badges);

      const metrics = document.createElement("span");
      metrics.className = "pathRowMetrics";
      metrics.append(
        makePathMetric("Path gain", formatPathGainValue(path)),
        makePathMetric("Delay", formatPathDelayValue(path)),
      );

      row.append(head, metrics);
      ui.pathButtons.appendChild(row);
    });
    scrollSelectedPathRowIntoView();
  }

  function renderTapChart(channel) {
    ui.linkTapChart.replaceChildren();
    const indices = Array.isArray(channel.tap_indices) ? channel.tap_indices : [];
    const powers = Array.isArray(channel.power_db) ? channel.power_db.map(Number) : [];
    const delays = Array.isArray(channel.delays_s) ? channel.delays_s : [];
    const rows = indices
      .map((index, i) => ({index, power: powers[i], delay: delays[i]}))
      .filter((row) => Number.isFinite(row.power));
    if (!rows.length) {
      return;
    }

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
    if (!(displayMin < maxPower)) {
      displayMin = maxPower - 1;
    }
    const scaleY = (value) => top + (1 - ((Math.max(value, displayMin) - displayMin) / (maxPower - displayMin))) * plotHeight;

    ui.linkTapChart.setAttribute("viewBox", `0 0 ${width} ${height}`);
    ui.linkTapChart.setAttribute("aria-label", "Power delay profile chart: x-axis Tap Index, y-axis Power in dB");
    const title = svgNode("title");
    title.textContent = "Power delay profile chart";
    const desc = svgNode("desc");
    desc.textContent = "X-axis shows Tap Index. Y-axis shows tap power in dB. Delay is available in each bar tooltip.";
    ui.linkTapChart.append(title, desc);

    const yTicks = [
      {label: "max", value: maxPower},
      {label: "mid", value: (maxPower + displayMin) / 2},
      {label: "min", value: displayMin},
    ];
    for (const tick of yTicks) {
      const y = scaleY(tick.value);
      ui.linkTapChart.appendChild(svgNode("line", {
        x1: left,
        y1: y,
        x2: width - right,
        y2: y,
        class: "tapGrid",
      }));
    }

    const yAxisTitle = svgNode("text", {
      x: 15,
      y: top + (plotHeight / 2),
      class: "tapAxisTitle",
      "text-anchor": "middle",
      transform: `rotate(-90 15 ${top + (plotHeight / 2)})`,
    });
    yAxisTitle.textContent = "Power (dB)";
    const xAxisTitle = svgNode("text", {
      x: left + (plotWidth / 2),
      y: height - 10,
      class: "tapAxisTitle",
      "text-anchor": "middle",
    });
    xAxisTitle.textContent = "Tap Index";
    ui.linkTapChart.append(
      svgNode("line", {x1: left, y1: top, x2: left, y2: top + plotHeight, class: "tapAxis"}),
      svgNode("line", {x1: left, y1: top + plotHeight, x2: width - right, y2: top + plotHeight, class: "tapAxis"}),
      yAxisTitle,
      xAxisTitle,
    );

    for (const tick of yTicks) {
      const text = svgNode("text", {
        x: left - 9,
        y: scaleY(tick.value),
        class: "tapAxisLabel",
        "text-anchor": "end",
        "dominant-baseline": "middle",
      });
      text.textContent = `${tick.value.toFixed(0)} dB`;
      ui.linkTapChart.appendChild(text);
    }

    const barGap = Math.min(4, plotWidth / rows.length * 0.25);
    const barWidth = Math.max(2, (plotWidth / rows.length) - barGap);
    rows.forEach((row, i) => {
      const x = left + i * (plotWidth / rows.length) + barGap / 2;
      const y = scaleY(row.power);
      const barHeight = Math.max(1, top + plotHeight - y);
      const rect = svgNode("rect", {
        x,
        y,
        width: barWidth,
        height: barHeight,
        class: row.index === channel.peak_tap_index ? "tapBar peak" : "tapBar",
      });
      const title = svgNode("title");
      title.textContent = `Tap ${row.index}\nPower: ${row.power.toFixed(2)} dB\nDelay: ${formatDelay(row.delay)}`;
      rect.appendChild(title);
      ui.linkTapChart.appendChild(rect);
    });

    const peakRowIndex = rows.findIndex((row) => row.index === channel.peak_tap_index);
    const xTicks = [
      {row: rows[0], i: 0},
      {row: peakRowIndex >= 0 ? rows[peakRowIndex] : null, i: peakRowIndex},
      {row: rows[rows.length - 1], i: rows.length - 1},
    ];
    const seenTickPositions = new Set();
    for (const tick of xTicks) {
      if (!tick.row || tick.i < 0 || seenTickPositions.has(tick.i)) {
        continue;
      }
      seenTickPositions.add(tick.i);
      const x = left + (tick.i + 0.5) * (plotWidth / rows.length);
      const label = svgNode("text", {
        x,
        y: top + plotHeight + 18,
        class: tick.row.index === channel.peak_tap_index ? "tapAxisLabel tapPeakLabel" : "tapAxisLabel",
        "text-anchor": "middle",
      });
      label.textContent = String(tick.row.index);
      ui.linkTapChart.append(
        svgNode("line", {
          x1: x,
          y1: top + plotHeight,
          x2: x,
          y2: top + plotHeight + 5,
          class: "tapAxis",
        }),
        label,
      );
    }
  }

  function renderLinkChannel(channel) {
    if (!channel) {
      ui.linkTapAnalysisSection.classList.add("hidden");
      ui.linkTapAnalysisSection.setAttribute("aria-hidden", "true");
      ui.linkTapChart.replaceChildren();
      return;
    }

    ui.linkTapAnalysisSection.classList.remove("hidden");
    ui.linkTapAnalysisSection.setAttribute("aria-hidden", "false");
    ui.linkTapTotalPower.textContent = Number.isFinite(channel.total_power_db)
      ? `${channel.total_power_db.toFixed(2)} dB`
      : "N/A";
    const peakPower = Number(channel.peak_tap_power_db);
    ui.linkTapPeak.textContent = (
      channel.peak_tap_index === null
      || channel.peak_tap_index === undefined
      || !Number.isFinite(peakPower)
    )
      ? "N/A"
      : `${channel.peak_tap_index} / ${peakPower.toFixed(2)} dB`;
    const cirSummary = channel.cir_summary || {};
    ui.linkCirCoeffCount.textContent = String(cirSummary.coefficient_count ?? "--");
    ui.linkCirStrongest.textContent = formatExp(Number(cirSummary.strongest_coefficient_abs));
    renderTapChart(channel);
  }

  function renderLinkResult() {
    const result = state.link.result;
    const liveActive = state.mode === "link"
      && state.livePreview.mode === "link"
      && state.livePreview.status !== "Idle";
    syncLivePreviewStatusUi();
    if ((!result && !liveActive) || state.mode !== "link") {
      if (state.mode !== "mobility") {
        ui.linkChannelSection.classList.add("hidden");
        ui.linkChannelSection.setAttribute("aria-hidden", "true");
      }
      ui.linkResult.style.display = "none";
      ui.mobilityResult.style.display = "none";
      ui.mobilityTimelineSection.classList.add("hidden");
      ui.mobilityTimelineSection.setAttribute("aria-hidden", "true");
      renderLinkChannel(null);
      if (state.mode !== "mobility") {
        clearPathSelection();
        hidePathDetails();
      }
      if (state.mode === "link" && !result) {
        getViewer().clearPaths();
      }
      return;
    }

    ui.linkChannelSection.classList.remove("hidden");
    ui.linkChannelSection.setAttribute("aria-hidden", "false");
    ui.resultDockTitle.textContent = "Link Results";
    ui.resultDockSubtitle.textContent = "Path Gains & Taps";
    ui.linkResult.style.display = "block";
    ui.mobilityResult.style.display = "none";
    ui.mobilityTimelineSection.classList.add("hidden");
    ui.mobilityTimelineSection.setAttribute("aria-hidden", "true");
    if (!result) {
      ui.linkPower.textContent = "--";
      ui.linkBest.textContent = "--";
      ui.linkPaths.textContent = "--";
      ui.linkLos.textContent = "--";
      ui.linkLos.className = "pill no";
      renderLinkChannel(null);
      clearPathSelection();
      hidePathDetails();
      return;
    }
    ui.linkPower.textContent = Number.isFinite(result.summary.received_power_db)
      ? `${result.summary.received_power_db.toFixed(2)} dB`
      : "N/A";
    ui.linkBest.textContent = Number.isFinite(result.summary.strongest_path_db)
      ? `${result.summary.strongest_path_db.toFixed(2)} dB`
      : "N/A";
    ui.linkPaths.textContent = String(result.summary.valid_paths ?? 0);
    const hasLos = (result.summary.los_paths ?? 0) > 0;
    ui.linkLos.textContent = hasLos ? "Yes" : "No";
    ui.linkLos.className = `pill ${hasLos ? "yes" : "no"}`;
    renderLinkChannel(result.channel);
    getViewer().renderPaths(result.paths, state.link.selectedPath);

    renderPathDetails(result.paths, state.link.selectedPath);
    renderPathSelection(result.paths, state.link.selectedPath, (index) => {
      state.link.selectedPath = index;
      getViewer().renderPaths(result.paths, index);
      renderLinkResult();
      scrollSelectedPathDetailsIntoView();
    }, result.summary);
  }

  return {
    clearPathSelection,
    hidePathDetails,
    renderLinkChannel,
    renderLinkResult,
    renderPathDetails,
    renderPathSelection,
    scrollSelectedPathDetailsIntoView,
    syncLivePreviewStatusUi,
  };
}
