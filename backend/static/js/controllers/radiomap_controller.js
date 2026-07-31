import {requestFailureState} from "/js/api.js";

export function createRadiomapController({
  state,
  getViewer,
  createRadiomapJob,
  getRadiomapJob,
  getRadiomapResult,
  readRadiomapInputs,
  radiomapJobPayload,
  radiomapColorRange,
  showOverlay,
  hideOverlay,
  renderRadiomapResult,
}) {
  let runOwner = null;

  function invalidateRadiomapResult({clearOverlay = true} = {}) {
    state.radiomap.generation += 1;
    state.radiomap.jobId = null;
    state.radiomap.result = null;
    state.radiomap.status = "Idle";
    state.radiomap.failureKind = null;
    if (clearOverlay && runOwner) {
      hideOverlay(runOwner);
    }
    runOwner = null;
    if (clearOverlay) {
      getViewer().clearRadiomap();
    }
  }

  async function pollRadiomap(jobId, token = state.radiomap.generation, overlayOwner = runOwner) {
    while (state.radiomap.jobId === jobId && token === state.radiomap.generation) {
      const job = await getRadiomapJob(jobId);
      if (state.radiomap.jobId !== jobId || token !== state.radiomap.generation) {
        return;
      }
      state.radiomap.status = job.status;
      renderRadiomapResult();

      if (job.status === "succeeded") {
        const result = await getRadiomapResult(jobId);
        if (state.radiomap.jobId !== jobId || token !== state.radiomap.generation) {
          return;
        }
        state.radiomap.result = result;
        state.radiomap.jobId = null;
        if (state.mode === "radiomap") {
          getViewer().renderRadiomap(state.radiomap.result, radiomapColorRange());
        }
        renderRadiomapResult();
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
        throw new Error(job.error || job.message || "Radio map job failed");
      }

      showOverlay({
        title: "Running Radio Map",
        message: job.message || "Computing radio map with Sionna RT...",
        indeterminate: true,
        owner: overlayOwner,
      });
      await new Promise((resolve) => window.setTimeout(resolve, 1200));
    }
  }

  async function runRadiomap() {
    readRadiomapInputs();
    radiomapColorRange();
    getViewer().clearOverlay();
    const token = ++state.radiomap.generation;
    const overlayOwner = `radiomap:${token}`;
    runOwner = overlayOwner;

    state.radiomap.status = "Queued";
    state.radiomap.failureKind = null;
    state.radiomap.jobId = null;
    state.radiomap.result = null;
    renderRadiomapResult();
    showOverlay({
      title: "Running Radio Map",
      message: "Submitting radio map job...",
      indeterminate: true,
      owner: overlayOwner,
      force: true,
    });

    try {
      const job = await createRadiomapJob(radiomapJobPayload());

      if (token !== state.radiomap.generation) {
        return;
      }
      state.radiomap.jobId = job.job_id;
      await pollRadiomap(job.job_id, token, overlayOwner);
    } catch (error) {
      if (token !== state.radiomap.generation) {
        return;
      }
      state.radiomap.jobId = null;
      const failure = requestFailureState(error);
      state.radiomap.status = failure.status;
      state.radiomap.failureKind = failure.kind;
      state.radiomap.result = null;
      renderRadiomapResult();
      const overlayWasCurrent = hideOverlay(overlayOwner);
      if (runOwner === overlayOwner) {
        runOwner = null;
      }
      if (!overlayWasCurrent) {
        return;
      }
      throw error;
    } finally {
      if (token !== state.radiomap.generation && runOwner === overlayOwner) {
        runOwner = null;
      }
    }
  }

  return {
    invalidateRadiomapResult,
    runRadiomap,
  };
}
