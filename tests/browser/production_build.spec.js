import { expect, test } from "@playwright/test";

const CORE_STYLES = [
  "tokens",
  "base",
  "components",
  "shell",
  "entry-map",
  "results",
  "radar",
];

test("production build is self-contained behind the Python server", async ({
  page,
  request,
}) => {
  const rootResponse = await request.get("/");
  expect(rootResponse.status()).toBe(200);
  expect(rootResponse.headers()["cache-control"]).toBe("no-store");
  expect(rootResponse.headers()["x-openairtwin-frontend-build-id"]).toMatch(
    /^(?:development|\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?\+[0-9a-f]{12})$/,
  );
  const html = await rootResponse.text();
  const importMapPosition = html.indexOf('<script type="importmap">');
  const modulePosition = html.indexOf('<script type="module"');
  expect(importMapPosition).toBeGreaterThan(0);
  expect(importMapPosition).toBeLessThan(modulePosition);
  expect((html.match(/<script type="module"/g) ?? []).length).toBe(1);

  const stylePaths = [
    ...html.matchAll(/href="(\/workbench\/assets\/css\/[^\"]+\.css)"/g),
  ].map((match) => match[1]);
  expect(stylePaths).toHaveLength(CORE_STYLES.length);
  expect(
    stylePaths.map(
      (path) => path.match(/\/css\/(.+)-[A-Za-z0-9_-]{8,}\.css$/)?.[1],
    ),
  ).toEqual(CORE_STYLES);

  const entryPath = html.match(/src="(\/workbench\/assets\/[^\"]+\.js)"/)?.[1];
  expect(entryPath).toBeTruthy();
  const assetResponse = await request.get(entryPath);
  expect(assetResponse.status()).toBe(200);
  expect(assetResponse.headers()["cache-control"]).toBe(
    "public, max-age=31536000, immutable",
  );
  expect(assetResponse.headers()["x-content-type-options"]).toBe("nosniff");

  expect((await request.get("/workbench/.vite/manifest.json")).status()).toBe(
    404,
  );
  expect((await request.get("/workbench/assets/not-hashed.js")).status()).toBe(
    404,
  );
  expect((await request.get("/api/health")).status()).toBe(200);
  expect((await request.get("/assets/openairtwin_logo.png")).status()).toBe(
    200,
  );
  expect((await request.get("/lib/leaflet/leaflet.css")).status()).toBe(200);

  const browserErrors = [];
  page.on("console", (message) => {
    if (message.type() === "error" || message.type() === "warning")
      browserErrors.push(message.text());
  });
  await page.goto("/");
  await expect(page).toHaveTitle("OpenAirTwin");
  await expect(page.locator("#entryScreen")).toBeVisible();
  const resources = await page.evaluate(() =>
    performance.getEntriesByType("resource").map(({ name }) => name),
  );
  expect(resources.some((name) => name.includes("/@vite/client"))).toBe(false);
  expect(resources.some((name) => name.includes("/__vite"))).toBe(false);
  expect(browserErrors).toEqual([]);
});

test("bootstrap watchdog replaces a failed entry chunk with a reload action", async ({
  page,
}) => {
  await page.route("**/workbench/assets/**/*.js", (route) =>
    route.abort("failed"),
  );

  await page.goto("/", { waitUntil: "domcontentloaded" });

  const errorPanel = page.locator("#oatBootstrapError");
  await expect(errorPanel).toBeVisible();
  await expect(errorPanel).toHaveAttribute("role", "alert");
  await expect(errorPanel).toContainText("OpenAirTwin could not start");
  await expect(
    errorPanel.getByRole("button", { name: "Reload" }),
  ).toBeVisible();
});

test("seven cold starts stay within the local release performance budget", async ({
  browser,
}) => {
  test.skip(
    process.env.OAT_RUN_PERFORMANCE_GATES !== "1",
    "Timing budgets run only on the fixed local Chrome release environment.",
  );
  const observations = [];
  for (let run = 0; run < 7; run += 1) {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      colorScheme: "light",
      locale: "en-US",
      timezoneId: "UTC",
    });
    const page = await context.newPage();
    await page.goto("/", { waitUntil: "load" });
    await page.waitForFunction(() =>
      Number.isFinite(window.__OPENAIRTWIN_UI_READY_MS__),
    );
    await page.evaluate(
      () =>
        new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve)),
        ),
    );
    await page.waitForFunction(
      () => performance.getEntriesByName("first-contentful-paint").length > 0,
    );
    observations.push(
      await page.evaluate(() => ({
        uiReady: window.__OPENAIRTWIN_UI_READY_MS__,
        fcp:
          performance.getEntriesByName("first-contentful-paint")[0]
            ?.startTime ?? Number.POSITIVE_INFINITY,
      })),
    );
    await context.close();
  }
  const median = (values) =>
    [...values].sort((left, right) => left - right)[
      Math.floor(values.length / 2)
    ];
  const uiReadyMedian = median(observations.map(({ uiReady }) => uiReady));
  const fcpMedian = median(observations.map(({ fcp }) => fcp));
  console.info(
    `Cold-start medians: UI Ready ${uiReadyMedian.toFixed(1)} ms, FCP ${fcpMedian.toFixed(1)} ms`,
  );
  expect(uiReadyMedian, JSON.stringify(observations)).toBeLessThanOrEqual(175);
  expect(fcpMedian, JSON.stringify(observations)).toBeLessThanOrEqual(885);
});
