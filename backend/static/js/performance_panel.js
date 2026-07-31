const HEAVY_PERFORMANCE_CATEGORIES = new Set(["VEGETATION_TB", "GENERIC"]);

function formatBytes(bytes, digits = 1) {
  const value = Number(bytes);
  if (!Number.isFinite(value) || value <= 0) {
    return "0 MB";
  }
  return `${(value / (1024 * 1024)).toFixed(digits)} MB`;
}

export function createPerformancePanelController(context) {
  const {state, ui, viewerRef} = context;
  const shellUi = context.featureServices.shellUi;
  const getViewer = () => viewerRef.current;
  let analysisDockReserveObserver = null;

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
  return `${category.tiles} tiles · ${category.bundles} bundles · ${formatBytes(category.bytes)}`;
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

function syncCategoryVisibilityUi() {
  const loadedStats = new Map(getViewer().getLoadedCategoryStats().map((item) => [item.category, item]));
  shellUi.updatePerformanceCategories(state.performance.categories.map((category) => {
    const visible = performanceCategoryVisible(category.name);
    const loaded = loadedStats.get(category.name);
    let stats = categoryManifestFallback(category);
    if (loaded && loaded.bundles > 0) {
      const faces = visible ? loaded.visibleFaces : loaded.faces;
      const vertices = visible ? loaded.visibleVertices : loaded.vertices;
      stats = `${formatCompactCount(faces)} faces · ${formatCompactCount(vertices)} vertices · ${loaded.visibleBundles}/${loaded.bundles} bundles`;
    }
    return {name: category.name, stats, visible};
  }));
}

function syncPerformanceHud() {
  const stats = getViewer().getPerformanceStats();
  const fpsText = stats.fps > 0 ? stats.fps.toFixed(0) : "--";
  const dprText = Number.isFinite(stats.dpr) ? stats.dpr.toFixed(2) : "--";
  const loadedText = `${stats.visibleTileCount}/${stats.loadedTileCount} tiles · ${stats.visibleBundleCount}/${stats.bundleCount} bundles`;
  ui.perfFps.textContent = fpsText;
  ui.perfDpr.textContent = dprText;
  ui.perfDrawCalls.textContent = formatCompactCount(stats.renderCalls, 0);
  ui.perfTriangles.textContent = formatCompactCount(stats.renderTriangles);
  ui.perfFaces.textContent = `${formatCompactCount(stats.estimatedFaces)} / ${formatCompactCount(stats.estimatedVertices)}`;
  ui.perfLoaded.textContent = loadedText;
  ui.perfSummaryFps.textContent = fpsText;
  ui.perfSummaryDpr.textContent = dprText;
  ui.perfSummaryLoaded.textContent = `${stats.visibleBundleCount}/${stats.bundleCount}`;
}

function performanceDockVisible() {
  return getViewer().__ready
    && !state.entry.visible
    && ui.panel.style.display === "flex"
    && ui.loadingScreen.style.display === "none";
}

  function quickBarBottomPx() {
    const raw = getComputedStyle(document.documentElement).getPropertyValue("--quick-bar-bottom");
    const value = Number.parseFloat(raw);
    return Number.isFinite(value) ? value : 16;
  }

  function bottomReserveForElement(element, gapPx = 18) {
    if (!element || element.classList.contains("hidden")) {
      return 0;
    }
    const rect = element.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
      return 0;
    }
    return Math.ceil(Math.max(0, window.innerHeight - rect.top) + gapPx);
  }

  function syncAnalysisDockReserve(dockVisible = performanceDockVisible()) {
    if (!dockVisible) {
      document.documentElement.style.setProperty("--analysis-dock-bottom-reserve", "18px");
      return;
    }
    const quickBarHeight = ui.sceneQuickBar.getBoundingClientRect().height || 44;
    const fallbackReserve = Math.ceil(quickBarHeight + quickBarBottomPx() + 24);
    const reserve = Math.max(
      96,
      fallbackReserve,
      bottomReserveForElement(ui.sceneQuickBar),
      bottomReserveForElement(ui.deviceDock),
    );
    document.documentElement.style.setProperty("--analysis-dock-bottom-reserve", `${reserve}px`);
  }

function ensureAnalysisDockReserveObserver() {
  if (analysisDockReserveObserver || typeof ResizeObserver !== "function") {
    return;
  }
  analysisDockReserveObserver = new ResizeObserver(() => {
    syncAnalysisDockReserve(performanceDockVisible());
  });
  analysisDockReserveObserver.observe(ui.sceneQuickBar);
  analysisDockReserveObserver.observe(ui.performanceDock);
  analysisDockReserveObserver.observe(ui.deviceDock);
}

function syncPerformanceUi() {
  const dockVisible = performanceDockVisible();
  ui.sceneQuickBar.classList.toggle("hidden", !dockVisible);
  ui.sceneQuickBar.setAttribute("aria-hidden", String(!dockVisible));
  ui.performanceDock.classList.toggle("hidden", !dockVisible);
  ui.performanceDock.classList.toggle("collapsed", !state.performance.dockExpanded);
  ui.performanceDock.setAttribute("aria-hidden", String(!dockVisible));
  ui.btnPerformanceDockToggle.setAttribute("aria-expanded", String(state.performance.dockExpanded));
  ui.btnPerformanceDockToggle.setAttribute(
    "aria-label",
    state.performance.dockExpanded ? "Collapse performance panel" : "Expand performance panel",
  );
  for (const button of ui.perfModeButtons) {
    button.classList.toggle("active", button.dataset.performanceMode === state.performance.mode);
  }
  ensureAnalysisDockReserveObserver();
  syncAnalysisDockReserve(dockVisible);
  requestAnimationFrame(() => syncAnalysisDockReserve(performanceDockVisible()));
  ui.perfLightMaterials.checked = state.performance.lightweightMaterials;
  syncCategoryVisibilityUi();
  syncPerformanceHud();
}

  function showAllCategories() {
    setAllCategoryVisibility(true);
  }

  function hideHeavyCategories() {
    setAllCategoryVisibility(false, (categoryName) => HEAVY_PERFORMANCE_CATEGORIES.has(categoryName));
  }

  return {
    applyPerformanceSettingsToViewer,
    setCategoryVisibility,
    populatePerformanceControls,
    syncPerformanceUi,
    showAllCategories,
    hideHeavyCategories,
    dispose() {
      analysisDockReserveObserver?.disconnect();
      analysisDockReserveObserver = null;
    },
  };
}
