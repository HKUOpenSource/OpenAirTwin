import { expect, test } from "@playwright/test";
import {
  RADAR_PREVIEW_MANIFEST,
  openDeterministicApp,
  activateMode,
  enableRealViewer,
  configureRadarFixture,
} from "./workbench-fixture.js";

test.beforeEach(async ({ page }) => {
  // Full drone decoding and geometry are covered by viewer_assets.spec.js.
  const gltf = {
    asset: { version: "2.0" },
    buffers: [{ byteLength: 36 }],
    bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: 36 }],
    accessors: [
      {
        bufferView: 0,
        componentType: 5126,
        count: 3,
        type: "VEC3",
        min: [0, 0, 0],
        max: [1, 1, 0],
      },
    ],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }],
    nodes: [{ mesh: 0 }],
    scenes: [{ nodes: [0] }],
    scene: 0,
  };
  const json = Buffer.from(JSON.stringify(gltf));
  const jsonLength = Math.ceil(json.length / 4) * 4;
  const bytes = Buffer.alloc(12 + 8 + jsonLength + 8 + 36);
  bytes.writeUInt32LE(0x46546c67, 0);
  bytes.writeUInt32LE(2, 4);
  bytes.writeUInt32LE(bytes.length, 8);
  bytes.writeUInt32LE(jsonLength, 12);
  bytes.writeUInt32LE(0x4e4f534a, 16);
  bytes.fill(0x20, 20, 20 + jsonLength);
  json.copy(bytes, 20);
  bytes.writeUInt32LE(36, 20 + jsonLength);
  bytes.writeUInt32LE(0x004e4942, 24 + jsonLength);
  [0, 0, 0, 1, 0, 0, 0, 1, 0].forEach((value, index) => {
    bytes.writeFloatLE(value, 28 + jsonLength + index * 4);
  });
  await page.route("**/assets/radar/drones/manifest.json", (route) =>
    route.fulfill({ json: RADAR_PREVIEW_MANIFEST }),
  );
  await page.route("**/assets/radar/drones/*/visual.glb", (route) =>
    route.fulfill({ contentType: "model/gltf-binary", body: bytes }),
  );
});

test("Radar labels follow projection, yield to controls and hide behind the camera", async ({
  page,
}) => {
  await openDeterministicApp(page);
  await enableRealViewer(page);
  await configureRadarFixture(page);
  await page.evaluate(async () => {
    const { state } =
      await import("/js/app_state.js?v=20260723-radar-shared-groups");
    state.radar.targets = [state.radar.targets[0]];
    Object.assign(state.radar.targets[0], {
      position: [96, 44, 30],
      orientation: [(12 * Math.PI) / 180, (-7 * Math.PI) / 180, Math.PI / 2],
      velocity: [0, 12, 0],
      rcs_m2: 0.025,
    });
  });
  await activateMode(page, "radar");
  const radarTargetId = await page.evaluate(async () => {
    const { state, viewerRef } =
      await import("/js/app_state.js?v=20260723-radar-shared-groups");
    const target = state.radar.targets[0];
    const viewer = viewerRef.current;
    viewer.controls.target.set(...target.position);
    viewer.camera.position.set(
      target.position[0] - 28,
      target.position[1] - 36,
      target.position[2] + 22,
    );
    viewer.camera.lookAt(viewer.controls.target);
    viewer.controls.update();
    return target.id;
  });
  const targetLabel = page.locator(
    `.radarTargetLabel[data-target-id="${radarTargetId}"]`,
  );
  await expect(targetLabel).toBeVisible();
  await expect(targetLabel.locator("strong")).toHaveText(
    radarTargetId.replace(/^target-/i, "Target "),
  );
  await expect(targetLabel.locator("small")).toHaveText(
    "12.0 m/s · RCS 0.025 m²",
  );
  await expect(targetLabel).toHaveClass(/selected/);
  const labelMetrics = async () =>
    page.evaluate(async (targetId) => {
      const [{ state, viewerRef }, THREE] = await Promise.all([
        import("/js/app_state.js?v=20260723-radar-shared-groups"),
        import("/lib/three.module.js"),
      ]);
      const target = state.radar.targets.find((item) => item.id === targetId);
      const label = document.querySelector(
        `.radarTargetLabel[data-target-id="${targetId}"]`,
      );
      const viewer = viewerRef.current;
      const canvasRect = viewer.canvas.getBoundingClientRect();
      const labelRect = label.getBoundingClientRect();
      const projected = new THREE.Vector3(...target.position).project(
        viewer.camera,
      );
      const expectedX =
        canvasRect.left + (projected.x * 0.5 + 0.5) * canvasRect.width;
      const expectedY =
        canvasRect.top + (-projected.y * 0.5 + 0.5) * canvasRect.height;
      return {
        width: labelRect.width,
        height: labelRect.height,
        scale: Number(label.dataset.scale),
        lane: Number(label.dataset.lane),
        rightOffset: labelRect.left - Number(label.dataset.anchorX),
        projectionError: Math.hypot(
          Number(label.dataset.anchorX) - expectedX,
          Number(label.dataset.anchorY) - expectedY,
        ),
      };
    }, radarTargetId);
  await expect
    .poll(async () => (await labelMetrics()).projectionError)
    .toBeLessThanOrEqual(2);
  const nearLabelMetrics = await labelMetrics();
  expect(nearLabelMetrics.projectionError).toBeLessThanOrEqual(2);

  await page.evaluate(async () => {
    const { state, viewerRef } =
      await import("/js/app_state.js?v=20260723-radar-shared-groups");
    const target = state.radar.targets[0];
    const viewer = viewerRef.current;
    const direction = viewer.camera.position
      .clone()
      .sub(viewer.controls.target)
      .normalize();
    viewer.camera.position
      .set(...target.position)
      .addScaledVector(direction, 180);
    viewer.camera.lookAt(viewer.controls.target);
    viewer.controls.update();
  });
  await expect
    .poll(async () => (await labelMetrics()).scale)
    .toBeLessThan(nearLabelMetrics.scale);
  await expect
    .poll(async () => (await labelMetrics()).projectionError)
    .toBeLessThanOrEqual(2);
  const farLabelMetrics = await labelMetrics();
  expect(farLabelMetrics.width).toBeLessThan(nearLabelMetrics.width);
  expect(farLabelMetrics.height).toBeLessThan(nearLabelMetrics.height);

  await page.evaluate(async () => {
    const [{ state, viewerRef }, THREE] = await Promise.all([
      import("/js/app_state.js?v=20260723-radar-shared-groups"),
      import("/lib/three.module.js"),
    ]);
    const target = state.radar.targets[0];
    window.__radarTargetVisiblePosition = [...target.position];
    const viewer = viewerRef.current;
    const controlsRect = document.getElementById("ui").getBoundingClientRect();
    const canvasRect = viewer.canvas.getBoundingClientRect();
    const screenX = controlsRect.left + controlsRect.width / 2 - 50;
    const screenY = controlsRect.top + controlsRect.height / 2;
    const underControls = new THREE.Vector3(
      ((screenX - canvasRect.left) / canvasRect.width) * 2 - 1,
      1 - ((screenY - canvasRect.top) / canvasRect.height) * 2,
      0,
    ).unproject(viewer.camera);
    const direction = underControls.sub(viewer.camera.position).normalize();
    target.position = viewer.camera.position
      .clone()
      .addScaledVector(direction, 50)
      .toArray();
  });
  await expect(targetLabel).toBeVisible();
  const coveredByControls = async () =>
    targetLabel.evaluate((node) => {
      const rect = node.getBoundingClientRect();
      const topmost = document.elementFromPoint(
        rect.left + rect.width / 2,
        rect.top + rect.height / 2,
      );
      return Boolean(topmost?.closest("#ui"));
    });
  await expect.poll(coveredByControls).toBe(true);
  await page.evaluate(async () => {
    const { state } =
      await import("/js/app_state.js?v=20260723-radar-shared-groups");
    state.radar.targets[0].position = window.__radarTargetVisiblePosition;
  });
  await expect(targetLabel).toBeVisible();

  const frameSubscription = await page.evaluate(async () => {
    const { viewerRef } =
      await import("/js/app_state.js?v=20260723-radar-shared-groups");
    let frameCount = 0;
    const unsubscribe = viewerRef.current.subscribeFrame(() => {
      frameCount += 1;
    });
    const waitForFrames = () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      );
    await waitForFrames();
    const beforeUnsubscribe = frameCount;
    const firstUnsubscribe = unsubscribe();
    const secondUnsubscribe = unsubscribe();
    await waitForFrames();
    return {
      beforeUnsubscribe,
      afterUnsubscribe: frameCount,
      firstUnsubscribe,
      secondUnsubscribe,
    };
  });
  expect(frameSubscription.beforeUnsubscribe).toBeGreaterThan(0);
  expect(frameSubscription.afterUnsubscribe).toBe(
    frameSubscription.beforeUnsubscribe,
  );
  expect(frameSubscription).toMatchObject({
    firstUnsubscribe: true,
    secondUnsubscribe: false,
  });

  await page.evaluate(async () => {
    const { state, viewerRef } =
      await import("/js/app_state.js?v=20260723-radar-shared-groups");
    const viewer = viewerRef.current;
    const target = state.radar.targets[0];
    window.__radarTargetOriginalPosition = [...target.position];
    const forward = viewer.camera.getWorldDirection(
      viewer.camera.position.clone(),
    );
    target.position = viewer.camera.position
      .clone()
      .addScaledVector(forward, -20)
      .toArray();
  });
  await expect(targetLabel).toBeHidden();
  await page.evaluate(async () => {
    const { state } =
      await import("/js/app_state.js?v=20260723-radar-shared-groups");
    state.radar.targets[0].position = window.__radarTargetOriginalPosition;
  });
  await expect(targetLabel).toBeVisible();
});

test("Radar target limit, crowded labels and viewer replacement release subscriptions", async ({
  page,
}) => {
  await openDeterministicApp(page);
  await enableRealViewer(page);
  await configureRadarFixture(page);
  await page.evaluate(async () => {
    const { state } =
      await import("/js/app_state.js?v=20260723-radar-shared-groups");
    state.radar.targets = [state.radar.targets[0]];
    Object.assign(state.radar.targets[0], {
      position: [96, 44, 30],
      orientation: [(12 * Math.PI) / 180, (-7 * Math.PI) / 180, Math.PI / 2],
      velocity: [0, 12, 0],
      rcs_m2: 0.025,
    });
  });
  await activateMode(page, "radar");
  await page.evaluate(async () => {
    const { state } =
      await import("/js/app_state.js?v=20260723-radar-shared-groups");
    window.__radarRetainedLabel = document.querySelector(".radarTargetLabel");
    const template = state.radar.targets[0];
    for (let index = 2; index <= 15; index += 1) {
      state.radar.targets.push({
        ...template,
        id: `target-${index}`,
        position: [...template.position],
        orientation: [...template.orientation],
        velocity: [...template.velocity],
      });
    }
    state.radar.nextTargetNumber = 16;
  });
  await activateMode(page, "link");
  await activateMode(page, "radar");
  await page.locator("#radarTargetsGroup > summary").click();
  await expect(page.locator("#btnAddRadarTarget")).toBeEnabled();
  await expect(page.locator(".radarTargetLabel")).toHaveCount(15);
  await page.locator("#btnAddRadarTarget").click();
  await expect(page.locator("#btnAddRadarTarget")).toBeDisabled();
  await expect(page.locator("#radarAssetPickerHint")).toHaveText(
    "Maximum 16 targets reached.",
  );
  await expect(page.locator("#radarAssetPickerHint")).toBeVisible();
  await expect(page.locator(".radarTargetLabel")).toHaveCount(16);
  await expect(page.locator(".radarTargetLabel.selected")).toHaveCount(1);
  expect(
    await page.evaluate(
      () =>
        window.__radarRetainedLabel ===
        document.querySelector(".radarTargetLabel"),
    ),
  ).toBe(true);
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.evaluate(async () => {
    const { state, viewerRef } =
      await import("/js/app_state.js?v=20260723-radar-shared-groups");
    const sharedPosition = [96, 44, 30];
    for (const target of state.radar.targets)
      target.position = [...sharedPosition];
    const viewer = viewerRef.current;
    viewer.controls.target.set(...sharedPosition);
    viewer.camera.position.set(
      sharedPosition[0] - 28,
      sharedPosition[1] - 36,
      sharedPosition[2] + 22,
    );
    viewer.camera.lookAt(viewer.controls.target);
    viewer.controls.update();
  });
  await expect(
    page.locator('.radarTargetLabel[data-visible="true"]'),
  ).toHaveCount(16);
  const sixteenTargetLayout = await page
    .locator('.radarTargetLabel[data-visible="true"]')
    .evaluateAll((nodes) => {
      const labels = nodes.map((node) => ({
        anchorX: Number(node.dataset.anchorX),
        lane: Number(node.dataset.lane),
        rect: node.getBoundingClientRect().toJSON(),
      }));
      const overlapPairs = [];
      for (let first = 0; first < labels.length; first += 1) {
        for (let second = first + 1; second < labels.length; second += 1) {
          const left = labels[first].rect;
          const right = labels[second].rect;
          if (
            left.left < right.right &&
            left.right > right.left &&
            left.top < right.bottom &&
            left.bottom > right.top
          ) {
            overlapPairs.push([first, second]);
          }
        }
      }
      return {
        overlapPairs,
        allRight: labels.every(({ anchorX, rect }) => rect.left >= anchorX),
        lanes: labels.map(({ lane }) => lane),
      };
    });
  expect(sixteenTargetLayout.overlapPairs).toEqual([]);
  expect(sixteenTargetLayout.allRight).toBe(true);
  expect(sixteenTargetLayout.lanes.every(Number.isInteger)).toBe(true);
  await expect(page.locator(".radarTargetConnector:not(.hidden)")).toHaveCount(
    16,
  );
  await page
    .locator("#btnRemoveRadarTarget")
    .evaluate((button) => button.click());
  await expect(page.locator(".radarTargetLabel")).toHaveCount(15);
  await expect(page.locator("#btnAddRadarTarget")).toBeEnabled();
  await page.locator("#btnAddRadarTarget").evaluate((button) => button.click());
  await expect(page.locator(".radarTargetLabel")).toHaveCount(16);
  expect(
    await page.evaluate(async () => {
      const { viewerRef } =
        await import("/js/app_state.js?v=20260723-radar-shared-groups");
      return viewerRef.current.frameListeners.size;
    }),
  ).toBe(1);

  await activateMode(page, "link");
  const inactiveRadar = await page.evaluate(async () => {
    const { viewerRef } =
      await import("/js/app_state.js?v=20260723-radar-shared-groups");
    return {
      layersHidden: viewerRef.current.layers
        .layersFor("radar")
        .every((layer) => !layer.group.visible),
      labelsHidden: document
        .querySelector(".radarTargetLabelLayer")
        .classList.contains("hidden"),
      frameListeners: viewerRef.current.frameListeners.size,
    };
  });
  expect(inactiveRadar).toEqual({
    layersHidden: true,
    labelsHidden: true,
    frameListeners: 0,
  });
  await activateMode(page, "radar");
  await expect(page.locator(".radarTargetLabelLayer")).toBeVisible();
  expect(
    await page.evaluate(async () => {
      const { viewerRef } =
        await import("/js/app_state.js?v=20260723-radar-shared-groups");
      return viewerRef.current.frameListeners.size;
    }),
  ).toBe(1);
  const viewerReplacement = await page.evaluate(async () => {
    const [{ Viewer }, { viewerRef }] = await Promise.all([
      import("/js/viewer.js"),
      import("/js/app_state.js?v=20260723-radar-shared-groups"),
    ]);
    const previousViewer = viewerRef.current;
    const previousLabelLayer = document.querySelector(".radarTargetLabelLayer");
    const replacementCanvas = document.createElement("canvas");
    replacementCanvas.style.position = "fixed";
    replacementCanvas.style.inset = "0";
    replacementCanvas.style.visibility = "hidden";
    document.body.append(replacementCanvas);
    const replacementViewer = new Viewer(replacementCanvas);
    replacementViewer.__ready = true;
    replacementViewer.loadedTileIds.add("replacement-fixture-tile");
    viewerRef.current = replacementViewer;
    document.querySelector("#radarTargetList .radarTargetCard").click();
    await new Promise((resolve) => setTimeout(resolve, 80));
    return {
      previousFrameListeners: previousViewer.frameListeners.size,
      replacementFrameListeners: replacementViewer.frameListeners.size,
      previousLayerConnected: previousLabelLayer.isConnected,
      labelLayerCount: document.querySelectorAll(".radarTargetLabelLayer")
        .length,
      labelCount: document.querySelectorAll(".radarTargetLabel").length,
    };
  });
  expect(viewerReplacement).toEqual({
    previousFrameListeners: 0,
    replacementFrameListeners: 1,
    previousLayerConnected: false,
    labelLayerCount: 1,
    labelCount: 16,
  });
  await activateMode(page, "link");
  expect(
    await page.evaluate(async () => {
      const { viewerRef } =
        await import("/js/app_state.js?v=20260723-radar-shared-groups");
      return viewerRef.current.frameListeners.size;
    }),
  ).toBe(0);
});
