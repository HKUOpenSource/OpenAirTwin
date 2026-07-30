import { expect, test } from "@playwright/test";

const catalogPort = process.env.OAT_UI_CATALOG_PORT ?? "8091";
const catalogURL = `http://127.0.0.1:${catalogPort}/ui-catalog/`;

test("native and React catalogs cover the public component contract", async ({
  page,
}) => {
  await page.goto(catalogURL);
  await expect(page).toHaveTitle("OpenAirTwin UI Catalog");
  await expect(
    page.locator("#reactCatalogRoot[data-react-ready='true']"),
  ).toBeVisible();

  const stylesheetPaths = await page.evaluate(() =>
    [...document.styleSheets].map((sheet) => new URL(sheet.href).pathname),
  );
  expect(stylesheetPaths).toEqual([
    "/css/tokens.css",
    "/css/base.css",
    "/css/components.css",
    "/css/shell.css",
    "/css/entry-map.css",
    "/css/results.css",
    "/css/radar.css",
    "/ui-catalog/catalog.css",
  ]);

  await expect(
    page.locator("[data-catalog-family='button'] .oat-button"),
  ).toHaveCount(20);
  await expect(
    page.locator("[data-catalog-family='field'] .oat-input"),
  ).toHaveCount(10);
  await expect(
    page.locator("[data-catalog-family='badge'] .oat-badge"),
  ).toHaveCount(10);
  await expect(page.locator(".oat-metric-grid")).toHaveCount(4);
  await expect(page.locator(".oat-catalog__list .oat-list-card")).toHaveCount(
    4,
  );
  await expect(page.locator(".oat-empty-state")).toHaveCount(2);

  const stateCoverage = await page.evaluate(() => ({
    busy:
      document.querySelectorAll(".oat-button[aria-busy='true']").length === 2,
    disabled: document.querySelectorAll(".oat-button:disabled").length === 4,
    invalid:
      document.querySelectorAll(".oat-input[aria-invalid='true']").length === 2,
    pressed:
      document.querySelectorAll(".oat-button[aria-pressed='true']").length ===
      2,
    readOnly: document.querySelectorAll(".oat-input:read-only").length >= 2,
    selected:
      document.querySelectorAll(".oat-list-card[aria-selected='true']")
        .length >= 2,
  }));
  expect(Object.values(stateCoverage).every(Boolean)).toBe(true);

  const compactButton = page
    .locator("[data-catalog-implementation='native']")
    .getByRole("button", { name: "Compact", exact: true });
  await compactButton.hover();
  await expect(compactButton).not.toHaveCSS("transform", "none");
  await expect(
    page
      .locator("[data-catalog-implementation='react']")
      .getByRole("button", { name: "Disabled", exact: true }),
  ).toHaveCSS("opacity", "0.62");
  await expect(
    page
      .locator("[data-catalog-implementation='react']")
      .getByRole("button", { name: "Busy", exact: true }),
  ).toHaveCSS("cursor", "progress");
  await expect(page.locator("#react-catalog-invalid")).toHaveCSS(
    "border-top-color",
    "rgba(210, 79, 79, 0.56)",
  );
  await expect(
    page
      .locator("[data-catalog-implementation='react'] [aria-selected='true']")
      .first(),
  ).toHaveCSS("background-color", "rgb(238, 246, 255)");

  const iconButtons = page.locator(
    "[data-catalog-implementation='react'] .oat-button--icon",
  );
  await expect(iconButtons).toHaveCount(1);
  await expect(iconButtons.first()).toHaveAccessibleName("Locate transmitter");
  await expect(iconButtons.locator(".oat-icon")).toHaveAttribute(
    "aria-hidden",
    "true",
  );
  await iconButtons.focus();
  await expect(iconButtons).toHaveCSS("outline-style", "solid");

  await page
    .locator("[data-catalog-implementation='react']")
    .getByRole("button", { name: "Default", exact: true })
    .click();
  await expect(page.locator("#reactCommandLog")).toHaveText(
    "catalog.component.activate",
  );
});

test("React primitives match native DOM state and computed style", async ({
  page,
}) => {
  await page.goto(catalogURL);
  await expect(
    page.locator("#reactCatalogRoot[data-react-ready='true']"),
  ).toBeVisible();

  const parity = await page.evaluate(() => {
    const implementation = (name) =>
      document.querySelector(`[data-catalog-implementation='${name}']`);
    const resolveTarget = (name, key) => {
      const keyed = implementation(name)?.querySelector(
        `[data-parity-key='${key}']`,
      );
      if (!keyed) return null;
      return name === "react" ? keyed.firstElementChild : keyed;
    };
    const keys = [
      ...implementation("native").querySelectorAll("[data-parity-key]"),
    ].map((element) => element.dataset.parityKey);
    const styleProperties = [
      "backgroundColor",
      "borderRadius",
      "borderTopColor",
      "color",
      "cursor",
      "display",
      "fontFamily",
      "fontSize",
      "fontWeight",
      "height",
      "minHeight",
      "opacity",
      "paddingBottom",
      "paddingLeft",
      "paddingRight",
      "paddingTop",
    ];
    const semantic = (element) => ({
      ariaBusy: element.getAttribute("aria-busy"),
      ariaInvalid: element.getAttribute("aria-invalid"),
      ariaPressed: element.getAttribute("aria-pressed"),
      ariaSelected: element.getAttribute("aria-selected"),
      className: element.className,
      disabled: "disabled" in element ? element.disabled : false,
      readOnly: "readOnly" in element ? element.readOnly : false,
      tag: element.tagName,
      text: element.textContent.replace(/\s+/g, ""),
      type: element.getAttribute("type"),
    });
    return keys.map((key) => {
      const nativeElement = resolveTarget("native", key);
      const reactElement = resolveTarget("react", key);
      const style = (element) => {
        const computed = getComputedStyle(element);
        return Object.fromEntries(
          styleProperties.map((property) => [property, computed[property]]),
        );
      };
      return {
        key,
        native: nativeElement
          ? { semantic: semantic(nativeElement), style: style(nativeElement) }
          : null,
        react: reactElement
          ? { semantic: semantic(reactElement), style: style(reactElement) }
          : null,
      };
    });
  });

  expect(parity).toHaveLength(26);
  for (const item of parity) {
    expect(item.react, item.key).not.toBeNull();
    expect(item.react.semantic, `${item.key} semantic`).toEqual(
      item.native.semantic,
    );
    expect(item.react.style, `${item.key} style`).toEqual(item.native.style);
  }
});

test("contract-only feature composes its UI exclusively from public classes", async ({
  page,
}) => {
  await page.goto(catalogURL);
  const allowedStateClasses = new Set([
    "active",
    "busy",
    "hidden",
    "is-invalid",
    "selected",
  ]);
  for (const selector of [
    "[data-test-feature='native']",
    "#react-test-feature",
  ]) {
    const contract = await page.locator(selector).evaluate((root) => ({
      classes: [...root.querySelectorAll("[class]")].flatMap((element) => [
        ...element.classList,
      ]),
      dimensions: {
        height: root.getBoundingClientRect().height,
        width: root.getBoundingClientRect().width,
      },
      rootClasses: [...root.classList],
    }));
    expect(
      [...contract.rootClasses, ...contract.classes].every(
        (name) => name.startsWith("oat-") || allowedStateClasses.has(name),
      ),
    ).toBe(true);
    expect(contract.dimensions.width).toBeGreaterThan(500);
    expect(contract.dimensions.height).toBeGreaterThan(150);

    await page.locator(`${selector} .oat-input`).focus();
    await expect(page.locator(`${selector} .oat-input`)).toBeFocused();
    await page.locator(`${selector} .oat-list-card--interactive`).focus();
    await expect(
      page.locator(`${selector} .oat-list-card--interactive`),
    ).toBeFocused();
  }
});

test("production server does not publish the development catalog", async ({
  request,
}) => {
  const response = await request.get("/ui-catalog/");
  expect(response.status()).toBe(404);
});
