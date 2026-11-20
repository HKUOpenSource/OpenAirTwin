import {createSceneLoaderController} from "/js/controllers/scene_loader_controller.js?v=20260519-mode-isolation";
import {createLoadingOverlayController} from "/js/ui/loading_overlay_controller.js?v=20260519-mode-isolation";
import {createTileSelectionView} from "/js/ui/tile_selection_view.js?v=20260519-mode-isolation";

export function createSceneRenderStateController(context) {
  const {features, hosts, picking, state, viewerRef} = context;
  const shellStore = context.featureServices.shellUi;
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
    shellStore.patch((current) => ({
      ...current,
      rightRailCollapsed: !state.resultDock.expanded,
    }));
  }

  function syncControlSidebarUi() {
    shellStore.patch((current) => ({
      ...current,
      leftRailCollapsed: Boolean(state.panelCollapsed),
      screen: state.entry.visible ? "entry" : "scene",
    }));
  }

  function applyPerformanceSettingsToViewer() {
    performancePanel().applyPerformanceSettingsToViewer();
  }

  function syncNumericInputs() {
    solver().publishControls();
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

  async function ensureViewer() {
    if (getViewer().__ready) {
      return getViewer();
    }
    if (!viewerRef.modulePromise) {
      viewerRef.modulePromise = import("/js/viewer.js?v=20260722-radar-screen-labels");
    }
    const {Viewer} = await viewerRef.modulePromise;
    const realViewer = new Viewer(hosts.require("view"));
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
    shellStore,
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

  function cancelOverlay() {
    return loadingOverlay.cancel();
  }

  const tileSelectionView = createTileSelectionView({
    state,
    shellStore,
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

  function syncModeUi() {
    const activeFeature = features.get(state.mode) || features.definitions()[0];
    const activeTargetIds = new Set(picking.targetsFor(activeFeature.id).map((target) => target.id));
    const sceneControlsVisible = Boolean(
      getViewer().__ready
      && !state.entry.visible
      && state.sceneVisible
      && !state.loading.visible,
    );
    if (!sceneControlsVisible) {
      state.pickTarget = null;
      state.deviceControl.activeTarget = null;
    }
    if (state.deviceControl.activeTarget && !activeTargetIds.has(state.deviceControl.activeTarget)) {
      state.deviceControl.activeTarget = null;
      state.pickTarget = null;
    }
    const activeTx = features.instance(activeFeature.id)?.markerPositions?.().tx;
    const txReady = Array.isArray(activeTx) && activeTx.length === 3;
    if (!txReady && getViewer().isTxOrbiting()) {
      getViewer().stopTxOrbit();
    }
    shellStore.patch((current) => ({
      ...current,
      activeMode: state.mode,
    }));
  }

  function renderAll() {
    syncModeUi();
    syncControlSidebarUi();
    syncViewerMarkers();
    syncModeVisuals();
    syncTileListUi();
    syncEntryOverviewUi();
    syncPerformanceUi();
    syncResultDockUi();
    features.render(context);
    solver().publishControls();
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
    cancelOverlay,
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
    dispose() {
      loadingOverlay.dispose();
    },
  };
}
