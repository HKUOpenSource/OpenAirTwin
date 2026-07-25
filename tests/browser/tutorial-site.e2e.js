import { expect, test } from "@playwright/test";

const storageKey = "openairtwin:tutorial-progress";
const tutorialUrl = (path = "map/search-location") =>
  `?tutorial=${path}#workflow-tutorial`;

test.beforeEach(async ({ page }) => {
  await page.addInitScript((key) => window.localStorage.removeItem(key), storageKey);
});

test("restores the original page order, navigation, and feature grid", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(tutorialUrl());

  const sectionOrder = await page.locator("main > section").evaluateAll((sections) =>
    sections.map((section) => section.id),
  );
  expect(sectionOrder).toEqual(["home", "features", "workflow-tutorial", "quick-start"]);
  await expect(page.locator(".hero")).not.toHaveClass(/heroCompact/);
  await expect(page.getByRole("link", { name: "Get Started" })).toHaveAttribute("href", "#features");
  expect(await page.locator(".topNav nav a").allTextContents()).toEqual(["Features", "Tutorial", "Setup"]);
  await expect(page.getByRole("link", { name: "Watch tutorial" })).toHaveCount(6);
  await expect(page.locator(".featureCard")).toHaveCount(6);
  expect(await page.locator(".featureGrid").evaluate((element) =>
    getComputedStyle(element).gridTemplateColumns.split(" ").length,
  )).toBe(3);

  const steps = page.locator(".tutorialSteps");
  const stage = page.locator(".tutorialStageWorkspace");
  const [stepsBox, stageBox] = await Promise.all([steps.boundingBox(), stage.boundingBox()]);
  expect(stepsBox.x).toBeLessThan(stageBox.x);
  expect(Math.abs(stepsBox.y - stageBox.y)).toBeLessThanOrEqual(2);
  await expect(page.locator(".tutorialSteps button").first()).toContainText("01");
  await expect(page.locator(".tutorialStageHeader .tutorialPrompt")).toHaveCount(1);
  await expect(page.locator("#workflow-tutorial .tutorialSidebar, #workflow-tutorial .tutorialStepRail, #workflow-tutorial video, #workflow-tutorial .guidePanel")).toHaveCount(0);

  await page.locator(".featureCard").filter({ hasText: "Mobility" })
    .getByRole("link", { name: "Watch tutorial" }).click();
  await expect(page.getByRole("tab", { name: "Mobility" })).toHaveAttribute("aria-selected", "true");
  await expect(page.locator(".tutorialSteps button[aria-current='step']")).toContainText("Set the fixed transmitter");
});

test("opens a stable deep link with the approved manual screenshot", async ({ page }) => {
  await page.goto(tutorialUrl("radar/run-radar"));

  await expect(page.getByRole("tab", { name: "Radar Sensing" })).toHaveAttribute("aria-selected", "true");
  await expect(page.locator(".tutorialSteps button[aria-current='step']")).toContainText("Run Radar");
  await expect(page.locator(".tutorialCanvas img")).toHaveCount(1);
  await expect.poll(async () =>
    page.locator(".tutorialCanvas img").evaluate((image) => image.naturalWidth),
  ).toBe(4064);
  await expect(page.locator(".tutorialStageFooter")).toHaveCount(0);
  await expect(page.locator(".tutorialCanvas img")).toHaveAttribute("src", /tutorial\/manual\/radar\.png$/);
  await expect(page).toHaveURL(/tutorial=radar%2Frun-radar|tutorial=radar\/run-radar/);
});

test("Map Selection moves through four distinct manual interface states", async ({ page }) => {
  await page.goto(tutorialUrl());
  const image = page.locator(".tutorialCanvas img");

  await expect(image).toHaveAttribute("src", /map-search\.png$/);
  await page.getByRole("button", { name: "Next step" }).click();
  await expect(image).toHaveAttribute("src", /map-selected\.png$/);
  await page.getByRole("button", { name: "Next step" }).click();
  await expect(image).toHaveAttribute("src", /map-loading\.png$/);
  await page.getByRole("button", { name: "Next step" }).click();
  await expect(image).toHaveAttribute("src", /map-scene\.png$/);
});

test("exploring a target records progress but waits for an explicit next step", async ({ page }) => {
  await page.goto(tutorialUrl("link/place-tx"));
  const currentStep = page.locator(".tutorialSteps button[aria-current='step']");
  await expect(currentStep).toContainText("Place the transmitter");

  const target = page.locator("[data-tutorial-target]");
  await expect(target).toHaveCount(1);
  await target.click();
  await expect(target).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".tutorialPrompt")).toContainText("blue Tx marker");
  await expect(page.locator(".tutorialPrompt")).not.toHaveClass(/success/);
  await expect(target.locator("span")).toHaveText("1");
  await expect(target).not.toHaveClass(/explored/);
  await expect(page.locator(".tutorialTargetBox")).not.toHaveClass(/explored/);
  await expect(page.locator(".tutorialSteps button").filter({ hasText: "Place the transmitter" })).toContainText("✓");
  await expect(currentStep).toContainText("Place the transmitter");

  const saved = await page.evaluate((key) => JSON.parse(window.localStorage.getItem(key)), storageKey);
  expect(saved).toMatchObject({
    version: 2,
    modeId: "link",
    stepId: "place-tx",
  });
  expect(saved.completedSteps).toContain("link/place-tx");

  await page.getByRole("button", { name: "Next step" }).click();
  await expect(currentStep).toContainText("Place the receiver");
  await expect(page.locator(".tutorialCanvas img")).toHaveAttribute("src", /tutorial\/manual\/link\.png$/);
});

test("migrates legacy index progress and restores stable IDs", async ({ page }) => {
  await page.addInitScript(({ key, value }) => {
    window.localStorage.setItem(key, JSON.stringify(value));
  }, {
    key: storageKey,
    value: {
      modeId: "mobility",
      stepIndex: 2,
      completedSteps: ["mobility/set-tx"],
    },
  });
  await page.goto("");

  await expect(page.getByRole("tab", { name: "Mobility" })).toHaveAttribute("aria-selected", "true");
  await expect(page.locator(".tutorialSteps button[aria-current='step']")).toContainText("Configure and run mobility");
  await expect.poll(async () => page.evaluate((key) => {
    const saved = JSON.parse(window.localStorage.getItem(key));
    return `${saved.version}:${saved.stepId}`;
  }, storageKey)).toBe("2:tune-trajectory-sampling");
});

test("restores selection with browser history", async ({ page }) => {
  await page.goto(tutorialUrl("radiomap/place-tx"));
  await page.getByRole("button", { name: "Next step" }).click();
  await expect(page.locator(".tutorialSteps button[aria-current='step']")).toContainText("Configure the terrain patch");
  await page.goBack();
  await expect(page.locator(".tutorialSteps button[aria-current='step']")).toContainText("Place the transmitter");
});

test("renders compound targets and the revised Radio Map and Radar workflows", async ({ page }) => {
  await page.goto(tutorialUrl("link/configure-solver-cir"));
  await expect(page.locator("[data-tutorial-target]")).toHaveCount(2);
  await expect(page.getByRole("button", { name: /Explore Solve Link/ })).toBeVisible();

  await page.goto(tutorialUrl("mobility/add-rx-waypoints-enter"));
  await expect(page.locator("[data-tutorial-target]")).toHaveCount(2);
  await expect(page.getByRole("button", { name: /Explore Rx/ })).toBeVisible();

  await page.goto(tutorialUrl("deepmimo/export-dataset-tray"));
  await expect(page.locator("[data-tutorial-target]")).toHaveCount(2);
  await expect(page.getByRole("button", { name: /Explore Generated dataset/ })).toBeVisible();

  await page.goto(tutorialUrl("radiomap/configure-patch"));
  const currentStep = page.locator(".tutorialSteps button[aria-current='step']");
  await expect(currentStep).toContainText("Configure the terrain patch");
  await page.getByRole("button", { name: "Next step" }).click();
  await expect(currentStep).toContainText("Run Map");
  await page.getByRole("button", { name: "Next step" }).click();
  await expect(currentStep).toContainText("Inspect radio map results");

  await page.goto(tutorialUrl("radar/add-targets"));
  await expect(currentStep).toContainText("Configure radar and targets");
  await expect(page.locator("[data-tutorial-target]")).toHaveCount(1);
  await page.getByRole("button", { name: "Next step" }).click();
  await expect(currentStep).toContainText("Run Radar");
  await page.getByRole("button", { name: "Next step" }).click();
  await expect(currentStep).toContainText("Inspect radar detections");
});

test("keeps the written walkthrough usable when a screenshot fails", async ({ page }) => {
  await page.route("**/media/tutorial/manual/map-search.png", (route) => route.abort("failed"));
  await page.goto(tutorialUrl());

  await expect(page.locator(".imageFallback")).toContainText("Screenshot unavailable");
  await expect(page.locator(".tutorialPrompt")).toContainText("Select the highlighted search panel");
  await expect(page.locator(".tutorialSteps button")).toHaveCount(4);
});

test("keeps each mode to four steps and renders only the compact guidance", async ({ page }) => {
  await page.goto(tutorialUrl());

  for (const mode of ["Map Selection", "Link Analysis", "Mobility", "Radio Map", "DeepMIMO", "Radar Sensing"]) {
    await page.getByRole("tab", { name: mode }).click();
    await expect(page.locator(".tutorialSteps button")).toHaveCount(4);
    await expect(page.locator(".tutorialPrompt")).toHaveCount(1);
  }

  await expect(page.locator(".tutorialModeHeader")).toHaveCount(0);
  await expect(page.locator(".lessonEyebrow")).toHaveCount(0);
  await expect(page.locator(".lessonCopy h4")).toHaveCount(0);
  await expect(page.locator(".tutorialNotes")).toHaveCount(0);
  await expect(page.locator(".tutorialStageFooter")).toHaveCount(0);
  await expect(page.getByText("What to check", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Keep in mind", { exact: true })).toHaveCount(0);
});

test("supports keyboard mode navigation and visible target focus", async ({ page }) => {
  await page.goto(tutorialUrl());
  const mapTab = page.getByRole("tab", { name: "Map Selection" });
  await mapTab.focus();
  await mapTab.press("ArrowRight");
  await expect(page.getByRole("tab", { name: "Link Analysis" })).toBeFocused();

  const target = page.locator("[data-tutorial-target]");
  await expect(target).toHaveCount(1);
  await target.focus();
  await expect(target).toBeFocused();
  const metrics = await target.evaluate((element) => {
    const box = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return { width: box.width, height: box.height, outline: style.outlineStyle };
  });
  expect(metrics.width).toBeGreaterThanOrEqual(44);
  expect(metrics.height).toBeGreaterThanOrEqual(44);
  expect(metrics.outline).not.toBe("none");
});

for (const width of [1440, 768, 375]) {
  test(`fits the full screenshot without view controls at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(tutorialUrl("deepmimo/draw-roi"));

    const overflow = await page.evaluate(() => ({
      document: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      body: document.body.scrollWidth - document.body.clientWidth,
    }));
    expect(overflow.document).toBeLessThanOrEqual(1);
    expect(overflow.body).toBeLessThanOrEqual(1);

    const viewport = page.locator(".tutorialViewport");
    const steps = page.locator(".tutorialSteps");
    const stage = page.locator(".tutorialStageWorkspace");
    await expect(page.locator(".tutorialStageToolbar")).toHaveCount(0);
    await expect(page.locator(".tutorialSteps button")).toHaveCount(4);
    await expect(page.locator(".tutorialSteps button").first()).toBeVisible();
    expect(await viewport.evaluate((node) => node.scrollWidth - node.clientWidth)).toBeLessThanOrEqual(1);
    const [stepsBox, stageBox] = await Promise.all([steps.boundingBox(), stage.boundingBox()]);
    if (width > 920) {
      expect(stepsBox.x).toBeLessThan(stageBox.x);
    } else {
      expect(stageBox.y).toBeLessThan(stepsBox.y);
    }
    expect(await page.locator("[data-tutorial-target]").evaluate((node) =>
      getComputedStyle(node, "::before").animationName,
    )).toBe("none");
  });
}
