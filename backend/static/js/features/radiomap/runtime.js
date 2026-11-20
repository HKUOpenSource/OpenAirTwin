import {normalizeColormapName} from "/js/colormaps.js";

export function createRadiomapFeature(context) {
  const {state} = context;
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

  function handleControlUpdate(scope, field, value) {
    if (scope === "radiomap.surface") {
      if (field === "sizeX") state.radiomap.surface.size = [Number(value), state.radiomap.surface.size[1]];
      else if (field === "sizeY") state.radiomap.surface.size = [state.radiomap.surface.size[0], Number(value)];
      else if (field === "heightOffset") state.radiomap.surface.heightOffset = Number(value);
      else if (field === "cellSize") state.radiomap.surface.cellSize = value === null ? null : Number(value);
      else if (field === "densityLevel") state.radiomap.surface.densityLevel = Number(value);
      else if (field === "samplesPerTx") state.radiomap.solver.samplesPerTx = Number(value);
      else return false;
      controller.invalidateRadiomapResult();
      scene().renderAll();
      return true;
    }
    if (scope === "radiomap.display") {
      if (field === "colormap") state.radiomap.display.colormap = normalizeColormapName(value);
      else if (field === "colorMinDb") state.radiomap.display.colorMinDb = Number(value);
      else if (field === "colorMaxDb") state.radiomap.display.colorMaxDb = Number(value);
      else return false;
      try {
        solver().rerenderRadiomapOverlay();
        resultView.renderRadiomapResult();
        scene().renderAll();
      } catch (error) {
        context.utilities.showErrorDialog("Radiomap Display Failed", error);
      }
      return true;
    }
    return false;
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
    attachEvents() {},
    handleControlAction,
    handleControlUpdate,
    applyPick(pick, target) {
      const position = shared.pickPositionWithSurfaceClearance(pick, target.scope);
      shared.setLogicalAndVisual(state.radiomap, "tx", position);
      controller.invalidateRadiomapResult();
    },
    markerPositions() {
      return {tx: state.radiomap.txVisual, rx: null};
    },
    readInputs() {},
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
