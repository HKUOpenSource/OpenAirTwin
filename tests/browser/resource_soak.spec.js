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
  await page.evaluate(async () => {
    const [{ createAppDialogController }, { ui }, { state }] =
      await Promise.all([
        import("/js/controllers/app_dialog_controller.js?v=20260604-app-dialog"),
        import("/js/dom_refs.js?v=20260519-mode-isolation"),
        import("/js/app_state.js?v=20260723-radar-shared-groups"),
      ]);
    window.__oatSoakDialog = createAppDialogController({ ui });
    state.entry.sceneReady = true;
  });

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
  const exerciseResultCycles = async (resultCycleCount, dialogCycleCount) =>
    page.evaluate(
      async ({
        dialogCycles,
        linkResult,
        mobilityResult,
        radarResultFixture,
        radiomapResult,
        resultCycles,
      }) => {
        const { state } =
          await import("/js/app_state.js?v=20260723-radar-shared-groups");
        const modeButton = (mode) =>
          document.querySelector(`[data-mode="${mode}"]`);
        for (const mode of [
          "link",
          "mobility",
          "radiomap",
          "deepmimo",
          "radar",
        ]) {
          for (let cycle = 0; cycle < resultCycles; cycle += 1) {
            if (mode === "link") state.link.result = linkResult;
            if (mode === "mobility") state.mobility.result = mobilityResult;
            if (mode === "radiomap") {
              state.radiomap.result = radiomapResult;
              state.radiomap.status = "Succeeded";
            }
            if (mode === "deepmimo") {
              state.deepmimo.datasets = [
                {
                  jobId: `soak-${cycle}`,
                  scenarioName: "soak",
                  archiveName: "soak.zip",
                  downloadUrl: "/api/deepmimo/jobs/soak/download",
                  readyAt: "2026-07-31T00:00:00Z",
                },
              ];
            }
            if (mode === "radar") {
              state.radar.result = radarResultFixture;
              state.radar.status = "succeeded";
            }
            modeButton(mode).click();
            state[mode].result = null;
            if (mode === "radiomap") state.radiomap.status = "Idle";
            if (mode === "deepmimo") state.deepmimo.datasets = [];
            if (mode === "radar") state.radar.status = "idle";
            modeButton(mode === "link" ? "mobility" : "link").click();
            modeButton(mode).click();
          }
        }
        modeButton("link").click();
        for (let cycle = 0; cycle < dialogCycles; cycle += 1) {
          const pending = window.__oatSoakDialog.confirm({
            title: "Release Soak",
            message: "Confirm dialog lifecycle stability.",
          });
          window.__oatSoakDialog.cancelActiveDialog();
          await pending;
        }
      },
      {
        dialogCycles: dialogCycleCount,
        linkResult: LINK_RESULT,
        mobilityResult: MOBILITY_RESULT,
        radarResultFixture: radarFixture,
        radiomapResult: RADIOMAP_RESULT,
        resultCycles: resultCycleCount,
      },
    );
  const modes = ["link", "mobility", "radiomap", "deepmimo", "radar"];
  for (const mode of modes) await activateMode(page, mode);
  await activateMode(page, "link");
  await exerciseResultCycles(1, 1);
  await page.locator("#btnOpenTileIndex").click();
  await expect(page.locator("#entryScreen")).toBeVisible();
  await page.locator("#btnEntryReturnScene").click();
  await expect(page.locator("#entryScreen")).toBeHidden();
  await page.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      ),
  );
  const resourcesBefore = await capturePhase0ResourceSnapshot(page);
  const heapBefore = await heapMedian();

  for (let cycle = 0; cycle < 50; cycle += 1) {
    for (const mode of modes) await activateMode(page, mode);
  }
  await exerciseResultCycles(20, 25);
  for (let cycle = 0; cycle < 20; cycle += 1) {
    await page.locator("#btnOpenTileIndex").click();
    await expect(page.locator("#entryScreen")).toBeVisible();
    await page.locator("#btnEntryReturnScene").click();
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
  await page.evaluate(() => {
    window.__oatSoakDialog.dispose();
    delete window.__oatSoakDialog;
  });
});
