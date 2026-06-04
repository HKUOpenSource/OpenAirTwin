import {compareTileIds} from "/js/tile_model.js?v=20260519-mode-isolation";

const LOAD_PROGRESS_RENDER_INTERVAL_MS = 250;

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

function bundleDisplayName(bundle) {
  if (!bundle) {
    return "bundle";
  }
  return `${bundle.tile} / ${bundle.category}`;
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

function resolvingSizeSummary(event) {
  return event.hasUnknownBytes ? " · resolving sizes" : "";
}

function loadProgressMessage(event) {
  if (event.phase === "idle") {
    return "Tile bundles already in sync";
  }
  if (event.phase === "start") {
    const totalSize = event.totalBytes > 0
      ? `${formatBytes(event.totalBytes)} transfer${compressionSummary(event)}${resolvingSizeSummary(event)}`
      : `resolving sizes`;
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
    ? `${formatBytes(event.downloadedBytes)} / ${formatBytes(event.totalBytes)}${compressionSummary(event)}${resolvingSizeSummary(event)}`
    : `${formatBytes(event.downloadedBytes)} downloaded${resolvingSizeSummary(event)}`;
  const rate = formatByteRate(event.speedBytesPerSec);
  return `Loading ${visibleBundleCount}/${bundleTotal} bundles · ${totalSize} · ${rate}`;
}

function createLoadProgressRenderer({setProgress}) {
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

function sameTileIds(left, right) {
  const leftValues = [...(left || [])].sort(compareTileIds);
  const rightValues = [...(right || [])].sort(compareTileIds);
  return leftValues.length === rightValues.length
    && leftValues.every((value, index) => value === rightValues[index]);
}

function rtSceneReadyForSelection(status, tileIds) {
  return status.status === "ready" && sameTileIds(status.active_tile_ids || [], tileIds);
}

export function createSceneLoaderController(context, {
  ensureViewer,
  getViewer,
  hideEntryScreen,
  hideOverlay,
  renderAll,
  setProgress,
  showOverlay,
  solver,
  syncControlSidebarUi,
  syncPerformanceUi,
  syncTileListUi,
  syncViewerMarkers,
  tileSelectionView,
}) {
  const {api, state, ui} = context;

  async function waitForRtSceneSelection(generation, tileIds) {
    while (true) {
      const status = await api.getRtSceneSelection();
      if (status.generation === generation && rtSceneReadyForSelection(status, tileIds)) {
        return status;
      }
      if (status.generation === generation && status.status === "failed") {
        throw new Error(status.message || "Sionna RT scene failed to load");
      }
      if (Number(status.generation) > Number(generation)) {
        if (rtSceneReadyForSelection(status, tileIds)) {
          return status;
        }
        throw new Error("Sionna RT scene selection changed before this load completed");
      }
      showOverlay({
        title: "Loading Scene",
        message: status.message || "Load scene...",
        indeterminate: true,
        force: true,
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
      force: true,
    });
    const status = await api.setRtSceneSelection(tileIds);
    if (status.status === "ready") {
      if (!rtSceneReadyForSelection(status, tileIds)) {
        throw new Error("Sionna RT scene selection changed before this load completed");
      }
      return status;
    }
    if (status.status === "failed") {
      throw new Error(status.message || "Sionna RT scene failed to load");
    }
    if (status.status === "empty") {
      return status;
    }
    return waitForRtSceneSelection(status.generation, tileIds);
  }

  async function enterScene() {
    if (state.tileLoadBusy) {
      return;
    }
    const selectedTileIds = tileSelectionView.tileSelections();
    if (!selectedTileIds.length) {
      return;
    }
    state.tileLoadBusy = true;
    syncTileListUi();
    showOverlay({title: "Preparing 3D Scene", message: "Initializing viewer...", indeterminate: true, force: true});
    try {
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
    } finally {
      if (state.tileLoadBusy) {
        state.tileLoadBusy = false;
        syncTileListUi();
      }
    }
  }

  async function loadScene() {
    if (!state.manifest) {
      return;
    }
    await ensureViewer();
    const diff = tileSelectionView.tileDiff();
    const selectedTiles = diff.selected;
    const bundles = state.manifest.bundles.filter((bundle) => selectedTiles.has(bundle.tile));
    state.tileLoadBusy = true;
    if (diff.toAdd.length || diff.toRemove.length) {
      solver().invalidateLinkResult({clearOverlay: false, clearPaths: false});
      solver().invalidateMobilityResult({clearOverlay: false, clearPaths: false});
      solver().invalidateRadiomapResult({clearOverlay: false});
      solver().invalidateDeepMimoResult({clearOverlay: false});
      getViewer().clearOverlay();
    }
    syncTileListUi();

    try {
      if (!diff.toAdd.length && !diff.toRemove.length) {
        syncTileListUi();
        showOverlay({title: "Loading Scene", message: "Tile bundles already in sync", percent: 100, force: true});
        await new Promise((resolve) => window.setTimeout(resolve, 160));
      } else {
        showOverlay({title: "Loading Scene", message: "Syncing tile bundles...", percent: 0, force: true});
        const loadProgressRenderer = createLoadProgressRenderer({setProgress});

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
      hideOverlay(null, true);
      syncTileListUi();
      syncPerformanceUi();
    }
  }

  return {
    enterScene,
    loadScene,
    waitForRtSceneSelection,
    syncRtSceneSelection,
  };
}
