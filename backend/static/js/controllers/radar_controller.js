import {requestFailureState} from "/js/api.js";

const TERMINAL = new Set(["succeeded", "failed", "cancelled"]);
const EXPECTED_RADAR_BUILD_ID = "radar-rs08-fix-20260722";

function wait(milliseconds) {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

export function createRadarController({state, controls, transport, renderAll, showOverlay, hideOverlay}) {
  const radar = state.radar;
  let overlayOwner = null;

  function render() {
    renderAll?.();
  }

  function setJobState({status, progress, message, error = null}) {
    radar.status = status;
    const nextProgress = Number(progress);
    radar.progress = Number.isFinite(nextProgress)
      ? Math.max(0, Math.min(1, nextProgress))
      : radar.progress;
    radar.message = message || status;
    radar.error = error;
    render();
  }

  function hideRunOverlay(owner = overlayOwner) {
    if (owner) hideOverlay?.(owner);
    if (overlayOwner === owner) overlayOwner = null;
  }

  function invalidateRadarResult({cancelJob = true, message = "Inputs changed — run sensing again"} = {}) {
    const previousJobId = radar.jobId;
    radar.generation += 1;
    radar.jobId = null;
    radar.jobSceneGeneration = null;
    radar.result = null;
    radar.selectedDetectionId = null;
    radar.selectedPath = -1;
    radar.status = "idle";
    radar.progress = 0;
    radar.message = message;
    radar.error = null;
    radar.failureKind = null;
    hideRunOverlay();
    if (cancelJob && previousJobId) {
      transport.cancelRadarJob(previousJobId).catch(() => {});
    }
    render();
  }

  async function pollRadarJob(jobId, token, owner) {
    while (radar.jobId === jobId && radar.generation === token) {
      const job = await transport.getRadarJob(jobId);
      if (radar.jobId !== jobId || radar.generation !== token) return null;
      setJobState(job);
      if (!TERMINAL.has(job.status)) {
        showOverlay?.({
          title: "Radar Sensing",
          message: job.message || "Processing Radar job…",
          percent: Math.round(radar.progress * 100),
          indeterminate: false,
          owner,
        });
        await wait(450);
        continue;
      }
      if (job.status === "cancelled") {
        radar.jobId = null;
        radar.failureKind = "cancelled";
        hideRunOverlay(owner);
        return null;
      }
      if (job.status === "failed") {
        radar.jobId = null;
        throw new Error(job.error || job.message || "Radar sensing job failed");
      }
      const result = await transport.getRadarResult(jobId);
      if (radar.jobId !== jobId || radar.generation !== token) return null;
      if (Number(result?.scene_generation) !== Number(radar.jobSceneGeneration)) {
        throw new Error("Radar result belongs to an outdated scene generation");
      }
      if (!result?.summary || !Array.isArray(result?.detections) || !Array.isArray(result?.paths)) {
        throw new Error("Radar result does not match the RS-06 result contract");
      }
      if (result.scene_health?.build_id && result.scene_health.build_id !== EXPECTED_RADAR_BUILD_ID) {
        throw new Error("Radar frontend/backend build mismatch; restart the OpenAirTwin server");
      }
      radar.result = result;
      radar.jobId = null;
      const preferredDetection = result.detections.find((item) => item.classification === "target" || item.target_id) || null;
      radar.selectedDetectionId = preferredDetection?.detection_id || null;
      radar.selectedTargetId = preferredDetection?.target_id || radar.selectedTargetId;
      radar.selectedPath = result.paths.findIndex((path) => path.target_ids?.includes(radar.selectedTargetId));
      setJobState({status: "succeeded", progress: 1, message: "Radar sensing result ready"});
      hideRunOverlay(owner);
      return result;
    }
    return null;
  }

  async function runRadarSolve() {
    controls.readInputs();
    const token = ++radar.generation;
    const owner = `radar:${token}`;
    overlayOwner = owner;
    radar.result = null;
    radar.selectedDetectionId = null;
    radar.selectedPath = -1;
    radar.jobId = null;
    radar.jobSceneGeneration = null;
    radar.failureKind = null;
    setJobState({status: "submitting", progress: 0, message: "Submitting Radar job…"});
    showOverlay?.({title: "Radar Sensing", message: "Submitting bounded in-memory job…", indeterminate: true, owner, force: true});
    try {
      const created = await transport.createRadarJob(controls.solvePayload());
      if (radar.generation !== token) {
        if (created?.job_id) transport.cancelRadarJob(created.job_id).catch(() => {});
        return null;
      }
      radar.jobId = created.job_id;
      radar.jobSceneGeneration = created.scene_generation;
      setJobState({status: created.status || "queued", progress: 0, message: "Radar job queued"});
      const result = await pollRadarJob(created.job_id, token, owner);
      if (result && radar.generation === token) {
        radar.autoCollapsedPanel = !state.panelCollapsed;
        state.panelCollapsed = true;
        state.resultDock.expanded = true;
        render();
      }
      return result;
    } catch (error) {
      if (radar.generation !== token) return null;
      radar.jobId = null;
      radar.result = null;
      const failure = requestFailureState(error);
      radar.failureKind = failure.kind;
      setJobState({status: "failed", progress: 1, message: failure.label, error: failure.message});
      hideRunOverlay(owner);
      throw error;
    } finally {
      if (radar.generation === token && radar.status !== "queued" && radar.status !== "running" && radar.status !== "submitting") hideRunOverlay(owner);
    }
  }

  async function cancelCurrentRadarJob() {
    const jobId = radar.jobId;
    if (!jobId) return false;
    const token = ++radar.generation;
    setJobState({status: "cancelling", progress: radar.progress, message: "Requesting cancellation…"});
    try {
      const status = await transport.cancelRadarJob(jobId);
      if (radar.generation !== token) return false;
      radar.jobId = null;
      radar.result = null;
      radar.failureKind = status.status === "cancelled" ? "cancelled" : null;
      setJobState({status: status.status || "cancelled", progress: status.progress ?? 1, message: status.message || "Cancelled"});
      hideRunOverlay();
      return true;
    } catch (error) {
      if (radar.generation === token) {
        const failure = requestFailureState(error);
        radar.failureKind = failure.kind;
        setJobState({status: "failed", progress: 1, message: "Cancellation failed", error: failure.message});
      }
      throw error;
    }
  }

  function handleInputChanged() {
    try {
      controls.readInputs();
      invalidateRadarResult();
      return true;
    } catch (error) {
      const message = error?.message || String(error);
      invalidateRadarResult({message: "Fix invalid Radar inputs"});
      radar.error = message;
      radar.status = "invalid";
      radar.message = "Fix invalid Radar inputs";
      render();
      return false;
    }
  }

  return Object.freeze({cancelCurrentRadarJob, handleInputChanged, invalidateRadarResult, runRadarSolve});
}
