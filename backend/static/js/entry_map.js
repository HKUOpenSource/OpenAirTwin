import {
  CARTO_LIGHT_ATTRIBUTION,
  CARTO_LIGHT_URL,
  ENTRY_MAP_GRID,
  ENTRY_MAP_IMAGE,
  ENTRY_MAP_INITIAL_ZOOM,
  ENTRY_MAP_MAX_ZOOM,
  ENTRY_MAP_MIN_ZOOM,
  ENTRY_MAP_SUBTILES,
  ENTRY_PLACE_SEARCH_ZOOM,
  NOMINATIM_HK_COUNTRYCODES,
  NOMINATIM_MIN_INTERVAL_MS,
  NOMINATIM_RESULT_LIMIT,
  NOMINATIM_SEARCH_URL,
  assertEntryMapDeps,
  boundsForTileId,
  compareTileIds,
  entryFallbackImageBounds,
  entryMapCenter,
  entryModelBounds,
  entrySearchViewbox,
  formatRegionLabel,
  hkBoundsCorners,
  latLngBoundsFromHk,
  latLngToHk,
  mergeHkBounds,
  parseTileId,
  pointInHkBounds,
  toDisplayTileId,
} from "/js/tile_model.js";

export function createEntryMapController(context) {
  const {state, entryMap, ui, viewerRef} = context;
  const shellUi = context.featureServices.shellUi;
  const {createTileDownloadJob, getTileDownloadJob, cancelTileDownloadJob, getManifest} = context.api;
  const getViewer = () => viewerRef.current;
  const scene = () => context.controllers.scene;
  const dialogs = () => context.controllers.dialogs;
  const performancePanel = () => context.controllers.performance;

  function tileSelections() {
    return scene().tileSelections();
  }

  function toggleTileChecked(tileId) {
    scene().toggleTileChecked(tileId);
  }

  function syncControlSidebarUi() {
    scene().syncControlSidebarUi();
  }

  function syncPerformanceUi() {
    performancePanel().syncPerformanceUi();
  }

function setEntrySearchHint(message, isError = false) {
  ui.entrySearchHint.textContent = message;
  ui.entrySearchHint.classList.toggle("is-error", isError);
}


function tileIdAtLatLng(latLng) {
  const point = latLngToHk(latLng);
  for (const [tileId, tileEntry] of entryMap.tilesById.entries()) {
    if (pointInHkBounds(point, tileEntry.bounds)) {
      return tileId;
    }
  }
  return null;
}

function coverageTileCorners(coverageTile) {
  const corners = Array.isArray(coverageTile?.wgs84_corners) ? coverageTile.wgs84_corners : [];
  const latLngs = corners
    .map((corner) => {
      const lon = Number(corner?.[0]);
      const lat = Number(corner?.[1]);
      return Number.isFinite(lon) && Number.isFinite(lat) ? window.L.latLng(lat, lon) : null;
    })
    .filter(Boolean);
  return latLngs.length >= 3 ? latLngs : null;
}

function hkBoundsFromLatLngCorners(corners) {
  const points = corners.map((corner) => latLngToHk(corner));
  return {
    west: Math.min(...points.map((point) => point.east)),
    east: Math.max(...points.map((point) => point.east)),
    south: Math.min(...points.map((point) => point.north)),
    north: Math.max(...points.map((point) => point.north)),
  };
}

function tileLayerCorners(tileEntry) {
  return tileEntry.corners || hkBoundsCorners(tileEntry.bounds);
}

function parsePlaceLatLng(result) {
  const lat = Number(result.lat);
  const lon = Number(result.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return null;
  }
  return window.L.latLng(lat, lon);
}

function parsePlaceBounds(result) {
  if (!Array.isArray(result.boundingbox) || result.boundingbox.length !== 4) {
    return null;
  }
  const [south, north, west, east] = result.boundingbox.map(Number);
  if (![south, north, west, east].every(Number.isFinite)) {
    return null;
  }
  return window.L.latLngBounds([
    [south, west],
    [north, east],
  ]);
}

function placeResultTitle(result) {
  const displayName = String(result.display_name || "Unknown place");
  return displayName.split(",")[0].trim() || displayName;
}

function placeResultDetail(result) {
  const parts = String(result.display_name || "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  return parts.slice(1, 5).join(", ") || "Hong Kong";
}

function placeResultMeta(result) {
  const className = String(result.class || "place").replaceAll("_", " ");
  const typeName = String(result.type || "location").replaceAll("_", " ");
  return `${className} / ${typeName}`;
}

function clearEntryPlaceResults() {
  state.entry.search.results = [];
  state.entry.search.selectedIndex = -1;
  shellUi.updateEntryPlaces([]);
}

function renderEntryPlaceResults(results) {
  state.entry.search.results = results;
  shellUi.updateEntryPlaces(results.map((result, index) => ({
    index,
    title: placeResultTitle(result),
    detail: placeResultDetail(result),
    meta: placeResultMeta(result),
    active: state.entry.search.selectedIndex === index,
  })));
}

function clearEntrySearchFocus() {
  if (entryMap.searchMarker) {
    entryMap.searchMarker.remove();
    entryMap.searchMarker = null;
  }
  if (entryMap.searchHighlightLayer) {
    entryMap.searchHighlightLayer.remove();
    entryMap.searchHighlightLayer = null;
  }
}

function setEntrySearchFocus(latLng, tileId) {
  clearEntrySearchFocus();
  if (!entryMap.map) {
    return;
  }

  entryMap.searchMarker = window.L.circleMarker(latLng, {
    pane: "entrySearchPane",
    radius: 7,
    color: "#b45309",
    weight: 2,
    opacity: 1,
    fillColor: "#f59e0b",
    fillOpacity: 0.86,
    interactive: false,
  }).addTo(entryMap.map);

  if (!tileId) {
    return;
  }

  const tileEntry = entryMap.tilesById.get(tileId);
  if (!tileEntry) {
    return;
  }
  entryMap.searchHighlightLayer = createEntryTilePolygon(tileEntry, {
    pane: "entrySearchPane",
    color: "#b45309",
    weight: 2.2,
    opacity: 1,
    fillColor: "#f59e0b",
    fillOpacity: 0.18,
    interactive: false,
  }).addTo(entryMap.map);
}

function focusEntryPlaceResult(index) {
  const result = state.entry.search.results[index];
  const latLng = result ? parsePlaceLatLng(result) : null;
  if (!result || !latLng || !entryMap.map) {
    setEntrySearchHint("This search result has no usable map location.", true);
    return;
  }

  state.entry.search.selectedIndex = index;
  renderEntryPlaceResults(state.entry.search.results);

  const bounds = parsePlaceBounds(result);
  if (bounds?.isValid()) {
    entryMap.map.fitBounds(bounds, {
      animate: true,
      padding: [84, 84],
      maxZoom: ENTRY_PLACE_SEARCH_ZOOM,
    });
  } else {
    entryMap.map.setView(latLng, Math.max(entryMap.map.getZoom(), ENTRY_PLACE_SEARCH_ZOOM), {
      animate: true,
    });
  }

  const tileId = tileIdAtLatLng(latLng);
  setEntrySearchFocus(latLng, tileId);
  if (tileId) {
    syncEntryOverviewUi();
    if (state.entry.overview?.tileById.has(tileId)) {
      setEntrySearchHint(`Located in ${toDisplayTileId(tileId)}. Click the tile on the map to select it.`);
    } else {
      setEntrySearchHint(`Located in ${toDisplayTileId(tileId)}. Click the tile on the map to download it.`);
    }
  } else {
    setEntrySearchHint("Located the place, but Open3DHK has no downloadable tile at that point.", true);
  }
}

function buildEntryPlaceSearchUrl(query) {
  assertEntryMapDeps();
  const url = new URL(NOMINATIM_SEARCH_URL);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("q", query);
  url.searchParams.set("limit", String(NOMINATIM_RESULT_LIMIT));
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("countrycodes", NOMINATIM_HK_COUNTRYCODES);
  url.searchParams.set("viewbox", entrySearchViewbox());
  url.searchParams.set("bounded", "1");
  url.searchParams.set("accept-language", "en,zh-HK,zh");
  return url;
}

async function runEntryPlaceSearch() {
  const query = ui.entryPlaceInput.value.trim();
  if (!query) {
    setEntrySearchHint("Enter a Hong Kong place name, for example HKU or Central.", true);
    clearEntryPlaceResults();
    return;
  }

  const now = window.performance.now();
  const elapsed = now - state.entry.search.lastRequestAt;
  if (elapsed < NOMINATIM_MIN_INTERVAL_MS) {
    setEntrySearchHint("Please wait a moment before searching again.", true);
    return;
  }

  state.entry.search.lastRequestAt = now;
  state.entry.search.inFlight = true;
  syncEntryOverviewUi();
  setEntrySearchHint(`Searching Hong Kong for "${query}"...`);
  clearEntryPlaceResults();

  try {
    const response = await fetch(buildEntryPlaceSearchUrl(query).toString(), {
      headers: {
        "Accept": "application/json",
      },
    });
    if (!response.ok) {
      throw new Error(`Search request failed: ${response.status}`);
    }
    const results = await response.json();
    const usableResults = Array.isArray(results)
      ? results.filter((result) => parsePlaceLatLng(result)).slice(0, NOMINATIM_RESULT_LIMIT)
      : [];

    if (!usableResults.length) {
      setEntrySearchHint(`No Hong Kong place found for "${query}".`, true);
      return;
    }

    renderEntryPlaceResults(usableResults);
    setEntrySearchHint(`Found ${usableResults.length} result${usableResults.length === 1 ? "" : "s"}. Choose one to locate it on the map.`);
  } catch (error) {
    setEntrySearchHint("Place search is unavailable right now. The current map and tile selection were not changed.", true);
  } finally {
    state.entry.search.inFlight = false;
    syncEntryOverviewUi();
  }
}
function buildEntryOverview(manifest, coverage = null) {
  const tileById = new Map();
  const coverageById = new Map();
  const grouped = new Map();

  for (const tile of coverage?.tiles || []) {
    if (!tile?.id || !Array.isArray(tile.wgs84_corners)) {
      continue;
    }
    coverageById.set(tile.id, tile);
  }

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
  const regions = [...grouped.values()].sort((left, right) => {
    if (left.regionKey === "11_SW") {
      return -1;
    }
    if (right.regionKey === "11_SW") {
      return 1;
    }
    return right.tileCount - left.tileCount;
  });

  return {
    tileById,
    coverageById,
    availableTileIds,
    regions,
    primaryRegion: regions[0] || null,
  };
}
function enableEntryMapFallback(reason = "tile unavailable") {
  if (!entryMap.map || entryMap.fallbackEnabled) {
    return;
  }
  entryMap.fallbackEnabled = true;
  if (entryMap.tileLayer && entryMap.map.hasLayer(entryMap.tileLayer)) {
    entryMap.map.removeLayer(entryMap.tileLayer);
  }
  if (entryMap.fallbackLayer && !entryMap.map.hasLayer(entryMap.fallbackLayer)) {
    entryMap.fallbackLayer.addTo(entryMap.map);
  }
  ui.entryMapFigure.classList.add("fallback");
  console.info(`Entry map using local fallback basemap: ${reason}`);
}

function fitEntryMapToView() {
  if (!state.entry.visible || !entryMap.initialized || !entryMap.map) {
    return;
  }

  entryMap.map.invalidateSize();
  entryMap.map.fitBounds(latLngBoundsFromHk(entryModelBounds()), {
    animate: false,
    padding: [24, 24],
  });
  entryMap.fittedOnce = true;
}

function focusEntryMapTiles(tileIds) {
  if (!entryMap.map) {
    return false;
  }

  const hkBounds = tileIds
    .map((tileId) => entryMap.tilesById.get(tileId)?.bounds)
    .filter(Boolean);

  if (!hkBounds.length) {
    return false;
  }

  const bounds = mergeHkBounds(hkBounds);
  entryMap.map.invalidateSize();
  entryMap.map.fitBounds(latLngBoundsFromHk(bounds), {
    animate: true,
    padding: [84, 84],
    maxZoom: hkBounds.length === 1 ? 16 : 14,
  });
  return true;
}

function setEntryMapTooltipContent(parts) {
  const tooltip = ui.entryMapTooltip;
  const title = tooltip.querySelector("[data-entry-tooltip-title]");
  const lineBreak = tooltip.querySelector("[data-entry-tooltip-break]");
  const body = tooltip.querySelector("[data-entry-tooltip-body]");
  title.textContent = parts.title;
  body.textContent = parts.body || "";
  lineBreak.classList.toggle("hidden", !parts.body);
  body.classList.toggle("hidden", !parts.body);
}

function showEntryMapTooltip(clientX, clientY, parts) {
  const viewport = ui.entryMapFigure.getBoundingClientRect();
  setEntryMapTooltipContent(parts);
  ui.entryMapTooltip.style.left = `${clientX - viewport.left + 14}px`;
  ui.entryMapTooltip.style.top = `${clientY - viewport.top + 14}px`;
  ui.entryMapTooltip.classList.remove("hidden");
}

function hideEntryMapTooltip() {
  ui.entryMapTooltip.classList.add("hidden");
}

function updateEntryMapBadge({selectedCount = 0, loadedCount = 0, pendingCount = 0, downloadingCount = 0, meshCount = 0} = {}) {
  ui.entryMapBadgeValue.textContent = `${selectedCount} selected`;
  const detailParts = [
    `${loadedCount} loaded`,
    `${pendingCount} pending`,
  ];
  if (meshCount > 0) {
    detailParts.push(`${meshCount.toLocaleString()} meshes`);
  }
  if (downloadingCount > 0) {
    detailParts.push(`${downloadingCount} downloading`);
  }
  ui.entryMapBadgeDetail.textContent = detailParts.join(" · ");
}

function entryMapTooltipParts(tileId) {
  const title = toDisplayTileId(tileId);
  const downloadState = state.entry.downloadingTileIds.get(tileId);
  if (downloadState) {
    return {title, body: downloadState.message || "Downloading GLTF tile..."};
  }
  const tile = state.entry.overview?.tileById.get(tileId);
  if (tile) {
    return {
      title,
      body: `In scene: ${tile.mesh_count.toLocaleString()} meshes • ${tile.bundle_count} bundles`,
    };
  }
  if (state.entry.overview?.coverageById.has(tileId)) {
    return {title, body: "Downloadable from Open3DHK. Click to download GLTF and create this tile XML."};
  }
  return {title, body: "No Open3DHK download is available for this tile."};
}

function selectEntryMapTile(tileId) {
  if (!tileId) {
    return;
  }
  if (state.tileLoadBusy || state.entry.downloadingTileIds.has(tileId)) {
    return;
  }
  if (state.entry.downloadingTileIds.size > 0) {
    setEntrySearchHint("Finish or cancel the current tile download before starting another.", true);
    return;
  }
  if (!state.entry.overview?.tileById.has(tileId) && !state.entry.overview?.coverageById.has(tileId)) {
    setEntrySearchHint(`${toDisplayTileId(tileId)} is outside the Open3DHK downloadable coverage.`, true);
    return;
  }
  if (!state.entry.overview?.tileById.has(tileId)) {
    downloadEntryMapTile(tileId);
    return;
  }
  toggleTileChecked(tileId);
}

function entryTileLayerStyle(tileEntry, hover = false) {
  if (tileEntry.downloading) {
    return {
      color: "rgba(180,83,9,.98)",
      weight: hover ? 1.35 : 1,
      opacity: 1,
      fillColor: "#f59e0b",
      fillOpacity: hover ? 0.34 : 0.24,
      renderer: entryMap.tileRenderer,
    };
  }
  if (tileEntry.loaded) {
    return {
      color: tileEntry.selected ? "rgba(27,139,87,.98)" : "rgba(27,139,87,.92)",
      weight: tileEntry.selected ? 1.35 : 1,
      opacity: 1,
      fillColor: "#1eb980",
      fillOpacity: tileEntry.selected ? 0.36 : 0.24,
      renderer: entryMap.tileRenderer,
    };
  }
  if (tileEntry.selected) {
    return {
      color: "rgba(31,111,255,.98)",
      weight: 1.35,
      opacity: 1,
      fillColor: "#1f6fff",
      fillOpacity: 0.34,
      renderer: entryMap.tileRenderer,
    };
  }
  return {
    color: tileEntry.inScene ? (hover ? "rgba(31,111,255,.88)" : "rgba(31,111,255,.40)") : "rgba(91,107,127,.44)",
    weight: hover ? 1.2 : 0.75,
    opacity: 1,
    fillColor: tileEntry.inScene ? "#1f6fff" : "#8a98aa",
    fillOpacity: tileEntry.inScene ? (hover ? 0.18 : 0.065) : (hover ? 0.12 : 0.045),
    dashArray: tileEntry.inScene ? null : "4 3",
    renderer: entryMap.tileRenderer,
  };
}

function syncEntryTileLayerStyle(tileEntry) {
  if (!tileEntry?.layer) {
    return;
  }
  tileEntry.layer.setStyle(entryTileLayerStyle(tileEntry, entryMap.hoveredTileId === tileEntry.id));
}

function createEntryPolygon(bounds, options) {
  return window.L.polygon(hkBoundsCorners(bounds), options);
}

function createEntryTilePolygon(tileEntry, options) {
  return window.L.polygon(tileLayerCorners(tileEntry), options);
}

function createEntryTileLayer(tileEntry) {
  const layer = createEntryTilePolygon(tileEntry, {
    ...entryTileLayerStyle(tileEntry),
    interactive: true,
  });

  layer.on("mouseover", (event) => {
    entryMap.hoveredTileId = tileEntry.id;
    syncEntryTileLayerStyle(tileEntry);
    if (event.originalEvent) {
      showEntryMapTooltip(event.originalEvent.clientX, event.originalEvent.clientY, entryMapTooltipParts(tileEntry.id));
    }
  });
  layer.on("mousemove", (event) => {
    if (event.originalEvent) {
      showEntryMapTooltip(event.originalEvent.clientX, event.originalEvent.clientY, entryMapTooltipParts(tileEntry.id));
    }
  });
  layer.on("mouseout", () => {
    if (entryMap.hoveredTileId === tileEntry.id) {
      entryMap.hoveredTileId = null;
    }
    hideEntryMapTooltip();
    syncEntryTileLayerStyle(tileEntry);
  });
  layer.on("click", (event) => {
    if (event.originalEvent) {
      window.L.DomEvent.stopPropagation(event.originalEvent);
    }
    selectEntryMapTile(tileEntry.id);
  });

  return layer;
}

function ensureEntryMap() {
  if (entryMap.initialized) {
    return;
  }

  assertEntryMapDeps();
  ui.entryMapScene.replaceChildren();

  entryMap.map = window.L.map(ui.entryMapScene, {
    zoomControl: false,
    attributionControl: true,
    scrollWheelZoom: true,
    doubleClickZoom: true,
    touchZoom: true,
    boxZoom: true,
    keyboard: true,
    minZoom: ENTRY_MAP_MIN_ZOOM,
    maxZoom: ENTRY_MAP_MAX_ZOOM,
    zoomSnap: 0.25,
    zoomDelta: 0.5,
    wheelDebounceTime: 60,
    wheelPxPerZoomLevel: 90,
    maxBoundsViscosity: 0.45,
  });
  entryMap.map.setMaxBounds(latLngBoundsFromHk(ENTRY_MAP_GRID).pad(0.35));
  entryMap.map.setView(entryMapCenter(), ENTRY_MAP_INITIAL_ZOOM);
  entryMap.map.createPane("entryTilePane");
  entryMap.map.getPane("entryTilePane").style.zIndex = "650";
  entryMap.map.getPane("entryTilePane").style.pointerEvents = "auto";
  entryMap.map.createPane("entrySearchPane");
  entryMap.map.getPane("entrySearchPane").style.zIndex = "690";
  entryMap.map.getPane("entrySearchPane").style.pointerEvents = "none";
  entryMap.tileRenderer = window.L.canvas({
    pane: "entryTilePane",
    padding: 0.45,
  });
  entryMap.tileLayerGroup = window.L.layerGroup().addTo(entryMap.map);

  entryMap.tileLayer = window.L.tileLayer(CARTO_LIGHT_URL, {
    attribution: CARTO_LIGHT_ATTRIBUTION,
    subdomains: "abcd",
    maxZoom: 19,
    detectRetina: true,
    crossOrigin: true,
    className: "entryCartoTileLayer",
  });
  entryMap.tileLayer.on("tileload", () => {
    entryMap.tilesLoaded += 1;
    if (entryMap.fallbackTimer) {
      window.clearTimeout(entryMap.fallbackTimer);
      entryMap.fallbackTimer = null;
    }
  });
  entryMap.tileLayer.on("tileerror", () => enableEntryMapFallback("online tile error"));
  entryMap.tileLayer.addTo(entryMap.map);
  entryMap.fallbackTimer = window.setTimeout(() => {
    if (entryMap.tilesLoaded === 0) {
      enableEntryMapFallback("online tile timeout");
    }
  }, 4000);
  entryMap.fallbackLayer = window.L.imageOverlay(
    ENTRY_MAP_IMAGE.path,
    latLngBoundsFromHk(entryFallbackImageBounds()),
    {
      className: "entryFallbackImageLayer",
      interactive: false,
      opacity: 1,
    },
  );

  entryMap.map.on("movestart zoomstart", () => {
    hideEntryMapTooltip();
  });
  entryMap.map.on("moveend zoomend resize viewreset", () => {
    hideEntryMapTooltip();
  });
  ui.btnEntryZoomIn.disabled = false;
  ui.btnEntryZoomOut.disabled = false;
  ui.btnEntryZoomIn.title = "Zoom into the OSM basemap and tile grid.";
  ui.btnEntryZoomOut.title = "Zoom out from the OSM basemap and tile grid.";
  entryMap.initialized = true;
}

function buildEntryMap(overview) {
  ensureEntryMap();
  entryMap.tilesById.clear();
  entryMap.hoveredTileId = null;
  entryMap.tileLayerGroup.clearLayers();

  const interactiveTileIds = new Set([
    ...overview.coverageById.keys(),
    ...overview.tileById.keys(),
  ]);
  for (const tileId of [...interactiveTileIds].sort(compareTileIds)) {
    const coverageTile = overview.coverageById.get(tileId);
    const corners = coverageTileCorners(coverageTile);
    const bounds = boundsForTileId(tileId) || (corners ? hkBoundsFromLatLngCorners(corners) : null);
    if (!bounds) {
      continue;
    }
    const tileEntry = {
      id: tileId,
      displayId: toDisplayTileId(tileId),
      inScene: overview.tileById.has(tileId),
      downloadable: overview.coverageById.has(tileId),
      selected: false,
      loaded: false,
      downloading: state.entry.downloadingTileIds.has(tileId),
      bounds,
      corners,
      layer: null,
    };
    tileEntry.layer = createEntryTileLayer(tileEntry);
    tileEntry.layer.addTo(entryMap.tileLayerGroup);
    entryMap.tilesById.set(tileId, tileEntry);
  }

  if (!entryMap.fittedOnce) {
    window.requestAnimationFrame(() => fitEntryMapToView());
  }
}

function showEntryScreen() {
  if (!state.entry.overview) {
    return;
  }
  state.entry.visible = true;
  ui.entryScreen.classList.remove("hidden");
  syncEntrySidebarUi();
  syncControlSidebarUi();
  syncPerformanceUi();
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
    entryMap.map?.invalidateSize();
  });
  syncEntryOverviewUi();
}

function hideEntryScreen() {
  state.entry.visible = false;
  ui.entryScreen.classList.add("hidden");
  syncControlSidebarUi();
  syncPerformanceUi();
}

function syncEntrySidebarUi() {
  const collapsed = state.entry.sidebarCollapsed;
  ui.entryScreen.classList.toggle("sidebarCollapsed", collapsed);
  ui.btnEntrySidebarToggle.setAttribute("aria-label", collapsed ? "Open search sidebar" : "Collapse search sidebar");
  ui.btnEntrySidebarToggle.setAttribute("aria-expanded", String(!collapsed));
  if (ui.entrySidebarStack) {
    ui.entrySidebarStack.inert = collapsed;
    ui.entrySidebarStack.setAttribute("aria-hidden", String(collapsed));
  }
}

function syncControlSidebarUi() {
  const collapsed = state.panelCollapsed;
  const visible = ui.panel.style.display === "flex" && !state.entry.visible;
  ui.panel.classList.toggle("panelCollapsed", collapsed);
  ui.panelToggle.classList.toggle("panelCollapsed", collapsed);
  ui.panelToggle.classList.toggle("hidden", !visible);
  ui.panelToggle.setAttribute("aria-label", collapsed ? "Open control sidebar" : "Collapse control sidebar");
  ui.panelToggle.setAttribute("aria-expanded", String(!collapsed));
  ui.panel.inert = !visible || collapsed;
  ui.panel.setAttribute("aria-hidden", String(!visible || collapsed));
}

function syncEntryOverviewUi() {
  const overview = state.entry.overview;
  if (!overview) {
    return;
  }

  const selected = tileSelections().filter((tileId) => overview.tileById.has(tileId)).sort(compareTileIds);
  const loaded = [...getViewer().loadedTileIds].filter((tileId) => overview.tileById.has(tileId)).sort(compareTileIds);
  const selectedSet = new Set(selected);
  const loadedSet = new Set(loaded);
  const selectedMeshCount = selected.reduce((sum, tileId) => sum + overview.tileById.get(tileId).mesh_count, 0);
  const selectedLoadedCount = selected.filter((tileId) => loadedSet.has(tileId)).length;
  const pendingCount = Math.max(0, selected.length - selectedLoadedCount);
  const downloadingCount = state.entry.downloadingTileIds.size;

  updateEntryMapBadge({
    selectedCount: selected.length,
    loadedCount: selected.length ? selectedLoadedCount : loaded.length,
    pendingCount,
    downloadingCount,
    meshCount: selectedMeshCount,
  });
  const sceneActionDisabled = state.tileLoadBusy || downloadingCount > 0 || selected.length === 0;
  const sceneActionLabel = state.entry.sceneReady ? "Apply Tile Selection" : "Load Selected Tiles";
  ui.btnEnterScene.disabled = sceneActionDisabled;
  ui.btnEnterScene.textContent = sceneActionLabel;
  ui.btnEntryReturnScene.disabled = state.tileLoadBusy || !state.entry.sceneReady;
  ui.btnEntrySearch.disabled = state.tileLoadBusy || state.entry.search.inFlight;
  ui.entryPlaceInput.disabled = state.tileLoadBusy || state.entry.search.inFlight;
  ui.btnEntryFocusSelection.disabled = selected.length === 0;
  ui.btnOpenTileIndex.disabled = state.tileLoadBusy || downloadingCount > 0;

  for (const [tileId, tileEntry] of entryMap.tilesById.entries()) {
    tileEntry.inScene = overview.tileById.has(tileId);
    tileEntry.downloadable = overview.coverageById.has(tileId);
    tileEntry.selected = selectedSet.has(tileId);
    tileEntry.loaded = loadedSet.has(tileId);
    tileEntry.downloading = state.entry.downloadingTileIds.has(tileId);
    syncEntryTileLayerStyle(tileEntry);
  }
}

async function pollTileDownloadJob(jobId, tileId) {
  while (true) {
    const job = await getTileDownloadJob(jobId);
    state.entry.downloadingTileIds.set(tileId, {
      status: job.status,
      message: job.message,
      progress: job.progress,
    });
    syncEntryOverviewUi();
    scene().setProgress(
      Number.isFinite(job.progress) ? Math.max(5, job.progress * 100) : NaN,
      job.message || "Downloading tile...",
      job.status === "running" && !Number.isFinite(job.progress),
    );

    if (job.status === "succeeded") {
      return job;
    }
    if (job.status === "canceled" || job.status === "cancelled") {
      // Accept both spellings: pre-PR-#26 backends emit "canceled" (American),
      // PR #26 (now on master) standardizes on "cancelled" (British) to
      // match the other job managers.
      const error = new Error(job.message || "Tile download cancelled");
      error.cancelled = true;
      throw error;
    }
    if (job.status === "failed") {
      throw new Error(job.error || job.message || "Tile download failed");
    }
    await new Promise((resolve) => window.setTimeout(resolve, 1500));
  }
}

async function refreshManifestAfterTileDownload(tileId, manifestPayload = null) {
  const selectedTileIds = new Set(scene().tileSelections());
  state.manifest = manifestPayload || await getManifest();
  scene().populateTileList(state.manifest);
  performancePanel().populatePerformanceControls(state.manifest);
  state.entry.overview = buildEntryOverview(state.manifest, state.entry.coverage);
  renderEntryOverview();
  for (const selectedTileId of selectedTileIds) {
    scene().setTileChecked(selectedTileId, true);
  }
  scene().setTileChecked(tileId, true);
  setEntrySearchHint(`${toDisplayTileId(tileId)} was downloaded and added as a tile XML.`);
}

async function downloadEntryMapTile(tileId) {
  if (state.entry.downloadingTileIds.has(tileId)) {
    return;
  }
  if (state.entry.downloadingTileIds.size > 0) {
    setEntrySearchHint("Finish or cancel the current tile download before starting another.", true);
    return;
  }
  const displayTileId = toDisplayTileId(tileId);
  const confirmed = await dialogs().confirm({
    title: "Download Tile",
    message: `Download tile ${displayTileId} and merge it into the scene XML?`,
    confirmLabel: "Download",
    cancelLabel: "Cancel",
    variant: "warning",
  });
  if (!confirmed) {
    setEntrySearchHint(`Download for ${displayTileId} was not started.`);
    return;
  }

  let activeJobId = null;
  let cancelRequested = false;
  async function requestCancelDownload() {
    if (cancelRequested) {
      return;
    }
    cancelRequested = true;
    if (ui.btnLoadingCancel) {
      ui.btnLoadingCancel.disabled = true;
      ui.btnLoadingCancel.textContent = "Cancelling...";
    }
    scene().setProgress(NaN, `Cancelling ${displayTileId} and cleaning partial files...`, true);
    if (activeJobId) {
      await cancelTileDownloadJob(activeJobId).catch(() => {});
    }
  }

  state.entry.downloadingTileIds.set(tileId, {
    status: "queued",
    message: "Starting GLTF download...",
  });
  syncEntryOverviewUi();
  scene().showOverlay({
    title: "Downloading Tile",
    message: `Preparing ${displayTileId}...`,
    indeterminate: true,
    cancelLabel: "Cancel Download",
    onCancel: () => {
      requestCancelDownload();
    },
    force: true,
  });

  try {
    const created = await createTileDownloadJob(tileId);
    activeJobId = created.job_id;
    if (cancelRequested) {
      await cancelTileDownloadJob(activeJobId).catch(() => {});
    }
    const job = await pollTileDownloadJob(created.job_id, tileId);
    await refreshManifestAfterTileDownload(tileId, job.result?.manifest || null);
  } catch (error) {
    if (error.cancelled || cancelRequested) {
      setEntrySearchHint(`Download for ${displayTileId} was cancelled and partial files were removed.`);
    } else {
      setEntrySearchHint(`Could not download ${displayTileId}: ${error.message}`, true);
      await dialogs().alert({
        title: "Tile Download Failed",
        message: `Tile download failed: ${error.message}`,
        variant: "error",
      });
    }
  } finally {
    state.entry.downloadingTileIds.delete(tileId);
    scene().hideOverlay(null, true);
    syncEntryOverviewUi();
  }
}

function renderEntryOverview() {
  const overview = state.entry.overview;
  if (!overview) {
    return;
  }

  ui.entryMapTitle.textContent = "HKU Wireless Digital Twin";

  buildEntryMap(overview);
  syncEntryOverviewUi();
}

  return {
    buildEntryOverview,
    renderEntryOverview,
    showEntryScreen,
    hideEntryScreen,
    syncEntrySidebarUi,
    syncEntryOverviewUi,
    runEntryPlaceSearch,
    focusEntryPlaceResult,
    fitEntryMapToView,
    focusEntryMapTiles,
    hideEntryMapTooltip,
    dispose() {
      if (entryMap.fallbackTimer) {
        window.clearTimeout(entryMap.fallbackTimer);
        entryMap.fallbackTimer = null;
      }
      clearEntrySearchFocus();
      entryMap.map?.off();
      entryMap.map?.remove();
      entryMap.map = null;
      entryMap.tileLayer = null;
      entryMap.fallbackLayer = null;
      entryMap.tileLayerGroup = null;
      entryMap.tileRenderer = null;
      entryMap.tilesById.clear();
      entryMap.initialized = false;
      entryMap.fittedOnce = false;
      entryMap.hoveredTileId = null;
    },
  };
}
