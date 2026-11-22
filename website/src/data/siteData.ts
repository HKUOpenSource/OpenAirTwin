export type LabModeId =
  | "link"
  | "mobility"
  | "radiomap"
  | "deepmimo"
  | "radar";

export type BadgeVariant =
  | "blue"
  | "teal"
  | "green"
  | "orange"
  | "purple"
  | "pink"
  | "neutral";

export interface ValuePillar {
  readonly id: string;
  readonly index: string;
  readonly title: string;
  readonly description: string;
}

export interface LabModeSpec {
  readonly id: LabModeId;
  readonly index: string;
  readonly label: string;
  readonly shortLabel: string;
  readonly outcomeLabel: string;
  readonly description: string;
  readonly stageHint: string;
  readonly badgeVariant: BadgeVariant;
}

export interface WorkflowCardSpec {
  readonly id: string;
  readonly index: string;
  readonly label: string;
  readonly outcomeLabel: string;
  readonly description: string;
  readonly badgeVariant: BadgeVariant;
  readonly targetMode: LabModeId;
  readonly actionLabel: string;
}

export interface QuickStartStep {
  readonly index: string;
  readonly title: string;
  readonly body: string;
  readonly code: {
    readonly unix: string;
    readonly windows: string;
  };
}

export const REPOSITORY_URL = "https://github.com/HKUOpenSource/OpenAirTwin";
export const RELEASE_URL =
  "https://github.com/HKUOpenSource/OpenAirTwin/releases/tag/v1.1.0";
export const ARCHITECTURE_HREF = "./architecture/";

export const VALUE_PILLARS: readonly ValuePillar[] = [
  {
    id: "twins",
    index: "01",
    title: "City-Scale Digital Twins",
    description:
      "Anchor wireless research in real-world 3D buildings, terrain, and urban geometry.",
  },
  {
    id: "unified",
    index: "02",
    title: "Unified Platform",
    description:
      "Connect propagation, sensing, and mobility on a single modular spatial model.",
  },
  {
    id: "open",
    index: "03",
    title: "AI-Ready & Open",
    description:
      "Pair transparent physics with open data pipelines for reproducible benchmarks and wireless AI.",
  },
];

export const LAB_MODES: readonly LabModeSpec[] = [
  {
    id: "link",
    index: "01",
    label: "Link Analysis",
    shortLabel: "Link",
    outcomeLabel: "Multipath",
    description:
      "Trace 3D multipath rays, received power, and delay spread.",
    stageHint: "Drag to orbit · Click ground to move Rx",
    badgeVariant: "teal",
  },
  {
    id: "mobility",
    index: "02",
    label: "Mobility",
    shortLabel: "Mobility",
    outcomeLabel: "Dynamic Channel",
    description:
      "Track channel dynamics and visibility shifts along 3D routes.",
    stageHint: "Drag to orbit · Scroll to zoom",
    badgeVariant: "green",
  },
  {
    id: "radiomap",
    index: "03",
    label: "Radio Map",
    shortLabel: "Radio Map",
    outcomeLabel: "Coverage",
    description:
      "Map spatial coverage and urban shadowing across the city.",
    stageHint: "Drag to orbit · Click ground to move Tx",
    badgeVariant: "orange",
  },
  {
    id: "deepmimo",
    index: "04",
    label: "DeepMIMO",
    shortLabel: "DeepMIMO",
    outcomeLabel: "AI Datasets",
    description:
      "Sample outdoor 3D channel grids for wireless AI workflows.",
    stageHint: "Drag to orbit · Click any grid sample",
    badgeVariant: "purple",
  },
  {
    id: "radar",
    index: "05",
    label: "Radar Sensing",
    shortLabel: "Radar",
    outcomeLabel: "ISAC",
    description:
      "Simulate monostatic and bistatic sensing for moving 3D targets.",
    stageHint: "Drag to orbit · Scroll to zoom",
    badgeVariant: "pink",
  },
];

export const WORKFLOW_CARDS: readonly WorkflowCardSpec[] = [
  {
    id: "scenes",
    index: "01",
    label: "3D Urban Scenes",
    outcomeLabel: "Digital Twins",
    description:
      "Turn real-world 3D city geometry into simulation-ready urban environments.",
    badgeVariant: "blue",
    targetMode: "link",
    actionLabel: "Inspect Scene",
  },
  {
    id: "link",
    index: "02",
    label: "Link Analysis",
    outcomeLabel: "Propagation",
    description:
      "Model site-specific 3D multipath channels, path loss, and delay profiles.",
    badgeVariant: "teal",
    targetMode: "link",
    actionLabel: "Open in Lab",
  },
  {
    id: "mobility",
    index: "03",
    label: "Mobility",
    outcomeLabel: "Dynamic Channels",
    description:
      "Analyze time-varying channels and building blockage along realistic 3D routes.",
    badgeVariant: "green",
    targetMode: "mobility",
    actionLabel: "Open in Lab",
  },
  {
    id: "radiomap",
    index: "04",
    label: "Radio Map",
    outcomeLabel: "Spatial Coverage",
    description:
      "Evaluate city-scale signal coverage, shadowing, and spatial field strength.",
    badgeVariant: "orange",
    targetMode: "radiomap",
    actionLabel: "Open in Lab",
  },
  {
    id: "deepmimo",
    index: "05",
    label: "DeepMIMO",
    outcomeLabel: "AI Datasets",
    description:
      "Generate structured 3D channel datasets for reproducible wireless AI research.",
    badgeVariant: "purple",
    targetMode: "deepmimo",
    actionLabel: "Open in Lab",
  },
  {
    id: "radar",
    index: "06",
    label: "Radar Sensing",
    outcomeLabel: "ISAC",
    description:
      "Simulate urban target dynamics, occlusion, and clutter across 3D airspace.",
    badgeVariant: "pink",
    targetMode: "radar",
    actionLabel: "Open in Lab",
  },
];

export const QUICK_START_STEPS: readonly QuickStartStep[] = [
  {
    index: "01",
    title: "Clone",
    body: "Download the source repository.",
    code: {
      unix: "git clone https://github.com/HKUOpenSource/OpenAirTwin.git\ncd OpenAirTwin",
      windows:
        "git clone https://github.com/HKUOpenSource/OpenAirTwin.git\nSet-Location OpenAirTwin",
    },
  },
  {
    index: "02",
    title: "Install",
    body: "Set up the environment and sample scene.",
    code: {
      unix: "python3 install.py --with-sample-scene",
      windows: "py -3.11 install.py --with-sample-scene",
    },
  },
  {
    index: "03",
    title: "Launch",
    body: "Start the local web studio.",
    code: {
      unix: "set -a; . ./.oat-env; set +a\n./.venv/bin/python -m backend.server\n# http://127.0.0.1:8090",
      windows:
        ". .\\.oat-env.ps1\n.\\.venv\\Scripts\\python.exe -m backend.server\n# http://127.0.0.1:8090",
    },
  },
];

export function getModeFromUrl(): LabModeId | null {
  if (typeof window === "undefined") return null;
  const params = new URLSearchParams(window.location.search);
  const direct = params.get("mode");
  if (direct === "map") return "link";
  if (direct && LAB_MODES.some((m) => m.id === direct)) {
    return direct as LabModeId;
  }
  const legacyTutorial = params.get("tutorial");
  if (legacyTutorial) {
    const candidate = legacyTutorial.split("/")[0];
    if (candidate === "map") return "link";
    if (LAB_MODES.some((m) => m.id === candidate)) {
      return candidate as LabModeId;
    }
  }
  return null;
}
