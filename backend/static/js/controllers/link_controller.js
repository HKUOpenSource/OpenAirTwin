function clearTimer(handle) {
  if (handle !== null && handle !== undefined) {
    window.clearTimeout(handle);
  }
  return null;
}

export function createLinkController({
  state,
  ui,
  getViewer,
  solveLink,
  readLinkInputs,
  readLivePreviewInputs,
  linkSolvePayload,
  showOverlay,
  hideOverlay,
  renderAll,
  setLivePreviewStatus,
  clearLivePreviewStatus,
}) {
  let runOwner = null;

  function invalidateLinkResult({clearPaths = true, clearOverlay = true} = {}) {
    cancelLivePreview();
    state.link.generation += 1;
    state.link.result = null;
    state.link.selectedPath = -1;
    if (clearOverlay && runOwner) {
      hideOverlay(runOwner);
    }
    runOwner = null;
    if (clearPaths && state.mode === "link") {
      getViewer().clearPaths();
    }
  }

  async function runLinkSolve() {
    readLinkInputs();
    const token = ++state.link.generation;
    const overlayOwner = `link:${token}`;
    runOwner = overlayOwner;
    getViewer().clearOverlay();
    showOverlay({
      title: "Solving Link",
      message: "Computing link paths with Sionna RT...",
      indeterminate: true,
      owner: overlayOwner,
      force: true,
    });
    try {
      const result = await solveLink(linkSolvePayload());
      if (token !== state.link.generation) {
        return;
      }
      state.link.result = result;
      state.link.selectedPath = -1;
      if (state.mode === "link") {
        getViewer().renderPaths(result.paths, -1);
      }
    } catch (error) {
      if (token !== state.link.generation) {
        return;
      }
      const overlayWasCurrent = hideOverlay(overlayOwner);
      if (!overlayWasCurrent) {
        return;
      }
      throw error;
    } finally {
      if (token === state.link.generation) {
        hideOverlay(overlayOwner);
        renderAll();
      }
      if (runOwner === overlayOwner) {
        runOwner = null;
      }
    }
  }

  function cancelLivePreview({clearStatus = true} = {}) {
    const live = state.livePreview;
    live.link.generation += 1;
    live.link.previewTimer = clearTimer(live.link.previewTimer);
    live.link.finalTimer = clearTimer(live.link.finalTimer);
    live.link.previewController?.abort();
    live.link.finalController?.abort();
    live.link.previewController = null;
    live.link.finalController = null;
    if (clearStatus) {
      clearLivePreviewStatus();
    }
  }

  function livePreviewEnabledForTarget(target) {
    readLivePreviewInputs();
    if (!state.livePreview.enabled || ui.loadingScreen.style.display !== "none") {
      return false;
    }
    return (target === "link-tx" || target === "link-rx") && state.mode === "link";
  }

  function scheduleLinkPreview(token) {
    const live = state.livePreview.link;
    live.previewTimer = clearTimer(live.previewTimer);
    const delayMs = Math.max(0, Number(live.pathsDelayS) || 0) * 1000;
    const now = window.performance.now();
    const waitMs = Math.max(0, delayMs - (now - Number(live.lastPreviewStartedAt || 0)));
    live.previewTimer = window.setTimeout(() => {
      runLinkLiveSolve(token, {preview: true}).catch((error) => {
        if (error?.name !== "AbortError" && token === state.livePreview.link.generation) {
          setLivePreviewStatus("link", "Preview failed");
          renderAll();
        }
      });
    }, waitMs);
  }

  function scheduleLinkFinal(token) {
    const live = state.livePreview.link;
    live.finalTimer = clearTimer(live.finalTimer);
    const delayMs = Math.max(0, Number(live.pathsDelayS) || 0) * 1000;
    live.finalTimer = window.setTimeout(() => {
      runLinkLiveSolve(token, {preview: false}).catch((error) => {
        if (error?.name !== "AbortError" && token === state.livePreview.link.generation) {
          setLivePreviewStatus("link", "Final failed");
          renderAll();
        }
      });
    }, delayMs);
  }

  async function runLinkLiveSolve(token, {preview}) {
    const live = state.livePreview.link;
    if (!state.livePreview.enabled || state.mode !== "link" || token !== live.generation) {
      return;
    }
    if (preview) {
      live.lastPreviewStartedAt = window.performance.now();
      live.previewController?.abort();
      live.previewController = new AbortController();
    } else {
      live.previewController?.abort();
      live.finalController?.abort();
      live.finalController = new AbortController();
    }
    const controller = preview ? live.previewController : live.finalController;
    setLivePreviewStatus("link", preview ? "Previewing" : "Finalizing");
    renderAll();
    try {
      const result = await solveLink(linkSolvePayload({preview}), {signal: controller.signal});
      if (controller.signal.aborted || token !== live.generation || state.mode !== "link") {
        return;
      }
      state.link.result = result;
      state.link.selectedPath = -1;
      getViewer().renderPaths(result.paths, -1);
      setLivePreviewStatus("link", preview ? "Preview ready" : "Final ready");
      renderAll();
    } finally {
      if (preview && live.previewController === controller) {
        live.previewController = null;
      }
      if (!preview && live.finalController === controller) {
        live.finalController = null;
      }
    }
  }

  function handleLivePreviewDeviceUpdate(target, phase = "change") {
    if (!livePreviewEnabledForTarget(target)) {
      return;
    }
    if (target === "link-tx" || target === "link-rx") {
      const live = state.livePreview.link;
      live.generation += 1;
      live.previewController?.abort();
      live.finalController?.abort();
      const token = live.generation;
      if (phase === "move") {
        scheduleLinkPreview(token);
        scheduleLinkFinal(token);
        return;
      }
      scheduleLinkPreview(token);
      scheduleLinkFinal(token);
    }
  }

  return {
    cancelLivePreview,
    handleLivePreviewDeviceUpdate,
    invalidateLinkResult,
    runLinkSolve,
  };
}
