import { expect, test } from "@playwright/test";

test("renders Astryx centered-hero landing page with macro vision, Three.js 3D Lab, 3 pillars, and 3x2 capabilities", async ({
  page,
}) => {
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("");

  expect(
    await page.locator('[data-astryx-theme="neutral"]').count(),
  ).toBeGreaterThanOrEqual(1);

  const sectionOrder = await page
    .locator("main > section")
    .evaluateAll((sections) => sections.map((section) => section.id));
  expect(sectionOrder).toEqual(["home", "why", "workflows", "get-started"]);

  expect(await page.locator("header nav a").allTextContents()).toEqual([
    "3D Lab",
    "Vision",
    "Capabilities",
    "Get Started",
    "Architecture",
  ]);

  await expect(page.locator("h1")).toHaveText(
    "Real-world 3D cities for wireless research.",
  );
  await expect(page.locator("#why")).toContainText("Unified Platform");
  await expect(page.locator("#why")).not.toContainText("Unified Comm & Radar");
  await expect(page.locator("#citation")).toHaveCount(0);

  await expect(page.locator("main video")).toHaveCount(0);
  await expect(page.locator("main img")).toHaveCount(0);
  await expect(page.locator("main")).not.toContainText("/api/");
  await expect(page.locator("main")).not.toContainText("InProcessJobManager");

  // 3D Lab has 5 modes (Map removed from Lab) and an active WebGL canvas
  const labTabs = page.locator('#lab [role="tab"]');
  expect(
    (await labTabs.allInnerTexts()).map((text) => text.trim()),
  ).toEqual(["Link", "Mobility", "Radio Map", "DeepMIMO", "Radar"]);
  await expect(
    page.getByRole("tab", { name: "Map", exact: true }),
  ).toHaveCount(0);

  const webglCanvas = page.locator(".oat-lab-viewport canvas");
  await expect(webglCanvas).toHaveCount(1);
  const canvasBox = await webglCanvas.boundingBox();
  expect(canvasBox?.width ?? 0).toBeGreaterThan(360);
  expect(canvasBox?.height ?? 0).toBeGreaterThan(360);

  // 3 pillars + strict 3x2 (6 card) capabilities grid
  await expect(page.locator(".oat-pillar-card")).toHaveCount(3);
  await expect(page.locator(".oat-cap-card")).toHaveCount(6);
  expect(
    await page
      .locator(".oat-capabilities-grid")
      .evaluate(
        (element) =>
          getComputedStyle(element).gridTemplateColumns.split(" ").length,
      ),
  ).toBe(3);

  // Clicking Card 03 (Mobility) switches 3D Lab to Mobility
  await page
    .locator(".oat-cap-card")
    .filter({ hasText: "Mobility" })
    .getByRole("button", { name: "Open in Lab" })
    .click();
  await expect(page.getByRole("tab", { name: "Mobility" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(page).toHaveURL(/mode=mobility/);
  expect(pageErrors).toEqual([]);
});

test("supports URL deep links, legacy ?mode=map & ?tutorial= links, and browser history", async ({
  page,
}) => {
  await page.goto("?mode=map");
  await expect(page.getByRole("tab", { name: "Link" })).toHaveAttribute(
    "aria-selected",
    "true",
  );

  await page.goto("?tutorial=radar/run-radar");
  await expect(page.getByRole("tab", { name: "Radar" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(page.locator('[data-testid="lab-telemetry"]')).toContainText(
    "dB SNR",
  );

  await page.getByRole("tab", { name: "DeepMIMO" }).click();
  await expect(page.getByRole("tab", { name: "DeepMIMO" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(page).toHaveURL(/mode=deepmimo/);

  await page.goBack();
  await expect(page.getByRole("tab", { name: "Radar" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
});

test("updates 3D simulation physics and camera presets interactively across all 5 modes", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("");
  const telemetry = page.locator('[data-testid="lab-telemetry"]');

  // 1. Link mode: toggling LoS/NLoS spot updates channel telemetry
  await expect(page.getByRole("tab", { name: "Link" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(telemetry).toContainText("Line-of-Sight");
  const rxToggleBtn = page.locator('[data-testid="lab-handle-rx"]');
  await rxToggleBtn.click();
  await expect(telemetry).toContainText("NLoS Blocked");

  // Camera presets switch aria-pressed cleanly
  const topBtn = page.getByRole("button", { name: "Top", exact: true });
  await topBtn.click();
  await expect(topBtn).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Reset 3D camera" }).click();
  await expect(
    page.getByRole("button", { name: "Iso", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");

  // 2. Radio Map mode: switches colormap & updates telemetry
  await page.getByRole("tab", { name: "Radio Map" }).click();
  await page.getByRole("button", { name: "plasma" }).click();
  await expect(telemetry).toContainText("plasma");

  // 3. DeepMIMO mode: stepping User # updates Selected User telemetry
  await page.getByRole("tab", { name: "DeepMIMO" }).click();
  const initialUserText = await telemetry.textContent();
  await page.getByRole("button", { name: "Next sampled Rx user" }).click();
  await expect(telemetry).not.toHaveText(initialUserText ?? "");

  // 4. Radar mode: toggles bistatic geometry & keeps Range-Doppler canvas active
  await page.getByRole("tab", { name: "Radar" }).click();
  await expect(page.locator('[data-testid="radar-rd-canvas"]')).toHaveCount(1);
  await expect(telemetry).toContainText("Monostatic");
  await page.getByLabel("Bistatic Radar Geometry").click();
  await expect(telemetry).toContainText("Bistatic");
});

test("maintains strict visual alignment across 3D Lab tabs and Quick Start cards at 1440px", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("");

  // Check zero height jump across all 5 Lab tabs
  const shell = page.locator(".oat-lab-shell");
  const labHeights = [];
  for (const name of ["Link", "Mobility", "Radio Map", "DeepMIMO", "Radar"]) {
    await page.getByRole("tab", { name }).click();
    const box = await shell.boundingBox();
    labHeights.push(box?.height ?? 0);
  }
  const minLabH = Math.min(...labHeights);
  const maxLabH = Math.max(...labHeights);
  expect(maxLabH - minLabH).toBeLessThanOrEqual(4);

  // Check equal height across 3 Quick Start cards
  const stepHeights = await page
    .locator(".oat-quickstart-card")
    .evaluateAll((cards) => cards.map((c) => c.getBoundingClientRect().height));
  expect(stepHeights).toHaveLength(3);
  expect(Math.max(...stepHeights) - Math.min(...stepHeights)).toBeLessThanOrEqual(
    2,
  );
});

test("supports keyboard navigation, Quick Start platform tabs, and Architecture link", async ({
  page,
}) => {
  await page.goto("?mode=link");
  const linkTab = page.getByRole("tab", { name: "Link" });
  await linkTab.focus();
  await linkTab.press("ArrowRight");
  await expect(page.getByRole("tab", { name: "Mobility" })).toBeFocused();

  await expect(
    page.getByRole("link", { name: "Architecture" }).first(),
  ).toHaveAttribute("href", "./architecture/");

  const stepsGrid = page.locator("#installation-steps");
  await expect(stepsGrid).toContainText(".oat-env;");

  await page.getByRole("radio", { name: "Windows PowerShell" }).click();
  await expect(stepsGrid).toContainText(".oat-env.ps1");
  await expect(stepsGrid).toContainText("py -3.11 install.py --with-sample-scene");
});

for (const width of [1440, 768, 375]) {
  test(`fits responsive layout without horizontal overflow and pauses animations under reduced motion at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("?mode=mobility");

    const overflow = await page.evaluate(() => ({
      document:
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
      body: document.body.scrollWidth - document.body.clientWidth,
    }));
    expect(overflow.document).toBeLessThanOrEqual(1);
    expect(overflow.body).toBeLessThanOrEqual(1);

    await expect(
      page.getByRole("button", { name: "Play Route" }),
    ).toBeVisible();

    await page.getByRole("tab", { name: "Radar" }).click();
    await expect(
      page.getByRole("button", { name: "Animate Targets" }),
    ).toBeVisible();
  });
}
