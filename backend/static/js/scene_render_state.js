import {compareTileIds, toDisplayTileId} from "/js/tile_model.js";

const LOAD_PROGRESS_RENDER_INTERVAL_MS = 250;

export function createSceneRenderStateController(context) {
  const {state, ui, viewerRef} = context;
  const getViewer = () => viewerRef.current;
  const entry = () => context.controllers.entry;
  const performancePanel = () => context.controllers.performance;
  const solver = () => context.controllers.solver;

  function syncEntryOverviewUi() {
    entry().syncEntryOverviewUi();
  }

  function syncPerformanceUi() {
    performancePanel().syncPerformanceUi();
  }

  function applyPerformanceSettingsToViewer() {
    performancePanel().applyPerformanceSettingsToViewer();
  }

  function syncNumericInputs() {
    solver().syncNumericInputs();
  }

  function syncViewerMarkers() {
    solver().syncViewerMarkers();
  }

  function renderLinkResult() {
    solver().renderLinkResult();
  }

  function renderRadiomapResult() {
    solver().renderRadiomapResult();
  }

  function hideEntryScreen() {
    entry().hideEntryScreen();
  }

  function focusEntryMapTiles(tileIds, paddingScale) {
    return entry().focusEntryMapTiles(tileIds, paddingScale);
  }

  async function ensureViewer() {
    if (getViewer().__ready) {
      return getViewer();
    }
    if (!viewerRef.modulePromise) {
      viewerRef.modulePromise = import("/js/viewer.js");
    }
    const {Viewer} = await viewerRef.modulePromise;
    const realViewer = new Viewer(document.getElementById("view"));
    realViewer.__ready = true;
    viewerRef.current = realViewer;
    applyPerformanceSettingsToViewer();
    syncViewerMarkers();
    syncSceneStats();
    syncTileListUi();
    syncPerformanceUi();
    return realViewer;
  }

function setProgress(percent, message, indeterminate = false) {
  const nextMessage = String(message ?? "");
  if (indeterminate || !Number.isFinite(percent)) {
    ui.progressBar.classList.add("indeterminate");
    if (ui.progressBar.style.width !== "38%") {
      ui.progressBar.style.width = "38%";
    }
  } else {
    const nextWidth = `${Math.max(0, Math.min(100, percent))}%`;
    ui.progressBar.classList.remove("indeterminate");
    if (ui.progressBar.style.width !== nextWidth) {
      ui.progressBar.style.width = nextWidth;
    }
  }
  if (ui.loadingPhase.textContent !== nextMessage) {
    ui.loadingPhase.textContent = nextMessage;
  }
}

function showOverlay({title = "Working", message = "Loading...", percent = 0, indeterminate = false} = {}) {
  state.pickTarget = null;
  state.deviceControl.activeTarget = null;
  ui.loadingTitle.textContent = title;
  setProgress(percent, message, indeterminate);
  ui.loadingScreen.style.display = "flex";
  syncModeUi();
  syncPerformanceUi();
}

function hideOverlay() {
  ui.loadingScreen.style.display = "none";
  ui.loadingTitle.textContent = "Loading Scene";
  ui.loadingPhase.textContent = "Initializing...";
  ui.progressBar.classList.remove("indeterminate");
  ui.progressBar.style.width = "0%";
  syncPerformanceUi();
}
function tileInputFor(tileId) {
  return ui.tileList.querySelector(`input[value="${tileId}"]`);
}

function setTileChecked(tileId, checked) {
  const input = tileInputFor(tileId);
  if (!input || input.disabled) {
    return;
  }
  input.checked = checked;
  syncTileListUi();
}

function toggleTileChecked(tileId) {
  const input = tileInputFor(tileId);
  if (!input || input.disabled) {
    return;
  }
  input.checked = !input.checked;
  syncTileListUi();
}
function syncControlSidebarUi() {
  const collapsed = state.panelCollapsed;
  const visible = ui.panel.style.display === "flex" && !state.entry.visible;
  ui.panel.classList.toggle("panelCollapsed", collapsed);
  ui.panelToggle.classList.toggle("panelCollapsed", collapsed);
  ui.panelToggle.classList.toggle("hidden", !visible);
  ui.panelToggle.textContent = collapsed ? "☰" : "‹";
  ui.panelToggle.setAttribute("aria-label", collapsed ? "Open control sidebar" : "Collapse control sidebar");
  ui.panelToggle.setAttribute("aria-expanded", String(!collapsed));
  ui.panel.inert = !visible || collapsed;
  ui.panel.setAttribute("aria-hidden", String(!visible || collapsed));
}
function syncModeUi() {
  const isLink = state.mode === "link";
  const sceneControlsVisible = getViewer().__ready
    && !state.entry.visible
    && ui.panel.style.display === "flex"
    && ui.loadingScreen.style.display === "none";
  if (!sceneControlsVisible) {
    state.pickTarget = null;
    state.deviceControl.activeTarget = null;
  }
  const activeTarget = state.deviceControl.activeTarget;
  const activeTargetAllowed = isLink
    ? activeTarget === "link-tx" || activeTarget === "link-rx"
    : activeTarget === "rm-tx";
  if (activeTarget && !activeTargetAllowed) {
    state.deviceControl.activeTarget = null;
    state.pickTarget = null;
  }
  const nextActiveTarget = state.deviceControl.activeTarget;
  ui.tabLink.classList.toggle("active", isLink);
  ui.tabRadiomap.classList.toggle("active", !isLink);
  ui.linkPanel.classList.toggle("hidden", !isLink);
  ui.radiomapPanel.classList.toggle("hidden", isLink);
  for (const node of ui.linkOnlyParams) {
    node.classList.toggle("hidden", !isLink);
  }
  for (const node of ui.radiomapOnlyParams) {
    node.classList.toggle("hidden", isLink);
  }
  ui.deviceDock.classList.toggle("hidden", !sceneControlsVisible);
  ui.deviceDock.setAttribute("aria-hidden", String(!sceneControlsVisible));
  ui.devicePrecisionPanel.classList.toggle("hidden", !sceneControlsVisible || !nextActiveTarget);
  ui.devicePrecisionPanel.setAttribute("aria-hidden", String(!sceneControlsVisible || !nextActiveTarget));
  ui.linkTxDeviceCard.classList.toggle("hidden", nextActiveTarget !== "link-tx");
  ui.linkRxDeviceCard.classList.toggle("hidden", nextActiveTarget !== "link-rx");
  ui.rmTxDeviceCard.classList.toggle("hidden", nextActiveTarget !== "rm-tx");
  ui.btnPickLinkTx.classList.toggle("hidden", !isLink);
  ui.btnPickLinkRx.classList.toggle("hidden", !isLink);
  ui.btnPickRmTx.classList.toggle("hidden", isLink);
  ui.btnSolveLink.classList.toggle("hidden", !isLink);
  ui.btnRunRadiomap.classList.toggle("hidden", isLink);
  ui.btnPickLinkTx.classList.toggle("active", nextActiveTarget === "link-tx");
  ui.btnPickLinkRx.classList.toggle("active", nextActiveTarget === "link-rx");
  ui.btnPickRmTx.classList.toggle("active", nextActiveTarget === "rm-tx");
  ui.btnPickLinkTx.classList.toggle("picking", state.pickTarget === "link-tx");
  ui.btnPickLinkRx.classList.toggle("picking", state.pickTarget === "link-rx");
  ui.btnPickRmTx.classList.toggle("picking", state.pickTarget === "rm-tx");
  ui.devicePrecisionTitle.textContent = nextActiveTarget === "link-rx"
    ? "Rx Control"
    : nextActiveTarget === "rm-tx"
      ? "Radio Map Tx"
      : "Tx Control";
  ui.stMode.textContent = isLink ? "Link" : "Radio Map";
}
function syncSceneStats() {
  ui.stSceneMeshes.textContent = state.manifest ? String(state.manifest.mesh_count) : "--";
  ui.stLoadedMeshes.textContent = String(getViewer().meshesLoaded);
  ui.stLoadedTiles.textContent = String(getViewer().loadedTileIds.size);
}
function renderAll() {
  syncModeUi();
  syncControlSidebarUi();
  syncViewerMarkers();
  syncNumericInputs();
  syncSceneStats();
  syncTileListUi();
  syncEntryOverviewUi();
  syncPerformanceUi();
  renderLinkResult();
  renderRadiomapResult();
}

function tileSelections() {
  return [...ui.tileList.querySelectorAll('input[type="checkbox"]:checked')].map((node) => node.value);
}

function tileDiff() {
  const selected = new Set(tileSelections());
  const loaded = new Set(getViewer().loadedTileIds);
  const toAdd = [...selected].filter((tileId) => !loaded.has(tileId));
  const toRemove = [...loaded].filter((tileId) => !selected.has(tileId));
  return {selected, loaded, toAdd, toRemove};
}

function updateTileSummary() {
  const {selected, loaded, toAdd, toRemove} = tileDiff();
  const pending = toAdd.length + toRemove.length;

  if (state.tileLoadBusy) {
    ui.tileSummary.textContent = "Syncing bundle changes...";
    return;
  }

  if (!selected.size && !loaded.size) {
    ui.tileSummary.textContent = "No tiles loaded yet. Choose tiles on the map to enter the 3D scene.";
    return;
  }

  if (!pending) {
    ui.tileSummary.textContent = `${loaded.size} loaded · ${selected.size} selected · 0 pending`;
    return;
  }

  const segments = [];
  if (toAdd.length) {
    segments.push(`${toAdd.length} to load`);
  }
  if (toRemove.length) {
    segments.push(`${toRemove.length} to unload`);
  }
  ui.tileSummary.textContent = `${loaded.size} loaded · ${selected.size} selected · ${pending} pending (${segments.join(" / ")})`;
}

function syncTileListUi() {
  const diff = tileDiff();
  const tileItems = ui.tileList.querySelectorAll(".tileItem");
  for (const item of tileItems) {
    const tileId = item.dataset.tileId;
    const checkbox = item.querySelector('input[type="checkbox"]');
    const badge = item.querySelector(".tileStatus");
    const selected = checkbox.checked;
    const loaded = diff.loaded.has(tileId);
    const pendingAdd = selected && !loaded;
    const pendingRemove = !selected && loaded;

    item.classList.toggle("selected", selected);
    item.classList.toggle("loaded", loaded);
    item.classList.toggle("pendingAdd", pendingAdd);
    item.classList.toggle("pendingRemove", pendingRemove);

    if (pendingAdd) {
      badge.textContent = "Load";
      badge.className = "tileStatus pendingAdd";
    } else if (pendingRemove) {
      badge.textContent = "Unload";
      badge.className = "tileStatus pendingRemove";
    } else if (loaded) {
      badge.textContent = "Loaded";
      badge.className = "tileStatus loaded";
    } else if (selected) {
      badge.textContent = "Ready";
      badge.className = "tileStatus";
    } else {
      badge.textContent = "Idle";
      badge.className = "tileStatus";
    }
  }

  updateTileSummary();
  const disableControls = state.tileLoadBusy;
  ui.tileList.querySelectorAll('input[type="checkbox"]').forEach((input) => {
    input.disabled = disableControls;
  });
  syncEntryOverviewUi();
}

function populateTileList(manifest) {
  ui.tileList.innerHTML = "";
  const sortedTiles = [...manifest.tiles].sort((left, right) => compareTileIds(left.id, right.id));
  for (const tile of sortedTiles) {
    const wrapper = document.createElement("label");
    wrapper.className = "tileItem";
    wrapper.dataset.tileId = tile.id;

    const input = document.createElement("input");
    input.type = "checkbox";
    input.value = tile.id;
    input.checked = false;
    input.addEventListener("change", () => syncTileListUi());

    const meta = document.createElement("div");
    meta.className = "tileMeta";
    const title = document.createElement("b");
    title.textContent = toDisplayTileId(tile.id);
    const detail = document.createElement("span");
    detail.textContent = `${tile.mesh_count.toLocaleString()} meshes - ${tile.bundle_count} bundles`;
    const row = document.createElement("div");
    row.className = "tileRow";
    const badge = document.createElement("span");
    badge.className = "tileStatus";
    badge.textContent = "Ready";
    row.append(title, badge);
    meta.append(row, detail);

    wrapper.append(input, meta);
    ui.tileList.appendChild(wrapper);
  }
  syncTileListUi();
}

function setTileSelection(nextTileIds) {
  const selected = new Set(nextTileIds);
  ui.tileList.querySelectorAll('input[type="checkbox"]').forEach((input) => {
    input.checked = selected.has(input.value);
  });
  syncTileListUi();
}

function resetSelectionToLoadedTiles() {
  setTileSelection([...getViewer().loadedTileIds]);
}

function formatBytes(bytes, digits = 1) {
  const value = Number(bytes);
  if (!Number.isFinite(value) || value <= 0) {
    return "0 MB";
  }
  return `${(value / (1024 * 1024)).toFixed(digits)} MB`;
}

function formatByteRate(bytesPerSecond) {
  const value = Number(bytesPerSecond);
  if (!Number.isFinite(value) || value <= 0) {
    return "-- MB/s";
  }
  return `${(value / (1024 * 1024)).toFixed(1)} MB/s`;
}

function formatDuration(ms) {
  const value = Number(ms);
  if (!Number.isFinite(value) || value <= 0) {
    return "0.0s";
  }
  return `${(value / 1000).toFixed(1)}s`;
}

function bundleDisplayName(bundle) {
  if (!bundle) {
    return "bundle";
  }
  return `${bundle.tile} / ${bundle.category}`;
}

function bundleSizeLabel(bundle) {
  const size = Number(bundle?.compressed_cache_exists ? bundle.compressed_size_bytes : bundle?.size_bytes);
  return Number.isFinite(size) && size > 0 ? formatBytes(size) : "unknown size";
}

function loadProgressPercent(event) {
  const bytePercent = event.totalBytes > 0 && !event.hasUnknownBytes
    ? Math.min(100, (event.downloadedBytes / event.totalBytes) * 100)
    : null;
  const countPercent = event.total > 0 ? (event.completed / event.total) * 100 : 100;
  if (bytePercent !== null && Number.isFinite(bytePercent)) {
    return Math.max(countPercent, bytePercent);
  }
  return countPercent;
}

function compressionSummary(event) {
  const originalTotalBytes = Number(event.originalTotalBytes);
  const totalBytes = Number(event.totalBytes);
  if (!event.hasCompressedBundles || !Number.isFinite(originalTotalBytes) || !Number.isFinite(totalBytes)) {
    return "";
  }
  if (originalTotalBytes <= totalBytes) {
    return "";
  }
  return ` (${formatBytes(originalTotalBytes)} raw)`;
}

function loadProgressMessage(event) {
  if (event.phase === "idle") {
    return "Tile bundles already in sync";
  }
  if (event.phase === "start") {
    const totalSize = event.totalBytes > 0
      ? `${formatBytes(event.totalBytes)} transfer${compressionSummary(event)}${event.hasUnknownBytes ? " + unknown" : ""}`
      : "unknown size";
    return `Applying ${event.total} bundle changes · ${event.added || 0} downloads · ${totalSize}`;
  }
  if (event.phase === "removing") {
    return `Removing ${bundleDisplayName(event.bundle)} · ${event.completed}/${event.total}`;
  }

  const activeBundles = Array.isArray(event.activeBundles) ? event.activeBundles : [];
  const activeCount = activeBundles.filter((item) => item.phase !== "ready").length;
  const bundleTotal = event.added || 0;
  const visibleBundleCount = Math.min(bundleTotal, (event.completedDownloads || 0) + activeCount);
  const totalSize = event.totalBytes > 0
    ? `${formatBytes(event.downloadedBytes)} / ${formatBytes(event.totalBytes)} transfer${compressionSummary(event)}${event.hasUnknownBytes ? " + unknown" : ""}`
    : `${formatBytes(event.downloadedBytes)} / unknown`;
  const rate = formatByteRate(event.speedBytesPerSec);
  return `Loading ${visibleBundleCount}/${bundleTotal} bundles · ${totalSize} · ${rate}`;
}

function createLoadProgressRenderer() {
  let lastRenderAt = 0;
  let lastPercent = 0;
  let lastMessage = "";
  let pendingEvent = null;
  let timerId = null;

  const render = (event, force = false) => {
    pendingEvent = event;
    const now = window.performance.now();
    if (!force && now - lastRenderAt < LOAD_PROGRESS_RENDER_INTERVAL_MS) {
      if (timerId === null) {
        timerId = window.setTimeout(() => {
          timerId = null;
          if (pendingEvent) {
            render(pendingEvent, true);
          }
        }, LOAD_PROGRESS_RENDER_INTERVAL_MS - (now - lastRenderAt));
      }
      return;
    }

    if (timerId !== null) {
      window.clearTimeout(timerId);
      timerId = null;
    }
    pendingEvent = null;

    const nextPercent = Math.max(lastPercent, loadProgressPercent(event));
    const nextMessage = loadProgressMessage(event);
    if (force || nextMessage !== lastMessage || Math.abs(nextPercent - lastPercent) >= 0.05) {
      setProgress(nextPercent, nextMessage);
      lastPercent = nextPercent;
      lastMessage = nextMessage;
      lastRenderAt = now;
    }
  };

  return {
    update(event) {
      const force = event.phase === "idle"
        || event.phase === "start"
        || event.phase === "removing"
        || event.force === true;
      render(event, force);
    },
    flush() {
      if (timerId !== null) {
        window.clearTimeout(timerId);
        timerId = null;
      }
      if (pendingEvent) {
        render(pendingEvent, true);
      }
    },
  };
}

async function enterScene() {
  const selectedTileIds = tileSelections();
  if (!selectedTileIds.length) {
    return;
  }
  showOverlay({title: "Preparing 3D Scene", message: "Initializing viewer...", indeterminate: true});
  await ensureViewer();
  await loadScene();
  state.entry.sceneReady = true;
  state.mode = "link";
  state.pickTarget = null;
  ui.panel.style.display = "flex";
  state.panelCollapsed = false;
  syncControlSidebarUi();
  hideEntryScreen();
  getViewer().focusOnTiles(selectedTileIds);
  renderAll();
}

async function loadScene() {
  if (!state.manifest) {
    return;
  }
  await ensureViewer();
  const diff = tileDiff();
  if (!diff.toAdd.length && !diff.toRemove.length) {
    syncSceneStats();
    syncTileListUi();
    showOverlay({title: "Loading Scene", message: "Tile bundles already in sync", percent: 100});
    await new Promise((resolve) => window.setTimeout(resolve, 160));
    hideOverlay();
    syncPerformanceUi();
    return;
  }

  const selectedTiles = diff.selected;
  const bundles = state.manifest.bundles.filter((bundle) => selectedTiles.has(bundle.tile));
  state.tileLoadBusy = true;
  if (diff.toAdd.length || diff.toRemove.length) {
    state.link.result = null;
    state.link.selectedPath = -1;
    state.radiomap.jobId = null;
    state.radiomap.result = null;
    state.radiomap.status = "Idle";
    getViewer().clearOverlay();
  }
  syncTileListUi();
  showOverlay({title: "Loading Scene", message: "Syncing tile bundles...", percent: 0});
  const loadProgressRenderer = createLoadProgressRenderer();

  try {
    await getViewer().syncBundles(bundles, (event) => {
      loadProgressRenderer.update(event);
    });
    loadProgressRenderer.flush();

    syncViewerMarkers();
    getViewer().focusOnTiles([...selectedTiles]);
  } finally {
    loadProgressRenderer.flush();
    state.tileLoadBusy = false;
    hideOverlay();
    syncSceneStats();
    syncTileListUi();
    syncPerformanceUi();
  }
}

  return {
    setProgress,
    showOverlay,
    hideOverlay,
    ensureViewer,
    syncControlSidebarUi,
    syncModeUi,
    syncSceneStats,
    renderAll,
    tileSelections,
    tileDiff,
    syncTileListUi,
    populateTileList,
    setTileSelection,
    resetSelectionToLoadedTiles,
    setTileChecked,
    toggleTileChecked,
    enterScene,
    loadScene,
  };
}
