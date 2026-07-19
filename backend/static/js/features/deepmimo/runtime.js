export function createDeepMimoFeature(context) {
  const {inputs, state, ui} = context;
  const {controller, resultView} = context;
  const shared = context.featureServices.solver;
  const solver = () => context.controllers.solver;
  const scene = () => context.controllers.scene;
  const picking = () => context.controllers.devicePicking;

  function attachEvents() {
    ui.deepMimoDatasetToggle.addEventListener("click", (event) => {
      event.stopPropagation();
      context.utilities.closeModeMenu();
      if (state.deepmimo.datasets.length === 0) {
        return;
      }
      state.deepmimo.datasetTrayOpen = !state.deepmimo.datasetTrayOpen;
      resultView.renderDeepMimoDatasetTray();
    });
    ui.deepMimoDatasetTray.addEventListener("click", (event) => event.stopPropagation());
    ui.btnRunDeepMimo.addEventListener("click", () => {
      picking().clearActiveDevice({render: false});
      solver().cancelLivePreview();
      ui.btnRunDeepMimo.disabled = true;
      ui.btnRunDeepMimo.classList.add("busy");
      ui.btnRunDeepMimo.setAttribute("aria-busy", "true");
      controller.runDeepMimo().catch((error) => context.utilities.showErrorDialog("DeepMIMO Export Failed", error)).finally(() => {
        ui.btnRunDeepMimo.disabled = false;
        ui.btnRunDeepMimo.classList.remove("busy");
        ui.btnRunDeepMimo.removeAttribute("aria-busy");
        scene().renderAll();
      });
    });
    ui.btnDeepMimoPickTx.addEventListener("click", () => picking().openDevicePrecision("deepmimo-tx"));
    ui.btnDeepMimoPickRoi.addEventListener("click", () => context.featureServices.picking.toggleTarget("deepmimo-roi"));
    ui.btnDeepMimoClearRoi.addEventListener("click", () => context.featureServices.picking.clearTarget("deepmimo-roi"));
    for (const input of [
      inputs.deepMimoTxX, inputs.deepMimoTxY, inputs.deepMimoTxZ, inputs.deepMimoScenarioName,
      inputs.deepMimoRoiCenterX, inputs.deepMimoRoiCenterY, inputs.deepMimoRoiWidth,
      inputs.deepMimoRoiLength, inputs.deepMimoGridSpacing, inputs.deepMimoRxHeight,
      inputs.deepMimoMaxReceivers, inputs.deepMimoChunkSize, inputs.deepMimoSamplesPerSrc,
      inputs.deepMimoMaxPaths, inputs.deepMimoFilterBuildings,
    ]) {
      input.addEventListener("change", () => {
        solver().readDeepMimoInputs();
        controller.invalidateDeepMimoResult();
        resultView.renderDeepMimoState();
        scene().renderAll();
      });
    }
  }

  return {
    attachEvents,
    applyPick(pick, target) {
      if (target.role === "roi") {
        const position = Array.isArray(pick.surfacePosition) ? pick.surfacePosition : pick.logicalPosition;
        solver().setDeepMimoRoiCorner(position);
        return;
      }
      const position = shared.pickPositionWithSurfaceClearance(pick, target.scope);
      shared.setLogicalAndVisual(state.deepmimo.tx, state.deepmimo.txVisual, position);
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
  };
}
