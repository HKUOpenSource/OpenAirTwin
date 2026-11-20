const HEAVY_PERFORMANCE_CATEGORIES = new Set(["VEGETATION_TB", "GENERIC"]);

function formatBytes(bytes, digits = 1) {
  const value = Number(bytes);
  if (!Number.isFinite(value) || value <= 0) {
    return "0 MB";
  }
  return `${(value / (1024 * 1024)).toFixed(digits)} MB`;
}

export function createPerformancePanelController(context) {
  const {state, viewerRef} = context;
  const shellStore = context.featureServices.shellUi;
  const getViewer = () => viewerRef.current;

  function performanceCategoryVisible(category) {
    return state.performance.categoryVisibility.get(category) !== false;
  }

  function applyPerformanceSettingsToViewer() {
    getViewer().setPerformanceMode(state.performance.mode);
    getViewer().setLightweightMaterials(state.performance.lightweightMaterials);
    for (const category of state.performance.categories) {
      getViewer().setCategoryVisible(category.name, performanceCategoryVisible(category.name));
    }
  }

  function buildPerformanceCategories(manifest) {
    const byCategory = new Map();
    for (const bundle of manifest.bundles || []) {
      const categoryName = bundle.category || "UNKNOWN";
      const category = byCategory.get(categoryName) || {
        name: categoryName,
        bundles: 0,
        tiles: new Set(),
        meshCount: 0,
        bytes: 0,
        compressedBytes: 0,
      };
      category.bundles += 1;
      category.tiles.add(bundle.tile);
      category.meshCount += Number(bundle.mesh_count) || 0;
      category.bytes += Number(bundle.size_bytes) || 0;
      category.compressedBytes += Number(bundle.compressed_size_bytes) || 0;
      byCategory.set(categoryName, category);
    }

    return [...byCategory.values()]
      .map((category) => ({
        ...category,
        tiles: category.tiles.size,
      }))
      .sort((left, right) => (right.bytes - left.bytes) || left.name.localeCompare(right.name));
  }

  function formatCompactCount(value, digits = 1) {
    const count = Number(value);
    if (!Number.isFinite(count) || count <= 0) {
      return "0";
    }
    if (count >= 1000000) {
      return `${(count / 1000000).toFixed(digits)}M`;
    }
    if (count >= 1000) {
      return `${(count / 1000).toFixed(digits)}K`;
    }
    return String(Math.round(count));
  }

  function categoryManifestFallback(category) {
    return `${category.tiles} tiles · ${formatBytes(category.bytes)}`;
  }

  function setCategoryVisibility(categoryName, visible) {
    state.performance.categoryVisibility.set(categoryName, Boolean(visible));
    getViewer().setCategoryVisible(categoryName, Boolean(visible));
    syncPerformanceUi();
  }

  function setAllCategoryVisibility(visible, predicate = () => true) {
    for (const category of state.performance.categories) {
      if (predicate(category.name)) {
        state.performance.categoryVisibility.set(category.name, Boolean(visible));
        getViewer().setCategoryVisible(category.name, Boolean(visible));
      }
    }
    syncPerformanceUi();
  }

  function populatePerformanceControls(manifest) {
    state.performance.categories = buildPerformanceCategories(manifest);
    for (const category of state.performance.categories) {
      if (!state.performance.categoryVisibility.has(category.name)) {
        state.performance.categoryVisibility.set(category.name, true);
      }
    }
    syncPerformanceUi();
  }

  function syncPerformanceUi() {
    const viewer = getViewer();
    const visible = Boolean(viewer.__ready && !state.entry.visible && state.sceneVisible && !state.loading.visible);
    const stats = viewer.getPerformanceStats();
    const fpsText = stats.fps > 0 ? stats.fps.toFixed(0) : "--";
    const dprText = Number.isFinite(stats.dpr) ? stats.dpr.toFixed(2) : "--";
    const loadedStats = new Map(viewer.getLoadedCategoryStats().map((item) => [item.category, item]));

    const categories = state.performance.categories.map((category) => {
      const catVisible = performanceCategoryVisible(category.name);
      const loaded = loadedStats.get(category.name);
      let statsText = categoryManifestFallback(category);
      if (loaded && loaded.bundles > 0) {
        const faces = catVisible ? loaded.visibleFaces : loaded.faces;
        statsText = `${formatCompactCount(faces)} faces · ${loaded.visibleBundles}/${loaded.bundles}`;
      }
      return {name: category.name, stats: statsText, visible: catVisible};
    });

    shellStore.patch((current) => ({
      ...current,
      performance: {
        visible,
        mode: state.performance.mode,
        lightweightMaterials: Boolean(state.performance.lightweightMaterials),
        fps: fpsText,
        dpr: dprText,
        drawCalls: formatCompactCount(stats.renderCalls, 0),
        triangles: formatCompactCount(stats.renderTriangles),
        faces: `${formatCompactCount(stats.estimatedFaces)} / ${formatCompactCount(stats.estimatedVertices)}`,
        loadedSummary: `${stats.visibleBundleCount}/${stats.bundleCount}`,
        loadedDetail: `${stats.visibleTileCount}/${stats.loadedTileCount} tiles · ${stats.visibleBundleCount}/${stats.bundleCount} bundles`,
        categories,
      },
    }));
  }

  return {
    applyPerformanceSettingsToViewer,
    populatePerformanceControls,
    setCategoryVisibility,
    showAllCategories() {
      setAllCategoryVisibility(true);
    },
    hideHeavyCategories() {
      setAllCategoryVisibility(false, (name) => HEAVY_PERFORMANCE_CATEGORIES.has(name));
    },
    syncPerformanceUi,
    dispose() {},
  };
}
