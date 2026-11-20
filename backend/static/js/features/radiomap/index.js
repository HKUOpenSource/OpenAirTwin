import {defineFeature} from "/js/core/feature_registry.js";
import {createRadiomapController} from "/js/controllers/radiomap_controller.js?v=20260519-mode-isolation";
import {createRadiomapFeature} from "/js/features/radiomap/runtime.js?v=20260723-empty-devices";
import {createRadiomapRenderer} from "/js/features/radiomap/renderer.js";
import {createRadiomapState} from "/js/features/radiomap/state.js?v=20260723-empty-devices";
import {createRadiomapTransport} from "/js/features/radiomap/transport.js";
import {createRadiomapResultView} from "/js/ui/radiomap_result_view.js?v=20260519-mode-isolation";

function createResultView(context) {
  const shared = context.featureServices.solver;
  return createRadiomapResultView({
    state: context.state,
    shellUi: context.featureServices.shellUi,
    getViewer: shared.getViewer,
    radiomapColorRange: shared.radiomapColorRange,
    syncLivePreviewStatusUi: shared.syncLivePreviewStatusUi,
    resultDock: context.featureServices.resultDock,
  });
}

function createController(context) {
  const shared = context.featureServices.solver;
  return createRadiomapController({
    state: context.state,
    getViewer: shared.getViewer,
    createRadiomapJob: context.transport.createRadiomapJob,
    getRadiomapJob: context.transport.getRadiomapJob,
    getRadiomapResult: context.transport.getRadiomapResult,
    readRadiomapInputs: shared.readRadiomapInputs,
    radiomapJobPayload: shared.radiomapJobPayload,
    radiomapColorRange: shared.radiomapColorRange,
    showOverlay: shared.showOverlay,
    hideOverlay: shared.hideOverlay,
    renderRadiomapResult: context.resultView.renderRadiomapResult,
  });
}

export const radiomapFeature = defineFeature({
  id: "radiomap",
  order: 30,
  title: "Radio Map",
  createState: createRadiomapState,
  createTransport: createRadiomapTransport,
  createController,
  createResultView,
  createRenderer: createRadiomapRenderer,
  createFeature: createRadiomapFeature,
  settingsDependencies: ["common-solver", "antenna"],
  sharedControlPolicy: {tx: true, rx: false, antenna: "tx"},
  ui: {
    disableDuringTileLoad: true,
    resultMethod: "renderRadiomapResult",
  },
  pickingTargets: [
    {id: "rm-tx", role: "tx", scope: "radiomap", prompt: "Click any surface to place Tx", precisionTitle: "Radio Map Tx", precision: true, clearance: true},
  ],
  renderLayers: ["radiomap", "surface-preview"],
});
