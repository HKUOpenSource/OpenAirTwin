import {
  ObservableStateAdapter,
  type UiExternalStore,
} from "./observable-state.ts";
import type { StatusTone } from "../ui/WorkbenchChrome.tsx";

export type WorkbenchFeatureId =
  "link" | "mobility" | "radiomap" | "deepmimo" | "radar";

export interface EntryPlaceItem {
  readonly index: number;
  readonly title: string;
  readonly detail: string;
  readonly meta: string;
  readonly active: boolean;
}

export interface TileSelectionItem {
  readonly id: string;
  readonly title: string;
  readonly detail: string;
  readonly selected: boolean;
  readonly loaded: boolean;
  readonly pendingAdd: boolean;
  readonly pendingRemove: boolean;
  readonly disabled: boolean;
  readonly status: string;
}

export interface PerformanceCategoryItem {
  readonly name: string;
  readonly stats: string;
  readonly visible: boolean;
}

export interface EntryTooltipState {
  readonly visible: boolean;
  readonly title: string;
  readonly body: string;
  readonly x: number;
  readonly y: number;
}

export interface LoadingOverlayState {
  readonly visible: boolean;
  readonly title: string;
  readonly message: string;
  readonly percent: number;
  readonly indeterminate: boolean;
  readonly cancellable: boolean;
  readonly cancelLabel: string;
}

export interface AppDialogState {
  readonly open: boolean;
  readonly type: "alert" | "confirm";
  readonly variant: "info" | "warning" | "error";
  readonly title: string;
  readonly message: string;
  readonly detail: string;
  readonly primaryLabel: string;
  readonly secondaryLabel: string;
}

export interface ShellSnapshot {
  readonly screen: "entry" | "scene";
  readonly activeMode: WorkbenchFeatureId;
  readonly leftRailCollapsed: boolean;
  readonly rightRailCollapsed: boolean;
  readonly tileLoadBusy: boolean;
  readonly loadedTileCount: number;
  readonly selectedTileCount: number;
  readonly tileSummary: string;
  readonly tiles: readonly TileSelectionItem[];
  readonly entry: {
    readonly sidebarCollapsed: boolean;
    readonly searchQuery: string;
    readonly searchHint: string;
    readonly searchError: boolean;
    readonly searchResults: readonly EntryPlaceItem[];
    readonly mapTitle: string;
    readonly badgeValue: string;
    readonly badgeDetail: string;
    readonly canEnterScene: boolean;
    readonly enterButtonLabel: string;
    readonly canReturnScene: boolean;
    readonly tooltip: EntryTooltipState;
  };
  readonly performance: {
    readonly visible: boolean;
    readonly mode: "auto" | "quality" | "fast";
    readonly lightweightMaterials: boolean;
    readonly fps: string;
    readonly dpr: string;
    readonly drawCalls: string;
    readonly triangles: string;
    readonly faces: string;
    readonly loadedSummary: string;
    readonly loadedDetail: string;
    readonly categories: readonly PerformanceCategoryItem[];
  };
  readonly loading: LoadingOverlayState;
  readonly dialog: AppDialogState;
  readonly resultDock: {
    readonly visible: boolean;
    readonly title: string;
    readonly subtitle: string;
  };
  readonly livePreviewStatus: {
    readonly visible: boolean;
    readonly label: string;
    readonly tone: StatusTone;
  };
}

export interface NumericRangeLimit {
  readonly min: number;
  readonly max: number;
}

export interface AntennaArrayState {
  readonly pattern: string;
  readonly polarization: string;
  readonly numRows: number;
  readonly numCols: number;
  readonly verticalSpacing: number;
  readonly horizontalSpacing: number;
}

export interface MobilityWaypointItem {
  readonly index: number;
  readonly label: string;
  readonly coords: string;
  readonly selected: boolean;
}

export interface RadarTargetSummaryItem {
  readonly id: string;
  readonly title: string;
  readonly meta: string;
  readonly color: string;
  readonly selected: boolean;
}

export interface RadarTargetEditorState {
  readonly id: string;
  readonly title: string;
  readonly assetId: string;
  readonly assetName: string;
  readonly position: readonly [number, number, number];
  readonly orientationDeg: readonly [number, number, number];
  readonly speed: number;
  readonly directionDeg: number;
  readonly climbDeg: number;
  readonly velocityPreview: string;
  readonly rcsM2: number;
}

export interface ControlsSnapshot {
  readonly activeMode: WorkbenchFeatureId;
  readonly tileLoadBusy: boolean;
  readonly busyActionId: string | null;
  readonly deviceBar: {
    readonly visible: boolean;
    readonly activeTarget: string | null;
    readonly hintText: string;
    readonly txOrbiting: boolean;
    readonly canOrbitTx: boolean;
    readonly surfaceClearanceM: number;
    readonly txPosition: readonly [number, number, number] | null;
    readonly rxPosition: readonly [number, number, number] | null;
    readonly showRx: boolean;
    readonly txLabel: string;
    readonly rxLabel: string;
    readonly precisionTitle: string;
    readonly showClearance: boolean;
  };
  readonly capabilities: {
    readonly antennaPatterns: readonly string[];
    readonly antennaPolarizations: readonly string[];
    readonly antennaLimits: {
      readonly numRows: NumericRangeLimit;
      readonly numCols: NumericRangeLimit;
      readonly verticalSpacing: NumericRangeLimit;
      readonly horizontalSpacing: NumericRangeLimit;
    };
    readonly colormaps: readonly string[];
  };
  readonly solver: {
    readonly frequencyGhz: number;
    readonly maxDepth: number;
    readonly seed: number;
    readonly los: boolean;
    readonly specularReflection: boolean;
    readonly diffuseReflection: boolean;
    readonly refraction: boolean;
  };
  readonly antenna: {
    readonly policy: "both" | "tx" | "fixed" | "none";
    readonly txArray: AntennaArrayState;
    readonly rxArray: AntennaArrayState;
  };
  readonly link: {
    readonly bandwidthMhz: number;
    readonly samplesPerSrc: number;
    readonly maxNumPathsPerSrc: number;
    readonly syntheticArray: boolean;
    readonly diffraction: boolean;
    readonly edgeDiffraction: boolean;
    readonly diffractionLitRegion: boolean;
    readonly computeTaps: boolean;
    readonly tapLMin: number;
    readonly tapLMax: number;
    readonly tapFftSize: number;
    readonly tapSubcarrierSpacingHz: number;
    readonly livePreviewEnabled: boolean;
    readonly livePreviewSamples: number;
    readonly livePreviewPathsDelay: number;
    readonly runDisabledReason: string;
  };
  readonly mobility: {
    readonly velocityMps: number;
    readonly timeStepS: number;
    readonly maxSteps: number;
    readonly estimateText: string;
    readonly waypoints: readonly MobilityWaypointItem[];
    readonly canAddRxWaypoint: boolean;
    readonly runDisabledReason: string;
  };
  readonly radiomap: {
    readonly sizeX: number;
    readonly sizeY: number;
    readonly heightOffset: number;
    readonly samplesPerTx: number;
    readonly cellSize: number | null;
    readonly densityLevel: number;
    readonly colormap: string;
    readonly colorMinDb: number;
    readonly colorMaxDb: number;
    readonly runDisabledReason: string;
  };
  readonly deepmimo: {
    readonly scenarioName: string;
    readonly roiCenterX: number | null;
    readonly roiCenterY: number | null;
    readonly roiWidth: number | null;
    readonly roiLength: number | null;
    readonly hasRoi: boolean;
    readonly gridSpacing: number;
    readonly rxHeight: number;
    readonly maxReceivers: number;
    readonly chunkSize: number;
    readonly samplesPerSrc: number;
    readonly maxNumPathsPerSrc: number;
    readonly filterBuildings: boolean;
    readonly rxCandidatesText: string;
    readonly runDisabledReason: string;
  };
  readonly radar: {
    readonly mode: "monostatic" | "bistatic";
    readonly modeHint: string;
    readonly job: {
      readonly visible: boolean;
      readonly status: string;
      readonly failureKind: string;
      readonly message: string;
      readonly progress: number;
      readonly canCancel: boolean;
      readonly canRetry: boolean;
      readonly active: boolean;
    };
    readonly assets: readonly { readonly id: string; readonly label: string }[];
    readonly pickerAssetId: string;
    readonly pickerAssetName: string;
    readonly pickerCountLabel: string;
    readonly pickerStatus: string;
    readonly pickerState: "loading" | "ready" | "error";
    readonly pickerHint: string;
    readonly hasMultipleAssets: boolean;
    readonly canAddTarget: boolean;
    readonly addTargetDisabledReason: string;
    readonly targetCountLabel: string;
    readonly targets: readonly RadarTargetSummaryItem[];
    readonly selectedTarget: RadarTargetEditorState | null;
    readonly waveform: {
      readonly carrierFrequencyGhz: number;
      readonly bandwidthMhz: number;
      readonly numSubcarriers: number;
      readonly numSymbols: number;
      readonly rangeResolutionText: string;
      readonly dopplerResolutionText: string;
      readonly velocityResolutionText: string;
    };
    readonly signal: {
      readonly txPowerDbm: number;
      readonly noiseFigureDb: number;
      readonly systemLossDb: number;
      readonly noiseTemperatureK: number;
      readonly directPathCancellation: boolean;
    };
    readonly cfar: {
      readonly enabled: boolean;
      readonly guardRange: number;
      readonly guardDoppler: number;
      readonly trainingRange: number;
      readonly trainingDoppler: number;
      readonly falseAlarmProbability: number;
    };
    readonly solver: {
      readonly samplesPerSrc: number;
      readonly maxNumPathsPerSrc: number;
      readonly maxDepth: number;
      readonly seed: number;
      readonly los: boolean;
      readonly specularReflection: boolean;
      readonly diffuseReflection: boolean;
      readonly refraction: boolean;
      readonly diffraction: boolean;
      readonly syntheticArray: boolean;
    };
    readonly inputError: string;
    readonly runDisabledReason: string;
  };
}

export function createInitialShellSnapshot(
  activeMode: WorkbenchFeatureId = "link",
): ShellSnapshot {
  return {
    screen: "scene",
    activeMode,
    leftRailCollapsed: false,
    rightRailCollapsed: false,
    tileLoadBusy: false,
    loadedTileCount: 0,
    selectedTileCount: 0,
    tileSummary: "0 selected · 0 loaded · 0 pending",
    tiles: [],
    entry: {
      sidebarCollapsed: false,
      searchQuery: "",
      searchHint: "",
      searchError: false,
      searchResults: [],
      mapTitle: "HKU Wireless Digital Twin",
      badgeValue: "0 selected",
      badgeDetail: "0 loaded · 0 pending",
      canEnterScene: false,
      enterButtonLabel: "Load Selected Tiles",
      canReturnScene: false,
      tooltip: { visible: false, title: "", body: "", x: 0, y: 0 },
    },
    performance: {
      visible: false,
      mode: "auto",
      lightweightMaterials: true,
      fps: "--",
      dpr: "--",
      drawCalls: "--",
      triangles: "--",
      faces: "--",
      loadedSummary: "--",
      loadedDetail: "--",
      categories: [],
    },
    loading: {
      visible: false,
      title: "Loading Scene",
      message: "Initializing...",
      percent: 0,
      indeterminate: false,
      cancellable: false,
      cancelLabel: "Cancel",
    },
    dialog: {
      open: false,
      type: "alert",
      variant: "info",
      title: "OpenAirTwin",
      message: "",
      detail: "",
      primaryLabel: "OK",
      secondaryLabel: "Cancel",
    },
    resultDock: {
      visible: false,
      title: "Link Results",
      subtitle: "Path Gains & Taps",
    },
    livePreviewStatus: {
      visible: false,
      label: "Idle",
      tone: "neutral",
    },
  };
}

const DEFAULT_ANTENNA: AntennaArrayState = {
  pattern: "iso",
  polarization: "V",
  numRows: 1,
  numCols: 1,
  verticalSpacing: 0.5,
  horizontalSpacing: 0.5,
};

export function createInitialControlsSnapshot(
  activeMode: WorkbenchFeatureId = "link",
): ControlsSnapshot {
  return {
    activeMode,
    tileLoadBusy: false,
    busyActionId: null,
    deviceBar: {
      visible: false,
      activeTarget: null,
      hintText: "Click a surface point or adjust coordinates.",
      txOrbiting: false,
      canOrbitTx: false,
      surfaceClearanceM: 1.5,
      txPosition: null,
      rxPosition: null,
      showRx: true,
      txLabel: "Tx",
      rxLabel: "Rx",
      precisionTitle: "Tx",
      showClearance: true,
    },
    capabilities: {
      antennaPatterns: ["iso", "dipole", "hw_dipole", "tr38901"],
      antennaPolarizations: ["V", "H", "VH", "cross"],
      antennaLimits: {
        numRows: { min: 1, max: 16 },
        numCols: { min: 1, max: 16 },
        verticalSpacing: { min: 0.01, max: 10 },
        horizontalSpacing: { min: 0.01, max: 10 },
      },
      colormaps: ["jet", "viridis", "plasma", "inferno", "magma", "turbo"],
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
    antenna: {
      policy: "both",
      txArray: DEFAULT_ANTENNA,
      rxArray: DEFAULT_ANTENNA,
    },
    link: {
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
      livePreviewEnabled: false,
      livePreviewSamples: 1000,
      livePreviewPathsDelay: 0.8,
      runDisabledReason: "Place Link Tx and Rx before solving the link.",
    },
    mobility: {
      velocityMps: 1.5,
      timeStepS: 1.0,
      maxSteps: 1000,
      estimateText: "Add at least 2 waypoints to build a trajectory.",
      waypoints: [],
      canAddRxWaypoint: false,
      runDisabledReason: "Place Mobility Tx before running mobility.",
    },
    radiomap: {
      sizeX: 160,
      sizeY: 160,
      heightOffset: 1.5,
      samplesPerTx: 1000000,
      cellSize: null,
      densityLevel: 2,
      colormap: "jet",
      colorMinDb: -140,
      colorMaxDb: -80,
      runDisabledReason: "Place Radio Map Tx before running the radio map.",
    },
    deepmimo: {
      scenarioName: "hku_deepmimo_roi",
      roiCenterX: null,
      roiCenterY: null,
      roiWidth: null,
      roiLength: null,
      hasRoi: false,
      gridSpacing: 2.0,
      rxHeight: 1.5,
      maxReceivers: 30000,
      chunkSize: 1024,
      samplesPerSrc: 30000,
      maxNumPathsPerSrc: 1000000,
      filterBuildings: true,
      rxCandidatesText: "--",
      runDisabledReason: "Place DeepMIMO Tx before exporting data.",
    },
    radar: {
      mode: "bistatic",
      modeHint: "Separate Radar Tx and Rx positions.",
      job: {
        visible: false,
        status: "idle",
        failureKind: "",
        message: "Ready",
        progress: 0,
        canCancel: false,
        canRetry: false,
        active: false,
      },
      assets: [],
      pickerAssetId: "",
      pickerAssetName: "Loading drone models...",
      pickerCountLabel: "0 / 0",
      pickerStatus: "Loading...",
      pickerState: "loading",
      pickerHint: "Preparing the selected drone preview...",
      hasMultipleAssets: false,
      canAddTarget: false,
      addTargetDisabledReason: "Drone preview is loading.",
      targetCountLabel: "0 / 16",
      targets: [],
      selectedTarget: null,
      waveform: {
        carrierFrequencyGhz: 5.8,
        bandwidthMhz: 128,
        numSubcarriers: 1024,
        numSymbols: 1024,
        rangeResolutionText: "--",
        dopplerResolutionText: "--",
        velocityResolutionText: "--",
      },
      signal: {
        txPowerDbm: 30,
        noiseFigureDb: 7,
        systemLossDb: 3,
        noiseTemperatureK: 290,
        directPathCancellation: true,
      },
      cfar: {
        enabled: true,
        guardRange: 1,
        guardDoppler: 1,
        trainingRange: 2,
        trainingDoppler: 4,
        falseAlarmProbability: 1e-8,
      },
      solver: {
        samplesPerSrc: 65536,
        maxNumPathsPerSrc: 4096,
        maxDepth: 2,
        seed: 42,
        los: true,
        specularReflection: true,
        diffuseReflection: true,
        refraction: true,
        diffraction: false,
        syntheticArray: false,
      },
      inputError: "",
      runDisabledReason: "Place Radar Tx, Rx, and at least one target.",
    },
  };
}

export interface ShellStoreController {
  readonly store: UiExternalStore<ShellSnapshot>;
  readonly getSnapshot: () => ShellSnapshot;
  readonly patch: (updater: (current: ShellSnapshot) => ShellSnapshot) => void;
  readonly dispose: () => void;
}

export function createShellStore(
  activeMode: WorkbenchFeatureId = "link",
): ShellStoreController {
  let snapshot = createInitialShellSnapshot(activeMode);
  const adapter = new ObservableStateAdapter<ShellSnapshot>(() => snapshot);
  return {
    store: adapter,
    getSnapshot() {
      return adapter.getSnapshot();
    },
    patch(updater) {
      snapshot = updater(snapshot);
      adapter.refresh();
    },
    dispose() {
      adapter.dispose();
    },
  };
}

export interface ControlsStoreController {
  readonly store: UiExternalStore<ControlsSnapshot>;
  readonly getSnapshot: () => ControlsSnapshot;
  readonly publish: (next: ControlsSnapshot) => void;
  readonly patch: (
    updater: (current: ControlsSnapshot) => ControlsSnapshot,
  ) => void;
  readonly dispose: () => void;
}

export function createControlsStore(
  activeMode: WorkbenchFeatureId = "link",
): ControlsStoreController {
  let snapshot = createInitialControlsSnapshot(activeMode);
  const adapter = new ObservableStateAdapter<ControlsSnapshot>(() => snapshot);
  return {
    store: adapter,
    getSnapshot() {
      return adapter.getSnapshot();
    },
    publish(next) {
      snapshot = next;
      adapter.refresh();
    },
    patch(updater) {
      snapshot = updater(snapshot);
      adapter.refresh();
    },
    dispose() {
      adapter.dispose();
    },
  };
}
