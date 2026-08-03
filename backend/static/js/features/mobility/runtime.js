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

  const deviceIds = new Set([
    "mobilityTxX", "mobilityTxY", "mobilityTxZ",
    "mobilityRxX", "mobilityRxY", "mobilityRxZ",
  ]);
  const trajectoryIds = new Set([
    "mobilityVelocity", "mobilityTimeStep", "mobilityMaxSteps",
  ]);

  function handleControlCommit(controlId) {
    if (deviceIds.has(controlId)) {
      solver().readMobilityInputs();
      controller.invalidateMobilityResult();
      picking().refreshPickStatus("mobility");
      scene().renderAll();
      return true;
    }
    if (!trajectoryIds.has(controlId)) return false;
    solver().readMobilityInputs();
    controller.invalidateMobilityResult();
    scene().renderAll();
    return true;
  }

  function handleControlAction(actionId, value) {
    if (actionId === "mobilityWaypoint.select") {
      state.mobility.selectedWaypointIndex = Number(value);
      scene().renderAll();
      return true;
    }
    if (actionId === "mobilityWaypoint.remove") {
      solver().deleteMobilityWaypoint(Number(value));
      return true;
    }
    if (actionId === "btnPickMobilityTx") {
      picking().openDevicePrecision("mobility-tx");
      return true;
    }
    if (actionId === "btnPickMobilityRx") {
      picking().openDevicePrecision("mobility-rx");
      return true;
    }
    if (actionId === "btnMobilityAddRxPoint") {
      solver().addCurrentRxWaypoint();
      return true;
    }
    if (actionId === "btnMobilityClearPoints") {
      solver().resetMobilityTrajectoryFromRx();
      scene().renderAll();
      return true;
    }
    if (actionId !== "btnRunMobility") return false;
    return context.utilities.runSolveFromDock(
      "btnRunMobility",
      () => controller.runMobility(),
    ).catch((error) => {
      scene().hideOverlay(null, true);
      resultView.stopMobilityPlayback();
      return context.utilities.showErrorDialog("Mobility Failed", error);
    }).then(() => true);
  }

  return {
    attachEvents,
    handleControlAction,
    handleControlCommit,
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
