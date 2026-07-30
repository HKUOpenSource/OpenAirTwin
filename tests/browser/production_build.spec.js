import {expect, test} from "@playwright/test";

const CORE_STYLES = [
  "tokens",
  "base",
  "components",
  "shell",
  "entry-map",
  "results",
  "radar",
];

test("production build is self-contained behind the Python server", async ({page, request}) => {
  const rootResponse = await request.get("/");
  expect(rootResponse.status()).toBe(200);
  expect(rootResponse.headers()["cache-control"]).toBe("no-store");
  const html = await rootResponse.text();
  const importMapPosition = html.indexOf('<script type="importmap">');
  const modulePosition = html.indexOf('<script type="module"');
  expect(importMapPosition).toBeGreaterThan(0);
  expect(importMapPosition).toBeLessThan(modulePosition);
  expect((html.match(/<script type="module"/g) ?? []).length).toBe(1);

  const stylePaths = [...html.matchAll(/href="(\/workbench\/assets\/css\/[^\"]+\.css)"/g)]
    .map((match) => match[1]);
  expect(stylePaths).toHaveLength(CORE_STYLES.length);
  expect(stylePaths.map((path) => path.match(/\/css\/(.+)-[A-Za-z0-9_-]{8,}\.css$/)?.[1]))
    .toEqual(CORE_STYLES);

  const entryPath = html.match(/src="(\/workbench\/assets\/[^\"]+\.js)"/)?.[1];
  expect(entryPath).toBeTruthy();
  const assetResponse = await request.get(entryPath);
  expect(assetResponse.status()).toBe(200);
  expect(assetResponse.headers()["cache-control"]).toBe("public, max-age=31536000, immutable");
  expect(assetResponse.headers()["x-content-type-options"]).toBe("nosniff");

  expect((await request.get("/workbench/.vite/manifest.json")).status()).toBe(404);
  expect((await request.get("/workbench/assets/not-hashed.js")).status()).toBe(404);
  expect((await request.get("/api/health")).status()).toBe(200);
  expect((await request.get("/assets/openairtwin_logo.png")).status()).toBe(200);
  expect((await request.get("/lib/leaflet/leaflet.css")).status()).toBe(200);

  const browserErrors = [];
  page.on("console", (message) => {
    if (message.type() === "error" || message.type() === "warning") browserErrors.push(message.text());
  });
  await page.goto("/");
  await expect(page).toHaveTitle("OpenAirTwin");
  await expect(page.locator("#entryScreen")).toBeVisible();
  const resources = await page.evaluate(() => performance.getEntriesByType("resource").map(({name}) => name));
  expect(resources.some((name) => name.includes("/@vite/client"))).toBe(false);
  expect(resources.some((name) => name.includes("/__vite"))).toBe(false);
  expect(browserErrors).toEqual([]);
});
