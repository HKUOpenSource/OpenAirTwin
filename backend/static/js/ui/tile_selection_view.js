import {compareTileIds, toDisplayTileId} from "/js/tile_model.js?v=20260519-mode-isolation";

export function createTileSelectionView({state, ui, getViewer, syncEntryOverviewUi}) {
  function tileInputFor(tileId) {
    return ui.tileList.querySelector(`input[value="${tileId}"]`);
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
      wrapper.className = "tileItem oat-check oat-list-card";
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
