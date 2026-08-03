export type ResultFeatureId = "link" | "mobility" | "radiomap" | "radar";
export type ResultStatus =
  "idle" | "loading" | "success" | "empty" | "cancelled" | "error" | "stale";

export interface ResultMetricViewModel {
  readonly id: string;
  readonly label: string;
  readonly value: string;
  readonly valueId?: string;
  readonly valueClassName?: string;
}

export interface PathRowViewModel {
  readonly index: number;
  readonly name: string;
  readonly typeLabel: string;
  readonly typeClassName: string;
  readonly variantLabel: string | null;
  readonly gain: string;
  readonly delay: string;
  readonly ariaLabel: string;
  readonly selected: boolean;
}

export interface PathDetailFieldViewModel {
  readonly id: string;
  readonly label: string;
  readonly value: string;
  readonly wide: boolean;
}

export interface PathDetailViewModel {
  readonly title: string;
  readonly typeLabel: string;
  readonly fields: readonly PathDetailFieldViewModel[];
}

export interface PathResultsViewModel {
  readonly visible: boolean;
  readonly featureId: "link" | "mobility";
  readonly countLabel: string;
  readonly meta: string;
  readonly selectedIndex: number;
  readonly rows: readonly PathRowViewModel[];
  readonly detail: PathDetailViewModel | null;
}

export interface ChannelViewModel {
  readonly visible: boolean;
  readonly metrics: readonly ResultMetricViewModel[];
}

export interface LinkResultViewModel {
  readonly status: ResultStatus;
  readonly visible: boolean;
  readonly summary: readonly ResultMetricViewModel[];
  readonly channel: ChannelViewModel;
  readonly paths: PathResultsViewModel;
}

export interface MobilityResultViewModel {
  readonly status: ResultStatus;
  readonly visible: boolean;
  readonly summary: readonly ResultMetricViewModel[];
  readonly stepLabel: string;
  readonly metric: string;
  readonly selectedStep: number;
  readonly maxStep: number;
  readonly playbackSpeed: string;
  readonly playing: boolean;
  readonly channel: ChannelViewModel;
  readonly paths: PathResultsViewModel;
}

export interface RadioMapResultViewModel {
  readonly status: ResultStatus;
  readonly visible: boolean;
  readonly summary: readonly ResultMetricViewModel[];
  readonly resolution: readonly ResultMetricViewModel[];
  readonly colorbar: {
    readonly visible: boolean;
    readonly colormapLabel: string;
    readonly rangeLabel: string;
    readonly minLabel: string;
    readonly maxLabel: string;
    readonly gradient: string;
  };
}

export interface RadarRowViewModel {
  readonly id: string;
  readonly title: string;
  readonly meta: string;
  readonly detail: string;
  readonly className: string;
  readonly selected: boolean;
  readonly dataAttribute: "detectionId" | "targetId" | "pathIndex";
  readonly dataValue: string;
}

export interface RadarResultViewModel {
  readonly status: ResultStatus;
  readonly visible: boolean;
  readonly summary: readonly ResultMetricViewModel[];
  readonly rangeDoppler: {
    readonly meta: string;
    readonly truncated: boolean;
    readonly processingView: string;
    readonly processingHint: string;
    readonly processingOptions: readonly {
      readonly id: string;
      readonly label: string;
      readonly available: boolean;
    }[];
    readonly viewport: "focus" | "full";
    readonly focusAvailable: boolean;
  };
  readonly detectionFilter: string;
  readonly detectionCount: string;
  readonly detectionMoreLabel: string;
  readonly detectionMoreVisible: boolean;
  readonly detectionEmptyMessage: string;
  readonly detections: readonly RadarRowViewModel[];
  readonly truthEmptyMessage: string;
  readonly truth: readonly RadarRowViewModel[];
  readonly pathDisplayMode: string;
  readonly pathDisplayHint: string;
  readonly pathCount: string;
  readonly pathEmptyMessage: string;
  readonly paths: readonly RadarRowViewModel[];
  readonly pathNote: string;
}

export interface ResultDockSnapshot {
  readonly activeMode: ResultFeatureId | null;
  readonly link: LinkResultViewModel;
  readonly mobility: MobilityResultViewModel;
  readonly radiomap: RadioMapResultViewModel;
  readonly radar: RadarResultViewModel;
}

const emptyPaths = (featureId: "link" | "mobility"): PathResultsViewModel => ({
  visible: false,
  featureId,
  countLabel: "0 paths",
  meta: "",
  selectedIndex: -1,
  rows: [],
  detail: null,
});

const emptyChannel = (): ChannelViewModel => ({
  visible: false,
  metrics: [
    {
      id: "tap-total",
      valueId: "linkTapTotalPower",
      label: "Total Tap Power",
      value: "--",
    },
    {
      id: "tap-peak",
      valueId: "linkTapPeak",
      label: "Strongest Tap",
      value: "--",
    },
    {
      id: "cir-count",
      valueId: "linkCirCoeffCount",
      label: "Channel Coefficients",
      value: "--",
    },
    {
      id: "cir-strongest",
      valueId: "linkCirStrongest",
      label: "Largest Coefficient |h|",
      value: "--",
    },
  ],
});

export function createInitialResultDockSnapshot(): ResultDockSnapshot {
  return {
    activeMode: null,
    link: {
      status: "idle",
      visible: false,
      summary: [],
      channel: emptyChannel(),
      paths: emptyPaths("link"),
    },
    mobility: {
      status: "idle",
      visible: false,
      summary: [],
      stepLabel: "Step --",
      metric: "received_power_db",
      selectedStep: 0,
      maxStep: 0,
      playbackSpeed: "1",
      playing: false,
      channel: emptyChannel(),
      paths: emptyPaths("mobility"),
    },
    radiomap: {
      status: "idle",
      visible: false,
      summary: [],
      resolution: [],
      colorbar: {
        visible: false,
        colormapLabel: "Colormap: jet",
        rangeLabel: "Display limits: --",
        minLabel: "--",
        maxLabel: "--",
        gradient: "",
      },
    },
    radar: {
      status: "idle",
      visible: false,
      summary: [],
      rangeDoppler: {
        meta: "Power heatmap with CA-CFAR detections",
        truncated: false,
        processingView: "raw",
        processingHint:
          "No additional clutter suppression; configured direct-path cancellation still applies.",
        processingOptions: [],
        viewport: "focus",
        focusAvailable: false,
      },
      detectionFilter: "all",
      detectionCount: "0",
      detectionMoreLabel: "Show all",
      detectionMoreVisible: false,
      detectionEmptyMessage: "",
      detections: [],
      truthEmptyMessage: "",
      truth: [],
      pathDisplayMode: "key",
      pathDisplayHint: "Target echoes plus the 12 strongest clutter paths.",
      pathCount: "0",
      pathEmptyMessage: "",
      paths: [],
      pathNote: "",
    },
  };
}
