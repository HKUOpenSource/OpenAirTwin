import { expect, test } from "@playwright/test";
import {
  RADAR_PREVIEW_MANIFEST,
  radarResult,
  openDeterministicApp,
  activateMode,
  enableRealViewer,
  configureRadarFixture,
} from "./workbench-fixture.js";

async function installRadarJob(page, clutterCount = 0) {
  let submittedRadar = null;
  await page.route("**/assets/radar/drones/manifest.json", (route) =>
    route.fulfill({ json: RADAR_PREVIEW_MANIFEST }),
  );
  await page.route("**/api/radar/jobs", async (route) => {
    submittedRadar = route.request().postDataJSON();
    await route.fulfill({
      status: 202,
      json: {
        ok: true,
        job_id: "radar-workflow",
        status: "queued",
        scene_generation: 7,
      },
    });
  });
  await page.route("**/api/radar/jobs/radar-workflow/result", (route) => {
    const result = radarResult(submittedRadar);
    for (let index = 0; index < clutterCount; index += 1) {
      result.detections.push({
        detection_id: `clutter-det-${index}`,
        equivalent_range_m: 30 + index * 4,
        equivalent_radial_velocity_mps: 0,
        doppler_hz: 0,
        power_dbm: -82 - index,
        snr_db: 18 - index * 0.5,
        arrival_azimuth_deg: -40 + index * 6,
        arrival_zenith_deg: 90,
        target_id: null,
        classification: "clutter",
      });
    }
    result.summary.total_detection_count = result.detections.length;
    result.summary.returned_detection_count = result.detections.length;
    route.fulfill({ json: result });
  });
  await page.route("**/api/radar/jobs/radar-workflow", (route) =>
    route.fulfill({
      json: {
        job_id: "radar-workflow",
        status: "succeeded",
        progress: 1,
        message: "Ready",
        scene_generation: 7,
      },
    }),
  );

  return () => submittedRadar;
}

test("Radar model picker wraps navigation and adds or removes the selected model", async ({
  page,
}) => {
  await page.route("**/assets/radar/drones/manifest.json", (route) =>
    route.fulfill({ json: RADAR_PREVIEW_MANIFEST }),
  );
  await openDeterministicApp(page);
  await enableRealViewer(page);
  await activateMode(page, "radar");

  const inspector = page.getByTestId("left-inspector");
  await expect(inspector.getByText("1 / 4")).toBeVisible();
  await expect(
    inspector.getByRole("button", { name: "Run Radar Sensing" }),
  ).toBeDisabled();

  await inspector.getByRole("button", { name: "Previous drone model" }).click();
  await expect(inspector.getByText("4 / 4")).toBeVisible();
  await inspector.getByRole("button", { name: "Next drone model" }).click();
  await expect(inspector.getByText("1 / 4")).toBeVisible();

  await inspector.getByRole("button", { name: "Add Target to Scene" }).click();
  await expect(
    page.locator('[data-testid="radar-target-list"] button'),
  ).toHaveCount(1);

  await inspector
    .getByRole("button", { name: "Remove selected target" })
    .click();
  await expect(
    page.locator('[data-testid="radar-target-list"] button'),
  ).toHaveCount(0);

  await inspector.getByRole("button", { name: "Add Target to Scene" }).click();
  await expect(
    page.locator('[data-testid="radar-target-list"] button'),
  ).toHaveCount(1);
  expect(
    await page.evaluate(async () => {
      const { state } =
        await import("/js/app_state.js?v=20260723-radar-shared-groups");
      return state.radar.targets[0].asset_id;
    }),
  ).toBe("dji-air-2s");
});

test("Radar target editing submits normalized motion and monostatic coordinates", async ({
  page,
}) => {
  test.setTimeout(60_000);
  const submittedPayload = await installRadarJob(page);
  await openDeterministicApp(page);
  await enableRealViewer(page);
  await configureRadarFixture(page);
  await page.evaluate(async () => {
    const { state } =
      await import("/js/app_state.js?v=20260723-radar-shared-groups");
    state.radar.targets = [state.radar.targets[0]];
  });
  await activateMode(page, "radar");

  const inspector = page.getByTestId("left-inspector");
  const fillNum = async (label, value) => {
    const input = inspector.getByRole("spinbutton", { name: label, exact: true });
    await input.fill(value);
    await input.press("Tab");
  };

  await fillNum("X", "96");
  await fillNum("Y", "44");
  await fillNum("Z", "30");
  await fillNum("Roll", "12");
  await fillNum("Pitch", "-7");
  await fillNum("Speed", "12");
  await fillNum("Climb", "0");
  await fillNum("Heading", "90");
  await fillNum("RCS", "0.025");

  await inspector.getByRole("radio", { name: "Monostatic", exact: true }).click();
  await expect(
    page.getByTestId("device-bar").getByRole("button", { name: "Rx", exact: true }),
  ).toHaveCount(0);

  await inspector.getByRole("button", { name: "Run Radar Sensing" }).click();
  await expect(page.getByTestId("right-analysis-drawer")).toBeVisible();
  await expect(page.getByTestId("radar-summary-metrics")).toBeVisible();

  expect(submittedPayload().mode).toBe("monostatic");
  expect(submittedPayload().rx.position).toEqual(
    submittedPayload().tx.position,
  );
  expect(submittedPayload().targets[0]).toMatchObject({
    position: [96, 44, 30],
    rcs_m2: 0.025,
  });
  expect(submittedPayload().targets[0].orientation[0]).toBeCloseTo(
    (12 * Math.PI) / 180,
    5,
  );
  expect(submittedPayload().targets[0].orientation[1]).toBeCloseTo(
    (-7 * Math.PI) / 180,
    5,
  );
  expect(submittedPayload().targets[0].orientation[2]).toBeCloseTo(
    Math.PI / 2,
    5,
  );
  expect(submittedPayload().targets[0].velocity[0]).toBeCloseTo(0, 5);
  expect(submittedPayload().targets[0].velocity[1]).toBeCloseTo(12, 5);
  expect(submittedPayload().targets[0].velocity[2]).toBeCloseTo(0, 5);
});

test("Radar processing views, detection filters and scene selections stay linked", async ({
  page,
}) => {
  const submittedPayload = await installRadarJob(page, 12);
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

  await page
    .getByTestId("left-inspector")
    .getByRole("button", { name: "Run Radar Sensing" })
    .click();

  const drawer = page.getByTestId("right-analysis-drawer");
  await expect(drawer).toBeVisible();
  await expect(page.locator("#radarDetectionList button")).toHaveCount(11);
  await expect(drawer.getByText("1 target detection · 13 total")).toBeVisible();

  await drawer.getByRole("button", { name: /Show all 12/ }).click();
  await expect(page.locator("#radarDetectionList button")).toHaveCount(13);

  await drawer
    .getByRole("radio", { name: "Mean Sub", exact: true })
    .click();
  await expect(drawer.getByText("0 target detections · 0 total")).toBeVisible();
  await expect(drawer.getByText("16.0 dB")).toBeVisible();

  await drawer
    .getByRole("radio", { name: "Ideal", exact: true })
    .click();
  await expect(drawer.getByText("1 target detection · 1 total")).toBeVisible();
  await expect(drawer.getByText("28.0 dB")).toBeVisible();

  await drawer.getByRole("radio", { name: "Raw", exact: true }).click();
  await drawer.getByRole("radio", { name: "Full", exact: true }).click();
  await page.locator("#radarDetectionList button").first().click();

  const linkage = await page.evaluate(async () => {
    const { state, viewerRef } =
      await import("/js/app_state.js?v=20260723-radar-shared-groups");
    return {
      target: state.radar.selectedTargetId,
      detection: state.radar.selectedDetectionId,
      selectedPath: state.radar.selectedPath,
      sharedPaths: viewerRef.current.pathLayer.group.children.length,
      radarPaths: viewerRef.current.layers.get("radar", "paths").group.children
        .length,
      radarTargetsVisible: viewerRef.current.layers.get("radar", "targets")
        .group.visible,
    };
  });
  expect(linkage).toMatchObject({
    target: submittedPayload().targets[0].id,
    detection: "det-0",
    selectedPath: 0,
    sharedPaths: 0,
    radarPaths: 2,
    radarTargetsVisible: true,
  });
});
