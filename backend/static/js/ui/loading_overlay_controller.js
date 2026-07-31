export function createLoadingOverlayController({
  state,
  ui,
  onShow = () => {},
  onHide = () => {},
} = {}) {
  let overlayCancelHandler = null;
  let overlayOwner = null;

  function setProgress(percent, message, indeterminate = false) {
    const nextMessage = String(message ?? "");
    if (indeterminate || !Number.isFinite(percent)) {
      ui.progressBar.classList.add("indeterminate");
      if (ui.progressBar.style.width !== "38%") {
        ui.progressBar.style.width = "38%";
      }
    } else {
      const nextWidth = `${Math.max(0, Math.min(100, percent))}%`;
      ui.progressBar.classList.remove("indeterminate");
      if (ui.progressBar.style.width !== nextWidth) {
        ui.progressBar.style.width = nextWidth;
      }
    }
    if (ui.loadingPhase.textContent !== nextMessage) {
      ui.loadingPhase.textContent = nextMessage;
    }
  }

  function clearOverlayCancel() {
    overlayCancelHandler = null;
    if (ui.btnLoadingCancel) {
      ui.btnLoadingCancel.classList.add("hidden");
      ui.btnLoadingCancel.disabled = false;
      ui.btnLoadingCancel.textContent = "Cancel";
    }
  }

  function showOverlay({
    title = "Working",
    message = "Loading...",
    percent = 0,
    indeterminate = false,
    cancelLabel = "",
    onCancel = null,
    owner = null,
    force = false,
  } = {}) {
    // When the overlay is already owned, only the owner (or an explicit
    // `force: true` escape hatch) may update it. Without this guard an
    // ownerless caller could clobber an in-flight solver overlay.
    if (!force && overlayOwner && overlayOwner !== owner) {
      return false;
    }
    overlayOwner = owner || null;
    state.pickTarget = null;
    state.deviceControl.activeTarget = null;
    clearOverlayCancel();
    ui.loadingTitle.textContent = title;
    setProgress(percent, message, indeterminate);
    if (onCancel && ui.btnLoadingCancel) {
      ui.btnLoadingCancel.textContent = cancelLabel || "Cancel";
      ui.btnLoadingCancel.classList.remove("hidden");
      overlayCancelHandler = onCancel;
    }
    ui.loadingScreen.style.display = "flex";
    onShow();
    return true;
  }

  function hideOverlay(owner = null, force = false) {
    // Same invariant as showOverlay: ownerless callers must not tear down an
    // owned overlay unless they pass `force: true`.
    if (!force && overlayOwner && overlayOwner !== owner) {
      return false;
    }
    overlayOwner = null;
    clearOverlayCancel();
    ui.loadingScreen.style.display = "none";
    ui.loadingTitle.textContent = "Loading Scene";
    ui.loadingPhase.textContent = "Initializing...";
    ui.progressBar.classList.remove("indeterminate");
    ui.progressBar.style.width = "0%";
    onHide();
    return true;
  }

  return {
    cancel() {
      return overlayCancelHandler?.();
    },
    dispose() {
      overlayOwner = null;
      clearOverlayCancel();
    },
    setProgress,
    showOverlay,
    hideOverlay,
  };
}
