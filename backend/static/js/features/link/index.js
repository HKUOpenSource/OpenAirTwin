import {defineFeature} from "/js/core/feature_registry.js";
import {createLinkController} from "/js/controllers/link_controller.js?v=20260723-empty-devices";
import {createLinkFeature} from "/js/features/link/runtime.js?v=20260723-empty-devices";
import {createLinkRenderer} from "/js/features/link/renderer.js";
import {createLinkState} from "/js/features/link/state.js?v=20260723-empty-devices";
import {createLinkTransport} from "/js/features/link/transport.js";
import {createLinkResultView} from "/js/ui/link_result_view.js?v=20260519-mode-isolation";

function createResultView(context) {
  const resultView = createLinkResultView({
    state: context.state,
    shellUi: context.featureServices.shellUi,
    getViewer: context.featureServices.solver.getViewer,
    resultDock: context.featureServices.resultDock,
  });
  context.featureServices.pathResults = resultView;
  return resultView;
}

function createController(context) {
  const shared = context.featureServices.solver;
  context.featureServices.linkDomain = Object.freeze({
    solverConfig: shared.linkSolverConfig,
    channelConfig: shared.linkChannelConfig,
    enableChannelTaps() {
      context.state.link.advanced.computeTaps = true;
    },
    propagationConfig() {
      const advanced = context.state.link.advanced;
      return {
        diffraction: advanced.diffraction,
        edge_diffraction: advanced.edgeDiffraction,
        diffraction_lit_region: advanced.diffractionLitRegion,
      };
    },
  });
  return createLinkController({
    state: context.state,
    getViewer: shared.getViewer,
    solveLink: context.transport.solveLink,
    readLinkInputs: shared.readLinkInputs,
    readLivePreviewInputs: shared.readLivePreviewInputs,
    linkSolvePayload: shared.linkSolvePayload,
    showOverlay: shared.showOverlay,
    hideOverlay: shared.hideOverlay,
    renderAll: shared.renderAll,
    setLivePreviewStatus: shared.setLivePreviewStatus,
    clearLivePreviewStatus: shared.clearLivePreviewStatus,
  });
}

export const linkFeature = defineFeature({
  id: "link",
  order: 10,
  title: "Link Analysis",
  createState: createLinkState,
  createTransport: createLinkTransport,
  createController,
  createResultView,
  createRenderer: createLinkRenderer,
  createFeature: createLinkFeature,
  provides: ["link-domain", "path-results"],
  settingsDependencies: ["common-solver", "antenna", "link-channel", "link-device", "surface-clearance"],
  sharedControlPolicy: {tx: true, rx: true, antenna: "both", channel: true},
  ui: {
    disableDuringTileLoad: true,
    resultMethod: "renderLinkResult",
  },
  pickingTargets: [
    {id: "link-tx", role: "tx", scope: "link", prompt: "Click any surface to place Tx", precisionTitle: "Link Tx", precision: true, clearance: true},
    {id: "link-rx", role: "rx", scope: "link", prompt: "Click any surface to place Rx", precisionTitle: "Link Rx", precision: true, clearance: true},
  ],
  renderLayers: ["paths"],
});
