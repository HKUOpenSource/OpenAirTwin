import {defineFeature} from "/js/core/feature_registry.js";
import {createMobilityController} from "/js/controllers/mobility_controller.js?v=20260519-mode-isolation";
import {createMobilityFeature} from "/js/features/mobility/runtime.js?v=20260723-empty-devices";
import {createMobilityRenderer} from "/js/features/mobility/renderer.js";
import {createMobilityState} from "/js/features/mobility/state.js?v=20260723-empty-devices";
import {createMobilityTransport} from "/js/features/mobility/transport.js";
import {mobilityJobPayload} from "/js/solvers/solver_payloads.js?v=20260723-empty-devices";
import {createMobilityResultView} from "/js/ui/mobility_result_view.js?v=20260519-mode-isolation";

function createResultView(context) {
  const shared = context.featureServices.solver;
  const paths = context.featureServices.pathResults;
  if (!paths) {
    throw new Error("Mobility requires the path-results capability");
  }
  return createMobilityResultView({
    state: context.state,
    shellUi: context.featureServices.shellUi,
    getViewer: shared.getViewer,
    renderAll: shared.renderAll,
    resultDock: context.featureServices.resultDock,
    createChannelViewModel: paths.createChannelViewModel,
    createPathResultsViewModel: paths.createPathResultsViewModel,
    drawLinkTapChart: paths.drawLinkTapChart,
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
  settingsDependencies: ["common-solver", "antenna", "link-channel", "link-device", "surface-clearance"],
  sharedControlPolicy: {tx: true, rx: true, antenna: "both", channel: true},
  ui: {
    disableDuringTileLoad: true,
    resultMethod: "renderMobilityResult",
  },
  pickingTargets: [
    {id: "mobility-tx", role: "tx", scope: "mobility", prompt: "Click any surface to place Tx", precisionTitle: "Mobility Tx", precision: true, clearance: true},
    {id: "mobility-rx", role: "rx", scope: "mobility", prompt: "Click any surface to place Rx", precisionTitle: "Mobility Rx", precision: true, clearance: true},
  ],
  renderLayers: ["paths", "trajectory"],
});
