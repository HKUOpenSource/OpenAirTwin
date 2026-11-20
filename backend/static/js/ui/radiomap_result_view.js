import {colormapGradient} from "/js/colormaps.js";
import {formatCount, formatFixed, formatStatus} from "/js/ui/result_formatters.js?v=20260519-mode-isolation";

function formatArea(size) {
  const [width, height] = Array.isArray(size) ? size : [];
  return `${formatFixed(Number(width), 1)} x ${formatFixed(Number(height), 1, " m")}`;
}

function statusType(status) {
  if (status === "Succeeded") return "success";
  if (["Failed", "Timed Out", "Offline", "Server Error"].includes(status)) return "error";
  if (status === "Cancelled") return "warning";
  if (status === "Idle") return "empty";
  return "loading";
}

export function createRadiomapResultView({
  state,
  shellUi,
  getViewer,
  radiomapColorRange,
  syncLivePreviewStatusUi,
  resultDock,
}) {
  function createViewModel(visible) {
    const {minDb, maxDb, colormap} = radiomapColorRange();
    const summary = [
      {id: "status", label: "Status", value: formatStatus(state.radiomap.status), valueId: "rmStatus"},
      {id: "metric", label: "Metric", value: "Path gain (dB)", valueId: "rmMetric"},
      {id: "grid", label: "Grid", value: "--", valueId: "rmGrid"},
      {id: "mesh", label: "Solver Mesh", value: "--", valueId: "rmMesh"},
    ];
    const resolution = [
      {id: "area", label: "Area", value: formatArea(state.radiomap.surface.size), valueId: "rmArea"},
      {id: "cell-size", label: "Cell Size", value: "--", valueId: "rmCellSizeSummary"},
      {id: "samples", label: "Samples / Tx", value: "--", valueId: "rmSamples"},
      {id: "range", label: "Result Range", value: "--", valueId: "rmRange"},
    ];

    if (state.radiomap.result) {
      const {surface, solver, range} = state.radiomap.result;
      if (!getViewer().radiomapMesh) {
        getViewer().renderRadiomap(state.radiomap.result, radiomapColorRange());
      }
      const requestedCellSize = Number(surface.requested_cell_size);
      if (surface.resolution_mode === "cell_size_grid") {
        const [nx, ny] = Array.isArray(surface.grid_shape) ? surface.grid_shape : ["?", "?"];
        summary[2].value = `${nx} × ${ny} (${formatCount(surface.grid_cell_count)})`;
        summary[3].value = `${formatCount(surface.triangle_count)} tris`;
        resolution[1].value = `${formatFixed(requestedCellSize, 1)} m (${formatFixed(Number(surface.resolved_cell_size_x), 1)}×${formatFixed(Number(surface.resolved_cell_size_y), 1)} m)`;
      } else {
        summary[2].value = `Auto D${surface.density_level} (${formatCount(surface.cell_count)})`;
        summary[3].value = `${formatCount(surface.cell_count)} tris`;
        resolution[1].value = `Auto D${surface.density_level} (Terrain)`;
      }
      resolution[2].value = `${formatCount(solver?.base_samples_per_tx)} / ${formatCount(solver?.effective_samples_per_tx)} eff`;
      const rangeMin = Number(range?.min);
      const rangeMax = Number(range?.max);
      resolution[3].value = Number.isFinite(rangeMin) && Number.isFinite(rangeMax)
        ? `${rangeMin.toFixed(1)} .. ${rangeMax.toFixed(1)} dB`
        : "N/A";
    } else {
      const cellSize = state.radiomap.surface.cellSize;
      const densityLevel = state.radiomap.surface.densityLevel;
      summary[2].value = cellSize == null ? `Auto D${densityLevel}` : "Pending";
      summary[3].value = "Pending";
      resolution[1].value = cellSize == null
        ? `Auto D${densityLevel} (Terrain)`
        : `${formatFixed(Number(cellSize), 1, " m")} target`;
      resolution[2].value = `${formatCount(state.radiomap.solver.samplesPerTx)} (Base)`;
    }

    return {
      status: statusType(state.radiomap.status),
      visible,
      summary,
      resolution,
      colorbar: {
        visible,
        colormapLabel: `Colormap: ${colormap}`,
        rangeLabel: `Display limits: ${minDb.toFixed(0)} .. ${maxDb.toFixed(0)} dB`,
        minLabel: `${minDb.toFixed(0)} dB`,
        maxLabel: `${maxDb.toFixed(0)} dB`,
        gradient: colormapGradient(colormap),
      },
    };
  }

  function renderRadiomapResult() {
    const shouldShow = state.mode === "radiomap"
      && (state.radiomap.status !== "Idle" || Boolean(state.radiomap.result));
    syncLivePreviewStatusUi();
    if (state.mode === "radiomap") {
      shellUi?.patch((current) => ({
        ...current,
        resultDock: {
          visible: shouldShow,
          title: shouldShow ? "Radio Map Results" : current.resultDock.title,
          subtitle: shouldShow ? "Path gain / Terrain grid" : current.resultDock.subtitle,
        },
      }));
    }
    resultDock.update("radiomap", createViewModel(shouldShow), state.mode);
  }

  function hideRadiomapDockContent() {
    resultDock.update("radiomap", createViewModel(false), state.mode);
  }

  function renderRadiomapColorbar(visible) {
    resultDock.update("radiomap", createViewModel(visible), state.mode);
  }

  return Object.freeze({
    hideRadiomapDockContent,
    renderRadiomapColorbar,
    renderRadiomapResult,
  });
}
