function isEditableKeyboardTarget(target) {
  const tag = target?.tagName?.toLowerCase();
  return Boolean(target?.isContentEditable || tag === "input" || tag === "textarea" || tag === "select");
}

export function createMobilityFeature(context) {
  const {inputs, state, ui} = context;
  const {controller, resultView} = context;
  const shared = context.featureServices.solver;
  const solver = () => context.controllers.solver;
  const scene = () => context.controllers.scene;
  const picking = () => context.controllers.devicePicking;

  function runRequirementMessage() {
    return Array.isArray(state.mobility.tx)
      ? ""
      : "Place Mobility Tx before running mobility.";
  }

  function attachEvents() {
    ui.btnRunMobility.addEventListener("click", () => context.utilities.runSolveFromDock(
      ui.btnRunMobility,
      () => controller.runMobility(),
    ).catch((error) => {
      scene().hideOverlay(null, true);
      resultView.stopMobilityPlayback();
      return context.utilities.showErrorDialog("Mobility Failed", error);
    }));
    ui.btnPickMobilityTx.addEventListener("click", () => picking().openDevicePrecision("mobility-tx"));
    ui.btnPickMobilityRx.addEventListener("click", () => picking().openDevicePrecision("mobility-rx"));

    for (const [input, target] of [
      [inputs.mobilityTxX, "mobility-tx"], [inputs.mobilityTxY, "mobility-tx"], [inputs.mobilityTxZ, "mobility-tx"],
      [inputs.mobilityRxX, "mobility-rx"], [inputs.mobilityRxY, "mobility-rx"], [inputs.mobilityRxZ, "mobility-rx"],
    ]) {
      input.addEventListener("change", () => {
        solver().readMobilityInputs();
        controller.invalidateMobilityResult();
        picking().refreshPickStatus("mobility");
        scene().renderAll();
      });
    }
    for (const input of [inputs.mobilityVelocity, inputs.mobilityTimeStep, inputs.mobilityMaxSteps]) {
      input.addEventListener("change", () => {
        solver().readMobilityInputs();
        controller.invalidateMobilityResult();
        scene().renderAll();
      });
    }
    ui.btnMobilityAddRxPoint.addEventListener("click", () => solver().addCurrentRxWaypoint());
    ui.btnMobilityClearPoints.addEventListener("click", () => {
      solver().resetMobilityTrajectoryFromRx();
      scene().renderAll();
    });
    window.addEventListener("keydown", (event) => {
      if (state.mode !== "mobility" || state.entry.visible || ui.loadingScreen.style.display !== "none" || isEditableKeyboardTarget(event.target)) {
        return;
      }
      if (event.key === "Enter") {
        event.preventDefault();
        solver().addCurrentRxWaypoint();
      } else if (event.key === "Delete" && state.mobility.selectedWaypointIndex >= 0) {
        event.preventDefault();
        solver().deleteMobilityWaypoint(state.mobility.selectedWaypointIndex);
      }
    });
  }

  return {
    attachEvents,
    applyPick(pick, target) {
      const position = shared.pickPositionWithSurfaceClearance(pick, target.scope);
      shared.setLogicalAndVisual(state.mobility, target.role, position);
      controller.invalidateMobilityResult();
    },
    markerPositions() {
      const sample = state.mobility.result?.samples?.[state.mobility.selectedStep];
      return {tx: state.mobility.txVisual, rx: sample?.rx_position || state.mobility.rxVisual};
    },
    readInputs() {
      solver().readMobilityInputs();
    },
    runRequirementMessage,
    activate() {
      if (!state.mobility.tapsDefaulted) {
        context.featureServices.linkDomain.enableChannelTaps();
        state.mobility.tapsDefaulted = true;
      }
      context.viewerRef.current.clearOverlay();
      solver().renderMobilityTrajectoryPreview();
    },
    deactivate() {
      resultView.stopMobilityPlayback();
    },
    onSettingsChanged() {
      controller.invalidateMobilityResult();
    },
    render() {
      const rxReady = Array.isArray(state.mobility.rx);
      ui.btnMobilityAddRxPoint.disabled = !rxReady;
      if (rxReady) ui.btnMobilityAddRxPoint.removeAttribute("title");
      else ui.btnMobilityAddRxPoint.title = "Place Mobility Rx before adding a waypoint.";
      resultView.renderMobilityResult();
    },
    dispose() {
      resultView.dispose();
    },
  };
}
