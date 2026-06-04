export function createMobilityController({
  state,
  getViewer,
  createMobilityJob,
  getMobilityJob,
  getMobilityResult,
  readMobilityInputs,
  mobilityEstimate,
  mobilityJobPayload,
  showOverlay,
  hideOverlay,
  renderMobilityResult,
  renderMobilityTrajectoryPreview,
  stopMobilityPlayback,
}) {
  let runOwner = null;

  function resetMobilityResultState() {
    stopMobilityPlayback();
    state.mobility.result = null;
    state.mobility.selectedStep = 0;
    state.mobility.selectedPath = -1;
  }

  function invalidateMobilityResult({clearOverlay = true, clearPaths = true} = {}) {
    state.mobility.generation += 1;
    state.mobility.jobId = null;
    state.mobility.status = "Idle";
    resetMobilityResultState();
    if (clearPaths && state.mode === "mobility") {
      getViewer().clearPaths();
    }
    if (clearOverlay && runOwner) {
      hideOverlay(runOwner);
    }
    runOwner = null;
    renderMobilityTrajectoryPreview();
  }

  async function pollMobility(jobId, token = state.mobility.generation, overlayOwner = runOwner) {
    while (state.mobility.jobId === jobId && token === state.mobility.generation) {
      const job = await getMobilityJob(jobId);
      if (state.mobility.jobId !== jobId || token !== state.mobility.generation) {
        return;
      }
      state.mobility.status = job.status;

      if (job.status === "succeeded") {
        const result = await getMobilityResult(jobId);
        if (state.mobility.jobId !== jobId || token !== state.mobility.generation) {
          return;
        }
        state.mobility.result = result;
        state.mobility.jobId = null;
        state.mobility.selectedStep = 0;
        state.mobility.selectedPath = -1;
        const sample = state.mobility.result.samples?.[0];
        if (state.mode === "mobility") {
          getViewer().renderPaths(sample?.paths || [], -1);
        }
        renderMobilityResult();
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
        throw new Error(job.error || job.message || "Mobility job failed");
      }

      showOverlay({
        title: "Running Mobility",
        message: job.message || "Computing Rx trajectory with Sionna RT...",
        indeterminate: true,
        owner: overlayOwner,
      });
      await new Promise((resolve) => window.setTimeout(resolve, 1200));
    }
  }

  async function runMobility() {
    readMobilityInputs();
    const estimate = mobilityEstimate();
    if (state.mobility.trajectory.points.length < 2) {
      throw new Error("Mobility trajectory needs at least two Rx waypoints");
    }
    if (!Number.isInteger(estimate.maxSteps) || estimate.maxSteps < 2) {
      throw new Error("Mobility Max Steps must be an integer of at least 2");
    }
    if (estimate.steps > estimate.maxSteps) {
      throw new Error(
        `Mobility trajectory computes ${estimate.steps} steps; increase Max Steps, increase Time Step, or shorten the trajectory`,
      );
    }

    stopMobilityPlayback();
    getViewer().clearOverlay();
    const token = ++state.mobility.generation;
    const overlayOwner = `mobility:${token}`;
    runOwner = overlayOwner;
    state.mobility.status = "Queued";
    state.mobility.jobId = null;
    state.mobility.result = null;
    state.mobility.selectedStep = 0;
    state.mobility.selectedPath = -1;
    renderMobilityTrajectoryPreview();
    showOverlay({
      title: "Running Mobility",
      message: "Submitting mobility job...",
      indeterminate: true,
      owner: overlayOwner,
      force: true,
    });

    try {
      const job = await createMobilityJob(mobilityJobPayload());

      if (token !== state.mobility.generation) {
        return;
      }
      state.mobility.jobId = job.job_id;
      await pollMobility(job.job_id, token, overlayOwner);
    } catch (error) {
      if (token !== state.mobility.generation) {
        return;
      }
      state.mobility.jobId = null;
      state.mobility.status = "failed";
      state.mobility.result = null;
      state.mobility.selectedStep = 0;
      state.mobility.selectedPath = -1;
      renderMobilityResult();
      const overlayWasCurrent = hideOverlay(overlayOwner);
      if (runOwner === overlayOwner) {
        runOwner = null;
      }
      if (!overlayWasCurrent) {
        return;
      }
      throw error;
    } finally {
      if (token !== state.mobility.generation && runOwner === overlayOwner) {
        runOwner = null;
      }
    }
  }

  return {
    invalidateMobilityResult,
    runMobility,
  };
}
