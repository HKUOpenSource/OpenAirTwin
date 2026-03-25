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
const ENTRY_DISPLAY_TILE_PATTERN = /^(\d+)-([A-Z]+)-(\d+)([A-Z])$/;
const ENTRY_MAP_IMAGE = {
  path: "/assets/tile_map.png",
  width: 3307,
  height: 2338,
};
const ENTRY_MAP_FRAME = {
  left: 221,
  top: 168,
  right: 3094,
  bottom: 2211,
};
const ENTRY_MAP_GRID = {
  west: 800000,
  east: 867500,
  south: 800000,
  north: 848000,
};
const ENTRY_MAP_MODEL = {
  west: 800000,
  east: 860000,
  south: 800000,
  north: 848000,
  cols: 4,
  rows: 4,
  sheetW: 15000,
  sheetH: 12000,
};
const ENTRY_MAP_QUADRANTS = ["NW", "NE", "SW", "SE"];
const ENTRY_MAP_SUBTILES = ["A", "B", "C", "D"];
const ENTRY_MAP_SHEET_COUNT = ENTRY_MAP_MODEL.cols * ENTRY_MAP_MODEL.rows;

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

const entryMap = {
  initialized: false,
  scale: 1,
  tx: 0,
  ty: 0,
  dragging: false,
  movedDuringDrag: false,
  startX: 0,
  startY: 0,
  baseTx: 0,
  baseTy: 0,
  fittedOnce: false,
  hoveredTileId: null,
  lastTileId: null,
  tilesById: new Map(),
  tileGroup: null,
  majorGroup: null,
  labelGroup: null,
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
  entryTileInput: document.getElementById("entryTileInput"),
  entryManualHint: document.getElementById("entryManualHint"),
  entryMapFigure: document.getElementById("entryMapFigure"),
  entryMapViewport: document.getElementById("entryMapViewport"),
  entryMapScene: document.getElementById("entryMapScene"),
  entryMapImage: document.getElementById("entryMapImage"),
  entryMapOverlay: document.getElementById("entryMapOverlay"),
  entryMapTooltip: document.getElementById("entryMapTooltip"),
  entryMapBadgeValue: document.getElementById("entryMapBadgeValue"),
  btnEntrySelectAll: document.getElementById("btnEntrySelectAll"),
  btnEntryClear: document.getElementById("btnEntryClear"),
  btnEntryApplyIds: document.getElementById("btnEntryApplyIds"),
  btnEntryFitMap: document.getElementById("btnEntryFitMap"),
  btnEntryFocusSelection: document.getElementById("btnEntryFocusSelection"),
  btnEntryZoomIn: document.getElementById("btnEntryZoomIn"),
  btnEntryZoomOut: document.getElementById("btnEntryZoomOut"),
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

function compareTileIds(leftId, rightId) {
  const left = parseTileId(leftId);
  const right = parseTileId(rightId);
  if (!left || !right) {
    return leftId.localeCompare(rightId);
  }

  const sheetDiff = Number(left.sheet) - Number(right.sheet);
  if (sheetDiff) {
    return sheetDiff;
  }

  const regionDiff = left.region.localeCompare(right.region);
  if (regionDiff) {
    return regionDiff;
  }

  const rowDiff = left.row - right.row;
  if (rowDiff) {
    return rowDiff;
  }

  return TILE_COLUMNS.indexOf(left.column) - TILE_COLUMNS.indexOf(right.column);
}

function internalTileId(sheet, region, number, subTile) {
  return `${sheet}_${region}_${number}${subTile}`;
}

function displayTileId(sheet, region, number, subTile) {
  return `${sheet}-${region}-${number}${subTile}`;
}

function toDisplayTileId(tileId) {
  const parsed = parseTileId(tileId);
  if (!parsed) {
    return formatTileLabel(tileId);
  }
  return displayTileId(parsed.sheet, parsed.region, parsed.row, parsed.column);
}

function normalizeTileId(rawToken) {
  const cleaned = String(rawToken || "")
    .trim()
    .toUpperCase()
    .replaceAll("_", "-")
    .replace(/\s+/g, "");
  const match = ENTRY_DISPLAY_TILE_PATTERN.exec(cleaned);
  if (!match) {
    return null;
  }
  return internalTileId(match[1], match[2], Number(match[3]), match[4]);
}

function parseManualTileIds(rawValue) {
  const tokens = String(rawValue || "")
    .split(/[\s,;]+/)
    .map((token) => token.trim())
    .filter(Boolean);

  const unique = new Set();
  const valid = [];
  const invalid = [];
  const unavailable = [];

  for (const token of tokens) {
    const normalized = normalizeTileId(token);
    if (!normalized) {
      invalid.push(token);
      continue;
    }
    if (unique.has(normalized)) {
      continue;
    }
    unique.add(normalized);
    if (!state.entry.overview?.tileById.has(normalized)) {
      unavailable.push(toDisplayTileId(normalized));
      continue;
    }
    valid.push(normalized);
  }

  valid.sort(compareTileIds);
  unavailable.sort();
  invalid.sort();

  return {tokens, valid, invalid, unavailable};
}

function setEntryManualHint(message, isError = false) {
  ui.entryManualHint.textContent = message;
  ui.entryManualHint.style.color = isError ? "#b45309" : "#63758f";
}

function hkToPx(east, north) {
  const x = ENTRY_MAP_FRAME.left +
    ((east - ENTRY_MAP_GRID.west) / (ENTRY_MAP_GRID.east - ENTRY_MAP_GRID.west)) *
    (ENTRY_MAP_FRAME.right - ENTRY_MAP_FRAME.left);
  const y = ENTRY_MAP_FRAME.top +
    ((ENTRY_MAP_GRID.north - north) / (ENTRY_MAP_GRID.north - ENTRY_MAP_GRID.south)) *
    (ENTRY_MAP_FRAME.bottom - ENTRY_MAP_FRAME.top);
  return {x, y};
}

function rectFromBounds(west, south, east, north) {
  const p1 = hkToPx(west, north);
  const p2 = hkToPx(east, south);
  return {
    x: p1.x,
    y: p1.y,
    width: p2.x - p1.x,
    height: p2.y - p1.y,
  };
}

function majorBounds(sheetId) {
  const index = Number(sheetId) - 1;
  const row = Math.floor(index / ENTRY_MAP_MODEL.cols);
  const column = index % ENTRY_MAP_MODEL.cols;
  const west = ENTRY_MAP_MODEL.west + column * ENTRY_MAP_MODEL.sheetW;
  const east = west + ENTRY_MAP_MODEL.sheetW;
  const north = ENTRY_MAP_MODEL.north - row * ENTRY_MAP_MODEL.sheetH;
  const south = north - ENTRY_MAP_MODEL.sheetH;
  return {west, east, south, north, row, column};
}

function quadrantBounds(bounds, quadrant) {
  const midX = (bounds.west + bounds.east) / 2;
  const midY = (bounds.south + bounds.north) / 2;
  if (quadrant === "NW") {
    return {west: bounds.west, east: midX, south: midY, north: bounds.north};
  }
  if (quadrant === "NE") {
    return {west: midX, east: bounds.east, south: midY, north: bounds.north};
  }
  if (quadrant === "SW") {
    return {west: bounds.west, east: midX, south: bounds.south, north: midY};
  }
  return {west: midX, east: bounds.east, south: bounds.south, north: midY};
}

function numberBounds(quadrant, number) {
  const index = Number(number) - 1;
  const row = Math.floor(index / 5);
  const column = index % 5;
  const cellWidth = (quadrant.east - quadrant.west) / 5;
  const cellHeight = (quadrant.north - quadrant.south) / 5;
  const west = quadrant.west + column * cellWidth;
  const east = west + cellWidth;
  const north = quadrant.north - row * cellHeight;
  const south = north - cellHeight;
  return {west, east, south, north, row, column};
}

function subBounds(numberCell, subTile) {
  const midX = (numberCell.west + numberCell.east) / 2;
  const midY = (numberCell.south + numberCell.north) / 2;
  if (subTile === "A") {
    return {west: numberCell.west, east: midX, south: midY, north: numberCell.north};
  }
  if (subTile === "B") {
    return {west: midX, east: numberCell.east, south: midY, north: numberCell.north};
  }
  if (subTile === "C") {
    return {west: numberCell.west, east: midX, south: numberCell.south, north: midY};
  }
  return {west: midX, east: numberCell.east, south: numberCell.south, north: midY};
}

function rectForTileId(tileId) {
  const parsed = parseTileId(tileId);
  if (!parsed || !ENTRY_MAP_QUADRANTS.includes(parsed.region) || !ENTRY_MAP_SUBTILES.includes(parsed.column)) {
    return null;
  }

  const major = majorBounds(parsed.sheet);
  const quadrant = quadrantBounds(major, parsed.region);
  const number = numberBounds(quadrant, parsed.row);
  const subTile = subBounds(number, parsed.column);
  return rectFromBounds(subTile.west, subTile.south, subTile.east, subTile.north);
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
  const tileById = new Map();
  const grouped = new Map();

  for (const tile of manifest.tiles) {
    const parsed = parseTileId(tile.id);
    if (!parsed) {
      continue;
    }

    tileById.set(tile.id, tile);
    const existing = grouped.get(parsed.regionKey) || {
      regionKey: parsed.regionKey,
      label: formatRegionLabel(parsed.regionKey),
      tileCount: 0,
      meshCount: 0,
    };

    existing.tileCount += 1;
    existing.meshCount += tile.mesh_count;
    grouped.set(parsed.regionKey, existing);
  }

  const availableTileIds = [...tileById.keys()].sort(compareTileIds);
  if (!availableTileIds.length) {
    return null;
  }

  const regions = [...grouped.values()].sort((left, right) => {
    if (left.regionKey === "11_SW") {
      return -1;
    }
    if (right.regionKey === "11_SW") {
      return 1;
    }
    return right.tileCount - left.tileCount;
  });

  const primaryRegion = regions[0];

  return {
    tileById,
    availableTileIds,
    regions,
    primaryRegion,
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

function createSvgNode(tagName) {
  return document.createElementNS("http://www.w3.org/2000/svg", tagName);
}

function applyEntryMapTransform() {
  ui.entryMapScene.style.transform = `translate(${entryMap.tx}px, ${entryMap.ty}px) scale(${entryMap.scale})`;
}

function clampEntryMapState() {
  const viewport = ui.entryMapFigure.getBoundingClientRect();
  const scaledWidth = ENTRY_MAP_IMAGE.width * entryMap.scale;
  const scaledHeight = ENTRY_MAP_IMAGE.height * entryMap.scale;
  const pad = 80;
  const minTx = Math.min(viewport.width - scaledWidth - pad, pad - scaledWidth * 0.05);
  const maxTx = Math.max(pad, viewport.width - scaledWidth + pad);
  const minTy = Math.min(viewport.height - scaledHeight - pad, pad - scaledHeight * 0.05);
  const maxTy = Math.max(pad, viewport.height - scaledHeight + pad);
  entryMap.tx = Math.min(maxTx, Math.max(minTx, entryMap.tx));
  entryMap.ty = Math.min(maxTy, Math.max(minTy, entryMap.ty));
}

function fitEntryMapToView() {
  if (!state.entry.visible || !entryMap.initialized) {
    return;
  }

  const viewport = ui.entryMapFigure.getBoundingClientRect();
  const scale = Math.min(viewport.width / ENTRY_MAP_IMAGE.width, viewport.height / ENTRY_MAP_IMAGE.height) * 0.96;
  entryMap.scale = scale;
  entryMap.tx = (viewport.width - ENTRY_MAP_IMAGE.width * scale) / 2;
  entryMap.ty = (viewport.height - ENTRY_MAP_IMAGE.height * scale) / 2;
  entryMap.fittedOnce = true;
  applyEntryMapTransform();
}

function zoomEntryMapAt(clientX, clientY, factor) {
  const viewport = ui.entryMapFigure.getBoundingClientRect();
  const localX = clientX - viewport.left;
  const localY = clientY - viewport.top;
  const previousScale = entryMap.scale;
  const nextScale = Math.max(0.3, Math.min(12, previousScale * factor));
  const worldX = (localX - entryMap.tx) / previousScale;
  const worldY = (localY - entryMap.ty) / previousScale;
  entryMap.scale = nextScale;
  entryMap.tx = localX - worldX * nextScale;
  entryMap.ty = localY - worldY * nextScale;
  clampEntryMapState();
  applyEntryMapTransform();
}

function focusEntryMapTiles(tileIds, extraScale = 1.0) {
  const rects = tileIds
    .map((tileId) => entryMap.tilesById.get(tileId)?.rect)
    .filter(Boolean);

  if (!rects.length) {
    return false;
  }

  const bounds = rects.reduce((acc, rect) => ({
    left: Math.min(acc.left, rect.x),
    top: Math.min(acc.top, rect.y),
    right: Math.max(acc.right, rect.x + rect.width),
    bottom: Math.max(acc.bottom, rect.y + rect.height),
  }), {
    left: Number.POSITIVE_INFINITY,
    top: Number.POSITIVE_INFINITY,
    right: Number.NEGATIVE_INFINITY,
    bottom: Number.NEGATIVE_INFINITY,
  });

  const viewport = ui.entryMapFigure.getBoundingClientRect();
  const padding = 42;
  const width = Math.max(36, bounds.right - bounds.left);
  const height = Math.max(36, bounds.bottom - bounds.top);
  const nextScale = Math.min(
    8,
    Math.max(
      0.35,
      Math.min(
        (viewport.width - padding * 2) / width,
        (viewport.height - padding * 2) / height,
      ) * extraScale,
    ),
  );

  entryMap.scale = nextScale;
  entryMap.tx = viewport.width / 2 - ((bounds.left + bounds.right) / 2) * nextScale;
  entryMap.ty = viewport.height / 2 - ((bounds.top + bounds.bottom) / 2) * nextScale;
  clampEntryMapState();
  applyEntryMapTransform();
  return true;
}

function showEntryMapTooltip(clientX, clientY, html) {
  ui.entryMapTooltip.innerHTML = html;
  ui.entryMapTooltip.style.left = `${clientX + 14}px`;
  ui.entryMapTooltip.style.top = `${clientY + 14}px`;
  ui.entryMapTooltip.classList.remove("hidden");
}

function hideEntryMapTooltip() {
  ui.entryMapTooltip.classList.add("hidden");
}

function updateEntryMapBadge(tileId = null) {
  entryMap.lastTileId = tileId;
  ui.entryMapBadgeValue.textContent = tileId ? toDisplayTileId(tileId) : "None";
}

function entryMapTooltipHtml(tileId) {
  const tile = state.entry.overview?.tileById.get(tileId);
  if (!tile) {
    return `<strong>${toDisplayTileId(tileId)}</strong><br>No scene data in the current manifest.`;
  }
  return `<strong>${toDisplayTileId(tileId)}</strong><br>${tile.mesh_count.toLocaleString()} meshes • ${tile.bundle_count} bundles`;
}

function ensureEntryMap() {
  if (entryMap.initialized) {
    return;
  }

  ui.entryMapImage.src = ENTRY_MAP_IMAGE.path;
  ui.entryMapImage.width = ENTRY_MAP_IMAGE.width;
  ui.entryMapImage.height = ENTRY_MAP_IMAGE.height;
  ui.entryMapScene.style.width = `${ENTRY_MAP_IMAGE.width}px`;
  ui.entryMapScene.style.height = `${ENTRY_MAP_IMAGE.height}px`;
  ui.entryMapOverlay.setAttribute("viewBox", `0 0 ${ENTRY_MAP_IMAGE.width} ${ENTRY_MAP_IMAGE.height}`);
  ui.entryMapOverlay.setAttribute("width", ENTRY_MAP_IMAGE.width);
  ui.entryMapOverlay.setAttribute("height", ENTRY_MAP_IMAGE.height);

  entryMap.majorGroup = createSvgNode("g");
  entryMap.tileGroup = createSvgNode("g");
  entryMap.labelGroup = createSvgNode("g");
  ui.entryMapOverlay.replaceChildren(entryMap.majorGroup, entryMap.tileGroup, entryMap.labelGroup);
  entryMap.initialized = true;
}

function buildEntryMap(overview) {
  ensureEntryMap();
  entryMap.tilesById.clear();
  entryMap.majorGroup.replaceChildren();
  entryMap.tileGroup.replaceChildren();
  entryMap.labelGroup.replaceChildren();

  for (let sheet = 1; sheet <= ENTRY_MAP_SHEET_COUNT; sheet += 1) {
    const major = majorBounds(sheet);
    const majorRect = rectFromBounds(major.west, major.south, major.east, major.north);
    const boundary = createSvgNode("rect");
    boundary.setAttribute("x", majorRect.x);
    boundary.setAttribute("y", majorRect.y);
    boundary.setAttribute("width", majorRect.width);
    boundary.setAttribute("height", majorRect.height);
    boundary.setAttribute("class", "entryMajorBoundary");
    entryMap.majorGroup.appendChild(boundary);

    const label = createSvgNode("text");
    label.setAttribute("x", majorRect.x + majorRect.width / 2);
    label.setAttribute("y", majorRect.y + majorRect.height / 2);
    label.setAttribute("class", "entryMajorLabel");
    label.textContent = String(sheet);
    entryMap.labelGroup.appendChild(label);
  }

  for (let sheet = 1; sheet <= ENTRY_MAP_SHEET_COUNT; sheet += 1) {
    for (const quadrant of ENTRY_MAP_QUADRANTS) {
      for (let number = 1; number <= 25; number += 1) {
        for (const subTile of ENTRY_MAP_SUBTILES) {
          const tileId = internalTileId(sheet, quadrant, number, subTile);
          const rect = rectForTileId(tileId);
          if (!rect) {
            continue;
          }

          const tile = overview.tileById.get(tileId);
          const node = createSvgNode("rect");
          node.setAttribute("x", rect.x);
          node.setAttribute("y", rect.y);
          node.setAttribute("width", rect.width);
          node.setAttribute("height", rect.height);
          node.setAttribute("data-tile-id", tileId);
          node.setAttribute("data-display-id", toDisplayTileId(tileId));
          node.setAttribute("class", `entryTileCell ${tile ? "available" : "unavailable"}`);
          entryMap.tileGroup.appendChild(node);

          entryMap.tilesById.set(tileId, {
            id: tileId,
            displayId: toDisplayTileId(tileId),
            available: Boolean(tile),
            rect,
            el: node,
          });
        }
      }
    }
  }

  if (!entryMap.fittedOnce) {
    window.requestAnimationFrame(() => fitEntryMapToView());
  } else {
    applyEntryMapTransform();
  }
}

function showEntryScreen() {
  if (!state.entry.overview) {
    return;
  }
  state.entry.visible = true;
  ui.entryScreen.classList.remove("hidden");
  window.requestAnimationFrame(() => {
    const selected = tileSelections();
    if (selected.length) {
      focusEntryMapTiles(selected, 1.1);
      return;
    }
    if (!entryMap.fittedOnce) {
      fitEntryMapToView();
      return;
    }
    applyEntryMapTransform();
  });
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

  const selected = tileSelections().filter((tileId) => overview.tileById.has(tileId)).sort(compareTileIds);
  const loaded = [...viewer.loadedTileIds].filter((tileId) => overview.tileById.has(tileId)).sort(compareTileIds);
  const selectedSet = new Set(selected);
  const loadedSet = new Set(loaded);
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
  ui.btnEntryApplyIds.disabled = state.tileLoadBusy;
  ui.entryTileInput.disabled = state.tileLoadBusy;
  ui.btnEntryFocusSelection.disabled = selected.length === 0;
  ui.btnOpenTileIndex.disabled = state.tileLoadBusy;

  for (const [tileId, tileEntry] of entryMap.tilesById.entries()) {
    tileEntry.available = overview.tileById.has(tileId);
    tileEntry.el.classList.toggle("available", tileEntry.available);
    tileEntry.el.classList.toggle("unavailable", !tileEntry.available);
    tileEntry.el.classList.toggle("selected", selectedSet.has(tileId));
    tileEntry.el.classList.toggle("loaded", loadedSet.has(tileId));
    tileEntry.el.setAttribute("aria-pressed", String(selectedSet.has(tileId)));
  }

  if (!entryMap.lastTileId) {
    updateEntryMapBadge(selected[0] || loaded[0] || null);
  }
}

function renderEntryOverview() {
  const overview = state.entry.overview;
  if (!overview) {
    return;
  }

  const regionList = overview.regions.slice(0, 4).map((region) => region.label).join(", ");
  const regionSuffix = overview.regions.length > 4 ? ", ..." : "";
  const primaryRegion = overview.primaryRegion?.label || "Hong Kong";

  ui.entryRegionTitle.textContent = "Hong Kong Tile Index";
  ui.entryRegionLead.textContent = overview.regions.length === 1
    ? `Scene data currently covers ${primaryRegion}. Select tiles directly on the map or paste tile IDs manually, then enter the 3D scene for path and radio-map analysis.`
    : `Scene data spans ${overview.regions.length} mapped regions, led by ${primaryRegion}. Select tiles directly on the map or paste tile IDs manually, then enter the 3D scene for path and radio-map analysis.`;
  ui.entryMapTitle.textContent = "Hong Kong Tile Map";
  ui.entryMapSub.textContent = `Major sheet -> quadrant -> numbered cell -> A/B/C/D subtile. Manifest regions: ${regionList}${regionSuffix}.`;

  buildEntryMap(overview);
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

function applyEntryTileInput() {
  const {tokens, valid, invalid, unavailable} = parseManualTileIds(ui.entryTileInput.value);
  if (!tokens.length) {
    setEntryManualHint("Enter one or more tile IDs, for example 11-SW-7A or 11-SW-7B.", true);
    return;
  }

  if (!valid.length) {
    const parts = [];
    if (invalid.length) {
      parts.push(`Invalid format: ${invalid.join(", ")}`);
    }
    if (unavailable.length) {
      parts.push(`No scene data: ${unavailable.join(", ")}`);
    }
    setEntryManualHint(parts.join(" | "), true);
    return;
  }

  setTileSelection(valid);
  updateEntryMapBadge(valid[0]);
  focusEntryMapTiles(valid, valid.length > 1 ? 0.98 : 1.08);

  const notes = [`Selected ${valid.length} tile${valid.length === 1 ? "" : "s"}.`];
  if (invalid.length) {
    notes.push(`Ignored invalid IDs: ${invalid.join(", ")}`);
  }
  if (unavailable.length) {
    notes.push(`Ignored unavailable IDs: ${unavailable.join(", ")}`);
  }
  setEntryManualHint(notes.join(" "));
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
  const entryTileTarget = (target) => (
    target instanceof Element && target.classList.contains("entryTileCell") ? target : null
  );

  ui.panelToggle.addEventListener("click", () => {
    ui.panelBody.classList.toggle("hidden");
  });

  ui.entryMapFigure.addEventListener("wheel", (event) => {
    event.preventDefault();
    const factor = event.deltaY < 0 ? 1.12 : 1 / 1.12;
    zoomEntryMapAt(event.clientX, event.clientY, factor);
  }, {passive: false});

  ui.entryMapFigure.addEventListener("pointerdown", (event) => {
    if (entryTileTarget(event.target)) {
      return;
    }
    entryMap.dragging = true;
    entryMap.movedDuringDrag = false;
    entryMap.startX = event.clientX;
    entryMap.startY = event.clientY;
    entryMap.baseTx = entryMap.tx;
    entryMap.baseTy = entryMap.ty;
    ui.entryMapFigure.classList.add("dragging");
    ui.entryMapFigure.setPointerCapture(event.pointerId);
  });

  ui.entryMapFigure.addEventListener("pointermove", (event) => {
    const tileTarget = entryTileTarget(event.target);
    if (tileTarget && !entryMap.dragging) {
      showEntryMapTooltip(event.clientX, event.clientY, entryMapTooltipHtml(tileTarget.dataset.tileId));
    } else if (!entryMap.dragging) {
      hideEntryMapTooltip();
    }

    if (!entryMap.dragging) {
      return;
    }

    const dx = event.clientX - entryMap.startX;
    const dy = event.clientY - entryMap.startY;
    if (Math.abs(dx) > 4 || Math.abs(dy) > 4) {
      entryMap.movedDuringDrag = true;
    }
    entryMap.tx = entryMap.baseTx + dx;
    entryMap.ty = entryMap.baseTy + dy;
    clampEntryMapState();
    applyEntryMapTransform();
    hideEntryMapTooltip();
  });

  const stopEntryMapDrag = (event) => {
    if (!entryMap.dragging) {
      return;
    }
    entryMap.dragging = false;
    ui.entryMapFigure.classList.remove("dragging");
    try {
      ui.entryMapFigure.releasePointerCapture(event.pointerId);
    } catch (error) {
      // Ignore browsers that already released capture.
    }
  };

  ui.entryMapFigure.addEventListener("pointerup", stopEntryMapDrag);
  ui.entryMapFigure.addEventListener("pointercancel", stopEntryMapDrag);
  ui.entryMapFigure.addEventListener("mouseleave", () => {
    hideEntryMapTooltip();
  });

  ui.entryMapOverlay.addEventListener("click", (event) => {
    const tileTarget = entryTileTarget(event.target);
    if (!tileTarget || entryMap.movedDuringDrag) {
      return;
    }

    const tileId = tileTarget.dataset.tileId;
    updateEntryMapBadge(tileId);
    if (state.tileLoadBusy) {
      return;
    }
    if (!state.entry.overview?.tileById.has(tileId)) {
      setEntryManualHint(`${toDisplayTileId(tileId)} has no scene data in the current manifest.`, true);
      return;
    }
    toggleTileChecked(tileId);
    setEntryManualHint(`Selected ${toDisplayTileId(tileId)} from the map.`);
  });

  ui.btnEntrySelectAll.addEventListener("click", () => {
    setTileSelection(state.entry.overview?.availableTileIds || []);
    setEntryManualHint("Selected every available tile in the current manifest.");
  });
  ui.btnEntryClear.addEventListener("click", () => {
    setTileSelection([]);
    setEntryManualHint("Selection cleared.");
  });
  ui.btnEntryApplyIds.addEventListener("click", applyEntryTileInput);
  ui.entryTileInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      applyEntryTileInput();
    }
  });
  ui.btnEntryFitMap.addEventListener("click", () => {
    fitEntryMapToView();
    setEntryManualHint("Map view reset to the full Hong Kong index.");
  });
  ui.btnEntryFocusSelection.addEventListener("click", () => {
    const selected = tileSelections();
    if (!selected.length) {
      setEntryManualHint("Select at least one tile before focusing the map.", true);
      return;
    }
    focusEntryMapTiles(selected, selected.length > 1 ? 0.98 : 1.08);
  });
  ui.btnEntryZoomIn.addEventListener("click", () => {
    const viewport = ui.entryMapFigure.getBoundingClientRect();
    zoomEntryMapAt(viewport.left + viewport.width / 2, viewport.top + viewport.height / 2, 1.2);
  });
  ui.btnEntryZoomOut.addEventListener("click", () => {
    const viewport = ui.entryMapFigure.getBoundingClientRect();
    zoomEntryMapAt(viewport.left + viewport.width / 2, viewport.top + viewport.height / 2, 1 / 1.2);
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

  window.addEventListener("resize", () => {
    if (!state.entry.visible) {
      return;
    }
    const selected = tileSelections();
    if (selected.length) {
      focusEntryMapTiles(selected, selected.length > 1 ? 0.98 : 1.08);
      return;
    }
    fitEntryMapToView();
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
