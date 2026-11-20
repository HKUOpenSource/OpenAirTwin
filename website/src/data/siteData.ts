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
      "Ground wireless research in real-world 3D urban geometry, terrain, and environments at scale.",
  },
  {
    id: "unified",
    index: "02",
    title: "Unified Platform",
    description:
      "A modular architecture connecting propagation, sensing, and mobility on one consistent spatial model.",
  },
  {
    id: "open",
    index: "03",
    title: "AI-Ready & Open",
    description:
      "Transparent physics and open data pipelines designed for reproducible benchmarks and wireless AI.",
  },
];

export const LAB_MODES: readonly LabModeSpec[] = [
  {
    id: "link",
    index: "01",
    label: "Link Analysis",
    shortLabel: "Link",
    outcomeLabel: "CIR & PDP",
    description:
      "Inspect site-specific 3D multipath rays, power, and delay spread.",
    stageHint: "Orbit 3D view · click street to move Rx",
    badgeVariant: "teal",
  },
  {
    id: "mobility",
    index: "02",
    label: "Mobility",
    shortLabel: "Mobility",
    outcomeLabel: "3D Routes",
    description:
      "Track dynamic channels and LoS/NLoS shifts along 3D trajectories.",
    stageHint: "Orbit 3D view · scrub or play route",
    badgeVariant: "green",
  },
  {
    id: "radiomap",
    index: "03",
    label: "Radio Map",
    shortLabel: "Radio Map",
    outcomeLabel: "Coverage",
    description:
      "Explore spatial signal coverage and building shadowing in 3D.",
    stageHint: "Click ground to move Tx and update coverage",
    badgeVariant: "orange",
  },
  {
    id: "deepmimo",
    index: "04",
    label: "DeepMIMO",
    shortLabel: "DeepMIMO",
    outcomeLabel: "AI Datasets",
    description:
      "Sample outdoor 3D receiver grids and inspect per-user multipath.",
    stageHint: "Click any outdoor sample to trace 3D rays",
    badgeVariant: "purple",
  },
  {
    id: "radar",
    index: "05",
    label: "Radar Sensing",
    shortLabel: "Radar",
    outcomeLabel: "ISAC & Radar",
    description:
      "Simulate monostatic and bistatic sensing on moving 3D targets.",
    stageHint: "Orbit 3D airspace · toggle bistatic or animate targets",
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
      "Stream real-world 3D city geometry into simulation-ready environments.",
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
      "Model site-specific 3D multipath channels, power, and delay structure.",
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
      "Study time-varying propagation and blockage along realistic 3D trajectories.",
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
      "Evaluate city-scale coverage, shadowing, and spatial field distributions.",
    badgeVariant: "orange",
    targetMode: "radiomap",
    actionLabel: "Open in Lab",
  },
  {
    id: "deepmimo",
    index: "05",
    label: "DeepMIMO",
    outcomeLabel: "Wireless AI Data",
    description:
      "Generate site-specific 3D channel datasets for reproducible AI research.",
    badgeVariant: "purple",
    targetMode: "deepmimo",
    actionLabel: "Open in Lab",
  },
  {
    id: "radar",
    index: "06",
    label: "Radar Sensing",
    outcomeLabel: "ISAC & Radar",
    description:
      "Explore urban sensing, target dynamics, and clutter in 3D airspace.",
    badgeVariant: "pink",
    targetMode: "radar",
    actionLabel: "Open in Lab",
  },
];

export const QUICK_START_STEPS: readonly QuickStartStep[] = [
  {
    index: "01",
    title: "Clone",
    body: "Get the source repository.",
    code: {
      unix: "git clone https://github.com/HKUOpenSource/OpenAirTwin.git\ncd OpenAirTwin",
      windows:
        "git clone https://github.com/HKUOpenSource/OpenAirTwin.git\nSet-Location OpenAirTwin",
    },
  },
  {
    index: "02",
    title: "Install",
    body: "Set up environment and sample scene.",
    code: {
      unix: "python3 install.py --with-sample-scene",
      windows: "py -3.11 install.py --with-sample-scene",
    },
  },
  {
    index: "03",
    title: "Launch",
    body: "Start the local studio.",
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
