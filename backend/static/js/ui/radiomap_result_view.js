import {colormapGradient} from "/js/colormaps.js";
import {formatCount, formatFixed, formatStatus} from "/js/ui/result_formatters.js?v=20260519-mode-isolation";

function formatArea(size) {
  const [width, height] = Array.isArray(size) ? size : [];
  return `${formatFixed(Number(width), 1)} x ${formatFixed(Number(height), 1, " m")}`;
}

export function createRadiomapResultView({
  state,
  ui,
  getViewer,
  radiomapColorRange,
  syncLivePreviewStatusUi,
  hidePathDetails,
}) {
  function renderRadiomapColorbar(visible) {
    ui.rmColorbarSection.classList.toggle("hidden", !visible);
    ui.rmColorbarSection.setAttribute("aria-hidden", String(!visible));
    if (!visible) {
      return;
    }
    const {minDb, maxDb, colormap} = radiomapColorRange();
    ui.rmColorbar.style.background = colormapGradient(colormap);
    ui.rmColormapLabel.textContent = `Colormap: ${colormap}`;
    ui.rmColorbarRange.textContent = `Display limits: ${minDb.toFixed(0)} .. ${maxDb.toFixed(0)} dB`;
    ui.rmColorbarMin.textContent = `${minDb.toFixed(0)} dB`;
    ui.rmColorbarMax.textContent = `${maxDb.toFixed(0)} dB`;
  }

  function hideRadiomapDockContent() {
    ui.radiomapResult.style.display = "none";
    ui.radiomapResolutionSection.classList.add("hidden");
    ui.radiomapResolutionSection.setAttribute("aria-hidden", "true");
    renderRadiomapColorbar(false);
  }

  function renderRadiomapResult() {
    const shouldShow = state.mode === "radiomap"
      && (state.radiomap.status !== "Idle" || Boolean(state.radiomap.result));
    syncLivePreviewStatusUi();
    if (!shouldShow) {
      hideRadiomapDockContent();
      if (state.mode === "radiomap") {
        ui.linkChannelSection.classList.add("hidden");
        ui.linkChannelSection.setAttribute("aria-hidden", "true");
      }
      return;
    }

    ui.linkChannelSection.classList.remove("hidden");
    ui.linkChannelSection.setAttribute("aria-hidden", "false");
    ui.resultDockTitle.textContent = "Radio Map Results";
    ui.resultDockSubtitle.textContent = "Path gain / Terrain grid";
    ui.linkResult.style.display = "none";
    ui.mobilityResult.style.display = "none";
    ui.mobilityTimelineSection.classList.add("hidden");
    ui.mobilityTimelineSection.setAttribute("aria-hidden", "true");
    ui.linkTapAnalysisSection.classList.add("hidden");
    ui.linkTapAnalysisSection.setAttribute("aria-hidden", "true");
    ui.pathSelectionSection.classList.add("hidden");
    ui.pathSelectionSection.setAttribute("aria-hidden", "true");
    hidePathDetails();
    ui.radiomapResolutionSection.classList.remove("hidden");
    ui.radiomapResolutionSection.setAttribute("aria-hidden", "false");
    ui.radiomapResult.style.display = "block";
    ui.rmStatus.textContent = formatStatus(state.radiomap.status);
    ui.rmMetric.textContent = "Path gain (dB)";
    ui.rmArea.textContent = formatArea(state.radiomap.surface.size);

    if (state.radiomap.result) {
      const {surface, solver, range} = state.radiomap.result;
      if (!getViewer().radiomapMesh) {
        getViewer().renderRadiomap(state.radiomap.result, radiomapColorRange());
      }
      const requestedCellSize = Number(surface.requested_cell_size);
      if (surface.resolution_mode === "cell_size_grid") {
        const [nx, ny] = Array.isArray(surface.grid_shape) ? surface.grid_shape : ["?", "?"];
        ui.rmGrid.textContent = `${nx} x ${ny} cells (${formatCount(surface.grid_cell_count)})`;
        ui.rmMesh.textContent = `${formatCount(surface.triangle_count)} triangles`;
        ui.rmCellSizeSummary.textContent = `${formatFixed(requestedCellSize, 1, " m")} target | ${formatFixed(Number(surface.resolved_cell_size_x), 1)} x ${formatFixed(Number(surface.resolved_cell_size_y), 1, " m")} resolved`;
      } else {
        ui.rmGrid.textContent = `Auto D${surface.density_level} terrain cells (${formatCount(surface.cell_count)})`;
        ui.rmMesh.textContent = `${formatCount(surface.cell_count)} triangles`;
        ui.rmCellSizeSummary.textContent = `Auto D${surface.density_level} | terrain-derived`;
      }
      ui.rmSamples.textContent = `${formatCount(solver?.base_samples_per_tx)} base | ${formatCount(solver?.effective_samples_per_tx)} effective`;
      const rangeMin = Number(range?.min);
      const rangeMax = Number(range?.max);
      ui.rmRange.textContent = Number.isFinite(rangeMin) && Number.isFinite(rangeMax)
        ? `${rangeMin.toFixed(1)} .. ${rangeMax.toFixed(1)} dB`
        : "N/A";
    } else {
      const cellSize = state.radiomap.surface.cellSize;
      const densityLevel = state.radiomap.surface.densityLevel;
      ui.rmGrid.textContent = cellSize == null ? `Auto D${densityLevel} terrain cells` : "Pending grid";
      ui.rmMesh.textContent = "Pending";
      ui.rmCellSizeSummary.textContent = cellSize == null
        ? `Auto D${densityLevel} | terrain-derived`
        : `${formatFixed(Number(cellSize), 1, " m")} target | pending`;
      ui.rmSamples.textContent = `${formatCount(state.radiomap.solver.samplesPerTx)} base | pending`;
      ui.rmRange.textContent = "--";
    }
    renderRadiomapColorbar(true);
  }

  return {
    hideRadiomapDockContent,
    renderRadiomapColorbar,
    renderRadiomapResult,
  };
}
