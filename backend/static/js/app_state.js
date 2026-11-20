import {FeatureStore} from "/js/core/feature_registry.js";
import {FEATURE_CATALOG} from "/js/features/feature_catalog.js?v=20260723-radar-shared-groups";

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
    subscribeFrame() { return () => false; },
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
  capabilities: {
    antennaPatterns: ["iso", "dipole", "hw_dipole", "tr38901"],
    antennaPolarizations: ["V", "H", "VH", "cross"],
    antennaLimits: {
      numRows: {min: 1, max: 16},
      numCols: {min: 1, max: 16},
      verticalSpacing: {min: 0.01, max: 10},
      horizontalSpacing: {min: 0.01, max: 10},
    },
    colormaps: ["jet", "viridis", "plasma", "inferno", "magma", "turbo"],
  },
  mode: "link",
  pickTarget: null,
  tileLoadBusy: false,
  busyActionId: null,
  panelCollapsed: false,
  sceneVisible: false,
  loading: {
    visible: false,
    title: "Loading Scene",
    message: "Initializing...",
    percent: 0,
    indeterminate: false,
    cancellable: false,
    cancelLabel: "Cancel",
  },
  solver: {
    frequencyGhz: 3.5,
    maxDepth: 3,
    seed: 42,
    los: true,
    specularReflection: true,
    diffuseReflection: false,
    refraction: true,
  },
  deviceControl: {
    activeTarget: null,
    hintText: "Click a surface point or adjust coordinates.",
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
      query: "",
      hint: "",
      isError: false,
      results: [],
      selectedIndex: -1,
      lastRequestAt: 0,
      inFlight: false,
    },
  },
  link: featureStore.get("link"),
  radar: featureStore.get("radar"),
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
    radar: {
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
  basemapReady: false,
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
