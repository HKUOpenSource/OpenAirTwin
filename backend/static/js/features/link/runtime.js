export function createLinkFeature(context) {
  const {inputs, settings, state, ui} = context;
  const {controller, resultView} = context;
  const shared = context.featureServices.solver;
  const solver = () => context.controllers.solver;
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

  function attachEvents() {
    // Link controls are owned by the React control surface. This lifecycle hook
    // remains for symmetry with features that still attach imperative engines.
  }

  const deviceTargets = new Map([
    ["linkTxX", "link-tx"], ["linkTxY", "link-tx"], ["linkTxZ", "link-tx"],
    ["linkRxX", "link-rx"], ["linkRxY", "link-rx"], ["linkRxZ", "link-rx"],
  ]);
  const channelIds = new Set([
    "linkSamplesPerSrc", "linkMaxNumPaths", "linkBandwidthMhz",
    "linkSyntheticArray", "linkDiffraction", "linkEdgeDiffraction",
    "linkDiffractionLitRegion", "linkComputeTaps", "linkTapLMin",
    "linkTapLMax", "linkTapFftSize",
  ]);
  const livePreviewIds = new Set([
    "livePreviewEnabled", "livePreviewLinkSamples", "livePreviewPathsDelay",
  ]);

  function handleControlCommit(controlId) {
    if (state.mode === "radar") return false;
    const target = deviceTargets.get(controlId);
    if (target) {
      solver().readLinkInputs();
      settings.publish("link-device");
      picking().refreshPickStatus("link");
      controller.handleLivePreviewDeviceUpdate(target, "change");
      scene().renderAll();
      return true;
    }
    if (channelIds.has(controlId)) {
      solver().readLinkInputs();
      settings.publish("link-channel");
      scene().renderAll();
      return true;
    }
    if (livePreviewIds.has(controlId)) {
      solver().readLivePreviewInputs();
      if (!state.livePreview.enabled) controller.cancelLivePreview();
      scene().renderAll();
      return true;
    }
    if (controlId === "linkSurfaceClearance") {
      const scope = context.picking.get(state.deviceControl.activeTarget)?.scope || "link";
      solver().readSurfaceClearanceInput(scope);
      settings.publish("surface-clearance");
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
    attachEvents,
    handleControlAction,
    handleControlCommit,
    applyPick(pick, target) {
      const position = shared.pickPositionWithSurfaceClearance(pick, target.scope);
      shared.setLogicalAndVisual(state.link, target.role, position);
      controller.invalidateLinkResult();
    },
    markerPositions() {
      return {tx: state.link.txVisual, rx: state.link.rxVisual};
    },
    readInputs() {
      solver().readLinkInputs();
    },
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
