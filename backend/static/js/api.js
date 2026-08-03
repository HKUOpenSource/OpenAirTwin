export const API_TIMEOUTS = Object.freeze({
  metadata: 15_000,
  action: 30_000,
  solver: 300_000,
});

export class ApiRequestError extends Error {
  constructor(message, {kind = "request", status = null, cause = null} = {}) {
    super(message, cause ? {cause} : undefined);
    this.name = kind === "cancelled"
      ? "AbortError"
      : kind === "timeout"
        ? "TimeoutError"
        : kind === "offline"
          ? "OfflineError"
          : kind === "server"
            ? "ServerError"
            : "ApiRequestError";
    this.kind = kind;
    this.status = status;
  }
}

const FAILURE_PRESENTATIONS = Object.freeze({
  cancelled: {status: "Cancelled", label: "Request cancelled"},
  timeout: {status: "Timed Out", label: "Request timed out"},
  offline: {status: "Offline", label: "OpenAirTwin is offline"},
  server: {status: "Server Error", label: "Server error"},
  request: {status: "Failed", label: "Request failed"},
});

export function requestFailureState(error) {
  const kind = Object.hasOwn(FAILURE_PRESENTATIONS, error?.kind) ? error.kind : "request";
  return {
    kind,
    ...FAILURE_PRESENTATIONS[kind],
    message: error?.message || FAILURE_PRESENTATIONS[kind].label,
  };
}

function requestSignal(externalSignal, timeoutMs) {
  const controller = new AbortController();
  let timedOut = false;
  const abortFromExternal = () => {
    controller.abort(externalSignal?.reason || new DOMException("Request cancelled", "AbortError"));
  };
  if (externalSignal?.aborted) {
    abortFromExternal();
  } else {
    externalSignal?.addEventListener("abort", abortFromExternal, {once: true});
  }
  const timer = window.setTimeout(() => {
    timedOut = true;
    controller.abort(new DOMException("Request timed out", "TimeoutError"));
  }, timeoutMs);
  return {
    signal: controller.signal,
    timedOut: () => timedOut,
    cleanup() {
      window.clearTimeout(timer);
      externalSignal?.removeEventListener("abort", abortFromExternal);
    },
  };
}

export async function requestJson(url, options = {}) {
  const {
    timeoutMs = API_TIMEOUTS.action,
    signal: externalSignal,
    ...fetchOptions
  } = options;
  const combined = requestSignal(externalSignal, timeoutMs);
  try {
    const response = await fetch(url, {...fetchOptions, signal: combined.signal});
    let payload = {};
    try {
      payload = await response.json();
    } catch (error) {
      if (combined.signal.aborted) {
        throw error;
      }
    }
    if (!response.ok) {
      const message = payload.error || payload.message || `Request failed: ${response.status}`;
      throw new ApiRequestError(message, {
        kind: response.status >= 500 ? "server" : "request",
        status: response.status,
      });
    }
    return payload;
  } catch (error) {
    if (error instanceof ApiRequestError) {
      throw error;
    }
    if (combined.timedOut()) {
      throw new ApiRequestError(`Request timed out after ${timeoutMs} ms`, {kind: "timeout", cause: error});
    }
    if (externalSignal?.aborted || combined.signal.aborted) {
      throw new ApiRequestError("Request cancelled", {kind: "cancelled", cause: error});
    }
    if (error instanceof TypeError) {
      throw new ApiRequestError("OpenAirTwin is offline or the server is unavailable", {kind: "offline", cause: error});
    }
    throw new ApiRequestError(error?.message || "Request failed", {cause: error});
  } finally {
    combined.cleanup();
  }
}

export function getManifest() {
  return requestJson("/api/scene/manifest", {timeoutMs: API_TIMEOUTS.metadata});
}

export function getOpen3dHkTileCoverage() {
  return requestJson("/assets/open3dhk_tile_coverage.json", {timeoutMs: API_TIMEOUTS.metadata});
}

export function getRtCapabilities() {
  return requestJson("/api/rt/capabilities", {timeoutMs: API_TIMEOUTS.metadata});
}

export function getRtSceneSelection() {
  return requestJson("/api/rt/scene-selection", {timeoutMs: API_TIMEOUTS.metadata});
}

export function setRtSceneSelection(tileIds) {
  return requestJson("/api/rt/scene-selection", {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify({tile_ids: tileIds}),
    timeoutMs: API_TIMEOUTS.action,
  });
}

export function createTileDownloadJob(tileId) {
  return requestJson("/api/scene/tile-downloads", {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify({tile_id: tileId}),
    timeoutMs: API_TIMEOUTS.action,
  });
}

export function getTileDownloadJob(jobId, options = {}) {
  return requestJson(`/api/scene/tile-downloads/${encodeURIComponent(jobId)}`, {
    signal: options.signal,
    timeoutMs: API_TIMEOUTS.metadata,
  });
}

export function cancelTileDownloadJob(jobId) {
  return requestJson(`/api/scene/tile-downloads/${encodeURIComponent(jobId)}/cancel`, {
    method: "POST",
    timeoutMs: API_TIMEOUTS.action,
  });
}

export function solveLink(payload, options = {}) {
  return requestJson("/api/link/solve", {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify(payload),
    signal: options.signal,
    timeoutMs: API_TIMEOUTS.solver,
  });
}

// Kept only for the standalone /radar-demo compatibility surface. The
// registered Radar feature uses the asynchronous Job API below.
export function solveRadar(payload, options = {}) {
  return requestJson("/api/radar/solve", {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify(payload),
    signal: options.signal,
    timeoutMs: API_TIMEOUTS.solver,
  });
}

export function createRadarJob(payload, options = {}) {
  return requestJson("/api/radar/jobs", {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify(payload),
    signal: options.signal,
    timeoutMs: API_TIMEOUTS.action,
  });
}

export function getRadarJob(jobId, options = {}) {
  return requestJson(`/api/radar/jobs/${encodeURIComponent(jobId)}`, {
    signal: options.signal,
    timeoutMs: API_TIMEOUTS.metadata,
  });
}

export function getRadarResult(jobId, options = {}) {
  return requestJson(`/api/radar/jobs/${encodeURIComponent(jobId)}/result`, {
    signal: options.signal,
    timeoutMs: API_TIMEOUTS.metadata,
  });
}

export function cancelRadarJob(jobId, options = {}) {
  return requestJson(`/api/radar/jobs/${encodeURIComponent(jobId)}/cancel`, {
    method: "POST",
    signal: options.signal,
    timeoutMs: API_TIMEOUTS.action,
  });
}

export function getRadarAssetManifest() {
  return requestJson("/assets/radar/drones/manifest.json", {timeoutMs: API_TIMEOUTS.metadata});
}

export function createRadiomapJob(payload, options = {}) {
  return requestJson("/api/radiomap/jobs", {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify(payload),
    signal: options.signal,
    timeoutMs: API_TIMEOUTS.action,
  });
}

export function getRadiomapJob(jobId, options = {}) {
  return requestJson(`/api/radiomap/jobs/${encodeURIComponent(jobId)}`, {
    signal: options.signal,
    timeoutMs: API_TIMEOUTS.metadata,
  });
}

export function getRadiomapResult(jobId, options = {}) {
  return requestJson(`/api/radiomap/jobs/${encodeURIComponent(jobId)}/result`, {
    signal: options.signal,
    timeoutMs: API_TIMEOUTS.metadata,
  });
}

export function createMobilityJob(payload, options = {}) {
  return requestJson("/api/mobility/jobs", {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify(payload),
    signal: options.signal,
    timeoutMs: API_TIMEOUTS.action,
  });
}

export function getMobilityJob(jobId, options = {}) {
  return requestJson(`/api/mobility/jobs/${encodeURIComponent(jobId)}`, {
    signal: options.signal,
    timeoutMs: API_TIMEOUTS.metadata,
  });
}

export function getMobilityResult(jobId, options = {}) {
  return requestJson(`/api/mobility/jobs/${encodeURIComponent(jobId)}/result`, {
    signal: options.signal,
    timeoutMs: API_TIMEOUTS.metadata,
  });
}

export function createDeepMimoJob(payload, options = {}) {
  return requestJson("/api/deepmimo/jobs", {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify(payload),
    signal: options.signal,
    timeoutMs: API_TIMEOUTS.action,
  });
}

export function getDeepMimoJob(jobId, options = {}) {
  return requestJson(`/api/deepmimo/jobs/${encodeURIComponent(jobId)}`, {
    signal: options.signal,
    timeoutMs: API_TIMEOUTS.metadata,
  });
}

export function cancelDeepMimoJob(jobId, options = {}) {
  return requestJson(`/api/deepmimo/jobs/${encodeURIComponent(jobId)}/cancel`, {
    method: "POST",
    signal: options.signal,
    timeoutMs: API_TIMEOUTS.action,
  });
}

export function deepMimoDownloadUrl(jobId) {
  return `/api/deepmimo/jobs/${encodeURIComponent(jobId)}/download`;
}
