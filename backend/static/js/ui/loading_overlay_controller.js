export function createLoadingOverlayController({
  state,
  shellStore,
  onShow = () => {},
  onHide = () => {},
} = {}) {
  let overlayCancelHandler = null;
  let overlayOwner = null;

  function publish() {
    shellStore.patch((current) => ({
      ...current,
      loading: {...state.loading},
    }));
  }

  function setProgress(percent, message, indeterminate = false) {
    state.loading.message = String(message ?? "");
    if (indeterminate || !Number.isFinite(percent)) {
      state.loading.indeterminate = true;
      state.loading.percent = 0;
    } else {
      state.loading.indeterminate = false;
      state.loading.percent = Math.max(0, Math.min(100, Number(percent)));
    }
    publish();
  }

  function setCancelState({cancellable = false, cancelLabel = "Cancel"} = {}) {
    state.loading.cancellable = Boolean(cancellable);
    state.loading.cancelLabel = String(cancelLabel || "Cancel");
    publish();
  }

  function clearOverlayCancel() {
    overlayCancelHandler = null;
    state.loading.cancellable = false;
    state.loading.cancelLabel = "Cancel";
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
    if (!force && overlayOwner && overlayOwner !== owner) {
      return false;
    }
    overlayOwner = owner || null;
    state.pickTarget = null;
    state.deviceControl.activeTarget = null;
    clearOverlayCancel();
    state.loading.title = String(title || "Working");
    state.loading.visible = true;
    if (onCancel) {
      state.loading.cancellable = true;
      state.loading.cancelLabel = cancelLabel || "Cancel";
      overlayCancelHandler = onCancel;
    }
    setProgress(percent, message, indeterminate);
    onShow();
    return true;
  }

  function hideOverlay(owner = null, force = false) {
    if (!force && overlayOwner && overlayOwner !== owner) {
      return false;
    }
    overlayOwner = null;
    clearOverlayCancel();
    state.loading.visible = false;
    state.loading.title = "Loading Scene";
    state.loading.message = "Initializing...";
    state.loading.percent = 0;
    state.loading.indeterminate = false;
    publish();
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
    setCancelState,
    setProgress,
    showOverlay,
    hideOverlay,
  };
}
