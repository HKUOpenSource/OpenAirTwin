export type ModeId = "map" | "link" | "mobility" | "radiomap" | "deepmimo" | "radar";

export type TutorialFrame = {
  id: string;
  src: string;
  alt: string;
  width: number;
  height: number;
  pixelRatio: 2;
};

export type TutorialTarget = {
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
  zoom: number;
};

export type TutorialStep = {
  id: string;
  title: string;
  summary: string;
  instruction: string;
  frameId: string;
  kind: "action" | "observe";
  target: TutorialTarget;
  secondaryTargets?: TutorialTarget[];
  details: string[];
  success: string;
  note: string;
};

export type TutorialMode = {
  id: ModeId;
  label: string;
  shortLabel: string;
  accent: string;
  summary: string;
  frames: TutorialFrame[];
  steps: TutorialStep[];
};

const image = (
  id: string,
  src: string,
  alt: string,
  width = 4064,
  height = 2144,
): TutorialFrame => ({
  id,
  src: `media/tutorial/manual/${src}`,
  alt,
  width,
  height,
  pixelRatio: 2,
});

export const tutorialModes: TutorialMode[] = [
  {
    id: "map",
    label: "Map Selection",
    shortLabel: "Map",
    accent: "#2878ff",
    summary: "Move from place search to a loaded 3D city scene through four real interface states.",
    frames: [
      image(
        "search",
        "map-search.png",
        "OpenAirTwin map selection screen showing an HKU place search and the Hong Kong tile grid.",
      ),
      image(
        "selected",
        "map-selected.png",
        "OpenAirTwin map with four HKU scene tiles selected and ready to load.",
      ),
      image(
        "loading",
        "map-loading.png",
        "OpenAirTwin map showing the scene loading progress dialog.",
      ),
      image(
        "scene",
        "map-scene.png",
        "Loaded OpenAirTwin 3D Hong Kong scene with analysis controls available.",
      ),
    ],
    steps: [
      {
        id: "search-location",
        title: "Find the study area",
        summary: "Use place search to move the map to the intended campus or district.",
        instruction: "Select the highlighted search panel, then inspect how the result list identifies the target location.",
        frameId: "search",
        kind: "action",
        target: { label: "Place search", x: 0.047, y: 0.182, width: 0.155, height: 0.036, zoom: 1.7 },
        details: [
          "Start with a short place name such as HKU.",
          "Choose the matching result before selecting scene tiles.",
        ],
        success: "The map is centered on the target area and nearby scene tiles are visible.",
        note: "Search only changes the map location; it does not load 3D geometry.",
      },
      {
        id: "select-tiles",
        title: "Select scene tiles",
        summary: "Choose a compact group of tiles that covers the study area.",
        instruction: "Select the highlighted tile region and compare it with the selection summary in the lower-right corner.",
        frameId: "selected",
        kind: "action",
        target: { label: "Selected tiles", x: 0.388, y: 0.214, width: 0.335, height: 0.51, zoom: 1.55 },
        details: [
          "Selected tiles are shown in blue.",
          "Keep the tile count small enough for a responsive first experiment.",
        ],
        success: "Four tiles are selected and the summary reports the expected mesh count.",
        note: "Selecting a very large area increases download, rendering, and solver cost.",
      },
      {
        id: "download-tile",
        title: "Load the selected scene",
        summary: "OpenAirTwin retrieves the selected tile bundles and builds the scene.",
        instruction: "Inspect the highlighted progress dialog. This is an observation step; no extra click is required while loading runs.",
        frameId: "loading",
        kind: "observe",
        target: { label: "Loading progress", x: 0.374, y: 0.458, width: 0.255, height: 0.092, zoom: 1.65 },
        details: [
          "The dialog reports how many selected tiles are being loaded.",
          "Keep the page open until geometry preparation finishes.",
        ],
        success: "The loading dialog closes and the 3D scene replaces the map.",
        note: "A missing or incomplete tile can leave gaps in later propagation results.",
      },
      {
        id: "load-scene",
        title: "Verify the 3D scene",
        summary: "Confirm that geometry, analysis controls, and scene navigation are ready.",
        instruction: "Select the highlighted action bar to see where Tx/Rx placement and analysis commands become available.",
        frameId: "scene",
        kind: "observe",
        target: { label: "Analysis controls", x: 0.396, y: 0.852, width: 0.209, height: 0.055, zoom: 1.65 },
        details: [
          "Orbit the scene before placing devices.",
          "Choose the analysis mode from the left configuration panel.",
        ],
        success: "The city model is visible and the bottom action bar is enabled.",
        note: "If the scene is empty, return to Map Selection and verify the selected tiles.",
      },
    ],
  },
  {
    id: "link",
    label: "Link Analysis",
    shortLabel: "Link",
    accent: "#0b9fb2",
    summary: "Place a radio link, configure propagation, solve it, and interpret paths and channel taps.",
    frames: [
      image(
        "link-results",
        "link.png",
        "OpenAirTwin Link Analysis scene showing traced paths and the path gains and channel taps result panel.",
      ),
    ],
    steps: [
      {
        id: "place-tx",
        title: "Place the transmitter",
        summary: "Choose Tx and position the transmitter in the loaded scene.",
        instruction: "Select the highlighted Tx control. In the application, the next scene click places the transmitter.",
        frameId: "link-results",
        kind: "action",
        target: { label: "Tx", x: 0.396, y: 0.859, width: 0.045, height: 0.045, zoom: 1.75 },
        details: ["Use a rooftop or street-level position that matches the experiment.", "Keep Tx inside loaded geometry."],
        success: "A blue Tx marker appears and its coordinates are available in the configuration panel.",
        note: "An endpoint outside the loaded area may produce no useful paths.",
      },
      {
        id: "place-rx",
        title: "Place the receiver",
        summary: "Add the second endpoint and check the link geometry.",
        instruction: "Select the highlighted Rx control, then compare the two endpoint positions in the scene.",
        frameId: "link-results",
        kind: "action",
        target: { label: "Rx", x: 0.444, y: 0.859, width: 0.043, height: 0.045, zoom: 1.75 },
        details: ["Rx can represent a handset, sensor, or base station.", "The two endpoints should remain within the scene."],
        success: "Both endpoints are visible and Solve Link becomes available.",
        note: "Rotate the scene if a building or panel hides the intended receiver location.",
      },
      {
        id: "configure-solver-cir",
        title: "Configure the link",
        summary: "Set physical-layer, antenna, propagation, solver, and channel-output options.",
        instruction: "Review the highlighted Propagation Solver settings, then select Solve Link to run the analysis.",
        frameId: "link-results",
        kind: "action",
        target: { label: "Propagation Solver", x: 0.047, y: 0.323, width: 0.198, height: 0.377, zoom: 1.6 },
        secondaryTargets: [
          { label: "Solve Link", x: 0.536, y: 0.859, width: 0.064, height: 0.045, zoom: 1.75 },
        ],
        details: ["Frequency and bandwidth define the channel.", "Samples and path depth control the speed–quality trade-off."],
        success: "The selected settings remain valid and the Solve Link command is ready.",
        note: "High sample counts and deep interactions can be expensive without a GPU.",
      },
      {
        id: "solve-inspect-results",
        title: "Inspect link results",
        summary: "Read path gain, interaction types, delays, and discrete channel taps.",
        instruction: "Select the highlighted results dock and inspect the summary, path list, and power-delay profile.",
        frameId: "link-results",
        kind: "observe",
        target: { label: "Link results", x: 0.776, y: 0.101, width: 0.184, height: 0.672, zoom: 1.45 },
        details: ["Compare total and strongest path gain first.", "Use the path list to identify reflection, refraction, and mixed interactions."],
        success: "The scene shows traced paths while the result dock reports seven paths and channel taps.",
        note: "No paths usually indicates an endpoint, scene coverage, or solver-constraint problem.",
      },
    ],
  },
  {
    id: "mobility",
    label: "Mobility",
    shortLabel: "Move",
    accent: "#df7a23",
    summary: "Create a receiver trajectory, tune temporal sampling, and run a channel sequence.",
    frames: [
      image(
        "mobility-results",
        "mobility.png",
        "OpenAirTwin Mobility Analysis scene showing receiver waypoints, trajectory paths, playback controls, and channel results.",
        4064,
        2144,
      ),
    ],
    steps: [
      {
        id: "set-tx",
        title: "Set the fixed transmitter",
        summary: "Place the stationary endpoint for the mobility experiment.",
        instruction: "Select the highlighted Tx control and choose a position that can cover the planned route.",
        frameId: "mobility-results",
        kind: "action",
        target: { label: "Tx", x: 0.399, y: 0.859, width: 0.044, height: 0.045, zoom: 1.75 },
        details: ["The transmitter stays fixed while Rx moves.", "Load geometry for the entire intended route."],
        success: "The Tx marker is visible and trajectory controls are available.",
        note: "Do not let the planned route leave the loaded tile area.",
      },
      {
        id: "add-rx-waypoints-enter",
        title: "Build the Rx trajectory",
        summary: "Append receiver positions in travel order.",
        instruction: "Review the highlighted waypoint list, then select Rx to add the next receiver position.",
        frameId: "mobility-results",
        kind: "action",
        target: { label: "Add Current Rx", x: 0.052, y: 0.376, width: 0.093, height: 0.025, zoom: 1.8 },
        secondaryTargets: [
          { label: "Rx", x: 0.444, y: 0.859, width: 0.043, height: 0.045, zoom: 1.75 },
        ],
        details: ["Add Current Rx stores the current receiver position.", "Enter can append a waypoint when focus is outside an input."],
        success: "The waypoint list and the colored scene trajectory update together.",
        note: "Pressing Enter inside a field edits that field instead of adding a waypoint.",
      },
      {
        id: "tune-trajectory-sampling",
        title: "Configure and run mobility",
        summary: "Set the temporal sampling, then solve the complete receiver route.",
        instruction: "Review velocity, time step, and maximum steps in the trajectory panel, then select the highlighted Run Mobility control.",
        frameId: "mobility-results",
        kind: "action",
        target: { label: "Run Mobility", x: 0.538, y: 0.859, width: 0.064, height: 0.045, zoom: 1.75 },
        details: ["A smaller time step produces denser temporal samples.", "Run Mobility solves every sampled receiver position along the route."],
        success: "The route is solved and the timeline and channel-result panels become available.",
        note: "Very small time steps can create unnecessarily large jobs.",
      },
      {
        id: "run-playback-timeline",
        title: "Inspect mobility results",
        summary: "Explore how path gain, propagation paths, and channel taps change along the route.",
        instruction: "Select the highlighted results panel, move through the mobility timeline, and compare each sample with the paths in the scene.",
        frameId: "mobility-results",
        kind: "observe",
        target: { label: "Mobility results", x: 0.776, y: 0.1, width: 0.185, height: 0.738, zoom: 1.45 },
        details: ["The timeline shows path gain over time and selects the current receiver sample.", "The path list and power-delay profile describe the channel at that sample."],
        success: "The selected timeline sample matches the displayed propagation paths and channel taps.",
        note: "Compare samples at peaks and fades to understand how the route changes the channel.",
      },
    ],
  },
  {
    id: "radiomap",
    label: "Radio Map",
    shortLabel: "RMap",
    accent: "#17a36b",
    summary: "Configure a terrain patch and visualize received power across the scene.",
    frames: [
      image(
        "radiomap-results",
        "radiomap.png",
        "OpenAirTwin Radio Map scene showing a colored terrain heatmap and path gain result panel.",
      ),
    ],
    steps: [
      {
        id: "place-tx",
        title: "Place the transmitter",
        summary: "Set the radio source for the coverage calculation.",
        instruction: "Select the highlighted Tx control and place the transmitter near the intended patch.",
        frameId: "radiomap-results",
        kind: "action",
        target: { label: "Tx", x: 0.422, y: 0.859, width: 0.044, height: 0.045, zoom: 1.75 },
        details: ["Tx position and height shape the heatmap.", "Keep the source inside or near the patch."],
        success: "The transmitter marker appears and patch settings are available.",
        note: "Moving Tx invalidates the current heatmap and requires a new run.",
      },
      {
        id: "configure-patch",
        title: "Configure the terrain patch",
        summary: "Set the coverage area, receiver height, grid density, and display range.",
        instruction: "Select the highlighted Terrain Patch panel and review its area, resolution, and display settings.",
        frameId: "radiomap-results",
        kind: "action",
        target: { label: "Terrain Patch settings", x: 0.047, y: 0.374, width: 0.199, height: 0.284, zoom: 1.62 },
        details: ["Patch size and height define the receiver area.", "Grid density and color limits control resolution and display."],
        success: "The terrain patch, sampling density, and color range are ready.",
        note: "Large dense patches can increase solve time and memory use.",
      },
      {
        id: "run-radiomap",
        title: "Run Map",
        summary: "Start the radio-map calculation with the configured terrain patch.",
        instruction: "Select the highlighted Run Map control to calculate the coverage grid.",
        frameId: "radiomap-results",
        kind: "action",
        target: { label: "Run Map", x: 0.514, y: 0.859, width: 0.064, height: 0.045, zoom: 1.75 },
        details: ["The solver evaluates the configured receiver grid.", "The result appears on the terrain when the run succeeds."],
        success: "The terrain coverage overlay and result panel are available.",
        note: "Re-run the map after changing the transmitter or patch settings.",
      },
      {
        id: "inspect-radiomap-results",
        title: "Inspect radio map results",
        summary: "Read the heatmap together with grid, range, and scale metadata.",
        instruction: "Select the highlighted results dock and compare its colorbar with the 3D terrain overlay.",
        frameId: "radiomap-results",
        kind: "observe",
        target: { label: "Radio map results", x: 0.777, y: 0.101, width: 0.185, height: 0.435, zoom: 1.48 },
        details: ["The displayed metric is path gain in dB.", "Resolution and sample count explain the visual detail."],
        success: "A colored terrain grid is visible and the result dock reports a successful run.",
        note: "Check units and display limits before comparing different maps.",
      },
    ],
  },
  {
    id: "deepmimo",
    label: "DeepMIMO",
    shortLabel: "DMIMO",
    accent: "#7b4ce6",
    summary: "Define a receiver region and export a propagation dataset for learning workflows.",
    frames: [
      image(
        "deepmimo-results",
        "deepmimo.png",
        "OpenAirTwin DeepMIMO scene showing a receiver ROI, export parameters, and generated dataset tray.",
      ),
    ],
    steps: [
      {
        id: "set-tx",
        title: "Set the dataset transmitter",
        summary: "Choose the source that will be paired with generated receiver samples.",
        instruction: "Select the highlighted Tx control and place the source relative to the intended ROI.",
        frameId: "deepmimo-results",
        kind: "action",
        target: { label: "Tx", x: 0.36, y: 0.86, width: 0.044, height: 0.047, zoom: 1.75 },
        details: ["Tx position becomes part of the exported scenario.", "Use a reproducible position."],
        success: "The source is defined and ROI tools become available.",
        note: "Changing Tx changes the dataset definition.",
      },
      {
        id: "draw-roi",
        title: "Draw the receiver ROI",
        summary: "Mark the region where candidate receivers will be generated.",
        instruction: "Select the highlighted ROI overlay and inspect how it aligns with streets and buildings.",
        frameId: "deepmimo-results",
        kind: "action",
        target: { label: "Draw ROI", x: 0.404, y: 0.86, width: 0.058, height: 0.047, zoom: 1.8 },
        details: ["Draw ROI creates the initial rectangle.", "Adjust its size before tightening receiver spacing."],
        success: "A green ROI box covers the intended receiver area.",
        note: "A large region with tight spacing can create a very large dataset.",
      },
      {
        id: "configure-receiver-grid",
        title: "Configure the receiver grid",
        summary: "Set ROI dimensions, spacing, height, and export limits.",
        instruction: "Select the highlighted DeepMIMO ROI panel and review the candidate receiver estimate.",
        frameId: "deepmimo-results",
        kind: "action",
        target: { label: "ROI parameters", x: 0.047, y: 0.375, width: 0.199, height: 0.446, zoom: 1.62 },
        details: ["Rx Spacing controls dataset density.", "Max Receivers protects memory and storage budgets."],
        success: "The candidate estimate fits the intended experiment and machine.",
        note: "Review receiver count before starting an export.",
      },
      {
        id: "export-dataset-tray",
        title: "Export and download",
        summary: "Generate the dataset and retrieve it from the dataset tray.",
        instruction: "Select the highlighted Export Data control, then inspect the generated dataset card in the upper-right.",
        frameId: "deepmimo-results",
        kind: "action",
        target: { label: "Export Data", x: 0.574, y: 0.86, width: 0.063, height: 0.047, zoom: 1.75 },
        secondaryTargets: [
          { label: "Generated dataset", x: 0.773, y: 0.146, width: 0.187, height: 0.09, zoom: 1.5 },
        ],
        details: ["The tray records completed exports.", "Confirm scenario name and job status before downloading."],
        success: "The generated dataset appears in the tray with a Download action.",
        note: "An empty tray usually means the export is still running or the ROI is invalid.",
      },
    ],
  },
  {
    id: "radar",
    label: "Radar Sensing",
    shortLabel: "Radar",
    accent: "#d34b78",
    summary: "Configure radar geometry and moving targets, then inspect detections and range–Doppler output.",
    frames: [
      image(
        "radar-results",
        "radar.png",
        "OpenAirTwin Radar Sensing scene showing drone targets and range-Doppler detection results.",
      ),
    ],
    steps: [
      {
        id: "place-radar",
        title: "Place radar endpoints",
        summary: "Set Tx and Rx for monostatic or bistatic sensing.",
        instruction: "Select the highlighted Tx/Rx controls and place both radar endpoints in the scene.",
        frameId: "radar-results",
        kind: "action",
        target: { label: "Radar Tx / Rx", x: 0.397, y: 0.859, width: 0.09, height: 0.045, zoom: 1.72 },
        details: ["Co-located endpoints approximate monostatic sensing.", "Separated endpoints create bistatic geometry."],
        success: "Both radar endpoints are visible and target controls are enabled.",
        note: "Endpoint geometry changes target observability and clutter paths.",
      },
      {
        id: "add-targets",
        title: "Configure radar and targets",
        summary: "Set radar processing and define the drone targets, positions, and velocities.",
        instruction: "Select the highlighted configuration area to review Radar Geometry and Drone Targets together.",
        frameId: "radar-results",
        kind: "action",
        target: { label: "Radar and target configuration", x: 0.047, y: 0.218, width: 0.198, height: 0.69, zoom: 1.55 },
        details: ["Radar Geometry defines waveform and processing.", "Each target stores its model, position, velocity, and radar cross section."],
        success: "Radar settings are valid and three labeled drone targets are visible.",
        note: "Targets outside the useful range or field of view may not be detected.",
      },
      {
        id: "run-radar",
        title: "Run Radar",
        summary: "Start the sensing calculation with the configured radar and targets.",
        instruction: "Select the highlighted Run Radar control to calculate propagation and detections.",
        frameId: "radar-results",
        kind: "action",
        target: { label: "Run Radar", x: 0.536, y: 0.859, width: 0.064, height: 0.045, zoom: 1.75 },
        details: ["The solver evaluates target and clutter propagation.", "Detection results appear after the run completes."],
        success: "Radar detections and range-Doppler results are available.",
        note: "Larger waveforms and deeper propagation settings cost more.",
      },
      {
        id: "run-inspect-radar",
        title: "Inspect radar detections",
        summary: "Compare detections, propagation paths, SNR, and range–Doppler views.",
        instruction: "Select the highlighted result dock and compare target labels with the plotted detections.",
        frameId: "radar-results",
        kind: "observe",
        target: { label: "Radar results", x: 0.776, y: 0.101, width: 0.185, height: 0.737, zoom: 1.45 },
        details: ["Switch processing views to understand clutter cancellation.", "Use Target Detail for local range–Doppler peaks."],
        success: "Three associated detections appear with their target truth markers.",
        note: "No detection can be valid; inspect SNR and geometry before lowering thresholds.",
      },
    ],
  },
];

export type QuickStartStep = {
  title: string;
  body: string;
  code: {
    unix: string;
    windows: string;
  };
};

export const quickStart: QuickStartStep[] = [
  {
    title: "Get OpenAirTwin",
    body: "Clone the official repository.",
    code: {
      unix: "git clone https://github.com/HKUOpenSource/OpenAirTwin.git\ncd OpenAirTwin",
      windows: "git clone https://github.com/HKUOpenSource/OpenAirTwin.git\ncd OpenAirTwin",
    },
  },
  {
    title: "Install with the sample scene",
    body: "Create the local environment and download the bundled tutorial scene.",
    code: {
      unix: "python3 install.py --with-sample-scene",
      windows: "py -3.11 install.py --with-sample-scene",
    },
  },
  {
    title: "Start and open",
    body: "Start the backend and open the web UI.",
    code: {
      unix: "set -a; . ./.oat-env; set +a\n./.venv/bin/python -m backend.server\n# http://127.0.0.1:8090",
      windows: ". .\\.oat-env.ps1\n.\\.venv\\Scripts\\python.exe -m backend.server\n# http://127.0.0.1:8090",
    },
  },
];

export const featureItems: Array<{
  modeId: ModeId;
  title: string;
  body: string;
  image: string;
  mediaType?: "image" | "video";
}> = [
  {
    modeId: "map",
    title: "Map Selection",
    body: "Automate wireless digital twin scene construction by converting city-scale information across Hong Kong into analysis-ready 3D environments.",
    image: "feature-map-selection.png",
  },
  {
    modeId: "link",
    title: "Link Analysis",
    body: "Explore propagation paths, received power, and channel taps directly on the 3D city model for fast, visual link-level insight.",
    image: "feature-link-analysis.png",
  },
  {
    modeId: "mobility",
    title: "Mobility",
    body: "Analyze receiver mobility across realistic urban routes and visualize how channel behavior evolves along the trajectory.",
    image: "feature-mobility-analysis.mp4",
    mediaType: "video",
  },
  {
    modeId: "radiomap",
    title: "Radio Map",
    body: "Generate coverage radio maps that make signal strength visible across complex urban environments.",
    image: "feature-radio-map.png",
  },
  {
    modeId: "deepmimo",
    title: "DeepMIMO",
    body: "Create DeepMIMO datasets from selected urban regions, connecting wireless digital twins with AI-driven wireless research.",
    image: "feature-deepmimo-export.png",
  },
  {
    modeId: "radar",
    title: "Radar Sensing",
    body: "Place moving drone targets and compare propagation-aware detections, paths, and range–Doppler processing inside the same digital twin.",
    image: "feature-radar-sensing.png",
  },
];
