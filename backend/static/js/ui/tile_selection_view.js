import {compareTileIds, toDisplayTileId} from "/js/tile_model.js?v=20260519-mode-isolation";

export function createTileSelectionView({state, shellStore, getViewer, syncEntryOverviewUi}) {
  let tiles = [];
  let selectedTileIds = new Set();

  function tileSelections() {
    return tiles.filter((tile) => selectedTileIds.has(tile.id)).map((tile) => tile.id);
  }

  function tileDiff() {
    const selected = new Set(tileSelections());
    const loaded = new Set(getViewer().loadedTileIds);
    const toAdd = [...selected].filter((tileId) => !loaded.has(tileId));
    const toRemove = [...loaded].filter((tileId) => !selected.has(tileId));
    return {selected, loaded, toAdd, toRemove};
  }

  function formatTileSummary(diff = tileDiff()) {
    const {selected, loaded, toAdd, toRemove} = diff;
    const pending = toAdd.length + toRemove.length;
    if (state.tileLoadBusy) {
      return "Syncing bundle changes...";
    }
    if (!selected.size && !loaded.size) {
      return "No tiles loaded yet. Choose tiles on the map to enter the 3D scene.";
    }
    if (!pending) {
      return `${loaded.size} loaded · ${selected.size} selected · 0 pending`;
    }
    const segments = [];
    if (toAdd.length) segments.push(`${toAdd.length} to load`);
    if (toRemove.length) segments.push(`${toRemove.length} to unload`);
    return `${loaded.size} loaded · ${selected.size} selected · ${pending} pending (${segments.join(" / ")})`;
  }

  function tileStatus({selected, loaded, pendingAdd, pendingRemove}) {
    if (pendingAdd) return "Load";
    if (pendingRemove) return "Unload";
    if (loaded) return "Loaded";
    if (selected) return "Ready";
    return "Idle";
  }

  function syncTileListUi() {
    const diff = tileDiff();
    const nextTiles = tiles.map((tile) => {
      const selected = diff.selected.has(tile.id);
      const loaded = diff.loaded.has(tile.id);
      const pendingAdd = selected && !loaded;
      const pendingRemove = !selected && loaded;
      return {
        ...tile,
        selected,
        loaded,
        pendingAdd,
        pendingRemove,
        disabled: state.tileLoadBusy,
        status: tileStatus({selected, loaded, pendingAdd, pendingRemove}),
      };
    });
    const summary = formatTileSummary(diff);
    shellStore.patch((current) => ({
      ...current,
      tileLoadBusy: Boolean(state.tileLoadBusy),
      loadedTileCount: diff.loaded.size,
      selectedTileCount: diff.selected.size,
      tileSummary: summary,
      tiles: nextTiles,
    }));
    syncEntryOverviewUi();
  }

  function populateTileList(manifest) {
    tiles = [...manifest.tiles]
      .sort((left, right) => compareTileIds(left.id, right.id))
      .map((tile) => ({
        id: tile.id,
        title: toDisplayTileId(tile.id),
        detail: `${tile.mesh_count.toLocaleString()} meshes - ${tile.bundle_count} bundles`,
      }));
    selectedTileIds = new Set(
      [...selectedTileIds].filter((tileId) => tiles.some((tile) => tile.id === tileId)),
    );
    syncTileListUi();
  }

  function setTileSelection(nextTileIds) {
    const available = new Set(tiles.map((tile) => tile.id));
    selectedTileIds = new Set(nextTileIds.filter((tileId) => available.has(tileId)));
    syncTileListUi();
  }

  function resetSelectionToLoadedTiles() {
    setTileSelection([...getViewer().loadedTileIds]);
  }

  function setTileChecked(tileId, checked) {
    if (state.tileLoadBusy || !tiles.some((tile) => tile.id === tileId)) return;
    const next = new Set(selectedTileIds);
    if (checked) next.add(tileId);
    else next.delete(tileId);
    selectedTileIds = next;
    syncTileListUi();
  }

  function toggleTileChecked(tileId) {
    setTileChecked(tileId, !selectedTileIds.has(tileId));
  }

  return {
    tileSelections,
    tileDiff,
    syncTileListUi,
    populateTileList,
    setTileSelection,
    resetSelectionToLoadedTiles,
    setTileChecked,
    toggleTileChecked,
  };
}
