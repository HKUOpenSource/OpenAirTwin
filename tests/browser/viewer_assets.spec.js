import { expect, test } from "@playwright/test";
import { openModulePage } from "./workbench-fixture.js";

test("asset manager loads real uncompressed GLB and PLY fixtures", async ({
  page,
}) => {
  await openModulePage(page);
  const result = await page.evaluate(async () => {
    const { AssetManager } = await import("/js/viewer/asset_manager.js");

    function bytesToDataUrl(bytes, mimeType) {
      let binary = "";
      for (let offset = 0; offset < bytes.length; offset += 0x8000) {
        binary += String.fromCharCode(
          ...bytes.subarray(offset, offset + 0x8000),
        );
      }
      return `data:${mimeType};base64,${btoa(binary)}`;
    }

    function triangleGlbUrl() {
      const gltf = {
        asset: { version: "2.0" },
        buffers: [{ byteLength: 36 }],
        bufferViews: [
          { buffer: 0, byteOffset: 0, byteLength: 36, target: 34962 },
        ],
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
      "ply",
      "format ascii 1.0",
      "element vertex 3",
      "property float x",
      "property float y",
      "property float z",
      "element face 1",
      "property list uchar int vertex_indices",
      "end_header",
      "0 0 0",
      "1 0 0",
      "0 1 0",
      "3 0 1 2",
      "",
    ].join("\n");
    const assets = new AssetManager();
    assets.register({
      id: "triangle-glb",
      url: triangleGlbUrl(),
      format: "glb",
      units: 1,
      upAxis: "Z",
      pivot: "origin",
      license: {
        name: "test fixture",
        source: "generated",
        attribution: "OpenAirTwin tests",
      },
    });
    assets.register({
      id: "triangle-ply",
      url: `data:application/octet-stream,${encodeURIComponent(plyText)}`,
      format: "ply",
      material: { color: "#336699", roughness: 0.5, metalness: 0.1 },
    });
    const [glb, ply] = await Promise.all([
      assets.instantiate("triangle-glb", { position: [1, 2, 3] }),
      assets.instantiate("triangle-ply", { scale: [2, 2, 2] }),
    ]);
    let glbVertices = 0;
    let plyVertices = 0;
    let plyColor = null;
    glb.traverse((child) => {
      glbVertices += child.geometry?.getAttribute?.("position")?.count || 0;
    });
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

test("radar drone assets load, instantiate, align and release through AssetManager", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await openModulePage(page);
  const result = await page.evaluate(async () => {
    const THREE = await import("/lib/three.module.js");
    const { AssetManager } = await import("/js/viewer/asset_manager.js");
    const response = await fetch("/assets/radar/drones/manifest.json");
    if (!response.ok)
      throw new Error(
        `Radar asset manifest request failed: ${response.status}`,
      );
    const manifest = await response.json();
    const assets = new AssetManager();
    const observations = [];

    for (const descriptor of manifest.assets) {
      assets.register({
        id: descriptor.id,
        url: descriptor.visual.url,
        format: descriptor.visual.format,
        units: 1,
        upAxis: "Z",
        pivot: "origin",
        license: descriptor.license,
      });
      const instance = await assets.instantiate(descriptor.id);
      const bounds = new THREE.Box3().setFromObject(instance);
      const size = bounds.getSize(new THREE.Vector3()).toArray();
      const center = bounds.getCenter(new THREE.Vector3()).toArray();
      let meshCount = 0;
      let texturedMeshCount = 0;
      instance.traverse((child) => {
        if (!child.isMesh) return;
        meshCount += 1;
        const materials = Array.isArray(child.material)
          ? child.material
          : [child.material];
        if (materials.some((material) => material?.map)) texturedMeshCount += 1;
      });
      observations.push({
        id: descriptor.id,
        size,
        expectedSize: descriptor.visual.bounds_m.size,
        center,
        meshCount,
        texturedMeshCount,
        attribution: assets.descriptor(descriptor.id).license.attribution,
        released: assets.release(instance),
      });
    }

    assets.clearCache();
    return {
      schemaVersion: manifest.schema_version,
      releaseStatus: manifest.release_gate.status,
      alignmentToleranceM: manifest.limits.alignment_tolerance_m,
      observations,
      cachedAssets: assets._records.size,
      cachedSources: assets._sourceRecords.size,
    };
  });

  expect(result.schemaVersion).toBe(1);
  expect(result.releaseStatus).toBe("approved");
  expect(result.observations.map((item) => item.id)).toEqual([
    "dji-air-2s",
    "dji-mavic-3-cine",
    "dji-mini-3",
    "dji-mini-3-pro",
  ]);
  for (const observation of result.observations) {
    expect(observation.released).toBe(true);
    expect(observation.meshCount).toBeGreaterThan(0);
    expect(observation.texturedMeshCount).toBeGreaterThan(0);
    expect(observation.attribution.length).toBeGreaterThan(0);
    observation.center.forEach((value) =>
      expect(Math.abs(value)).toBeLessThan(result.alignmentToleranceM),
    );
    observation.size.forEach((value, index) => {
      expect(Math.abs(value - observation.expectedSize[index])).toBeLessThan(
        result.alignmentToleranceM,
      );
    });
  }
  expect(result.cachedAssets).toBe(0);
  expect(result.cachedSources).toBe(0);
});

test("radar target scene keeps visual transforms and IDs stable while releasing instances", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await openModulePage(page);
  const result = await page.evaluate(async () => {
    const THREE = await import("/lib/three.module.js");
    const { AssetManager } = await import("/js/viewer/asset_manager.js");
    const { RadarTargetScene } =
      await import("/js/features/radar/target_scene.js");
    const manifest = await fetch("/assets/radar/drones/manifest.json").then(
      (response) => response.json(),
    );
    const assets = new AssetManager();
    for (const descriptor of manifest.assets) {
      assets.register({
        id: descriptor.id,
        url: descriptor.visual.url,
        format: descriptor.visual.format,
        units: 1,
        upAxis: "Z",
        pivot: "origin",
        license: descriptor.license,
      });
    }

    const group = new THREE.Group();
    const targets = new RadarTargetScene({ assetManager: assets, group });
    await targets.sync([
      {
        id: "alpha",
        asset_id: "dji-mini-3",
        position: [20, 1, 10],
        orientation: [0, 0, 0],
        velocity: [8, 0, 0],
        rcs_m2: 0.02,
      },
      {
        id: "bravo",
        asset_id: "dji-air-2s",
        position: [50, -2, 15],
        orientation: [0.1, 0.2, 0.3],
        velocity: [0, -4, 1],
        rcs_m2: 0.04,
      },
    ]);
    const firstAlpha = targets.instanceForTarget("alpha");
    const firstBravo = targets.instanceForTarget("bravo");
    const alphaSize = new THREE.Box3()
      .setFromObject(firstAlpha)
      .getSize(new THREE.Vector3())
      .toArray();
    const expectedAlphaSize = manifest.assets.find(
      (item) => item.id === "dji-mini-3",
    ).visual.bounds_m.size;
    const initial = {
      size: targets.size,
      children: group.children.length,
      alphaName: firstAlpha.name,
      alphaPosition: firstAlpha.position.toArray(),
      alphaSize,
      expectedAlphaSize,
      bravoTargetId: targets.targetIdForVisualInstance(
        "radar-target-visual-bravo",
      ),
      bravoSionnaName: firstBravo.userData.radarSionnaObjectName,
      bravoVelocity: firstBravo.userData.radarVelocityMps,
    };

    await targets.sync([
      {
        id: "alpha",
        asset_id: "dji-mini-3",
        position: [20, 1, 10],
        orientation: [0, 0, Math.PI / 2],
        velocity: [0, 8, 0],
        rcs_m2: 0.02,
      },
      {
        id: "bravo",
        asset_id: "dji-air-2s",
        position: [50, -2, 15],
        orientation: [0.1, 0.2, 0.3],
        velocity: [0, -4, 1],
        rcs_m2: 0.04,
      },
    ]);
    const alignedAlpha = targets.instanceForTarget("alpha");
    const alignedHeading = {
      reusedAlpha: alignedAlpha === firstAlpha,
      forward: new THREE.Vector3(1, 0, 0)
        .applyQuaternion(alignedAlpha.quaternion)
        .toArray(),
      velocity: alignedAlpha.userData.radarVelocityMps,
    };

    await targets.sync([
      {
        id: "alpha",
        asset_id: "dji-mini-3",
        position: [80, 3, 20],
        orientation: [0.4, 0.5, 0.6],
        velocity: [-5, 0, 0],
        rcs_m2: 0.03,
      },
      {
        id: "charlie",
        asset_id: "dji-mavic-3-cine",
        position: [100, 0, 30],
        orientation: [0, 0, 0],
        velocity: [0, 0, 0],
        rcs_m2: 0.05,
      },
    ]);
    const updatedAlpha = targets.instanceForTarget("alpha");
    const updated = {
      size: targets.size,
      children: group.children.length,
      reusedAlpha: updatedAlpha === firstAlpha,
      alphaPosition: updatedAlpha.position.toArray(),
      alphaOrientation: [
        updatedAlpha.rotation.x,
        updatedAlpha.rotation.y,
        updatedAlpha.rotation.z,
      ],
      alphaVelocity: updatedAlpha.userData.radarVelocityMps,
      removedBravoParent: firstBravo.parent,
      ids: targets.snapshot().map((target) => ({
        id: target.id,
        visual: target.visualInstanceId,
        sionna: target.sionnaObjectName,
      })),
    };

    const alphaBeforeDispose = targets.instanceForTarget("alpha");
    targets.dispose();
    assets.clearCache();

    let resolveDelayedInstance;
    let delayedReleaseCount = 0;
    const delayedAssets = {
      instantiate: () =>
        new Promise((resolve) => {
          resolveDelayedInstance = resolve;
        }),
      release: (instance) => {
        delayedReleaseCount += 1;
        instance.removeFromParent();
        return true;
      },
    };
    const delayedGroup = new THREE.Group();
    const delayedTargets = new RadarTargetScene({
      assetManager: delayedAssets,
      group: delayedGroup,
    });
    const delayedSync = delayedTargets.sync([
      {
        id: "delayed",
        asset_id: "dji-mini-3",
        position: [20, 0, 10],
        orientation: [0, 0, 0],
        velocity: [0, 0, 0],
        rcs_m2: 0.01,
      },
    ]);
    delayedTargets.dispose();
    resolveDelayedInstance(new THREE.Group());
    await delayedSync;
    return {
      initial,
      alignedHeading,
      updated,
      disposed: {
        size: targets.size,
        children: group.children.length,
        alphaParent: alphaBeforeDispose.parent,
        cachedAssets: assets._records.size,
        cachedSources: assets._sourceRecords.size,
      },
      staleAsyncLoad: {
        size: delayedTargets.size,
        children: delayedGroup.children.length,
        releaseCount: delayedReleaseCount,
      },
      alignmentToleranceM: manifest.limits.alignment_tolerance_m,
    };
  });

  expect(result.initial.size).toBe(2);
  expect(result.initial.children).toBe(2);
  expect(result.initial.alphaName).toBe("radar-target-visual-alpha");
  expect(result.initial.alphaPosition).toEqual([20, 1, 10]);
  expect(result.initial.bravoTargetId).toBe("bravo");
  expect(result.initial.bravoSionnaName).toBe("radar-target-bravo");
  expect(result.initial.bravoVelocity).toEqual([0, -4, 1]);
  result.initial.alphaSize.forEach((value, index) => {
    expect(
      Math.abs(value - result.initial.expectedAlphaSize[index]),
    ).toBeLessThan(result.alignmentToleranceM);
  });
  expect(result.alignedHeading.reusedAlpha).toBe(true);
  expect(result.alignedHeading.velocity).toEqual([0, 8, 0]);
  expect(result.alignedHeading.forward[0]).toBeCloseTo(0, 6);
  expect(result.alignedHeading.forward[1]).toBeCloseTo(1, 6);
  expect(result.alignedHeading.forward[2]).toBeCloseTo(0, 6);
  expect(result.updated.size).toBe(2);
  expect(result.updated.children).toBe(2);
  expect(result.updated.reusedAlpha).toBe(true);
  expect(result.updated.alphaPosition).toEqual([80, 3, 20]);
  expect(result.updated.alphaOrientation).toEqual([0.4, 0.5, 0.6]);
  expect(result.updated.alphaVelocity).toEqual([-5, 0, 0]);
  expect(result.updated.removedBravoParent).toBe(null);
  expect(result.updated.ids).toEqual([
    {
      id: "alpha",
      visual: "radar-target-visual-alpha",
      sionna: "radar-target-alpha",
    },
    {
      id: "charlie",
      visual: "radar-target-visual-charlie",
      sionna: "radar-target-charlie",
    },
  ]);
  expect(result.disposed).toEqual({
    size: 0,
    children: 0,
    alphaParent: null,
    cachedAssets: 0,
    cachedSources: 0,
  });
  expect(result.staleAsyncLoad).toEqual({
    size: 0,
    children: 0,
    releaseCount: 1,
  });
});

test("Radar chart renders the maximum bounded matrix without a call-stack overflow", async ({
  page,
}) => {
  await openModulePage(page);
  const rendered = await page.evaluate(async () => {
    const { drawRadarRangeDoppler } =
      await import("/js/features/radar/charts.js");
    const canvas = document.createElement("canvas");
    canvas.style.width = "900px";
    canvas.style.height = "420px";
    document.body.append(canvas);
    const rangeBins = 512;
    const dopplerBins = 256;
    const rangeAxis = Array.from(
      { length: rangeBins },
      (_, index) => index * 1.17,
    );
    const dopplerAxis = Array.from(
      { length: dopplerBins },
      (_, index) => (index - dopplerBins / 2) * 122.1,
    );
    const matrix = Array.from({ length: dopplerBins }, (_, row) =>
      Array.from(
        { length: rangeBins },
        (_, column) => -130 + ((row * 17 + column * 13) % 61),
      ),
    );
    const layout = drawRadarRangeDoppler({
      canvas,
      result: {
        targets: [],
        detections: [],
        radar: { carrier_frequency_hz: 5.8e9 },
      },
      rangeDoppler: {
        equivalent_range_axis_m: rangeAxis,
        doppler_axis_hz: dopplerAxis,
        power_dbm: matrix,
      },
    });
    return {
      width: canvas.width,
      height: canvas.height,
      rangeBins: layout.ranges.length,
      dopplerBins: layout.dopplers.length,
    };
  });
  expect(rendered).toMatchObject({ rangeBins: 512, dopplerBins: 256 });
  expect(rendered.width).toBeGreaterThan(0);
  expect(rendered.height).toBeGreaterThan(0);
});
