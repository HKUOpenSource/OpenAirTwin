export function createRadiomapFeature(context) {
  const {inputs, state, ui} = context;
  const {controller, resultView} = context;
  const shared = context.featureServices.solver;
  const solver = () => context.controllers.solver;
  const scene = () => context.controllers.scene;
  const picking = () => context.controllers.devicePicking;

  function runRequirementMessage() {
    return Array.isArray(state.radiomap.tx)
      ? ""
      : "Place Radio Map Tx before running the radio map.";
  }

  function attachEvents() {
    // Radio Map field and action events are emitted by the React control surface.
  }

  const deviceIds = new Set(["rmTxX", "rmTxY", "rmTxZ"]);
  const surfaceIds = new Set([
    "rmSizeX", "rmSizeY", "rmHeightOffset", "rmSamplesPerTx",
    "rmCellSize", "rmDensityLevel",
  ]);
  const displayIds = new Set(["rmColorMin", "rmColorMax", "rmColormap"]);

  function handleControlCommit(controlId) {
    if (deviceIds.has(controlId)) {
      solver().readRadiomapInputs();
      controller.invalidateRadiomapResult();
      picking().refreshPickStatus("radiomap");
      scene().renderAll();
      return true;
    }
    if (surfaceIds.has(controlId)) {
      solver().readRadiomapInputs();
      controller.invalidateRadiomapResult();
      scene().renderAll();
      return true;
    }
    if (!displayIds.has(controlId)) return false;
    try {
      solver().readRadiomapInputs();
      solver().rerenderRadiomapOverlay();
      resultView.renderRadiomapResult();
    } catch (error) {
      context.utilities.showErrorDialog("Radiomap Display Failed", error);
    }
    return true;
  }

  function handleControlAction(actionId) {
    if (actionId === "btnPickRmTx") {
      picking().openDevicePrecision("rm-tx");
      return true;
    }
    if (actionId !== "btnRunRadiomap") return false;
    return context.utilities.runSolveFromDock(
      "btnRunRadiomap",
      () => controller.runRadiomap(),
    ).catch((error) => {
      scene().hideOverlay(null, true);
      return context.utilities.showErrorDialog("Radiomap Failed", error);
    }).then(() => true);
  }

  return {
    attachEvents,
    handleControlAction,
    handleControlCommit,
    applyPick(pick, target) {
      const position = shared.pickPositionWithSurfaceClearance(pick, target.scope);
      shared.setLogicalAndVisual(state.radiomap, "tx", position);
      controller.invalidateRadiomapResult();
    },
    markerPositions() {
      return {tx: state.radiomap.txVisual, rx: null};
    },
    readInputs() {
      solver().readRadiomapInputs();
    },
    runRequirementMessage,
    activate() {
      context.viewerRef.current.clearOverlay();
    },
    onSettingsChanged() {
      controller.invalidateRadiomapResult();
    },
    render() {
      resultView.renderRadiomapResult();
    },
  };
}
