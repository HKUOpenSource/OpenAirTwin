export type ModeId = "map" | "link" | "mobility" | "radiomap" | "deepmimo";

export type VideoSource = {
  src: string;
  type?: string;
  label: string;
};

export type VideoAsset = {
  sources: VideoSource[];
  expectedPath: string;
  durationHint: string;
};

export type TutorialStep = {
  id: string;
  title: string;
  summary: string;
  video: VideoAsset;
  clicks: string[];
  parameters: string[];
  success: string[];
  warning: string;
};

export type TutorialMode = {
  id: ModeId;
  label: string;
  shortLabel: string;
  accent: string;
  summary: string;
  steps: TutorialStep[];
};

const video = (mode: ModeId, fileName: string, durationHint = "10-30 seconds"): VideoAsset => {
  const stem = fileName.replace(/\.(mp4|mov)$/i, "");

  return {
    sources: [
      { src: `media/tutorial/${mode}/${stem}.mp4`, type: "video/mp4", label: "MP4" },
    ],
    expectedPath: `website/public/media/tutorial/${mode}/${stem}.mp4`,
    durationHint,
  };
};

export const tutorialModes: TutorialMode[] = [
  {
    id: "map",
    label: "Map Selection",
    shortLabel: "Map",
    accent: "#1f6fff",
    summary: "Find a target location, select Open3DHK tiles, download missing tile assets, and load the selected scene.",
    steps: [
      {
        id: "search-location",
        title: "Search",
        summary: "Search and focus the target area.",
        video: video("map", "01-search.mp4"),
        clicks: [
          "Click the Place Search input in the left map panel.",
          "Type the target place keyword.",
          "Choose the matching result from the search list.",
        ],
        parameters: [
          "Use a short location keyword first, then refine from the result list.",
          "Keep the result panel open until the map has panned to the target campus area.",
        ],
        success: [
          "The map focuses on the target area.",
          "Nearby Open3DHK tile boundaries become easy to inspect.",
        ],
        warning: "Search is only a locator. Tiles still need to be selected and loaded before ray-tracing tools can run.",
      },
      {
        id: "select-tiles",
        title: "Select Tiles",
        summary: "Select only the tiles needed for this scene.",
        video: video("map", "02-select-tiles.mp4"),
        clicks: [
          "Click the focused target tile.",
          "Add adjacent tiles that cover the intended ROI area.",
          "Check the selected-tile badge before continuing.",
        ],
        parameters: [
          "Tile count controls scene size and loading cost.",
          "Select only the coverage required for the current experiment.",
        ],
        success: [
          "Selected tiles are visually highlighted.",
          "The selected-tile badge matches the intended coverage.",
        ],
        warning: "Selecting too many tiles makes later solver steps slower and harder to inspect.",
      },
      {
        id: "download-tile",
        title: "Download Tiles",
        summary: "Download missing Open3DHK tiles.",
        video: video("map", "03-download-tile.mp4"),
        clicks: [
          "Open the tile action panel.",
          "Click Download for unavailable selected tiles.",
          "Wait until every required tile is marked available.",
        ],
        parameters: [
          "Download status should finish before Load Selected is used.",
          "A stable network is needed only in the real platform, not on this tutorial website.",
        ],
        success: [
          "Every selected tile shows an available or ready state.",
          "The Load Selected action becomes the next natural step.",
        ],
        warning: "If one tile is still downloading, loading the scene may omit buildings from that tile.",
      },
      {
        id: "load-scene",
        title: "Load Scene",
        summary: "Load selected tiles into the 3D scene.",
        video: video("map", "04-load-scene.mp4"),
        clicks: [
          "Click Load Selected.",
          "Wait for geometry to appear in the 3D scene.",
          "Confirm the scene toolbar and mode controls are available.",
        ],
        parameters: [
          "Loaded tile count should match the selected-tile badge.",
          "A smaller initial scene is best for tutorial runs and debugging.",
        ],
        success: [
          "The 3D city scene appears.",
          "Tx/Rx placement and analysis mode controls are enabled.",
        ],
        warning: "If the scene looks empty, return to Map Selection and verify that selected tiles were downloaded first.",
      },
    ],
  },
  {
    id: "link",
    label: "Link Analysis",
    shortLabel: "Link",
    accent: "#0da6b8",
    summary: "Place Tx/Rx devices, tune ray-tracing and CIR options, solve the link, and inspect paths and channel output.",
    steps: [
      {
        id: "place-tx",
        title: "Place Tx",
        summary: "Place the transmitter in the 3D scene.",
        video: video("link", "01-place-tx.mp4"),
        clicks: [
          "Choose Add Tx from the bottom device action bar.",
          "Click the desired transmitter location in the 3D scene.",
          "Review or edit the Tx coordinate fields.",
        ],
        parameters: [
          "Tx height should clear nearby ground clutter.",
          "Coordinate edits are useful when a precise rooftop or street-level point is required.",
        ],
        success: [
          "A Tx marker appears in the scene.",
          "The parameter panel shows the selected Tx position.",
        ],
        warning: "A Tx outside the loaded tiles may produce no useful propagation paths.",
      },
      {
        id: "place-rx",
        title: "Place Rx",
        summary: "Place the receiver and confirm endpoints.",
        video: video("link", "02-place-rx.mp4"),
        clicks: [
          "Choose Add Rx from the device action bar.",
          "Click the receiver location in the scene.",
          "Confirm both Tx and Rx markers are visible.",
        ],
        parameters: [
          "Rx height usually represents handset, sensor, or base-station receiver height.",
          "The Tx/Rx separation should remain inside the loaded geometry area.",
        ],
        success: [
          "A Rx marker appears and the link endpoint list is complete.",
          "The Solve Link button is ready once required parameters are valid.",
        ],
        warning: "If Rx is hidden behind the parameter drawer, rotate or pan the scene before placing it.",
      },
      {
        id: "configure-solver-cir",
        title: "Tune Solver and CIR",
        summary: "Tune solver, propagation, and CIR settings.",
        video: video("link", "03-configure-solver-cir.mp4"),
        clicks: [
          "Open the physical layer, antenna, propagation, solver, and channel output groups.",
          "Edit frequency, bandwidth, max depth, sample count, and CIR tap range.",
          "Enable or disable LoS, specular, diffuse, diffraction, and refraction options as needed.",
        ],
        parameters: [
          "Carrier frequency and bandwidth define the channel configuration.",
          "Max depth and samples control ray search quality and runtime.",
          "Compute CIR must be enabled when tap-level channel output is needed.",
        ],
        success: [
          "The edited values remain visible in the right parameter panel.",
          "The selected solver budget matches the desired speed and fidelity tradeoff.",
        ],
        warning: "Large sample counts and deep reflection settings can be expensive on non-GPU machines.",
      },
      {
        id: "solve-inspect-results",
        title: "Solve and Inspect",
        summary: "Solve the link and inspect channel results.",
        video: video("link", "04-solve-inspect-results.mp4"),
        clicks: [
          "Click Solve Link.",
          "Wait for the job status to complete.",
          "Open the path list and CIR/tap result panel.",
        ],
        parameters: [
          "Compare received power and strongest path before changing solver settings.",
          "Use path delay and interaction type to understand dominant propagation mechanisms.",
        ],
        success: [
          "Ray paths are drawn between Tx and Rx.",
          "The result panel reports received power, path count, path details, and CIR/tap values.",
        ],
        warning: "No paths usually means endpoints, loaded tiles, or solver constraints need to be checked first.",
      },
    ],
  },
  {
    id: "mobility",
    label: "Mobility",
    shortLabel: "Move",
    accent: "#d87016",
    summary: "Build a moving receiver route, use Enter from scene focus to add waypoints, run mobility, and play the timeline.",
    steps: [
      {
        id: "set-tx",
        title: "Set Tx",
        summary: "Place the fixed transmitter for the route.",
        video: video("mobility", "01-set-tx.mp4"),
        clicks: [
          "Open Mobility mode.",
          "Choose Add Tx from the device action bar.",
          "Click the transmitter position in the scene.",
        ],
        parameters: [
          "The Tx remains fixed while Rx samples move along the route.",
          "Use a loaded scene that covers the full planned trajectory.",
        ],
        success: [
          "A Tx marker is visible.",
          "Mobility route controls become the focus of the right panel.",
        ],
        warning: "The mobility route should not leave the loaded tile area.",
      },
      {
        id: "add-rx-waypoints-enter",
        title: "Add Rx Waypoints with Enter",
        summary: "Add Rx waypoints with the Enter shortcut.",
        video: video("mobility", "02-add-rx-waypoints-enter.mp4"),
        clicks: [
          "Choose Add Current Rx or click a scene point for the receiver.",
          "Move focus back to the scene or another non-editable surface.",
          "Press Enter to append the current Rx position as a waypoint.",
        ],
        parameters: [
          "Enter adds a waypoint only when focus is not inside an input or select field.",
          "Use the waypoint list to verify order and coordinates after each Enter press.",
        ],
        success: [
          "A new waypoint appears in the route list.",
          "The scene route line updates after each added point.",
        ],
        warning: "If the cursor is inside a parameter input, Enter edits/submits that field instead of adding a waypoint.",
      },
      {
        id: "tune-trajectory-sampling",
        title: "Tune Trajectory Sampling",
        summary: "Tune velocity, time step, and sample limits.",
        video: video("mobility", "03-tune-trajectory-sampling.mp4"),
        clicks: [
          "Open mobility parameters.",
          "Edit velocity, time step, and max steps.",
          "Review the estimated sample count before running.",
        ],
        parameters: [
          "Velocity changes travel time along the waypoint route.",
          "Time step controls temporal sampling resolution.",
          "Max steps caps long routes and protects runtime.",
        ],
        success: [
          "The estimated sample count is reasonable.",
          "Run Mobility is available with the selected route and parameters.",
        ],
        warning: "Very small time steps can create many samples and long solve times.",
      },
      {
        id: "run-playback-timeline",
        title: "Run and Play Timeline",
        summary: "Run mobility and scrub the result timeline.",
        video: video("mobility", "04-run-playback-timeline.mp4"),
        clicks: [
          "Click Run Mobility.",
          "Wait for the job to complete.",
          "Use play, pause, and scrub controls on the timeline.",
        ],
        parameters: [
          "Timeline playback should match the route order.",
          "Inspect received power or path changes at specific time samples.",
        ],
        success: [
          "The receiver marker animates along the route.",
          "Timeline values and result panels update with the selected time sample.",
        ],
        warning: "If playback looks static, confirm that more than one waypoint and more than one time sample were generated.",
      },
    ],
  },
  {
    id: "radiomap",
    label: "Radio Map",
    shortLabel: "RMap",
    accent: "#16a36a",
    summary: "Place a transmitter, configure the map patch and resolution, run the heatmap, and interpret the colorbar.",
    steps: [
      {
        id: "place-tx",
        title: "Place Tx",
        summary: "Place the transmitter for the heatmap.",
        video: video("radiomap", "01-place-tx.mp4"),
        clicks: [
          "Open Radio Map mode.",
          "Choose Add Tx.",
          "Click the transmitter position in the 3D scene.",
        ],
        parameters: [
          "Tx location and height strongly affect heatmap shape.",
          "Keep Tx inside or near the intended patch area.",
        ],
        success: [
          "A Tx marker is visible.",
          "Patch and radio-map controls are ready to configure.",
        ],
        warning: "Changing Tx after a solve requires running the radio map again.",
      },
      {
        id: "configure-patch",
        title: "Configure Patch",
        summary: "Set patch size, center, and receiver height.",
        video: video("radiomap", "02-configure-patch.mp4"),
        clicks: [
          "Open patch controls.",
          "Edit patch width, depth, center, and receiver height.",
          "Confirm the patch overlay covers the intended study area.",
        ],
        parameters: [
          "Patch size determines spatial coverage.",
          "Receiver height should match the scenario, such as pedestrian or rooftop measurements.",
        ],
        success: [
          "The patch overlay matches the target area.",
          "The receiver plane height is visible in the parameter panel.",
        ],
        warning: "A patch outside loaded tiles may produce empty or misleading heatmap regions.",
      },
      {
        id: "configure-resolution-display",
        title: "Configure Resolution and Display",
        summary: "Set grid resolution and display controls.",
        video: video("radiomap", "03-configure-resolution-display.mp4"),
        clicks: [
          "Edit cell size and density.",
          "Choose colormap and color limits.",
          "Set sample count for the ray search.",
        ],
        parameters: [
          "Smaller cell size gives finer maps but more receiver samples.",
          "Color limits should make weak and strong coverage regions distinguishable.",
          "Sample count controls solver quality and runtime.",
        ],
        success: [
          "The predicted receiver-grid size is acceptable.",
          "Colorbar limits are set before the job starts.",
        ],
        warning: "Overly dense grids can make a small tutorial scene feel unresponsive.",
      },
      {
        id: "run-radiomap",
        title: "Run Radiomap",
        summary: "Run the map and inspect heatmap results.",
        video: video("radiomap", "04-run-heatmap.mp4"),
        clicks: [
          "Click Run Radio Map.",
          "Wait for progress to complete.",
          "Inspect the heatmap overlay and colorbar result panel.",
        ],
        parameters: [
          "Read colorbar units before comparing maps.",
          "Compare map resolution against the configured cell size and patch dimensions.",
        ],
        success: [
          "A heatmap appears on the configured patch.",
          "The result panel reports grid resolution, min/max values, and runtime notes.",
        ],
        warning: "If the map is noisy or sparse, increase samples only after confirming patch size and cell size.",
      },
    ],
  },
  {
    id: "deepmimo",
    label: "DeepMIMO",
    shortLabel: "DMIMO",
    accent: "#7a3ff2",
    summary: "Define a transmitter and receiver ROI, tune grid/export settings, and generate a DeepMIMO dataset.",
    steps: [
      {
        id: "set-tx",
        title: "Set Tx",
        summary: "Choose the transmitter for dataset export.",
        video: video("deepmimo", "01-set-tx.mp4"),
        clicks: [
          "Open DeepMIMO mode.",
          "Choose Add Tx.",
          "Click or edit the transmitter position.",
        ],
        parameters: [
          "Tx position is exported as part of the generated scenario.",
          "Use a position with clear relation to the planned receiver area.",
        ],
        success: [
          "The Tx marker appears.",
          "ROI tools and export settings are available.",
        ],
        warning: "Changing the Tx later changes the dataset definition and requires a new export.",
      },
      {
        id: "draw-roi",
        title: "Draw ROI",
        summary: "Draw the receiver ROI on the scene.",
        video: video("deepmimo", "02-draw-roi.mp4"),
        clicks: [
          "Select Draw ROI.",
          "Drag across the intended receiver area.",
          "Adjust the ROI box until it covers the desired users.",
        ],
        parameters: [
          "ROI dimensions define where receivers are generated.",
          "The ROI should stay inside loaded geometry coverage.",
        ],
        success: [
          "A visible ROI box is shown in the scene.",
          "The receiver estimate updates from the ROI size and grid settings.",
        ],
        warning: "A large ROI with a tight receiver grid can create a very large dataset.",
      },
      {
        id: "configure-receiver-grid",
        title: "Configure Receiver Grid",
        summary: "Set receiver grid and export options.",
        video: video("deepmimo", "03-configure-receiver-grid.mp4"),
        clicks: [
          "Open receiver grid and export groups.",
          "Edit receiver spacing, rows, columns, height, and max receivers.",
          "Choose the export format and channel options.",
        ],
        parameters: [
          "Receiver spacing controls dataset density.",
          "Max receivers protects export size.",
          "Export format should match the downstream DeepMIMO workflow.",
        ],
        success: [
          "The receiver estimate is visible and acceptable.",
          "Export settings show the intended format and channel fields.",
        ],
        warning: "Do not export until the receiver estimate is small enough for the target machine and storage budget.",
      },
      {
        id: "export-dataset-tray",
        title: "Export Dataset",
        summary: "Export the dataset and open the tray.",
        video: video("deepmimo", "04-export-dataset-tray.mp4"),
        clicks: [
          "Click Export DeepMIMO Dataset.",
          "Wait for the export job to finish.",
          "Open the dataset tray and inspect the generated item.",
        ],
        parameters: [
          "Dataset name, receiver count, and format should match the configured export.",
          "Use the tray to download or inspect completed datasets.",
        ],
        success: [
          "The dataset tray opens with a completed export.",
          "The generated dataset reports receiver count, size, and status.",
        ],
        warning: "If the tray stays empty, confirm the ROI, receiver estimate, and export job status first.",
      },
    ],
  },
];

export const quickStart = [
  {
    title: "Clone the main repository",
    body: "Start from the official OpenAirTwin repository, then enter the project folder.",
    code: "git clone https://github.com/HKUOpenSource/OpenAirTwin.git\ncd OpenAirTwin",
  },
  {
    title: "Install the runtime",
    body: "Run the installer from the project root to create the local environment.",
    code: "python install.py",
  },
  {
    title: "Start and open",
    body: "Load the generated environment variables, start the backend, and open the web UI.",
    code: "set -a; . ./.oat-env; set +a\n./.venv/bin/python -m backend.server\n# http://127.0.0.1:8090",
  },
];

export const featureItems: Array<{
  modeId: ModeId;
  title: string;
  body: string;
  image: string;
  bullets: string[];
}> = [
  {
    modeId: "map",
    title: "Map Selection",
    body: "Find a location, select Open3DHK tiles, download missing assets, and load a focused city scene.",
    image: "feature-map-selection.png",
    bullets: ["Place search and tile focus", "Download and load selected tiles", "Focused scenes for faster analysis"],
  },
  {
    modeId: "link",
    title: "Link Analysis",
    body: "Place Tx/Rx devices, tune propagation settings, solve paths, and inspect link-level channel output.",
    image: "feature-link-analysis.png",
    bullets: ["Tx/Rx placement", "Solver and CIR parameters", "Paths, power, and channel taps"],
  },
  {
    modeId: "mobility",
    title: "Mobility",
    body: "Build receiver routes, add waypoints, run mobility jobs, and review channel changes over time.",
    image: "feature-mobility-analysis.gif",
    bullets: ["Waypoint route authoring", "Enter-key waypoint shortcut", "Timeline playback for moving receivers"],
  },
  {
    modeId: "radiomap",
    title: "Radio Map",
    body: "Configure a receiver patch and compute coverage heatmaps with resolution and colorbar controls.",
    image: "feature-radio-map.png",
    bullets: ["Patch and receiver-plane setup", "Resolution and sample controls", "Heatmap and colorbar output"],
  },
  {
    modeId: "deepmimo",
    title: "DeepMIMO",
    body: "Draw a receiver ROI, configure the grid, and export structured datasets for wireless ML workflows.",
    image: "feature-deepmimo-export.png",
    bullets: ["Tx and ROI definition", "Receiver grid controls", "Dataset tray and export status"],
  },
];
