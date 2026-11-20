import AxeBuilder from "@axe-core/playwright";
import { expect } from "@playwright/test";

const MODE_LABELS = {
  link: "Link",
  mobility: "Mobility",
  radiomap: "Radio Map",
  deepmimo: "DeepMIMO",
  radar: "Radar",
};

function assertUiResourcesLoad(actual) {
  expect(actual.length).toBeGreaterThan(0);
  expect(actual.every(({ status }) => status === 200)).toBe(true);
  expect(actual.every(({ contentLength }) => contentLength > 0)).toBe(true);
  if (actual.some(({ path }) => path.startsWith("/workbench/assets/"))) {
    expect(
      actual.some(({ path }) =>
        /^\/workbench\/assets\/.+-[A-Za-z0-9_-]{8,}\.css$/.test(path),
      ),
    ).toBe(true);
    expect(
      actual.some(({ path }) =>
        /^\/workbench\/assets\/.+-[A-Za-z0-9_-]{8,}\.js$/.test(path),
      ),
    ).toBe(true);
    expect(
      actual.every(
        ({ path }) => !path.startsWith("/css/") && !path.startsWith("/js/"),
      ),
    ).toBe(true);
  }
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
      num_rows: { min: 1, max: 16 },
      num_cols: { min: 1, max: 16 },
      vertical_spacing: { min: 0.01, max: 10 },
      horizontal_spacing: { min: 0.01, max: 10 },
    },
    patterns: ["iso"],
    polarizations: ["V"],
  },
};

const FIXTURE_MANIFEST = {
  scene_id: "browser_fixture",
  mesh_count: 0,
  bundle_count: 0,
  tiles: [{ id: "11_SW_7A", mesh_count: 0, bundle_count: 0 }],
  bsdfs: {},
  integrity: {
    orphan_mesh_count: 0,
    orphan_mesh_samples: [],
    missing_mesh_count: 0,
    missing_mesh_samples: [],
  },
  bundles: [],
};

const RADAR_PREVIEW_MANIFEST = {
  schema_version: 1,
  assets: [
    {
      id: "dji-air-2s",
      display_name: "DJI Air 2S",
      default_effective_rcs_m2: 0.01,
    },
    {
      id: "dji-mavic-3-cine",
      display_name: "DJI Mavic 3 Cine",
      default_effective_rcs_m2: 0.01,
    },
    {
      id: "dji-mini-3",
      display_name: "DJI Mini 3",
      default_effective_rcs_m2: 0.01,
    },
    {
      id: "dji-mini-3-pro",
      display_name: "DJI Mini 3 Pro",
      default_effective_rcs_m2: 0.01,
    },
  ].map((asset) => ({
    ...asset,
    visual: {
      format: "glb",
      url: "/assets/radar/drones/dji-mini-3/visual.glb",
    },
  })),
};

const PATH = {
  path_index: 0,
  type: "LOS",
  path_gain_db: -81.25,
  path_gain_linear: 7.5e-9,
  delay_ns: 24.5,
  path_length_m: 7.35,
  polyline: [
    [70, 35, 40],
    [90, 52, 2],
  ],
};

const LINK_RESULT = {
  ok: true,
  summary: {
    received_power_db: -81.25,
    strongest_path_db: -81.25,
    valid_paths: 1,
    los_paths: 1,
  },
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
  series: { time_s: [0, 1], received_power_db: [-81, -83] },
  samples: [
    {
      step_index: 0,
      time_s: 0,
      distance_m: 0,
      rx_position: [90, 52, 2],
      paths: [PATH],
      channel: null,
      summary: LINK_RESULT.summary,
    },
    {
      step_index: 1,
      time_s: 1,
      distance_m: 2,
      rx_position: [92, 52, 2],
      paths: [PATH],
      channel: null,
      summary: LINK_RESULT.summary,
    },
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
  solver: { base_samples_per_tx: 1000, effective_samples_per_tx: 1000 },
  range: { min: -95, max: -95 },
  values: { count: 1, data: [-95] },
  geometry: { triangle_positions: [65, 30, 0.1, 75, 30, 0.1, 65, 40, 0.1] },
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
    path_id: `target-${index}`,
    classification: "target",
    target_ids: [target.id],
    delay_s: 5e-7,
    doppler_hz: detections[index].doppler_hz,
    path_gain_db: -90 - index,
    path_length_m: 160 + index * 40,
    equivalent_range_m: 80 + index * 20,
    departure_azimuth_deg: 0,
    departure_zenith_deg: 90,
    arrival_azimuth_deg: detections[index].arrival_azimuth_deg,
    arrival_zenith_deg: 90,
    polyline: [payload.tx.position, target.position, payload.rx.position],
  }));
  paths.push({
    path_id: "clutter-0",
    classification: "clutter",
    target_ids: [],
    delay_s: 4e-7,
    doppler_hz: 0,
    path_gain_db: -105,
    path_length_m: 120,
    equivalent_range_m: 60,
    departure_azimuth_deg: 0,
    departure_zenith_deg: 90,
    arrival_azimuth_deg: 180,
    arrival_zenith_deg: 90,
    polyline: [payload.tx.position, [50, 40, 2], payload.rx.position],
  });
  const powerDbm = dopplerAxis.map((_, row) =>
    rangeAxis.map((__, column) => -118 + ((row + column) % 8)),
  );
  powerDbm[1][8] = -72;
  powerDbm[3][10] = -74;
  const rangeDoppler = {
    equivalent_range_axis_m: rangeAxis,
    doppler_axis_hz: dopplerAxis,
    equivalent_radial_velocity_axis_mps: [12, 6, 0, -6, -12],
    power_dbm: powerDbm,
    source_shape: {
      doppler_bins: payload.waveform.num_symbols,
      range_bins: payload.waveform.num_subcarriers,
    },
    downsample_factor: {
      doppler: Math.ceil(payload.waveform.num_symbols / dopplerAxis.length),
      range: Math.ceil(payload.waveform.num_subcarriers / rangeAxis.length),
    },
    truncated: true,
  };
  const rangeDopplerFocus = {
    ...rangeDoppler,
    source_offset: { doppler_bin: 0, range_bin: 0 },
    window: {
      equivalent_range_min_m: 0,
      equivalent_range_max_m: 120,
      doppler_min_hz: -500,
      doppler_max_hz: 500,
      auto_focus: true,
    },
  };
  const processingView = (method, viewDetections, powerShift, peakSnrDb) => {
    const shiftedPower = powerDbm.map((row, rowIndex) =>
      row.map((value) => value + powerShift - (rowIndex === 2 ? 18 : 0)),
    );
    const shiftedRd = { ...rangeDoppler, power_dbm: shiftedPower };
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
      range_profile: {
        equivalent_range_axis_m: rangeAxis,
        power_dbm: rangeAxis.map((_, index) => -110 + index * 2 + powerShift),
      },
      range_doppler: shiftedRd,
      range_doppler_focus: { ...rangeDopplerFocus, power_dbm: shiftedPower },
      peak_snr_db: peakSnrDb,
    };
  };
  return {
    schema_version: 1,
    scene_generation: 7,
    summary: {
      mode: payload.mode,
      target_count: payload.targets.length,
      total_detection_count: detections.length,
      returned_detection_count: detections.length,
      detections_truncated: false,
      total_target_path_count: payload.targets.length,
      total_clutter_path_count: 1,
      total_direct_path_count: 0,
      returned_path_count: paths.length,
      paths_truncated: false,
    },
    radar: {
      mode: payload.mode,
      tx_position_m: payload.tx.position,
      rx_position_m: payload.rx.position,
      carrier_frequency_hz: payload.waveform.carrier_frequency_hz,
      bandwidth_hz: payload.waveform.bandwidth_hz,
      subcarrier_spacing_hz:
        payload.waveform.bandwidth_hz / payload.waveform.num_subcarriers,
      num_subcarriers: payload.waveform.num_subcarriers,
      num_symbols: payload.waveform.num_symbols,
    },
    targets: payload.targets.map((target, index) => ({
      id: target.id,
      asset_id: target.asset_id,
      position_m: target.position,
      orientation_rad: target.orientation,
      velocity_mps: target.velocity,
      rcs_m2: target.rcs_m2,
      observability: { status: ["direct", "multipath", "blocked"][index % 3] },
    })),
    detections,
    paths,
    range_profile: {
      equivalent_range_axis_m: rangeAxis,
      power_dbm: rangeAxis.map((_, index) => -110 + index * 2),
    },
    range_doppler: rangeDoppler,
    range_doppler_focus: rangeDopplerFocus,
    processing_views: {
      mean_subtracted: processingView(
        "slow_time_complex_mean_subtraction",
        detections.slice(0, 0),
        -8,
        16,
      ),
      ideal_clutter_cancelled: processingView(
        "ideal_coherent_known_clutter_subtraction",
        detections,
        -3,
        28,
      ),
    },
    resolution: {
      equivalent_range_m: 1.17,
      doppler_hz: 488.3,
      equivalent_radial_velocity_mps: 12.62,
      max_unambiguous_equivalent_range_m: 1199,
      max_unambiguous_doppler_hz: 62500,
      max_unambiguous_equivalent_radial_velocity_mps: 1615,
    },
    statistics: {
      solver_seconds: 0.2,
      processing_seconds: 0.03,
      total_seconds: 0.23,
      noise_power_dbm: -118,
      peak_snr_db: 24,
      raw_path_count: paths.length,
      returned_path_count: paths.length,
      processed_signal_path_count: paths.length,
      signal_paths_truncated: false,
      direct_path_cancellation_enabled: true,
      direct_path_cancellation_method: "ideal",
      cancelled_direct_path_count: 0,
      range_window: "hann",
      doppler_window: "hann",
      cfar_method: "CA-CFAR",
    },
  };
}

async function openDeterministicApp(page) {
  await page.route("https://tiles.openfreemap.org/styles/positron", (route) =>
    route.fulfill({
      json: {
        version: 8,
        sources: {},
        layers: [
          {
            id: "background",
            type: "background",
            paint: { "background-color": "#f7f8f8" },
          },
        ],
      },
    }),
  );
  await page.route("**/api/rt/capabilities", (route) =>
    route.fulfill({ json: RT_CAPABILITIES }),
  );
  await page.route("**/api/scene/manifest", (route) =>
    route.fulfill({ json: FIXTURE_MANIFEST }),
  );
  await page.route("**/assets/open3dhk_tile_coverage.json", (route) =>
    route.fulfill({ json: { tile_count: 0, tiles: [] } }),
  );
  await page.route("**/api/rt/scene-selection", (route) =>
    route.fulfill({
      json: {
        ok: true,
        status: "ready",
        generation: 7,
        selected_tile_ids: ["11_SW_7A"],
        active_tile_ids: ["11_SW_7A"],
      },
    }),
  );
  await page.goto("/");
  await expect(page.locator("#entryScreen")).toBeVisible();
  await expect(page.locator("#loadingScreen")).toBeHidden();
  await expect
    .poll(() =>
      page.evaluate(async () => {
        const { entryMap } =
          await import("/js/app_state.js?v=20260723-radar-shared-groups");
        return entryMap.basemapReady;
      }),
    )
    .toBe(true);
  // Click the fixture tile on the Leaflet map and load the scene
  const tilePoint = await page.evaluate(async () => {
    const { entryMap } =
      await import("/js/app_state.js?v=20260723-radar-shared-groups");
    const tile = entryMap.tilesById.get("11_SW_7A");
    const center = tile.layer.getBounds().getCenter();
    entryMap.map.setView(center, 14, { animate: false });
    const point = entryMap.map.latLngToContainerPoint(center);
    const bounds = entryMap.map.getContainer().getBoundingClientRect();
    return { x: bounds.x + point.x, y: bounds.y + point.y };
  });
  await page.mouse.click(tilePoint.x, tilePoint.y);
  const enterButton = page.getByRole("button", { name: "Load Selected Tiles" });
  await expect(enterButton).toBeEnabled();
  await enterButton.click();
  await expect(page.locator("#entryScreen")).toBeHidden({ timeout: 15_000 });
  await expect(page.locator("#loadingScreen")).toBeHidden({ timeout: 15_000 });
  await expect(page.getByTestId("top-workspace-bar")).toBeVisible();
  await expect(page.getByTestId("device-bar")).toBeVisible();
}

async function activateMode(page, mode) {
  const label = MODE_LABELS[mode];
  if (!label) throw new Error(`Unknown mode: ${mode}`);
  await page
    .getByTestId("top-workspace-bar")
    .getByRole("radio", { name: label, exact: true })
    .click();
}

async function syncUiAfterStateMutation(page) {
  const activeMode = await page.evaluate(async () => {
    const { state } =
      await import("/js/app_state.js?v=20260723-radar-shared-groups");
    return state.mode;
  });
  const other = activeMode === "link" ? "mobility" : "link";
  await activateMode(page, other);
  await activateMode(page, activeMode);
}

async function enableRealViewer(page) {
  await page.evaluate(async () => {
    const { viewerRef } =
      await import("/js/app_state.js?v=20260723-radar-shared-groups");
    viewerRef.current.__ready = true;
    viewerRef.current.loadedTileIds.add("11_SW_7A");
  });
  await expect(page.getByTestId("device-bar")).toBeVisible();
}

async function enableViewerStub(page) {
  return enableRealViewer(page);
}

async function configureRadarFixture(page, { targets = true } = {}) {
  await page.evaluate(async (includeTargets) => {
    const { state } =
      await import("/js/app_state.js?v=20260723-radar-shared-groups");
    const radar = state.radar;
    radar.tx = [72, 32, 40];
    radar.txVisual = [...radar.tx];
    radar.rx = [72, 42, 40];
    radar.rxVisual = [...radar.rx];
    radar.targets = includeTargets
      ? [
          {
            id: "target-1",
            asset_id: "dji-mini-3",
            position: [100, 29, 47],
            orientation: [0, 0, 0.314159],
            velocity: [7.608452, 2.472136, 0],
            rcs_m2: 0.01,
          },
          {
            id: "target-2",
            asset_id: "dji-air-2s",
            position: [126, 50, 54],
            orientation: [0, 0, -2.478368],
            velocity: [-10.24414, -8.003599, 0],
            rcs_m2: 0.018,
          },
        ]
      : [];
    radar.nextTargetNumber = includeTargets ? 3 : 1;
    radar.selectedTargetId = includeTargets ? "target-1" : null;
  }, targets);
}

async function configureMainDeviceFixture(page) {
  await page.evaluate(async () => {
    const { state } =
      await import("/js/app_state.js?v=20260723-radar-shared-groups");
    const devices = {
      link: { tx: [72, 37, 40], rx: [90, 52, 1.5] },
      mobility: { tx: [72, 37, 40], rx: [90, 52, 1.5] },
      radiomap: { tx: [72, 37, 40] },
      deepmimo: { tx: [72, 37, 40] },
    };
    for (const [mode, roles] of Object.entries(devices)) {
      for (const [role, position] of Object.entries(roles)) {
        state[mode][role] = [...position];
        state[mode][`${role}Visual`] = [...position];
      }
    }
  });
  await syncUiAfterStateMutation(page);
}

async function expectNoSeriousAccessibilityViolations(page, context) {
  const results = await new AxeBuilder({ page }).analyze();
  const blocking = results.violations.filter(
    ({ impact }) => impact === "critical" || impact === "serious",
  );
  expect(blocking, `${context}: ${JSON.stringify(blocking, null, 2)}`).toEqual(
    [],
  );
}

async function installPhase0ResourceProbe(page) {
  await page.addInitScript(() => {
    const probe = {
      activeIntervals: new Set(),
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

async function capturePhase0ResourceSnapshot(page) {
  return page.evaluate(async () => {
    const { viewerRef } =
      await import("/js/app_state.js?v=20260723-radar-shared-groups");
    const probe = window.__oatPhase0ResourceProbe;
    return {
      activeIntervals: probe.activeIntervals.size,
      canvasElements: document.querySelectorAll("canvas").length,
      domNodes: document.querySelectorAll("*").length,
      frameListeners: viewerRef.current.frameListeners?.size ?? 0,
      radarLabelElements: document.querySelectorAll(
        ".radarTargetLabel, .radarTargetConnector",
      ).length,
    };
  });
}

export async function openModulePage(page) {
  const response = await page.request.get("/");
  expect(response.ok()).toBe(true);
  const importMap = await page.evaluate(
    (html) => {
      const document = new DOMParser().parseFromString(html, "text/html");
      return JSON.parse(
        document.querySelector('script[type="importmap"]').textContent,
      );
    },
    await response.text(),
  );
  await page.route("**/__test_modules__", (route) =>
    route.fulfill({
      contentType: "text/html",
      body:
        '<!doctype html><html><head><script type="importmap">' +
        JSON.stringify(importMap).replaceAll("<", "\\u003c") +
        "</script></head><body></body></html>",
    }),
  );
  await page.goto("/__test_modules__");
}

export {
  assertUiResourcesLoad,
  RADAR_PREVIEW_MANIFEST,
  LINK_RESULT,
  MOBILITY_RESULT,
  RADIOMAP_RESULT,
  radarResult,
  openDeterministicApp,
  activateMode,
  syncUiAfterStateMutation,
  enableRealViewer,
  enableViewerStub,
  configureRadarFixture,
  configureMainDeviceFixture,
  expectNoSeriousAccessibilityViolations,
  installPhase0ResourceProbe,
  capturePhase0ResourceSnapshot,
};
