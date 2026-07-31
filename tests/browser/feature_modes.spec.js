import {mkdirSync, readFileSync, writeFileSync} from "node:fs";
import {fileURLToPath} from "node:url";

import {expect, test} from "@playwright/test";

import {
  buildPhase1DomCompatibilityContract,
  PHASE8_RETIRED_CLASSES,
  PHASE8_RETIRED_ELEMENT_IDS,
  normalizePhase8DomContract,
} from "./phase1_contracts.js";

const PHASE0_BASELINE_DIRECTORY = new URL("./baselines/", import.meta.url);
const UPDATE_PHASE0_BASELINE = process.env.OAT_UPDATE_PHASE0_BASELINE === "1";
const PHASE1_DOM_CONTRACT = new URL("../../docs/ui/dom-compatibility-contract.json", import.meta.url);
const UPDATE_PHASE1_CONTRACT = process.env.OAT_UPDATE_PHASE1_CONTRACT === "1";

function phase0BaselineUrl(filename) {
  return new URL(filename, PHASE0_BASELINE_DIRECTORY);
}

function assertPhase0Baseline(filename, actual) {
  const url = phase0BaselineUrl(filename);
  if (UPDATE_PHASE0_BASELINE) {
    mkdirSync(fileURLToPath(PHASE0_BASELINE_DIRECTORY), {recursive: true});
    writeFileSync(url, `${JSON.stringify(actual, null, 2)}\n`, "utf8");
  }
  expect(actual).toEqual(JSON.parse(readFileSync(url, "utf8")));
}

function assertPhase0DomBaseline(actual) {
  const filename = "phase-0-dom-contract.json";
  const url = phase0BaselineUrl(filename);
  if (UPDATE_PHASE0_BASELINE) {
    assertPhase0Baseline(filename, actual);
    return;
  }
  const retiredClasses = new Set(PHASE8_RETIRED_CLASSES);
  const retiredElementIds = new Set(PHASE8_RETIRED_ELEMENT_IDS);
  expect(actual.elements.some(({id}) => retiredElementIds.has(id))).toBe(false);
  expect(actual.elements.some(({classes}) => classes.some((name) => retiredClasses.has(name)))).toBe(false);
  const expected = normalizePhase8DomContract(JSON.parse(readFileSync(url, "utf8")));
  const phase8Actual = normalizePhase8DomContract(actual);
  const normalized = {
    ...phase8Actual,
    elements: phase8Actual.elements.map((element, index) => {
      const baseline = expected.elements[index];
      expect(baseline).toBeDefined();
      expect(element.id).toBe(baseline.id);
      const addedClasses = element.classes.filter((className) => !baseline.classes.includes(className));
      expect(addedClasses.every((className) => className.startsWith("oat-"))).toBe(true);
      return {...element, classes: element.classes.filter((className) => baseline.classes.includes(className))};
    }),
  };
  expect(normalized.elements).toHaveLength(expected.elements.length);
  expect(normalized).toEqual(expected);
}

function assertPhase0NetworkBaseline(actual) {
  const filename = "phase-0-network-contract.json";
  if (UPDATE_PHASE0_BASELINE) {
    assertPhase0Baseline(filename, actual);
    return;
  }
  const expected = JSON.parse(readFileSync(phase0BaselineUrl(filename), "utf8"));
  const stableFields = (records) => records.map(({contentLength: _contentLength, ...record}) => record);
  expect(actual.every(({contentLength}) => contentLength > 0)).toBe(true);
  if (actual.some(({path}) => path.startsWith("/workbench/assets/"))) {
    expect(actual.every(({status}) => status === 200)).toBe(true);
    expect(actual.some(({path}) => /^\/workbench\/assets\/css\/.+-[A-Za-z0-9_-]{8,}\.css$/.test(path))).toBe(true);
    expect(actual.some(({path}) => /^\/workbench\/assets\/.+-[A-Za-z0-9_-]{8,}\.js$/.test(path))).toBe(true);
    expect(actual.every(({path}) => !path.startsWith("/css/") && !path.startsWith("/js/"))).toBe(true);
    return;
  }
  expect(stableFields(actual)).toEqual(stableFields(expected));
}

function assertPhase0ComputedStyleBaseline(actual) {
  const filename = "phase-0-computed-styles.json";
  if (UPDATE_PHASE0_BASELINE) {
    assertPhase0Baseline(filename, actual);
    return;
  }
  const expected = JSON.parse(readFileSync(phase0BaselineUrl(filename), "utf8"));
  const addedTokens = Object.keys(actual.tokens).filter((name) => !(name in expected.tokens));
  expect(addedTokens.every((name) => name.startsWith("--oat-"))).toBe(true);
  const normalized = {
    ...actual,
    tokens: Object.fromEntries(Object.keys(expected.tokens).map((name) => [name, actual.tokens[name]])),
  };
  expect(normalized).toEqual(expected);
}

function writePhase0Observation(filename, actual) {
  if (!UPDATE_PHASE0_BASELINE) return;
  mkdirSync(fileURLToPath(PHASE0_BASELINE_DIRECTORY), {recursive: true});
  writeFileSync(phase0BaselineUrl(filename), `${JSON.stringify(actual, null, 2)}\n`, "utf8");
}

function assertPhase1DomContract(actual) {
  if (UPDATE_PHASE1_CONTRACT) {
    mkdirSync(fileURLToPath(new URL("../../docs/ui/", import.meta.url)), {recursive: true});
    writeFileSync(PHASE1_DOM_CONTRACT, `${JSON.stringify(actual, null, 2)}\n`, "utf8");
  }
  expect(actual).toEqual(JSON.parse(readFileSync(PHASE1_DOM_CONTRACT, "utf8")));
}

const RT_CAPABILITIES = {
  ok: true,
  antenna_arrays: {
    defaults: {
      num_rows: 1,
      num_cols: 1,
      vertical_spacing: 0.5,
      horizontal_spacing: 0.5,
      pattern: "iso",
      polarization: "V",
    },
    limits: {
      num_rows: {min: 1, max: 16},
      num_cols: {min: 1, max: 16},
      vertical_spacing: {min: 0.01, max: 10},
      horizontal_spacing: {min: 0.01, max: 10},
    },
    patterns: ["iso"],
    polarizations: ["V"],
  },
};

const EMPTY_MANIFEST = {
  scene_id: "browser_fixture",
  mesh_count: 0,
  bundle_count: 0,
  tiles: [],
  bsdfs: {},
  integrity: {orphan_mesh_count: 0, orphan_mesh_samples: [], missing_mesh_count: 0, missing_mesh_samples: []},
  bundles: [],
};

const RADAR_PREVIEW_MANIFEST = {
  schema_version: 1,
  assets: [
    {id: "dji-air-2s", display_name: "DJI Air 2S", default_effective_rcs_m2: 0.01},
    {id: "dji-mavic-3-cine", display_name: "DJI Mavic 3 Cine", default_effective_rcs_m2: 0.01},
    {id: "dji-mini-3", display_name: "DJI Mini 3", default_effective_rcs_m2: 0.01},
    {id: "dji-mini-3-pro", display_name: "DJI Mini 3 Pro", default_effective_rcs_m2: 0.01},
  ].map((asset) => ({
    ...asset,
    visual: {format: "glb", url: "/assets/radar/drones/dji-mini-3/visual.glb"},
  })),
};

const PATH = {
  path_index: 0,
  type: "LOS",
  path_gain_db: -81.25,
  path_gain_linear: 7.5e-9,
  delay_ns: 24.5,
  path_length_m: 7.35,
  polyline: [[70, 35, 40], [90, 52, 2]],
};

const LINK_RESULT = {
  ok: true,
  summary: {received_power_db: -81.25, strongest_path_db: -81.25, valid_paths: 1, los_paths: 1},
  paths: [PATH],
  channel: null,
};

const MOBILITY_RESULT = {
  ok: true,
  summary: {
    step_count: 2,
    duration_s: 1,
    min_received_power_db: -83,
    max_received_power_db: -81,
    max_abs_doppler_hz: 12,
  },
  series: {time_s: [0, 1], received_power_db: [-81, -83]},
  samples: [
    {step_index: 0, time_s: 0, distance_m: 0, rx_position: [90, 52, 2], paths: [PATH], channel: null, summary: LINK_RESULT.summary},
    {step_index: 1, time_s: 1, distance_m: 2, rx_position: [92, 52, 2], paths: [PATH], channel: null, summary: LINK_RESULT.summary},
  ],
};

const RADIOMAP_RESULT = {
  metric: "path_gain",
  unit: "dB",
  surface: {
    resolution_mode: "cell_size_grid",
    grid_shape: [1, 1],
    grid_cell_count: 1,
    triangle_count: 1,
    requested_cell_size: 10,
    resolved_cell_size_x: 10,
    resolved_cell_size_y: 10,
    density_level: 2,
  },
  solver: {base_samples_per_tx: 1000, effective_samples_per_tx: 1000},
  range: {min: -95, max: -95},
  values: {count: 1, data: [-95]},
  geometry: {triangle_positions: [65, 30, 0.1, 75, 30, 0.1, 65, 40, 0.1]},
};

function radarResult(payload) {
  const rangeAxis = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120];
  const dopplerAxis = [-500, -250, 0, 250, 500];
  const detections = payload.targets.map((target, index) => ({
    detection_id: `det-${index}`,
    classification: "target",
    equivalent_range_m: 80 + index * 20,
    equivalent_radial_velocity_mps: index ? -4 : 5,
    doppler_hz: index ? 155 : -193,
    power_dbm: -72 + index,
    snr_db: 24 - index,
    arrival_azimuth_deg: 12 + index * 8,
    arrival_zenith_deg: 90,
    target_id: target.id,
    position_m: target.position,
  }));
  const paths = payload.targets.map((target, index) => ({
    path_id: `target-${index}`, classification: "target", target_ids: [target.id], delay_s: 5e-7,
    doppler_hz: detections[index].doppler_hz, path_gain_db: -90 - index, path_length_m: 160 + index * 40,
    equivalent_range_m: 80 + index * 20, departure_azimuth_deg: 0, departure_zenith_deg: 90,
    arrival_azimuth_deg: detections[index].arrival_azimuth_deg, arrival_zenith_deg: 90,
    polyline: [payload.tx.position, target.position, payload.rx.position],
  }));
  paths.push({path_id: "clutter-0", classification: "clutter", target_ids: [], delay_s: 4e-7, doppler_hz: 0, path_gain_db: -105, path_length_m: 120, equivalent_range_m: 60, departure_azimuth_deg: 0, departure_zenith_deg: 90, arrival_azimuth_deg: 180, arrival_zenith_deg: 90, polyline: [payload.tx.position, [50, 40, 2], payload.rx.position]});
  const powerDbm = dopplerAxis.map((_, row) => rangeAxis.map((__, column) => -118 + ((row + column) % 8)));
  powerDbm[1][8] = -72;
  powerDbm[3][10] = -74;
  const rangeDoppler = {equivalent_range_axis_m: rangeAxis, doppler_axis_hz: dopplerAxis, equivalent_radial_velocity_axis_mps: [12, 6, 0, -6, -12], power_dbm: powerDbm, source_shape: {doppler_bins: payload.waveform.num_symbols, range_bins: payload.waveform.num_subcarriers}, downsample_factor: {doppler: Math.ceil(payload.waveform.num_symbols / dopplerAxis.length), range: Math.ceil(payload.waveform.num_subcarriers / rangeAxis.length)}, truncated: true};
  const rangeDopplerFocus = {...rangeDoppler, source_offset: {doppler_bin: 0, range_bin: 0}, window: {equivalent_range_min_m: 0, equivalent_range_max_m: 120, doppler_min_hz: -500, doppler_max_hz: 500, auto_focus: true}};
  const processingView = (method, viewDetections, powerShift, peakSnrDb) => {
    const shiftedPower = powerDbm.map((row, rowIndex) => row.map((value) => value + powerShift - (rowIndex === 2 ? 18 : 0)));
    const shiftedRd = {...rangeDoppler, power_dbm: shiftedPower};
    return {
      method,
      detections: viewDetections,
      detection_summary: {
        total_detection_count: viewDetections.length,
        returned_detection_count: viewDetections.length,
        detections_truncated: false,
        target_detection_count: viewDetections.length,
        clutter_detection_count: 0,
        unassociated_detection_count: 0,
      },
      range_profile: {equivalent_range_axis_m: rangeAxis, power_dbm: rangeAxis.map((_, index) => -110 + index * 2 + powerShift)},
      range_doppler: shiftedRd,
      range_doppler_focus: {...rangeDopplerFocus, power_dbm: shiftedPower},
      peak_snr_db: peakSnrDb,
    };
  };
  return {
    schema_version: 1, scene_generation: 7,
    summary: {mode: payload.mode, target_count: payload.targets.length, total_detection_count: detections.length, returned_detection_count: detections.length, detections_truncated: false, total_target_path_count: payload.targets.length, total_clutter_path_count: 1, total_direct_path_count: 0, returned_path_count: paths.length, paths_truncated: false},
    radar: {mode: payload.mode, tx_position_m: payload.tx.position, rx_position_m: payload.rx.position, carrier_frequency_hz: payload.waveform.carrier_frequency_hz, bandwidth_hz: payload.waveform.bandwidth_hz, subcarrier_spacing_hz: payload.waveform.bandwidth_hz / payload.waveform.num_subcarriers, num_subcarriers: payload.waveform.num_subcarriers, num_symbols: payload.waveform.num_symbols},
    targets: payload.targets.map((target, index) => ({
      id: target.id,
      asset_id: target.asset_id,
      position_m: target.position,
      orientation_rad: target.orientation,
      velocity_mps: target.velocity,
      rcs_m2: target.rcs_m2,
      observability: {status: ["direct", "multipath", "blocked"][index % 3]},
    })),
    detections, paths,
    range_profile: {equivalent_range_axis_m: rangeAxis, power_dbm: rangeAxis.map((_, index) => -110 + index * 2)},
    range_doppler: rangeDoppler,
    range_doppler_focus: rangeDopplerFocus,
    processing_views: {
      mean_subtracted: processingView("slow_time_complex_mean_subtraction", detections.slice(0, 0), -8, 16),
      ideal_clutter_cancelled: processingView("ideal_coherent_known_clutter_subtraction", detections, -3, 28),
    },
    resolution: {equivalent_range_m: 1.17, doppler_hz: 488.3, equivalent_radial_velocity_mps: 12.62, max_unambiguous_equivalent_range_m: 1199, max_unambiguous_doppler_hz: 62500, max_unambiguous_equivalent_radial_velocity_mps: 1615},
    statistics: {solver_seconds: 0.2, processing_seconds: 0.03, total_seconds: 0.23, noise_power_dbm: -118, peak_snr_db: 24, raw_path_count: paths.length, returned_path_count: paths.length, processed_signal_path_count: paths.length, signal_paths_truncated: false, direct_path_cancellation_enabled: true, direct_path_cancellation_method: "ideal", cancelled_direct_path_count: 0, range_window: "hann", doppler_window: "hann", cfar_method: "CA-CFAR"},
  };
}

async function openDeterministicApp(page) {
  await page.route("**/api/rt/capabilities", (route) => route.fulfill({json: RT_CAPABILITIES}));
  await page.route("**/api/scene/manifest", (route) => route.fulfill({json: EMPTY_MANIFEST}));
  await page.route("**/assets/open3dhk_tile_coverage.json", (route) => route.fulfill({json: {tile_count: 0, tiles: []}}));
  await page.goto("/");
  await expect(page.locator("#loadingScreen")).toBeHidden();
  await page.evaluate(async () => {
    const {state} = await import("/js/app_state.js?v=20260723-radar-shared-groups");
    state.entry.visible = false;
    document.getElementById("entryScreen").classList.add("hidden");
    document.getElementById("entryScreen").setAttribute("aria-hidden", "true");
    const ui = document.getElementById("ui");
    ui.style.display = "flex";
    ui.inert = false;
    ui.setAttribute("aria-hidden", "false");
  });
}

async function activateMode(page, mode) {
  await page.evaluate((nextMode) => {
    document.getElementById("modeSelector").open = true;
    document.querySelector(`[data-mode="${nextMode}"]`).click();
  }, mode);
}

async function enableRealViewer(page) {
  await page.evaluate(async () => {
    const [{Viewer}, {state, viewerRef}] = await Promise.all([
      import("/js/viewer.js"),
      import("/js/app_state.js?v=20260723-radar-shared-groups"),
    ]);
    const viewer = new Viewer(document.getElementById("view"));
    viewer.__ready = true;
    viewer.loadedTileIds.add("fixture-tile");
    viewerRef.current = viewer;
    state.entry.visible = false;
    document.querySelector('[data-mode="mobility"]').click();
    document.querySelector('[data-mode="link"]').click();
  });
  await expect(page.locator("#deviceDock")).toBeVisible();
}

async function enableViewerStub(page) {
  await page.evaluate(async () => {
    const {state, viewerRef} = await import("/js/app_state.js?v=20260723-radar-shared-groups");
    viewerRef.current.__ready = true;
    viewerRef.current.loadedTileIds.add("fixture-tile");
    state.entry.visible = false;
    document.querySelector('[data-mode="mobility"]').click();
    document.querySelector('[data-mode="link"]').click();
  });
  await expect(page.locator("#deviceDock")).toBeVisible();
}

async function configureRadarFixture(page, {targets = true} = {}) {
  await page.evaluate(async (includeTargets) => {
    const {state} = await import("/js/app_state.js?v=20260723-radar-shared-groups");
    const radar = state.radar;
    radar.tx = [72, 32, 40];
    radar.txVisual = [...radar.tx];
    radar.rx = [72, 42, 40];
    radar.rxVisual = [...radar.rx];
    radar.targets = includeTargets ? [
      {id: "target-1", asset_id: "dji-mini-3", position: [100, 29, 47], orientation: [0, 0, 0.314159], velocity: [7.608452, 2.472136, 0], rcs_m2: 0.01},
      {id: "target-2", asset_id: "dji-air-2s", position: [126, 50, 54], orientation: [0, 0, -2.478368], velocity: [-10.24414, -8.003599, 0], rcs_m2: 0.018},
    ] : [];
    radar.nextTargetNumber = includeTargets ? 3 : 1;
    radar.selectedTargetId = includeTargets ? "target-1" : null;
  }, targets);
}

async function configureMainDeviceFixture(page) {
  await page.evaluate(async () => {
    const {state} = await import("/js/app_state.js?v=20260723-radar-shared-groups");
    const devices = {
      link: {tx: [72, 37, 40], rx: [90, 52, 1.5]},
      mobility: {tx: [72, 37, 40], rx: [90, 52, 1.5]},
      radiomap: {tx: [72, 37, 40]},
      deepmimo: {tx: [72, 37, 40]},
    };
    const inputGroups = {
      link: {tx: ["linkTxX", "linkTxY", "linkTxZ"], rx: ["linkRxX", "linkRxY", "linkRxZ"]},
      mobility: {tx: ["mobilityTxX", "mobilityTxY", "mobilityTxZ"], rx: ["mobilityRxX", "mobilityRxY", "mobilityRxZ"]},
      radiomap: {tx: ["rmTxX", "rmTxY", "rmTxZ"]},
      deepmimo: {tx: ["deepMimoTxX", "deepMimoTxY", "deepMimoTxZ"]},
    };
    for (const [mode, roles] of Object.entries(devices)) {
      for (const [role, position] of Object.entries(roles)) {
        state[mode][role] = [...position];
        state[mode][`${role}Visual`] = [...position];
        inputGroups[mode][role].forEach((id, index) => {
          document.getElementById(id).value = String(position[index]);
        });
      }
    }
    document.querySelector('[data-mode="mobility"]').click();
    document.querySelector('[data-mode="link"]').click();
  });
}

async function installPhase0ResourceProbe(page) {
  await page.addInitScript(() => {
    const probe = {
      listenerRegistrations: 0,
      activeIntervals: new Set(),
    };
    const addEventListener = EventTarget.prototype.addEventListener;
    EventTarget.prototype.addEventListener = function phase0AddEventListener(...args) {
      probe.listenerRegistrations += 1;
      return addEventListener.apply(this, args);
    };
    const setInterval = window.setInterval.bind(window);
    const clearInterval = window.clearInterval.bind(window);
    window.setInterval = (...args) => {
      const intervalId = setInterval(...args);
      probe.activeIntervals.add(intervalId);
      return intervalId;
    };
    window.clearInterval = (intervalId) => {
      probe.activeIntervals.delete(intervalId);
      return clearInterval(intervalId);
    };
    Object.defineProperty(window, "__oatPhase0ResourceProbe", {
      configurable: false,
      enumerable: false,
      value: probe,
      writable: false,
    });
  });
}

async function capturePhase0DomContract(page) {
  return page.evaluate(() => {
    const normalizeText = (value) => String(value || "").replace(/\s+/g, " ").trim();
    const elements = [...document.querySelectorAll("[id]")];
    return {
      document: {
        lang: document.documentElement.lang,
        title: document.title,
      },
      elements: elements.map((element, order) => {
        const attributes = Object.fromEntries(
          [...element.attributes]
            .filter(({name}) => (
              name.startsWith("aria-")
              || name.startsWith("data-mode")
              || [
                "autocomplete", "for", "href", "max", "min", "name", "placeholder",
                "role", "step", "tabindex", "title", "type",
              ].includes(name)
            ))
            .map(({name, value}) => [name, value])
            .sort(([left], [right]) => left.localeCompare(right)),
        );
        const labels = "labels" in element && element.labels
          ? [...element.labels].map((label) => normalizeText(label.textContent))
          : [];
        const contract = {
          id: element.id,
          order,
          tag: element.tagName.toLowerCase(),
          classes: [...element.classList],
          attributes,
        };
        if (labels.length) contract.labels = labels;
        if (element.matches("button, summary, option")) contract.text = normalizeText(element.textContent);
        if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
          contract.defaultValue = element.defaultValue;
          contract.defaultChecked = element.defaultChecked;
          contract.disabled = element.disabled;
        } else if (element instanceof HTMLSelectElement) {
          contract.defaultValue = [...element.options].find((option) => option.defaultSelected)?.value
            ?? element.options[0]?.value
            ?? "";
          contract.disabled = element.disabled;
        } else if (element instanceof HTMLButtonElement) {
          contract.disabled = element.disabled;
        } else if (element instanceof HTMLDetailsElement) {
          contract.open = element.open;
        }
        return contract;
      }),
    };
  });
}

async function capturePhase0ComputedStyles(page) {
  return page.evaluate(() => {
    const properties = [
      "align-items", "background-color", "border-bottom-color", "border-bottom-style",
      "border-bottom-width", "border-left-color", "border-left-style", "border-left-width",
      "border-radius", "border-right-color", "border-right-style", "border-right-width",
      "border-top-color", "border-top-style", "border-top-width", "box-shadow", "box-sizing",
      "color", "column-gap", "display", "flex-direction", "flex-wrap", "font-family", "font-size",
      "font-weight", "gap", "grid-template-columns", "height", "justify-content", "line-height",
      "margin-bottom", "margin-left", "margin-right", "margin-top", "max-height", "max-width",
      "min-height", "min-width", "opacity", "overflow-x", "overflow-y", "padding-bottom",
      "padding-left", "padding-right", "padding-top", "pointer-events", "position", "row-gap",
      "scrollbar-width", "text-align", "transition-duration", "transition-property", "width", "z-index",
    ];
    const targets = {
      badge: "#radarTargetCount",
      checkbox: "#radarModeMonostatic",
      collapsibleGroup: ".propagationSolverGroup",
      collapsibleSummary: ".propagationSolverGroup > summary",
      compactButton: "#btnEntrySearch",
      controlPanel: "#ui",
      controlScroll: "#uiBody",
      deviceDock: "#deviceDock",
      dialog: "#appDialogCard",
      entryPanel: "#entrySidebar",
      numberInput: "#cfgFrequency",
      performanceDock: "#performanceDock",
      primaryButton: "#btnEnterScene",
      radarField: "label[for='radarCarrierFrequency']",
      resultDock: "#linkChannelSection",
      scrollRegion: "#channelAnalysisScroll",
      select: "#txArrayPattern",
    };
    const components = Object.fromEntries(Object.entries(targets).map(([name, selector]) => {
      const element = document.querySelector(selector);
      if (!element) throw new Error(`Missing Phase 0 style target: ${selector}`);
      const style = getComputedStyle(element);
      return [name, {
        selector,
        styles: Object.fromEntries(properties.map((property) => [property, style.getPropertyValue(property)])),
      }];
    }));
    const rootStyle = getComputedStyle(document.documentElement);
    const tokens = Object.fromEntries(
      [...rootStyle]
        .filter((property) => property.startsWith("--oat-"))
        .sort()
        .map((property) => [property, rootStyle.getPropertyValue(property).trim()]),
    );
    return {components, tokens};
  });
}

async function capturePhase0ResourceSnapshot(page) {
  return page.evaluate(async () => {
    const {viewerRef} = await import("/js/app_state.js?v=20260723-radar-shared-groups");
    const probe = window.__oatPhase0ResourceProbe;
    return {
      activeIntervals: probe.activeIntervals.size,
      canvasElements: document.querySelectorAll("canvas").length,
      domNodes: document.querySelectorAll("*").length,
      frameListeners: viewerRef.current.frameListeners?.size ?? 0,
      listenerRegistrations: probe.listenerRegistrations,
      radarLabelElements: document.querySelectorAll(".radarTargetLabel, .radarTargetConnector").length,
    };
  });
}

test("core CSS modules load in order and expose the desktop computed-style contract", async ({page}) => {
  const cssResponses = [];
  page.on("response", (response) => {
    const url = new URL(response.url());
    if (url.pathname.startsWith("/css/") || url.pathname.startsWith("/workbench/assets/css/")) {
      cssResponses.push({path: url.pathname, status: response.status()});
    }
  });
  await openDeterministicApp(page);

  const architecture = await page.evaluate(() => {
    const sheets = [...document.styleSheets]
      .filter((sheet) => {
        const path = new URL(sheet.href).pathname;
        return path.startsWith("/css/") || path.startsWith("/workbench/assets/css/");
      });
    const style = (selector) => getComputedStyle(document.querySelector(selector));
    return {
      sheets: sheets.map((sheet) => ({
        path: new URL(sheet.href).pathname,
        rules: [...sheet.cssRules].map((rule) => rule.cssText.slice(0, 120)),
      })),
      controlWidth: style("#ui").width,
      controlRadius: style("#ui").borderRadius,
      bodyOverflowY: style("#uiBody").overflowY,
      accent: style(":root").getPropertyValue("--oat-accent-primary").trim(),
    };
  });
  const expectedPaths = [
    "/css/tokens.css", "/css/base.css", "/css/components.css", "/css/shell.css",
    "/css/entry-map.css", "/css/results.css", "/css/radar.css",
  ];
  const sourceName = (path) => {
    if (path.startsWith("/css/")) return path.slice("/css/".length);
    const match = path.match(/^\/workbench\/assets\/css\/(.+)-[A-Za-z0-9_-]{8,}\.css$/);
    return match ? `${match[1]}.css` : path;
  };
  const expectedNames = expectedPaths.map((path) => path.slice("/css/".length));
  expect(cssResponses.every(({status}) => status === 200)).toBe(true);
  expect(cssResponses.map(({path}) => sourceName(path)).sort()).toEqual([...expectedNames].sort());
  expect(architecture.sheets.map(({path}) => sourceName(path))).toEqual(expectedNames);
  expect(architecture.sheets.every(({rules}) => rules.length > 0)).toBe(true);
  const layerRules = architecture.sheets.map(({rules}) => rules.find((rule) => rule.startsWith("@layer ")));
  expect(layerRules[0]).toContain("@layer reset, tokens, base, components, layout, features, utilities");
  expect(layerRules.slice(1)).toEqual([
      expect.stringContaining("@layer reset"),
      expect.stringContaining("@layer components"),
      expect.stringContaining("@layer layout"),
      expect.stringContaining("@layer features"),
      expect.stringContaining("@layer features"),
      expect.stringContaining("@layer features"),
  ]);
  expect(architecture).toMatchObject({
    controlWidth: "430px",
    controlRadius: "18px",
    bodyOverflowY: "auto",
    accent: "#3478f6",
  });
});

test("phase 0 DOM, style, network and resource contracts remain frozen", async ({page, browserName}) => {
  await installPhase0ResourceProbe(page);
  const responseRecords = [];
  page.on("response", (response) => {
    const url = new URL(response.url());
    const isUiResource = ["/css/", "/js/", "/lib/", "/workbench/assets/"].some((prefix) => url.pathname.startsWith(prefix))
      || url.pathname === "/assets/openairtwin_logo.png"
      || url.pathname === "/assets/radar/drones/manifest.json";
    if (!isUiResource) return;
    responseRecords.push((async () => {
      const headers = await response.allHeaders();
      return {
        contentLength: Number(headers["content-length"] || 0),
        contentType: String(headers["content-type"] || "").split(";", 1)[0],
        path: url.pathname,
        resourceType: response.request().resourceType(),
        status: response.status(),
      };
    })());
  });

  const wallStartMs = Date.now();
  await openDeterministicApp(page);
  const uiReadyWallMs = Date.now() - wallStartMs;
  const domContract = await capturePhase0DomContract(page);
  const computedStyles = await capturePhase0ComputedStyles(page);
  await enableRealViewer(page);
  await configureMainDeviceFixture(page);

  const modes = ["link", "mobility", "radiomap", "deepmimo", "radar"];
  for (const mode of modes) await activateMode(page, mode);
  await activateMode(page, "link");
  const resourcesBefore = await capturePhase0ResourceSnapshot(page);
  for (let cycle = 0; cycle < 5; cycle += 1) {
    for (const mode of modes) await activateMode(page, mode);
  }
  await activateMode(page, "link");
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const resourcesAfter = await capturePhase0ResourceSnapshot(page);
  const resourceDelta = Object.fromEntries(
    Object.keys(resourcesBefore).map((key) => [key, resourcesAfter[key] - resourcesBefore[key]]),
  );
  expect(resourceDelta).toEqual({
    activeIntervals: 0,
    canvasElements: 0,
    domNodes: 0,
    frameListeners: 0,
    listenerRegistrations: 0,
    radarLabelElements: 0,
  });

  const networkContract = (await Promise.all(responseRecords))
    .sort((left, right) => left.path.localeCompare(right.path));
  const runtimeObservation = await page.evaluate(() => {
    const navigation = performance.getEntriesByType("navigation")[0];
    const paints = Object.fromEntries(
      performance.getEntriesByType("paint").map((entry) => [entry.name, Math.round(entry.startTime * 100) / 100]),
    );
    const resources = performance.getEntriesByType("resource");
    return {
      browser: {
        hardwareConcurrency: navigator.hardwareConcurrency,
        language: navigator.language,
        platform: navigator.platform,
        userAgent: navigator.userAgent,
      },
      memory: performance.memory ? {
        jsHeapSizeLimit: performance.memory.jsHeapSizeLimit,
        totalJSHeapSize: performance.memory.totalJSHeapSize,
        usedJSHeapSize: performance.memory.usedJSHeapSize,
      } : null,
      navigationMs: navigation ? {
        domComplete: Math.round(navigation.domComplete * 100) / 100,
        domContentLoaded: Math.round(navigation.domContentLoadedEventEnd * 100) / 100,
        loadEventEnd: Math.round(navigation.loadEventEnd * 100) / 100,
        responseEnd: Math.round(navigation.responseEnd * 100) / 100,
      } : null,
      paints,
      transfer: {
        decodedBodyBytes: resources.reduce((total, entry) => total + entry.decodedBodySize, 0),
        encodedBodyBytes: resources.reduce((total, entry) => total + entry.encodedBodySize, 0),
        resourceCount: resources.length,
        transferBytes: resources.reduce((total, entry) => total + entry.transferSize, 0),
      },
      viewport: {height: innerHeight, width: innerWidth},
    };
  });

  assertPhase0DomBaseline(domContract);
  assertPhase0ComputedStyleBaseline(computedStyles);
  assertPhase0NetworkBaseline(networkContract);
  assertPhase0Baseline("phase-0-resource-contract.json", {
    cycles: 5,
    modes,
    resourceDelta,
  });
  writePhase0Observation("phase-0-runtime-observation.json", {
    capturedAt: new Date().toISOString(),
    playwrightBrowser: browserName,
    resourcesAfter,
    resourcesBefore,
    runtime: runtimeObservation,
    uiReadyWallMs,
  });
});

test("phase 1 DOM ownership and interaction commands remain explicit", async ({page}) => {
  await openDeterministicApp(page);
  const phase0Contract = await capturePhase0DomContract(page);
  const contract = buildPhase1DomCompatibilityContract(phase0Contract);
  expect(contract.elements).toHaveLength(phase0Contract.elements.length);
  expect(contract.elements.every(({owner, compatibility}) => owner && compatibility === "required")).toBe(true);
  expect(contract.elements
    .filter(({tag}) => ["button", "details", "input", "select", "summary", "textarea"].includes(tag))
    .every(({interaction}) => interaction?.command && interaction?.events?.length)).toBe(true);
  assertPhase1DomContract(contract);
});

test("phase 0 full workbench desktop snapshots stay stable", async ({page}) => {
  await page.route("**/api/link/solve", (route) => route.fulfill({json: LINK_RESULT}));
  await openDeterministicApp(page);
  await enableViewerStub(page);
  await configureMainDeviceFixture(page);
  await activateMode(page, "link");
  await page.locator("#btnSolveLink").click();
  await expect(page.locator("#linkPower")).toHaveText("-81.25 dB");
  await expect(page.locator("#deviceDock")).toBeVisible();
  await expect(page.locator("#performanceDock")).toBeVisible();
  if (await page.locator("#performanceDock").evaluate((dock) => dock.classList.contains("collapsed"))) {
    await page.locator("#btnPerformanceDockToggle").click();
  }
  await expect(page.locator("#performanceDock")).not.toHaveClass(/collapsed/);

  await page.setViewportSize({width: 1440, height: 900});
  await expect(page.locator("#performanceDock")).toHaveScreenshot("performance-dock-expanded.png", {
    animations: "disabled",
    caret: "hide",
  });
  await expect(page).toHaveScreenshot("workbench-shell-1440.png", {
    animations: "disabled",
    caret: "hide",
    fullPage: false,
  });

  await page.locator("#btnPerformanceDockToggle").click();
  await expect(page.locator("#performanceDock")).toHaveClass(/collapsed/);
  await page.setViewportSize({width: 1280, height: 720});
  const layout = await page.evaluate(() => {
    const rect = (selector) => document.querySelector(selector).getBoundingClientRect().toJSON();
    const overlaps = (left, right) => left.left < right.right && left.right > right.left
      && left.top < right.bottom && left.bottom > right.top;
    const control = rect("#ui");
    const results = rect("#linkChannelSection");
    const devices = rect("#deviceDock");
    const performance = rect("#performanceDock");
    return {
      controlDevicesOverlap: overlaps(control, devices),
      controlResultsOverlap: overlaps(control, results),
      devicesWithinViewport: devices.left >= 0 && devices.right <= innerWidth && devices.bottom <= innerHeight,
      performanceDevicesOverlap: overlaps(performance, devices),
      performanceResultsOverlap: overlaps(performance, results),
      resultsDevicesOverlap: overlaps(results, devices),
    };
  });
  expect(layout).toEqual({
    controlDevicesOverlap: false,
    controlResultsOverlap: false,
    devicesWithinViewport: true,
    performanceDevicesOverlap: false,
    performanceResultsOverlap: false,
    resultsDevicesOverlap: false,
  });
  await expect(page).toHaveScreenshot("workbench-shell-1280.png", {
    animations: "disabled",
    caret: "hide",
    fullPage: false,
  });
});

test("catalog order and five mode control snapshots stay stable", async ({page}) => {
  await openDeterministicApp(page);
  expect(await page.locator("#modeMenu [data-mode]").evaluateAll((nodes) => nodes.map((node) => node.dataset.mode))).toEqual(
    ["link", "mobility", "radiomap", "deepmimo", "radar"],
  );

  for (const [mode, title] of [
    ["link", "Link Analysis"],
    ["mobility", "Mobility Analysis"],
    ["radiomap", "Radio Map"],
    ["deepmimo", "DeepMIMO"],
    ["radar", "Radar Sensing"],
  ]) {
    await page.evaluate((nextMode) => {
      document.getElementById("modeSelector").open = true;
      document.querySelector(`[data-mode="${nextMode}"]`).click();
    }, mode);
    await expect(page.locator("#modeSelectTitle")).toHaveText(`Mode (${title})`);
    await expect(page.locator(`[data-mode="${mode}"]`)).toHaveAttribute("aria-selected", "true");
    await expect(page.locator("#ui")).toHaveScreenshot(`${mode}-controls.png`, {
      animations: "disabled",
      caret: "hide",
    });
  }
});

test("non-Radar modes share one keyboard-accessible Propagation Solver group", async ({page}) => {
  await openDeterministicApp(page);
  const expectedControls = {
    link: [
      "linkSamplesPerSrc", "linkMaxNumPaths", "cfgMaxDepth", "cfgSeed", "linkSyntheticArray",
      "cfgLos", "cfgSpecular", "cfgDiffuse", "cfgRefraction",
      "linkDiffraction", "linkEdgeDiffraction", "linkDiffractionLitRegion",
    ],
    mobility: [
      "linkSamplesPerSrc", "linkMaxNumPaths", "cfgMaxDepth", "cfgSeed", "linkSyntheticArray",
      "cfgLos", "cfgSpecular", "cfgDiffuse", "cfgRefraction",
      "linkDiffraction", "linkEdgeDiffraction", "linkDiffractionLitRegion",
    ],
    radiomap: [
      "rmSamplesPerTx", "cfgMaxDepth", "cfgSeed",
      "cfgLos", "cfgSpecular", "cfgDiffuse", "cfgRefraction",
    ],
    deepmimo: [
      "cfgMaxDepth", "cfgSeed",
      "cfgLos", "cfgSpecular", "cfgDiffuse", "cfgRefraction",
    ],
  };

  for (const [mode, controlIds] of Object.entries(expectedControls)) {
    await activateMode(page, mode);
    const group = page.locator("details.propagationSolverGroup");
    await expect(group).toHaveCount(1);
    await expect(group).not.toHaveAttribute("open", "");
    const summary = group.locator("summary.paramGroupSummary");
    await expect(summary).toHaveText("Propagation Solver");

    await summary.focus();
    await expect(summary).toBeFocused();
    await page.keyboard.press("Space");
    await expect(group).toHaveAttribute("open", "");
    expect(await group.locator("input:visible, select:visible").evaluateAll((controls) => controls.map((control) => control.id)))
      .toEqual(controlIds);

    await page.keyboard.press("Space");
    await expect(group).not.toHaveAttribute("open", "");
  }
});

test("all feature modes start without Tx or Rx devices", async ({page}) => {
  await openDeterministicApp(page);
  await enableRealViewer(page);

  const defaults = await page.evaluate(async () => {
    const {state, viewerRef} = await import("/js/app_state.js?v=20260723-radar-shared-groups");
    return {
      link: {tx: state.link.tx, rx: state.link.rx, txVisual: state.link.txVisual, rxVisual: state.link.rxVisual},
      mobility: {tx: state.mobility.tx, rx: state.mobility.rx, txVisual: state.mobility.txVisual, rxVisual: state.mobility.rxVisual},
      radiomap: {tx: state.radiomap.tx, txVisual: state.radiomap.txVisual},
      deepmimo: {tx: state.deepmimo.tx, txVisual: state.deepmimo.txVisual},
      txMarkerVisible: viewerRef.current.txMarker.visible,
      rxMarkerVisible: viewerRef.current.rxMarker.visible,
    };
  });
  expect(defaults).toEqual({
    link: {tx: null, rx: null, txVisual: null, rxVisual: null},
    mobility: {tx: null, rx: null, txVisual: null, rxVisual: null},
    radiomap: {tx: null, txVisual: null},
    deepmimo: {tx: null, txVisual: null},
    txMarkerVisible: false,
    rxMarkerVisible: false,
  });
  expect(await page.locator("#linkTxX, #linkTxY, #linkTxZ, #linkRxX, #linkRxY, #linkRxZ")
    .evaluateAll((inputs) => inputs.map((input) => input.value))).toEqual(["", "", "", "", "", ""]);
  await expect(page.locator("#btnSolveLink")).toBeDisabled();
  await expect(page.locator("#btnSolveLink")).toHaveAttribute("title", "Place Link Tx and Rx before solving the link.");
  await expect(page.locator("#btnOrbitTx")).toBeDisabled();

  await activateMode(page, "mobility");
  await expect(page.locator("#btnRunMobility")).toBeDisabled();
  await expect(page.locator("#btnRunMobility")).toHaveAttribute("title", "Place Mobility Tx before running mobility.");
  await expect(page.locator("#btnMobilityAddRxPoint")).toBeDisabled();

  await activateMode(page, "radiomap");
  await expect(page.locator("#btnRunRadiomap")).toBeDisabled();
  await expect(page.locator("#btnRunRadiomap")).toHaveAttribute("title", "Place Radio Map Tx before running the radio map.");

  await activateMode(page, "deepmimo");
  await expect(page.locator("#btnRunDeepMimo")).toBeDisabled();
  await expect(page.locator("#btnRunDeepMimo")).toHaveAttribute("title", "Place DeepMIMO Tx before exporting data.");
});

test("transmitter orbit availability follows the active feature", async ({page}) => {
  await openDeterministicApp(page);
  await enableRealViewer(page);
  await configureMainDeviceFixture(page);

  for (const mode of ["link", "mobility", "radiomap", "deepmimo"]) {
    await activateMode(page, mode);
    await expect(page.locator("#btnOrbitTx")).toBeEnabled();
  }

  await activateMode(page, "radar");
  await expect(page.locator("#btnOrbitTx")).toBeDisabled();

  await page.evaluate(async () => {
    const {state} = await import("/js/app_state.js?v=20260723-radar-shared-groups");
    state.radar.tx = [72, 32, 40];
    state.radar.txVisual = [...state.radar.tx];
    state.link.tx = null;
    state.link.txVisual = null;
    for (const id of ["linkTxX", "linkTxY", "linkTxZ"]) {
      document.getElementById(id).value = "";
    }
  });
  await activateMode(page, "link");
  await expect(page.locator("#btnOrbitTx")).toBeDisabled();
  await expect(page.locator("#btnOrbitTx")).toHaveAttribute("title", "Place Tx before orbiting.");
});

test("feature transports, polling, controls and scene layers remain isolated", async ({page}) => {
  let linkRequests = 0;
  let radarRequests = 0;
  let deepCreates = 0;
  const submitted = {};

  await page.route("**/assets/radar/drones/manifest.json", (route) => route.fulfill({json: {schema_version: 1, assets: []}}));

  await page.route("**/api/link/solve", async (route) => {
    linkRequests += 1;
    submitted.link = route.request().postDataJSON();
    await route.fulfill({json: LINK_RESULT});
  });
  await page.route("**/api/radar/jobs", async (route) => {
    radarRequests += 1;
    submitted.radar = route.request().postDataJSON();
    await route.fulfill({status: 202, json: {ok: true, job_id: "radar-1", status: "queued", scene_generation: 7}});
  });
  await page.route("**/api/radar/jobs/radar-1/result", (route) => route.fulfill({json: radarResult(submitted.radar)}));
  await page.route("**/api/radar/jobs/radar-1/cancel", (route) => route.fulfill({json: {job_id: "radar-1", status: "cancelled", progress: 1, message: "Cancelled"}}));
  await page.route("**/api/radar/jobs/radar-1", (route) => route.fulfill({json: {job_id: "radar-1", status: "succeeded", progress: 1, message: "Ready", scene_generation: 7}}));
  await page.route("**/api/mobility/jobs", async (route) => {
    submitted.mobility = route.request().postDataJSON();
    await route.fulfill({status: 202, json: {job_id: "mob-1", status: "queued"}});
  });
  await page.route("**/api/mobility/jobs/mob-1/result", (route) => route.fulfill({json: MOBILITY_RESULT}));
  await page.route("**/api/mobility/jobs/mob-1", (route) => route.fulfill({json: {job_id: "mob-1", status: "succeeded"}}));
  await page.route("**/api/radiomap/jobs", async (route) => {
    submitted.radiomap = route.request().postDataJSON();
    await route.fulfill({status: 202, json: {job_id: "rm-1", status: "queued"}});
  });
  await page.route("**/api/radiomap/jobs/rm-1/result", (route) => route.fulfill({json: RADIOMAP_RESULT}));
  await page.route("**/api/radiomap/jobs/rm-1", (route) => route.fulfill({json: {job_id: "rm-1", status: "succeeded"}}));
  await page.route("**/api/deepmimo/jobs", async (route) => {
    deepCreates += 1;
    submitted.deepmimo = route.request().postDataJSON();
    const jobId = deepCreates === 1 ? "deep-cancel" : "deep-ok";
    await route.fulfill({status: 202, json: {job_id: jobId, status: "running", progress: 0.2}});
  });
  await page.route("**/api/deepmimo/jobs/deep-cancel/cancel", (route) => route.fulfill({json: {
    job_id: "deep-cancel", status: "cancelled", progress: 1, message: "Cancelled",
  }}));
  await page.route("**/api/deepmimo/jobs/deep-cancel", (route) => route.fulfill({json: {
    job_id: "deep-cancel", status: "running", progress: 0.3, message: "Tracing",
  }}));
  await page.route("**/api/deepmimo/jobs/deep-ok", (route) => route.fulfill({json: {
    job_id: "deep-ok",
    status: "succeeded",
    progress: 1,
    updated_at: "2026-07-18T00:00:00Z",
    result: {archive_name: "fixture.zip"},
  }}));

  await openDeterministicApp(page);
  await enableRealViewer(page);
  await configureMainDeviceFixture(page);

  await page.locator("#btnSolveLink").click();
  await expect(page.locator("#linkResult")).toBeVisible();
  await expect(page.locator("#linkPower")).toHaveText("-81.25 dB");
  await expect(page.locator(".pathRow")).toHaveCount(1);
  const sharedResultDockWidth = await page.locator("#linkChannelSection").evaluate((dock) => dock.getBoundingClientRect().width);
  expect(sharedResultDockWidth).toBe(375);
  expect(await page.evaluate(async () => {
    const {viewerRef} = await import("/js/app_state.js?v=20260723-radar-shared-groups");
    return viewerRef.current.pathLayer.group.children.length;
  })).toBe(1);

  await page.locator("details.livePreviewParam > summary").click();
  await page.locator("#livePreviewEnabled").check();
  await page.locator("#livePreviewPathsDelay").fill("0");
  await page.locator("#btnPickLinkTx").click();
  await page.locator("#linkTxX").fill("73");
  await page.locator("#linkTxX").press("Tab");
  await expect.poll(() => linkRequests).toBeGreaterThan(1);

  await configureRadarFixture(page);
  await activateMode(page, "radar");
  await expect(page.locator("#radarAssetPicker")).toHaveAttribute("data-state", "empty");
  await expect(page.locator("#radarAssetPreviewStatus")).toHaveText("No drone models available.");
  await expect(page.locator("#btnAddRadarTarget")).toBeDisabled();
  await page.locator("#radarWaveformGroup > summary").click();
  await page.locator("#radarPropagationGroup > summary").click();
  const radarDerivedLabels = await page.locator(".radarDerivedLabel").evaluateAll((labels) => labels.map((label) => ({
    text: label.firstElementChild?.innerText,
    breakCount: label.querySelectorAll("br").length,
    height: label.getBoundingClientRect().height,
  })));
  expect(radarDerivedLabels.map(({text}) => text)).toEqual([
    "Range\nResolution",
    "Doppler\nResolution",
    "Velocity\nResolution",
  ]);
  expect(radarDerivedLabels.map(({breakCount}) => breakCount)).toEqual([1, 1, 1]);
  expect(new Set(radarDerivedLabels.map(({height}) => height)).size).toBe(1);
  const radarActionOrder = await page.locator("#deviceActionBar .deviceActionBtn:not(.hidden)").evaluateAll((buttons) => buttons
    .map((button) => ({label: button.querySelector(".deviceActionText")?.textContent?.trim(), left: button.getBoundingClientRect().left}))
    .sort((left, right) => left.left - right.left)
    .map(({label}) => label));
  expect(radarActionOrder).toEqual(["Tx", "Rx", "Orbit", "Run Radar"]);
  await expect(page.locator("#btnPickRadarTx .deviceActionIcon, #btnPickRadarRx .deviceActionIcon, #btnSolveRadar .deviceActionIcon")).toHaveCount(3);
  const carrierInfoTip = page.locator('label[for="radarCarrierFrequency"] .infoTip');
  await carrierInfoTip.dispatchEvent("mouseover");
  await expect(page.locator("#paramTooltipLayer")).toBeVisible();
  await expect(page.locator("#paramTooltipText")).toContainText("RF carrier");
  await carrierInfoTip.dispatchEvent("mouseout");
  const tooltipFocusState = await carrierInfoTip.evaluate((tip) => {
    tip.focus();
    const layer = document.getElementById("paramTooltipLayer");
    return {
      active: document.activeElement === tip,
      className: layer.className,
      text: document.getElementById("paramTooltipText").textContent,
    };
  });
  expect(tooltipFocusState).toMatchObject({active: true, text: expect.stringContaining("RF carrier")});
  expect(tooltipFocusState.className).not.toContain("hidden");
  await page.locator("#radarSamplesPerSrc").evaluate((input) => {
    input.value = "42000";
    input.dispatchEvent(new Event("change", {bubbles: true}));
  });
  await page.locator("#btnPickRadarTx").click();
  await page.locator("#radarTxX").fill("76");
  await page.locator("#radarTxX").press("Tab");
  expect(radarRequests).toBe(0);
  await page.locator("#btnSolveRadar").click();
  await expect.poll(() => radarRequests).toBe(1);
  await expect(page.locator("#resultDockTitle")).toHaveText("Radar Sensing Results");
  await expect(page.locator("#radarDetectionMetric")).toHaveText("2 target detections · 2 total");
  await expect(page.locator("#radarPathMetric")).toHaveText("2 target · 1 clutter");
  await expect(page.locator("#radarNoiseMetric")).toHaveText("-118.0 dBm");
  await expect(page.locator("#radarResolutionSection")).toHaveCount(0);
  await expect(page.locator("#radarDetectionList .radarResultRow")).toHaveCount(2);
  await expect(page.locator("#radarTruthList .radarResultRow").first()).toContainText("DJI Mini 3");
  await expect(page.locator("#radarTruthList .radarResultRow").first()).toContainText("Directly visible");
  await expect(page.locator("#radarTruthList .radarResultRow").nth(1)).toContainText("Visible via multipath");
  expect(await page.evaluate(async () => {
    const {radarObservabilityLabel} = await import("/js/features/radar/presentation.js?v=20260722-radar-ui-consistency");
    return ["direct", "multipath", "blocked"].map(radarObservabilityLabel);
  })).toEqual(["Directly visible", "Visible via multipath", "Blocked"]);
  const radarResultLayout = await page.locator("#linkChannelSection").evaluate((dock) => {
    const sections = document.getElementById("radarResultSections");
    const detections = document.getElementById("radarDetectionList");
    const paths = document.getElementById("radarPathList");
    return {
      width: dock.getBoundingClientRect().width,
      dockOverflow: dock.scrollWidth - dock.clientWidth,
      sectionOverflow: sections.scrollWidth - sections.clientWidth,
      detectionOverflowY: getComputedStyle(detections).overflowY,
      pathOverflowY: getComputedStyle(paths).overflowY,
    };
  });
  expect(radarResultLayout).toEqual({
    width: sharedResultDockWidth,
    dockOverflow: 0,
    sectionOverflow: 0,
    detectionOverflowY: "visible",
    pathOverflowY: "visible",
  });
  expect(await page.evaluate(async () => {
    const {state} = await import("/js/app_state.js?v=20260723-radar-shared-groups");
    return {
      linkTx: state.link.tx[0],
      radarTx: state.radar.tx[0],
      linkSamples: state.link.advanced.samplesPerSrc,
      radarSamples: state.radar.solver.samplesPerSrc,
    };
  })).toEqual({linkTx: 73, radarTx: 76, linkSamples: 30000, radarSamples: 42000});

  await activateMode(page, "mobility");
  await page.locator("details.mobilityOnlyParam > summary").click();
  await page.locator("#btnMobilityAddRxPoint").click();
  await page.locator("#btnPickMobilityRx").click();
  await page.locator("#mobilityRxX").fill("92");
  await page.locator("#mobilityRxX").press("Tab");
  await page.locator("#btnMobilityAddRxPoint").click();
  await page.locator("#btnRunMobility").click();
  await expect(page.locator("#mobilityResult")).toBeVisible();
  await page.locator("#mobilityStepSlider").evaluate((slider) => {
    slider.value = "1";
    slider.dispatchEvent(new Event("input", {bubbles: true}));
  });
  await expect(page.locator("#mobilityStepLabel")).toContainText("Step 2");
  await page.locator("#btnMobilityPlay").click();
  await expect(page.locator("#btnMobilityPlay")).toHaveText("Pause");
  expect(await page.evaluate(async () => {
    const {viewerRef} = await import("/js/app_state.js?v=20260723-radar-shared-groups");
    return {
      paths: viewerRef.current.pathLayer.group.children.length,
      trajectory: viewerRef.current.mobilityLayer.group.children.length,
    };
  })).toEqual({paths: 1, trajectory: 3});

  await activateMode(page, "radiomap");
  await expect(page.locator("#btnMobilityPlay")).toHaveText("Play");
  await page.locator("#btnRunRadiomap").click();
  await expect(page.locator("#radiomapResult")).toBeVisible();
  await expect(page.locator("#rmStatus")).toHaveText("Succeeded");
  expect(await page.evaluate(async () => {
    const {viewerRef} = await import("/js/app_state.js?v=20260723-radar-shared-groups");
    return {
      paths: viewerRef.current.pathLayer.group.children.length,
      trajectory: viewerRef.current.mobilityLayer.group.children.length,
      heatmap: viewerRef.current.radiomapLayer.group.children.length,
    };
  })).toEqual({paths: 0, trajectory: 0, heatmap: 1});

  await page.locator("#cfgFrequency").fill("3.6");
  await page.locator("#cfgFrequency").press("Tab");
  await expect.poll(async () => page.evaluate(async () => {
    const {state, viewerRef} = await import("/js/app_state.js?v=20260723-radar-shared-groups");
    return !state.radiomap.result && viewerRef.current.radiomapLayer.group.children.length === 0;
  })).toBe(true);

  await page.evaluate(async () => {
    const {state} = await import("/js/app_state.js?v=20260723-radar-shared-groups");
    state.deepmimo.roi.cornerA = [60, 30, 0];
    state.deepmimo.roi.cornerB = [80, 50, 0];
    state.deepmimo.roi.visualZ = 0;
  });
  await activateMode(page, "deepmimo");
  expect(await page.evaluate(async () => {
    const {viewerRef} = await import("/js/app_state.js?v=20260723-radar-shared-groups");
    return {
      heatmap: viewerRef.current.radiomapLayer.group.children.length,
      roi: viewerRef.current.deepMimoRoiLayer.group.children.length,
    };
  })).toEqual({heatmap: 0, roi: 2});

  await page.locator("#btnRunDeepMimo").click();
  await expect(page.locator("#btnLoadingCancel")).toBeVisible();
  await page.locator("#btnLoadingCancel").click();
  await expect(page.locator("#btnRunDeepMimo")).not.toHaveAttribute("aria-busy", "true", {timeout: 5_000});
  await expect(page.locator("#deepMimoDatasetCount")).toHaveText("0");

  await page.locator("#btnRunDeepMimo").click();
  await expect(page.locator("#deepMimoDatasetCount")).toHaveText("1");
  await page.locator("#deepMimoDatasetToggle").click();
  await expect(page.locator("#deepMimoDatasetList .deepMimoDatasetDownload")).toHaveAttribute("href", /deep-ok\/download$/);

  expect(Object.keys(submitted).sort()).toEqual(["deepmimo", "link", "mobility", "radar", "radiomap"]);
  expect(submitted.mobility.rx_trajectory.points).toHaveLength(2);
  expect(submitted.radiomap.surface).toBeTruthy();
  expect(submitted.deepmimo.roi).toBeTruthy();
  expect(submitted.radar).toMatchObject({
    schema_version: 1,
    mode: "bistatic",
    targets: [{id: "target-1"}, {id: "target-2"}],
    waveform: {num_subcarriers: 1024, num_symbols: 1024},
  });
  expect(submitted.radar.channel).toBeUndefined();
  expect(submitted.radar.solver.frequency_hz).toBeUndefined();
  expect(submitted.radar.waveform.carrier_frequency_hz).toBeGreaterThan(0);
});

test("Radar result dock visual snapshots stay stable", async ({page}) => {
  let submittedRadar = null;
  await page.route("**/assets/radar/drones/manifest.json", (route) => route.fulfill({
    json: {schema_version: 1, assets: []},
  }));
  await page.route("**/api/radar/jobs", async (route) => {
    submittedRadar = route.request().postDataJSON();
    await route.fulfill({
      status: 202,
      json: {ok: true, job_id: "radar-snapshot", status: "queued", scene_generation: 7},
    });
  });
  await page.route("**/api/radar/jobs/radar-snapshot/result", (route) => route.fulfill({
    json: radarResult(submittedRadar),
  }));
  await page.route("**/api/radar/jobs/radar-snapshot", (route) => route.fulfill({
    json: {
      job_id: "radar-snapshot",
      status: "succeeded",
      progress: 1,
      message: "Ready",
      scene_generation: 7,
    },
  }));

  await openDeterministicApp(page);
  await enableRealViewer(page);
  await configureRadarFixture(page);
  await activateMode(page, "radar");
  await page.locator("#btnSolveRadar").click();
  await expect(page.locator("#resultDockTitle")).toHaveText("Radar Sensing Results");
  await expect(page.locator("#radarDetectionList .radarResultRow")).toHaveCount(2);
  await expect(page.locator("#linkChannelSection")).toHaveScreenshot("radar-result-dock.png", {
    animations: "disabled",
    caret: "hide",
  });

  await page.evaluate(async () => {
    const {state, viewerRef} = await import("/js/app_state.js?v=20260723-radar-shared-groups");
    const target = {
      id: "target-3",
      asset_id: "dji-mavic-3-cine",
      position: [96, 44, 30],
      orientation: [0, 0, Math.PI / 2],
      velocity: [0, 12, 0],
      rcs_m2: 0.025,
    };
    state.radar.targets.push(target);
    state.radar.nextTargetNumber = 4;
    state.radar.selectedTargetId = target.id;
    const viewer = viewerRef.current;
    viewer.controls.target.set(...target.position);
    viewer.camera.position.set(target.position[0] - 28, target.position[1] - 36, target.position[2] + 22);
    viewer.camera.lookAt(viewer.controls.target);
    viewer.controls.update();
  });
  await activateMode(page, "link");
  await activateMode(page, "radar");
  const targetLabel = page.locator('.radarTargetLabel[data-target-id="target-3"]');
  await expect(targetLabel).toBeVisible();
  await expect(targetLabel.locator("strong")).toHaveText("Target 3");
  await expect(targetLabel.locator("small")).toHaveText("12.0 m/s · RCS 0.025 m²");
  await expect(targetLabel).toHaveScreenshot("radar-target-label.png", {maxDiffPixels: 10});
});

test("Radar target workflow, monostatic payload and result selections stay linked", async ({page}) => {
  test.setTimeout(90_000);
  let submittedRadar = null;
  await page.route("**/assets/radar/drones/manifest.json", (route) => route.fulfill({json: RADAR_PREVIEW_MANIFEST}));
  await page.route("**/api/radar/jobs", async (route) => {
    submittedRadar = route.request().postDataJSON();
    await route.fulfill({status: 202, json: {ok: true, job_id: "radar-workflow", status: "queued", scene_generation: 7}});
  });
  await page.route("**/api/radar/jobs/radar-workflow/result", (route) => {
    const result = radarResult(submittedRadar);
    for (let index = 0; index < 12; index += 1) {
      result.detections.push({
        detection_id: `clutter-det-${index}`,
        equivalent_range_m: 30 + index * 4,
        equivalent_radial_velocity_mps: 0,
        doppler_hz: 0,
        power_dbm: -82 - index,
        snr_db: 18 - index * 0.5,
        arrival_azimuth_deg: -40 + index * 6,
        arrival_zenith_deg: 90,
        target_id: null,
        classification: "clutter",
      });
    }
    result.summary.total_detection_count = result.detections.length;
    result.summary.returned_detection_count = result.detections.length;
    route.fulfill({json: result});
  });
  await page.route("**/api/radar/jobs/radar-workflow", (route) => route.fulfill({json: {job_id: "radar-workflow", status: "succeeded", progress: 1, message: "Ready", scene_generation: 7}}));

  await openDeterministicApp(page);
  await enableRealViewer(page);
  await activateMode(page, "radar");

  const radarGroups = page.locator("#radarPanel .radarGroup");
  await expect(radarGroups).toHaveCount(5);
  expect(await radarGroups.evaluateAll((groups) => groups.map((group) => group.open)))
    .toEqual([false, false, false, false, false]);
  const disclosureChevrons = await page.evaluate(() => {
    const styleFor = (selector) => {
      const style = getComputedStyle(document.querySelector(selector), "::after");
      return {
        content: style.content,
        width: style.width,
        height: style.height,
        borderRight: style.borderRight,
        borderBottom: style.borderBottom,
      };
    };
    return {
      radar: styleFor("#radarPanel .radarGroup > summary"),
      shared: styleFor(".propagationSolverGroup > summary"),
    };
  });
  expect(disclosureChevrons.radar).toEqual(disclosureChevrons.shared);

  await page.locator("#radarTargetsGroup > summary").click();
  await expect(page.locator("#radarTargetsGroup")).toHaveAttribute("open", "");
  await expect(page.locator("#radarAssetSelect")).toHaveCount(0);
  await expect(page.locator("#radarAssetPicker")).toHaveAttribute("data-state", "ready", {timeout: 15_000});
  await expect(page.locator("#btnAddRadarTarget")).toBeEnabled();
  await expect.poll(() => page.locator("#btnAddRadarTarget").evaluate(
    (button) => getComputedStyle(button).boxShadow,
  )).toBe("rgba(31, 111, 255, 0.14) 0px 2px 5px 0px");
  const assetPickerStyles = await page.evaluate(() => {
    const picker = getComputedStyle(document.getElementById("radarAssetPicker"));
    const viewport = getComputedStyle(document.querySelector(".radarAssetPreviewViewport"));
    const nav = getComputedStyle(document.getElementById("btnRadarAssetPrevious"));
    const count = getComputedStyle(document.getElementById("radarAssetPreviewCount"));
    const addButton = getComputedStyle(document.getElementById("btnAddRadarTarget"));
    return {
      pickerBackground: picker.backgroundImage,
      pickerColor: picker.backgroundColor,
      pickerShadow: picker.boxShadow,
      pickerPadding: picker.padding,
      viewportBackground: viewport.backgroundImage,
      viewportColor: viewport.backgroundColor,
      navColor: nav.backgroundColor,
      countColor: count.backgroundColor,
      addButtonShadow: addButton.boxShadow,
    };
  });
  expect(assetPickerStyles).toEqual({
    pickerBackground: "none",
    pickerColor: "rgba(0, 0, 0, 0)",
    pickerShadow: "none",
    pickerPadding: "0px",
    viewportBackground: "none",
    viewportColor: "rgb(244, 246, 248)",
    navColor: "rgb(255, 255, 255)",
    countColor: "rgb(238, 241, 244)",
    addButtonShadow: "rgba(31, 111, 255, 0.14) 0px 2px 5px 0px",
  });
  await expect(page.locator("#radarAssetPickerHint")).toBeHidden();
  const targetActionLayout = await page.evaluate(() => {
    const actionBar = document.querySelector(".radarEditorActions");
    const actionRect = actionBar.getBoundingClientRect();
    const addButton = document.getElementById("btnAddRadarTarget");
    const addButtonRect = addButton.getBoundingClientRect();
    const buttonWidths = [...actionBar.querySelectorAll("button")].map((button) => button.getBoundingClientRect().width);
    return {
      actionWidth: actionRect.width,
      addButtonWidth: addButtonRect.width,
      actionTop: actionRect.top,
      addButtonBottom: addButtonRect.bottom,
      followsAddButton: addButton.nextElementSibling === actionBar,
      precedesTargetList: Boolean(actionBar.compareDocumentPosition(document.getElementById("radarTargetList")) & Node.DOCUMENT_POSITION_FOLLOWING),
      buttonWidths,
      columns: getComputedStyle(actionBar).gridTemplateColumns.split(" ").length,
    };
  });
  expect(targetActionLayout.columns).toBe(3);
  expect(targetActionLayout.followsAddButton).toBe(true);
  expect(targetActionLayout.precedesTargetList).toBe(true);
  expect(targetActionLayout.actionTop).toBeGreaterThan(targetActionLayout.addButtonBottom);
  expect(Math.abs(targetActionLayout.actionWidth - targetActionLayout.addButtonWidth)).toBeLessThanOrEqual(1);
  expect(Math.max(...targetActionLayout.buttonWidths) - Math.min(...targetActionLayout.buttonWidths)).toBeLessThanOrEqual(1);
  await expect(page.locator(".radarEditorActions")).toHaveAttribute("aria-label", "Selected target actions");
  await expect(page.locator(".radarEditorActions button")).toHaveCount(3);
  expect(await page.locator(".radarEditorActions button").evaluateAll((buttons) => buttons.every((button) => button.disabled))).toBe(true);
  await expect(page.locator("#radarAssetPreviewName")).toHaveText("DJI Air 2S");
  await expect(page.locator("#radarAssetPreviewCount")).toHaveText("1 / 4");
  await expect(page.locator("#radarAssetPreviewCanvas")).toHaveAttribute("aria-label", "Interactive 3D preview of DJI Air 2S");
  await page.locator("#btnRadarAssetPrevious").click();
  await expect(page.locator("#radarAssetPreviewName")).toHaveText("DJI Mini 3 Pro");
  await expect(page.locator("#radarAssetPreviewCount")).toHaveText("4 / 4");
  await expect(page.locator("#btnAddRadarTarget")).toBeEnabled();
  await expect.poll(() => page.locator("#btnAddRadarTarget").evaluate((button) => getComputedStyle(button).boxShadow))
    .toBe("rgba(31, 111, 255, 0.14) 0px 2px 5px 0px");
  await page.locator("#btnRadarAssetNext").click();
  await page.locator("#btnRadarAssetNext").click();
  await expect(page.locator("#radarAssetPreviewName")).toHaveText("DJI Mavic 3 Cine");
  await expect(page.locator("#radarAssetPicker")).toHaveAttribute("data-state", "ready", {timeout: 15_000});

  const collapsedRadarGroupLayout = await page.locator("#radarPanel .radarGroup").first().evaluate((group) => {
    group.open = false;
    const summary = group.querySelector("summary");
    const groupRect = group.getBoundingClientRect();
    const summaryRect = summary.getBoundingClientRect();
    return {
      groupHeight: groupRect.height,
      summaryHeight: summaryRect.height,
      centerOffset: Math.abs((summaryRect.top + summaryRect.height / 2) - (groupRect.top + groupRect.height / 2)),
    };
  });
  const sharedSummaryHeight = await page.locator("#modeSelector > summary").evaluate((summary) => summary.getBoundingClientRect().height);
  expect(collapsedRadarGroupLayout.summaryHeight).toBe(sharedSummaryHeight);
  expect(collapsedRadarGroupLayout.groupHeight).toBe(sharedSummaryHeight + 2);
  expect(collapsedRadarGroupLayout.centerOffset).toBeLessThanOrEqual(0.5);
  await page.locator("#radarPanel .radarGroup").first().evaluate((group) => { group.open = true; });

  const emptyDefaults = await page.evaluate(async () => {
    const {state, viewerRef} = await import("/js/app_state.js?v=20260723-radar-shared-groups");
    return {
      tx: state.radar.tx,
      rx: state.radar.rx,
      targets: state.radar.targets,
      nextTargetNumber: state.radar.nextTargetNumber,
      selectedTargetId: state.radar.selectedTargetId,
      solver: state.radar.solver,
      txMarkerVisible: viewerRef.current.txMarker.visible,
      rxMarkerVisible: viewerRef.current.rxMarker.visible,
    };
  });
  expect(emptyDefaults).toMatchObject({
    tx: null,
    rx: null,
    targets: [],
    nextTargetNumber: 1,
    selectedTargetId: null,
    solver: {samplesPerSrc: 65536, diffuseReflection: true},
    txMarkerVisible: false,
    rxMarkerVisible: false,
  });
  await expect(page.locator("#radarTargetList .radarEmptyState")).toHaveText(
    "No targets added. Choose a drone model above, then select Add Target.",
  );
  await expect(page.locator("#radarTargetList .radarTargetCard")).toHaveCount(0);
  await expect(page.locator("#radarTargetCount")).toHaveText("0 / 16");
  await expect(page.locator("#radarEditorTitle")).toHaveText("No target selected");
  await expect(page.locator("#radarTargetX")).toHaveValue("");
  await expect(page.locator("#btnSolveRadar")).toBeDisabled();
  await expect(page.locator("#btnSolveRadar")).toHaveAttribute("title", "Place Radar Tx and Rx before running sensing.");
  await expect(page.locator("#btnOrbitTx")).toBeDisabled();
  await expect(page.locator("#btnRadarSafePreset")).toHaveCount(0);

  await page.locator("#btnPickRadarTx").click();
  await expect(page.locator("#radarTxX")).toHaveValue("");
  await page.locator("#radarTxX").fill("72");
  await page.locator("#radarTxY").fill("32");
  await page.locator("#radarTxZ").fill("40");
  await page.locator("#radarTxZ").press("Tab");
  await page.locator("#btnPickRadarTx").click();
  await expect(page.locator("#btnSolveRadar")).toBeDisabled();
  await page.locator("#btnPickRadarRx").click();
  await expect(page.locator("#radarRxX")).toHaveValue("");
  await page.locator("#radarRxX").fill("72");
  await page.locator("#radarRxY").fill("42");
  await page.locator("#radarRxZ").fill("40");
  await page.locator("#radarRxZ").press("Tab");
  await page.locator("#btnPickRadarRx").click();
  await expect(page.locator("#btnSolveRadar")).toBeEnabled();
  await expect(page.locator("#btnOrbitTx")).toBeEnabled();

  await page.evaluate(() => {
    window.__originalRadarMathRandom = Math.random;
    const values = [0.25, 0.75, 0.5];
    Math.random = () => values.shift() ?? 0.5;
  });
  await page.locator("#btnAddRadarTarget").click();
  await page.evaluate(() => {
    Math.random = window.__originalRadarMathRandom;
    delete window.__originalRadarMathRandom;
  });
  await expect(page.locator("#radarTargetSpeed")).toHaveValue("7.50");
  await expect(page.locator("#radarTargetDirection")).toHaveValue("90.0");
  await expect(page.locator("#radarTargetClimb")).toHaveValue("0.0");
  await expect(page.locator("#radarTargetYaw")).toHaveValue("90.0");
  await expect(page.locator("#radarVelocityVectorPreview")).toHaveText("Velocity [0.0, 7.5, 0.0] m/s");
  expect(await page.evaluate(async () => {
    const {state} = await import("/js/app_state.js?v=20260723-radar-shared-groups");
    const target = state.radar.targets[0];
    return {
      speed: Number(Math.hypot(...target.velocity).toFixed(2)),
      yawDeg: Number((target.orientation[2] * 180 / Math.PI).toFixed(1)),
    };
  })).toEqual({speed: 7.5, yawDeg: 90});
  await page.locator("#btnRadarAssetNext").click();
  await expect(page.locator("#radarAssetPreviewName")).toHaveText("DJI Mini 3");
  await page.locator("#btnAddRadarTarget").click();
  await page.evaluate(async () => {
    const {state} = await import("/js/app_state.js?v=20260723-radar-shared-groups");
    Object.assign(state.radar.targets[0], {position: [100, 29, 47], orientation: [0, 0, 0.314159], velocity: [7.608452, 2.472136, 0]});
    Object.assign(state.radar.targets[1], {position: [126, 50, 54], orientation: [0, 0, -2.478368], velocity: [-10.24414, -8.003599, 0], rcs_m2: 0.018});
    state.radar.selectedTargetId = "target-1";
  });
  await activateMode(page, "link");
  await activateMode(page, "radar");
  await page.locator("#btnRadarAssetPrevious").click();
  await expect(page.locator("#radarAssetPreviewName")).toHaveText("DJI Mavic 3 Cine");

  const configured = await page.evaluate(async () => {
    const {state} = await import("/js/app_state.js?v=20260723-radar-shared-groups");
    return {tx: state.radar.tx, rx: state.radar.rx, targets: state.radar.targets};
  });
  const equivalentDopplers = configured.targets.map((target) => {
    const unit = (origin) => {
      const delta = target.position.map((value, index) => value - origin[index]);
      const length = Math.hypot(...delta);
      return delta.map((value) => value / length);
    };
    const txUnit = unit(configured.tx); const rxUnit = unit(configured.rx);
    const pathRate = target.velocity.reduce((sum, value, index) => sum + value * (txUnit[index] + rxUnit[index]), 0);
    return -pathRate / (299792458 / 5.8e9);
  });
  expect(Math.sign(equivalentDopplers[0])).toBe(-Math.sign(equivalentDopplers[1]));

  await expect(page.locator("#radarTargetList .radarTargetCard")).toHaveCount(2);
  const initialDirectionArrows = await page.evaluate(async () => {
    const {viewerRef} = await import("/js/app_state.js?v=20260723-radar-shared-groups");
    return viewerRef.current.layers.get("radar", "target-overlays").group.children.map((group) => ({
      speedMps: Number(group.userData.radarTargetOverlay.speedMps.toFixed(1)),
      lengthM: group.children[0]?.userData.radarDirectionArrowLengthM,
    }));
  });
  expect(initialDirectionArrows).toEqual([
    {speedMps: 8, lengthM: 8},
    {speedMps: 13, lengthM: 8},
  ]);
  const pickTargetButton = page.locator("#btnPickRadarTarget");
  await pickTargetButton.click();
  await expect(pickTargetButton).toHaveClass(/picking/);
  await page.mouse.move(900, 100);
  await expect.poll(() => pickTargetButton.evaluate((button) => getComputedStyle(button).backgroundColor))
    .toBe("rgb(31, 111, 255)");
  expect(await pickTargetButton.evaluate((button) => getComputedStyle(button, "::after").content))
    .toBe('"Picking in 3D"');
  expect(await page.evaluate(async () => {
    const {state} = await import("/js/app_state.js?v=20260723-radar-shared-groups");
    return state.pickTarget;
  })).toBe("radar-target");
  await pickTargetButton.click();
  await expect(pickTargetButton).not.toHaveClass(/picking/);
  expect(await page.evaluate(async () => {
    const {state} = await import("/js/app_state.js?v=20260723-radar-shared-groups");
    return state.pickTarget;
  })).toBeNull();
  await page.evaluate(async () => {
    const {state, viewerRef} = await import("/js/app_state.js?v=20260723-radar-shared-groups");
    const [selected, nearby] = state.radar.targets;
    nearby.position = [...selected.position];
    const viewer = viewerRef.current;
    viewer.controls.target.set(...selected.position);
    viewer.camera.position.set(selected.position[0] - 28, selected.position[1] - 36, selected.position[2] + 22);
    viewer.camera.lookAt(viewer.controls.target);
    viewer.controls.update();
  });
  const crowdedLabels = page.locator('.radarTargetLabel[data-visible="true"]');
  await expect(crowdedLabels).toHaveCount(2);
  const crowdedLayout = await crowdedLabels.evaluateAll((nodes) => {
    const labels = nodes.map((node) => ({
      id: node.dataset.targetId,
      anchorX: Number(node.dataset.anchorX),
      lane: Number(node.dataset.lane),
      rect: node.getBoundingClientRect().toJSON(),
    }));
    const [first, second] = labels;
    const intersects = first.rect.left < second.rect.right && first.rect.right > second.rect.left
      && first.rect.top < second.rect.bottom && first.rect.bottom > second.rect.top;
    return {labels, intersects};
  });
  expect(crowdedLayout.intersects).toBe(false);
  expect(crowdedLayout.labels.map(({id}) => id).sort()).toEqual(["target-1", "target-2"]);
  expect(crowdedLayout.labels.every(({anchorX, rect}) => rect.left >= anchorX + 11)).toBe(true);
  await page.locator('#radarTargetList [data-target-id="target-1"]').click();
  await page.locator("#btnRemoveRadarTarget").click();
  await page.locator("#btnRemoveRadarTarget").click();
  await expect(page.locator("#radarTargetList .radarEmptyState")).toHaveText(
    "No targets added. Choose a drone model above, then select Add Target.",
  );
  await page.locator("#btnAddRadarTarget").click();
  await expect(page.locator("#radarTargetList .radarTargetCard")).toHaveCount(1);
  expect(await page.evaluate(async () => {
    const {state} = await import("/js/app_state.js?v=20260723-radar-shared-groups");
    return state.radar.targets[0].asset_id;
  })).toBe("dji-mavic-3-cine");
  await page.locator("#radarTargetX").fill("96");
  await page.locator("#radarTargetY").fill("44");
  await page.locator("#radarTargetZ").fill("30");
  await expect(page.locator("#radarTargetVx, #radarTargetVy, #radarTargetVz")).toHaveCount(0);
  const yawInput = page.locator("#radarTargetYaw");
  await expect(yawInput).toHaveAttribute("readonly", "");
  await expect(yawInput).toHaveAttribute("aria-readonly", "true");
  await expect(yawInput).not.toBeEditable();
  await expect(yawInput).not.toBeDisabled();
  await yawInput.focus();
  await expect(yawInput).toBeFocused();
  await expect(page.locator(".radarVelocityMeta")).toContainText("Yaw follows Direction");
  await page.locator("#radarTargetRoll").fill("12");
  await page.locator("#radarTargetPitch").fill("-7");
  await page.locator("#radarTargetSpeed").fill("12");
  await page.locator("#radarTargetClimb").fill("0");
  for (const [enteredDirection, expectedDirection] of [["0", 0], ["90", 90], ["-142", -142], ["218", -142]]) {
    await page.locator("#radarTargetDirection").fill(enteredDirection);
    await page.locator("#radarTargetDirection").press("Tab");
    const heading = await page.evaluate(async () => {
      const {state} = await import("/js/app_state.js?v=20260723-radar-shared-groups");
      const target = state.radar.targets[0];
      return {
        directionDeg: Math.atan2(target.velocity[1], target.velocity[0]) * 180 / Math.PI,
        yawDeg: target.orientation[2] * 180 / Math.PI,
        rollDeg: target.orientation[0] * 180 / Math.PI,
        pitchDeg: target.orientation[1] * 180 / Math.PI,
      };
    });
    expect(heading.directionDeg).toBeCloseTo(expectedDirection, 6);
    expect(heading.yawDeg).toBeCloseTo(expectedDirection, 6);
    expect(heading.rollDeg).toBeCloseTo(12, 6);
    expect(heading.pitchDeg).toBeCloseTo(-7, 6);
    await expect(yawInput).toHaveValue(expectedDirection.toFixed(1));
  }
  await page.locator("#radarTargetSpeed").fill("0");
  await page.locator("#radarTargetDirection").fill("270");
  await page.locator("#radarTargetDirection").press("Tab");
  await expect(page.locator("#radarTargetDirection")).toHaveValue("-90.0");
  await expect(yawInput).toHaveValue("-90.0");
  expect(await page.evaluate(async () => {
    const {state} = await import("/js/app_state.js?v=20260723-radar-shared-groups");
    const target = state.radar.targets[0];
    return {velocity: target.velocity, yawDeg: target.orientation[2] * 180 / Math.PI};
  })).toEqual({velocity: [0, 0, 0], yawDeg: -90});
  await page.locator("#radarTargetList .radarTargetCard").click();
  await expect(page.locator("#radarTargetDirection")).toHaveValue("-90.0");
  await expect(yawInput).toHaveValue("-90.0");
  await page.locator("#radarTargetSpeed").fill("12");
  await page.locator("#radarTargetClimb").fill("25");
  await page.locator("#radarTargetDirection").fill("90");
  await page.locator("#radarTargetDirection").press("Tab");
  await expect(yawInput).toHaveValue("90.0");
  await page.locator("#radarTargetClimb").fill("0");
  await page.locator("#radarTargetRcs").fill("0.025");
  await page.locator("#radarTargetRcs").press("Tab");

  const radarTargetId = await page.evaluate(async () => {
    const {state, viewerRef} = await import("/js/app_state.js?v=20260723-radar-shared-groups");
    const target = state.radar.targets[0];
    const viewer = viewerRef.current;
    viewer.controls.target.set(...target.position);
    viewer.camera.position.set(target.position[0] - 28, target.position[1] - 36, target.position[2] + 22);
    viewer.camera.lookAt(viewer.controls.target);
    viewer.controls.update();
    return target.id;
  });
  const targetLabel = page.locator(`.radarTargetLabel[data-target-id="${radarTargetId}"]`);
  await expect(targetLabel).toBeVisible();
  await expect(targetLabel.locator("strong")).toHaveText(radarTargetId.replace(/^target-/i, "Target "));
  await expect(targetLabel.locator("small")).toHaveText("12.0 m/s · RCS 0.025 m²");
  await expect(targetLabel).toHaveClass(/selected/);
  const labelPresentation = await targetLabel.evaluate((node) => {
    const style = getComputedStyle(node);
    const layerStyle = getComputedStyle(node.parentElement);
    const appStyle = getComputedStyle(document.getElementById("ui"));
    const resultStyle = getComputedStyle(document.getElementById("linkChannelSection"));
    const deviceStyle = getComputedStyle(document.getElementById("deviceDock"));
    return {
      pointerEvents: layerStyle.pointerEvents,
      layerPosition: layerStyle.position,
      layerZ: Number(layerStyle.zIndex),
      appZ: Number(appStyle.zIndex),
      resultZ: Number(resultStyle.zIndex),
      deviceZ: Number(deviceStyle.zIndex),
      parentIsShell: node.parentElement.parentElement.classList.contains("shell"),
      layerIsFirstChild: node.parentElement.parentElement.firstElementChild === node.parentElement,
    };
  });
  expect(labelPresentation).toMatchObject({pointerEvents: "none", layerPosition: "fixed", parentIsShell: true, layerIsFirstChild: true});
  expect(labelPresentation.layerZ).toBeLessThan(labelPresentation.appZ);
  expect(labelPresentation.layerZ).toBeLessThan(labelPresentation.resultZ);
  expect(labelPresentation.layerZ).toBeLessThan(labelPresentation.deviceZ);

  const labelMetrics = async () => page.evaluate(async (targetId) => {
    const [{state, viewerRef}, THREE] = await Promise.all([
      import("/js/app_state.js?v=20260723-radar-shared-groups"),
      import("/lib/three.module.js"),
    ]);
    const target = state.radar.targets.find((item) => item.id === targetId);
    const label = document.querySelector(`.radarTargetLabel[data-target-id="${targetId}"]`);
    const viewer = viewerRef.current;
    const canvasRect = viewer.canvas.getBoundingClientRect();
    const labelRect = label.getBoundingClientRect();
    const projected = new THREE.Vector3(...target.position).project(viewer.camera);
    const expectedX = canvasRect.left + (projected.x * 0.5 + 0.5) * canvasRect.width;
    const expectedY = canvasRect.top + (-projected.y * 0.5 + 0.5) * canvasRect.height;
    return {
      width: labelRect.width,
      height: labelRect.height,
      scale: Number(label.dataset.scale),
      lane: Number(label.dataset.lane),
      rightOffset: labelRect.left - Number(label.dataset.anchorX),
      projectionError: Math.hypot(Number(label.dataset.anchorX) - expectedX, Number(label.dataset.anchorY) - expectedY),
    };
  }, radarTargetId);
  await expect.poll(async () => (await labelMetrics()).projectionError).toBeLessThanOrEqual(2);
  const nearLabelMetrics = await labelMetrics();
  expect(nearLabelMetrics.projectionError).toBeLessThanOrEqual(2);
  expect(nearLabelMetrics.width).toBeLessThanOrEqual(168);
  expect(nearLabelMetrics.height).toBeLessThanOrEqual(42);
  expect(nearLabelMetrics.scale).toBe(1);
  expect(nearLabelMetrics.rightOffset).toBeGreaterThanOrEqual(11);

  await page.evaluate(async () => {
    const {state, viewerRef} = await import("/js/app_state.js?v=20260723-radar-shared-groups");
    const target = state.radar.targets[0];
    const viewer = viewerRef.current;
    const direction = viewer.camera.position.clone().sub(viewer.controls.target).normalize();
    viewer.camera.position.set(...target.position).addScaledVector(direction, 180);
    viewer.camera.lookAt(viewer.controls.target);
    viewer.controls.update();
  });
  await expect.poll(async () => (await labelMetrics()).scale).toBe(0.6);
  await expect.poll(async () => (await labelMetrics()).projectionError).toBeLessThanOrEqual(2);
  const farLabelMetrics = await labelMetrics();
  expect(farLabelMetrics.scale).toBe(0.6);
  expect(Math.abs(farLabelMetrics.width - nearLabelMetrics.width * 0.6)).toBeLessThanOrEqual(1);
  expect(Math.abs(farLabelMetrics.height - nearLabelMetrics.height * 0.6)).toBeLessThanOrEqual(1);
  expect(farLabelMetrics.rightOffset).toBeGreaterThanOrEqual(11);

  await page.evaluate(async () => {
    const [{state, viewerRef}, THREE] = await Promise.all([
      import("/js/app_state.js?v=20260723-radar-shared-groups"),
      import("/lib/three.module.js"),
    ]);
    const target = state.radar.targets[0];
    window.__radarTargetVisiblePosition = [...target.position];
    const viewer = viewerRef.current;
    const underControls = new THREE.Vector3(-0.75, 0, 0).unproject(viewer.camera);
    const direction = underControls.sub(viewer.camera.position).normalize();
    target.position = viewer.camera.position.clone().addScaledVector(direction, 50).toArray();
  });
  await expect(targetLabel).toBeVisible();
  const coveredByControls = async () => targetLabel.evaluate((node) => {
    const rect = node.getBoundingClientRect();
    const topmost = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
    return Boolean(topmost?.closest("#ui"));
  });
  await expect.poll(coveredByControls).toBe(true);
  await page.evaluate(async () => {
    const {state} = await import("/js/app_state.js?v=20260723-radar-shared-groups");
    state.radar.targets[0].position = window.__radarTargetVisiblePosition;
  });
  await expect(targetLabel).toBeVisible();

  const frameSubscription = await page.evaluate(async () => {
    const {viewerRef} = await import("/js/app_state.js?v=20260723-radar-shared-groups");
    let frameCount = 0;
    const unsubscribe = viewerRef.current.subscribeFrame(() => { frameCount += 1; });
    const waitForFrames = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    await waitForFrames();
    const beforeUnsubscribe = frameCount;
    const firstUnsubscribe = unsubscribe();
    const secondUnsubscribe = unsubscribe();
    await waitForFrames();
    return {beforeUnsubscribe, afterUnsubscribe: frameCount, firstUnsubscribe, secondUnsubscribe};
  });
  expect(frameSubscription.beforeUnsubscribe).toBeGreaterThan(0);
  expect(frameSubscription.afterUnsubscribe).toBe(frameSubscription.beforeUnsubscribe);
  expect(frameSubscription).toMatchObject({firstUnsubscribe: true, secondUnsubscribe: false});

  await page.evaluate(async () => {
    const {state, viewerRef} = await import("/js/app_state.js?v=20260723-radar-shared-groups");
    const viewer = viewerRef.current;
    const target = state.radar.targets[0];
    window.__radarTargetOriginalPosition = [...target.position];
    const forward = viewer.camera.getWorldDirection(viewer.camera.position.clone());
    target.position = viewer.camera.position.clone().addScaledVector(forward, -20).toArray();
  });
  await expect(targetLabel).toBeHidden();
  await page.evaluate(async () => {
    const {state} = await import("/js/app_state.js?v=20260723-radar-shared-groups");
    state.radar.targets[0].position = window.__radarTargetOriginalPosition;
  });
  await expect(targetLabel).toBeVisible();

  await page.locator("#btnPickRadarTx").click();
  await expect(page.locator("#radarTxDeviceCard")).toBeVisible();
  await expect(page.locator("#radarRxDeviceCard")).toBeHidden();
  await expect(page.locator("#devicePrecisionPanel .deviceCoordPanel:not(.hidden)")).toHaveCount(1);
  const precisionBounds = await page.locator("#devicePrecisionPanel").boundingBox();
  expect(precisionBounds.x).toBeGreaterThanOrEqual(0);
  expect(precisionBounds.x + precisionBounds.width).toBeLessThanOrEqual(1280);
  await page.locator("#btnPickRadarTx").click();
  await page.locator("#radarModeMonostatic").check();
  await page.locator("#btnPickRadarTx").click();
  await page.locator("#radarTxX").fill("75");
  await page.locator("#radarTxX").press("Tab");
  await expect(page.locator("#btnPickRadarRx")).toBeHidden();

  await page.locator("#btnSolveRadar").click();
  await expect(page.locator("#radarJobStatus")).toHaveText("SUCCEEDED");
  await expect(page.locator("#radarJobBar")).toBeHidden();
  await expect(page.locator("#ui")).toHaveClass(/panelCollapsed/);
  await expect(page.locator("#radarDetectionList .radarResultRow")).toHaveCount(11);
  await expect(page.locator("#radarDetectionMetric")).toHaveText("1 target detection · 13 total");
  await expect(page.locator("#radarDetectionMore")).toContainText("Show all 12");
  await page.locator("#radarDetectionMore").click();
  await expect(page.locator("#radarDetectionList .radarResultRow")).toHaveCount(13);
  await page.locator("#radarDetectionFilter").selectOption("target");
  await expect(page.locator("#radarDetectionList .radarResultRow")).toHaveCount(1);
  await expect(page.locator("#radarRdTruncated")).toHaveText("DOWNSAMPLED");
  await expect(page.locator("#radarRdRaw")).toHaveClass(/active/);
  await expect(page.locator("#radarRdMean")).toBeEnabled();
  await expect(page.locator("#radarRdIdeal")).toBeEnabled();
  await expect(page.locator("#radarRdFocus")).toHaveClass(/active/);
  await expect(page.locator("#radarRdMeta")).toHaveText("RAW · TARGET DETAIL");
  const processingButtonLayout = await page.locator("#radarRdRaw, #radarRdMean, #radarRdIdeal").evaluateAll((buttons) => buttons.map((button) => ({
    width: button.getBoundingClientRect().width,
    scrollWidth: button.scrollWidth,
    height: button.getBoundingClientRect().height,
    scrollHeight: button.scrollHeight,
  })));
  for (const layout of processingButtonLayout) {
    expect(layout.scrollWidth).toBeLessThanOrEqual(Math.ceil(layout.width));
    expect(layout.scrollHeight).toBeLessThanOrEqual(Math.ceil(layout.height));
  }
  await page.locator("#radarRdMean").click();
  await expect(page.locator("#radarRdMean")).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#radarRdMeta")).toHaveText("MEAN-SUBTRACTED · TARGET DETAIL");
  await expect(page.locator("#radarRdProcessingHint")).toContainText("complex slow-time mean");
  await expect(page.locator("#radarDetectionMetric")).toHaveText("0 target detections · 0 total");
  await expect(page.locator("#radarSnrMetric")).toHaveText("16.0 dB");
  await page.locator("#radarRdIdeal").click();
  await expect(page.locator("#radarRdIdeal")).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#radarRdMeta")).toHaveText("IDEAL CLUTTER-CANCELLED · TARGET DETAIL");
  await expect(page.locator("#radarRdProcessingHint")).toContainText("ideal simulation reference");
  await expect(page.locator("#radarDetectionMetric")).toHaveText("1 target detection · 1 total");
  await expect(page.locator("#radarSnrMetric")).toHaveText("28.0 dB");
  await page.locator("#radarRdRaw").click();
  const radarViewportButtonLayout = await page.locator("#radarRdFocus, #radarRdFull").evaluateAll((buttons) => buttons.map((button) => ({
    whiteSpace: getComputedStyle(button).whiteSpace,
    lineHeight: button.getBoundingClientRect().height,
    scrollHeight: button.scrollHeight,
  })));
  expect(radarViewportButtonLayout).toHaveLength(2);
  for (const layout of radarViewportButtonLayout) {
    expect(layout.whiteSpace).toBe("nowrap");
    expect(layout.scrollHeight).toBeLessThanOrEqual(Math.ceil(layout.lineHeight));
  }
  await page.locator("#radarRdFull").click();
  await expect(page.locator("#radarRdMeta")).toHaveText("RAW · SCENE OVERVIEW");
  await expect(page.locator("#radarRangeDopplerCanvas")).toHaveCSS("background-color", "rgb(247, 249, 252)");
  await expect(page.locator("#radarRdExpand")).toHaveCount(0);
  await expect(page.locator("#radarPanel").getByText("Live Preview", {exact: true})).toHaveCount(0);
  expect(submittedRadar.mode).toBe("monostatic");
  expect(submittedRadar.solver).toMatchObject({samples_per_src: 65536, diffuse_reflection: true});
  expect(submittedRadar.rx.position).toEqual(submittedRadar.tx.position);
  expect(submittedRadar.targets[0]).toMatchObject({position: [96, 44, 30], rcs_m2: 0.025});
  expect(submittedRadar.targets[0].orientation[0]).toBeCloseTo(12 * Math.PI / 180, 6);
  expect(submittedRadar.targets[0].orientation[1]).toBeCloseTo(-7 * Math.PI / 180, 6);
  expect(submittedRadar.targets[0].orientation[2]).toBeCloseTo(Math.PI / 2, 6);
  expect(submittedRadar.targets[0].velocity[0]).toBeCloseTo(0, 6);
  expect(submittedRadar.targets[0].velocity[1]).toBeCloseTo(12, 6);
  expect(submittedRadar.targets[0].velocity[2]).toBeCloseTo(0, 6);

  await page.locator("#radarDetectionList .radarResultRow").click();
  const linkage = await page.evaluate(async () => {
    const {state, viewerRef} = await import("/js/app_state.js?v=20260723-radar-shared-groups");
    return {
      target: state.radar.selectedTargetId,
      detection: state.radar.selectedDetectionId,
      selectedPath: state.radar.selectedPath,
      sharedPaths: viewerRef.current.pathLayer.group.children.length,
      radarPaths: viewerRef.current.layers.get("radar", "paths").group.children.length,
      radarTargetsVisible: viewerRef.current.layers.get("radar", "targets").group.visible,
      radarDetectionMarkers: viewerRef.current.layers.get("radar", "detections").group.children.length,
      targetOverlays: viewerRef.current.layers.get("radar", "target-overlays").group.children.map((group) => ({
        data: group.userData.radarTargetOverlay,
        names: group.children.map((child) => child.name),
      })),
    };
  });
  expect(linkage).toMatchObject({target: submittedRadar.targets[0].id, detection: "det-0", selectedPath: 0, sharedPaths: 0, radarPaths: 2, radarTargetsVisible: true, radarDetectionMarkers: 0});
  expect(linkage.targetOverlays).toHaveLength(1);
  expect(linkage.targetOverlays[0].data).toMatchObject({targetId: submittedRadar.targets[0].id, speedMps: 12, rcsM2: 0.025});
  expect(linkage.targetOverlays[0].names).toEqual([`radar-target-velocity-${submittedRadar.targets[0].id}`]);
  const targetColorContract = await page.evaluate(async () => {
    const [{state, viewerRef}, {drawRadarRangeDoppler}, {radarTargetColor}] = await Promise.all([
      import("/js/app_state.js?v=20260723-radar-shared-groups"),
      import("/js/features/radar/charts.js?v=20260722-radar-color-contract"),
      import("/js/features/radar/colors.js?v=20260722-radar-color-contract"),
    ]);
    const target = state.radar.targets[0];
    const expectedColor = radarTargetColor(target.id);
    const canvas = document.createElement("canvas");
    canvas.style.cssText = "position:fixed;left:-1000px;top:0;width:500px;height:300px";
    document.body.append(canvas);
    const layout = drawRadarRangeDoppler({
      canvas,
      result: state.radar.result,
      rangeDoppler: state.radar.result.range_doppler_focus,
      selectedDetectionId: state.radar.selectedDetectionId,
      selectedTargetId: state.radar.selectedTargetId,
    });
    const points = layout.points.filter((point) => point.targetId === target.id);
    const overlay = viewerRef.current.layers.get("radar", "target-overlays").group.children[0];
    const label = document.querySelector(`.radarTargetLabel[data-target-id="${target.id}"]`);
    const connector = document.querySelector(`.radarTargetConnector[data-target-id="${target.id}"]`);
    const legend = document.getElementById("radarPlotLegend");
    const clutterLegendStyle = getComputedStyle(legend.querySelector(".clutter"), "::before");
    const result = {
      expectedColor,
      pointTypes: points.map((point) => point.type).sort(),
      pointColors: [...new Set(points.map((point) => point.color))],
      overlayColor: overlay.userData.radarTargetOverlay.displayColor,
      labelColor: label.style.getPropertyValue("--radar-target-label-accent"),
      connectorColor: connector.style.stroke,
      legendColor: getComputedStyle(legend).getPropertyValue("--radar-legend-target-color").trim(),
      legendTargetId: legend.dataset.targetId,
      legendItems: [...legend.children].map((item) => item.textContent.trim()),
      clutterLegendFill: clutterLegendStyle.backgroundColor,
      clutterLegendBorder: `${clutterLegendStyle.borderStyle} ${clutterLegendStyle.borderColor}`,
    };
    canvas.remove();
    return result;
  });
  expect(targetColorContract).toEqual({
    expectedColor: "#16886e",
    pointTypes: ["detection", "target"],
    pointColors: ["#16886e"],
    overlayColor: "#16886e",
    labelColor: "#16886e",
    connectorColor: "rgb(22, 136, 110)",
    legendColor: "#16886e",
    legendTargetId: submittedRadar.targets[0].id,
    legendItems: ["Ground truth", "Associated detection", "Clutter detection", "Power (dBm)"],
    clutterLegendFill: "rgba(0, 0, 0, 0)",
    clutterLegendBorder: "solid rgb(113, 130, 153)",
  });
  await expect(page.locator(".radarTargetLabel")).toHaveCount(1);
  await expect(page.locator(`.radarTargetLabel[data-target-id="${submittedRadar.targets[0].id}"]`)).toContainText("RCS 0.025 m²");
  await page.locator("#radarPathDisplayMode").evaluate((select) => {
    select.value = "target";
    select.dispatchEvent(new Event("change", {bubbles: true}));
  });
  expect(await page.evaluate(async () => {
    const {viewerRef} = await import("/js/app_state.js?v=20260723-radar-shared-groups");
    return viewerRef.current.layers.get("radar", "paths").group.children.length;
  })).toBe(1);
  expect(await page.locator("#radarPanel, #radarResultSections").allTextContents()).not.toEqual(expect.arrayContaining([expect.stringMatching(/download|export/i)]));
  await page.setViewportSize({width: 1280, height: 720});
  await expect(page.locator("#radarPanel")).toBeVisible();
  expect(await page.locator(".radarVectorGrid").first().evaluate((node) => getComputedStyle(node).gridTemplateColumns.split(" ").length)).toBe(3);
  expect((await page.locator("#radarRangeDopplerCanvas").boundingBox()).width).toBeGreaterThan(300);
  const narrowDesktopLayout = await page.evaluate(() => {
    const rect = (selector) => document.querySelector(selector).getBoundingClientRect().toJSON();
    const overlaps = (left, right) => left.left < right.right && left.right > right.left && left.top < right.bottom && left.bottom > right.top;
    const control = rect("#ui");
    const results = rect("#linkChannelSection");
    const devices = rect("#deviceDock");
    return {
      controlResultsOverlap: overlaps(control, results),
      controlDevicesOverlap: overlaps(control, devices),
      resultsDevicesOverlap: overlaps(results, devices),
      devicesWithinViewport: devices.left >= 0 && devices.right <= innerWidth && devices.bottom <= innerHeight,
    };
  });
  expect(narrowDesktopLayout).toEqual({
    controlResultsOverlap: false,
    controlDevicesOverlap: false,
    resultsDevicesOverlap: false,
    devicesWithinViewport: true,
  });

  await page.evaluate(() => {
    window.__radarRetainedLabel = document.querySelector(".radarTargetLabel");
  });
  for (let index = 1; index < 16; index += 1) {
    await page.locator("#btnAddRadarTarget").evaluate((button) => button.click());
  }
  await expect(page.locator("#btnAddRadarTarget")).toBeDisabled();
  await expect(page.locator("#radarAssetPickerHint")).toHaveText("Maximum 16 targets reached.");
  await expect(page.locator("#radarAssetPickerHint")).toBeVisible();
  await expect(page.locator(".radarTargetLabel")).toHaveCount(16);
  await expect(page.locator(".radarTargetLabel.selected")).toHaveCount(1);
  expect(await page.evaluate(() => window.__radarRetainedLabel === document.querySelector(".radarTargetLabel"))).toBe(true);
  await page.setViewportSize({width: 1280, height: 800});
  await page.evaluate(async () => {
    const {state, viewerRef} = await import("/js/app_state.js?v=20260723-radar-shared-groups");
    const sharedPosition = [96, 44, 30];
    for (const target of state.radar.targets) target.position = [...sharedPosition];
    const viewer = viewerRef.current;
    viewer.controls.target.set(...sharedPosition);
    viewer.camera.position.set(sharedPosition[0] - 28, sharedPosition[1] - 36, sharedPosition[2] + 22);
    viewer.camera.lookAt(viewer.controls.target);
    viewer.controls.update();
  });
  await expect(page.locator('.radarTargetLabel[data-visible="true"]')).toHaveCount(16);
  const sixteenTargetLayout = await page.locator('.radarTargetLabel[data-visible="true"]').evaluateAll((nodes) => {
    const labels = nodes.map((node) => ({
      anchorX: Number(node.dataset.anchorX),
      lane: Number(node.dataset.lane),
      rect: node.getBoundingClientRect().toJSON(),
    }));
    const overlapPairs = [];
    for (let first = 0; first < labels.length; first += 1) {
      for (let second = first + 1; second < labels.length; second += 1) {
        const left = labels[first].rect; const right = labels[second].rect;
        if (left.left < right.right && left.right > right.left && left.top < right.bottom && left.bottom > right.top) {
          overlapPairs.push([first, second]);
        }
      }
    }
    return {
      overlapPairs,
      allRight: labels.every(({anchorX, rect}) => rect.left >= anchorX + 11),
      lanes: labels.map(({lane}) => lane),
    };
  });
  expect(sixteenTargetLayout.overlapPairs).toEqual([]);
  expect(sixteenTargetLayout.allRight).toBe(true);
  expect(sixteenTargetLayout.lanes.every(Number.isInteger)).toBe(true);
  await expect(page.locator('.radarTargetConnector:not(.hidden)')).toHaveCount(16);
  await page.locator("#btnRemoveRadarTarget").evaluate((button) => button.click());
  await expect(page.locator(".radarTargetLabel")).toHaveCount(15);
  await expect(page.locator("#btnAddRadarTarget")).toBeEnabled();
  await page.locator("#btnAddRadarTarget").evaluate((button) => button.click());
  await expect(page.locator(".radarTargetLabel")).toHaveCount(16);
  expect(await page.evaluate(async () => {
    const {viewerRef} = await import("/js/app_state.js?v=20260723-radar-shared-groups");
    return viewerRef.current.frameListeners.size;
  })).toBe(1);

  await activateMode(page, "link");
  const inactiveRadar = await page.evaluate(async () => {
    const {viewerRef} = await import("/js/app_state.js?v=20260723-radar-shared-groups");
    return {
      layersHidden: viewerRef.current.layers.layersFor("radar").every((layer) => !layer.group.visible),
      labelsHidden: document.querySelector(".radarTargetLabelLayer").classList.contains("hidden"),
      frameListeners: viewerRef.current.frameListeners.size,
    };
  });
  expect(inactiveRadar).toEqual({layersHidden: true, labelsHidden: true, frameListeners: 0});
  await activateMode(page, "radar");
  await expect(page.locator(".radarTargetLabelLayer")).toBeVisible();
  expect(await page.evaluate(async () => {
    const {viewerRef} = await import("/js/app_state.js?v=20260723-radar-shared-groups");
    return viewerRef.current.frameListeners.size;
  })).toBe(1);
  const viewerReplacement = await page.evaluate(async () => {
    const [{Viewer}, {viewerRef}] = await Promise.all([
      import("/js/viewer.js"),
      import("/js/app_state.js?v=20260723-radar-shared-groups"),
    ]);
    const previousViewer = viewerRef.current;
    const previousLabelLayer = document.querySelector(".radarTargetLabelLayer");
    const replacementCanvas = document.createElement("canvas");
    replacementCanvas.style.position = "fixed";
    replacementCanvas.style.inset = "0";
    replacementCanvas.style.visibility = "hidden";
    document.body.append(replacementCanvas);
    const replacementViewer = new Viewer(replacementCanvas);
    replacementViewer.__ready = true;
    replacementViewer.loadedTileIds.add("replacement-fixture-tile");
    viewerRef.current = replacementViewer;
    document.querySelector("#radarTargetList .radarTargetCard").click();
    await new Promise((resolve) => setTimeout(resolve, 80));
    return {
      previousFrameListeners: previousViewer.frameListeners.size,
      replacementFrameListeners: replacementViewer.frameListeners.size,
      previousLayerConnected: previousLabelLayer.isConnected,
      labelLayerCount: document.querySelectorAll(".radarTargetLabelLayer").length,
      labelCount: document.querySelectorAll(".radarTargetLabel").length,
    };
  });
  expect(viewerReplacement).toEqual({
    previousFrameListeners: 0,
    replacementFrameListeners: 1,
    previousLayerConnected: false,
    labelLayerCount: 1,
    labelCount: 16,
  });
  await activateMode(page, "link");
  expect(await page.evaluate(async () => {
    const {viewerRef} = await import("/js/app_state.js?v=20260723-radar-shared-groups");
    return viewerRef.current.frameListeners.size;
  })).toBe(0);
});

test("Radar jobs cancel, invalidate stale work and expose retryable failures", async ({page}) => {
  let createCount = 0;
  let radarStatusCallCount = 0;
  let releaseSecondRadarProgress;
  const secondRadarProgress = new Promise((resolve) => {
    releaseSecondRadarProgress = resolve;
  });
  const cancelled = [];
  await page.route("**/assets/radar/drones/manifest.json", (route) => route.fulfill({json: {schema_version: 1, assets: []}}));
  await page.route("**/api/radar/jobs", async (route) => {
    createCount += 1;
    await route.fulfill({status: 202, json: {ok: true, job_id: `radar-state-${createCount}`, status: "queued", scene_generation: 7}});
  });
  await page.route("**/api/radar/jobs/radar-state-1/cancel", async (route) => {
    cancelled.push("radar-state-1");
    await route.fulfill({json: {job_id: "radar-state-1", status: "cancelled", progress: 1, message: "Cancelled"}});
  });
  await page.route("**/api/radar/jobs/radar-state-1", async (route) => {
    radarStatusCallCount += 1;
    if (radarStatusCallCount > 1) await secondRadarProgress;
    const progress = radarStatusCallCount > 1 ? 0.4 : 0.15;
    const message = radarStatusCallCount > 1 ? "Tracing" : "Solving Radar propagation paths";
    await route.fulfill({json: {job_id: "radar-state-1", status: "running", progress, message, scene_generation: 7}});
  });
  await page.route("**/api/radar/jobs/radar-state-2", (route) => route.fulfill({json: {job_id: "radar-state-2", status: "failed", progress: 1, message: "Failed", error: "fixture processing failure", scene_generation: 7}}));

  await openDeterministicApp(page);
  await enableRealViewer(page);
  await configureRadarFixture(page, {targets: false});
  await activateMode(page, "radar");
  await page.locator("#radarWaveformGroup > summary").click();
  await page.locator("#btnSolveRadar").click();
  await expect(page.locator("#btnCancelRadar")).toBeVisible();
  await expect(page.locator("#loadingPhase")).toHaveText("Solving Radar propagation paths");
  await expect(page.locator("#bar")).not.toHaveClass(/indeterminate/);
  await expect.poll(() => page.locator("#bar").evaluate((node) => node.style.width)).toBe("15%");
  await expect(page.locator("#radarJobProgress")).toHaveJSProperty("value", 0.15);
  releaseSecondRadarProgress();
  await expect(page.locator("#loadingPhase")).toHaveText("Tracing");
  await expect.poll(() => page.locator("#bar").evaluate((node) => node.style.width)).toBe("40%");
  await expect(page.locator("#radarJobProgress")).toHaveJSProperty("value", 0.4);
  await page.locator("#radarBandwidth").evaluate((input) => {
    input.value = "64";
    input.dispatchEvent(new Event("change", {bubbles: true}));
  });
  await expect.poll(() => cancelled.length).toBe(1);
  await expect(page.locator("#radarJobStatus")).toHaveText("IDLE");
  await expect(page.locator("#radarJobBar")).toBeHidden();
  await expect(page.locator("#radarResultSections")).toBeHidden();

  await page.locator("#btnSolveRadar").click();
  await expect(page.locator("#radarJobStatus")).toHaveText("FAILED");
  await expect(page.locator("#radarJobBar")).toBeVisible();
  await expect(page.locator("#radarInputError")).toContainText("fixture processing failure");
  await expect(page.locator("#btnRetryRadar")).toBeVisible();
});

test("scene re-entry deactivates Radar before restoring Link controls", async ({page}) => {
  await openDeterministicApp(page);
  const result = await page.evaluate(async () => {
    const [{createSceneLoaderController}, {defineFeature, FeatureRegistry, FeatureStore}] = await Promise.all([
      import("/js/controllers/scene_loader_controller.js?v=20260519-mode-isolation"),
      import("/js/core/feature_registry.js"),
    ]);
    const lifecycle = [];
    const parameterHost = document.createElement("div");
    const link = defineFeature({
      id: "link",
      order: 10,
      title: "Link Analysis",
      createState: () => ({}),
      createFeature: () => ({
        activate() {
          lifecycle.push("link:activate");
        },
      }),
    });
    const radar = defineFeature({
      id: "radar",
      order: 20,
      title: "Radar Sensing",
      createState: () => ({}),
      createFeature: () => ({
        activate() {
          lifecycle.push("radar:activate");
          parameterHost.classList.add("radarFullMode");
        },
        deactivate() {
          lifecycle.push("radar:deactivate");
          parameterHost.classList.remove("radarFullMode");
        },
      }),
    });
    const definitions = [link, radar];
    const registry = new FeatureRegistry({
      definitions,
      store: new FeatureStore(definitions),
    });
    const state = {
      entry: {sceneReady: false},
      mode: "link",
      panelCollapsed: true,
      pickTarget: "radar-target",
      tileLoadBusy: false,
      manifest: null,
    };
    const context = {
      api: {},
      features: registry,
      state,
      ui: {panel: document.createElement("aside")},
    };
    registry.initialize(context);
    registry.activate("radar", context);

    const renderStates = [];
    const viewer = {
      focusOnTiles() {},
    };
    const controller = createSceneLoaderController(context, {
      ensureViewer: async () => viewer,
      getViewer: () => viewer,
      hideEntryScreen() {},
      hideOverlay() {},
      renderAll() {
        renderStates.push({
          active: registry.active()?.id,
          mode: state.mode,
          radarFullMode: parameterHost.classList.contains("radarFullMode"),
        });
      },
      setProgress() {},
      showOverlay() {},
      solver: () => ({}),
      syncControlSidebarUi() {},
      syncPerformanceUi() {},
      syncTileListUi() {},
      syncViewerMarkers() {},
      tileSelectionView: {
        tileSelections: () => ["fixture-tile"],
      },
    });
    await controller.enterScene();
    return {
      active: registry.active()?.id,
      lifecycle,
      mode: state.mode,
      panelCollapsed: state.panelCollapsed,
      pickTarget: state.pickTarget,
      radarFullMode: parameterHost.classList.contains("radarFullMode"),
      renderStates,
    };
  });

  expect(result).toEqual({
    active: "link",
    lifecycle: ["radar:activate", "radar:deactivate", "link:activate"],
    mode: "link",
    panelCollapsed: false,
    pickTarget: null,
    radarFullMode: false,
    renderStates: [{active: "link", mode: "link", radarFullMode: false}],
  });
});

test("feature registry accepts a virtual domain feature without template injection", async ({page}) => {
  await openDeterministicApp(page);
  const result = await page.evaluate(async () => {
    const {defineFeature, FeatureRegistry, FeatureStore} = await import("/js/core/feature_registry.js");
    const virtual = defineFeature({
      id: "virtual",
      order: 5,
      title: "Virtual",
      createState: () => ({ready: true}),
      queryDom: (root) => ({panel: root.getElementById("ui")}),
      createTransport: () => ({kind: "transport"}),
      createResultView: () => ({viewReady: true}),
      createController: () => ({controllerReady: true}),
      createRenderer: () => ({rendererReady: true}),
      createFeature: ({featureState}) => ({activate: () => { featureState.activated = true; }}),
    });
    const store = new FeatureStore([virtual]);
    const registry = new FeatureRegistry({definitions: [virtual], store});
    registry.initialize({documentRoot: document});
    registry.activate("virtual");
    const instance = registry.instance("virtual");
    return {
      ids: registry.definitions().map((item) => item.id),
      state: store.get("virtual"),
      panel: instance.dom.panel.id,
      transport: registry.transport("virtual").kind,
      components: [instance.viewReady, instance.controllerReady, instance.rendererReady],
    };
  });
  expect(result).toEqual({
    ids: ["virtual"],
    state: {ready: true, activated: true},
    panel: "ui",
    transport: "transport",
    components: [true, true, true],
  });
});

test("layer and asset managers isolate, cache and dispose resources", async ({page}) => {
  await openDeterministicApp(page);
  const result = await page.evaluate(async () => {
    const THREE = await import("/lib/three.module.js");
    const {SceneLayerManager} = await import("/js/viewer/layer_manager.js");
    const {AssetManager} = await import("/js/viewer/asset_manager.js");

    const scene = new THREE.Scene();
    const layers = new SceneLayerManager(scene);
    const left = layers.create("left", "mesh");
    const right = layers.create("right", "mesh");
    let layerGeometryDisposed = 0;
    const nested = new THREE.Group();
    const nestedMesh = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial());
    nestedMesh.geometry.dispose = () => { layerGeometryDisposed += 1; };
    nested.add(nestedMesh);
    left.add(nested);
    right.add(new THREE.Group());
    left.clear();
    layers.setFeatureVisible("right", false);

    let gltfLoads = 0;
    let assetGeometryDisposed = 0;
    const source = new THREE.Group();
    const sourceMesh = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshStandardMaterial({color: "#123456"}));
    sourceMesh.geometry.dispose = () => { assetGeometryDisposed += 1; };
    source.add(sourceMesh);
    const assets = new AssetManager({
      gltfLoader: {loadAsync: async () => { gltfLoads += 1; return {scene: source}; }},
      plyLoader: {load: () => {}},
    });
    assets.register({id: "a", url: "/fixture.glb", format: "glb", units: 2, upAxis: "Z", pivot: "origin"});
    assets.register({id: "b", url: "/fixture.glb", format: "glb", units: 3, upAxis: "Z", pivot: "origin"});
    const [a, b] = await Promise.all([
      assets.instantiate("a", {position: [1, 2, 3]}),
      assets.instantiate("b", {scale: [2, 2, 2]}),
    ]);
    const transform = {position: a.position.toArray(), scale: b.scale.toArray()};
    const materialPreserved = a.children[0].material.color.getHexString() === "123456";
    assets.release(a);
    assets.clearCache();
    const retainedWhileReferenced = assetGeometryDisposed === 0;
    assets.release(b);

    let recoveryAttempts = 0;
    const recoveringAssets = new AssetManager({
      gltfLoader: {
        loadAsync: async () => {
          recoveryAttempts += 1;
          if (recoveryAttempts === 1) throw new Error("fixture load failed");
          return {scene: new THREE.Group()};
        },
      },
      plyLoader: {load: () => {}},
    });
    recoveringAssets.register({id: "recover", url: "/recover.glb", format: "glb"});
    let firstLoadFailed = false;
    try {
      await recoveringAssets.preload("recover");
    } catch (_error) {
      firstLoadFailed = true;
    }
    const recovered = await recoveringAssets.preload("recover");

    return {
      layerGeometryDisposed,
      rightVisible: right.group.visible,
      leftCount: left.group.children.length,
      rightCount: right.group.children.length,
      gltfLoads,
      transform,
      materialPreserved,
      retainedWhileReferenced,
      assetGeometryDisposed,
      firstLoadFailed,
      recoveryAttempts,
      recovered: recovered.isGroup,
    };
  });
  expect(result).toEqual({
    layerGeometryDisposed: 1,
    rightVisible: false,
    leftCount: 0,
    rightCount: 1,
    gltfLoads: 1,
    transform: {position: [1, 2, 3], scale: [6, 6, 6]},
    materialPreserved: true,
    retainedWhileReferenced: true,
    assetGeometryDisposed: 1,
    firstLoadFailed: true,
    recoveryAttempts: 2,
    recovered: true,
  });
});

test("asset manager loads real uncompressed GLB and PLY fixtures", async ({page}) => {
  await openDeterministicApp(page);
  const result = await page.evaluate(async () => {
    const {AssetManager} = await import("/js/viewer/asset_manager.js");

    function bytesToDataUrl(bytes, mimeType) {
      let binary = "";
      for (let offset = 0; offset < bytes.length; offset += 0x8000) {
        binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
      }
      return `data:${mimeType};base64,${btoa(binary)}`;
    }

    function triangleGlbUrl() {
      const gltf = {
        asset: {version: "2.0"},
        buffers: [{byteLength: 36}],
        bufferViews: [{buffer: 0, byteOffset: 0, byteLength: 36, target: 34962}],
        accessors: [{bufferView: 0, componentType: 5126, count: 3, type: "VEC3", min: [0, 0, 0], max: [1, 1, 0]}],
        meshes: [{primitives: [{attributes: {POSITION: 0}}]}],
        nodes: [{mesh: 0}],
        scenes: [{nodes: [0]}],
        scene: 0,
      };
      const encodedJson = new TextEncoder().encode(JSON.stringify(gltf));
      const jsonLength = Math.ceil(encodedJson.length / 4) * 4;
      const binary = new Uint8Array(36);
      new Float32Array(binary.buffer).set([0, 0, 0, 1, 0, 0, 0, 1, 0]);
      const totalLength = 12 + 8 + jsonLength + 8 + binary.length;
      const glb = new Uint8Array(totalLength);
      const view = new DataView(glb.buffer);
      view.setUint32(0, 0x46546c67, true);
      view.setUint32(4, 2, true);
      view.setUint32(8, totalLength, true);
      view.setUint32(12, jsonLength, true);
      view.setUint32(16, 0x4e4f534a, true);
      glb.fill(0x20, 20, 20 + jsonLength);
      glb.set(encodedJson, 20);
      const binaryHeader = 20 + jsonLength;
      view.setUint32(binaryHeader, binary.length, true);
      view.setUint32(binaryHeader + 4, 0x004e4942, true);
      glb.set(binary, binaryHeader + 8);
      return bytesToDataUrl(glb, "model/gltf-binary");
    }

    const plyText = [
      "ply", "format ascii 1.0", "element vertex 3",
      "property float x", "property float y", "property float z",
      "element face 1", "property list uchar int vertex_indices", "end_header",
      "0 0 0", "1 0 0", "0 1 0", "3 0 1 2", "",
    ].join("\n");
    const assets = new AssetManager();
    assets.register({
      id: "triangle-glb",
      url: triangleGlbUrl(),
      format: "glb",
      units: 1,
      upAxis: "Z",
      pivot: "origin",
      license: {name: "test fixture", source: "generated", attribution: "OpenAirTwin tests"},
    });
    assets.register({
      id: "triangle-ply",
      url: `data:application/octet-stream,${encodeURIComponent(plyText)}`,
      format: "ply",
      material: {color: "#336699", roughness: 0.5, metalness: 0.1},
    });
    const [glb, ply] = await Promise.all([
      assets.instantiate("triangle-glb", {position: [1, 2, 3]}),
      assets.instantiate("triangle-ply", {scale: [2, 2, 2]}),
    ]);
    let glbVertices = 0;
    let plyVertices = 0;
    let plyColor = null;
    glb.traverse((child) => { glbVertices += child.geometry?.getAttribute?.("position")?.count || 0; });
    ply.traverse((child) => {
      plyVertices += child.geometry?.getAttribute?.("position")?.count || 0;
      if (child.material?.color) plyColor = child.material.color.getHexString();
    });
    const descriptorLicense = assets.descriptor("triangle-glb").license.name;
    assets.release(glb);
    assets.release(ply);
    assets.clearCache();
    return {
      glbVertices,
      plyVertices,
      plyColor,
      glbPosition: glb.position.toArray(),
      plyScale: ply.scale.toArray(),
      descriptorLicense,
    };
  });
  expect(result).toEqual({
    glbVertices: 3,
    plyVertices: 3,
    plyColor: "336699",
    glbPosition: [1, 2, 3],
    plyScale: [2, 2, 2],
    descriptorLicense: "test fixture",
  });
});

test("radar drone assets load, instantiate, align and release through AssetManager", async ({page}) => {
  test.setTimeout(120_000);
  await openDeterministicApp(page);
  const result = await page.evaluate(async () => {
    const THREE = await import("/lib/three.module.js");
    const {AssetManager} = await import("/js/viewer/asset_manager.js");
    const response = await fetch("/assets/radar/drones/manifest.json");
    if (!response.ok) throw new Error(`Radar asset manifest request failed: ${response.status}`);
    const manifest = await response.json();
    const assets = new AssetManager();
    const observations = [];

    for (const descriptor of manifest.assets) {
      assets.register({
        id: descriptor.id,
        url: descriptor.visual.url,
        format: descriptor.visual.format,
        units: 1,
        upAxis: "Z",
        pivot: "origin",
        license: descriptor.license,
      });
      const instance = await assets.instantiate(descriptor.id);
      const bounds = new THREE.Box3().setFromObject(instance);
      const size = bounds.getSize(new THREE.Vector3()).toArray();
      const center = bounds.getCenter(new THREE.Vector3()).toArray();
      let meshCount = 0;
      let texturedMeshCount = 0;
      instance.traverse((child) => {
        if (!child.isMesh) return;
        meshCount += 1;
        const materials = Array.isArray(child.material) ? child.material : [child.material];
        if (materials.some((material) => material?.map)) texturedMeshCount += 1;
      });
      observations.push({
        id: descriptor.id,
        size,
        expectedSize: descriptor.visual.bounds_m.size,
        center,
        meshCount,
        texturedMeshCount,
        attribution: assets.descriptor(descriptor.id).license.attribution,
        released: assets.release(instance),
      });
    }

    assets.clearCache();
    return {
      schemaVersion: manifest.schema_version,
      releaseStatus: manifest.release_gate.status,
      alignmentToleranceM: manifest.limits.alignment_tolerance_m,
      observations,
      cachedAssets: assets._records.size,
      cachedSources: assets._sourceRecords.size,
    };
  });

  expect(result.schemaVersion).toBe(1);
  expect(result.releaseStatus).toBe("approved");
  expect(result.observations.map((item) => item.id)).toEqual([
    "dji-air-2s",
    "dji-mavic-3-cine",
    "dji-mini-3",
    "dji-mini-3-pro",
  ]);
  for (const observation of result.observations) {
    expect(observation.released).toBe(true);
    expect(observation.meshCount).toBeGreaterThan(0);
    expect(observation.texturedMeshCount).toBeGreaterThan(0);
    expect(observation.attribution.length).toBeGreaterThan(0);
    observation.center.forEach((value) => expect(Math.abs(value)).toBeLessThan(result.alignmentToleranceM));
    observation.size.forEach((value, index) => {
      expect(Math.abs(value - observation.expectedSize[index])).toBeLessThan(result.alignmentToleranceM);
    });
  }
  expect(result.cachedAssets).toBe(0);
  expect(result.cachedSources).toBe(0);
});

test("radar target scene keeps visual transforms and IDs stable while releasing instances", async ({page}) => {
  test.setTimeout(120_000);
  await openDeterministicApp(page);
  const result = await page.evaluate(async () => {
    const THREE = await import("/lib/three.module.js");
    const {AssetManager} = await import("/js/viewer/asset_manager.js");
    const {RadarTargetScene} = await import("/js/features/radar/target_scene.js");
    const manifest = await fetch("/assets/radar/drones/manifest.json").then((response) => response.json());
    const assets = new AssetManager();
    for (const descriptor of manifest.assets) {
      assets.register({
        id: descriptor.id,
        url: descriptor.visual.url,
        format: descriptor.visual.format,
        units: 1,
        upAxis: "Z",
        pivot: "origin",
        license: descriptor.license,
      });
    }

    const group = new THREE.Group();
    const targets = new RadarTargetScene({assetManager: assets, group});
    await targets.sync([
      {
        id: "alpha",
        asset_id: "dji-mini-3",
        position: [20, 1, 10],
        orientation: [0, 0, 0],
        velocity: [8, 0, 0],
        rcs_m2: 0.02,
      },
      {
        id: "bravo",
        asset_id: "dji-air-2s",
        position: [50, -2, 15],
        orientation: [0.1, 0.2, 0.3],
        velocity: [0, -4, 1],
        rcs_m2: 0.04,
      },
    ]);
    const firstAlpha = targets.instanceForTarget("alpha");
    const firstBravo = targets.instanceForTarget("bravo");
    const alphaSize = new THREE.Box3().setFromObject(firstAlpha).getSize(new THREE.Vector3()).toArray();
    const expectedAlphaSize = manifest.assets.find((item) => item.id === "dji-mini-3").visual.bounds_m.size;
    const initial = {
      size: targets.size,
      children: group.children.length,
      alphaName: firstAlpha.name,
      alphaPosition: firstAlpha.position.toArray(),
      alphaSize,
      expectedAlphaSize,
      bravoTargetId: targets.targetIdForVisualInstance("radar-target-visual-bravo"),
      bravoSionnaName: firstBravo.userData.radarSionnaObjectName,
      bravoVelocity: firstBravo.userData.radarVelocityMps,
    };

    await targets.sync([
      {
        id: "alpha",
        asset_id: "dji-mini-3",
        position: [20, 1, 10],
        orientation: [0, 0, Math.PI / 2],
        velocity: [0, 8, 0],
        rcs_m2: 0.02,
      },
      {
        id: "bravo",
        asset_id: "dji-air-2s",
        position: [50, -2, 15],
        orientation: [0.1, 0.2, 0.3],
        velocity: [0, -4, 1],
        rcs_m2: 0.04,
      },
    ]);
    const alignedAlpha = targets.instanceForTarget("alpha");
    const alignedHeading = {
      reusedAlpha: alignedAlpha === firstAlpha,
      forward: new THREE.Vector3(1, 0, 0).applyQuaternion(alignedAlpha.quaternion).toArray(),
      velocity: alignedAlpha.userData.radarVelocityMps,
    };

    await targets.sync([
      {
        id: "alpha",
        asset_id: "dji-mini-3",
        position: [80, 3, 20],
        orientation: [0.4, 0.5, 0.6],
        velocity: [-5, 0, 0],
        rcs_m2: 0.03,
      },
      {
        id: "charlie",
        asset_id: "dji-mavic-3-cine",
        position: [100, 0, 30],
        orientation: [0, 0, 0],
        velocity: [0, 0, 0],
        rcs_m2: 0.05,
      },
    ]);
    const updatedAlpha = targets.instanceForTarget("alpha");
    const updated = {
      size: targets.size,
      children: group.children.length,
      reusedAlpha: updatedAlpha === firstAlpha,
      alphaPosition: updatedAlpha.position.toArray(),
      alphaOrientation: [updatedAlpha.rotation.x, updatedAlpha.rotation.y, updatedAlpha.rotation.z],
      alphaVelocity: updatedAlpha.userData.radarVelocityMps,
      removedBravoParent: firstBravo.parent,
      ids: targets.snapshot().map((target) => ({
        id: target.id,
        visual: target.visualInstanceId,
        sionna: target.sionnaObjectName,
      })),
    };

    const alphaBeforeDispose = targets.instanceForTarget("alpha");
    targets.dispose();
    assets.clearCache();

    let resolveDelayedInstance;
    let delayedReleaseCount = 0;
    const delayedAssets = {
      instantiate: () => new Promise((resolve) => { resolveDelayedInstance = resolve; }),
      release: (instance) => {
        delayedReleaseCount += 1;
        instance.removeFromParent();
        return true;
      },
    };
    const delayedGroup = new THREE.Group();
    const delayedTargets = new RadarTargetScene({assetManager: delayedAssets, group: delayedGroup});
    const delayedSync = delayedTargets.sync([{
      id: "delayed",
      asset_id: "dji-mini-3",
      position: [20, 0, 10],
      orientation: [0, 0, 0],
      velocity: [0, 0, 0],
      rcs_m2: 0.01,
    }]);
    delayedTargets.dispose();
    resolveDelayedInstance(new THREE.Group());
    await delayedSync;
    return {
      initial,
      alignedHeading,
      updated,
      disposed: {
        size: targets.size,
        children: group.children.length,
        alphaParent: alphaBeforeDispose.parent,
        cachedAssets: assets._records.size,
        cachedSources: assets._sourceRecords.size,
      },
      staleAsyncLoad: {
        size: delayedTargets.size,
        children: delayedGroup.children.length,
        releaseCount: delayedReleaseCount,
      },
      alignmentToleranceM: manifest.limits.alignment_tolerance_m,
    };
  });

  expect(result.initial.size).toBe(2);
  expect(result.initial.children).toBe(2);
  expect(result.initial.alphaName).toBe("radar-target-visual-alpha");
  expect(result.initial.alphaPosition).toEqual([20, 1, 10]);
  expect(result.initial.bravoTargetId).toBe("bravo");
  expect(result.initial.bravoSionnaName).toBe("radar-target-bravo");
  expect(result.initial.bravoVelocity).toEqual([0, -4, 1]);
  result.initial.alphaSize.forEach((value, index) => {
    expect(Math.abs(value - result.initial.expectedAlphaSize[index])).toBeLessThan(
      result.alignmentToleranceM,
    );
  });
  expect(result.alignedHeading.reusedAlpha).toBe(true);
  expect(result.alignedHeading.velocity).toEqual([0, 8, 0]);
  expect(result.alignedHeading.forward[0]).toBeCloseTo(0, 6);
  expect(result.alignedHeading.forward[1]).toBeCloseTo(1, 6);
  expect(result.alignedHeading.forward[2]).toBeCloseTo(0, 6);
  expect(result.updated.size).toBe(2);
  expect(result.updated.children).toBe(2);
  expect(result.updated.reusedAlpha).toBe(true);
  expect(result.updated.alphaPosition).toEqual([80, 3, 20]);
  expect(result.updated.alphaOrientation).toEqual([0.4, 0.5, 0.6]);
  expect(result.updated.alphaVelocity).toEqual([-5, 0, 0]);
  expect(result.updated.removedBravoParent).toBe(null);
  expect(result.updated.ids).toEqual([
    {id: "alpha", visual: "radar-target-visual-alpha", sionna: "radar-target-alpha"},
    {id: "charlie", visual: "radar-target-visual-charlie", sionna: "radar-target-charlie"},
  ]);
  expect(result.disposed).toEqual({
    size: 0,
    children: 0,
    alphaParent: null,
    cachedAssets: 0,
    cachedSources: 0,
  });
  expect(result.staleAsyncLoad).toEqual({size: 0, children: 0, releaseCount: 1});
});

test("Radar chart renders the maximum bounded matrix without a call-stack overflow", async ({page}) => {
  await openDeterministicApp(page);
  const rendered = await page.evaluate(async () => {
    const {drawRadarRangeDoppler} = await import("/js/features/radar/charts.js");
    const canvas = document.createElement("canvas");
    canvas.style.width = "900px";
    canvas.style.height = "420px";
    document.body.append(canvas);
    const rangeBins = 512;
    const dopplerBins = 256;
    const rangeAxis = Array.from({length: rangeBins}, (_, index) => index * 1.17);
    const dopplerAxis = Array.from({length: dopplerBins}, (_, index) => (index - dopplerBins / 2) * 122.1);
    const matrix = Array.from({length: dopplerBins}, (_, row) => Array.from(
      {length: rangeBins},
      (_, column) => -130 + ((row * 17 + column * 13) % 61),
    ));
    const layout = drawRadarRangeDoppler({
      canvas,
      result: {targets: [], detections: [], radar: {carrier_frequency_hz: 5.8e9}},
      rangeDoppler: {
        equivalent_range_axis_m: rangeAxis,
        doppler_axis_hz: dopplerAxis,
        power_dbm: matrix,
      },
    });
    return {width: canvas.width, height: canvas.height, rangeBins: layout.ranges.length, dopplerBins: layout.dopplers.length};
  });
  expect(rendered).toMatchObject({rangeBins: 512, dopplerBins: 256});
  expect(rendered.width).toBeGreaterThan(0);
  expect(rendered.height).toBeGreaterThan(0);
});

test("Radar overview and focus share a signal-aware power scale", async ({page}) => {
  await openDeterministicApp(page);
  const scale = await page.evaluate(async () => {
    const {radarPowerScale} = await import("/js/features/radar/charts.js");
    const powerDbm = Array.from({length: 100}, (_, row) => Array.from(
      {length: 100},
      (_, column) => -114 + ((row * 7 + column * 3) % 5),
    ));
    powerDbm[40][30] = -30;
    return radarPowerScale({
      range_doppler: {power_dbm: powerDbm},
      statistics: {noise_power_dbm: -120},
    });
  });
  expect(scale.peakDbm).toBe(-30);
  expect(scale.floorDbm).toBeGreaterThan(-110);
  expect(scale.floorDbm).toBeLessThan(-90);
});
