const OWNERS = Object.freeze({
  deepmimo: "feature:deepmimo",
  link: "feature:link",
  mobility: "feature:mobility",
  radar: "feature:radar",
  radiomap: "feature:radiomap",
  deviceDock: "shell:device-dock",
  entryMap: "shell:entry-map",
  overlay: "shell:overlay",
  performance: "shell:performance",
  registry: "shell:feature-registry",
  resultDock: "shell:result-dock",
  solver: "shell:solver-controls",
  viewer: "shell:viewer",
  workbench: "shell:workbench",
});

export const PHASE8_RETIRED_ELEMENT_IDS = Object.freeze([
  "featureModeMenuAnchor",
  "featureParameterAnchor",
  "featurePanelAnchor",
  "featureDeviceCardAnchor",
  "featureDeviceActionAnchor",
]);

export const PHASE8_RETIRED_CLASSES = Object.freeze([
  "btn",
  "danger",
  "miniBtn",
  "miniSelect",
  "oat-button--legacy-native-font",
  "primary",
]);

export function normalizePhase8DomContract(contract) {
  const retiredIds = new Set(PHASE8_RETIRED_ELEMENT_IDS);
  const retiredClasses = new Set(PHASE8_RETIRED_CLASSES);
  return {
    ...contract,
    elements: contract.elements
      .filter(({id}) => !retiredIds.has(id))
      .map((element, order) => ({
        ...element,
        order,
        classes: element.classes.filter((className) => !retiredClasses.has(className)),
      })),
  };
}

const BUTTON_COMMANDS = Object.freeze({
  appDialogClose: "dialog.dismiss",
  appDialogPrimary: "dialog.primary.confirm",
  appDialogSecondary: "dialog.secondary.cancel",
  btnAddRadarTarget: "radar.target.add",
  btnCancelRadar: "radar.job.cancel",
  btnDeepMimoClearRoi: "deepmimo.roi.clear",
  btnDeepMimoPickRoi: "deepmimo.roi.pick",
  btnDeepMimoPickTx: "deepmimo.device.pickTx",
  btnEnterScene: "entry.scene.enter",
  btnEntryFitMap: "entry.map.fit",
  btnEntryFocusSelection: "entry.map.focusSelection",
  btnEntryReturnScene: "entry.scene.return",
  btnEntrySearch: "entry.search.submit",
  btnEntrySidebarToggle: "entry.sidebar.toggle",
  btnEntryZoomIn: "entry.map.zoomIn",
  btnEntryZoomOut: "entry.map.zoomOut",
  btnFocusRadarTarget: "radar.target.focus",
  btnHideHeavyCategories: "performance.categories.hideHeavy",
  btnLoadingCancel: "loading.cancel",
  btnMobilityAddRxPoint: "mobility.waypoint.addCurrentRx",
  btnMobilityClearPoints: "mobility.waypoint.clear",
  btnMobilityPlay: "mobility.playback.toggle",
  btnOpenTileIndex: "entry.scene.open",
  btnOrbitTx: "viewer.txOrbit.toggle",
  btnPerformanceDockToggle: "performance.dock.toggle",
  btnPickLinkRx: "link.device.pickRx",
  btnPickLinkTx: "link.device.pickTx",
  btnPickMobilityRx: "mobility.device.pickRx",
  btnPickMobilityTx: "mobility.device.pickTx",
  btnPickRadarRx: "radar.device.pickRx",
  btnPickRadarTarget: "radar.target.pick",
  btnPickRadarTx: "radar.device.pickTx",
  btnPickRmTx: "radiomap.device.pickTx",
  btnRadarAssetNext: "radar.asset.next",
  btnRadarAssetPrevious: "radar.asset.previous",
  btnRemoveRadarTarget: "radar.target.remove",
  btnResultDockToggle: "results.dock.toggle",
  btnRetryRadar: "radar.job.retry",
  btnRunDeepMimo: "deepmimo.export.run",
  btnRunMobility: "mobility.solve.run",
  btnRunRadiomap: "radiomap.solve.run",
  btnShowAllCategories: "performance.categories.showAll",
  btnSolveLink: "link.solve.run",
  btnSolveRadar: "radar.solve.run",
  deepMimoDatasetToggle: "deepmimo.datasets.toggle",
  panelToggle: "workbench.controls.toggle",
  perfModeAuto: "performance.mode.select",
  perfModeFast: "performance.mode.select",
  perfModeQuality: "performance.mode.select",
  radarDetectionMore: "radar.detections.toggleAll",
  radarRdFocus: "radar.rangeDoppler.scope.select",
  radarRdFull: "radar.rangeDoppler.scope.select",
  radarRdIdeal: "radar.processing.select",
  radarRdMean: "radar.processing.select",
  radarRdRaw: "radar.processing.select",
  tabDeepMimo: "workbench.feature.activate",
  tabLink: "workbench.feature.activate",
  tabMobility: "workbench.feature.activate",
  tabRadar: "workbench.feature.activate",
  tabRadiomap: "workbench.feature.activate",
});

const CONTROL_COMMANDS = Object.freeze({
  entryPlaceInput: {command: "entry.search.submit", events: ["keydown:Enter"]},
  linkTapSubcarrierSpacing: {command: "link.configuration.syncDerived", events: ["internal"]},
  mobilityMetric: {command: "mobility.timeline.metric.change", events: ["change"]},
  mobilityPlaybackSpeed: {command: "mobility.playback.speed.change", events: ["change"]},
  mobilityStepSlider: {command: "mobility.timeline.seek", events: ["input"]},
  perfLightMaterials: {command: "performance.materials.toggle", events: ["change"]},
  radarDetectionFilter: {command: "radar.detections.filter", events: ["change"]},
  radarPathDisplayMode: {command: "radar.paths.displayMode.change", events: ["change"]},
});

const DYNAMIC_INTERACTIONS = Object.freeze([
  {command: "dialog.dismiss", events: ["click:backdrop", "keydown:Escape"], owner: OWNERS.overlay, selector: "#appDialog"},
  {command: "deepmimo.dataset.cancel", events: ["click"], owner: OWNERS.deepmimo, selector: "#deepMimoDatasetList [data-command='cancel']"},
  {command: "deepmimo.dataset.download", events: ["click"], owner: OWNERS.deepmimo, selector: "#deepMimoDatasetList a[download]"},
  {command: "entry.map.panZoom", events: ["pointer", "wheel", "keyboard"], owner: OWNERS.entryMap, selector: "#entryMapViewport .leaflet-container"},
  {command: "entry.place.select", events: ["click"], owner: OWNERS.entryMap, selector: "#entryPlaceResults button"},
  {command: "entry.tile.inspect", events: ["pointerenter", "pointerleave"], owner: OWNERS.entryMap, selector: "#entryMapScene [data-tile-id]"},
  {command: "entry.tile.select", events: ["click", "keydown"], owner: OWNERS.entryMap, selector: "#entryMapScene [data-tile-id]"},
  {command: "entry.tile.toggle", events: ["change"], owner: OWNERS.entryMap, selector: "#tileList input[type='checkbox']"},
  {command: "link.path.select", events: ["click"], owner: OWNERS.link, selector: "#pathButtons button"},
  {command: "mobility.waypoint.addCurrentRx", events: ["keydown:Enter"], owner: OWNERS.mobility, selector: "window"},
  {command: "mobility.waypoint.deleteSelected", events: ["keydown:Delete"], owner: OWNERS.mobility, selector: "window"},
  {command: "mobility.timeline.inspect", events: ["pointermove", "pointerleave"], owner: OWNERS.mobility, selector: "#mobilitySeriesChart"},
  {command: "mobility.waypoint.remove", events: ["click"], owner: OWNERS.mobility, selector: "#mobilityWaypointList button"},
  {command: "mobility.waypoint.select", events: ["click"], owner: OWNERS.mobility, selector: "#mobilityWaypointList .waypointItem"},
  {command: "performance.category.toggle", events: ["change"], owner: OWNERS.performance, selector: "#categoryVisibility input[type='checkbox']"},
  {command: "parameter.tooltip.inspect", events: ["pointerenter", "pointerleave", "focus", "blur", "keydown:Escape"], owner: OWNERS.overlay, selector: "[data-tooltip]"},
  {command: "radar.chart.inspect", events: ["pointermove", "pointerleave"], owner: OWNERS.radar, selector: "#radarRangeDopplerCanvas"},
  {command: "radar.detection.select", events: ["click"], owner: OWNERS.radar, selector: "#radarDetectionList [data-detection-id]"},
  {command: "radar.path.select", events: ["click"], owner: OWNERS.radar, selector: "#radarPathList [data-path-index]"},
  {command: "radar.rangeDoppler.select", events: ["click"], owner: OWNERS.radar, selector: "#radarRangeDopplerCanvas"},
  {command: "radar.target.select", events: ["click"], owner: OWNERS.radar, selector: "#radarTargetList [data-target-id]"},
  {command: "radar.truth.select", events: ["click"], owner: OWNERS.radar, selector: "#radarTruthList [data-target-id]"},
  {command: "viewer.camera.navigate", events: ["pointer", "wheel", "keyboard"], owner: OWNERS.viewer, selector: "#view"},
  {command: "viewer.device.pick", events: ["pointerdown", "pointerup", "keydown:Escape"], owner: OWNERS.viewer, selector: "#view"},
  {command: "workbench.transient.dismiss", events: ["click:outside", "keydown:Escape"], owner: OWNERS.workbench, selector: "document"},
]);

function ownerForId(id) {
  if (id === "view") return OWNERS.viewer;
  if (/^(loading|bar|appDialog|paramTooltip|btnLoading)/.test(id)) return OWNERS.overlay;
  if (/^(entry|btnEntry|btnEnterScene|btnOpenTileIndex|tile)/.test(id)) return OWNERS.entryMap;
  if (/^(performance|perf|category|btnPerformance|btnShowAllCategories|btnHideHeavyCategories)/.test(id)) return OWNERS.performance;
  if (/^(device|hintText)/.test(id)) return OWNERS.deviceDock;
  if (/^(btnResultDock|resultDock|channelAnalysis|linkChannelSection)/.test(id)) return OWNERS.resultDock;
  if (/^(cfg|txArray|rxArray|livePreview)/.test(id)) return OWNERS.solver;
  if (/^(feature.*Anchor|mode|panelToggle|ui$|uiBody$|sceneQuickBar|btnOpenTileIndex)/.test(id)) return OWNERS.registry;
  if (/^(radar|btnRadar|btnCancelRadar|btnRetryRadar|btnAddRadar|btnPickRadar|btnFocusRadar|btnRemoveRadar|btnSolveRadar|tabRadar)/.test(id)) return OWNERS.radar;
  if (/^(deepMimo|deepmimo|btnDeepMimo|btnRunDeepMimo|tabDeepMimo)/.test(id)) return OWNERS.deepmimo;
  if (/^(mobility|btnMobility|btnRunMobility|btnPickMobility|tabMobility)/.test(id)) return OWNERS.mobility;
  if (/^(rm|radiomap|btnRunRadiomap|btnPickRm|tabRadiomap)/.test(id)) return OWNERS.radiomap;
  if (/^(link|path|btnSolveLink|btnPickLink|tabLink)/.test(id)) return OWNERS.link;
  if (id === "btnOrbitTx") return OWNERS.deviceDock;
  return OWNERS.workbench;
}

function configurationCommand(owner) {
  if (owner.startsWith("feature:")) return `${owner.slice("feature:".length)}.configuration.update`;
  if (owner === OWNERS.solver) return "solver.configuration.update";
  if (owner === OWNERS.deviceDock) return "device.position.update";
  return "workbench.control.update";
}

function interactionFor(element, owner) {
  if (element.tag === "button") {
    const command = BUTTON_COMMANDS[element.id];
    if (!command) throw new Error(`Interaction command is not defined for button #${element.id}`);
    return {command, events: ["click"]};
  }
  if (element.tag === "details") {
    return {command: element.id === "modeSelector" ? "workbench.modeMenu.toggle" : "workbench.group.toggle", events: ["toggle"]};
  }
  if (element.tag === "summary") {
    return {command: "workbench.modeMenu.toggle", events: ["click", "keydown"]};
  }
  if (!["input", "select", "textarea"].includes(element.tag)) return null;
  return CONTROL_COMMANDS[element.id] || {command: configurationCommand(owner), events: ["change"]};
}

export function buildPhase1DomCompatibilityContract(phase0Contract) {
  const normalizedContract = normalizePhase8DomContract(phase0Contract);
  const elements = normalizedContract.elements.map((element) => {
    const owner = ownerForId(element.id);
    const interaction = interactionFor(element, owner);
    return {
      ...element,
      owner,
      compatibility: "required",
      ...(interaction ? {interaction} : {}),
    };
  });
  return {
    schemaVersion: 2,
    generatedBy: "tests/browser/feature_modes.spec.js",
    baseline: "tests/browser/baselines/phase-0-dom-contract.json",
    baselineTransform: {
      retiredClasses: PHASE8_RETIRED_CLASSES,
      retiredElementIds: PHASE8_RETIRED_ELEMENT_IDS,
    },
    policy: {
      compatibilityValues: ["required", "deprecated", "internal"],
      requiredMeaning: "ID, semantic element, control order and behavior remain compatible until a reviewed versioned contract changes them.",
    },
    document: normalizedContract.document,
    owners: [...new Set(Object.values(OWNERS))].sort(),
    elements,
    dynamicInteractions: DYNAMIC_INTERACTIONS,
  };
}
