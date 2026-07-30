import {createDeepMimoDatasetBridge} from "/@oat/features/deepmimo/deepmimo-dataset-bridge.tsx";
import {formatCount} from "/js/ui/result_formatters.js?v=20260519-mode-isolation";

function shortDeepMimoJobId(jobId) {
  const id = String(jobId || "");
  return id.startsWith("dm_") ? id.slice(3, 11) : id.slice(0, 8);
}

function formatDeepMimoDatasetTime(value) {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) {
    return "--";
  }
  return new Date(timestamp).toLocaleTimeString([], {hour: "2-digit", minute: "2-digit"});
}

export function createDeepMimoDatasetView({
  state,
  ui,
  getViewer,
  deepMimoRoiBounds,
  deepMimoReceiverEstimate,
  deepMimoDownloadUrl,
  closeModeMenu,
}) {
  const bridge = createDeepMimoDatasetBridge({
    container: ui.deepMimoDatasetMount,
    onToggle: () => {
      closeModeMenu();
      if (state.deepmimo.datasets.length === 0) {
        return;
      }
      state.deepmimo.datasetTrayOpen = !state.deepmimo.datasetTrayOpen;
      renderDeepMimoDatasetTray();
    },
  });

  function addDeepMimoDataset(job) {
    const jobId = String(job.job_id || job.jobId || "");
    if (!jobId) {
      return;
    }
    const pending = state.deepmimo.pendingDataset?.jobId === jobId
      ? state.deepmimo.pendingDataset
      : null;
    const item = {
      jobId,
      scenarioName: pending?.scenarioName || state.deepmimo.export.scenarioName || "hku_deepmimo_roi",
      readyAt: job.updated_at || new Date().toISOString(),
      archiveName: job.result?.archive_name || `deepmimo_${jobId}.zip`,
      downloadUrl: deepMimoDownloadUrl(jobId),
    };
    state.deepmimo.datasets = [
      item,
      ...state.deepmimo.datasets.filter((dataset) => dataset.jobId !== jobId),
    ];
  }

  function renderDeepMimoDatasetTray() {
    const datasets = state.deepmimo.datasets;
    const visible = state.mode === "deepmimo" && datasets.length > 0;
    if (!visible) {
      state.deepmimo.datasetTrayOpen = false;
    }
    bridge.update({
      visible,
      expanded: visible && state.deepmimo.datasetTrayOpen,
      datasets: datasets.map((dataset) => ({
        jobId: dataset.jobId,
        scenarioName: dataset.scenarioName,
        detail: `Job ${shortDeepMimoJobId(dataset.jobId)} · ${formatDeepMimoDatasetTime(dataset.readyAt)}`,
        archiveName: dataset.archiveName,
        downloadUrl: dataset.downloadUrl,
      })),
    });
  }

  function renderDeepMimoState() {
    const bounds = deepMimoRoiBounds();
    const estimate = deepMimoReceiverEstimate(bounds);
    ui.deepMimoRxCandidates.value = bounds && Number.isFinite(estimate)
      ? formatCount(estimate)
      : "--";
    if (bounds && state.mode === "deepmimo") {
      getViewer().renderDeepMimoRoi(bounds, state.deepmimo.roi.visualZ);
    } else {
      getViewer().clearDeepMimoRoi();
    }
    renderDeepMimoDatasetTray();
  }

  return {
    addDeepMimoDataset,
    dispose: bridge.dispose,
    renderDeepMimoDatasetTray,
    renderDeepMimoState,
  };
}
