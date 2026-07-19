export function createRadiomapFeature(context) {
  const {inputs, state, ui} = context;
  const {controller, resultView} = context;
  const shared = context.featureServices.solver;
  const solver = () => context.controllers.solver;
  const scene = () => context.controllers.scene;
  const picking = () => context.controllers.devicePicking;

  function attachEvents() {
    ui.btnRunRadiomap.addEventListener("click", () => context.utilities.runSolveFromDock(
      ui.btnRunRadiomap,
      () => controller.runRadiomap(),
    ).catch((error) => {
      scene().hideOverlay(null, true);
      return context.utilities.showErrorDialog("Radiomap Failed", error);
    }));
    ui.btnPickRmTx.addEventListener("click", () => picking().openDevicePrecision("rm-tx"));
    for (const input of [inputs.rmTxX, inputs.rmTxY, inputs.rmTxZ]) {
      input.addEventListener("change", () => {
        solver().readRadiomapInputs();
        controller.invalidateRadiomapResult();
        picking().refreshPickStatus("radiomap");
        scene().renderAll();
      });
    }
    for (const input of [inputs.rmSizeX, inputs.rmSizeY, inputs.rmHeightOffset, inputs.rmSamplesPerTx, inputs.rmCellSize, inputs.rmDensityLevel]) {
      input.addEventListener("change", () => {
        solver().readRadiomapInputs();
        controller.invalidateRadiomapResult();
        scene().renderAll();
      });
    }
    for (const input of [inputs.rmColorMin, inputs.rmColorMax, inputs.rmColormap]) {
      input.addEventListener("change", () => {
        try {
          solver().readRadiomapInputs();
          solver().rerenderRadiomapOverlay();
          resultView.renderRadiomapResult();
        } catch (error) {
          context.utilities.showErrorDialog("Radiomap Display Failed", error);
        }
      });
    }
  }

  return {
    attachEvents,
    applyPick(pick, target) {
      const position = shared.pickPositionWithSurfaceClearance(pick, target.scope);
      shared.setLogicalAndVisual(state.radiomap.tx, state.radiomap.txVisual, position);
      controller.invalidateRadiomapResult();
    },
    markerPositions() {
      return {tx: state.radiomap.txVisual, rx: null};
    },
    readInputs() {
      solver().readRadiomapInputs();
    },
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
