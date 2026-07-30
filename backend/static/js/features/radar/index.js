import {defineFeature} from "/js/core/feature_registry.js";
import {createRadarController} from "/js/controllers/radar_controller.js?v=20260723-radar-progress";
import {createRadarControls} from "/js/features/radar/controls.js?v=20260723-radar-random-motion";
import {createRadarFeature} from "/js/features/radar/runtime.js?v=20260723-empty-devices";
import {createRadarRenderer} from "/js/features/radar/renderer.js?v=20260723-radar-processing-views";
import {createRadarState} from "/js/features/radar/state.js?v=20260723-radar-empty-scene";
import {createRadarTransport} from "/js/features/radar/transport.js?v=20260721-rs08";
import {createRadarResultView} from "/js/ui/radar_result_view.js?v=20260723-radar-result-summary";

const MODE_MENU = `
  <button class="modeMenuItem" data-mode="radar" id="tabRadar" type="button" role="option" aria-selected="false">
    <span class="modeMenuDot" aria-hidden="true"></span>
    <span class="modeMenuTitle">Radar Sensing</span>
  </button>
`;

const INFO_TIP = (label, copy) => `<span class="infoTip" tabindex="0" aria-label="${label} details">i<span class="tipBubble" role="tooltip">${copy}</span></span>`;

const FIELD = (id, label, value, unit = "", attrs = "", help = "") => `
  <label class="radarField oat-field" for="${id}"><span class="radarFieldLabel">${label}${help ? INFO_TIP(label, help) : ""}</span>
    <span class="unitInput"><input class="oat-input" id="${id}" type="number" value="${value}" ${attrs}/>${unit ? `<span class="unitSuffix" aria-hidden="true">${unit}</span>` : ""}</span>
  </label>`;

const PANEL = `
  <section id="radarPanel" class="modePanel radarOnlyParams hidden" aria-label="Radar sensing configuration">
    <div id="radarJobBar" class="radarJobBar hidden" data-status="idle">
      <div class="radarJobCopy"><span id="radarJobStatus" class="radarStatusPill oat-badge">READY</span><strong id="radarJobMessage">Ready</strong></div>
      <progress id="radarJobProgress" max="1" value="0" aria-label="Radar task progress"></progress>
      <div class="radarJobActions"><button id="btnCancelRadar" class="miniBtn oat-button oat-button--compact hidden" type="button">Cancel</button><button id="btnRetryRadar" class="miniBtn oat-button oat-button--compact hidden" type="button">Retry</button></div>
    </div>

    <details id="radarGeometryGroup" class="paramGroup radarGroup">
      <summary class="paramGroupSummary">Radar Geometry</summary>
      <div class="paramGroupBody radarGroupBody">
        <div class="radarModeSwitch" role="radiogroup" aria-label="Radar geometry">
          <label class="oat-check"><input id="radarModeMonostatic" name="radarMode" type="radio" value="monostatic"/> Monostatic</label>
          <label class="oat-check"><input id="radarModeBistatic" name="radarMode" type="radio" value="bistatic" checked/> Bistatic</label>
        </div>
        <p id="radarModeHint" class="radarHint">Tx and Rx are placed independently.</p>
      </div>
    </details>

    <details id="radarTargetsGroup" class="paramGroup radarGroup">
      <summary class="paramGroupSummary"><span>Drone Targets</span><span id="radarTargetCount" class="radarSummaryBadge oat-badge">0 / 16</span></summary>
      <div class="paramGroupBody radarGroupBody">
        <div id="radarAssetPicker" class="radarAssetPicker" data-state="loading" aria-label="New target model">
          <div class="radarAssetPreviewViewport">
            <canvas id="radarAssetPreviewCanvas" class="radarAssetPreviewCanvas" role="img" aria-label="Drone model preview"></canvas>
            <div id="radarAssetPreviewStatus" class="radarAssetPreviewStatus" role="status">Loading drone models…</div>
            <button id="btnRadarAssetPrevious" class="radarAssetNav previous" type="button" aria-label="Previous drone model">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 18-6-6 6-6"></path></svg>
            </button>
            <button id="btnRadarAssetNext" class="radarAssetNav next" type="button" aria-label="Next drone model">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 18 6-6-6-6"></path></svg>
            </button>
          </div>
          <div class="radarAssetPickerMeta">
            <div><span>New Target Model</span><strong id="radarAssetPreviewName" aria-live="polite">Loading…</strong></div>
            <span id="radarAssetPreviewCount" class="radarAssetPreviewCount">0 / 0</span>
          </div>
          <button id="btnAddRadarTarget" class="miniBtn oat-button oat-button--compact oat-button--primary oat-button--block radarAssetAddButton" type="button" disabled>Add Target</button>
          <div class="radarEditorActions" role="group" aria-label="Selected target actions"><button id="btnPickRadarTarget" class="miniBtn oat-button oat-button--compact oat-button--toolbar" type="button">Pick in 3D</button><button id="btnFocusRadarTarget" class="miniBtn oat-button oat-button--compact oat-button--toolbar" type="button">Focus Target</button><button id="btnRemoveRadarTarget" class="miniBtn danger oat-button oat-button--compact oat-button--toolbar oat-button--danger" type="button">Remove Target</button></div>
          <p id="radarAssetPickerHint" class="radarAssetPickerHint">Drag to rotate the 3D preview.</p>
        </div>
        <div id="radarTargetList" class="radarTargetList oat-scroll-region" role="listbox" aria-label="Radar targets"></div>
        <div id="radarTargetEditor" class="radarTargetEditor">
          <div class="radarEditorHead"><strong id="radarEditorTitle">Target</strong><span id="radarEditorAssetName">--</span></div>
          <label class="radarField radarWide" for="radarTargetAsset"><span class="radarFieldLabel">Drone Model</span><select id="radarTargetAsset"></select></label>
          <div class="radarVectorLabel">Position</div><div class="radarVectorGrid">
            ${FIELD("radarTargetX", "X", "0", "m", "step=\"0.1\"")}${FIELD("radarTargetY", "Y", "0", "m", "step=\"0.1\"")}${FIELD("radarTargetZ", "Z", "0", "m", "step=\"0.1\"")}
          </div>
          <div class="radarVectorLabel">Attitude</div><div class="radarVectorGrid">
            ${FIELD("radarTargetRoll", "Roll", "0", "°", "step=\"1\"")}${FIELD("radarTargetPitch", "Pitch", "0", "°", "step=\"1\"")}${FIELD("radarTargetYaw", "Yaw", "0", "°", "step=\"1\" readonly aria-readonly=\"true\"", "Automatically follows the X–Y motion direction.")}
          </div>
          <div class="radarVectorLabel">Motion</div><div class="radarVectorGrid radarVelocityGrid">
            ${FIELD("radarTargetSpeed", "Speed", "0", "m/s", "min=\"0\" max=\"500\" step=\"0.1\"")}${FIELD("radarTargetDirection", "Direction", "0", "°", "min=\"-180\" max=\"360\" step=\"1\"")}${FIELD("radarTargetClimb", "Climb", "0", "°", "min=\"-90\" max=\"90\" step=\"1\"")}
          </div>
          <div class="radarVelocityMeta"><span>0° = +X · 90° = +Y · Yaw follows Direction</span><span id="radarVelocityVectorPreview">Velocity [0.0, 0.0, 0.0] m/s</span></div>
          ${FIELD("radarTargetRcs", "Effective RCS", "0.01", "m²", "min=\"0.000001\" max=\"1000000\" step=\"0.001\"", "Effective radar cross section used to scale the target echo power.")}
        </div>
      </div>
    </details>

    <details id="radarWaveformGroup" class="paramGroup radarGroup">
      <summary class="paramGroupSummary">OFDM Waveform</summary>
      <div class="paramGroupBody radarGroupBody">
        <div class="radarFieldGrid">
          ${FIELD("radarCarrierFrequency", "Carrier Frequency", "5.8", "GHz", "min=\"0.1\" max=\"300\" step=\"0.1\"", "RF carrier used for wavelength, propagation, and Doppler calculations.")}
          ${FIELD("radarBandwidth", "Bandwidth", "128", "MHz", "min=\"0.001\" step=\"1\"", "Occupied OFDM bandwidth. Wider bandwidth improves equivalent range resolution.")}
          <label class="radarField" for="radarNumSubcarriers"><span class="radarFieldLabel">OFDM Subcarriers${INFO_TIP("OFDM subcarriers", "Number of frequency bins in each OFDM symbol. Together with bandwidth, this sets subcarrier spacing.")}</span><select id="radarNumSubcarriers"><option>16</option><option>32</option><option>64</option><option>128</option><option>256</option><option>512</option><option selected>1024</option><option>2048</option></select></label>
          <label class="radarField" for="radarNumSymbols"><span class="radarFieldLabel">OFDM Symbols${INFO_TIP("OFDM symbols", "Number of slow-time symbols used for Doppler processing. More symbols improve Doppler resolution and increase processing cost.")}</span><select id="radarNumSymbols"><option>8</option><option>16</option><option>32</option><option>64</option><option>128</option><option>256</option><option>512</option><option selected>1024</option></select></label>
          ${FIELD("radarTxPower", "Tx Power", "30", "dBm", "min=\"-100\" max=\"100\" step=\"1\"", "Total transmitted radar power used in the received-power and SNR calculation.")}
          ${FIELD("radarNoiseFigure", "Noise Figure", "7", "dB", "min=\"0\" max=\"100\" step=\"0.1\"", "Receiver noise figure added to thermal noise when calculating the detection SNR.")}
          ${FIELD("radarSystemLoss", "System Loss", "3", "dB", "min=\"0\" max=\"100\" step=\"0.1\"", "Aggregate implementation and hardware loss applied to the received signal.")}
          ${FIELD("radarNoiseTemperature", "Noise Temperature", "290", "K", "min=\"1\" max=\"1000\" step=\"1\"", "System noise temperature used to calculate thermal noise power.")}
        </div>
        <label class="radarCheck"><input id="radarDirectPathCancellation" type="checkbox" checked/><span>Cancel known direct Tx–Rx leakage${INFO_TIP("Direct path cancellation", "Removes the modeled direct transmitter-to-receiver path before OFDM processing so it does not mask weaker target echoes.")}</span></label>
        <div class="radarDerived"><span><span class="radarDerivedLabel"><span>Range<br/>Resolution</span>${INFO_TIP("Range resolution", "Equivalent range-bin spacing derived from the configured bandwidth.")}</span><b id="radarRangeResolutionPreview">--</b></span><span><span class="radarDerivedLabel"><span>Doppler<br/>Resolution</span>${INFO_TIP("Doppler resolution", "Doppler-bin spacing derived from subcarrier spacing and the number of OFDM symbols.")}</span><b id="radarDopplerResolutionPreview">--</b></span><span><span class="radarDerivedLabel"><span>Velocity<br/>Resolution</span>${INFO_TIP("Velocity resolution", "Equivalent radial-velocity spacing derived from Doppler resolution and carrier wavelength.")}</span><b id="radarVelocityResolutionPreview">--</b></span></div>
      </div>
    </details>

    <details id="radarCfarGroup" class="paramGroup radarGroup">
      <summary class="paramGroupSummary">CA-CFAR Detection</summary>
      <div class="paramGroupBody radarGroupBody">
        <label class="radarCheck"><input id="radarCfarEnabled" type="checkbox" checked/> Enable CA-CFAR detections</label>
        <div class="radarFieldGrid">
          ${FIELD("radarCfarGuardRange", "Range Guard Cells", "1", "", "min=\"0\" max=\"64\" step=\"1\"", "Range cells excluded around the cell under test so target energy does not bias the noise estimate.")}
          ${FIELD("radarCfarGuardDoppler", "Doppler Guard Cells", "1", "", "min=\"0\" max=\"64\" step=\"1\"", "Doppler cells excluded around the cell under test.")}
          ${FIELD("radarCfarTrainingRange", "Range Training Cells", "2", "", "min=\"1\" max=\"128\" step=\"1\"", "Range cells sampled on each side to estimate the local clutter and noise level.")}
          ${FIELD("radarCfarTrainingDoppler", "Doppler Training Cells", "4", "", "min=\"1\" max=\"128\" step=\"1\"", "Doppler cells sampled on each side to estimate the local clutter and noise level.")}
          ${FIELD("radarCfarPfa", "False-alarm Probability (Pfa)", "1e-8", "", "min=\"1e-12\" max=\"0.1\" step=\"1e-8\"", "Desired probability of false alarm used to derive the CA-CFAR detection threshold.")}
        </div>
      </div>
    </details>

    <details id="radarPropagationGroup" class="paramGroup radarGroup">
      <summary class="paramGroupSummary">Propagation Solver</summary>
      <div class="paramGroupBody radarGroupBody">
        <div class="radarFieldGrid">
          ${FIELD("radarSamplesPerSrc", "Samples / Source", "65536", "", "min=\"1\" max=\"1000000\" step=\"256\"", "Monte Carlo rays launched per source. Higher values reduce sampling noise and increase runtime.")}
          ${FIELD("radarMaxPaths", "Max Paths / Source", "4096", "", "min=\"1\" max=\"1000000\" step=\"256\"", "Maximum number of propagation paths retained per source.")}
          ${FIELD("radarMaxDepth", "Max Depth", "2", "", "min=\"0\" max=\"20\" step=\"1\"", "Maximum number of propagation interactions allowed for each path.")}
          ${FIELD("radarSeed", "Seed", "42", "", "min=\"0\" max=\"2147483647\" step=\"1\"", "Random seed for repeatable ray sampling and clutter results.")}
        </div>
        <div class="radarCheckGrid">
          <label class="radarCheck"><input id="radarLos" type="checkbox" checked/><span>LoS${INFO_TIP("Line of sight", "Includes unobstructed propagation paths between Radar devices and scene objects.")}</span></label>
          <label class="radarCheck"><input id="radarSpecular" type="checkbox" checked/><span>Specular${INFO_TIP("Specular reflection", "Includes mirror-like reflections from scene surfaces.")}</span></label>
          <label class="radarCheck"><input id="radarDiffuse" type="checkbox" checked/><span>Diffuse${INFO_TIP("Diffuse reflection", "Includes rough-surface scattering used to model environmental clutter.")}</span></label>
          <label class="radarCheck"><input id="radarRefraction" type="checkbox" checked/><span>Refraction${INFO_TIP("Refraction", "Includes transmission through supported scene materials.")}</span></label>
          <label class="radarCheck"><input id="radarDiffraction" type="checkbox"/><span>Diffraction${INFO_TIP("Diffraction", "Includes bending around wedges and edges. This can improve NLoS coverage and increase solve time.")}</span></label>
          <label class="radarCheck"><input id="radarSyntheticArray" type="checkbox"/><span>Synthetic Array${INFO_TIP("Synthetic Array", "Uses a synthetic-array approximation for array studies.")}</span></label>
        </div>
      </div>
    </details>

    <p id="radarInputError" class="radarInputError hidden" role="alert"></p>
  </section>
`;

const DEVICE_CARDS = `
  <section id="radarTxDeviceCard" class="deviceCoordPanel hidden"><div class="deviceCoordGrid">
    <label>X <span class="unitInput"><input id="radarTxX" type="number" step="1" placeholder="—"/><span class="unitSuffix">m</span></span></label><label>Y <span class="unitInput"><input id="radarTxY" type="number" step="1" placeholder="—"/><span class="unitSuffix">m</span></span></label><label>Z <span class="unitInput"><input id="radarTxZ" type="number" step="1" placeholder="—"/><span class="unitSuffix">m</span></span></label>
  </div></section>
  <section id="radarRxDeviceCard" class="deviceCoordPanel hidden"><div class="deviceCoordGrid">
    <label>X <span class="unitInput"><input id="radarRxX" type="number" step="1" placeholder="—"/><span class="unitSuffix">m</span></span></label><label>Y <span class="unitInput"><input id="radarRxY" type="number" step="1" placeholder="—"/><span class="unitSuffix">m</span></span></label><label>Z <span class="unitInput"><input id="radarRxZ" type="number" step="1" placeholder="—"/><span class="unitSuffix">m</span></span></label>
  </div></section>`;

const DEVICE_ACTIONS = `
  <button class="deviceActionBtn radarDevicePick hidden" id="btnPickRadarTx" type="button" aria-label="Pick radar transmitter"><span class="deviceActionIcon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M12 19v-7"></path><path d="M7 9a5 5 0 0 1 10 0"></path><path d="M4 6a9 9 0 0 1 16 0"></path><path d="M10 21h4"></path></svg></span><span class="deviceActionText">Tx</span></button>
  <button class="deviceActionBtn radarDevicePick hidden" id="btnPickRadarRx" type="button" aria-label="Pick radar receiver"><span class="deviceActionIcon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M12 19v-7"></path><path d="M17 9a5 5 0 0 0-10 0"></path><path d="M20 6A9 9 0 0 0 4 6"></path><path d="M9 21h6"></path></svg></span><span class="deviceActionText">Rx</span></button>
  <button class="deviceActionBtn solve radarDeviceRun hidden" id="btnSolveRadar" type="button"><span class="deviceActionIcon" aria-hidden="true"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="2"></circle><path d="M5.6 8.2a7 7 0 0 0 0 7.6"></path><path d="M18.4 8.2a7 7 0 0 1 0 7.6"></path><path d="M2.7 5.2a11 11 0 0 0 0 13.6"></path><path d="M21.3 5.2a11 11 0 0 1 0 13.6"></path></svg></span><span class="deviceActionText">Run Radar</span></button>`;

function queryDom(root) {
  const ids = [
    "tabRadar", "radarPanel", "radarTxDeviceCard", "radarRxDeviceCard", "radarTxX", "radarTxY", "radarTxZ", "radarRxX", "radarRxY", "radarRxZ", "btnPickRadarTx", "btnPickRadarRx", "btnSolveRadar",
    "radarJobBar", "radarJobStatus", "radarJobMessage", "radarJobProgress", "btnCancelRadar", "btnRetryRadar", "radarModeMonostatic", "radarModeBistatic", "radarModeHint",
    "radarTargetsGroup", "radarAssetPicker", "radarAssetPreviewCanvas", "radarAssetPreviewStatus", "radarAssetPreviewName", "radarAssetPreviewCount", "radarAssetPickerHint", "btnRadarAssetPrevious", "btnRadarAssetNext", "btnAddRadarTarget", "radarTargetCount", "radarTargetList", "radarTargetEditor", "radarEditorTitle", "radarEditorAssetName", "radarTargetAsset", "radarTargetX", "radarTargetY", "radarTargetZ", "radarTargetRoll", "radarTargetPitch", "radarTargetYaw", "radarTargetSpeed", "radarTargetDirection", "radarTargetClimb", "radarVelocityVectorPreview", "radarTargetRcs", "btnPickRadarTarget", "btnFocusRadarTarget", "btnRemoveRadarTarget",
    "radarCarrierFrequency", "radarBandwidth", "radarNumSubcarriers", "radarNumSymbols", "radarTxPower", "radarNoiseFigure", "radarSystemLoss", "radarNoiseTemperature", "radarDirectPathCancellation", "radarRangeResolutionPreview", "radarDopplerResolutionPreview", "radarVelocityResolutionPreview",
    "radarCfarEnabled", "radarCfarGuardRange", "radarCfarGuardDoppler", "radarCfarTrainingRange", "radarCfarTrainingDoppler", "radarCfarPfa", "radarSamplesPerSrc", "radarMaxPaths", "radarMaxDepth", "radarSeed", "radarLos", "radarSpecular", "radarDiffuse", "radarRefraction", "radarDiffraction", "radarSyntheticArray", "radarInputError",
  ];
  const dom = Object.fromEntries(ids.map((id) => [id, root.getElementById(id)]));
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
  createTransport: createRadarTransport, createController, createResultView, createRenderer: createRadarRenderer, createFeature: createRadarFeature, queryDom,
  templateFragments: {featureModeMenuAnchor: MODE_MENU, featurePanelAnchor: PANEL, featureDeviceCardAnchor: DEVICE_CARDS, featureDeviceActionAnchor: DEVICE_ACTIONS},
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
