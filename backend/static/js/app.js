import {
  createTileDownloadJob,
  cancelTileDownloadJob,
  getManifest,
  getOpen3dHkTileCoverage,
  getRtCapabilities,
  getRtSceneSelection,
  getTileDownloadJob,
  setRtSceneSelection,
} from "/js/api.js";
import {entryMap, featureStore, PERFORMANCE_MODES, state, viewerRef} from "/js/app_state.js?v=20260723-radar-shared-groups";
import {FeatureRegistry, PickingRegistry, SettingsBus} from "/js/core/feature_registry.js";
import {bindAppShellRefs, bindControlSurfaceRefs, inputs, ui} from "/js/dom_refs.js?v=20260519-mode-isolation";
import {FEATURE_CATALOG} from "/js/features/feature_catalog.js?v=20260723-radar-shared-groups";
import {createAppDialogController} from "/js/controllers/app_dialog_controller.js?v=20260604-app-dialog";
import {createDevicePickingController} from "/js/controllers/device_picking_controller.js?v=20260519-mode-isolation";
import {createEntryMapController} from "/js/entry_map.js";
import {createParamTooltipController} from "/js/param_tooltips.js";
import {createPerformancePanelController} from "/js/performance_panel.js";
import {createSceneRenderStateController} from "/js/scene_render_state.js?v=20260723-empty-devices";
import {createSolverControlsController} from "/js/solver_controls.js?v=20260723-empty-devices";
import {mountAppShell} from "/@oat/app-shell/app-shell-runtime.tsx";

const settings = new SettingsBus();
const pickingRegistry = new PickingRegistry();
const featureRegistry = new FeatureRegistry({
  definitions: FEATURE_CATALOG,
  store: featureStore,
  settings,
  picking: pickingRegistry,
});

const context = {
  state,
  entryMap,
  ui,
  inputs,
  viewerRef,
  features: featureRegistry,
  settings,
  picking: pickingRegistry,
  featureServices: {},
  api: {
    createTileDownloadJob,
    cancelTileDownloadJob,
    getManifest,
    getOpen3dHkTileCoverage,
    getRtCapabilities,
    getRtSceneSelection,
    getTileDownloadJob,
    setRtSceneSelection,
  },
  controllers: {},
  utilities: {},
};
let appShellRuntime = null;
let resultDockModel = null;
let controlSurfaceModel = null;
let dialogController = null;
let performancePanel = null;
let entryMapController = null;
let solverControls = null;
let sceneRenderState = null;
let paramTooltips = null;
let devicePicking = null;

function initializeControllers() {
  dialogController = createAppDialogController(context);
  performancePanel = createPerformancePanelController(context);
  entryMapController = createEntryMapController(context);
  solverControls = createSolverControlsController(context);
  sceneRenderState = createSceneRenderStateController(context);
  paramTooltips = createParamTooltipController(context);
  devicePicking = createDevicePickingController(context);
  Object.assign(context.controllers, {
    dialogs: dialogController,
    performance: performancePanel,
    entry: entryMapController,
    solver: solverControls,
    scene: sceneRenderState,
    tooltips: paramTooltips,
    devicePicking,
  });
}

function errorMessage(error) {
  return error?.message || String(error || "Unknown error");
}

function showErrorDialog(title, error) {
  return dialogController.alert({
    title,
    message: errorMessage(error),
    variant: "error",
  });
}

function currentViewer() {
  return viewerRef.current;
}

function setModeMenuOpen(open) {
  ui.modeSelector.open = open;
  ui.modeSelectButton.setAttribute("aria-expanded", String(open));
}

function closeModeMenu() {
  setModeMenuOpen(false);
}

function closeFeatureTransientUi() {
  for (const definition of featureRegistry.definitions()) {
    featureRegistry.instance(definition.id)?.closeTransientUi?.();
  }
}

const activeSolveActions = new Set();

async function runSolveFromDock(actionId, run) {
  if (activeSolveActions.has(actionId)) return;
  activeSolveActions.add(actionId);
  devicePicking.clearActiveDevice({render: false});
  solverControls.cancelLivePreview();
  sceneRenderState.renderAll();
  controlSurfaceModel.setActionBusy(actionId, true);
  try {
    await run();
  } finally {
    activeSolveActions.delete(actionId);
    controlSurfaceModel.setActionBusy(actionId, false);
    sceneRenderState.renderAll();
  }
}

Object.assign(context.utilities, {
  closeModeMenu,
  runSolveFromDock,
  showErrorDialog,
});

function handleEnterScene() {
  devicePicking.clearActiveDevice({render: false, status: false});
  return sceneRenderState.enterScene().catch((error) => {
    sceneRenderState.hideOverlay(null, true);
    state.tileLoadBusy = false;
    sceneRenderState.syncTileListUi();
    return showErrorDialog("Enter Scene Failed", error);
  });
}

function handleReturnToScene() {
  devicePicking.clearActiveDevice({render: false});
  sceneRenderState.resetSelectionToLoadedTiles();
  entryMapController.hideEntryScreen();
  sceneRenderState.renderAll();
}

async function handleAppShellCommand(command) {
  const payload = command.payload || {};
  if (command.name === "workbench.controls.toggle") {
    paramTooltips.hideTooltip();
    state.panelCollapsed = !state.panelCollapsed;
    sceneRenderState.syncControlSidebarUi();
    return;
  }
  if (command.name === "entry.sidebar.toggle") {
    state.entry.sidebarCollapsed = !state.entry.sidebarCollapsed;
    entryMapController.syncEntrySidebarUi();
    if (!state.entry.sidebarCollapsed) {
      window.setTimeout(() => ui.entryPlaceInput.focus(), 120);
    }
    return;
  }
  if (command.name === "entry.scene.return") return handleReturnToScene();
  if (command.name === "entry.search.submit") return entryMapController.runEntryPlaceSearch();
  if (command.name === "entry.place.select") return entryMapController.focusEntryPlaceResult(payload.index);
  if (command.name === "entry.map.fit") return entryMapController.fitEntryMapToView();
  if (command.name === "entry.map.focusSelection") {
    const selected = sceneRenderState.tileSelections();
    if (selected.length) {
      entryMapController.focusEntryMapTiles(selected, selected.length > 1 ? 0.98 : 1.08);
    }
    return;
  }
  if (command.name === "entry.map.zoomIn") return entryMap.map?.zoomIn(0.5);
  if (command.name === "entry.map.zoomOut") return entryMap.map?.zoomOut(0.5);
  if (command.name === "entry.map.pointerLeave") return entryMapController.hideEntryMapTooltip();
  if (command.name === "entry.scene.enter") return handleEnterScene();
  if (command.name === "entry.scene.open") {
    devicePicking.clearActiveDevice({render: false});
    solverControls.cancelLivePreview();
    entryMapController.showEntryScreen();
    return;
  }
  if (command.name === "entry.tile.toggle") {
    return sceneRenderState.setTileChecked(payload.tileId, Boolean(payload.checked));
  }
  if (command.name === "performance.mode.select") {
    if (!PERFORMANCE_MODES.has(payload.mode)) return;
    state.performance.mode = payload.mode;
    currentViewer().setPerformanceMode(payload.mode);
    performancePanel.syncPerformanceUi();
    return;
  }
  if (command.name === "performance.lightMaterials.toggle") {
    state.performance.lightweightMaterials = Boolean(payload.checked);
    currentViewer().setLightweightMaterials(state.performance.lightweightMaterials);
    performancePanel.syncPerformanceUi();
    return;
  }
  if (command.name === "performance.dock.toggle") {
    state.performance.dockExpanded = !state.performance.dockExpanded;
    performancePanel.syncPerformanceUi();
    return;
  }
  if (command.name === "results.dock.toggle") {
    state.resultDock.expanded = !state.resultDock.expanded;
    sceneRenderState.syncResultDockUi();
    return;
  }
  if (command.name === "performance.categories.showAll") return performancePanel.showAllCategories();
  if (command.name === "performance.categories.hideHeavy") return performancePanel.hideHeavyCategories();
  if (command.name === "performance.category.toggle") {
    return performancePanel.setCategoryVisibility(payload.category, payload.checked);
  }
  if (command.name === "performance.tick") {
    if (currentViewer().__ready && !state.entry.visible) performancePanel.syncPerformanceUi();
    return;
  }
  if (command.name === "workbench.mode.toggle") {
    ui.modeSelectButton.setAttribute("aria-expanded", String(Boolean(payload.open)));
    return;
  }
  if (command.name === "workbench.mode.select") {
    const definition = featureRegistry.get(payload.mode);
    if (!definition) return;
    closeModeMenu();
    paramTooltips.hideTooltip();
    solverControls.cancelLivePreview();
    devicePicking.stopTxOrbit();
    devicePicking.clearActiveDevice({render: false});
    featureRegistry.activate(definition.id, context);
    sceneRenderState.renderAll();
    return;
  }
  if (command.name === "workbench.transient.dismiss") {
    closeModeMenu();
    closeFeatureTransientUi();
    return;
  }
  if (command.name === "viewer.precision.escape") {
    devicePicking.handleDevicePrecisionEscape({key: "Escape", preventDefault() {}});
    return;
  }
  if (command.name === "workbench.resize") {
    paramTooltips.hideTooltip();
    if (!state.entry.visible) return;
    const selected = sceneRenderState.tileSelections();
    if (selected.length) {
      entryMapController.focusEntryMapTiles(selected, selected.length > 1 ? 0.98 : 1.08);
    } else {
      entryMapController.fitEntryMapToView();
    }
    return;
  }
  if (command.name === "dialog.primary") return dialogController.confirmActiveDialog();
  if (command.name === "dialog.secondary") return dialogController.finishDialog(false);
  if (command.name === "dialog.close") return dialogController.cancelActiveDialog();
  if (command.name === "loading.cancel") return sceneRenderState.cancelOverlay();
}

function attachRuntimeEvents() {
  paramTooltips.attach();

  featureRegistry.attachEvents(context);

  const commonSolverIds = new Set([
    "cfgFrequency", "cfgMaxDepth", "cfgLos", "cfgSpecular",
    "cfgDiffuse", "cfgRefraction", "cfgSeed",
  ]);
  const antennaIds = new Set([
    "txArrayPattern", "txArrayPolarization", "txArrayRows", "txArrayCols",
    "txArrayVerticalSpacing", "txArrayHorizontalSpacing", "rxArrayPattern",
    "rxArrayPolarization", "rxArrayRows", "rxArrayCols",
    "rxArrayVerticalSpacing", "rxArrayHorizontalSpacing",
  ]);
  controlSurfaceModel.setCommandHandler(async (command) => {
    if (command.name === "workbench.control.commit") {
      const {controlId} = command.payload;
      if (commonSolverIds.has(controlId)) {
        settings.publish("common-solver");
        sceneRenderState.renderAll();
        return;
      }
      if (antennaIds.has(controlId)) {
        solverControls.readAntennaArrayInputs();
        settings.publish("antenna");
        sceneRenderState.renderAll();
        return;
      }
      for (const definition of featureRegistry.definitions()) {
        if (await featureRegistry.instance(definition.id)?.handleControlCommit?.(controlId)) return;
      }
      return;
    }
    if (command.name === "workbench.control.action") {
      const {actionId, value} = command.payload;
      if (actionId === "btnOrbitTx") {
        devicePicking.toggleTxOrbit();
        return;
      }
      for (const definition of featureRegistry.definitions()) {
        if (await featureRegistry.instance(definition.id)?.handleControlAction?.(actionId, value)) return;
      }
      return;
    }
    if (command.name === "workbench.control.group.toggle") {
      const {controlId, open} = command.payload;
      for (const definition of featureRegistry.definitions()) {
        if (await featureRegistry.instance(definition.id)?.handleControlGroupToggle?.(controlId, open)) return;
      }
    }
  });

  devicePicking.attachPointerEvents(appShellRuntime.element("view"));
}

async function bootstrap() {
  appShellRuntime = mountAppShell({
    activeMode: state.mode,
    container: document.body,
    reportError: ({error}) => {
      console.error("[app-shell]", error);
    },
  });
  bindAppShellRefs(appShellRuntime);
  controlSurfaceModel = appShellRuntime.controls;
  resultDockModel = appShellRuntime.results;
  bindControlSurfaceRefs(controlSurfaceModel);
  context.featureServices.controls = controlSurfaceModel;
  context.featureServices.resultDock = resultDockModel;
  context.featureServices.shellUi = appShellRuntime.shell;
  context.featureServices.deepMimoDatasets = {
    update: appShellRuntime.datasets.update,
    setToggleHandler: appShellRuntime.setDatasetToggleHandler,
  };
  initializeControllers();
  appShellRuntime.setCommandHandler(handleAppShellCommand);
  appShellRuntime.setDatasetToggleHandler(null);
  controlSurfaceModel.setCommandHandler(null);
  featureRegistry.initialize(context);
  featureRegistry.activate(state.mode, context);
  sceneRenderState.showOverlay({title: "Loading Scene", message: "Loading scene manifest...", percent: 10, force: true});
  attachRuntimeEvents();
  sceneRenderState.showOverlay({title: "Loading Scene", message: "Loading RT capabilities...", percent: 14, force: true});
  const [rtCapabilities, manifest, coverage] = await Promise.all([
    getRtCapabilities(),
    getManifest(),
    getOpen3dHkTileCoverage(),
  ]);
  state.rtCapabilities = rtCapabilities;
  solverControls.applyRtCapabilities(state.rtCapabilities);
  sceneRenderState.showOverlay({title: "Loading Scene", message: "Loading scene manifest...", percent: 18, force: true});
  state.manifest = manifest;
  sceneRenderState.showOverlay({title: "Loading Scene", message: "Loading Open3DHK coverage...", percent: 22, force: true});
  state.entry.coverage = coverage;
  sceneRenderState.populateTileList(state.manifest);
  performancePanel.populatePerformanceControls(state.manifest);
  state.entry.overview = entryMapController.buildEntryOverview(state.manifest, state.entry.coverage);
  entryMapController.renderEntryOverview();
  sceneRenderState.setTileSelection([]);
  sceneRenderState.hideOverlay(null, true);

  sceneRenderState.renderAll();
  if (state.entry.overview) {
    entryMapController.showEntryScreen({syncOverview: false});
  } else {
    ui.panel.style.display = "flex";
    sceneRenderState.syncControlSidebarUi();
  }
  window.__OPENAIRTWIN_UI_READY_MS__ = window.performance.now();
  window.dispatchEvent(new CustomEvent("openairtwin:ui-ready"));
}

window.addEventListener("pagehide", () => {
  featureRegistry.dispose(context);
  devicePicking?.dispose?.();
  paramTooltips?.dispose?.();
  sceneRenderState?.dispose?.();
  entryMapController?.dispose?.();
  performancePanel?.dispose?.();
  dialogController?.dispose?.();
  appShellRuntime?.dispose();
  appShellRuntime = null;
  resultDockModel = null;
  controlSurfaceModel = null;
}, {once: true});

bootstrap().catch((error) => {
  try {
    sceneRenderState?.hideOverlay(null, true);
  } catch (cleanupError) {
    console.error("Failed to restore the UI after startup error", cleanupError);
    if (ui.loadingScreen) ui.loadingScreen.style.display = "none";
  }
  if (dialogController) return showErrorDialog("Startup Failed", error);
  console.error("Startup Failed", error);
});
