import {expect, test} from "@playwright/test";

const RT_CAPABILITIES = {
  ok: true,
  antenna_arrays: {
    defaults: {
      num_rows: 1,
      num_cols: 1,
      vertical_spacing: 0.5,
      horizontal_spacing: 0.5,
      pattern: "iso",
      polarization: "V",
    },
    limits: {
      num_rows: {min: 1, max: 16},
      num_cols: {min: 1, max: 16},
      vertical_spacing: {min: 0.01, max: 10},
      horizontal_spacing: {min: 0.01, max: 10},
    },
    patterns: ["iso"],
    polarizations: ["V"],
  },
};

const EMPTY_MANIFEST = {
  scene_id: "browser_fixture",
  mesh_count: 0,
  bundle_count: 0,
  tiles: [],
  bsdfs: {},
  integrity: {orphan_mesh_count: 0, orphan_mesh_samples: [], missing_mesh_count: 0, missing_mesh_samples: []},
  bundles: [],
};

const PATH = {
  path_index: 0,
  type: "LOS",
  path_gain_db: -81.25,
  path_gain_linear: 7.5e-9,
  delay_ns: 24.5,
  path_length_m: 7.35,
  polyline: [[70, 35, 40], [90, 52, 2]],
};

const LINK_RESULT = {
  ok: true,
  summary: {received_power_db: -81.25, strongest_path_db: -81.25, valid_paths: 1, los_paths: 1},
  paths: [PATH],
  channel: null,
};

const MOBILITY_RESULT = {
  ok: true,
  summary: {
    step_count: 2,
    duration_s: 1,
    min_received_power_db: -83,
    max_received_power_db: -81,
    max_abs_doppler_hz: 12,
  },
  series: {time_s: [0, 1], received_power_db: [-81, -83]},
  samples: [
    {step_index: 0, time_s: 0, distance_m: 0, rx_position: [90, 52, 2], paths: [PATH], channel: null, summary: LINK_RESULT.summary},
    {step_index: 1, time_s: 1, distance_m: 2, rx_position: [92, 52, 2], paths: [PATH], channel: null, summary: LINK_RESULT.summary},
  ],
};

const RADIOMAP_RESULT = {
  metric: "path_gain",
  unit: "dB",
  surface: {
    resolution_mode: "cell_size_grid",
    grid_shape: [1, 1],
    grid_cell_count: 1,
    triangle_count: 1,
    requested_cell_size: 10,
    resolved_cell_size_x: 10,
    resolved_cell_size_y: 10,
    density_level: 2,
  },
  solver: {base_samples_per_tx: 1000, effective_samples_per_tx: 1000},
  range: {min: -95, max: -95},
  values: {count: 1, data: [-95]},
  geometry: {triangle_positions: [65, 30, 0.1, 75, 30, 0.1, 65, 40, 0.1]},
};

async function openDeterministicApp(page) {
  await page.route("**/api/rt/capabilities", (route) => route.fulfill({json: RT_CAPABILITIES}));
  await page.route("**/api/scene/manifest", (route) => route.fulfill({json: EMPTY_MANIFEST}));
  await page.route("**/assets/open3dhk_tile_coverage.json", (route) => route.fulfill({json: {tile_count: 0, tiles: []}}));
  await page.goto("/");
  await expect(page.locator("#loadingScreen")).toBeHidden();
  await page.evaluate(() => {
    document.getElementById("entryScreen").classList.add("hidden");
    document.getElementById("entryScreen").setAttribute("aria-hidden", "true");
    document.getElementById("ui").style.display = "flex";
  });
}

async function activateMode(page, mode) {
  await page.evaluate((nextMode) => {
    document.getElementById("modeSelector").open = true;
    document.querySelector(`[data-mode="${nextMode}"]`).click();
  }, mode);
}

async function enableRealViewer(page) {
  await page.evaluate(async () => {
    const [{Viewer}, {state, viewerRef}] = await Promise.all([
      import("/js/viewer.js"),
      import("/js/app_state.js?v=20260519-mode-isolation"),
    ]);
    const viewer = new Viewer(document.getElementById("view"));
    viewer.__ready = true;
    viewer.loadedTileIds.add("fixture-tile");
    viewerRef.current = viewer;
    state.entry.visible = false;
    document.querySelector('[data-mode="mobility"]').click();
    document.querySelector('[data-mode="link"]').click();
  });
  await expect(page.locator("#deviceDock")).toBeVisible();
}

test("catalog order and four mode control snapshots stay stable", async ({page}) => {
  await openDeterministicApp(page);
  expect(await page.locator("#modeMenu [data-mode]").evaluateAll((nodes) => nodes.map((node) => node.dataset.mode))).toEqual(
    ["link", "mobility", "radiomap", "deepmimo"],
  );

  for (const [mode, title] of [
    ["link", "Link Analysis"],
    ["mobility", "Mobility Analysis"],
    ["radiomap", "Radio Map"],
    ["deepmimo", "DeepMIMO"],
  ]) {
    await page.evaluate((nextMode) => {
      document.getElementById("modeSelector").open = true;
      document.querySelector(`[data-mode="${nextMode}"]`).click();
    }, mode);
    await expect(page.locator("#modeSelectTitle")).toHaveText(`Mode (${title})`);
    await expect(page.locator(`[data-mode="${mode}"]`)).toHaveAttribute("aria-selected", "true");
    await expect(page.locator("#ui")).toHaveScreenshot(`${mode}-controls.png`, {
      animations: "disabled",
      caret: "hide",
    });
  }
});

test("feature transports, polling, controls and scene layers remain isolated", async ({page}) => {
  let linkRequests = 0;
  let deepCreates = 0;
  const submitted = {};

  await page.route("**/api/link/solve", async (route) => {
    linkRequests += 1;
    submitted.link = route.request().postDataJSON();
    await route.fulfill({json: LINK_RESULT});
  });
  await page.route("**/api/mobility/jobs", async (route) => {
    submitted.mobility = route.request().postDataJSON();
    await route.fulfill({status: 202, json: {job_id: "mob-1", status: "queued"}});
  });
  await page.route("**/api/mobility/jobs/mob-1/result", (route) => route.fulfill({json: MOBILITY_RESULT}));
  await page.route("**/api/mobility/jobs/mob-1", (route) => route.fulfill({json: {job_id: "mob-1", status: "succeeded"}}));
  await page.route("**/api/radiomap/jobs", async (route) => {
    submitted.radiomap = route.request().postDataJSON();
    await route.fulfill({status: 202, json: {job_id: "rm-1", status: "queued"}});
  });
  await page.route("**/api/radiomap/jobs/rm-1/result", (route) => route.fulfill({json: RADIOMAP_RESULT}));
  await page.route("**/api/radiomap/jobs/rm-1", (route) => route.fulfill({json: {job_id: "rm-1", status: "succeeded"}}));
  await page.route("**/api/deepmimo/jobs", async (route) => {
    deepCreates += 1;
    submitted.deepmimo = route.request().postDataJSON();
    const jobId = deepCreates === 1 ? "deep-cancel" : "deep-ok";
    await route.fulfill({status: 202, json: {job_id: jobId, status: "running", progress: 0.2}});
  });
  await page.route("**/api/deepmimo/jobs/deep-cancel/cancel", (route) => route.fulfill({json: {
    job_id: "deep-cancel", status: "cancelled", progress: 1, message: "Cancelled",
  }}));
  await page.route("**/api/deepmimo/jobs/deep-cancel", (route) => route.fulfill({json: {
    job_id: "deep-cancel", status: "running", progress: 0.3, message: "Tracing",
  }}));
  await page.route("**/api/deepmimo/jobs/deep-ok", (route) => route.fulfill({json: {
    job_id: "deep-ok",
    status: "succeeded",
    progress: 1,
    updated_at: "2026-07-18T00:00:00Z",
    result: {archive_name: "fixture.zip"},
  }}));

  await openDeterministicApp(page);
  await enableRealViewer(page);

  await page.locator("#btnSolveLink").click();
  await expect(page.locator("#linkResult")).toBeVisible();
  await expect(page.locator("#linkPower")).toHaveText("-81.25 dB");
  await expect(page.locator(".pathRow")).toHaveCount(1);
  expect(await page.evaluate(async () => {
    const {viewerRef} = await import("/js/app_state.js?v=20260519-mode-isolation");
    return viewerRef.current.pathLayer.group.children.length;
  })).toBe(1);

  await page.locator("details.livePreviewParam > summary").click();
  await page.locator("#livePreviewEnabled").check();
  await page.locator("#livePreviewPathsDelay").fill("0");
  await page.locator("#btnPickLinkTx").click();
  await page.locator("#linkTxX").fill("73");
  await page.locator("#linkTxX").press("Tab");
  await expect.poll(() => linkRequests).toBeGreaterThan(1);

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
    slider.dispatchEvent(new Event("input", {bubbles: true}));
  });
  await expect(page.locator("#mobilityStepLabel")).toContainText("Step 2");
  await page.locator("#btnMobilityPlay").click();
  await expect(page.locator("#btnMobilityPlay")).toHaveText("Pause");
  expect(await page.evaluate(async () => {
    const {viewerRef} = await import("/js/app_state.js?v=20260519-mode-isolation");
    return {
      paths: viewerRef.current.pathLayer.group.children.length,
      trajectory: viewerRef.current.mobilityLayer.group.children.length,
    };
  })).toEqual({paths: 1, trajectory: 3});

  await activateMode(page, "radiomap");
  await expect(page.locator("#btnMobilityPlay")).toHaveText("Play");
  await page.locator("#btnRunRadiomap").click();
  await expect(page.locator("#radiomapResult")).toBeVisible();
  await expect(page.locator("#rmStatus")).toHaveText("Succeeded");
  expect(await page.evaluate(async () => {
    const {viewerRef} = await import("/js/app_state.js?v=20260519-mode-isolation");
    return {
      paths: viewerRef.current.pathLayer.group.children.length,
      trajectory: viewerRef.current.mobilityLayer.group.children.length,
      heatmap: viewerRef.current.radiomapLayer.group.children.length,
    };
  })).toEqual({paths: 0, trajectory: 0, heatmap: 1});

  await page.locator("#cfgFrequency").fill("3.6");
  await page.locator("#cfgFrequency").press("Tab");
  await expect.poll(async () => page.evaluate(async () => {
    const {state, viewerRef} = await import("/js/app_state.js?v=20260519-mode-isolation");
    return !state.radiomap.result && viewerRef.current.radiomapLayer.group.children.length === 0;
  })).toBe(true);

  await page.evaluate(async () => {
    const {state} = await import("/js/app_state.js?v=20260519-mode-isolation");
    state.deepmimo.roi.cornerA = [60, 30, 0];
    state.deepmimo.roi.cornerB = [80, 50, 0];
    state.deepmimo.roi.visualZ = 0;
  });
  await activateMode(page, "deepmimo");
  expect(await page.evaluate(async () => {
    const {viewerRef} = await import("/js/app_state.js?v=20260519-mode-isolation");
    return {
      heatmap: viewerRef.current.radiomapLayer.group.children.length,
      roi: viewerRef.current.deepMimoRoiLayer.group.children.length,
    };
  })).toEqual({heatmap: 0, roi: 2});

  await page.locator("#btnRunDeepMimo").click();
  await expect(page.locator("#btnLoadingCancel")).toBeVisible();
  await page.locator("#btnLoadingCancel").click();
  await expect(page.locator("#btnRunDeepMimo")).not.toHaveAttribute("aria-busy", "true", {timeout: 5_000});
  await expect(page.locator("#deepMimoDatasetCount")).toHaveText("0");

  await page.locator("#btnRunDeepMimo").click();
  await expect(page.locator("#deepMimoDatasetCount")).toHaveText("1");
  await page.locator("#deepMimoDatasetToggle").click();
  await expect(page.locator("#deepMimoDatasetList .deepMimoDatasetDownload")).toHaveAttribute("href", /deep-ok\/download$/);

  expect(Object.keys(submitted).sort()).toEqual(["deepmimo", "link", "mobility", "radiomap"]);
  expect(submitted.mobility.rx_trajectory.points).toHaveLength(2);
  expect(submitted.radiomap.surface).toBeTruthy();
  expect(submitted.deepmimo.roi).toBeTruthy();
});

test("feature registry accepts a virtual feature without core entry edits", async ({page}) => {
  await openDeterministicApp(page);
  const result = await page.evaluate(async () => {
    const {defineFeature, FeatureRegistry, FeatureStore} = await import("/js/core/feature_registry.js");
    const virtual = defineFeature({
      id: "virtual",
      order: 5,
      title: "Virtual",
      createState: () => ({ready: true}),
      templateFragments: {featurePanelAnchor: '<section id="virtualPanel">Virtual Panel</section>'},
      queryDom: (root) => ({panel: root.getElementById("virtualPanel")}),
      createTransport: () => ({kind: "transport"}),
      createResultView: () => ({viewReady: true}),
      createController: () => ({controllerReady: true}),
      createRenderer: () => ({rendererReady: true}),
      createFeature: ({featureState}) => ({activate: () => { featureState.activated = true; }}),
    });
    const store = new FeatureStore([virtual]);
    const registry = new FeatureRegistry({definitions: [virtual], store});
    registry.mountTemplates(document);
    registry.initialize({documentRoot: document});
    registry.activate("virtual");
    const instance = registry.instance("virtual");
    return {
      ids: registry.definitions().map((item) => item.id),
      state: store.get("virtual"),
      panel: instance.dom.panel.textContent,
      transport: registry.transport("virtual").kind,
      components: [instance.viewReady, instance.controllerReady, instance.rendererReady],
    };
  });
  expect(result).toEqual({
    ids: ["virtual"],
    state: {ready: true, activated: true},
    panel: "Virtual Panel",
    transport: "transport",
    components: [true, true, true],
  });
});

test("layer and asset managers isolate, cache and dispose resources", async ({page}) => {
  await openDeterministicApp(page);
  const result = await page.evaluate(async () => {
    const THREE = await import("/lib/three.module.js");
    const {SceneLayerManager} = await import("/js/viewer/layer_manager.js");
    const {AssetManager} = await import("/js/viewer/asset_manager.js");

    const scene = new THREE.Scene();
    const layers = new SceneLayerManager(scene);
    const left = layers.create("left", "mesh");
    const right = layers.create("right", "mesh");
    let layerGeometryDisposed = 0;
    const nested = new THREE.Group();
    const nestedMesh = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial());
    nestedMesh.geometry.dispose = () => { layerGeometryDisposed += 1; };
    nested.add(nestedMesh);
    left.add(nested);
    right.add(new THREE.Group());
    left.clear();
    layers.setFeatureVisible("right", false);

    let gltfLoads = 0;
    let assetGeometryDisposed = 0;
    const source = new THREE.Group();
    const sourceMesh = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshStandardMaterial({color: "#123456"}));
    sourceMesh.geometry.dispose = () => { assetGeometryDisposed += 1; };
    source.add(sourceMesh);
    const assets = new AssetManager({
      gltfLoader: {loadAsync: async () => { gltfLoads += 1; return {scene: source}; }},
      plyLoader: {load: () => {}},
    });
    assets.register({id: "a", url: "/fixture.glb", format: "glb", units: 2, upAxis: "Z", pivot: "origin"});
    assets.register({id: "b", url: "/fixture.glb", format: "glb", units: 3, upAxis: "Z", pivot: "origin"});
    const [a, b] = await Promise.all([
      assets.instantiate("a", {position: [1, 2, 3]}),
      assets.instantiate("b", {scale: [2, 2, 2]}),
    ]);
    const transform = {position: a.position.toArray(), scale: b.scale.toArray()};
    const materialPreserved = a.children[0].material.color.getHexString() === "123456";
    assets.release(a);
    assets.clearCache();
    const retainedWhileReferenced = assetGeometryDisposed === 0;
    assets.release(b);

    let recoveryAttempts = 0;
    const recoveringAssets = new AssetManager({
      gltfLoader: {
        loadAsync: async () => {
          recoveryAttempts += 1;
          if (recoveryAttempts === 1) throw new Error("fixture load failed");
          return {scene: new THREE.Group()};
        },
      },
      plyLoader: {load: () => {}},
    });
    recoveringAssets.register({id: "recover", url: "/recover.glb", format: "glb"});
    let firstLoadFailed = false;
    try {
      await recoveringAssets.preload("recover");
    } catch (_error) {
      firstLoadFailed = true;
    }
    const recovered = await recoveringAssets.preload("recover");

    return {
      layerGeometryDisposed,
      rightVisible: right.group.visible,
      leftCount: left.group.children.length,
      rightCount: right.group.children.length,
      gltfLoads,
      transform,
      materialPreserved,
      retainedWhileReferenced,
      assetGeometryDisposed,
      firstLoadFailed,
      recoveryAttempts,
      recovered: recovered.isGroup,
    };
  });
  expect(result).toEqual({
    layerGeometryDisposed: 1,
    rightVisible: false,
    leftCount: 0,
    rightCount: 1,
    gltfLoads: 1,
    transform: {position: [1, 2, 3], scale: [6, 6, 6]},
    materialPreserved: true,
    retainedWhileReferenced: true,
    assetGeometryDisposed: 1,
    firstLoadFailed: true,
    recoveryAttempts: 2,
    recovered: true,
  });
});

test("asset manager loads real uncompressed GLB and PLY fixtures", async ({page}) => {
  await openDeterministicApp(page);
  const result = await page.evaluate(async () => {
    const {AssetManager} = await import("/js/viewer/asset_manager.js");

    function bytesToDataUrl(bytes, mimeType) {
      let binary = "";
      for (let offset = 0; offset < bytes.length; offset += 0x8000) {
        binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
      }
      return `data:${mimeType};base64,${btoa(binary)}`;
    }

    function triangleGlbUrl() {
      const gltf = {
        asset: {version: "2.0"},
        buffers: [{byteLength: 36}],
        bufferViews: [{buffer: 0, byteOffset: 0, byteLength: 36, target: 34962}],
        accessors: [{bufferView: 0, componentType: 5126, count: 3, type: "VEC3", min: [0, 0, 0], max: [1, 1, 0]}],
        meshes: [{primitives: [{attributes: {POSITION: 0}}]}],
        nodes: [{mesh: 0}],
        scenes: [{nodes: [0]}],
        scene: 0,
      };
      const encodedJson = new TextEncoder().encode(JSON.stringify(gltf));
      const jsonLength = Math.ceil(encodedJson.length / 4) * 4;
      const binary = new Uint8Array(36);
      new Float32Array(binary.buffer).set([0, 0, 0, 1, 0, 0, 0, 1, 0]);
      const totalLength = 12 + 8 + jsonLength + 8 + binary.length;
      const glb = new Uint8Array(totalLength);
      const view = new DataView(glb.buffer);
      view.setUint32(0, 0x46546c67, true);
      view.setUint32(4, 2, true);
      view.setUint32(8, totalLength, true);
      view.setUint32(12, jsonLength, true);
      view.setUint32(16, 0x4e4f534a, true);
      glb.fill(0x20, 20, 20 + jsonLength);
      glb.set(encodedJson, 20);
      const binaryHeader = 20 + jsonLength;
      view.setUint32(binaryHeader, binary.length, true);
      view.setUint32(binaryHeader + 4, 0x004e4942, true);
      glb.set(binary, binaryHeader + 8);
      return bytesToDataUrl(glb, "model/gltf-binary");
    }

    const plyText = [
      "ply", "format ascii 1.0", "element vertex 3",
      "property float x", "property float y", "property float z",
      "element face 1", "property list uchar int vertex_indices", "end_header",
      "0 0 0", "1 0 0", "0 1 0", "3 0 1 2", "",
    ].join("\n");
    const assets = new AssetManager();
    assets.register({
      id: "triangle-glb",
      url: triangleGlbUrl(),
      format: "glb",
      units: 1,
      upAxis: "Z",
      pivot: "origin",
      license: {name: "test fixture", source: "generated", attribution: "OpenAirTwin tests"},
    });
    assets.register({
      id: "triangle-ply",
      url: `data:application/octet-stream,${encodeURIComponent(plyText)}`,
      format: "ply",
      material: {color: "#336699", roughness: 0.5, metalness: 0.1},
    });
    const [glb, ply] = await Promise.all([
      assets.instantiate("triangle-glb", {position: [1, 2, 3]}),
      assets.instantiate("triangle-ply", {scale: [2, 2, 2]}),
    ]);
    let glbVertices = 0;
    let plyVertices = 0;
    let plyColor = null;
    glb.traverse((child) => { glbVertices += child.geometry?.getAttribute?.("position")?.count || 0; });
    ply.traverse((child) => {
      plyVertices += child.geometry?.getAttribute?.("position")?.count || 0;
      if (child.material?.color) plyColor = child.material.color.getHexString();
    });
    const descriptorLicense = assets.descriptor("triangle-glb").license.name;
    assets.release(glb);
    assets.release(ply);
    assets.clearCache();
    return {
      glbVertices,
      plyVertices,
      plyColor,
      glbPosition: glb.position.toArray(),
      plyScale: ply.scale.toArray(),
      descriptorLicense,
    };
  });
  expect(result).toEqual({
    glbVertices: 3,
    plyVertices: 3,
    plyColor: "336699",
    glbPosition: [1, 2, 3],
    plyScale: [2, 2, 2],
    descriptorLicense: "test fixture",
  });
});
