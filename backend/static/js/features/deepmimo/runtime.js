export function createDeepMimoFeature(context) {
  const {inputs, state, ui} = context;
  const {controller, resultView} = context;
  const shared = context.featureServices.solver;
  const solver = () => context.controllers.solver;
  const scene = () => context.controllers.scene;
  const picking = () => context.controllers.devicePicking;

  function runRequirementMessage() {
    return Array.isArray(state.deepmimo.tx)
      ? ""
      : "Place DeepMIMO Tx before exporting data.";
  }

  function attachEvents() {
    // DeepMIMO form and device actions are owned by the React control surface.
  }

  const fieldIds = new Set([
    "deepMimoTxX", "deepMimoTxY", "deepMimoTxZ", "deepMimoScenarioName",
    "deepMimoRoiCenterX", "deepMimoRoiCenterY", "deepMimoRoiWidth",
    "deepMimoRoiLength", "deepMimoGridSpacing", "deepMimoRxHeight",
    "deepMimoMaxReceivers", "deepMimoChunkSize", "deepMimoSamplesPerSrc",
    "deepMimoMaxPaths", "deepMimoFilterBuildings",
  ]);

  function handleControlCommit(controlId) {
    if (!fieldIds.has(controlId)) return false;
    solver().readDeepMimoInputs();
    controller.invalidateDeepMimoResult();
    resultView.renderDeepMimoState();
    scene().renderAll();
    return true;
  }

  function handleControlAction(actionId) {
    if (actionId === "btnDeepMimoPickTx") {
      picking().openDevicePrecision("deepmimo-tx");
      return true;
    }
    if (actionId === "btnDeepMimoPickRoi") {
      context.featureServices.picking.toggleTarget("deepmimo-roi");
      return true;
    }
    if (actionId === "btnDeepMimoClearRoi") {
      context.featureServices.picking.clearTarget("deepmimo-roi");
      return true;
    }
    if (actionId !== "btnRunDeepMimo") return false;
    return context.utilities.runSolveFromDock(
      "btnRunDeepMimo",
      () => controller.runDeepMimo(),
    ).catch((error) => context.utilities.showErrorDialog(
      "DeepMIMO Export Failed",
      error,
    )).then(() => true);
  }

  return {
    attachEvents,
    handleControlAction,
    handleControlCommit,
    applyPick(pick, target) {
      if (target.role === "roi") {
        const position = Array.isArray(pick.surfacePosition) ? pick.surfacePosition : pick.logicalPosition;
        solver().setDeepMimoRoiCorner(position);
        return;
      }
      const position = shared.pickPositionWithSurfaceClearance(pick, target.scope);
      shared.setLogicalAndVisual(state.deepmimo, "tx", position);
      controller.invalidateDeepMimoResult();
    },
    beginPicking() {
      state.deepmimo.roi.pickingStep = "drag";
    },
    cancelPicking() {
      state.deepmimo.roi.pickingStep = "a";
    },
    clearPicking() {
      solver().clearDeepMimoRoi();
    },
    startPickDrag(position) {
      solver().startDeepMimoRoiDrag(position);
    },
    updatePickDrag(position) {
      solver().updateDeepMimoRoiDrag(position);
    },
    finishPickDrag(position) {
      solver().finishDeepMimoRoiDrag(position);
    },
    markerPositions() {
      return {tx: state.deepmimo.txVisual, rx: null};
    },
    readInputs() {
      solver().readDeepMimoInputs();
    },
    runRequirementMessage,
    closeTransientUi() {
      if (!state.deepmimo.datasetTrayOpen) {
        return;
      }
      state.deepmimo.datasetTrayOpen = false;
      resultView.renderDeepMimoDatasetTray();
    },
    activate() {
      const viewer = context.viewerRef.current;
      viewer.clearPaths();
      viewer.clearRadiomap();
      viewer.clearSurfacePreview();
    },
    onSettingsChanged() {
      controller.invalidateDeepMimoResult();
    },
    render() {
      resultView.renderDeepMimoState();
    },
    dispose() {
      resultView.dispose();
    },
  };
}
