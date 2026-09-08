import { expect, test } from "@playwright/test";

const styleUrl = "https://tiles.openfreemap.org/styles/positron";
const fixtureStyle = {
  version: 8,
  sources: {
    land: {
      type: "geojson",
      data: {
        type: "Feature",
        properties: {},
        geometry: {
          type: "Polygon",
          coordinates: [
            [
              [114, 22],
              [114.3, 22],
              [114.3, 22.5],
              [114, 22.5],
              [114, 22],
            ],
          ],
        },
      },
    },
  },
  layers: [
    {
      id: "background",
      type: "background",
      paint: { "background-color": "#d5e5ed" },
    },
    {
      id: "land",
      type: "fill",
      source: "land",
      paint: { "fill-color": "#f5f5f5" },
    },
    ...["label_city_capital", "label_village"].map((id) => ({
      id,
      type: "symbol",
      source: "land",
      minzoom: 3,
      layout: {
        "text-field": ["get", "name"],
        "text-font": ["Noto Sans Bold"],
        "text-size": 20,
      },
      paint: { "text-color": "#000000" },
    })),
  ],
};

async function openEntryMap(page) {
  await page.route("**/api/scene/manifest", (route) =>
    route.fulfill({
      json: {
        scene_id: "entry_fixture",
        mesh_count: 0,
        bundle_count: 0,
        tiles: [{ id: "11_SW_7A", mesh_count: 0, bundle_count: 0 }],
        bsdfs: {},
        bundles: [],
        integrity: {
          orphan_mesh_count: 0,
          orphan_mesh_samples: [],
          missing_mesh_count: 0,
          missing_mesh_samples: [],
        },
      },
    }),
  );
  await page.route("**/assets/open3dhk_tile_coverage.json", (route) =>
    route.fulfill({ json: { tiles: [] } }),
  );
  await page.goto("/");
  await expect(page.locator("#entryScreen")).toBeVisible();
  await expect(page.locator("#loadingScreen")).toBeHidden();
}

async function mapState(page) {
  return page.evaluate(async () => {
    const { entryMap } =
      await import("/js/app_state.js?v=20260723-radar-shared-groups");
    return {
      ready: entryMap.basemapReady,
      fallback: entryMap.fallbackEnabled,
      timer: entryMap.fallbackTimer,
      online: !!entryMap.tileLayer && entryMap.map.hasLayer(entryMap.tileLayer),
      local: entryMap.map.hasLayer(entryMap.fallbackLayer),
    };
  });
}

test("Positron renders below the selectable grid and follows zoom and resize", async ({
  page,
}) => {
  const requests = [];
  const errors = [];
  page.on("request", (request) => requests.push(request.url()));
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route(styleUrl, (route) => route.fulfill({ json: fixtureStyle }));
  await openEntryMap(page);
  await expect
    .poll(() => mapState(page))
    .toMatchObject({ ready: true, fallback: false, timer: null, online: true });
  await expect(page.locator(".leaflet-control-attribution")).toContainText(
    "OpenMapTiles",
  );
  expect(requests).toContain(styleUrl);
  expect(requests.some((url) => url.includes("cartocdn.com"))).toBe(false);

  const labels = await page.evaluate(async () => {
    const { entryMap } =
      await import("/js/app_state.js?v=20260723-radar-shared-groups");
    return entryMap.tileLayer
      .getMaplibreMap()
      .getStyle()
      .layers.filter((layer) => layer.type === "symbol");
  });
  expect(labels[0].layout["text-font"]).toEqual(["Noto Sans Regular"]);
  expect(labels[0].layout["text-size"].at(-1)).toBeLessThanOrEqual(13);
  expect(labels[0].paint["text-color"]).not.toBe("#000000");
  expect(labels[1].minzoom).toBeGreaterThan(labels[0].minzoom);
  expect(labels[0].layout["text-field"]).toEqual(["get", "name"]);

  const pixelColors = await page.evaluate(async () => {
    const { entryMap } =
      await import("/js/app_state.js?v=20260723-radar-shared-groups");
    const renderer = entryMap.tileLayer.getMaplibreMap();
    return new Promise((resolve) => {
      renderer.once("render", () => {
        const canvas = renderer.getCanvas();
        const gl = canvas.getContext("webgl2") || canvas.getContext("webgl");
        const pixels = new Uint8Array(canvas.width * canvas.height * 4);
        gl.readPixels(
          0,
          0,
          canvas.width,
          canvas.height,
          gl.RGBA,
          gl.UNSIGNED_BYTE,
          pixels,
        );
        const colors = new Set();
        for (let index = 0; index < pixels.length; index += 64) {
          if (pixels[index + 3])
            colors.add(
              `${pixels[index]},${pixels[index + 1]},${pixels[index + 2]}`,
            );
        }
        resolve(colors.size);
      });
      renderer.triggerRepaint();
    });
  });
  expect(pixelColors).toBeGreaterThan(1);

  const tile = await page.evaluate(async () => {
    const { entryMap } =
      await import("/js/app_state.js?v=20260723-radar-shared-groups");
    const tile = entryMap.tilesById.get("11_SW_7A");
    const center = tile.layer.getBounds().getCenter();
    entryMap.map.setView(center, 14, { animate: false });
    const point = entryMap.map.latLngToContainerPoint(center);
    const bounds = entryMap.map.getContainer().getBoundingClientRect();
    return {
      x: bounds.x + point.x,
      y: bounds.y + point.y,
      selected: tile.selected,
    };
  });
  await page.mouse.click(tile.x, tile.y);
  await expect
    .poll(() =>
      page.evaluate(async () => {
        const { entryMap } =
          await import("/js/app_state.js?v=20260723-radar-shared-groups");
        return entryMap.tilesById.get("11_SW_7A").selected;
      }),
    )
    .toBe(!tile.selected);
  for (const size of [
    { width: 1440, height: 900 },
    { width: 1280, height: 720 },
  ]) {
    await page.setViewportSize(size);
    await expect
      .poll(() =>
        page.evaluate(async () => {
          const { entryMap } =
            await import("/js/app_state.js?v=20260723-radar-shared-groups");
          const renderer = entryMap.tileLayer.getMaplibreMap();
          const center = renderer.getCenter();
          return (
            Math.abs(renderer.getZoom() - (entryMap.map.getZoom() - 1)) <
              0.001 &&
            Math.abs(center.lng - entryMap.map.getCenter().lng) < 0.00001
          );
        }),
      )
      .toBe(true);
    await page.screenshot({
      path: test.info().outputPath(`entry-${size.width}.png`),
    });
  }
  expect(errors).toEqual([]);
});

test("an unavailable style uses the local map and releases the vector canvas", async ({
  page,
}) => {
  await page.route(styleUrl, (route) =>
    route.fulfill({ status: 503, body: "Unavailable" }),
  );
  await openEntryMap(page);
  await expect
    .poll(() => mapState(page))
    .toMatchObject({ fallback: true, timer: null, online: false, local: true });
  await expect(page.locator(".maplibregl-canvas")).toHaveCount(0);
  await expect(page.locator(".entryFallbackImageLayer")).toBeVisible();
});

test("WebGL initialization failure leaves an interactive local map", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (kind, ...args) {
      if (kind.includes("webgl")) return null;
      return original.call(this, kind, ...args);
    };
  });
  await openEntryMap(page);
  await expect
    .poll(() => mapState(page))
    .toMatchObject({ fallback: true, timer: null, local: true });
  await expect(page.locator(".leaflet-gl-layer")).toHaveCount(0);
});

test("a stalled style times out and cannot replace the local fallback later", async ({
  page,
}) => {
  let finish;
  const pending = new Promise((resolve) => {
    finish = resolve;
  });
  await page.route(styleUrl, async (route) => {
    await pending;
    await route.fulfill({ json: fixtureStyle }).catch(() => {});
  });
  await page.clock.install();
  await openEntryMap(page);
  await page.clock.fastForward(16000);
  await expect
    .poll(() => mapState(page))
    .toMatchObject({ fallback: true, timer: null, online: false, local: true });
  finish();
  await page.clock.fastForward(1000);
  expect(await mapState(page)).toMatchObject({
    fallback: true,
    ready: false,
    online: false,
    local: true,
  });
});
