export function createLinkFeature(context) {
  const {settings, state} = context;
  const {controller, resultView} = context;
  const shared = context.featureServices.solver;
  const scene = () => context.controllers.scene;
  const picking = () => context.controllers.devicePicking;

  function runRequirementMessage() {
    const txReady = Array.isArray(state.link.tx);
    const rxReady = Array.isArray(state.link.rx);
    if (!txReady && !rxReady) return "Place Link Tx and Rx before solving the link.";
    if (!txReady) return "Place Link Tx before solving the link.";
    if (!rxReady) return "Place Link Rx before solving the link.";
    return "";
  }

  function handleControlUpdate(scope, field, value) {
    if (scope === "link" && field in state.link.advanced) {
      state.link.advanced[field] = typeof state.link.advanced[field] === "boolean"
        ? Boolean(value)
        : Number(value);
      const bwHz = Number(state.link.advanced.bandwidthMhz) * 1e6;
      const fft = Number(state.link.advanced.tapFftSize);
      if (Number.isFinite(bwHz) && Number.isFinite(fft) && fft > 0) {
        state.link.advanced.tapSubcarrierSpacingHz = bwHz / fft;
      }
      settings.publish("link-channel");
      scene().renderAll();
      return true;
    }
    if (scope === "livePreview") {
      if (field === "enabled") {
        state.livePreview.enabled = Boolean(value);
        if (!state.livePreview.enabled) controller.cancelLivePreview();
      } else if (field === "previewSamplesPerSrc" || field === "pathsDelayS") {
        state.livePreview.link[field] = Number(value);
      }
      scene().renderAll();
      return true;
    }
    return false;
  }

  function handleControlAction(actionId) {
    if (actionId === "btnPickLinkTx") {
      picking().openDevicePrecision("link-tx");
      return true;
    }
    if (actionId === "btnPickLinkRx") {
      picking().openDevicePrecision("link-rx");
      return true;
    }
    if (actionId !== "btnSolveLink") return false;
    return context.utilities.runSolveFromDock(
      "btnSolveLink",
      () => controller.runLinkSolve(),
    ).catch((error) => {
      scene().hideOverlay(null, true);
      return context.utilities.showErrorDialog("Link Solve Failed", error);
    }).then(() => true);
  }

  return {
    attachEvents() {},
    handleControlAction,
    handleControlUpdate,
    applyPick(pick, target) {
      const position = shared.pickPositionWithSurfaceClearance(pick, target.scope);
      shared.setLogicalAndVisual(state.link, target.role, position);
      controller.invalidateLinkResult();
    },
    markerPositions() {
      return {tx: state.link.txVisual, rx: state.link.rxVisual};
    },
    readInputs() {},
    runRequirementMessage,
    activate() {
      context.viewerRef.current.clearOverlay();
    },
    onSettingsChanged() {
      controller.invalidateLinkResult();
    },
    render() {
      resultView.renderLinkResult();
    },
    dispose() {
      resultView.dispose();
    },
  };
}
