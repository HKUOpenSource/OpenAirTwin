async function requestJson(url, options = {}) {
  const response = await fetch(url, options);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || payload.message || `Request failed: ${response.status}`);
  }
  return payload;
}

export function getManifest() {
  return requestJson("/api/scene/manifest");
}

export function getRtCapabilities() {
  return requestJson("/api/rt/capabilities");
}

export function solveLink(payload, options = {}) {
  return requestJson("/api/link/solve", {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify(payload),
    signal: options.signal,
  });
}

export function createRadiomapJob(payload) {
  return requestJson("/api/radiomap/jobs", {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify(payload),
  });
}

export function getRadiomapJob(jobId) {
  return requestJson(`/api/radiomap/jobs/${encodeURIComponent(jobId)}`);
}

export function getRadiomapResult(jobId) {
  return requestJson(`/api/radiomap/jobs/${encodeURIComponent(jobId)}/result`);
}

export function createMobilityJob(payload) {
  return requestJson("/api/mobility/jobs", {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify(payload),
  });
}

export function getMobilityJob(jobId) {
  return requestJson(`/api/mobility/jobs/${encodeURIComponent(jobId)}`);
}

export function getMobilityResult(jobId) {
  return requestJson(`/api/mobility/jobs/${encodeURIComponent(jobId)}/result`);
}
