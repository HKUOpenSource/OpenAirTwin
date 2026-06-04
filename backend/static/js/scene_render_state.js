import {createSceneLoaderController} from "/js/controllers/scene_loader_controller.js?v=20260519-mode-isolation";
import {createLoadingOverlayController} from "/js/ui/loading_overlay_controller.js?v=20260519-mode-isolation";
import {createTileSelectionView} from "/js/ui/tile_selection_view.js?v=20260519-mode-isolation";

const MODE_META = {
  link: {title: "Link Analysis"},
  mobility: {title: "Mobility Analysis"},
  radiomap: {title: "Radio Map"},
  deepmimo: {title: "DeepMIMO"},
};

export function createSceneRenderStateController(context) {
  const {api, state, ui, viewerRef} = context;
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

  function renderLinkResult() {
    solver().renderLinkResult();
  }

  function renderRadiomapResult() {
    solver().renderRadiomapResult();
  }

  function renderDeepMimoState() {
    solver().renderDeepMimoState();
  }

  function renderMobilityResult() {
    solver().renderMobilityResult();
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
  const isLink = state.mode === "link";
  const isMobility = state.mode === "mobility";
  const isDeepMimo = state.mode === "deepmimo";
  const isLinkLike = isLink || isMobility;
  const sceneControlsVisible = getViewer().__ready
    && !state.entry.visible
    && ui.panel.style.display === "flex"
    && ui.loadingScreen.style.display === "none";
  if (!sceneControlsVisible) {
    state.pickTarget = null;
    state.deviceControl.activeTarget = null;
  }
  const activeTarget = state.deviceControl.activeTarget;
  const activeTargetAllowed = isLink
    ? activeTarget === "link-tx" || activeTarget === "link-rx"
    : isMobility
      ? activeTarget === "mobility-tx" || activeTarget === "mobility-rx"
    : isDeepMimo
      ? activeTarget === "deepmimo-tx" || activeTarget === "deepmimo-roi"
      : activeTarget === "rm-tx";
  if (activeTarget && !activeTargetAllowed) {
    state.deviceControl.activeTarget = null;
    state.pickTarget = null;
  }
  const nextActiveTarget = state.deviceControl.activeTarget;
  const hasPrecisionTarget = nextActiveTarget === "link-tx"
    || nextActiveTarget === "link-rx"
    || nextActiveTarget === "mobility-tx"
    || nextActiveTarget === "mobility-rx"
    || nextActiveTarget === "rm-tx"
    || nextActiveTarget === "deepmimo-tx";
  const modeMeta = MODE_META[state.mode] || MODE_META.link;
  const modeButtons = [
    [ui.tabLink, isLink],
    [ui.tabMobility, isMobility],
    [ui.tabRadiomap, state.mode === "radiomap"],
    [ui.tabDeepMimo, isDeepMimo],
  ];
  for (const [button, active] of modeButtons) {
    button.classList.toggle("active", active);
    button.setAttribute("aria-selected", String(active));
  }
  ui.modeSelectTitle.textContent = `Mode (${modeMeta.title})`;
  ui.linkPanel.classList.toggle("hidden", !isLink);
  ui.mobilityPanel.classList.toggle("hidden", !isMobility);
  ui.radiomapPanel.classList.toggle("hidden", state.mode !== "radiomap");
  ui.deepmimoPanel.classList.toggle("hidden", !isDeepMimo);
  for (const node of ui.linkOnlyParams) {
    const isDeepMimoAntennaParam = node.classList.contains("deepmimoAntennaParam");
    node.classList.toggle("hidden", !(isLinkLike || (isDeepMimo && isDeepMimoAntennaParam)));
  }
  for (const node of ui.mobilityOnlyParams) {
    node.classList.toggle("hidden", !isMobility);
  }
  for (const node of ui.radiomapOnlyParams) {
    node.classList.toggle("hidden", state.mode !== "radiomap");
  }
  for (const node of ui.deepmimoOnlyParams) {
    node.classList.toggle("hidden", !isDeepMimo);
  }
  for (const node of ui.livePreviewParams) {
    node.classList.toggle("hidden", !isLink);
  }
  for (const node of ui.livePreviewLinkParams) {
    node.classList.toggle("hidden", !isLink);
  }
  ui.deviceDock.classList.toggle("hidden", !sceneControlsVisible);
  ui.deviceDock.setAttribute("aria-hidden", String(!sceneControlsVisible));
  ui.devicePrecisionPanel.classList.toggle("hidden", !sceneControlsVisible || !hasPrecisionTarget);
  ui.devicePrecisionPanel.setAttribute("aria-hidden", String(!sceneControlsVisible || !hasPrecisionTarget));
  ui.linkTxDeviceCard.classList.toggle("hidden", nextActiveTarget !== "link-tx");
  ui.linkRxDeviceCard.classList.toggle("hidden", nextActiveTarget !== "link-rx");
  ui.mobilityTxDeviceCard.classList.toggle("hidden", nextActiveTarget !== "mobility-tx");
  ui.mobilityRxDeviceCard.classList.toggle("hidden", nextActiveTarget !== "mobility-rx");
  ui.rmTxDeviceCard.classList.toggle("hidden", nextActiveTarget !== "rm-tx");
  ui.deepMimoTxDeviceCard.classList.toggle("hidden", nextActiveTarget !== "deepmimo-tx");
  ui.linkSurfaceClearanceField.classList.toggle("hidden", !(nextActiveTarget === "link-tx" || nextActiveTarget === "link-rx" || nextActiveTarget === "mobility-tx" || nextActiveTarget === "mobility-rx" || nextActiveTarget === "rm-tx" || nextActiveTarget === "deepmimo-tx"));
  ui.btnPickLinkTx.classList.toggle("hidden", !isLink);
  ui.btnPickLinkRx.classList.toggle("hidden", !isLink);
  ui.btnPickMobilityTx.classList.toggle("hidden", !isMobility);
  ui.btnPickMobilityRx.classList.toggle("hidden", !isMobility);
  ui.btnPickRmTx.classList.toggle("hidden", state.mode !== "radiomap");
  ui.btnDeepMimoPickTx.classList.toggle("hidden", !isDeepMimo);
  ui.btnDeepMimoPickRoi.classList.toggle("hidden", !isDeepMimo);
  ui.btnDeepMimoClearRoi.classList.toggle("hidden", !isDeepMimo);
  ui.btnSolveLink.classList.toggle("hidden", !isLink);
  ui.btnRunMobility.classList.toggle("hidden", !isMobility);
  ui.btnRunRadiomap.classList.toggle("hidden", state.mode !== "radiomap");
  ui.btnRunDeepMimo.classList.toggle("hidden", !isDeepMimo);
  for (const button of [ui.btnSolveLink, ui.btnRunMobility, ui.btnRunRadiomap]) {
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
  ui.btnPickLinkTx.classList.toggle("active", nextActiveTarget === "link-tx");
  ui.btnPickLinkRx.classList.toggle("active", nextActiveTarget === "link-rx");
  ui.btnPickMobilityTx.classList.toggle("active", nextActiveTarget === "mobility-tx");
  ui.btnPickMobilityRx.classList.toggle("active", nextActiveTarget === "mobility-rx");
  ui.btnPickRmTx.classList.toggle("active", nextActiveTarget === "rm-tx");
  ui.btnDeepMimoPickTx.classList.toggle("active", nextActiveTarget === "deepmimo-tx");
  ui.btnDeepMimoPickRoi.classList.toggle("active", nextActiveTarget === "deepmimo-roi");
  ui.btnPickLinkTx.classList.toggle("picking", state.pickTarget === "link-tx");
  ui.btnPickLinkRx.classList.toggle("picking", state.pickTarget === "link-rx");
  ui.btnPickMobilityTx.classList.toggle("picking", state.pickTarget === "mobility-tx");
  ui.btnPickMobilityRx.classList.toggle("picking", state.pickTarget === "mobility-rx");
  ui.btnPickRmTx.classList.toggle("picking", state.pickTarget === "rm-tx");
  ui.btnDeepMimoPickTx.classList.toggle("picking", state.pickTarget === "deepmimo-tx");
  ui.btnDeepMimoPickRoi.classList.toggle("picking", state.pickTarget === "deepmimo-roi");
  ui.devicePrecisionTitle.textContent = nextActiveTarget === "link-rx" || nextActiveTarget === "mobility-rx"
    ? "Rx"
    : nextActiveTarget === "deepmimo-tx"
      ? "DM Tx"
    : nextActiveTarget === "mobility-tx"
      ? "Tx"
    : nextActiveTarget === "deepmimo-roi"
      ? "ROI"
    : nextActiveTarget === "rm-tx"
      ? "RM Tx"
      : "Tx";
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
  renderLinkResult();
  renderMobilityResult();
  renderRadiomapResult();
  renderDeepMimoState();
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
