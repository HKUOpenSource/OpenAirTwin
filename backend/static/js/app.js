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
import {inputs, ui} from "/js/dom_refs.js?v=20260519-mode-isolation";
import {FEATURE_CATALOG} from "/js/features/feature_catalog.js?v=20260723-radar-shared-groups";
import {createAppDialogController} from "/js/controllers/app_dialog_controller.js?v=20260604-app-dialog";
import {createDevicePickingController} from "/js/controllers/device_picking_controller.js?v=20260519-mode-isolation";
import {createEntryMapController} from "/js/entry_map.js";
import {createParamTooltipController} from "/js/param_tooltips.js";
import {createPerformancePanelController} from "/js/performance_panel.js";
import {createSceneRenderStateController} from "/js/scene_render_state.js?v=20260723-empty-devices";
import {createSolverControlsController} from "/js/solver_controls.js?v=20260723-empty-devices";

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

const dialogController = createAppDialogController(context);
context.controllers.dialogs = dialogController;

const performancePanel = createPerformancePanelController(context);
const entryMapController = createEntryMapController(context);
const solverControls = createSolverControlsController(context);
const sceneRenderState = createSceneRenderStateController(context);
const paramTooltips = createParamTooltipController(context);
const devicePicking = createDevicePickingController(context);

context.controllers.performance = performancePanel;
context.controllers.entry = entryMapController;
context.controllers.solver = solverControls;
context.controllers.scene = sceneRenderState;
context.controllers.tooltips = paramTooltips;
context.controllers.devicePicking = devicePicking;

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

async function runSolveFromDock(button, run) {
  devicePicking.clearActiveDevice({render: false});
  solverControls.cancelLivePreview();
  sceneRenderState.renderAll();
  button.disabled = true;
  button.classList.add("busy");
  button.setAttribute("aria-busy", "true");
  try {
    await run();
  } finally {
    button.disabled = false;
    button.classList.remove("busy");
    button.removeAttribute("aria-busy");
    sceneRenderState.renderAll();
  }
}

Object.assign(context.utilities, {
  closeModeMenu,
  runSolveFromDock,
  showErrorDialog,
});

function attachEvents() {
  paramTooltips.attach();

  const handleEnterScene = () => {
    devicePicking.clearActiveDevice({render: false, status: false});
    return sceneRenderState.enterScene().catch((error) => {
      sceneRenderState.hideOverlay(null, true);
      state.tileLoadBusy = false;
      sceneRenderState.syncTileListUi();
      return showErrorDialog("Enter Scene Failed", error);
    });
  };
  const handleReturnToScene = () => {
    devicePicking.clearActiveDevice({render: false});
    sceneRenderState.resetSelectionToLoadedTiles();
    entryMapController.hideEntryScreen();
    sceneRenderState.renderAll();
  };

  ui.panelToggle.addEventListener("click", () => {
    paramTooltips.hideTooltip();
    state.panelCollapsed = !state.panelCollapsed;
    sceneRenderState.syncControlSidebarUi();
  });
  ui.entryMapFigure.addEventListener("mouseleave", () => {
    entryMapController.hideEntryMapTooltip();
  });

  ui.btnEntrySidebarToggle.addEventListener("click", () => {
    state.entry.sidebarCollapsed = !state.entry.sidebarCollapsed;
    entryMapController.syncEntrySidebarUi();
    if (!state.entry.sidebarCollapsed) {
      window.setTimeout(() => ui.entryPlaceInput.focus(), 120);
    }
  });
  ui.btnEntryReturnScene.addEventListener("click", handleReturnToScene);
  ui.btnEntrySearch.addEventListener("click", () => {
    entryMapController.runEntryPlaceSearch();
  });
  ui.entryPlaceInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      entryMapController.runEntryPlaceSearch();
    }
  });
  ui.btnEntryFitMap.addEventListener("click", () => {
    entryMapController.fitEntryMapToView();
  });
  ui.btnEntryFocusSelection.addEventListener("click", () => {
    const selected = sceneRenderState.tileSelections();
    if (!selected.length) {
      return;
    }
    entryMapController.focusEntryMapTiles(selected, selected.length > 1 ? 0.98 : 1.08);
  });
  ui.btnEntryZoomIn.addEventListener("click", () => {
    entryMap.map?.zoomIn(0.5);
  });
  ui.btnEntryZoomOut.addEventListener("click", () => {
    entryMap.map?.zoomOut(0.5);
  });
  ui.btnEnterScene.addEventListener("click", handleEnterScene);
  ui.btnOpenTileIndex.addEventListener("click", () => {
    devicePicking.clearActiveDevice({render: false});
    solverControls.cancelLivePreview();
    entryMapController.showEntryScreen();
  });

  for (const button of ui.perfModeButtons) {
    button.addEventListener("click", () => {
      const mode = button.dataset.performanceMode;
      if (!PERFORMANCE_MODES.has(mode)) {
        return;
      }
      state.performance.mode = mode;
      currentViewer().setPerformanceMode(mode);
      performancePanel.syncPerformanceUi();
    });
  }
  ui.perfLightMaterials.addEventListener("change", () => {
    state.performance.lightweightMaterials = ui.perfLightMaterials.checked;
    currentViewer().setLightweightMaterials(state.performance.lightweightMaterials);
    performancePanel.syncPerformanceUi();
  });
  ui.btnPerformanceDockToggle.addEventListener("click", () => {
    state.performance.dockExpanded = !state.performance.dockExpanded;
    performancePanel.syncPerformanceUi();
  });
  ui.btnResultDockToggle.addEventListener("click", () => {
    state.resultDock.expanded = !state.resultDock.expanded;
    sceneRenderState.syncResultDockUi();
  });
  ui.btnShowAllCategories.addEventListener("click", () => {
    performancePanel.showAllCategories();
  });
  ui.btnHideHeavyCategories.addEventListener("click", () => {
    performancePanel.hideHeavyCategories();
  });
  window.setInterval(() => {
    if (currentViewer().__ready && !state.entry.visible) {
      performancePanel.syncPerformanceUi();
    }
  }, 500);

  ui.modeSelector.addEventListener("toggle", () => {
    ui.modeSelectButton.setAttribute("aria-expanded", String(ui.modeSelector.open));
  });
  ui.modeMenu.addEventListener("click", (event) => {
    event.stopPropagation();
  });
  document.addEventListener("click", (event) => {
    if (event.target instanceof Element && event.target.closest(".modeSelector")) {
      return;
    }
    closeModeMenu();
    closeFeatureTransientUi();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeModeMenu();
      closeFeatureTransientUi();
    }
  });

  for (const definition of featureRegistry.definitions()) {
    featureRegistry.uiRef(definition.id, definition.ui.tabRef, ui).addEventListener("click", () => {
      closeModeMenu();
      paramTooltips.hideTooltip();
      solverControls.cancelLivePreview();
      devicePicking.stopTxOrbit();
      devicePicking.clearActiveDevice({render: false});
      featureRegistry.activate(definition.id, context);
      sceneRenderState.renderAll();
    });
  }

  ui.btnOrbitTx.addEventListener("click", () => devicePicking.toggleTxOrbit());

  for (const input of [
    inputs.cfgFrequency,
    inputs.cfgMaxDepth,
    inputs.cfgLos,
    inputs.cfgSpecular,
    inputs.cfgDiffuse,
    inputs.cfgRefraction,
    inputs.cfgSeed,
  ]) {
    input.addEventListener("change", () => {
      settings.publish("common-solver");
      sceneRenderState.renderAll();
    });
  }

  for (const input of [
    inputs.txArrayPattern,
    inputs.txArrayPolarization,
    inputs.txArrayRows,
    inputs.txArrayCols,
    inputs.txArrayVerticalSpacing,
    inputs.txArrayHorizontalSpacing,
    inputs.rxArrayPattern,
    inputs.rxArrayPolarization,
    inputs.rxArrayRows,
    inputs.rxArrayCols,
    inputs.rxArrayVerticalSpacing,
    inputs.rxArrayHorizontalSpacing,
  ]) {
    input.addEventListener("change", () => {
      solverControls.readAntennaArrayInputs();
      settings.publish("antenna");
      sceneRenderState.renderAll();
    });
  }

  featureRegistry.attachEvents(context);

  devicePicking.attachPointerEvents(document.getElementById("view"));

  window.addEventListener("keydown", (event) => {
    devicePicking.handleDevicePrecisionEscape(event);
  });

  window.addEventListener("resize", () => {
    if (!state.entry.visible) {
      return;
    }
    const selected = sceneRenderState.tileSelections();
    if (selected.length) {
      entryMapController.focusEntryMapTiles(selected, selected.length > 1 ? 0.98 : 1.08);
      return;
    }
    entryMapController.fitEntryMapToView();
  });
}

async function bootstrap() {
  featureRegistry.mountTemplates(document);
  featureRegistry.initialize(context);
  featureRegistry.activate(state.mode, context);
  sceneRenderState.showOverlay({title: "Loading Scene", message: "Loading scene manifest...", percent: 10, force: true});
  attachEvents();
  sceneRenderState.showOverlay({title: "Loading Scene", message: "Loading RT capabilities...", percent: 14, force: true});
  state.rtCapabilities = await getRtCapabilities();
  solverControls.applyRtCapabilities(state.rtCapabilities);
  sceneRenderState.showOverlay({title: "Loading Scene", message: "Loading scene manifest...", percent: 18, force: true});
  state.manifest = await getManifest();
  sceneRenderState.showOverlay({title: "Loading Scene", message: "Loading Open3DHK coverage...", percent: 22, force: true});
  state.entry.coverage = await getOpen3dHkTileCoverage();
  sceneRenderState.populateTileList(state.manifest);
  performancePanel.populatePerformanceControls(state.manifest);
  state.entry.overview = entryMapController.buildEntryOverview(state.manifest, state.entry.coverage);
  entryMapController.renderEntryOverview();
  sceneRenderState.setTileSelection([]);
  sceneRenderState.hideOverlay(null, true);

  sceneRenderState.renderAll();
  if (state.entry.overview) {
    entryMapController.showEntryScreen();
  } else {
    ui.panel.style.display = "flex";
    sceneRenderState.syncControlSidebarUi();
  }
}

bootstrap().catch((error) => {
  sceneRenderState.hideOverlay(null, true);
  return showErrorDialog("Startup Failed", error);
});
