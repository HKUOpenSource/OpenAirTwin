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
    ui.btnSolveLink.addEventListener("click", () => context.utilities.runSolveFromDock(
      ui.btnSolveLink,
      () => controller.runLinkSolve(),
    ).catch((error) => {
      scene().hideOverlay(null, true);
      return context.utilities.showErrorDialog("Link Solve Failed", error);
    }));
    ui.btnPickLinkTx.addEventListener("click", () => picking().openDevicePrecision("link-tx"));
    ui.btnPickLinkRx.addEventListener("click", () => picking().openDevicePrecision("link-rx"));

    for (const [input, target] of [
      [inputs.linkTxX, "link-tx"], [inputs.linkTxY, "link-tx"], [inputs.linkTxZ, "link-tx"],
      [inputs.linkRxX, "link-rx"], [inputs.linkRxY, "link-rx"], [inputs.linkRxZ, "link-rx"],
    ]) {
      input.addEventListener("change", () => {
        if (state.mode === "radar") {
          return;
        }
        solver().readLinkInputs();
        settings.publish("link-device");
        picking().refreshPickStatus("link");
        controller.handleLivePreviewDeviceUpdate(target, "change");
        scene().renderAll();
      });
    }

    for (const input of [
      inputs.linkSamplesPerSrc, inputs.linkMaxNumPaths, inputs.linkBandwidthMhz,
      inputs.linkSyntheticArray, inputs.linkDiffraction, inputs.linkEdgeDiffraction,
      inputs.linkDiffractionLitRegion, inputs.linkComputeTaps, inputs.linkTapLMin,
      inputs.linkTapLMax, inputs.linkTapFftSize,
    ]) {
      input.addEventListener("change", () => {
        if (state.mode === "radar") {
          return;
        }
        solver().readLinkInputs();
        settings.publish("link-channel");
        scene().renderAll();
      });
    }

    for (const input of [inputs.livePreviewEnabled, inputs.livePreviewLinkSamples, inputs.livePreviewPathsDelay]) {
      input.addEventListener("change", () => {
        if (state.mode === "radar") {
          return;
        }
        solver().readLivePreviewInputs();
        if (!state.livePreview.enabled) {
          controller.cancelLivePreview();
        }
        scene().renderAll();
      });
    }

    inputs.linkSurfaceClearance.addEventListener("change", () => {
      if (state.mode === "radar") {
        return;
      }
      const scope = context.picking.get(state.deviceControl.activeTarget)?.scope || "link";
      solver().readSurfaceClearanceInput(scope);
      settings.publish("surface-clearance");
      scene().renderAll();
    });
  }

  return {
    attachEvents,
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
