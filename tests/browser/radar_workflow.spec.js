import { expect, test } from "@playwright/test";
import {
  RADAR_PREVIEW_MANIFEST,
  radarResult,
  openDeterministicApp,
  activateMode,
  enableRealViewer,
  configureRadarFixture,
} from "./workbench-fixture.js";

async function installRadarJob(page, clutterCount = 0) {
  let submittedRadar = null;
  await page.route("**/assets/radar/drones/manifest.json", (route) =>
    route.fulfill({ json: RADAR_PREVIEW_MANIFEST }),
  );
  await page.route("**/api/radar/jobs", async (route) => {
    submittedRadar = route.request().postDataJSON();
    await route.fulfill({
      status: 202,
      json: {
        ok: true,
        job_id: "radar-workflow",
        status: "queued",
        scene_generation: 7,
      },
    });
  });
  await page.route("**/api/radar/jobs/radar-workflow/result", (route) => {
    const result = radarResult(submittedRadar);
    for (let index = 0; index < clutterCount; index += 1) {
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
    route.fulfill({ json: result });
  });
  await page.route("**/api/radar/jobs/radar-workflow", (route) =>
    route.fulfill({
      json: {
        job_id: "radar-workflow",
        status: "succeeded",
        progress: 1,
        message: "Ready",
        scene_generation: 7,
      },
    }),
  );

  return () => submittedRadar;
}

test("Radar target editing submits normalized motion and monostatic coordinates", async ({
  page,
}) => {
  const submittedPayload = await installRadarJob(page);
  await openDeterministicApp(page);
  await enableRealViewer(page);
  await activateMode(page, "radar");

  await page.locator("#radarTargetsGroup > summary").click();
  await expect(page.locator("#radarAssetPicker")).toHaveAttribute(
    "data-state",
    "ready",
  );
  await expect(page.locator("#btnRemoveRadarTarget")).toBeDisabled();
  await expect(page.locator("#btnSolveRadar")).toBeDisabled();
  await page.locator("#btnRadarAssetPrevious").click();
  await expect(page.locator("#radarAssetPreviewCount")).toHaveText("4 / 4");
  await page.locator("#btnRadarAssetNext").click();
  await expect(page.locator("#radarAssetPreviewCount")).toHaveText("1 / 4");
  await page.locator("#btnAddRadarTarget").click();
  await expect(page.locator("#radarTargetList .radarTargetCard")).toHaveCount(
    1,
  );
  await page.locator("#btnRemoveRadarTarget").click();
  await expect(page.locator("#radarTargetList .radarTargetCard")).toHaveCount(
    0,
  );
  await page.locator("#btnAddRadarTarget").click();
  await page.locator("#btnPickRadarTx").click();
  for (const [axis, value] of [
    ["X", "72"],
    ["Y", "32"],
    ["Z", "40"],
  ]) {
    await page.locator("#radarTx" + axis).fill(value);
  }
  await page.locator("#radarTxZ").press("Tab");
  await page.locator("#btnPickRadarTx").click();
  await page.locator("#radarTargetX").fill("96");
  await page.locator("#radarTargetY").fill("44");
  await page.locator("#radarTargetZ").fill("30");
  const yawInput = page.locator("#radarTargetYaw");
  await expect(yawInput).toHaveAttribute("readonly", "");
  await expect(yawInput).toHaveAttribute("aria-readonly", "true");
  await expect(yawInput).not.toBeEditable();
  await expect(yawInput).not.toBeDisabled();
  await yawInput.focus();
  await expect(yawInput).toBeFocused();
  await expect(page.locator(".radarVelocityMeta")).toContainText(
    "Yaw follows Direction",
  );
  await page.locator("#radarTargetRoll").fill("12");
  await page.locator("#radarTargetPitch").fill("-7");
  await page.locator("#radarTargetSpeed").fill("12");
  await page.locator("#radarTargetClimb").fill("0");
  await page.locator("#radarTargetDirection").fill("218");
  await page.locator("#radarTargetDirection").press("Tab");
  await expect(yawInput).toHaveValue("-142.0");
  await page.locator("#radarTargetClimb").fill("25");
  await page.locator("#radarTargetDirection").fill("90");
  await page.locator("#radarTargetDirection").press("Tab");
  await expect(yawInput).toHaveValue("90.0");
  await page.locator("#radarTargetClimb").fill("0");
  await page.locator("#radarTargetRcs").fill("0.025");
  await page.locator("#radarTargetRcs").press("Tab");

  await page.getByText("Radar Geometry", { exact: true }).click();
  await page.locator("#radarModeMonostatic").check();
  await page.locator("#btnPickRadarTx").click();
  await page.locator("#radarTxX").fill("75");
  await page.locator("#radarTxX").press("Tab");
  await expect(page.locator("#btnPickRadarRx")).toBeHidden();

  await page.locator("#btnSolveRadar").click();
  await expect(page.locator("#radarJobStatus")).toHaveText("SUCCEEDED");
  expect(submittedPayload().mode).toBe("monostatic");
  expect(submittedPayload().solver).toMatchObject({
    samples_per_src: 65536,
    diffuse_reflection: true,
  });
  expect(submittedPayload().rx.position).toEqual(
    submittedPayload().tx.position,
  );
  expect(submittedPayload().targets[0]).toMatchObject({
    position: [96, 44, 30],
    rcs_m2: 0.025,
  });
  expect(submittedPayload().targets[0].orientation[0]).toBeCloseTo(
    (12 * Math.PI) / 180,
    6,
  );
  expect(submittedPayload().targets[0].orientation[1]).toBeCloseTo(
    (-7 * Math.PI) / 180,
    6,
  );
  expect(submittedPayload().targets[0].orientation[2]).toBeCloseTo(
    Math.PI / 2,
    6,
  );
  expect(submittedPayload().targets[0].velocity[0]).toBeCloseTo(0, 6);
  expect(submittedPayload().targets[0].velocity[1]).toBeCloseTo(12, 6);
  expect(submittedPayload().targets[0].velocity[2]).toBeCloseTo(0, 6);
});

test("Radar processing, detection filters and scene selections stay linked", async ({
  page,
}) => {
  const submittedPayload = await installRadarJob(page, 12);
  await openDeterministicApp(page);
  await enableRealViewer(page);
  await configureRadarFixture(page);
  await page.evaluate(async () => {
    const { state } =
      await import("/js/app_state.js?v=20260723-radar-shared-groups");
    state.radar.targets = [state.radar.targets[0]];
    Object.assign(state.radar.targets[0], {
      position: [96, 44, 30],
      orientation: [(12 * Math.PI) / 180, (-7 * Math.PI) / 180, Math.PI / 2],
      velocity: [0, 12, 0],
      rcs_m2: 0.025,
    });
  });
  await activateMode(page, "radar");
  await page.locator("#btnSolveRadar").click();
  await expect(page.locator("#radarJobStatus")).toHaveText("SUCCEEDED");
  await expect(page.locator("#radarJobBar")).toBeHidden();
  await expect(page.locator("#ui")).toHaveClass(/panelCollapsed/);
  await expect(page.locator("#radarDetectionList .radarResultRow")).toHaveCount(
    11,
  );
  await expect(page.locator("#radarDetectionMetric")).toHaveText(
    "1 target detection · 13 total",
  );
  await expect(page.locator("#radarDetectionMore")).toContainText(
    "Show all 12",
  );
  await page.locator("#radarDetectionMore").click();
  await expect(page.locator("#radarDetectionList .radarResultRow")).toHaveCount(
    13,
  );
  await page.locator("#radarDetectionFilter").selectOption("target");
  await expect(page.locator("#radarDetectionList .radarResultRow")).toHaveCount(
    1,
  );
  await expect(page.locator("#radarRdTruncated")).toHaveText("DOWNSAMPLED");
  await expect(page.locator("#radarRdRaw")).toHaveClass(/active/);
  await expect(page.locator("#radarRdMean")).toBeEnabled();
  await expect(page.locator("#radarRdIdeal")).toBeEnabled();
  await expect(page.locator("#radarRdFocus")).toHaveClass(/active/);
  await expect(page.locator("#radarRdMeta")).toHaveText("RAW · TARGET DETAIL");
  const processingButtonLayout = await page
    .locator("#radarRdRaw, #radarRdMean, #radarRdIdeal")
    .evaluateAll((buttons) =>
      buttons.map((button) => ({
        width: button.getBoundingClientRect().width,
        scrollWidth: button.scrollWidth,
        height: button.getBoundingClientRect().height,
        scrollHeight: button.scrollHeight,
      })),
    );
  for (const layout of processingButtonLayout) {
    expect(layout.scrollWidth).toBeLessThanOrEqual(Math.ceil(layout.width));
    expect(layout.scrollHeight).toBeLessThanOrEqual(Math.ceil(layout.height));
  }
  await page.locator("#radarRdMean").click();
  await expect(page.locator("#radarRdMean")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.locator("#radarRdMeta")).toHaveText(
    "MEAN-SUBTRACTED · TARGET DETAIL",
  );
  await expect(page.locator("#radarRdProcessingHint")).toContainText(
    "complex slow-time mean",
  );
  await expect(page.locator("#radarDetectionMetric")).toHaveText(
    "0 target detections · 0 total",
  );
  await expect(page.locator("#radarSnrMetric")).toHaveText("16.0 dB");
  await page.locator("#radarRdIdeal").click();
  await expect(page.locator("#radarRdIdeal")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.locator("#radarRdMeta")).toHaveText(
    "IDEAL CLUTTER-CANCELLED · TARGET DETAIL",
  );
  await expect(page.locator("#radarRdProcessingHint")).toContainText(
    "ideal simulation reference",
  );
  await expect(page.locator("#radarDetectionMetric")).toHaveText(
    "1 target detection · 1 total",
  );
  await expect(page.locator("#radarSnrMetric")).toHaveText("28.0 dB");
  await page.locator("#radarRdRaw").click();
  const radarViewportButtonLayout = await page
    .locator("#radarRdFocus, #radarRdFull")
    .evaluateAll((buttons) =>
      buttons.map((button) => ({
        whiteSpace: getComputedStyle(button).whiteSpace,
        lineHeight: button.getBoundingClientRect().height,
        scrollHeight: button.scrollHeight,
      })),
    );
  expect(radarViewportButtonLayout).toHaveLength(2);
  for (const layout of radarViewportButtonLayout) {
    expect(layout.scrollHeight).toBeLessThanOrEqual(
      Math.ceil(layout.lineHeight),
    );
  }
  await page.locator("#radarRdFull").click();
  await expect(page.locator("#radarRdMeta")).toHaveText("RAW · SCENE OVERVIEW");
  await page.locator("#radarDetectionList .radarResultRow").click();
  const linkage = await page.evaluate(async () => {
    const { state, viewerRef } =
      await import("/js/app_state.js?v=20260723-radar-shared-groups");
    return {
      target: state.radar.selectedTargetId,
      detection: state.radar.selectedDetectionId,
      selectedPath: state.radar.selectedPath,
      sharedPaths: viewerRef.current.pathLayer.group.children.length,
      radarPaths: viewerRef.current.layers.get("radar", "paths").group.children
        .length,
      radarTargetsVisible: viewerRef.current.layers.get("radar", "targets")
        .group.visible,
      radarDetectionMarkers: viewerRef.current.layers.get("radar", "detections")
        .group.children.length,
      targetOverlays: viewerRef.current.layers
        .get("radar", "target-overlays")
        .group.children.map((group) => ({
          data: group.userData.radarTargetOverlay,
          names: group.children.map((child) => child.name),
        })),
    };
  });
  expect(linkage).toMatchObject({
    target: submittedPayload().targets[0].id,
    detection: "det-0",
    selectedPath: 0,
    sharedPaths: 0,
    radarPaths: 2,
    radarTargetsVisible: true,
    radarDetectionMarkers: 0,
  });
  expect(linkage.targetOverlays).toHaveLength(1);
  expect(linkage.targetOverlays[0].data).toMatchObject({
    targetId: submittedPayload().targets[0].id,
    speedMps: 12,
    rcsM2: 0.025,
  });
  expect(linkage.targetOverlays[0].names).toEqual([
    `radar-target-velocity-${submittedPayload().targets[0].id}`,
  ]);
  const targetColorContract = await page.evaluate(async () => {
    const [
      { state, viewerRef },
      { drawRadarRangeDoppler },
      { radarTargetColor },
    ] = await Promise.all([
      import("/js/app_state.js?v=20260723-radar-shared-groups"),
      import("/js/features/radar/charts.js?v=20260722-radar-color-contract"),
      import("/js/features/radar/colors.js?v=20260722-radar-color-contract"),
    ]);
    const target = state.radar.targets[0];
    const expectedColor = radarTargetColor(target.id);
    const canvas = document.createElement("canvas");
    canvas.style.cssText =
      "position:fixed;left:-1000px;top:0;width:500px;height:300px";
    document.body.append(canvas);
    const layout = drawRadarRangeDoppler({
      canvas,
      result: state.radar.result,
      rangeDoppler: state.radar.result.range_doppler_focus,
      selectedDetectionId: state.radar.selectedDetectionId,
      selectedTargetId: state.radar.selectedTargetId,
    });
    const points = layout.points.filter(
      (point) => point.targetId === target.id,
    );
    const overlay = viewerRef.current.layers.get("radar", "target-overlays")
      .group.children[0];
    const label = document.querySelector(
      `.radarTargetLabel[data-target-id="${target.id}"]`,
    );
    const connector = document.querySelector(
      `.radarTargetConnector[data-target-id="${target.id}"]`,
    );
    const legend = document.getElementById("radarPlotLegend");
    const colorProbe = document.createElement("span");
    colorProbe.style.color = expectedColor;
    const result = {
      expectedColor,
      pointTypes: points.map((point) => point.type).sort(),
      pointColors: [...new Set(points.map((point) => point.color))],
      overlayColor: overlay.userData.radarTargetOverlay.displayColor,
      labelColor: label.style.getPropertyValue("--radar-target-label-accent"),
      connectorColor: connector.style.stroke,
      expectedStroke: colorProbe.style.color,
      legendColor: getComputedStyle(legend)
        .getPropertyValue("--radar-legend-target-color")
        .trim(),
      legendTargetId: legend.dataset.targetId,
    };
    canvas.remove();
    return result;
  });
  for (const color of [
    ...targetColorContract.pointColors,
    targetColorContract.overlayColor,
    targetColorContract.labelColor,
    targetColorContract.legendColor,
  ]) {
    expect(color).toBe(targetColorContract.expectedColor);
  }
  expect(targetColorContract.connectorColor).toBe(
    targetColorContract.expectedStroke,
  );
  expect(targetColorContract.pointTypes).toEqual(["detection", "target"]);
  expect(targetColorContract.legendTargetId).toBe(
    submittedPayload().targets[0].id,
  );
  await expect(page.locator(".radarTargetLabel")).toHaveCount(1);
  await expect(
    page.locator(
      `.radarTargetLabel[data-target-id="${submittedPayload().targets[0].id}"]`,
    ),
  ).toContainText("RCS 0.025 m²");
  await page.locator("#radarPathDisplayMode").evaluate((select) => {
    select.value = "target";
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
  expect(
    await page.evaluate(async () => {
      const { viewerRef } =
        await import("/js/app_state.js?v=20260723-radar-shared-groups");
      return viewerRef.current.layers.get("radar", "paths").group.children
        .length;
    }),
  ).toBe(1);
  await page.setViewportSize({ width: 1280, height: 720 });
  await expect(page.locator("#radarPanel")).toBeVisible();
  await expect(page.locator("#radarRangeDopplerCanvas")).toBeVisible();
  const narrowDesktopLayout = await page.evaluate(() => {
    const rect = (selector) =>
      document.querySelector(selector).getBoundingClientRect().toJSON();
    const overlaps = (left, right) =>
      left.left < right.right &&
      left.right > right.left &&
      left.top < right.bottom &&
      left.bottom > right.top;
    const control = rect("#ui");
    const results = rect("#linkChannelSection");
    const devices = rect("#deviceDock");
    return {
      controlResultsOverlap: overlaps(control, results),
      controlDevicesOverlap: overlaps(control, devices),
      resultsDevicesOverlap: overlaps(results, devices),
      devicesWithinViewport:
        devices.left >= 0 &&
        devices.right <= innerWidth &&
        devices.bottom <= innerHeight,
    };
  });
  expect(narrowDesktopLayout).toEqual({
    controlResultsOverlap: false,
    controlDevicesOverlap: false,
    resultsDevicesOverlap: false,
    devicesWithinViewport: true,
  });
});

test("Radar jobs cancel, invalidate stale work and expose retryable failures", async ({
  page,
}) => {
  let createCount = 0;
  let radarStatusCallCount = 0;
  let releaseSecondRadarProgress;
  const secondRadarProgress = new Promise((resolve) => {
    releaseSecondRadarProgress = resolve;
  });
  const cancelled = [];
  await page.route("**/assets/radar/drones/manifest.json", (route) =>
    route.fulfill({ json: { schema_version: 1, assets: [] } }),
  );
  await page.route("**/api/radar/jobs", async (route) => {
    createCount += 1;
    await route.fulfill({
      status: 202,
      json: {
        ok: true,
        job_id: `radar-state-${createCount}`,
        status: "queued",
        scene_generation: 7,
      },
    });
  });
  await page.route("**/api/radar/jobs/radar-state-1/cancel", async (route) => {
    cancelled.push("radar-state-1");
    await route.fulfill({
      json: {
        job_id: "radar-state-1",
        status: "cancelled",
        progress: 1,
        message: "Cancelled",
      },
    });
  });
  await page.route("**/api/radar/jobs/radar-state-1", async (route) => {
    radarStatusCallCount += 1;
    if (radarStatusCallCount > 1) await secondRadarProgress;
    const progress = radarStatusCallCount > 1 ? 0.4 : 0.15;
    const message =
      radarStatusCallCount > 1 ? "Tracing" : "Solving Radar propagation paths";
    await route.fulfill({
      json: {
        job_id: "radar-state-1",
        status: "running",
        progress,
        message,
        scene_generation: 7,
      },
    });
  });
  await page.route("**/api/radar/jobs/radar-state-2", (route) =>
    route.fulfill({
      json: {
        job_id: "radar-state-2",
        status: "failed",
        progress: 1,
        message: "Failed",
        error: "fixture processing failure",
        scene_generation: 7,
      },
    }),
  );

  await openDeterministicApp(page);
  await enableRealViewer(page);
  await configureRadarFixture(page, { targets: false });
  await activateMode(page, "radar");
  await page.locator("#radarWaveformGroup > summary").click();
  await page.locator("#btnSolveRadar").click();
  await expect(page.locator("#btnCancelRadar")).toBeVisible();
  await expect(page.locator("#loadingPhase")).toHaveText(
    "Solving Radar propagation paths",
  );
  await expect(page.locator("#bar")).not.toHaveClass(/indeterminate/);
  await expect
    .poll(() => page.locator("#bar").evaluate((node) => node.style.width))
    .toBe("15%");
  await expect(page.locator("#radarJobProgress")).toHaveJSProperty(
    "value",
    0.15,
  );
  releaseSecondRadarProgress();
  await expect(page.locator("#loadingPhase")).toHaveText("Tracing");
  await expect
    .poll(() => page.locator("#bar").evaluate((node) => node.style.width))
    .toBe("40%");
  await expect(page.locator("#radarJobProgress")).toHaveJSProperty(
    "value",
    0.4,
  );
  await page.locator("#radarBandwidth").evaluate((input) => {
    input.value = "64";
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await expect.poll(() => cancelled.length).toBe(1);
  await expect(page.locator("#radarJobStatus")).toHaveText("IDLE");
  await expect(page.locator("#radarJobBar")).toBeHidden();
  await expect(page.locator("#radarResultSections")).toBeHidden();

  await page.locator("#btnSolveRadar").click();
  await expect(page.locator("#radarJobStatus")).toHaveText("FAILED");
  await expect(page.locator("#radarJobBar")).toBeVisible();
  await expect(page.locator("#radarInputError")).toContainText(
    "fixture processing failure",
  );
  await expect(page.locator("#btnRetryRadar")).toBeVisible();
});

test("scene re-entry deactivates Radar before restoring Link controls", async ({
  page,
}) => {
  await openDeterministicApp(page);
  const result = await page.evaluate(async () => {
    const [
      { createSceneLoaderController },
      { defineFeature, FeatureRegistry, FeatureStore },
    ] = await Promise.all([
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
      entry: { sceneReady: false },
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
      ui: { panel: document.createElement("aside") },
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
    renderStates: [{ active: "link", mode: "link", radarFullMode: false }],
  });
});
