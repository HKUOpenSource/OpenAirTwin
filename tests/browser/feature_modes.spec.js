import { expect, test } from "@playwright/test";
import {
  assertUiResourcesLoad,
  LINK_RESULT,
  MOBILITY_RESULT,
  RADIOMAP_RESULT,
  radarResult,
  openDeterministicApp,
  activateMode,
  enableRealViewer,
  configureRadarFixture,
  configureMainDeviceFixture,
  expectNoSeriousAccessibilityViolations,
  installPhase0ResourceProbe,
  capturePhase0ResourceSnapshot,
} from "./workbench-fixture.js";

test("Astryx stylesheet layers load and inspector rail remains scrollable", async ({
  page,
}) => {
  const cssResponses = [];
  page.on("response", (response) => {
    const url = new URL(response.url());
    if (
      url.pathname.startsWith("/workbench/assets/") &&
      url.pathname.endsWith(".css")
    ) {
      cssResponses.push({ path: url.pathname, status: response.status() });
    }
  });
  await openDeterministicApp(page);

  expect(cssResponses.length).toBeGreaterThanOrEqual(1);
  expect(cssResponses.every(({ status }) => status === 200)).toBe(true);

  const layout = await page.evaluate(() => {
    const scroll = document.querySelector(
      '[data-testid="left-inspector"] .oat-rail-scroll',
    );
    const root = document.querySelector('[data-astryx-theme="neutral"]');
    return {
      hasNeutralTheme: Boolean(root),
      overflowY: scroll ? getComputedStyle(scroll).overflowY : null,
      topbarHeight: document
        .querySelector('[data-testid="top-workspace-bar"]')
        .getBoundingClientRect().height,
    };
  });
  expect(layout.hasNeutralTheme).toBe(true);
  expect(layout.overflowY).toBe("auto");
  expect(layout.topbarHeight).toBe(44);
});

test("UI assets load and mode switching releases owned resources", async ({
  page,
}) => {
  await installPhase0ResourceProbe(page);
  const responseRecords = [];
  page.on("response", (response) => {
    const url = new URL(response.url());
    const isUiResource =
      ["/css/", "/js/", "/lib/", "/workbench/assets/"].some((prefix) =>
        url.pathname.startsWith(prefix),
      ) ||
      url.pathname === "/assets/openairtwin_logo.png" ||
      url.pathname === "/assets/radar/drones/manifest.json";
    if (!isUiResource) return;
    responseRecords.push(
      (async () => {
        const headers = await response.allHeaders();
        return {
          contentLength: Number(headers["content-length"] || 0),
          contentType: String(headers["content-type"] || "").split(";", 1)[0],
          path: url.pathname,
          resourceType: response.request().resourceType(),
          status: response.status(),
        };
      })(),
    );
  });

  await openDeterministicApp(page);
  await enableRealViewer(page);
  await configureMainDeviceFixture(page);

  const modes = ["link", "mobility", "radiomap", "deepmimo", "radar"];
  for (const mode of modes) await activateMode(page, mode);
  await activateMode(page, "link");
  await page.mouse.move(720, 450);
  await page.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      ),
  );
  const resourcesBefore = await capturePhase0ResourceSnapshot(page);
  for (let cycle = 0; cycle < 2; cycle += 1) {
    for (const mode of modes) await activateMode(page, mode);
  }
  await activateMode(page, "link");
  await page.mouse.move(720, 450);
  await page.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      ),
  );
  const resourcesAfter = await capturePhase0ResourceSnapshot(page);
  const resourceDelta = Object.fromEntries(
    Object.keys(resourcesBefore).map((key) => [
      key,
      resourcesAfter[key] - resourcesBefore[key],
    ]),
  );
  expect(resourceDelta.activeIntervals).toBe(0);
  expect(resourceDelta.frameListeners).toBe(0);
  expect(resourceDelta.radarLabelElements).toBe(0);
  expect(resourceDelta.canvasElements).toBeLessThanOrEqual(0);
  expect(resourceDelta.domNodes).toBeLessThanOrEqual(0);

  const networkContract = (await Promise.all(responseRecords)).sort(
    (left, right) => left.path.localeCompare(right.path),
  );
  assertUiResourcesLoad(networkContract);
});

test("all feature modes start without Tx or Rx devices", async ({ page }) => {
  await openDeterministicApp(page);
  await enableRealViewer(page);

  const defaults = await page.evaluate(async () => {
    const { state, viewerRef } =
      await import("/js/app_state.js?v=20260723-radar-shared-groups");
    return {
      link: {
        tx: state.link.tx,
        rx: state.link.rx,
        txVisual: state.link.txVisual,
        rxVisual: state.link.rxVisual,
      },
      mobility: {
        tx: state.mobility.tx,
        rx: state.mobility.rx,
        txVisual: state.mobility.txVisual,
        rxVisual: state.mobility.rxVisual,
      },
      radiomap: { tx: state.radiomap.tx, txVisual: state.radiomap.txVisual },
      deepmimo: { tx: state.deepmimo.tx, txVisual: state.deepmimo.txVisual },
      txMarkerVisible: viewerRef.current.txMarker.visible,
      rxMarkerVisible: viewerRef.current.rxMarker.visible,
    };
  });
  expect(defaults).toEqual({
    link: { tx: null, rx: null, txVisual: null, rxVisual: null },
    mobility: { tx: null, rx: null, txVisual: null, rxVisual: null },
    radiomap: { tx: null, txVisual: null },
    deepmimo: { tx: null, txVisual: null },
    txMarkerVisible: false,
    rxMarkerVisible: false,
  });

  const inspector = page.getByTestId("left-inspector");
  const deviceBar = page.getByTestId("device-bar");

  await expect(inspector.getByRole("button", { name: "Solve Link" })).toBeDisabled();
  await expect(deviceBar.getByRole("button", { name: "Orbit Tx" })).toBeDisabled();

  await activateMode(page, "mobility");
  await expect(inspector.getByRole("button", { name: "Run Mobility" })).toBeDisabled();

  await activateMode(page, "radiomap");
  await expect(inspector.getByRole("button", { name: "Run Radio Map" })).toBeDisabled();

  await activateMode(page, "deepmimo");
  await expect(inspector.getByRole("button", { name: "Export Dataset" })).toBeDisabled();

  await activateMode(page, "radar");
  await expect(inspector.getByRole("button", { name: "Run Radar Sensing" })).toBeDisabled();
});

test("five modes pass the release accessibility gate", async ({ page }) => {
  test.setTimeout(90_000);
  await openDeterministicApp(page);
  await enableRealViewer(page);
  await configureMainDeviceFixture(page);
  await configureRadarFixture(page);

  for (const mode of ["link", "mobility", "radiomap", "deepmimo", "radar"]) {
    await activateMode(page, mode);
    await expectNoSeriousAccessibilityViolations(page, `${mode} mode`);
  }
});

test("transmitter orbit availability follows the active feature", async ({
  page,
}) => {
  await openDeterministicApp(page);
  await enableRealViewer(page);
  await configureMainDeviceFixture(page);

  const orbitButton = page
    .getByTestId("device-bar")
    .getByRole("button", { name: "Orbit Tx" });

  for (const mode of ["link", "mobility", "radiomap", "deepmimo"]) {
    await activateMode(page, mode);
    await expect(orbitButton).toBeEnabled();
  }

  await activateMode(page, "radar");
  await expect(orbitButton).toBeDisabled();

  await page.evaluate(async () => {
    const { state } =
      await import("/js/app_state.js?v=20260723-radar-shared-groups");
    state.radar.tx = [72, 32, 40];
    state.radar.txVisual = [...state.radar.tx];
    state.link.tx = null;
    state.link.txVisual = null;
  });
  await activateMode(page, "link");
  await expect(orbitButton).toBeDisabled();
});

test("feature transports, controls, results drawer and scene layers work end-to-end", async ({
  page,
}) => {
  test.setTimeout(90_000);
  let linkRequests = 0;
  let radarRequests = 0;
  const submitted = {};

  await page.route("**/assets/radar/drones/manifest.json", (route) =>
    route.fulfill({ json: { schema_version: 1, assets: [] } }),
  );
  await page.route("**/api/link/solve", async (route) => {
    linkRequests += 1;
    submitted.link = route.request().postDataJSON();
    await route.fulfill({ json: LINK_RESULT });
  });
  await page.route("**/api/radar/jobs", async (route) => {
    radarRequests += 1;
    submitted.radar = route.request().postDataJSON();
    await route.fulfill({
      status: 202,
      json: {
        ok: true,
        job_id: "radar-1",
        status: "queued",
        scene_generation: 7,
      },
    });
  });
  await page.route("**/api/radar/jobs/radar-1/result", (route) =>
    route.fulfill({ json: radarResult(submitted.radar) }),
  );
  await page.route("**/api/radar/jobs/radar-1", (route) =>
    route.fulfill({
      json: {
        job_id: "radar-1",
        status: "succeeded",
        progress: 1,
        message: "Ready",
        scene_generation: 7,
      },
    }),
  );
  await page.route("**/api/mobility/jobs", async (route) => {
    submitted.mobility = route.request().postDataJSON();
    await route.fulfill({
      status: 202,
      json: { job_id: "mob-1", status: "queued" },
    });
  });
  await page.route("**/api/mobility/jobs/mob-1/result", (route) =>
    route.fulfill({ json: MOBILITY_RESULT }),
  );
  await page.route("**/api/mobility/jobs/mob-1", (route) =>
    route.fulfill({ json: { job_id: "mob-1", status: "succeeded" } }),
  );
  await page.route("**/api/radiomap/jobs", async (route) => {
    submitted.radiomap = route.request().postDataJSON();
    await route.fulfill({
      status: 202,
      json: { job_id: "rm-1", status: "queued" },
    });
  });
  await page.route("**/api/radiomap/jobs/rm-1/result", (route) =>
    route.fulfill({ json: RADIOMAP_RESULT }),
  );
  await page.route("**/api/radiomap/jobs/rm-1", (route) =>
    route.fulfill({ json: { job_id: "rm-1", status: "succeeded" } }),
  );
  await page.route("**/api/deepmimo/jobs", async (route) => {
    submitted.deepmimo = route.request().postDataJSON();
    await route.fulfill({
      status: 202,
      json: { job_id: "deep-ok", status: "running", progress: 0.2 },
    });
  });
  await page.route("**/api/deepmimo/jobs/deep-ok", (route) =>
    route.fulfill({
      json: {
        job_id: "deep-ok",
        status: "succeeded",
        progress: 1,
        updated_at: "2026-07-18T00:00:00Z",
        result: { archive_name: "fixture.zip" },
      },
    }),
  );

  await openDeterministicApp(page);
  await enableRealViewer(page);
  await configureMainDeviceFixture(page);

  const inspector = page.getByTestId("left-inspector");
  const drawer = page.getByTestId("right-analysis-drawer");

  // 1. Link mode solve + right analysis drawer
  await inspector.getByRole("button", { name: "Solve Link" }).click();
  await expect(drawer).toBeVisible();
  await expect(page.getByTestId("link-summary-metrics")).toContainText("-81.25 dB");
  expect(linkRequests).toBe(1);

  // Open coordinate precision card from DeviceBar and verify live precision inputs
  await page.getByTestId("device-bar").getByRole("button", { name: "Tx", exact: true }).click();
  await expect(page.getByTestId("device-precision-card")).toBeVisible();

  // 2. Mobility mode solve
  await page.evaluate(async () => {
    const { state } =
      await import("/js/app_state.js?v=20260723-radar-shared-groups");
    state.mobility.trajectory.points = [
      [90, 52, 1.5],
      [110, 52, 1.5],
    ];
  });
  await activateMode(page, "mobility");
  await inspector.getByRole("button", { name: "Run Mobility" }).click();
  await expect(page.getByTestId("mobility-summary-metrics")).toBeVisible();
  expect(submitted.mobility.rx_trajectory.points).toHaveLength(2);

  // 3. Radio Map mode solve
  await activateMode(page, "radiomap");
  await inspector.getByRole("button", { name: "Run Radio Map" }).click();
  await expect(page.getByTestId("radiomap-results")).toBeVisible();
  expect(submitted.radiomap.tx.position).toEqual([72, 37, 40]);

  // 4. DeepMIMO mode export + dataset popover in TopWorkspaceBar
  await page.evaluate(async () => {
    const { state } =
      await import("/js/app_state.js?v=20260723-radar-shared-groups");
    state.deepmimo.roi.cornerA = [60, 20, 0];
    state.deepmimo.roi.cornerB = [100, 60, 0];
  });
  await activateMode(page, "deepmimo");
  await inspector.getByRole("button", { name: "Export Dataset" }).click();
  await expect(
    page.getByTestId("top-workspace-bar").getByRole("button", { name: /^Datasets/ }),
  ).toBeVisible();
  expect(submitted.deepmimo.tx.position).toEqual([72, 37, 40]);

  // 5. Radar mode solve
  await configureRadarFixture(page);
  await activateMode(page, "radar");
  await inspector.getByRole("button", { name: "Run Radar Sensing" }).click();
  await expect.poll(() => radarRequests).toBe(1);
  await expect(page.getByTestId("radar-summary-metrics")).toBeVisible();
});
