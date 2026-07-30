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
}) {
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
    const hasDatasets = datasets.length > 0;
    const visible = state.mode === "deepmimo" && hasDatasets;
    if (!visible) {
      state.deepmimo.datasetTrayOpen = false;
    }
    const expanded = visible && state.deepmimo.datasetTrayOpen;

    ui.deepMimoDatasetTray.classList.toggle("hidden", !visible);
    ui.deepMimoDatasetTray.setAttribute("aria-hidden", String(!visible));
    ui.deepMimoDatasetTray.classList.toggle("open", expanded);
    ui.deepMimoDatasetToggle.setAttribute("aria-expanded", String(expanded));
    ui.deepMimoDatasetCount.textContent = String(datasets.length);
    ui.deepMimoDatasetPanel.classList.toggle("hidden", !expanded);
    ui.deepMimoDatasetPanel.setAttribute("aria-hidden", String(!expanded));

    ui.deepMimoDatasetList.replaceChildren(...datasets.map((dataset) => {
      const item = document.createElement("div");
      item.className = "deepMimoDatasetItem oat-list-card";

      const meta = document.createElement("div");
      meta.className = "deepMimoDatasetMeta";

      const name = document.createElement("div");
      name.className = "deepMimoDatasetName";
      name.textContent = dataset.scenarioName;

      const detail = document.createElement("div");
      detail.className = "deepMimoDatasetDetail";
      detail.textContent = `Job ${shortDeepMimoJobId(dataset.jobId)} · ${formatDeepMimoDatasetTime(dataset.readyAt)}`;

      const link = document.createElement("a");
      link.className = "deepMimoDatasetDownload";
      link.href = dataset.downloadUrl;
      link.download = dataset.archiveName;
      link.textContent = "Download";

      meta.append(name, detail);
      item.append(meta, link);
      return item;
    }));
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
    renderDeepMimoDatasetTray,
    renderDeepMimoState,
  };
}
