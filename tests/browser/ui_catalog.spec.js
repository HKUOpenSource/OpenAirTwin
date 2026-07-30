import {expect, test} from "@playwright/test";


const catalogPort = process.env.OAT_UI_CATALOG_PORT ?? "8091";
const catalogURL = `http://127.0.0.1:${catalogPort}/ui-catalog/`;


test("native catalog covers the Phase 2 public component contract", async ({page}) => {
  await page.goto(catalogURL);
  await expect(page).toHaveTitle("OpenAirTwin Native UI Catalog");

  const stylesheetPaths = await page.evaluate(() => [...document.styleSheets].map((sheet) => new URL(sheet.href).pathname));
  expect(stylesheetPaths).toEqual([
    "/css/tokens.css", "/css/base.css", "/css/components.css", "/css/shell.css",
    "/css/entry-map.css", "/css/results.css", "/css/radar.css", "/ui-catalog/catalog.css",
  ]);

  await expect(page.locator("[data-catalog-family='button'] .oat-button")).toHaveCount(10);
  await expect(page.locator("[data-catalog-family='field'] .oat-input")).toHaveCount(5);
  await expect(page.locator("[data-catalog-family='badge'] .oat-badge")).toHaveCount(5);
  await expect(page.locator("[data-catalog-family='metric-grid']")).toHaveCount(1);
  await expect(page.locator("[data-catalog-family='list-card'] .oat-list-card")).toHaveCount(2);
  await expect(page.locator(".oat-empty-state")).toHaveCount(1);

  const stateCoverage = await page.evaluate(() => ({
    busy: Boolean(document.querySelector(".oat-button[aria-busy='true']")),
    disabled: Boolean(document.querySelector(".oat-button:disabled")),
    invalid: Boolean(document.querySelector(".oat-input[aria-invalid='true']")),
    pressed: Boolean(document.querySelector(".oat-button[aria-pressed='true']")),
    readOnly: Boolean(document.querySelector(".oat-input:read-only")),
    selected: Boolean(document.querySelector(".oat-list-card[aria-selected='true']")),
  }));
  expect(Object.values(stateCoverage).every(Boolean)).toBe(true);

  const compactButton = page.getByRole("button", {name: "Compact", exact: true});
  await compactButton.hover();
  await expect(compactButton).not.toHaveCSS("transform", "none");
  await expect(page.getByRole("button", {name: "Disabled", exact: true})).toHaveCSS("opacity", "0.62");
  await expect(page.getByRole("button", {name: "Busy", exact: true})).toHaveCSS("cursor", "progress");
  await expect(page.locator("#catalog-invalid")).toHaveCSS("border-top-color", "rgba(210, 79, 79, 0.56)");
  await expect(page.locator("[data-catalog-family='list-card'] [aria-selected='true']")).toHaveCSS("background-color", "rgb(238, 246, 255)");

  const iconButtons = page.locator(".oat-button--icon");
  await expect(iconButtons).toHaveCount(1);
  await expect(iconButtons.first()).toHaveAccessibleName("Locate transmitter");
  await expect(iconButtons.locator(".oat-icon")).toHaveAttribute("aria-hidden", "true");
  await iconButtons.focus();
  await expect(iconButtons).toHaveCSS("outline-style", "solid");
});


test("contract-only feature composes its UI exclusively from public classes", async ({page}) => {
  await page.goto(catalogURL);
  const contract = await page.locator("[data-test-feature]").evaluate((root) => ({
    classes: [...root.querySelectorAll("[class]")].flatMap((element) => [...element.classList]),
    dimensions: {height: root.getBoundingClientRect().height, width: root.getBoundingClientRect().width},
    rootClasses: [...root.classList],
  }));
  expect([...contract.rootClasses, ...contract.classes].every((name) => name.startsWith("oat-"))).toBe(true);
  expect(contract.dimensions.width).toBeGreaterThan(800);
  expect(contract.dimensions.height).toBeGreaterThan(150);

  await page.locator("[data-test-feature] .oat-input").focus();
  await expect(page.locator("[data-test-feature] .oat-input")).toBeFocused();
  await page.locator("[data-test-feature] .oat-list-card--interactive").focus();
  await expect(page.locator("[data-test-feature] .oat-list-card--interactive")).toBeFocused();
});


test("production server does not publish the development catalog", async ({request}) => {
  const response = await request.get("/ui-catalog/");
  expect(response.status()).toBe(404);
});
