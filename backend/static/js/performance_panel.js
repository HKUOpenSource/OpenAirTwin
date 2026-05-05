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
  ui.categoryVisibility.replaceChildren();

  for (const category of state.performance.categories) {
    if (!state.performance.categoryVisibility.has(category.name)) {
      state.performance.categoryVisibility.set(category.name, true);
    }

    const row = document.createElement("label");
    row.className = "categoryItem";
    row.dataset.category = category.name;

    const input = document.createElement("input");
    input.type = "checkbox";
    input.checked = performanceCategoryVisible(category.name);
    input.addEventListener("change", () => setCategoryVisibility(category.name, input.checked));

    const meta = document.createElement("span");
    const name = document.createElement("span");
    name.className = "categoryName";
    name.textContent = category.name;
    const stats = document.createElement("span");
    stats.className = "categoryStats";
    stats.dataset.categoryStats = category.name;
    stats.textContent = categoryManifestFallback(category);
    meta.append(name, stats);

    row.append(input, meta);
    ui.categoryVisibility.appendChild(row);
  }
  syncPerformanceUi();
}

function syncCategoryVisibilityUi() {
  const loadedStats = new Map(getViewer().getLoadedCategoryStats().map((item) => [item.category, item]));
  for (const category of state.performance.categories) {
    const visible = performanceCategoryVisible(category.name);
    const row = [...ui.categoryVisibility.querySelectorAll(".categoryItem")]
      .find((item) => item.dataset.category === category.name);
    const input = row?.querySelector('input[type="checkbox"]');
    const statsNode = row?.querySelector(".categoryStats");
    if (row) {
      row.classList.toggle("hiddenCategory", !visible);
    }
    if (input) {
      input.checked = visible;
    }
    if (!statsNode) {
      continue;
    }

    const loaded = loadedStats.get(category.name);
    if (loaded && loaded.bundles > 0) {
      const faces = visible ? loaded.visibleFaces : loaded.faces;
      const vertices = visible ? loaded.visibleVertices : loaded.vertices;
      statsNode.textContent = `${formatCompactCount(faces)} faces · ${formatCompactCount(vertices)} vertices · ${loaded.visibleBundles}/${loaded.bundles} bundles`;
    } else {
      statsNode.textContent = categoryManifestFallback(category);
    }
  }
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
    populatePerformanceControls,
    syncPerformanceUi,
    showAllCategories,
    hideHeavyCategories,
  };
}
