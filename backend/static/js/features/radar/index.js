import {defineFeature} from "/js/core/feature_registry.js";
import {createRadarController} from "/js/controllers/radar_controller.js?v=20260723-radar-progress";
import {createRadarControls} from "/js/features/radar/controls.js?v=20260723-radar-random-motion";
import {createRadarFeature} from "/js/features/radar/runtime.js?v=20260723-empty-devices";
import {createRadarRenderer} from "/js/features/radar/renderer.js?v=20260723-radar-processing-views";
import {createRadarState} from "/js/features/radar/state.js?v=20260723-radar-empty-scene";
import {createRadarTransport} from "/js/features/radar/transport.js?v=20260721-rs08";
import {createRadarResultView} from "/js/ui/radar_result_view.js?v=20260723-radar-result-summary";

function createResultView(context) {
  return createRadarResultView({
    state: context.state,
    shellUi: context.featureServices.shellUi,
    renderAll: context.featureServices.solver.renderAll,
    focusTarget: (targetId) => context.renderer?.focusTarget(targetId),
    resultDock: context.featureServices.resultDock,
  });
}

function createController(context) {
  const controls = createRadarControls(context);
  context.featureServices.radarControls = controls;
  return createRadarController({
    state: context.state,
    controls,
    transport: context.transport,
    renderAll: context.featureServices.solver.renderAll,
    showOverlay: context.featureServices.solver.showOverlay,
    hideOverlay: context.featureServices.solver.hideOverlay,
  });
}

export const radarFeature = defineFeature({
  id: "radar",
  order: 50,
  title: "Radar Sensing",
  createState: createRadarState,
  createTransport: createRadarTransport,
  createController,
  createResultView,
  createRenderer: createRadarRenderer,
  createFeature: createRadarFeature,
  provides: ["radar-domain"],
  settingsDependencies: ["radar-device", "surface-clearance"],
  sharedControlPolicy: {tx: true, rx: true, antenna: "none", channel: false},
  ui: {
    disableDuringTileLoad: true,
    resultMethod: "renderRadarResult",
  },
  pickingTargets: [
    {id: "radar-tx", role: "tx", scope: "radar", prompt: "Click any surface to place Radar Tx", precisionTitle: "Radar Tx", precision: true, clearance: true},
    {id: "radar-rx", role: "rx", scope: "radar", prompt: "Click any surface to place Radar Rx", precisionTitle: "Radar Rx", precision: true, clearance: true},
    {id: "radar-target", role: "target", scope: "radar", prompt: "Click a surface to place the selected Radar target", precision: false, clearance: false},
  ],
  renderLayers: ["radar-targets", "radar-paths", "radar-detections"],
});
