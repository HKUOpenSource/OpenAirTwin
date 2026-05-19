import {compareTileIds, toDisplayTileId} from "/js/tile_model.js";

const LOAD_PROGRESS_RENDER_INTERVAL_MS = 250;
let overlayCancelHandler = null;

export function createSceneRenderStateController(context) {
  const {api, state, ui, viewerRef} = context;
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

  function syncResultDockUi() {
    const expanded = Boolean(state.resultDock.expanded);
    ui.linkChannelSection.classList.toggle("collapsed", !expanded);
    ui.btnResultDockToggle.setAttribute("aria-expanded", String(expanded));
    ui.btnResultDockToggle.setAttribute(
      "aria-label",
      expanded ? "Collapse results panel" : "Expand results panel",
    );
    ui.channelAnalysisScroll.setAttribute("aria-hidden", String(!expanded));
    ui.channelAnalysisScroll.inert = !expanded;
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

  function renderDeepMimoState() {
    solver().renderDeepMimoState();
  }

  function renderMobilityResult() {
    solver().renderMobilityResult();
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

function clearOverlayCancel() {
  if (overlayCancelHandler && ui.btnLoadingCancel) {
    ui.btnLoadingCancel.removeEventListener("click", overlayCancelHandler);
  }
  overlayCancelHandler = null;
  if (ui.btnLoadingCancel) {
    ui.btnLoadingCancel.classList.add("hidden");
    ui.btnLoadingCancel.disabled = false;
    ui.btnLoadingCancel.textContent = "Cancel";
  }
}

function showOverlay({
  title = "Working",
  message = "Loading...",
  percent = 0,
  indeterminate = false,
  cancelLabel = "",
  onCancel = null,
} = {}) {
  state.pickTarget = null;
  state.deviceControl.activeTarget = null;
  clearOverlayCancel();
  ui.loadingTitle.textContent = title;
  setProgress(percent, message, indeterminate);
  if (onCancel && ui.btnLoadingCancel) {
    ui.btnLoadingCancel.textContent = cancelLabel || "Cancel";
    ui.btnLoadingCancel.classList.remove("hidden");
    overlayCancelHandler = onCancel;
    ui.btnLoadingCancel.addEventListener("click", overlayCancelHandler);
  }
  ui.loadingScreen.style.display = "flex";
  syncModeUi();
  syncPerformanceUi();
}

function hideOverlay() {
  clearOverlayCancel();
  ui.loadingScreen.style.display = "none";
  ui.loadingTitle.textContent = "Loading Scene";
  ui.loadingPhase.textContent = "Initializing...";
  ui.progressBar.classList.remove("indeterminate");
  ui.progressBar.style.width = "0%";
  syncModeUi();
  syncControlSidebarUi();
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
  const isMobility = state.mode === "mobility";
  const isDeepMimo = state.mode === "deepmimo";
  const isLinkLike = isLink || isMobility;
  const sceneControlsVisible = getViewer().__ready
    && !state.entry.visible
    && ui.panel.style.display === "flex"
    && ui.loadingScreen.style.display === "none";
  if (!sceneControlsVisible) {
    state.pickTarget = null;
    state.deviceControl.activeTarget = null;
  }
  const activeTarget = state.deviceControl.activeTarget;
  const activeTargetAllowed = isLinkLike
    ? activeTarget === "link-tx" || activeTarget === "link-rx"
    : isDeepMimo
      ? activeTarget === "deepmimo-tx" || activeTarget === "deepmimo-roi"
      : activeTarget === "rm-tx";
  if (activeTarget && !activeTargetAllowed) {
    state.deviceControl.activeTarget = null;
    state.pickTarget = null;
  }
  const nextActiveTarget = state.deviceControl.activeTarget;
  ui.tabLink.classList.toggle("active", isLink);
  ui.tabMobility.classList.toggle("active", isMobility);
  ui.tabRadiomap.classList.toggle("active", state.mode === "radiomap");
  ui.tabDeepMimo.classList.toggle("active", isDeepMimo);
  ui.linkPanel.classList.toggle("hidden", !isLink);
  ui.mobilityPanel.classList.toggle("hidden", !isMobility);
  ui.radiomapPanel.classList.toggle("hidden", state.mode !== "radiomap");
  ui.deepmimoPanel.classList.toggle("hidden", !isDeepMimo);
  for (const node of ui.linkOnlyParams) {
    node.classList.toggle("hidden", !isLinkLike);
  }
  for (const node of ui.mobilityOnlyParams) {
    node.classList.toggle("hidden", !isMobility);
  }
  for (const node of ui.radiomapOnlyParams) {
    node.classList.toggle("hidden", state.mode !== "radiomap");
  }
  for (const node of ui.deepmimoOnlyParams) {
    node.classList.toggle("hidden", !isDeepMimo);
  }
  for (const node of ui.livePreviewParams) {
    node.classList.toggle("hidden", !isLink);
  }
  for (const node of ui.livePreviewLinkParams) {
    node.classList.toggle("hidden", !isLink);
  }
  ui.deviceDock.classList.toggle("hidden", !sceneControlsVisible);
  ui.deviceDock.setAttribute("aria-hidden", String(!sceneControlsVisible));
  ui.devicePrecisionPanel.classList.toggle("hidden", !sceneControlsVisible || !nextActiveTarget);
  ui.devicePrecisionPanel.setAttribute("aria-hidden", String(!sceneControlsVisible || !nextActiveTarget));
  ui.linkTxDeviceCard.classList.toggle("hidden", nextActiveTarget !== "link-tx");
  ui.linkRxDeviceCard.classList.toggle("hidden", nextActiveTarget !== "link-rx");
  ui.rmTxDeviceCard.classList.toggle("hidden", nextActiveTarget !== "rm-tx");
  ui.deepMimoTxDeviceCard.classList.toggle("hidden", nextActiveTarget !== "deepmimo-tx");
  ui.linkSurfaceClearanceField.classList.toggle("hidden", !(nextActiveTarget === "link-tx" || nextActiveTarget === "link-rx" || nextActiveTarget === "rm-tx" || nextActiveTarget === "deepmimo-tx"));
  ui.btnPickLinkTx.classList.toggle("hidden", !isLinkLike);
  ui.btnPickLinkRx.classList.toggle("hidden", !isLinkLike);
  ui.btnPickRmTx.classList.toggle("hidden", state.mode !== "radiomap");
  ui.btnDeepMimoPickTx.classList.toggle("hidden", !isDeepMimo);
  ui.btnDeepMimoPickRoi.classList.toggle("hidden", !isDeepMimo);
  ui.btnDeepMimoClearRoi.classList.toggle("hidden", !isDeepMimo);
  ui.btnSolveLink.classList.toggle("hidden", !isLink);
  ui.btnRunMobility.classList.toggle("hidden", !isMobility);
  ui.btnRunRadiomap.classList.toggle("hidden", state.mode !== "radiomap");
  ui.btnRunDeepMimo.classList.toggle("hidden", !isDeepMimo);
  for (const button of [ui.btnSolveLink, ui.btnRunMobility, ui.btnRunRadiomap]) {
    if (state.tileLoadBusy) {
      button.disabled = true;
    } else if (button.getAttribute("aria-busy") !== "true") {
      button.disabled = false;
    }
  }
  const orbitingTx = getViewer().isTxOrbiting();
  ui.btnOrbitTx.classList.toggle("active", orbitingTx);
  ui.btnOrbitTx.setAttribute("aria-pressed", String(orbitingTx));
  ui.btnOrbitTx.setAttribute("aria-label", orbitingTx ? "Stop transmitter orbit" : "Orbit around transmitter");
  ui.btnOrbitTx.querySelector(".deviceActionText").textContent = orbitingTx ? "Stop" : "Orbit";
  ui.btnPickLinkTx.classList.toggle("active", nextActiveTarget === "link-tx");
  ui.btnPickLinkRx.classList.toggle("active", nextActiveTarget === "link-rx");
  ui.btnPickRmTx.classList.toggle("active", nextActiveTarget === "rm-tx");
  ui.btnDeepMimoPickTx.classList.toggle("active", nextActiveTarget === "deepmimo-tx");
  ui.btnDeepMimoPickRoi.classList.toggle("active", nextActiveTarget === "deepmimo-roi");
  ui.btnPickLinkTx.classList.toggle("picking", state.pickTarget === "link-tx");
  ui.btnPickLinkRx.classList.toggle("picking", state.pickTarget === "link-rx");
  ui.btnPickRmTx.classList.toggle("picking", state.pickTarget === "rm-tx");
  ui.btnDeepMimoPickTx.classList.toggle("picking", state.pickTarget === "deepmimo-tx");
  ui.btnDeepMimoPickRoi.classList.toggle("picking", state.pickTarget === "deepmimo-roi");
  ui.devicePrecisionTitle.textContent = nextActiveTarget === "link-rx"
    ? "Rx"
    : nextActiveTarget === "deepmimo-tx"
      ? "DM Tx"
    : nextActiveTarget === "deepmimo-roi"
      ? "ROI"
    : nextActiveTarget === "rm-tx"
      ? "RM Tx"
      : "Tx";
  ui.stMode.textContent = isLink ? "Link" : isMobility ? "Mobility" : isDeepMimo ? "DeepMIMO" : "Radio Map";
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
  syncResultDockUi();
  renderLinkResult();
  renderMobilityResult();
  renderRadiomapResult();
  renderDeepMimoState();
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

async function waitForRtSceneSelection(generation) {
  while (true) {
    const status = await api.getRtSceneSelection();
    if (status.generation === generation && status.status === "ready") {
      return status;
    }
    if (status.generation === generation && status.status === "failed") {
      throw new Error(status.message || "Sionna RT scene failed to load");
    }
    showOverlay({
      title: "Loading Scene",
      message: status.message || "Load scene...",
      indeterminate: true,
    });
    await new Promise((resolve) => window.setTimeout(resolve, 1200));
  }
}

async function syncRtSceneSelection(selectedTileIds) {
  const tileIds = [...selectedTileIds].sort(compareTileIds);
  showOverlay({
    title: "Loading Scene",
    message: "Load scene...",
    indeterminate: true,
  });
  const status = await api.setRtSceneSelection(tileIds);
  if (status.status === "ready") {
    return status;
  }
  if (status.status === "failed") {
    throw new Error(status.message || "Sionna RT scene failed to load");
  }
  if (status.status === "empty") {
    return status;
  }
  return waitForRtSceneSelection(status.generation);
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
  const selectedTiles = diff.selected;
  const bundles = state.manifest.bundles.filter((bundle) => selectedTiles.has(bundle.tile));
  state.tileLoadBusy = true;
  if (diff.toAdd.length || diff.toRemove.length) {
    state.link.result = null;
    state.link.selectedPath = -1;
    state.mobility.jobId = null;
    state.mobility.result = null;
    state.mobility.status = "Idle";
    state.radiomap.jobId = null;
    state.radiomap.result = null;
    state.radiomap.status = "Idle";
    getViewer().clearOverlay();
  }
  syncTileListUi();

  try {
    if (!diff.toAdd.length && !diff.toRemove.length) {
      syncSceneStats();
      syncTileListUi();
      showOverlay({title: "Loading Scene", message: "Tile bundles already in sync", percent: 100});
      await new Promise((resolve) => window.setTimeout(resolve, 160));
    } else {
      showOverlay({title: "Loading Scene", message: "Syncing tile bundles...", percent: 0});
      const loadProgressRenderer = createLoadProgressRenderer();

      try {
        await getViewer().syncBundles(bundles, (event) => {
          loadProgressRenderer.update(event);
        });
        loadProgressRenderer.flush();
      } finally {
        loadProgressRenderer.flush();
      }
    }

    await syncRtSceneSelection(selectedTiles);
    syncViewerMarkers();
    getViewer().focusOnTiles([...selectedTiles]);
  } finally {
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
    syncResultDockUi,
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
