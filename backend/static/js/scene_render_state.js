import {createSceneLoaderController} from "/js/controllers/scene_loader_controller.js?v=20260519-mode-isolation";
import {createLoadingOverlayController} from "/js/ui/loading_overlay_controller.js?v=20260519-mode-isolation";
import {createTileSelectionView} from "/js/ui/tile_selection_view.js?v=20260519-mode-isolation";

export function createSceneRenderStateController(context) {
  const {api, features, picking, state, ui, viewerRef} = context;
  const getViewer = () => viewerRef.current;
  const entry = () => context.controllers.entry;
  const performancePanel = () => context.controllers.performance;
  const solver = () => context.controllers.solver;

  function syncEntryOverviewUi() {
    entry().syncEntryOverviewUi();
  }

  function syncPerformanceUi() {
    performancePanel().syncPerformanceUi();
  }

  function syncResultDockUi() {
    const expanded = Boolean(state.resultDock.expanded);
    ui.linkChannelSection.classList.toggle("collapsed", !expanded);
    ui.btnResultDockToggle.setAttribute("aria-expanded", String(expanded));
    ui.btnResultDockToggle.setAttribute(
      "aria-label",
      expanded ? "Collapse results panel" : "Expand results panel",
    );
    ui.channelAnalysisScroll.setAttribute("aria-hidden", String(!expanded));
    ui.channelAnalysisScroll.inert = !expanded;
  }

  function applyPerformanceSettingsToViewer() {
    performancePanel().applyPerformanceSettingsToViewer();
  }

  function syncNumericInputs() {
    solver().syncNumericInputs();
  }

  function syncViewerMarkers() {
    solver().syncViewerMarkers();
  }

  function syncModeVisuals() {
    solver().syncModeVisuals();
  }

  function hideEntryScreen() {
    entry().hideEntryScreen();
  }

  function focusEntryMapTiles(tileIds, paddingScale) {
    return entry().focusEntryMapTiles(tileIds, paddingScale);
  }

  async function ensureViewer() {
    if (getViewer().__ready) {
      return getViewer();
    }
    if (!viewerRef.modulePromise) {
      viewerRef.modulePromise = import("/js/viewer.js?v=20260519-mode-isolation");
    }
    const {Viewer} = await viewerRef.modulePromise;
    const realViewer = new Viewer(document.getElementById("view"));
    realViewer.__ready = true;
    viewerRef.current = realViewer;
    applyPerformanceSettingsToViewer();
    syncViewerMarkers();
    syncTileListUi();
    syncPerformanceUi();
    return realViewer;
  }

const loadingOverlay = createLoadingOverlayController({
  state,
  ui,
  onShow: () => {
    syncModeUi();
    syncPerformanceUi();
  },
  onHide: () => {
    syncModeUi();
    syncControlSidebarUi();
    syncPerformanceUi();
  },
});

function setProgress(percent, message, indeterminate = false) {
  return loadingOverlay.setProgress(percent, message, indeterminate);
}

function showOverlay(options = {}) {
  return loadingOverlay.showOverlay(options);
}

function hideOverlay(owner = null, force = false) {
  return loadingOverlay.hideOverlay(owner, force);
}

const tileSelectionView = createTileSelectionView({
  state,
  ui,
  getViewer,
  syncEntryOverviewUi,
});

const sceneLoader = createSceneLoaderController(context, {
  ensureViewer,
  getViewer,
  hideEntryScreen,
  hideOverlay,
  renderAll,
  setProgress,
  showOverlay,
  solver,
  syncControlSidebarUi,
  syncPerformanceUi,
  syncTileListUi,
  syncViewerMarkers,
  tileSelectionView,
});

function tileSelections() {
  return tileSelectionView.tileSelections();
}

function tileDiff() {
  return tileSelectionView.tileDiff();
}

function syncTileListUi() {
  tileSelectionView.syncTileListUi();
}

function populateTileList(manifest) {
  tileSelectionView.populateTileList(manifest);
}

function setTileSelection(nextTileIds) {
  tileSelectionView.setTileSelection(nextTileIds);
}

function resetSelectionToLoadedTiles() {
  tileSelectionView.resetSelectionToLoadedTiles();
}

function setTileChecked(tileId, checked) {
  tileSelectionView.setTileChecked(tileId, checked);
}

function toggleTileChecked(tileId) {
  tileSelectionView.toggleTileChecked(tileId);
}
function syncControlSidebarUi() {
  const collapsed = state.panelCollapsed;
  const visible = ui.panel.style.display === "flex" && !state.entry.visible;
  ui.panel.classList.toggle("panelCollapsed", collapsed);
  ui.panelToggle.classList.toggle("panelCollapsed", collapsed);
  ui.panelToggle.classList.toggle("hidden", !visible);
  ui.panelToggle.setAttribute("aria-label", collapsed ? "Open control sidebar" : "Collapse control sidebar");
  ui.panelToggle.setAttribute("aria-expanded", String(!collapsed));
  ui.panel.inert = !visible || collapsed;
  ui.panel.setAttribute("aria-hidden", String(!visible || collapsed));
}
function syncModeUi() {
  const definitions = features.definitions();
  const featureUiRef = (definition, ref) => features.uiRef(definition.id, ref, ui);
  const activeFeature = features.get(state.mode) || definitions[0];
  const activeUi = activeFeature.ui || {};
  const activeTargetIds = new Set(picking.targetsFor(activeFeature.id).map((target) => target.id));
  const sceneControlsVisible = getViewer().__ready
    && !state.entry.visible
    && ui.panel.style.display === "flex"
    && ui.loadingScreen.style.display === "none";
  if (!sceneControlsVisible) {
    state.pickTarget = null;
    state.deviceControl.activeTarget = null;
  }
  const activeTarget = state.deviceControl.activeTarget;
  const activeTargetAllowed = activeTargetIds.has(activeTarget);
  if (activeTarget && !activeTargetAllowed) {
    state.deviceControl.activeTarget = null;
    state.pickTarget = null;
  }
  const nextActiveTarget = state.deviceControl.activeTarget;
  const activeTargetMeta = picking.get(nextActiveTarget);
  const hasPrecisionTarget = Boolean(activeTargetMeta?.precision);

  for (const definition of definitions) {
    const active = definition.id === activeFeature.id;
    const button = featureUiRef(definition, definition.ui.tabRef);
    button.classList.toggle("active", active);
    button.setAttribute("aria-selected", String(active));
    featureUiRef(definition, definition.ui.panelRef).classList.toggle("hidden", !active);
  }
  ui.modeSelectTitle.textContent = `Mode (${activeFeature.title})`;

  const parameterGroupRefs = new Set();
  for (const definition of definitions) {
    for (const ref of definition.ui.parameterGroups || []) {
      parameterGroupRefs.add(ref);
    }
    for (const filtered of definition.ui.filteredParameterGroups || []) {
      parameterGroupRefs.add(filtered.ref);
    }
  }
  for (const ref of parameterGroupRefs) {
    for (const node of featureUiRef(activeFeature, ref) || []) {
      node.classList.add("hidden");
    }
  }
  for (const ref of activeUi.parameterGroups || []) {
    for (const node of featureUiRef(activeFeature, ref) || []) {
      node.classList.remove("hidden");
    }
  }
  for (const filtered of activeUi.filteredParameterGroups || []) {
    for (const node of featureUiRef(activeFeature, filtered.ref) || []) {
      if (node.classList.contains(filtered.className)) {
        node.classList.remove("hidden");
      }
    }
  }

  ui.deviceDock.classList.toggle("hidden", !sceneControlsVisible);
  ui.deviceDock.setAttribute("aria-hidden", String(!sceneControlsVisible));
  ui.devicePrecisionPanel.classList.toggle("hidden", !sceneControlsVisible || !hasPrecisionTarget);
  ui.devicePrecisionPanel.setAttribute("aria-hidden", String(!sceneControlsVisible || !hasPrecisionTarget));

  for (const definition of definitions) {
    const isActive = definition.id === activeFeature.id;
    for (const target of picking.targetsFor(definition.id)) {
      if (target.cardRef) {
        featureUiRef(definition, target.cardRef).classList.toggle("hidden", nextActiveTarget !== target.id);
      }
      if (target.buttonRef) {
        const button = featureUiRef(definition, target.buttonRef);
        button.classList.toggle("hidden", !isActive);
        button.classList.toggle("active", nextActiveTarget === target.id);
        button.classList.toggle("picking", state.pickTarget === target.id);
      }
    }
    for (const ref of definition.ui.extraActionButtonRefs || []) {
      featureUiRef(definition, ref).classList.toggle("hidden", !isActive);
    }
    featureUiRef(definition, definition.ui.runButtonRef).classList.toggle("hidden", !isActive);
  }
  ui.linkSurfaceClearanceField.classList.toggle("hidden", !activeTargetMeta?.clearance);

  for (const definition of definitions.filter((item) => item.ui.disableDuringTileLoad)) {
    const button = featureUiRef(definition, definition.ui.runButtonRef);
    if (state.tileLoadBusy) {
      button.disabled = true;
    } else if (button.getAttribute("aria-busy") !== "true") {
      button.disabled = false;
    }
  }
  const orbitingTx = getViewer().isTxOrbiting();
  ui.btnOrbitTx.classList.toggle("active", orbitingTx);
  ui.btnOrbitTx.setAttribute("aria-pressed", String(orbitingTx));
  ui.btnOrbitTx.setAttribute("aria-label", orbitingTx ? "Stop transmitter orbit" : "Orbit around transmitter");
  ui.btnOrbitTx.querySelector(".deviceActionText").textContent = orbitingTx ? "Stop" : "Orbit";
  ui.devicePrecisionTitle.textContent = activeTargetMeta?.precisionTitle || "Tx";
}
function renderAll() {
  syncModeUi();
  syncControlSidebarUi();
  syncViewerMarkers();
  syncModeVisuals();
  syncNumericInputs();
  syncTileListUi();
  syncEntryOverviewUi();
  syncPerformanceUi();
  syncResultDockUi();
  features.render(context);
}

async function waitForRtSceneSelection(generation, tileIds) {
  return sceneLoader.waitForRtSceneSelection(generation, tileIds);
}

async function syncRtSceneSelection(selectedTileIds) {
  return sceneLoader.syncRtSceneSelection(selectedTileIds);
}

async function enterScene() {
  if (state.tileLoadBusy) {
    return;
  }
  const selectedTileIds = tileSelections();
  if (!selectedTileIds.length) {
    return;
  }
  return sceneLoader.enterScene();
}

async function loadScene() {
  return sceneLoader.loadScene();
}

  return {
    setProgress,
    showOverlay,
    hideOverlay,
    ensureViewer,
    syncControlSidebarUi,
    syncResultDockUi,
    syncModeUi,
    renderAll,
    tileSelections,
    tileDiff,
    syncTileListUi,
    populateTileList,
    setTileSelection,
    resetSelectionToLoadedTiles,
    setTileChecked,
    toggleTileChecked,
    enterScene,
    loadScene,
  };
}
