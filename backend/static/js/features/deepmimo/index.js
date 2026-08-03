import {defineFeature} from "/js/core/feature_registry.js";
import {createDeepMimoController} from "/js/controllers/deepmimo_controller.js?v=20260519-mode-isolation";
import {createDeepMimoFeature} from "/js/features/deepmimo/runtime.js?v=20260723-empty-devices";
import {createDeepMimoRenderer} from "/js/features/deepmimo/renderer.js";
import {createDeepMimoState} from "/js/features/deepmimo/state.js?v=20260723-empty-devices";
import {createDeepMimoTransport} from "/js/features/deepmimo/transport.js";
import {createDeepMimoDatasetView} from "/js/ui/deepmimo_dataset_view.js?v=20260519-mode-isolation";

function createResultView(context) {
  const shared = context.featureServices.solver;
  return createDeepMimoDatasetView({
    state: context.state,
    ui: context.ui,
    getViewer: shared.getViewer,
    deepMimoRoiBounds: shared.deepMimoRoiBounds,
    deepMimoReceiverEstimate: shared.deepMimoReceiverEstimate,
    deepMimoDownloadUrl: context.transport.deepMimoDownloadUrl,
    closeModeMenu: context.utilities.closeModeMenu,
    datasetModel: context.featureServices.deepMimoDatasets,
  });
}

function createController(context) {
  const shared = context.featureServices.solver;
  return createDeepMimoController({
    state: context.state,
    getViewer: shared.getViewer,
    createDeepMimoJob: context.transport.createDeepMimoJob,
    cancelDeepMimoJob: context.transport.cancelDeepMimoJob,
    getDeepMimoJob: context.transport.getDeepMimoJob,
    deepMimoPayload: shared.deepMimoPayload,
    showOverlay: shared.showOverlay,
    hideOverlay: shared.hideOverlay,
    renderDeepMimoState: context.resultView.renderDeepMimoState,
    addDeepMimoDataset: context.resultView.addDeepMimoDataset,
  });
}

export const deepMimoFeature = defineFeature({
  id: "deepmimo",
  order: 40,
  title: "DeepMIMO",
  createState: createDeepMimoState,
  createTransport: createDeepMimoTransport,
  createController,
  createResultView,
  createRenderer: createDeepMimoRenderer,
  createFeature: createDeepMimoFeature,
  dependencies: ["link-domain"],
  inputReader: "readDeepMimoInputs",
  settingsDependencies: ["common-solver", "link-channel"],
  sharedControlPolicy: {tx: true, rx: false, antenna: "fixed"},
  ui: {
    tabRef: "tabDeepMimo",
    panelRef: "deepmimoPanel",
    runButtonRef: "btnRunDeepMimo",
    extraActionButtonRefs: ["btnDeepMimoClearRoi"],
    parameterGroups: ["deepmimoOnlyParams"],
    filteredParameterGroups: [{ref: "linkOnlyParams", className: "deepmimoAntennaParam"}],
    resultMethod: "renderDeepMimoState",
  },
  pickingTargets: [
    {id: "deepmimo-tx", role: "tx", scope: "deepmimo", prompt: "Click any surface to place DeepMIMO Tx", buttonRef: "btnDeepMimoPickTx", cardRef: "deepMimoTxDeviceCard", precisionTitle: "DM Tx", precision: true, clearance: true, readMethod: "readDeepMimoInputs", applyMethod: "applyDeepMimoTxPick"},
    {id: "deepmimo-roi", role: "roi", scope: "deepmimo", prompt: "Drag on the terrain to draw a rectangular DeepMIMO ROI", buttonRef: "btnDeepMimoPickRoi", precisionTitle: "ROI", precision: false, readMethod: "readDeepMimoInputs", applyMethod: "applyDeepMimoRoiPick", pointerAdapter: "rectangle-roi"},
  ],
  renderLayers: ["roi"],
});
