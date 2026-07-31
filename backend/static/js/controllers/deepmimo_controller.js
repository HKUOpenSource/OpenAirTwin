import {requestFailureState} from "/js/api.js";

const TERMINAL_DEEPMIMO_STATUSES = new Set(["succeeded", "failed", "cancelled"]);

export function createDeepMimoController({
  state,
  getViewer,
  createDeepMimoJob,
  cancelDeepMimoJob,
  getDeepMimoJob,
  deepMimoPayload,
  showOverlay,
  hideOverlay,
  renderDeepMimoState,
  addDeepMimoDataset,
}) {
  let runOwner = null;

  function invalidateDeepMimoResult({clearOverlay = true} = {}) {
    state.deepmimo.generation += 1;
    state.deepmimo.jobId = null;
    state.deepmimo.result = null;
    state.deepmimo.status = "Idle";
    state.deepmimo.failureKind = null;
    state.deepmimo.progress = 0;
    state.deepmimo.message = "Idle";
    state.deepmimo.pendingDataset = null;
    if (clearOverlay && runOwner) {
      hideOverlay(runOwner);
    }
    runOwner = null;
  }

  async function pollDeepMimo(jobId) {
    const token = state.deepmimo.generation;
    const overlayOwner = runOwner;
    while (state.deepmimo.jobId === jobId && token === state.deepmimo.generation) {
      const job = await getDeepMimoJob(jobId);
      if (state.deepmimo.jobId !== jobId || token !== state.deepmimo.generation) {
        return;
      }
      const preservingCancel = state.deepmimo.status === "cancelling" && !TERMINAL_DEEPMIMO_STATUSES.has(job.status);
      if (preservingCancel) {
        state.deepmimo.message = "Cancelling DeepMIMO export...";
        renderDeepMimoState();
        showOverlay({
          title: "Exporting DeepMIMO Dataset",
          message: "Cancelling DeepMIMO export...",
          indeterminate: true,
          owner: overlayOwner,
        });
        await new Promise((resolve) => window.setTimeout(resolve, 1500));
        continue;
      }
      state.deepmimo.status = job.status;
      state.deepmimo.progress = Number(job.progress || 0);
      state.deepmimo.message = job.message || "";
      if (job.result) {
        state.deepmimo.result = job.result;
      }
      renderDeepMimoState();

      if (job.status === "succeeded") {
        state.deepmimo.failureKind = null;
        state.deepmimo.message = "Dataset ready";
        addDeepMimoDataset(job);
        state.deepmimo.jobId = null;
        state.deepmimo.pendingDataset = null;
        renderDeepMimoState();
        showOverlay({
          title: "Exporting DeepMIMO Dataset",
          message: "Dataset ready",
          percent: 100,
          owner: overlayOwner,
        });
        hideOverlay(overlayOwner);
        if (runOwner === overlayOwner) {
          runOwner = null;
        }
        return;
      }
      if (job.status === "failed") {
        const overlayWasCurrent = hideOverlay(overlayOwner);
        if (runOwner === overlayOwner) {
          runOwner = null;
        }
        if (!overlayWasCurrent) {
          return;
        }
        throw new Error(job.error || job.message || "DeepMIMO export failed");
      }
      if (job.status === "cancelled") {
        state.deepmimo.jobId = null;
        state.deepmimo.pendingDataset = null;
        state.deepmimo.progress = 1;
        state.deepmimo.message = job.message || "Cancelled";
        state.deepmimo.failureKind = "cancelled";
        renderDeepMimoState();
        hideOverlay(overlayOwner);
        if (runOwner === overlayOwner) {
          runOwner = null;
        }
        return;
      }
      showOverlay({
        title: "Exporting DeepMIMO Dataset",
        message: job.message || "Preparing DeepMIMO dataset...",
        percent: Math.round(Math.max(0, Math.min(1, Number(job.progress || 0))) * 100),
        cancelLabel: "Cancel Export",
        onCancel: () => {
          cancelDeepMimoExport(jobId);
        },
        owner: overlayOwner,
      });
      await new Promise((resolve) => window.setTimeout(resolve, 1500));
    }
  }

  async function cancelDeepMimoExport(jobId) {
    if (!jobId || state.deepmimo.jobId !== jobId) {
      return;
    }
    if (state.deepmimo.status === "cancelling") {
      return;
    }
    state.deepmimo.status = "cancelling";
    state.deepmimo.message = "Cancelling DeepMIMO export...";
    renderDeepMimoState();
    showOverlay({
      title: "Exporting DeepMIMO Dataset",
      message: "Cancelling DeepMIMO export...",
      indeterminate: true,
      owner: runOwner,
      force: true,
    });
    try {
      const job = await cancelDeepMimoJob(jobId);
      if (state.deepmimo.jobId !== jobId) {
        return;
      }
      if (job.status === "succeeded") {
        state.deepmimo.jobId = null;
        state.deepmimo.result = job.result || state.deepmimo.result;
        state.deepmimo.status = "succeeded";
        state.deepmimo.progress = 1;
        state.deepmimo.message = "Dataset ready";
        state.deepmimo.failureKind = null;
        addDeepMimoDataset(job);
        state.deepmimo.pendingDataset = null;
        renderDeepMimoState();
        hideOverlay(runOwner);
        runOwner = null;
        return;
      }
      if (TERMINAL_DEEPMIMO_STATUSES.has(job.status)) {
        state.deepmimo.jobId = null;
        state.deepmimo.pendingDataset = null;
        state.deepmimo.status = job.status;
        state.deepmimo.progress = Number(job.progress ?? 1);
        const fallbackMessage =
          job.status === "failed"
            ? "DeepMIMO export failed"
            : job.status === "succeeded"
            ? "Dataset ready"
            : "Cancelled";
        state.deepmimo.message = job.message || fallbackMessage;
        state.deepmimo.failureKind = job.status === "cancelled" ? "cancelled" : null;
        renderDeepMimoState();
        hideOverlay(runOwner);
        runOwner = null;
        return;
      }
      if (typeof job.progress === "number") {
        state.deepmimo.progress = job.progress;
      }
      if (job.message) {
        state.deepmimo.message = job.message;
      }
      renderDeepMimoState();
    } catch (error) {
      if (state.deepmimo.jobId !== jobId) {
        return;
      }
      state.deepmimo.failureKind = requestFailureState(error).kind;
      state.deepmimo.status = "running";
      state.deepmimo.message = error.message || "Could not cancel DeepMIMO export";
      renderDeepMimoState();
    }
  }

  async function runDeepMimo() {
    if (!getViewer().__ready || getViewer().loadedTileIds.size === 0) {
      throw new Error("Load at least one selected tile before exporting DeepMIMO");
    }
    const payload = deepMimoPayload();
    const token = ++state.deepmimo.generation;
    const overlayOwner = `deepmimo:${token}`;
    runOwner = overlayOwner;
    const submittedScenarioName = payload.export?.scenario_name || state.deepmimo.export.scenarioName || "hku_deepmimo_roi";
    state.deepmimo.status = "Queued";
    state.deepmimo.failureKind = null;
    state.deepmimo.progress = 0;
    state.deepmimo.message = "Submitting DeepMIMO export job...";
    state.deepmimo.jobId = null;
    state.deepmimo.result = null;
    state.deepmimo.pendingDataset = null;
    renderDeepMimoState();
    showOverlay({
      title: "Exporting DeepMIMO Dataset",
      message: "Submitting DeepMIMO export job...",
      percent: 0,
      owner: overlayOwner,
      force: true,
    });

    try {
      const job = await createDeepMimoJob(payload);
      if (token !== state.deepmimo.generation) {
        return;
      }
      state.deepmimo.jobId = job.job_id;
      state.deepmimo.pendingDataset = {
        jobId: job.job_id,
        scenarioName: submittedScenarioName,
      };
      state.deepmimo.status = job.status || "running";
      state.deepmimo.progress = Number(job.progress || 0);
      state.deepmimo.message = job.message || "Worker started";
      renderDeepMimoState();
      await pollDeepMimo(job.job_id);
    } catch (error) {
      if (token !== state.deepmimo.generation) {
        return;
      }
      state.deepmimo.jobId = null;
      const failure = requestFailureState(error);
      state.deepmimo.status = "failed";
      state.deepmimo.failureKind = failure.kind;
      state.deepmimo.progress = 1;
      state.deepmimo.message = failure.message;
      state.deepmimo.pendingDataset = null;
      renderDeepMimoState();
      const overlayWasCurrent = hideOverlay(overlayOwner);
      if (runOwner === overlayOwner) {
        runOwner = null;
      }
      if (!overlayWasCurrent) {
        return;
      }
      throw error;
    } finally {
      if (token !== state.deepmimo.generation && runOwner === overlayOwner) {
        runOwner = null;
      }
    }
  }

  return {
    cancelDeepMimoExport,
    invalidateDeepMimoResult,
    runDeepMimo,
  };
}
