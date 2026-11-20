export function createDeepMimoFeature(context) {
  const {state} = context;
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

  function handleControlUpdate(scope, field, value) {
    if (scope !== "deepmimo") return false;
    if (field === "scenarioName") {
      state.deepmimo.export.scenarioName = String(value ?? "");
    } else if (field === "roiCenterX" || field === "roiCenterY" || field === "roiWidth" || field === "roiLength") {
      const bounds = solver().deepMimoRoiBounds();
      const centerX = field === "roiCenterX" ? Number(value) : (bounds?.center[0] ?? 0);
      const centerY = field === "roiCenterY" ? Number(value) : (bounds?.center[1] ?? 0);
      const width = field === "roiWidth" ? Number(value) : (bounds?.size[0] ?? 40);
      const length = field === "roiLength" ? Number(value) : (bounds?.size[1] ?? 40);
      if ([centerX, centerY, width, length].every(Number.isFinite) && width > 0 && length > 0) {
        const z = Number.isFinite(Number(state.deepmimo.roi.visualZ)) ? Number(state.deepmimo.roi.visualZ) : 0;
        solver().setDeepMimoRoiFromCenter(centerX, centerY, width, length, z);
      }
    } else if (field === "gridSpacing") {
      state.deepmimo.rxGrid.spacing = Number(value);
    } else if (field === "rxHeight") {
      state.deepmimo.rxGrid.height = Number(value);
    } else if (field === "maxReceivers") {
      state.deepmimo.rxGrid.maxReceivers = Number(value);
    } else if (field === "chunkSize") {
      state.deepmimo.rxGrid.chunkSize = Number(value);
    } else if (field === "filterBuildings") {
      state.deepmimo.rxGrid.filterBuildings = Boolean(value);
    } else if (field === "samplesPerSrc") {
      state.deepmimo.solver.samplesPerSrc = Number(value);
    } else if (field === "maxNumPathsPerSrc") {
      state.deepmimo.solver.maxNumPathsPerSrc = Number(value);
    } else {
      return false;
    }
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
    attachEvents() {},
    handleControlAction,
    handleControlUpdate,
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
    readInputs() {},
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
