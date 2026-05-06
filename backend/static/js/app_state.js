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
    renderPaths() {},
    clearOverlay() {},
    clearPaths() {},
    clearMobility() {},
    startTxOrbit() { return false; },
    stopTxOrbit() {},
    isTxOrbiting() { return false; },
    clearRadiomap() {},
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
  entry: {
    visible: false,
    sceneReady: false,
    overview: null,
    sidebarCollapsed: false,
    search: {
      results: [],
      selectedIndex: -1,
      lastRequestAt: 0,
      inFlight: false,
    },
  },
  link: {
    tx: [72.0, 37.0, 40.0],
    txVisual: [72.0, 37.0, 40.0],
    rx: [90.0, 52.0, 1.5],
    rxVisual: [90.0, 52.0, 1.5],
    result: null,
    selectedPath: -1,
    advanced: {
      bandwidthMhz: 15.36,
      samplesPerSrc: 30000,
      maxNumPathsPerSrc: 1000000,
      syntheticArray: false,
      diffraction: false,
      edgeDiffraction: false,
      diffractionLitRegion: false,
      computeTaps: false,
      tapLMin: 0,
      tapLMax: 100,
      tapFftSize: 512,
      tapSubcarrierSpacingHz: 30000,
    },
  },
  radiomap: {
    tx: [72.0, 37.0, 40.0],
    txVisual: [72.0, 37.0, 40.0],
    surface: {
      size: [160.0, 160.0],
      heightOffset: 1.5,
      densityLevel: 2,
    },
    display: {
      colorMinDb: -140,
      colorMaxDb: -80,
    },
    jobId: null,
    result: null,
    status: "Idle",
  },
  mobility: {
    trajectory: {
      points: [
        [90.0, 52.0, 1.5],
        [105.0, 60.0, 1.5],
      ],
      velocityMps: 1.5,
      timeStepS: 1.0,
      maxSteps: 50,
    },
    jobId: null,
    result: null,
    status: "Idle",
    selectedStep: 0,
    selectedPath: -1,
    metric: "received_power_db",
    playing: false,
    playbackSpeed: 1.0,
    playbackTimer: null,
    tapsDefaulted: false,
  },
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
