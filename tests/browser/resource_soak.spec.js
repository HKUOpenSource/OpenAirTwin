import { expect, test } from "@playwright/test";
import {
  LINK_RESULT,
  MOBILITY_RESULT,
  RADIOMAP_RESULT,
  radarResult,
  openDeterministicApp,
  activateMode,
  enableRealViewer,
  configureRadarFixture,
  configureMainDeviceFixture,
  installPhase0ResourceProbe,
  capturePhase0ResourceSnapshot,
} from "./workbench-fixture.js";

test("release soak returns UI resources and heap to their stable bounds", async ({
  page,
}) => {
  test.skip(
    process.env.OAT_RUN_SOAK_TESTS !== "true",
    "Run the long soak during full CI or release validation",
  );
  test.setTimeout(120_000);
  await installPhase0ResourceProbe(page);
  await openDeterministicApp(page);
  await enableRealViewer(page);
  await configureMainDeviceFixture(page);
  await configureRadarFixture(page);
  const radarFixture = radarResult({
    mode: "bistatic",
    tx: { position: [72, 32, 40] },
    rx: { position: [72, 42, 40] },
    targets: [
      {
        id: "target-1",
        asset_id: "dji-mini-3",
        position: [100, 29, 47],
        orientation: [0, 0, 0],
        velocity: [7, 2, 0],
        rcs_m2: 0.01,
      },
    ],
    waveform: {
      carrier_frequency_hz: 5.8e9,
      bandwidth_hz: 128e6,
      num_subcarriers: 1024,
      num_symbols: 1024,
    },
  });
  await activateMode(page, "link");

  const heapMedian = async () =>
    page.evaluate(async () => {
      const samples = [];
      for (let index = 0; index < 3; index += 1) {
        window.gc?.();
        await new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve)),
        );
        samples.push(performance.memory?.usedJSHeapSize ?? 0);
      }
      return samples.sort((left, right) => left - right)[1];
    });

  const exerciseResultCycles = async (resultCycleCount) => {
    for (const mode of ["link", "mobility", "radiomap", "deepmimo", "radar"]) {
      for (let cycle = 0; cycle < resultCycleCount; cycle += 1) {
        await page.evaluate(
          async ({
            currentMode,
            cycleIndex,
            linkResult,
            mobilityResult,
            radarResultFixture,
            radiomapResult,
          }) => {
            const { state } =
              await import("/js/app_state.js?v=20260723-radar-shared-groups");
            if (currentMode === "link") state.link.result = linkResult;
            if (currentMode === "mobility")
              state.mobility.result = mobilityResult;
            if (currentMode === "radiomap") {
              state.radiomap.result = radiomapResult;
              state.radiomap.status = "Succeeded";
            }
            if (currentMode === "deepmimo") {
              state.deepmimo.datasets = [
                {
                  jobId: `soak-${cycleIndex}`,
                  scenarioName: "soak",
                  archiveName: "soak.zip",
                  downloadUrl: "/api/deepmimo/jobs/soak/download",
                  readyAt: "2026-07-31T00:00:00Z",
                },
              ];
            }
            if (currentMode === "radar") {
              state.radar.result = radarResultFixture;
              state.radar.status = "succeeded";
            }
          },
          {
            currentMode: mode,
            cycleIndex: cycle,
            linkResult: LINK_RESULT,
            mobilityResult: MOBILITY_RESULT,
            radarResultFixture: radarFixture,
            radiomapResult: RADIOMAP_RESULT,
          },
        );
        await activateMode(page, mode);
        await page.evaluate(async (currentMode) => {
          const { state } =
            await import("/js/app_state.js?v=20260723-radar-shared-groups");
          state[currentMode].result = null;
          if (currentMode === "radiomap") state.radiomap.status = "Idle";
          if (currentMode === "deepmimo") state.deepmimo.datasets = [];
          if (currentMode === "radar") state.radar.status = "idle";
        }, mode);
        await activateMode(page, mode === "link" ? "mobility" : "link");
        await activateMode(page, mode);
      }
    }
    await activateMode(page, "link");
  };

  const modes = ["link", "mobility", "radiomap", "deepmimo", "radar"];
  for (const mode of modes) await activateMode(page, mode);
  await activateMode(page, "link");
  await exerciseResultCycles(1);
  await page.getByRole("button", { name: /^Map/ }).click();
  await expect(page.locator("#entryScreen")).toBeVisible();
  await page.getByRole("button", { name: "Return to 3D" }).click();
  await expect(page.locator("#entryScreen")).toBeHidden();
  await page.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      ),
  );
  const resourcesBefore = await capturePhase0ResourceSnapshot(page);
  const heapBefore = await heapMedian();

  for (let cycle = 0; cycle < 20; cycle += 1) {
    for (const mode of modes) await activateMode(page, mode);
  }
  await exerciseResultCycles(5);
  for (let cycle = 0; cycle < 10; cycle += 1) {
    await page.getByRole("button", { name: /^Map/ }).click();
    await expect(page.locator("#entryScreen")).toBeVisible();
    await page.getByRole("button", { name: "Return to 3D" }).click();
    await expect(page.locator("#entryScreen")).toBeHidden();
  }
  await activateMode(page, "link");
  await page.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      ),
  );

  const resourcesAfter = await capturePhase0ResourceSnapshot(page);
  const heapAfter = await heapMedian();
  const resourceDelta = Object.fromEntries(
    Object.keys(resourcesBefore).map((key) => [
      key,
      resourcesAfter[key] - resourcesBefore[key],
    ]),
  );
  expect(resourceDelta).toEqual({
    activeIntervals: 0,
    canvasElements: 0,
    domNodes: 0,
    frameListeners: 0,
    radarLabelElements: 0,
  });
  const heapGrowth = heapAfter - heapBefore;
  expect(heapGrowth).toBeLessThanOrEqual(8 * 1024 * 1024);
  expect(heapGrowth).toBeLessThanOrEqual(heapBefore * 0.2);
});
