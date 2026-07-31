import {defineFeature} from "/js/core/feature_registry.js";
import {createRadarController} from "/js/controllers/radar_controller.js?v=20260723-radar-progress";
import {createRadarControls} from "/js/features/radar/controls.js?v=20260723-radar-random-motion";
import {createRadarFeature} from "/js/features/radar/runtime.js?v=20260723-empty-devices";
import {createRadarRenderer} from "/js/features/radar/renderer.js?v=20260723-radar-processing-views";
import {createRadarState} from "/js/features/radar/state.js?v=20260723-radar-empty-scene";
import {createRadarTransport} from "/js/features/radar/transport.js?v=20260721-rs08";
import {createRadarResultView} from "/js/ui/radar_result_view.js?v=20260723-radar-result-summary";

function createControlRefs(context) {
  const ids = [
    "radarPanel", "radarTxDeviceCard", "radarRxDeviceCard", "radarTxX", "radarTxY", "radarTxZ", "radarRxX", "radarRxY", "radarRxZ", "btnPickRadarTx", "btnPickRadarRx", "btnSolveRadar",
    "radarJobBar", "radarJobStatus", "radarJobMessage", "radarJobProgress", "btnCancelRadar", "btnRetryRadar", "radarModeMonostatic", "radarModeBistatic", "radarModeHint",
    "radarTargetsGroup", "radarAssetPicker", "radarAssetPreviewCanvas", "radarAssetPreviewStatus", "radarAssetPreviewName", "radarAssetPreviewCount", "radarAssetPickerHint", "btnRadarAssetPrevious", "btnRadarAssetNext", "btnAddRadarTarget", "radarTargetCount", "radarTargetList", "radarTargetEditor", "radarEditorTitle", "radarEditorAssetName", "radarTargetAsset", "radarTargetX", "radarTargetY", "radarTargetZ", "radarTargetRoll", "radarTargetPitch", "radarTargetYaw", "radarTargetSpeed", "radarTargetDirection", "radarTargetClimb", "radarVelocityVectorPreview", "radarTargetRcs", "btnPickRadarTarget", "btnFocusRadarTarget", "btnRemoveRadarTarget",
    "radarCarrierFrequency", "radarBandwidth", "radarNumSubcarriers", "radarNumSymbols", "radarTxPower", "radarNoiseFigure", "radarSystemLoss", "radarNoiseTemperature", "radarDirectPathCancellation", "radarRangeResolutionPreview", "radarDopplerResolutionPreview", "radarVelocityResolutionPreview",
    "radarCfarEnabled", "radarCfarGuardRange", "radarCfarGuardDoppler", "radarCfarTrainingRange", "radarCfarTrainingDoppler", "radarCfarPfa", "radarSamplesPerSrc", "radarMaxPaths", "radarMaxDepth", "radarSeed", "radarLos", "radarSpecular", "radarDiffuse", "radarRefraction", "radarDiffraction", "radarSyntheticArray", "radarInputError",
  ];
  const dom = Object.fromEntries(ids.map((id) => [
    id,
    context.featureServices.controls.element(id),
  ]));
  dom.radarOnlyParams = [dom.radarPanel];
  return dom;
}

function createResultView(context) {
  return createRadarResultView({
    state: context.state,
    ui: context.ui,
    renderAll: context.featureServices.solver.renderAll,
    focusTarget: (targetId) => context.renderer?.focusTarget(targetId),
    resultDock: context.featureServices.resultDock,
  });
}

function createController(context) {
  const controls = createRadarControls(context);
  context.featureServices.radarControls = controls;
  return createRadarController({
    state: context.state, controls, transport: context.transport,
    renderAll: context.featureServices.solver.renderAll,
    showOverlay: context.featureServices.solver.showOverlay,
    hideOverlay: context.featureServices.solver.hideOverlay,
  });
}

export const radarFeature = defineFeature({
  id: "radar", order: 50, title: "Radar Sensing", createState: createRadarState,
  createTransport: createRadarTransport, createController, createResultView, createRenderer: createRadarRenderer, createFeature: createRadarFeature, createRefs: createControlRefs,
  provides: ["radar-domain"], inputReader: "readRadarInputs", settingsDependencies: ["radar-device", "surface-clearance"],
  sharedControlPolicy: {tx: true, rx: true, antenna: false, channel: false},
  ui: {tabRef: "tabRadar", panelRef: "radarPanel", runButtonRef: "btnSolveRadar", disableDuringTileLoad: true, parameterGroups: ["radarOnlyParams"], resultMethod: "renderRadarResult"},
  pickingTargets: [
    {id: "radar-tx", role: "tx", scope: "radar", prompt: "Click any surface to place Radar Tx", buttonRef: "btnPickRadarTx", cardRef: "radarTxDeviceCard", precisionTitle: "Radar Tx", precision: true, clearance: true, readMethod: "readRadarInputs", applyMethod: "applyRadarPick"},
    {id: "radar-rx", role: "rx", scope: "radar", prompt: "Click any surface to place Radar Rx", buttonRef: "btnPickRadarRx", cardRef: "radarRxDeviceCard", precisionTitle: "Radar Rx", precision: true, clearance: true, readMethod: "readRadarInputs", applyMethod: "applyRadarPick"},
    {id: "radar-target", role: "target", scope: "radar", prompt: "Click a surface to place the selected Radar target", buttonRef: "btnPickRadarTarget", precision: false, clearance: false, readMethod: "readRadarInputs", applyMethod: "applyRadarPick"},
  ],
  renderLayers: ["radar-targets", "radar-paths", "radar-detections"],
});
