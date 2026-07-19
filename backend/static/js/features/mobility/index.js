import {defineFeature} from "/js/core/feature_registry.js";
import {createMobilityController} from "/js/controllers/mobility_controller.js?v=20260519-mode-isolation";
import {createMobilityFeature} from "/js/features/mobility/runtime.js";
import {createMobilityRenderer} from "/js/features/mobility/renderer.js";
import {createMobilityState} from "/js/features/mobility/state.js";
import {createMobilityTransport} from "/js/features/mobility/transport.js";
import {mobilityJobPayload} from "/js/solvers/solver_payloads.js?v=20260519-mode-isolation";
import {createMobilityResultView} from "/js/ui/mobility_result_view.js?v=20260519-mode-isolation";

function createResultView(context) {
  const shared = context.featureServices.solver;
  const paths = context.featureServices.pathResults;
  if (!paths) {
    throw new Error("Mobility requires the path-results capability");
  }
  return createMobilityResultView({
    state: context.state,
    ui: context.ui,
    getViewer: shared.getViewer,
    renderAll: shared.renderAll,
    renderLinkChannel: paths.renderLinkChannel,
    clearPathSelection: paths.clearPathSelection,
    hidePathDetails: paths.hidePathDetails,
    renderPathDetails: paths.renderPathDetails,
    renderPathSelection: paths.renderPathSelection,
    scrollSelectedPathDetailsIntoView: paths.scrollSelectedPathDetailsIntoView,
  });
}

function createController(context) {
  const shared = context.featureServices.solver;
  const linkDomain = context.featureServices.linkDomain;
  if (!linkDomain) {
    throw new Error("Mobility requires the link-domain capability");
  }
  return createMobilityController({
    state: context.state,
    getViewer: shared.getViewer,
    createMobilityJob: context.transport.createMobilityJob,
    getMobilityJob: context.transport.getMobilityJob,
    getMobilityResult: context.transport.getMobilityResult,
    readMobilityInputs: shared.readMobilityInputs,
    mobilityEstimate: shared.mobilityEstimate,
    mobilityJobPayload: () => mobilityJobPayload({
      state: context.state,
      inputs: context.inputs,
      linkDomain,
    }),
    showOverlay: shared.showOverlay,
    hideOverlay: shared.hideOverlay,
    renderMobilityResult: context.resultView.renderMobilityResult,
    renderMobilityTrajectoryPreview: shared.renderMobilityTrajectoryPreview,
    stopMobilityPlayback: context.resultView.stopMobilityPlayback,
  });
}

export const mobilityFeature = defineFeature({
  id: "mobility",
  order: 20,
  title: "Mobility Analysis",
  createState: createMobilityState,
  createTransport: createMobilityTransport,
  createController,
  createResultView,
  createRenderer: createMobilityRenderer,
  createFeature: createMobilityFeature,
  dependencies: ["link-domain", "path-results"],
  inputReader: "readMobilityInputs",
  settingsDependencies: ["common-solver", "antenna", "link-channel", "link-device", "surface-clearance"],
  sharedControlPolicy: {tx: true, rx: true, antenna: "both", channel: true},
  ui: {
    tabRef: "tabMobility",
    panelRef: "mobilityPanel",
    runButtonRef: "btnRunMobility",
    disableDuringTileLoad: true,
    parameterGroups: ["linkOnlyParams", "mobilityOnlyParams"],
    resultMethod: "renderMobilityResult",
  },
  pickingTargets: [
    {id: "mobility-tx", role: "tx", scope: "mobility", prompt: "Click any surface to place Tx", buttonRef: "btnPickMobilityTx", cardRef: "mobilityTxDeviceCard", precisionTitle: "Tx", precision: true, clearance: true, readMethod: "readMobilityInputs", applyMethod: "applyMobilityPick"},
    {id: "mobility-rx", role: "rx", scope: "mobility", prompt: "Click any surface to place Rx", buttonRef: "btnPickMobilityRx", cardRef: "mobilityRxDeviceCard", precisionTitle: "Rx", precision: true, clearance: true, readMethod: "readMobilityInputs", applyMethod: "applyMobilityPick"},
  ],
  renderLayers: ["paths", "trajectory"],
});
