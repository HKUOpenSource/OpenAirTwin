import {createRadiomapJob, getManifest, getRadiomapJob, getRadiomapResult, solveLink} from "/js/api.js";

function createViewerStub() {
  return {
    __ready: false,
    loadedTileIds: new Set(),
    meshesLoaded: 0,
    txMarkerRadius: 1.25,
    rxMarkerRadius: 1.25,
    setTx() {},
    setRx() {},
    renderRadiomap() {},
    renderPaths() {},
    clearOverlay() {},
    clearPaths() {},
    clearRadiomap() {},
    focusOnTiles() { return false; },
    async syncBundles() {},
    resetView() {},
    pickOnSurface() { return null; },
  };
}

let viewer = createViewerStub();
let viewerModulePromise = null;
const TILE_ID_PATTERN = /^(\d+)_([A-Z]+)_(\d+)([A-Z])$/;
const TILE_COLUMNS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const ENTRY_MAP_CONFIG = {};

const state = {
  manifest: null,
  mode: "link",
  pickTarget: null,
  tileLoadBusy: false,
  entry: {
    visible: false,
    sceneReady: false,
    overview: null,
  },
  link: {
    tx: [72.0, 37.0, 40.0],
    txVisual: [72.0, 37.0, 40.0],
    rx: [90.0, 52.0, 1.5],
    rxVisual: [90.0, 52.0, 1.5],
    result: null,
    selectedPath: -1,
  },
  radiomap: {
    tx: [72.0, 37.0, 40.0],
    txVisual: [72.0, 37.0, 40.0],
    surface: {
      size: [160.0, 160.0],
      heightOffset: 1.5,
      densityLevel: 2,
    },
    display: {
      colorMinDb: -140,
      colorMaxDb: -80,
    },
    jobId: null,
    result: null,
    status: "Idle",
  },
};

const ui = {
  loadingScreen: document.getElementById("loadingScreen"),
  loadingTitle: document.getElementById("loadingTitle"),
  loadingPhase: document.getElementById("loadingPhase"),
  progressBar: document.getElementById("bar"),
  entryScreen: document.getElementById("entryScreen"),
  entryRegionTitle: document.getElementById("entryRegionTitle"),
  entryRegionLead: document.getElementById("entryRegionLead"),
  entryMapTitle: document.getElementById("entryMapTitle"),
  entryMapSub: document.getElementById("entryMapSub"),
  entrySelectionMeta: document.getElementById("entrySelectionMeta"),
  entryAvailableTiles: document.getElementById("entryAvailableTiles"),
  entrySelectedTiles: document.getElementById("entrySelectedTiles"),
  entrySelectedMeshes: document.getElementById("entrySelectedMeshes"),
  entryLoadedTiles: document.getElementById("entryLoadedTiles"),
  entryMapFigure: document.getElementById("entryMapFigure"),
  entryMapImage: document.getElementById("entryMapImage"),
  tileOverview: document.getElementById("tileOverview"),
  btnEntrySelectAll: document.getElementById("btnEntrySelectAll"),
  btnEntryClear: document.getElementById("btnEntryClear"),
  btnEnterScene: document.getElementById("btnEnterScene"),
  btnEnterSceneFooter: document.getElementById("btnEnterSceneFooter"),
  panel: document.getElementById("ui"),
  panelBody: document.getElementById("uiBody"),
  hintText: document.getElementById("hintText"),
  panelToggle: document.getElementById("panelToggle"),
  tabLink: document.getElementById("tabLink"),
  tabRadiomap: document.getElementById("tabRadiomap"),
  linkPanel: document.getElementById("linkPanel"),
  radiomapPanel: document.getElementById("radiomapPanel"),
  tileList: document.getElementById("tileList"),
  tileSummary: document.getElementById("tileSummary"),
  stSceneMeshes: document.getElementById("stSceneMeshes"),
  stLoadedMeshes: document.getElementById("stLoadedMeshes"),
  stLoadedTiles: document.getElementById("stLoadedTiles"),
  stMode: document.getElementById("stMode"),
  btnOpenTileIndex: document.getElementById("btnOpenTileIndex"),
  btnLoadScene: document.getElementById("btnLoadScene"),
  btnSelectAllTiles: document.getElementById("btnSelectAllTiles"),
  btnClearTiles: document.getElementById("btnClearTiles"),
  btnMatchLoadedTiles: document.getElementById("btnMatchLoadedTiles"),
  btnSolveLink: document.getElementById("btnSolveLink"),
  btnRunRadiomap: document.getElementById("btnRunRadiomap"),
  btnResetView: document.getElementById("btnResetView"),
  btnClearOverlay: document.getElementById("btnClearOverlay"),
  linkResult: document.getElementById("linkResult"),
  linkPower: document.getElementById("linkPower"),
  linkBest: document.getElementById("linkBest"),
  linkPaths: document.getElementById("linkPaths"),
  linkLos: document.getElementById("linkLos"),
  pathButtons: document.getElementById("pathButtons"),
  pathDetailSection: document.getElementById("pathDetailSection"),
  pathDetailList: document.getElementById("pathDetailList"),
  radiomapResult: document.getElementById("radiomapResult"),
  rmStatus: document.getElementById("rmStatus"),
  rmMetric: document.getElementById("rmMetric"),
  rmGrid: document.getElementById("rmGrid"),
  rmRange: document.getElementById("rmRange"),
};

const inputs = {
  cfgFrequency: document.getElementById("cfgFrequency"),
  cfgMaxDepth: document.getElementById("cfgMaxDepth"),
  cfgLos: document.getElementById("cfgLos"),
  cfgSpecular: document.getElementById("cfgSpecular"),
  cfgDiffuse: document.getElementById("cfgDiffuse"),
  cfgRefraction: document.getElementById("cfgRefraction"),
  linkTxX: document.getElementById("linkTxX"),
  linkTxY: document.getElementById("linkTxY"),
  linkTxZ: document.getElementById("linkTxZ"),
  linkRxX: document.getElementById("linkRxX"),
  linkRxY: document.getElementById("linkRxY"),
  linkRxZ: document.getElementById("linkRxZ"),
  rmTxX: document.getElementById("rmTxX"),
  rmTxY: document.getElementById("rmTxY"),
  rmTxZ: document.getElementById("rmTxZ"),
  rmSizeX: document.getElementById("rmSizeX"),
  rmSizeY: document.getElementById("rmSizeY"),
  rmHeightOffset: document.getElementById("rmHeightOffset"),
  rmDensityLevel: document.getElementById("rmDensityLevel"),
  rmColorMin: document.getElementById("rmColorMin"),
  rmColorMax: document.getElementById("rmColorMax"),
};

function setProgress(percent, message, indeterminate = false) {
  if (indeterminate || !Number.isFinite(percent)) {
    ui.progressBar.classList.add("indeterminate");
    ui.progressBar.style.width = "38%";
  } else {
    ui.progressBar.classList.remove("indeterminate");
    ui.progressBar.style.width = `${Math.max(0, Math.min(100, percent))}%`;
  }
  ui.loadingPhase.textContent = message;
}

function showOverlay({title = "Working", message = "Loading...", percent = 0, indeterminate = false} = {}) {
  ui.loadingTitle.textContent = title;
  setProgress(percent, message, indeterminate);
  ui.loadingScreen.style.display = "flex";
}

function hideOverlay() {
  ui.loadingScreen.style.display = "none";
  ui.loadingTitle.textContent = "Loading Scene";
  ui.loadingPhase.textContent = "Initializing...";
  ui.progressBar.classList.remove("indeterminate");
  ui.progressBar.style.width = "0%";
}

function commonSolverConfig() {
  return {
    frequency_hz: Number(inputs.cfgFrequency.value) * 1e9,
    max_depth: Number(inputs.cfgMaxDepth.value),
    los: inputs.cfgLos.checked,
    specular_reflection: inputs.cfgSpecular.checked,
    diffuse_reflection: inputs.cfgDiffuse.checked,
    refraction: inputs.cfgRefraction.checked,
    seed: 42,
  };
}

function parseTileId(tileId) {
  const match = TILE_ID_PATTERN.exec(tileId);
  if (!match) {
    return null;
  }
  return {
    sheet: match[1],
    region: match[2],
    row: Number(match[3]),
    column: match[4],
    regionKey: `${match[1]}_${match[2]}`,
  };
}

function formatTileLabel(tileId) {
  return tileId.replaceAll("_", "-");
}

function formatRegionLabel(regionKey) {
  return regionKey.replaceAll("_", "-");
}

function entryMapConfigFor(regionKey) {
  return ENTRY_MAP_CONFIG[regionKey] || null;
}

async function ensureViewer() {
  if (viewer.__ready) {
    return viewer;
  }
  if (!viewerModulePromise) {
    viewerModulePromise = import("/js/viewer.js");
  }
  const {Viewer} = await viewerModulePromise;
  const realViewer = new Viewer(document.getElementById("view"));
  realViewer.__ready = true;
  viewer = realViewer;
  syncViewerMarkers();
  syncSceneStats();
  syncTileListUi();
  return viewer;
}

function buildEntryOverview(manifest) {
  const grouped = new Map();
  for (const tile of manifest.tiles) {
    const parsed = parseTileId(tile.id);
    if (!parsed) {
      continue;
    }

    const existing = grouped.get(parsed.regionKey) || {
      regionKey: parsed.regionKey,
      sheet: parsed.sheet,
      region: parsed.region,
      minRow: parsed.row,
      maxRow: parsed.row,
      minColumnIndex: TILE_COLUMNS.indexOf(parsed.column),
      maxColumnIndex: TILE_COLUMNS.indexOf(parsed.column),
      tileById: new Map(),
      numberGroups: new Map(),
    };

    existing.minRow = Math.min(existing.minRow, parsed.row);
    existing.maxRow = Math.max(existing.maxRow, parsed.row);
    existing.minColumnIndex = Math.min(existing.minColumnIndex, TILE_COLUMNS.indexOf(parsed.column));
    existing.maxColumnIndex = Math.max(existing.maxColumnIndex, TILE_COLUMNS.indexOf(parsed.column));
    existing.tileById.set(tile.id, tile);
    const groupKey = String(parsed.row);
    const groupTiles = existing.numberGroups.get(groupKey) || [];
    groupTiles.push(tile.id);
    existing.numberGroups.set(groupKey, groupTiles);
    grouped.set(parsed.regionKey, existing);
  }

  const groups = [...grouped.values()];
  if (!groups.length) {
    return null;
  }

  groups.sort((left, right) => {
    if (left.regionKey === "11_SW") {
      return -1;
    }
    if (right.regionKey === "11_SW") {
      return 1;
    }
    return right.tileById.size - left.tileById.size;
  });

  const selectedGroup = groups[0];
  const columns = TILE_COLUMNS
    .slice(selectedGroup.minColumnIndex, selectedGroup.maxColumnIndex + 1)
    .split("");
  const rows = [];
  for (let row = selectedGroup.maxRow; row >= selectedGroup.minRow; row -= 1) {
    rows.push(row);
  }

  return {
    ...selectedGroup,
    rows,
    columns,
    availableTileIds: [...selectedGroup.tileById.keys()].sort(),
    label: formatRegionLabel(selectedGroup.regionKey),
  };
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

function tileIdForParentQuadrant(overview, parentNumber, quadrant) {
  return `${overview.sheet}_${overview.region}_${parentNumber}${quadrant}`;
}

function subtilePlacement(parentGrid, parentNumber, quadrant) {
  const zeroBasedIndex = parentNumber - parentGrid.startNumber;
  if (zeroBasedIndex < 0) {
    return null;
  }

  const parentRow = Math.floor(zeroBasedIndex / parentGrid.columns);
  const parentColumn = zeroBasedIndex % parentGrid.columns;
  if (parentRow >= parentGrid.rows) {
    return null;
  }

  const offset = parentGrid.quadrantOffsets[quadrant];
  if (!offset) {
    return null;
  }

  return {
    column: parentColumn * 2 + offset[0] + 1,
    row: parentRow * 2 + offset[1] + 1,
  };
}

function showEntryScreen() {
  if (!state.entry.overview) {
    return;
  }
  state.entry.visible = true;
  ui.entryScreen.classList.remove("hidden");
  syncEntryOverviewUi();
}

function hideEntryScreen() {
  state.entry.visible = false;
  ui.entryScreen.classList.add("hidden");
}

function syncEntryOverviewUi() {
  const overview = state.entry.overview;
  if (!overview) {
    return;
  }

  const selected = tileSelections().filter((tileId) => overview.tileById.has(tileId));
  const loaded = [...viewer.loadedTileIds].filter((tileId) => overview.tileById.has(tileId));
  const selectedMeshCount = selected.reduce((sum, tileId) => sum + overview.tileById.get(tileId).mesh_count, 0);

  ui.entryAvailableTiles.textContent = String(overview.availableTileIds.length);
  ui.entrySelectedTiles.textContent = String(selected.length);
  ui.entrySelectedMeshes.textContent = selectedMeshCount.toLocaleString();
  ui.entryLoadedTiles.textContent = String(loaded.length);
  ui.entrySelectionMeta.textContent = selected.length
    ? `${selected.length} tile${selected.length === 1 ? "" : "s"} selected - ${selectedMeshCount.toLocaleString()} meshes`
    : "Select one or more tiles to continue.";
  const sceneActionDisabled = state.tileLoadBusy || selected.length === 0;
  const sceneActionLabel = state.entry.sceneReady ? "Apply Tile Selection" : "Load Selected Tiles";
  ui.btnEnterScene.disabled = sceneActionDisabled;
  ui.btnEnterScene.textContent = sceneActionLabel;
  ui.btnEnterSceneFooter.disabled = sceneActionDisabled;
  ui.btnEnterSceneFooter.textContent = sceneActionLabel;
  ui.btnEntrySelectAll.disabled = state.tileLoadBusy;
  ui.btnEntryClear.disabled = state.tileLoadBusy;
  ui.btnOpenTileIndex.disabled = state.tileLoadBusy;

  ui.tileOverview.querySelectorAll(".overviewTile[data-tile-id]").forEach((node) => {
    const tileId = node.dataset.tileId;
    const isSelected = selected.includes(tileId);
    const isLoaded = loaded.includes(tileId);
    const isAvailable = overview.tileById.has(tileId);
    node.classList.toggle("selected", isSelected);
    node.classList.toggle("loaded", isLoaded);
    node.setAttribute("aria-pressed", String(isSelected));
    node.disabled = state.tileLoadBusy || !isAvailable;
  });
}

function renderEntryOverview() {
  const overview = state.entry.overview;
  if (!overview) {
    return;
  }

  const mapConfig = entryMapConfigFor(overview.regionKey);
  ui.entryRegionTitle.textContent = `${overview.label} Tile Index`;
  ui.entryRegionLead.textContent = mapConfig
    ? `Select ${overview.label} subtiles directly from the original vector map. Each parent box splits into A/B/C/D: A upper-left, B upper-right, C lower-left, D lower-right.`
    : `Select one or more available ${overview.label} tiles, then enter the 3D digital twin scene for path and radio-map analysis.`;
  ui.entryMapTitle.textContent = mapConfig?.title || `${overview.label} Regional Tile Grid`;
  ui.entryMapSub.textContent = mapConfig?.subtitle || "Tiles with scene data can be selected. Empty tiles stay visible for spatial context.";
  ui.entryMapFigure.classList.toggle("mapMode", Boolean(mapConfig));
  ui.entryMapImage.classList.toggle("hidden", !mapConfig);
  ui.entryMapImage.src = mapConfig?.imagePath || "";
  ui.entryMapFigure.style.setProperty("--entry-map-aspect", mapConfig?.aspectRatio || "1 / 1");
  ui.tileOverview.style.gridTemplateColumns = mapConfig
    ? ""
    : `72px repeat(${overview.columns.length}, minmax(116px, 1fr))`;
  ui.tileOverview.style.gridTemplateRows = "";
  ui.tileOverview.innerHTML = "";

  if (mapConfig) {
    const parentGrid = mapConfig.parentGrid;
    const subtileColumns = parentGrid.columns * 2;
    const subtileRows = parentGrid.rows * 2;
    const parentCount = parentGrid.columns * parentGrid.rows;
    ui.tileOverview.style.gridTemplateColumns = `repeat(${subtileColumns}, minmax(0, 1fr))`;
    ui.tileOverview.style.gridTemplateRows = `repeat(${subtileRows}, minmax(0, 1fr))`;

    for (let parentOffset = 0; parentOffset < parentCount; parentOffset += 1) {
      const parentNumber = parentGrid.startNumber + parentOffset;
      for (const quadrant of parentGrid.quadrants) {
        const placement = subtilePlacement(parentGrid, parentNumber, quadrant);
        if (!placement) {
          continue;
        }

        const tileId = tileIdForParentQuadrant(overview, parentNumber, quadrant);
        const tile = overview.tileById.get(tileId);
        const cell = document.createElement("button");
        cell.type = "button";
        cell.className = "overviewTile";
        cell.dataset.tileId = tileId;
        cell.dataset.parentNumber = String(parentNumber);
        cell.dataset.quadrant = quadrant;
        cell.style.gridColumn = String(placement.column);
        cell.style.gridRow = String(placement.row);
        cell.title = tile
          ? `${formatTileLabel(tile.id)} - ${tile.mesh_count.toLocaleString()} meshes - ${tile.bundle_count} bundles`
          : `${formatTileLabel(tileId)} - No scene data`;

        if (tile) {
          cell.classList.add("available");
          cell.innerHTML = `
            <span class="overviewTileCode">${parentNumber}${quadrant}</span>
            <span class="overviewTileMeta">${tile.mesh_count.toLocaleString()} meshes</span>
            <span class="overviewTileNote">${tile.bundle_count} bundles</span>
          `;
        } else {
          cell.classList.add("unavailable");
          cell.disabled = true;
          cell.innerHTML = `
            <span class="overviewTileCode">${parentNumber}${quadrant}</span>
            <span class="overviewTileMeta">No scene data</span>
            <span class="overviewTileNote">Unavailable</span>
          `;
        }

        ui.tileOverview.appendChild(cell);
      }
    }

    const legend = document.createElement("div");
    legend.className = "overviewTileLegend";
    legend.innerHTML = `<strong>${overview.label}</strong><span>A upper-left - B upper-right - C lower-left - D lower-right</span>`;
    ui.tileOverview.appendChild(legend);
    syncEntryOverviewUi();
    return;
  }

  const corner = document.createElement("div");
  corner.className = "overviewAxis corner";
  corner.textContent = overview.label;
  ui.tileOverview.appendChild(corner);

  for (const column of overview.columns) {
    const axis = document.createElement("div");
    axis.className = "overviewAxis";
    axis.textContent = column;
    ui.tileOverview.appendChild(axis);
  }

  for (const row of overview.rows) {
    const rowAxis = document.createElement("div");
    rowAxis.className = "overviewAxis";
    rowAxis.textContent = String(row);
    ui.tileOverview.appendChild(rowAxis);

    for (const column of overview.columns) {
      const tileId = `${overview.sheet}_${overview.region}_${row}${column}`;
      const tile = overview.tileById.get(tileId);
      const cell = document.createElement("button");
      cell.type = "button";
      cell.className = "overviewTile";
      cell.dataset.tileId = tileId;

      if (tile) {
        cell.classList.add("available");
        cell.innerHTML = `
          <span class="overviewTileCode">${row}${column}</span>
          <span class="overviewTileMeta">${formatTileLabel(tile.id)}</span>
          <span class="overviewTileNote">${tile.mesh_count} meshes - ${tile.bundle_count} bundles</span>
        `;
      } else {
        cell.classList.add("unavailable");
        cell.disabled = true;
        cell.innerHTML = `
          <span class="overviewTileCode">${row}${column}</span>
          <span class="overviewTileMeta">No scene data</span>
          <span class="overviewTileNote">Unavailable</span>
        `;
      }

      ui.tileOverview.appendChild(cell);
    }
  }

  syncEntryOverviewUi();
}

function syncModeUi() {
  const isLink = state.mode === "link";
  ui.tabLink.classList.toggle("active", isLink);
  ui.tabRadiomap.classList.toggle("active", !isLink);
  ui.linkPanel.classList.toggle("hidden", !isLink);
  ui.radiomapPanel.classList.toggle("hidden", isLink);
  ui.stMode.textContent = isLink ? "Link" : "Radio Map";
  ui.hintText.textContent = isLink
    ? "Left drag orbits, right drag pans, wheel zooms, Shift+drag free-looks, and W/A/S/D + Q/E moves the camera."
    : "Left drag orbits, right drag pans, wheel zooms, Shift+drag free-looks, and W/A/S/D + Q/E moves the camera while the radio map follows a terrain patch around the selected Tx.";
}

function syncNumericInputs() {
  const [ltx, lty, ltz] = state.link.tx;
  const [lrx, lry, lrz] = state.link.rx;
  const [rtx, rty, rtz] = state.radiomap.tx;
  const [sx, sy] = state.radiomap.surface.size;
  const heightOffset = state.radiomap.surface.heightOffset;
  const densityLevel = state.radiomap.surface.densityLevel;
  const colorMinDb = state.radiomap.display.colorMinDb;
  const colorMaxDb = state.radiomap.display.colorMaxDb;

  inputs.linkTxX.value = ltx.toFixed(1);
  inputs.linkTxY.value = lty.toFixed(1);
  inputs.linkTxZ.value = ltz.toFixed(1);
  inputs.linkRxX.value = lrx.toFixed(1);
  inputs.linkRxY.value = lry.toFixed(1);
  inputs.linkRxZ.value = lrz.toFixed(1);
  inputs.rmTxX.value = rtx.toFixed(1);
  inputs.rmTxY.value = rty.toFixed(1);
  inputs.rmTxZ.value = rtz.toFixed(1);
  inputs.rmSizeX.value = sx.toFixed(1);
  inputs.rmSizeY.value = sy.toFixed(1);
  inputs.rmHeightOffset.value = heightOffset.toFixed(1);
  inputs.rmDensityLevel.value = String(densityLevel);
  inputs.rmColorMin.value = colorMinDb.toFixed(0);
  inputs.rmColorMax.value = colorMaxDb.toFixed(0);
}

function syncSceneStats() {
  ui.stSceneMeshes.textContent = state.manifest ? String(state.manifest.mesh_count) : "--";
  ui.stLoadedMeshes.textContent = String(viewer.meshesLoaded);
  ui.stLoadedTiles.textContent = String(viewer.loadedTileIds.size);
}

function setVector(target, values) {
  target.splice(0, target.length, ...values.map((value) => Number(value)));
}

function setLogicalAndVisual(logicalTarget, visualTarget, logicalValues, visualValues = logicalValues) {
  setVector(logicalTarget, logicalValues);
  setVector(visualTarget, visualValues);
}

function syncViewerMarkers() {
  viewer.setTx(state.mode === "link" ? state.link.txVisual : state.radiomap.txVisual);
  viewer.setRx(state.link.rxVisual);
}

function markerRadiusForPickTarget(target) {
  return target === "link-rx" ? viewer.rxMarkerRadius : viewer.txMarkerRadius;
}

function readLinkInputs() {
  setLogicalAndVisual(state.link.tx, state.link.txVisual, [
    Number(inputs.linkTxX.value),
    Number(inputs.linkTxY.value),
    Number(inputs.linkTxZ.value),
  ]);
  setLogicalAndVisual(state.link.rx, state.link.rxVisual, [
    Number(inputs.linkRxX.value),
    Number(inputs.linkRxY.value),
    Number(inputs.linkRxZ.value),
  ]);
}

function readRadiomapInputs() {
  setLogicalAndVisual(state.radiomap.tx, state.radiomap.txVisual, [
    Number(inputs.rmTxX.value),
    Number(inputs.rmTxY.value),
    Number(inputs.rmTxZ.value),
  ]);
  state.radiomap.surface.size = [Number(inputs.rmSizeX.value), Number(inputs.rmSizeY.value)];
  state.radiomap.surface.heightOffset = Number(inputs.rmHeightOffset.value);
  state.radiomap.surface.densityLevel = Number(inputs.rmDensityLevel.value);
  state.radiomap.display.colorMinDb = Number(inputs.rmColorMin.value);
  state.radiomap.display.colorMaxDb = Number(inputs.rmColorMax.value);
}

function radiomapColorRange() {
  const minDb = Number(state.radiomap.display.colorMinDb);
  const maxDb = Number(state.radiomap.display.colorMaxDb);
  if (!(minDb < maxDb)) {
    throw new Error("Radio map color range must satisfy Color Min < Color Max");
  }
  return {minDb, maxDb};
}

function rerenderRadiomapOverlay() {
  if (!state.radiomap.result) {
    return;
  }
  const colorRange = radiomapColorRange();
  viewer.renderRadiomap(state.radiomap.result, colorRange);
}

function formatFixed(value, digits = 2, suffix = "") {
  return Number.isFinite(value) ? `${value.toFixed(digits)}${suffix}` : "N/A";
}

function formatExp(value, digits = 3) {
  return Number.isFinite(value) ? value.toExponential(digits) : "N/A";
}

function describeInteractionSequence(path) {
  return path.interaction_sequence?.length ? path.interaction_sequence.join(" -> ") : "LOS";
}

function renderPathDetails(paths) {
  ui.pathDetailList.innerHTML = "";
  const selectedIndex = state.link.selectedPath;
  if (selectedIndex < 0 || selectedIndex >= paths.length) {
    ui.pathDetailSection.classList.add("hidden");
    return;
  }

  ui.pathDetailSection.classList.remove("hidden");
  const path = paths[selectedIndex];
  const card = document.createElement("div");
  card.className = "pathDetailCard active";

  const head = document.createElement("div");
  head.className = "pathDetailHead";
  const title = document.createElement("div");
  title.className = "pathDetailTitle";
  title.textContent = `Path ${selectedIndex + 1}`;
  const typeTag = document.createElement("span");
  typeTag.className = "pathTypeTag";
  typeTag.textContent = path.type;
  head.append(title, typeTag);

  const grid = document.createElement("div");
  grid.className = "pathDetailGrid";

  const addField = (label, value, wide = false) => {
    const item = document.createElement("div");
    item.className = "pathDetailItem" + (wide ? " wide" : "");
    const key = document.createElement("b");
    key.textContent = label;
    const text = document.createElement("span");
    text.textContent = value;
    item.append(key, text);
    grid.appendChild(item);
  };

  addField("Interaction Chain", describeInteractionSequence(path), true);
  addField("Path Gain", formatFixed(path.path_gain_db, 2, " dB"));
  addField("Power (Linear)", formatExp(path.path_gain_linear));
  addField("|a|", formatExp(path.coefficient_abs));
  addField("Phase", formatFixed(path.coefficient_phase_deg, 1, " deg"));
  addField("Delay", formatFixed(path.delay_ns, 2, " ns"));
  addField("Length", formatFixed(path.path_length_m, 2, " m"));
  addField("Doppler", formatFixed(path.doppler_hz, 2, " Hz"));
  addField(
    "AoD (zen/azi)",
    `${formatFixed(path.departure_zenith_deg, 1)} / ${formatFixed(path.departure_azimuth_deg, 1)} deg`,
  );
  addField(
    "AoA (zen/azi)",
    `${formatFixed(path.arrival_zenith_deg, 1)} / ${formatFixed(path.arrival_azimuth_deg, 1)} deg`,
  );
  addField("Re(a)", formatExp(path.coefficient_real));
  addField("Im(a)", formatExp(path.coefficient_imag));

  card.append(head, grid);
  ui.pathDetailList.appendChild(card);
}

function renderLinkResult() {
  const result = state.link.result;
  if (!result) {
    ui.linkResult.style.display = "none";
    ui.pathButtons.innerHTML = "";
    ui.pathDetailList.innerHTML = "";
    ui.pathDetailSection.classList.add("hidden");
    return;
  }

  ui.linkResult.style.display = "block";
  ui.linkPower.textContent = Number.isFinite(result.summary.received_power_db)
    ? `${result.summary.received_power_db.toFixed(2)} dB`
    : "N/A";
  ui.linkBest.textContent = Number.isFinite(result.summary.strongest_path_db)
    ? `${result.summary.strongest_path_db.toFixed(2)} dB`
    : "N/A";
  ui.linkPaths.textContent = String(result.summary.valid_paths ?? 0);
  const hasLos = (result.summary.los_paths ?? 0) > 0;
  ui.linkLos.textContent = hasLos ? "Yes" : "No";
  ui.linkLos.className = `pill ${hasLos ? "yes" : "no"}`;

  ui.pathButtons.innerHTML = "";
  renderPathDetails(result.paths);
  if (!result.paths.length) {
    return;
  }

  const addButton = (label, index) => {
    const button = document.createElement("button");
    button.className = "pbtn" + (state.link.selectedPath === index ? " active" : "");
    button.textContent = label;
    button.addEventListener("click", () => {
      state.link.selectedPath = index;
      viewer.renderPaths(result.paths, index);
      renderLinkResult();
    });
    ui.pathButtons.appendChild(button);
  };

  addButton("All", -1);
  result.paths.forEach((_, index) => addButton(`Path ${index + 1}`, index));
}

function renderRadiomapResult() {
  ui.radiomapResult.style.display = "block";
  ui.rmStatus.textContent = state.radiomap.status;
  ui.rmMetric.textContent = "path_gain";
  if (state.radiomap.result) {
    ui.rmGrid.textContent = `${state.radiomap.result.surface.cell_count.toLocaleString()} cells - D${state.radiomap.result.surface.density_level}`;
    ui.rmRange.textContent = `${state.radiomap.result.range.min.toFixed(1)} .. ${state.radiomap.result.range.max.toFixed(1)} dB | color ${state.radiomap.display.colorMinDb.toFixed(0)} .. ${state.radiomap.display.colorMaxDb.toFixed(0)} dB`;
  } else {
    ui.rmGrid.textContent = "--";
    ui.rmRange.textContent = "--";
  }
}

function renderAll() {
  syncModeUi();
  syncViewerMarkers();
  syncNumericInputs();
  syncSceneStats();
  syncTileListUi();
  syncEntryOverviewUi();
  renderLinkResult();
  renderRadiomapResult();
}

function tileSelections() {
  return [...ui.tileList.querySelectorAll('input[type="checkbox"]:checked')].map((node) => node.value);
}

function tileDiff() {
  const selected = new Set(tileSelections());
  const loaded = new Set(viewer.loadedTileIds);
  const toAdd = [...selected].filter((tileId) => !loaded.has(tileId));
  const toRemove = [...loaded].filter((tileId) => !selected.has(tileId));
  return {selected, loaded, toAdd, toRemove};
}

function updateTileSummary() {
  const {selected, loaded, toAdd, toRemove} = tileDiff();
  const pending = toAdd.length + toRemove.length;
  ui.tileSummary.textContent = `${selected.size} selected - ${loaded.size} loaded - ${pending} pending changes`;

  if (state.tileLoadBusy) {
    ui.btnLoadScene.textContent = "Syncing Bundles...";
    return;
  }

  if (!selected.size && !loaded.size) {
    ui.tileSummary.textContent = "No tiles selected yet. Open the tile index to choose one or more scene tiles.";
    ui.btnLoadScene.textContent = "Load Selected Tiles";
    return;
  }

  if (!pending) {
    ui.btnLoadScene.textContent = "Bundles In Sync";
    return;
  }

  const segments = [];
  if (toAdd.length) {
    segments.push(`+${toAdd.length}`);
  }
  if (toRemove.length) {
    segments.push(`-${toRemove.length}`);
  }
  ui.btnLoadScene.textContent = `Sync Tile Bundles (${segments.join(" / ")})`;
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
  ui.btnLoadScene.disabled = disableControls;
  ui.btnSelectAllTiles.disabled = disableControls;
  ui.btnClearTiles.disabled = disableControls;
  ui.btnMatchLoadedTiles.disabled = disableControls;
  ui.tileList.querySelectorAll('input[type="checkbox"]').forEach((input) => {
    input.disabled = disableControls;
  });
  syncEntryOverviewUi();
}

function populateTileList(manifest) {
  ui.tileList.innerHTML = "";
  for (const tile of manifest.tiles) {
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
    title.textContent = tile.id;
    const detail = document.createElement("span");
    detail.textContent = `${tile.mesh_count} meshes - ${tile.bundle_count} bundles`;
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
  ui.panelBody.classList.remove("hidden");
  hideEntryScreen();
  viewer.focusOnTiles(selectedTileIds);
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
    viewer.clearOverlay();
  }
  syncTileListUi();
  showOverlay({title: "Loading Scene", message: "Syncing tile bundles...", percent: 0});

  try {
    await viewer.syncBundles(bundles, ({phase, completed, total, bundle}) => {
      const percent = total > 0 ? (completed / total) * 100 : 100;
      if (phase === "removing") {
        setProgress(percent, `Removing ${bundle?.tile || "tile"} / ${bundle?.category || "bundle"} ${completed}/${total}`);
      } else if (phase === "loading") {
        setProgress(percent, `Loading ${bundle?.tile || "tile"} / ${bundle?.category || "bundle"} ${completed}/${total}`);
      } else if (phase === "start") {
        setProgress(0, `Applying ${total} bundle changes`);
      } else {
        setProgress(100, "Tile bundles already in sync");
      }
    });

    syncViewerMarkers();
    viewer.focusOnTiles([...selectedTiles]);
  } finally {
    state.tileLoadBusy = false;
    hideOverlay();
    syncSceneStats();
    syncTileListUi();
  }
}

async function runLinkSolve() {
  readLinkInputs();
  viewer.clearOverlay();
  showOverlay({
    title: "Solving Link",
    message: "Computing link paths with Sionna RT...",
    indeterminate: true,
  });
  try {
    const result = await solveLink({
      tx: {position: state.link.tx, orientation: [0, 0, 0]},
      rx: {position: state.link.rx, orientation: [0, 0, 0]},
      solver: {
        ...commonSolverConfig(),
        samples_per_src: 30000,
      },
    });
    state.link.result = result;
    state.link.selectedPath = -1;
    viewer.renderPaths(result.paths, -1);
  } finally {
    hideOverlay();
    renderAll();
  }
}

async function pollRadiomap(jobId, colorRange) {
  while (true) {
    const job = await getRadiomapJob(jobId);
    state.radiomap.status = job.status;
    renderRadiomapResult();

    if (job.status === "succeeded") {
      state.radiomap.result = await getRadiomapResult(jobId);
      viewer.renderRadiomap(state.radiomap.result, colorRange);
      renderRadiomapResult();
      hideOverlay();
      return;
    }

    if (job.status === "failed") {
      hideOverlay();
      throw new Error(job.message || "Radio map job failed");
    }

    showOverlay({
      title: "Running Radio Map",
      message: job.message || "Computing radio map with Sionna RT...",
      indeterminate: true,
    });
    await new Promise((resolve) => window.setTimeout(resolve, 1200));
  }
}

async function runRadiomap() {
  readRadiomapInputs();
  const colorRange = radiomapColorRange();
  viewer.clearOverlay();

  state.radiomap.status = "Queued";
  state.radiomap.result = null;
  renderRadiomapResult();
  showOverlay({
    title: "Running Radio Map",
    message: "Submitting radio map job...",
    indeterminate: true,
  });

  const job = await createRadiomapJob({
    tx: {position: state.radiomap.tx, orientation: [0, 0, 0]},
    metric: "path_gain",
    surface: {
      type: "terrain_patch",
      size: state.radiomap.surface.size,
      height_offset: state.radiomap.surface.heightOffset,
      density_level: state.radiomap.surface.densityLevel,
    },
    solver: {
      ...commonSolverConfig(),
      samples_per_tx: 1000000,
    },
  });

  state.radiomap.jobId = job.job_id;
  await pollRadiomap(job.job_id, colorRange);
}

function applyPick(pick) {
  if (!pick || !state.pickTarget) {
    return;
  }

  if (state.pickTarget === "link-tx") {
    setLogicalAndVisual(state.link.tx, state.link.txVisual, pick.logicalPosition, pick.markerPosition);
  } else if (state.pickTarget === "link-rx") {
    setLogicalAndVisual(state.link.rx, state.link.rxVisual, pick.logicalPosition, pick.markerPosition);
  } else if (state.pickTarget === "rm-tx") {
    setLogicalAndVisual(state.radiomap.tx, state.radiomap.txVisual, pick.logicalPosition, pick.markerPosition);
  }

  state.pickTarget = null;
  renderAll();
}

function attachEvents() {
  const handleEnterScene = () => enterScene().catch((error) => {
    hideOverlay();
    state.tileLoadBusy = false;
    syncTileListUi();
    window.alert(error.message);
  });

  ui.panelToggle.addEventListener("click", () => {
    ui.panelBody.classList.toggle("hidden");
  });

  ui.tileOverview.addEventListener("click", (event) => {
    const tileButton = event.target.closest(".overviewTile.available");
    if (!tileButton) {
      return;
    }
    toggleTileChecked(tileButton.dataset.tileId);
  });

  ui.btnEntrySelectAll.addEventListener("click", () => {
    setTileSelection(state.entry.overview?.availableTileIds || []);
  });
  ui.btnEntryClear.addEventListener("click", () => {
    setTileSelection([]);
  });
  ui.btnEnterScene.addEventListener("click", handleEnterScene);
  ui.btnEnterSceneFooter.addEventListener("click", handleEnterScene);
  ui.btnOpenTileIndex.addEventListener("click", () => {
    showEntryScreen();
  });

  ui.tabLink.addEventListener("click", () => {
    state.mode = "link";
    viewer.clearOverlay();
    renderAll();
  });
  ui.tabRadiomap.addEventListener("click", () => {
    state.mode = "radiomap";
    viewer.clearOverlay();
    renderAll();
  });

  ui.btnLoadScene.addEventListener("click", () => loadScene().catch((error) => {
    hideOverlay();
    state.tileLoadBusy = false;
    syncTileListUi();
    window.alert(error.message);
  }));
  ui.btnSelectAllTiles.addEventListener("click", () => setTileSelection(state.manifest?.tiles.map((tile) => tile.id) || []));
  ui.btnClearTiles.addEventListener("click", () => setTileSelection([]));
  ui.btnMatchLoadedTiles.addEventListener("click", () => setTileSelection([...viewer.loadedTileIds]));
  ui.btnSolveLink.addEventListener("click", () => runLinkSolve().catch((error) => {
    hideOverlay();
    window.alert(error.message);
  }));
  ui.btnRunRadiomap.addEventListener("click", () => runRadiomap().catch((error) => {
    hideOverlay();
    window.alert(error.message);
  }));
  ui.btnResetView.addEventListener("click", () => {
    if (!viewer.focusOnTiles([...viewer.loadedTileIds])) {
      viewer.resetView();
    }
  });
  ui.btnClearOverlay.addEventListener("click", () => viewer.clearOverlay());

  document.getElementById("btnPickLinkTx").addEventListener("click", () => {
    readLinkInputs();
    state.pickTarget = "link-tx";
    ui.hintText.textContent = "Click a visible surface to place Tx at the picked surface point.";
  });
  document.getElementById("btnPickLinkRx").addEventListener("click", () => {
    readLinkInputs();
    state.pickTarget = "link-rx";
    ui.hintText.textContent = "Click a visible surface to place Rx at the picked surface point.";
  });
  document.getElementById("btnPickRmTx").addEventListener("click", () => {
    readRadiomapInputs();
    state.pickTarget = "rm-tx";
    ui.hintText.textContent = "Click a visible surface to place the radio-map Tx; the terrain patch will stay centered around it in X/Y.";
  });

  for (const input of [
    inputs.linkTxX, inputs.linkTxY, inputs.linkTxZ,
    inputs.linkRxX, inputs.linkRxY, inputs.linkRxZ,
  ]) {
    input.addEventListener("change", () => {
      readLinkInputs();
      renderAll();
    });
  }

  for (const input of [
    inputs.rmTxX, inputs.rmTxY, inputs.rmTxZ,
    inputs.rmSizeX, inputs.rmSizeY, inputs.rmHeightOffset, inputs.rmDensityLevel,
  ]) {
    input.addEventListener("change", () => {
      readRadiomapInputs();
      renderAll();
    });
  }

  for (const input of [inputs.rmColorMin, inputs.rmColorMax]) {
    input.addEventListener("change", () => {
      try {
        readRadiomapInputs();
        rerenderRadiomapOverlay();
        renderRadiomapResult();
      } catch (error) {
        window.alert(error.message);
      }
    });
  }

  document.getElementById("view").addEventListener("click", (event) => {
    if (!state.pickTarget) {
      return;
    }
    const pick = viewer.pickOnSurface(event.clientX, event.clientY, markerRadiusForPickTarget(state.pickTarget));
    applyPick(pick);
  });
}

async function bootstrap() {
  showOverlay({title: "Loading Scene", message: "Loading scene manifest...", percent: 10});
  attachEvents();
  state.manifest = await getManifest();
  populateTileList(state.manifest);
  state.entry.overview = buildEntryOverview(state.manifest);
  renderEntryOverview();
  setTileSelection([]);
  hideOverlay();

  renderAll();
  if (state.entry.overview) {
    showEntryScreen();
  } else {
    ui.panel.style.display = "flex";
  }
}

bootstrap().catch((error) => {
  hideOverlay();
  window.alert(error.message);
});
