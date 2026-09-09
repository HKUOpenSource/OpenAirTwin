import { expect, test } from "vitest";

test("layer and asset managers isolate, cache and dispose resources", async () => {
  const result = await (async () => {
    const THREE = await import("/lib/three.module.js");
    const { SceneLayerManager } = await import("/js/viewer/layer_manager.js");
    const { AssetManager } = await import("/js/viewer/asset_manager.js");

    const scene = new THREE.Scene();
    const layers = new SceneLayerManager(scene);
    const left = layers.create("left", "mesh");
    const right = layers.create("right", "mesh");
    let layerGeometryDisposed = 0;
    const nested = new THREE.Group();
    const nestedMesh = new THREE.Mesh(
      new THREE.BufferGeometry(),
      new THREE.MeshBasicMaterial(),
    );
    nestedMesh.geometry.dispose = () => {
      layerGeometryDisposed += 1;
    };
    nested.add(nestedMesh);
    left.add(nested);
    right.add(new THREE.Group());
    left.clear();
    layers.setFeatureVisible("right", false);

    let gltfLoads = 0;
    let assetGeometryDisposed = 0;
    const source = new THREE.Group();
    const sourceMesh = new THREE.Mesh(
      new THREE.BufferGeometry(),
      new THREE.MeshStandardMaterial({ color: "#123456" }),
    );
    sourceMesh.geometry.dispose = () => {
      assetGeometryDisposed += 1;
    };
    source.add(sourceMesh);
    const assets = new AssetManager({
      gltfLoader: {
        loadAsync: async () => {
          gltfLoads += 1;
          return { scene: source };
        },
      },
      plyLoader: { load: () => {} },
    });
    assets.register({
      id: "a",
      url: "/fixture.glb",
      format: "glb",
      units: 2,
      upAxis: "Z",
      pivot: "origin",
    });
    assets.register({
      id: "b",
      url: "/fixture.glb",
      format: "glb",
      units: 3,
      upAxis: "Z",
      pivot: "origin",
    });
    const [a, b] = await Promise.all([
      assets.instantiate("a", { position: [1, 2, 3] }),
      assets.instantiate("b", { scale: [2, 2, 2] }),
    ]);
    const transform = {
      position: a.position.toArray(),
      scale: b.scale.toArray(),
    };
    const materialPreserved =
      a.children[0].material.color.getHexString() === "123456";
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
          return { scene: new THREE.Group() };
        },
      },
      plyLoader: { load: () => {} },
    });
    recoveringAssets.register({
      id: "recover",
      url: "/recover.glb",
      format: "glb",
    });
    let firstLoadFailed = false;
    try {
      await recoveringAssets.preload("recover");
    } catch {
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
  })();
  expect(result).toEqual({
    layerGeometryDisposed: 1,
    rightVisible: false,
    leftCount: 0,
    rightCount: 1,
    gltfLoads: 1,
    transform: { position: [1, 2, 3], scale: [6, 6, 6] },
    materialPreserved: true,
    retainedWhileReferenced: true,
    assetGeometryDisposed: 1,
    firstLoadFailed: true,
    recoveryAttempts: 2,
    recovered: true,
  });
});

test("Radar overview and focus share a signal-aware power scale", async () => {
  const scale = await (async () => {
    const { radarPowerScale } = await import("/js/features/radar/charts.js");
    const powerDbm = Array.from({ length: 100 }, (_, row) =>
      Array.from(
        { length: 100 },
        (_, column) => -114 + ((row * 7 + column * 3) % 5),
      ),
    );
    powerDbm[40][30] = -30;
    return radarPowerScale({
      range_doppler: { power_dbm: powerDbm },
      statistics: { noise_power_dbm: -120 },
    });
  })();
  expect(scale.peakDbm).toBe(-30);
  expect(scale.floorDbm).toBeGreaterThan(-110);
  expect(scale.floorDbm).toBeLessThan(-90);
});
