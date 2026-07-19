import {FeatureStore} from "/js/core/feature_registry.js";
import {FEATURE_CATALOG} from "/js/features/feature_catalog.js";

function createViewerStub() {
  return {
    __ready: false,
    loadedTileIds: new Set(),
    meshesLoaded: 0,
    txMarkerRadius: 1.25,
    rxMarkerRadius: 1.25,
    setTx() {},
    setRx() {},
    renderRadiomap() {},
    renderDeepMimoRoi() {},
    clearDeepMimoRoi() {},
    renderPaths() {},
    clearOverlay() {},
    clearPaths() {},
    clearMobility() {},
    startTxOrbit() { return false; },
    stopTxOrbit() {},
    isTxOrbiting() { return false; },
    clearRadiomap() {},
    clearSurfacePreview() {},
    renderMobilityTrajectory() {},
    focusOnTiles() { return false; },
    getLoadedCategoryStats() { return []; },
    getPerformanceStats() {
      return {
        fps: 0,
        dpr: 1,
        renderCalls: 0,
        renderTriangles: 0,
        estimatedFaces: 0,
        estimatedVertices: 0,
        bundleCount: 0,
        visibleBundleCount: 0,
        loadedTileCount: 0,
        visibleTileCount: 0,
      };
    },
    setCategoryVisible() {},
    setLightweightMaterials() {},
    setPerformanceMode() {},
    async syncBundles() {},
    resetView() {},
    pickOnSurface() { return null; },
  };
}

export const DEFAULT_PERFORMANCE_MODE = "auto";
export const PERFORMANCE_MODES = new Set(["auto", "quality", "fast"]);
export const DEFAULT_ANTENNA_ARRAY = Object.freeze({
  numRows: 1,
  numCols: 1,
  verticalSpacing: 0.5,
  horizontalSpacing: 0.5,
  pattern: "iso",
  polarization: "V",
});

function createDefaultAntennaArray() {
  return {...DEFAULT_ANTENNA_ARRAY};
}

export const viewerRef = {
  current: createViewerStub(),
  modulePromise: null,
};

export const featureStore = new FeatureStore(FEATURE_CATALOG);

export const state = {
  manifest: null,
  rtCapabilities: null,
  mode: "link",
  pickTarget: null,
  tileLoadBusy: false,
  panelCollapsed: false,
  deviceControl: {
    activeTarget: null,
  },
  performance: {
    mode: DEFAULT_PERFORMANCE_MODE,
    lightweightMaterials: true,
    dockExpanded: false,
    categories: [],
    categoryVisibility: new Map(),
  },
  resultDock: {
    expanded: true,
  },
  entry: {
    visible: false,
    sceneReady: false,
    overview: null,
    coverage: null,
    sidebarCollapsed: false,
    downloadingTileIds: new Map(),
    search: {
      results: [],
      selectedIndex: -1,
      lastRequestAt: 0,
      inFlight: false,
    },
  },
  link: featureStore.get("link"),
  livePreview: {
    enabled: false,
    mode: null,
    status: "Idle",
    link: {
      previewSamplesPerSrc: 1000,
      pathsDelayS: 0.8,
      generation: 0,
      previewTimer: null,
      finalTimer: null,
      previewController: null,
      finalController: null,
      lastPreviewStartedAt: 0,
    },
  },
  radiomap: featureStore.get("radiomap"),
  deepmimo: featureStore.get("deepmimo"),
  mobility: featureStore.get("mobility"),
  antenna: {
    txArray: createDefaultAntennaArray(),
    rxArray: createDefaultAntennaArray(),
  },
};

export const entryMap = {
  initialized: false,
  map: null,
  tileLayer: null,
  fallbackLayer: null,
  fallbackEnabled: false,
  tilesLoaded: 0,
  fallbackTimer: null,
  fittedOnce: false,
  hoveredTileId: null,
  tilesById: new Map(),
  gridLayer: null,
  tileRenderer: null,
  tileLayerGroup: null,
  searchMarker: null,
  searchHighlightLayer: null,
};
