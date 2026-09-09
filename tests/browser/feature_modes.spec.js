import { expect, test } from "@playwright/test";
import { buildPhase1DomCompatibilityContract } from "./phase1_contracts.js";
import {
  UPDATE_PHASE0_BASELINE,
  assertUiResourcesLoad,
  writePhase0Observation,
  assertPhase1DomContract,
  LINK_RESULT,
  MOBILITY_RESULT,
  RADIOMAP_RESULT,
  radarResult,
  openDeterministicApp,
  activateMode,
  enableRealViewer,
  enableViewerStub,
  configureRadarFixture,
  configureMainDeviceFixture,
  expectNoSeriousAccessibilityViolations,
  installPhase0ResourceProbe,
  capturePhase0DomContract,
  capturePhase0ComputedStyles,
  capturePhase0ResourceSnapshot,
} from "./workbench-fixture.js";

test("core CSS modules load in order and keep controls scrollable", async ({
  page,
}) => {
  const cssResponses = [];
  page.on("response", (response) => {
    const url = new URL(response.url());
    if (
      url.pathname.startsWith("/css/") ||
      url.pathname.startsWith("/workbench/assets/css/")
    ) {
      cssResponses.push({ path: url.pathname, status: response.status() });
    }
  });
  await openDeterministicApp(page);

  const architecture = await page.evaluate(() => {
    const sheets = [...document.styleSheets].filter((sheet) => {
      const path = new URL(sheet.href).pathname;
      return (
        path.startsWith("/css/") || path.startsWith("/workbench/assets/css/")
      );
    });
    const style = (selector) =>
      getComputedStyle(document.querySelector(selector));
    return {
      sheets: sheets.map((sheet) => ({
        path: new URL(sheet.href).pathname,
        rules: [...sheet.cssRules].map((rule) => rule.cssText.slice(0, 120)),
      })),
      bodyOverflowY: style("#uiBody").overflowY,
    };
  });
  const expectedPaths = [
    "/css/tokens.css",
    "/css/base.css",
    "/css/components.css",
    "/css/shell.css",
    "/css/entry-map.css",
    "/css/results.css",
    "/css/radar.css",
  ];
  const sourceName = (path) => {
    if (path.startsWith("/css/")) return path.slice("/css/".length);
    const match = path.match(
      /^\/workbench\/assets\/css\/(.+)-[A-Za-z0-9_-]{8,}\.css$/,
    );
    return match ? `${match[1]}.css` : path;
  };
  const expectedNames = expectedPaths.map((path) => path.slice("/css/".length));
  expect(cssResponses.every(({ status }) => status === 200)).toBe(true);
  expect(cssResponses.map(({ path }) => sourceName(path)).sort()).toEqual(
    [...expectedNames].sort(),
  );
  expect(architecture.sheets.map(({ path }) => sourceName(path))).toEqual(
    expectedNames,
  );
  expect(architecture.sheets.every(({ rules }) => rules.length > 0)).toBe(true);
  const layerRules = architecture.sheets.map(({ rules }) =>
    rules.find((rule) => rule.startsWith("@layer ")),
  );
  expect(layerRules[0]).toContain(
    "@layer reset, tokens, base, components, layout, features, utilities",
  );
  expect(layerRules.slice(1)).toEqual([
    expect.stringContaining("@layer reset"),
    expect.stringContaining("@layer components"),
    expect.stringContaining("@layer layout"),
    expect.stringContaining("@layer features"),
    expect.stringContaining("@layer features"),
    expect.stringContaining("@layer features"),
  ]);
  expect(architecture.bodyOverflowY).toBe("auto");
});

test("UI assets load and mode switching releases owned resources", async ({
  page,
  browserName,
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

  const wallStartMs = Date.now();
  await openDeterministicApp(page);
  const uiReadyWallMs = Date.now() - wallStartMs;
  if (UPDATE_PHASE0_BASELINE) {
    writePhase0Observation(
      "phase-0-dom-contract.json",
      await capturePhase0DomContract(page),
    );
    writePhase0Observation(
      "phase-0-computed-styles.json",
      await capturePhase0ComputedStyles(page),
    );
  }
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
  expect(resourceDelta).toEqual({
    activeIntervals: 0,
    canvasElements: 0,
    domNodes: 0,
    frameListeners: 0,
    radarLabelElements: 0,
  });

  const networkContract = (await Promise.all(responseRecords)).sort(
    (left, right) => left.path.localeCompare(right.path),
  );
  assertUiResourcesLoad(networkContract);
  if (!UPDATE_PHASE0_BASELINE) return;
  const runtimeObservation = await page.evaluate(() => {
    const navigation = performance.getEntriesByType("navigation")[0];
    const paints = Object.fromEntries(
      performance
        .getEntriesByType("paint")
        .map((entry) => [entry.name, Math.round(entry.startTime * 100) / 100]),
    );
    const resources = performance.getEntriesByType("resource");
    return {
      browser: {
        hardwareConcurrency: navigator.hardwareConcurrency,
        language: navigator.language,
        platform: navigator.platform,
        userAgent: navigator.userAgent,
      },
      memory: performance.memory
        ? {
            jsHeapSizeLimit: performance.memory.jsHeapSizeLimit,
            totalJSHeapSize: performance.memory.totalJSHeapSize,
            usedJSHeapSize: performance.memory.usedJSHeapSize,
          }
        : null,
      navigationMs: navigation
        ? {
            domComplete: Math.round(navigation.domComplete * 100) / 100,
            domContentLoaded:
              Math.round(navigation.domContentLoadedEventEnd * 100) / 100,
            loadEventEnd: Math.round(navigation.loadEventEnd * 100) / 100,
            responseEnd: Math.round(navigation.responseEnd * 100) / 100,
          }
        : null,
      paints,
      transfer: {
        decodedBodyBytes: resources.reduce(
          (total, entry) => total + entry.decodedBodySize,
          0,
        ),
        encodedBodyBytes: resources.reduce(
          (total, entry) => total + entry.encodedBodySize,
          0,
        ),
        resourceCount: resources.length,
        transferBytes: resources.reduce(
          (total, entry) => total + entry.transferSize,
          0,
        ),
      },
      viewport: { height: innerHeight, width: innerWidth },
    };
  });

  writePhase0Observation("phase-0-resource-contract.json", {
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

test("DOM ownership and interaction commands remain explicit", async ({
  page,
}) => {
  await openDeterministicApp(page);
  const phase0Contract = await capturePhase0DomContract(page);
  const contract = buildPhase1DomCompatibilityContract(phase0Contract);
  expect(contract.elements).toHaveLength(phase0Contract.elements.length);
  expect(
    contract.elements.every(
      ({ owner, compatibility }) => owner && compatibility === "required",
    ),
  ).toBe(true);
  expect(
    contract.elements
      .filter(({ tag }) =>
        [
          "button",
          "details",
          "input",
          "select",
          "summary",
          "textarea",
        ].includes(tag),
      )
      .every(
        ({ interaction }) =>
          interaction?.command && interaction?.events?.length,
      ),
  ).toBe(true);
  assertPhase1DomContract(contract);
});

test("non-Radar modes share one keyboard-accessible Propagation Solver group", async ({
  page,
}) => {
  await openDeterministicApp(page);
  const expectedControls = {
    link: [
      "linkSamplesPerSrc",
      "linkMaxNumPaths",
      "cfgMaxDepth",
      "cfgSeed",
      "linkSyntheticArray",
      "cfgLos",
      "cfgSpecular",
      "cfgDiffuse",
      "cfgRefraction",
      "linkDiffraction",
      "linkEdgeDiffraction",
      "linkDiffractionLitRegion",
    ],
    mobility: [
      "linkSamplesPerSrc",
      "linkMaxNumPaths",
      "cfgMaxDepth",
      "cfgSeed",
      "linkSyntheticArray",
      "cfgLos",
      "cfgSpecular",
      "cfgDiffuse",
      "cfgRefraction",
      "linkDiffraction",
      "linkEdgeDiffraction",
      "linkDiffractionLitRegion",
    ],
    radiomap: [
      "rmSamplesPerTx",
      "cfgMaxDepth",
      "cfgSeed",
      "cfgLos",
      "cfgSpecular",
      "cfgDiffuse",
      "cfgRefraction",
    ],
    deepmimo: [
      "cfgMaxDepth",
      "cfgSeed",
      "cfgLos",
      "cfgSpecular",
      "cfgDiffuse",
      "cfgRefraction",
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
    expect(
      await group
        .locator("input:visible, select:visible")
        .evaluateAll((controls) => controls.map((control) => control.id)),
    ).toEqual(controlIds);

    await page.keyboard.press("Space");
    await expect(group).not.toHaveAttribute("open", "");
  }
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
  expect(
    await page
      .locator("#linkTxX, #linkTxY, #linkTxZ, #linkRxX, #linkRxY, #linkRxZ")
      .evaluateAll((inputs) => inputs.map((input) => input.value)),
  ).toEqual(["", "", "", "", "", ""]);
  await expect(page.locator("#btnSolveLink")).toBeDisabled();
  await expect(page.locator("#btnSolveLink")).toHaveAttribute(
    "title",
    "Place Link Tx and Rx before solving the link.",
  );
  await expect(page.locator("#btnOrbitTx")).toBeDisabled();

  await activateMode(page, "mobility");
  await expect(page.locator("#btnRunMobility")).toBeDisabled();
  await expect(page.locator("#btnRunMobility")).toHaveAttribute(
    "title",
    "Place Mobility Tx before running mobility.",
  );
  await expect(page.locator("#btnMobilityAddRxPoint")).toBeDisabled();

  await activateMode(page, "radiomap");
  await expect(page.locator("#btnRunRadiomap")).toBeDisabled();
  await expect(page.locator("#btnRunRadiomap")).toHaveAttribute(
    "title",
    "Place Radio Map Tx before running the radio map.",
  );

  await activateMode(page, "deepmimo");
  await expect(page.locator("#btnRunDeepMimo")).toBeDisabled();
  await expect(page.locator("#btnRunDeepMimo")).toHaveAttribute(
    "title",
    "Place DeepMIMO Tx before exporting data.",
  );
});

test("five modes, dialog and error states pass the release accessibility gate", async ({
  page,
}) => {
  test.setTimeout(60_000);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await openDeterministicApp(page);
  await enableRealViewer(page);
  await configureMainDeviceFixture(page);
  await configureRadarFixture(page);

  for (const mode of ["link", "mobility", "radiomap", "deepmimo", "radar"]) {
    await activateMode(page, mode);
    await expectNoSeriousAccessibilityViolations(page, `${mode} mode`);
  }

  await page.evaluate(async () => {
    const { state } =
      await import("/js/app_state.js?v=20260723-radar-shared-groups");
    state.radar.status = "failed";
    state.radar.failureKind = "offline";
    state.radar.error = "OpenAirTwin is offline or the server is unavailable";
    document.querySelector('[data-mode="link"]').click();
    document.querySelector('[data-mode="radar"]').click();
  });
  await expect(page.locator("#radarJobBar")).toHaveAttribute(
    "data-failure-kind",
    "offline",
  );
  await expectNoSeriousAccessibilityViolations(page, "Radar offline error");

  const focusTarget = page.locator("#btnOrbitTx");
  await focusTarget.focus();
  await page.evaluate(async () => {
    const [{ createAppDialogController }, { ui }] = await Promise.all([
      import("/js/controllers/app_dialog_controller.js?v=20260604-app-dialog"),
      import("/js/dom_refs.js?v=20260519-mode-isolation"),
    ]);
    const controller = createAppDialogController({ ui });
    window.__oatAccessibilityDialog = controller;
    controller.confirm({
      title: "Retry Request",
      message: "The previous request failed. Retry it now?",
      variant: "warning",
    });
  });
  await expect(page.locator("#appDialogCard")).toBeVisible();
  await expect(page.locator("#appDialogPrimary")).toBeFocused();
  await expectNoSeriousAccessibilityViolations(page, "retry dialog");
  await page.evaluate(() => {
    window.__oatAccessibilityDialog.cancelActiveDialog();
    window.__oatAccessibilityDialog.dispose();
    delete window.__oatAccessibilityDialog;
  });
  await expect(focusTarget).toBeFocused();

  const reducedMotion = await page.evaluate(() => ({
    matches: matchMedia("(prefers-reduced-motion: reduce)").matches,
    controlTransition: getComputedStyle(document.querySelector("#ui"))
      .transitionDuration,
    resultTransition: getComputedStyle(
      document.querySelector("#linkChannelSection"),
    ).transitionDuration,
  }));
  expect(reducedMotion).toEqual({
    matches: true,
    controlTransition: "0s",
    resultTransition: "0s",
  });
});

test("transmitter orbit availability follows the active feature", async ({
  page,
}) => {
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
    const { state } =
      await import("/js/app_state.js?v=20260723-radar-shared-groups");
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
  await expect(page.locator("#btnOrbitTx")).toHaveAttribute(
    "title",
    "Place Tx before orbiting.",
  );
});

test("feature transports, polling, controls and scene layers remain isolated", async ({
  page,
}) => {
  let linkRequests = 0;
  let radarRequests = 0;
  let deepCreates = 0;
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
  await page.route("**/api/radar/jobs/radar-1/cancel", (route) =>
    route.fulfill({
      json: {
        job_id: "radar-1",
        status: "cancelled",
        progress: 1,
        message: "Cancelled",
      },
    }),
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
    deepCreates += 1;
    submitted.deepmimo = route.request().postDataJSON();
    const jobId = deepCreates === 1 ? "deep-cancel" : "deep-ok";
    await route.fulfill({
      status: 202,
      json: { job_id: jobId, status: "running", progress: 0.2 },
    });
  });
  await page.route("**/api/deepmimo/jobs/deep-cancel/cancel", (route) =>
    route.fulfill({
      json: {
        job_id: "deep-cancel",
        status: "cancelled",
        progress: 1,
        message: "Cancelled",
      },
    }),
  );
  await page.route("**/api/deepmimo/jobs/deep-cancel", (route) =>
    route.fulfill({
      json: {
        job_id: "deep-cancel",
        status: "running",
        progress: 0.3,
        message: "Tracing",
      },
    }),
  );
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

  await page.locator("#btnSolveLink").click();
  await expect(page.locator("#linkResult")).toBeVisible();
  await expect(page.locator("#linkPower")).toHaveText("-81.25 dB");
  await expect(page.locator(".pathRow")).toHaveCount(1);
  const sharedResultDockWidth = await page
    .locator("#linkChannelSection")
    .evaluate((dock) => dock.getBoundingClientRect().width);
  expect(sharedResultDockWidth).toBe(375);
  expect(
    await page.evaluate(async () => {
      const { viewerRef } =
        await import("/js/app_state.js?v=20260723-radar-shared-groups");
      return viewerRef.current.pathLayer.group.children.length;
    }),
  ).toBe(1);

  await page.locator("details.livePreviewParam > summary").click();
  await page.locator("#livePreviewEnabled").check();
  await page.locator("#livePreviewPathsDelay").fill("0");
  await page.locator("#btnPickLinkTx").click();
  await page.locator("#linkTxX").fill("73");
  await page.locator("#linkTxX").press("Tab");
  await expect.poll(() => linkRequests).toBeGreaterThan(1);

  await configureRadarFixture(page);
  await activateMode(page, "radar");
  await expect(page.locator("#radarAssetPicker")).toHaveAttribute(
    "data-state",
    "empty",
  );
  await expect(page.locator("#radarAssetPreviewStatus")).toHaveText(
    "No drone models available.",
  );
  await expect(page.locator("#btnAddRadarTarget")).toBeDisabled();
  await page.locator("#radarWaveformGroup > summary").click();
  await page.locator("#radarPropagationGroup > summary").click();
  const radarDerivedLabels = await page
    .locator(".radarDerivedLabel")
    .evaluateAll((labels) =>
      labels.map((label) => ({
        text: label.firstElementChild?.innerText,
        breakCount: label.querySelectorAll("br").length,
        height: label.getBoundingClientRect().height,
      })),
    );
  expect(radarDerivedLabels.map(({ text }) => text)).toEqual([
    "Range\nResolution",
    "Doppler\nResolution",
    "Velocity\nResolution",
  ]);
  expect(radarDerivedLabels.map(({ breakCount }) => breakCount)).toEqual([
    1, 1, 1,
  ]);
  expect(new Set(radarDerivedLabels.map(({ height }) => height)).size).toBe(1);
  const radarActionOrder = await page
    .locator("#deviceActionBar .deviceActionBtn:not(.hidden)")
    .evaluateAll((buttons) =>
      buttons
        .map((button) => ({
          label: button.querySelector(".deviceActionText")?.textContent?.trim(),
          left: button.getBoundingClientRect().left,
        }))
        .sort((left, right) => left.left - right.left)
        .map(({ label }) => label),
    );
  expect(radarActionOrder).toEqual(["Tx", "Rx", "Orbit", "Run Radar"]);
  await expect(
    page.locator(
      "#btnPickRadarTx .deviceActionIcon, #btnPickRadarRx .deviceActionIcon, #btnSolveRadar .deviceActionIcon",
    ),
  ).toHaveCount(3);
  const carrierInfoTip = page.locator(
    'label[for="radarCarrierFrequency"] .infoTip',
  );
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
  expect(tooltipFocusState).toMatchObject({
    active: true,
    text: expect.stringContaining("RF carrier"),
  });
  expect(tooltipFocusState.className).not.toContain("hidden");
  await page.locator("#radarSamplesPerSrc").evaluate((input) => {
    input.value = "42000";
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await page.locator("#btnPickRadarTx").click();
  await page.locator("#radarTxX").fill("76");
  await page.locator("#radarTxX").press("Tab");
  expect(radarRequests).toBe(0);
  await page.locator("#btnSolveRadar").click();
  await expect.poll(() => radarRequests).toBe(1);
  await expect(page.locator("#resultDockTitle")).toHaveText(
    "Radar Sensing Results",
  );
  await expect(page.locator("#radarDetectionMetric")).toHaveText(
    "2 target detections · 2 total",
  );
  await expect(page.locator("#radarPathMetric")).toHaveText(
    "2 target · 1 clutter",
  );
  await expect(page.locator("#radarNoiseMetric")).toHaveText("-118.0 dBm");
  await expect(page.locator("#radarResolutionSection")).toHaveCount(0);
  await expect(page.locator("#radarDetectionList .radarResultRow")).toHaveCount(
    2,
  );
  await expect(
    page.locator("#radarTruthList .radarResultRow").first(),
  ).toContainText("DJI Mini 3");
  await expect(
    page.locator("#radarTruthList .radarResultRow").first(),
  ).toContainText("Directly visible");
  await expect(
    page.locator("#radarTruthList .radarResultRow").nth(1),
  ).toContainText("Visible via multipath");
  expect(
    await page.evaluate(async () => {
      const { radarObservabilityLabel } =
        await import("/js/features/radar/presentation.js?v=20260722-radar-ui-consistency");
      return ["direct", "multipath", "blocked"].map(radarObservabilityLabel);
    }),
  ).toEqual(["Directly visible", "Visible via multipath", "Blocked"]);
  const radarResultLayout = await page
    .locator("#linkChannelSection")
    .evaluate((dock) => {
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
  expect(
    await page.evaluate(async () => {
      const { state } =
        await import("/js/app_state.js?v=20260723-radar-shared-groups");
      return {
        linkTx: state.link.tx[0],
        radarTx: state.radar.tx[0],
        linkSamples: state.link.advanced.samplesPerSrc,
        radarSamples: state.radar.solver.samplesPerSrc,
      };
    }),
  ).toEqual({
    linkTx: 73,
    radarTx: 76,
    linkSamples: 30000,
    radarSamples: 42000,
  });

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
    slider.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await expect(page.locator("#mobilityStepLabel")).toContainText("Step 2");
  await page.locator("#btnMobilityPlay").click();
  await expect(page.locator("#btnMobilityPlay")).toHaveText("Pause");
  expect(
    await page.evaluate(async () => {
      const { viewerRef } =
        await import("/js/app_state.js?v=20260723-radar-shared-groups");
      return {
        paths: viewerRef.current.pathLayer.group.children.length,
        trajectory: viewerRef.current.mobilityLayer.group.children.length,
      };
    }),
  ).toEqual({ paths: 1, trajectory: 3 });

  await activateMode(page, "radiomap");
  await expect(page.locator("#btnMobilityPlay")).toHaveText("Play");
  await page.locator("#btnRunRadiomap").click();
  await expect(page.locator("#radiomapResult")).toBeVisible();
  await expect(page.locator("#rmStatus")).toHaveText("Succeeded");
  expect(
    await page.evaluate(async () => {
      const { viewerRef } =
        await import("/js/app_state.js?v=20260723-radar-shared-groups");
      return {
        paths: viewerRef.current.pathLayer.group.children.length,
        trajectory: viewerRef.current.mobilityLayer.group.children.length,
        heatmap: viewerRef.current.radiomapLayer.group.children.length,
      };
    }),
  ).toEqual({ paths: 0, trajectory: 0, heatmap: 1 });

  await page.locator("#cfgFrequency").fill("3.6");
  await page.locator("#cfgFrequency").press("Tab");
  await expect
    .poll(async () =>
      page.evaluate(async () => {
        const { state, viewerRef } =
          await import("/js/app_state.js?v=20260723-radar-shared-groups");
        return (
          !state.radiomap.result &&
          viewerRef.current.radiomapLayer.group.children.length === 0
        );
      }),
    )
    .toBe(true);

  await page.evaluate(async () => {
    const { state } =
      await import("/js/app_state.js?v=20260723-radar-shared-groups");
    state.deepmimo.roi.cornerA = [60, 30, 0];
    state.deepmimo.roi.cornerB = [80, 50, 0];
    state.deepmimo.roi.visualZ = 0;
  });
  await activateMode(page, "deepmimo");
  expect(
    await page.evaluate(async () => {
      const { viewerRef } =
        await import("/js/app_state.js?v=20260723-radar-shared-groups");
      return {
        heatmap: viewerRef.current.radiomapLayer.group.children.length,
        roi: viewerRef.current.deepMimoRoiLayer.group.children.length,
      };
    }),
  ).toEqual({ heatmap: 0, roi: 2 });

  await page.locator("#btnRunDeepMimo").click();
  await expect(page.locator("#btnLoadingCancel")).toBeVisible();
  await page.locator("#btnLoadingCancel").click();
  await expect(page.locator("#btnRunDeepMimo")).not.toHaveAttribute(
    "aria-busy",
    "true",
    { timeout: 5_000 },
  );
  await expect(page.locator("#deepMimoDatasetCount")).toHaveText("0");

  await page.locator("#btnRunDeepMimo").click();
  await expect(page.locator("#deepMimoDatasetCount")).toHaveText("1");
  await page.locator("#deepMimoDatasetToggle").click();
  await expect(
    page.locator("#deepMimoDatasetList .deepMimoDatasetDownload"),
  ).toHaveAttribute("href", /deep-ok\/download$/);

  expect(Object.keys(submitted).sort()).toEqual([
    "deepmimo",
    "link",
    "mobility",
    "radar",
    "radiomap",
  ]);
  expect(submitted.mobility.rx_trajectory.points).toHaveLength(2);
  expect(submitted.radiomap.surface).toBeTruthy();
  expect(submitted.deepmimo.roi).toBeTruthy();
  expect(submitted.radar).toMatchObject({
    schema_version: 1,
    mode: "bistatic",
    targets: [{ id: "target-1" }, { id: "target-2" }],
    waveform: { num_subcarriers: 1024, num_symbols: 1024 },
  });
  expect(submitted.radar.channel).toBeUndefined();
  expect(submitted.radar.solver.frequency_hz).toBeUndefined();
  expect(submitted.radar.waveform.carrier_frequency_hz).toBeGreaterThan(0);
});

test("feature registry accepts a virtual domain feature without template injection", async ({
  page,
}) => {
  await openDeterministicApp(page);
  const result = await page.evaluate(async () => {
    const { defineFeature, FeatureRegistry, FeatureStore } =
      await import("/js/core/feature_registry.js");
    const virtual = defineFeature({
      id: "virtual",
      order: 5,
      title: "Virtual",
      createState: () => ({ ready: true }),
      queryDom: (root) => ({ panel: root.getElementById("ui") }),
      createTransport: () => ({ kind: "transport" }),
      createResultView: () => ({ viewReady: true }),
      createController: () => ({ controllerReady: true }),
      createRenderer: () => ({ rendererReady: true }),
      createFeature: ({ featureState }) => ({
        activate: () => {
          featureState.activated = true;
        },
      }),
    });
    const store = new FeatureStore([virtual]);
    const registry = new FeatureRegistry({ definitions: [virtual], store });
    registry.initialize({ documentRoot: document });
    registry.activate("virtual");
    const instance = registry.instance("virtual");
    return {
      ids: registry.definitions().map((item) => item.id),
      state: store.get("virtual"),
      panel: instance.dom.panel.id,
      transport: registry.transport("virtual").kind,
      components: [
        instance.viewReady,
        instance.controllerReady,
        instance.rendererReady,
      ],
    };
  });
  expect(result).toEqual({
    ids: ["virtual"],
    state: { ready: true, activated: true },
    panel: "ui",
    transport: "transport",
    components: [true, true, true],
  });
});

test("full workbench desktop snapshots stay stable", async ({ page }) => {
  await page.route("**/api/link/solve", (route) =>
    route.fulfill({ json: LINK_RESULT }),
  );
  await openDeterministicApp(page);
  await enableViewerStub(page);
  await configureMainDeviceFixture(page);
  await activateMode(page, "link");
  await page.locator("#btnSolveLink").click();
  await expect(page.locator("#linkPower")).toHaveText("-81.25 dB");
  await expect(page.locator("#deviceDock")).toBeVisible();
  await expect(page.locator("#performanceDock")).toBeVisible();
  if (
    await page
      .locator("#performanceDock")
      .evaluate((dock) => dock.classList.contains("collapsed"))
  ) {
    await page.locator("#btnPerformanceDockToggle").click();
  }
  await expect(page.locator("#performanceDock")).not.toHaveClass(/collapsed/);

  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(page.locator("#performanceDock")).toHaveScreenshot(
    "performance-dock-expanded.png",
    {
      animations: "disabled",
      caret: "hide",
    },
  );
  await expect(page).toHaveScreenshot("workbench-shell-1440.png", {
    animations: "disabled",
    caret: "hide",
    fullPage: false,
  });

  await page.locator("#btnPerformanceDockToggle").click();
  await expect(page.locator("#performanceDock")).toHaveClass(/collapsed/);
  await page.setViewportSize({ width: 1280, height: 720 });
  const layout = await page.evaluate(() => {
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
    const performance = rect("#performanceDock");
    return {
      controlDevicesOverlap: overlaps(control, devices),
      controlResultsOverlap: overlaps(control, results),
      devicesWithinViewport:
        devices.left >= 0 &&
        devices.right <= innerWidth &&
        devices.bottom <= innerHeight,
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

test("catalog order and five mode control snapshots stay stable", async ({
  page,
}) => {
  await openDeterministicApp(page);
  expect(
    await page
      .locator("#modeMenu [data-mode]")
      .evaluateAll((nodes) => nodes.map((node) => node.dataset.mode)),
  ).toEqual(["link", "mobility", "radiomap", "deepmimo", "radar"]);

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
    await expect(page.locator("#modeSelectTitle")).toHaveText(
      `Mode (${title})`,
    );
    await expect(page.locator(`[data-mode="${mode}"]`)).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await expect(page.locator("#ui")).toHaveScreenshot(`${mode}-controls.png`, {
      animations: "disabled",
      caret: "hide",
    });
  }
});

test("Radar result dock visual snapshots stay stable", async ({ page }) => {
  let submittedRadar = null;
  await page.route("**/assets/radar/drones/manifest.json", (route) =>
    route.fulfill({
      json: { schema_version: 1, assets: [] },
    }),
  );
  await page.route("**/api/radar/jobs", async (route) => {
    submittedRadar = route.request().postDataJSON();
    await route.fulfill({
      status: 202,
      json: {
        ok: true,
        job_id: "radar-snapshot",
        status: "queued",
        scene_generation: 7,
      },
    });
  });
  await page.route("**/api/radar/jobs/radar-snapshot/result", (route) =>
    route.fulfill({
      json: radarResult(submittedRadar),
    }),
  );
  await page.route("**/api/radar/jobs/radar-snapshot", (route) =>
    route.fulfill({
      json: {
        job_id: "radar-snapshot",
        status: "succeeded",
        progress: 1,
        message: "Ready",
        scene_generation: 7,
      },
    }),
  );

  await openDeterministicApp(page);
  await enableRealViewer(page);
  await configureRadarFixture(page);
  await activateMode(page, "radar");
  await page.locator("#btnSolveRadar").click();
  await expect(page.locator("#resultDockTitle")).toHaveText(
    "Radar Sensing Results",
  );
  await expect(page.locator("#radarDetectionList .radarResultRow")).toHaveCount(
    2,
  );
  await expect(page.locator("#linkChannelSection")).toHaveScreenshot(
    "radar-result-dock.png",
    {
      animations: "disabled",
      caret: "hide",
      maxDiffPixels: 350,
    },
  );

  await page.evaluate(async () => {
    const { state, viewerRef } =
      await import("/js/app_state.js?v=20260723-radar-shared-groups");
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
    viewer.camera.position.set(
      target.position[0] - 28,
      target.position[1] - 36,
      target.position[2] + 22,
    );
    viewer.camera.lookAt(viewer.controls.target);
    viewer.controls.update();
  });
  await activateMode(page, "link");
  await activateMode(page, "radar");
  const targetLabel = page.locator(
    '.radarTargetLabel[data-target-id="target-3"]',
  );
  await expect(targetLabel).toBeVisible();
  await expect(targetLabel.locator("strong")).toHaveText("Target 3");
  await expect(targetLabel.locator("small")).toHaveText(
    "12.0 m/s · RCS 0.025 m²",
  );
  await expect(targetLabel).toHaveScreenshot("radar-target-label.png", {
    maxDiffPixels: 10,
  });
});
