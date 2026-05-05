import {
  CARTO_LIGHT_ATTRIBUTION,
  CARTO_LIGHT_URL,
  ENTRY_MAP_GRID,
  ENTRY_MAP_IMAGE,
  ENTRY_MAP_INITIAL_ZOOM,
  ENTRY_MAP_MAX_ZOOM,
  ENTRY_MAP_MIN_ZOOM,
  ENTRY_MAP_QUADRANTS,
  ENTRY_MAP_SHEET_COUNT,
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
  majorBounds,
  mergeHkBounds,
  parseTileId,
  pointInHkBounds,
  quadrantBounds,
  numberBounds,
  toDisplayTileId,
} from "/js/tile_model.js";

export function createEntryMapController(context) {
  const {state, entryMap, ui, viewerRef} = context;
  const getViewer = () => viewerRef.current;
  const scene = () => context.controllers.scene;
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
  ui.entrySearchHint.style.color = isError ? "#b45309" : "#63758f";
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
  ui.entryPlaceResults.replaceChildren();
}

function renderEntryPlaceResults(results) {
  ui.entryPlaceResults.replaceChildren();
  state.entry.search.results = results;

  results.forEach((result, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "entryPlaceResult" + (state.entry.search.selectedIndex === index ? " active" : "");

    const title = document.createElement("b");
    title.textContent = placeResultTitle(result);
    const detail = document.createElement("span");
    detail.textContent = placeResultDetail(result);
    const meta = document.createElement("div");
    meta.className = "entryPlaceMeta";
    meta.textContent = placeResultMeta(result);

    button.append(title, detail, meta);
    button.addEventListener("click", () => focusEntryPlaceResult(index));
    ui.entryPlaceResults.appendChild(button);
  });
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
  entryMap.searchHighlightLayer = createEntryPolygon(tileEntry.bounds, {
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
    updateEntryMapBadge(tileId);
    setEntrySearchHint(`Located in ${toDisplayTileId(tileId)}. Click the tile on the map to select it.`);
  } else {
    setEntrySearchHint("Located the place, but the current manifest has no available tile at that point.", true);
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

function showEntryMapTooltip(clientX, clientY, html) {
  const viewport = ui.entryMapFigure.getBoundingClientRect();
  ui.entryMapTooltip.innerHTML = html;
  ui.entryMapTooltip.style.left = `${clientX - viewport.left + 14}px`;
  ui.entryMapTooltip.style.top = `${clientY - viewport.top + 14}px`;
  ui.entryMapTooltip.classList.remove("hidden");
}

function hideEntryMapTooltip() {
  ui.entryMapTooltip.classList.add("hidden");
}

function updateEntryMapBadge({selectedCount = 0, loadedCount = 0, pendingCount = 0, meshCount = 0} = {}) {
  ui.entryMapBadgeValue.textContent = `${selectedCount} selected`;
  const detailParts = [
    `${loadedCount} loaded`,
    `${pendingCount} pending`,
  ];
  if (meshCount > 0) {
    detailParts.push(`${meshCount.toLocaleString()} meshes`);
  }
  ui.entryMapBadgeDetail.textContent = detailParts.join(" · ");
}

function entryMapTooltipHtml(tileId) {
  const tile = state.entry.overview?.tileById.get(tileId);
  if (!tile) {
    return `<strong>${toDisplayTileId(tileId)}</strong><br>No scene data in the current manifest.`;
  }
  return `<strong>${toDisplayTileId(tileId)}</strong><br>${tile.mesh_count.toLocaleString()} meshes • ${tile.bundle_count} bundles`;
}

function selectEntryMapTile(tileId) {
  if (!tileId) {
    return;
  }
  if (state.tileLoadBusy) {
    return;
  }
  if (!state.entry.overview?.tileById.has(tileId)) {
    return;
  }
  toggleTileChecked(tileId);
}

function entryGridStyle(kind = "number") {
  if (kind === "major") {
    return {
      color: "rgba(21,33,53,.38)",
      weight: 1.7,
    };
  }
  if (kind === "quadrant") {
    return {
      color: "rgba(31,100,224,.24)",
      weight: 0.9,
    };
  }
  return {
    color: "rgba(71,88,113,.14)",
    weight: 0.55,
  };
}

function entryTileLayerStyle(tileEntry, hover = false) {
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
    color: hover ? "rgba(31,111,255,.95)" : "rgba(31,111,255,.44)",
    weight: hover ? 1.25 : 0.85,
    opacity: 1,
    fillColor: "#1f6fff",
    fillOpacity: hover ? 0.22 : 0.075,
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

function createEntryGridCanvasLayer(items = []) {
  const EntryGridCanvasLayer = window.L.Layer.extend({
    options: {
      pane: "entryGridPane",
      padding: 0.35,
    },

    initialize(gridItems) {
      this._items = gridItems;
    },

    onAdd(map) {
      this._map = map;
      this._canvas = window.L.DomUtil.create("canvas", "entryGridCanvasLayer leaflet-zoom-animated");
      this._ctx = this._canvas.getContext("2d");
      map.getPane(this.options.pane).appendChild(this._canvas);
      map.on("moveend zoomend resize viewreset", this._reset, this);
      if (map.options.zoomAnimation && window.L.Browser.any3d) {
        map.on("zoomanim", this._animateZoom, this);
      }
      this._reset();
    },

    onRemove(map) {
      map.off("moveend zoomend resize viewreset", this._reset, this);
      if (map.options.zoomAnimation && window.L.Browser.any3d) {
        map.off("zoomanim", this._animateZoom, this);
      }
      window.L.DomUtil.remove(this._canvas);
      this._canvas = null;
      this._ctx = null;
    },

    setItems(nextItems) {
      this._items = nextItems;
      this._reset();
    },

    _reset() {
      if (!this._map || !this._canvas) {
        return;
      }
      const size = this._map.getSize();
      const topLeft = this._map.containerPointToLayerPoint([0, 0]);
      const dpr = window.devicePixelRatio || 1;
      this._topLeft = topLeft;
      this._canvas.width = Math.ceil(size.x * dpr);
      this._canvas.height = Math.ceil(size.y * dpr);
      this._canvas.style.width = `${size.x}px`;
      this._canvas.style.height = `${size.y}px`;
      window.L.DomUtil.setPosition(this._canvas, topLeft);
      this._redraw(size, dpr);
    },

    _animateZoom(event) {
      if (!this._map || !this._canvas) {
        return;
      }
      const scale = this._map.getZoomScale(event.zoom);
      const offset = this._map._latLngBoundsToNewLayerBounds(
        this._map.getBounds(),
        event.zoom,
        event.center,
      ).min;
      window.L.DomUtil.setTransform(this._canvas, offset, scale);
    },

    _redraw(size, dpr) {
      if (!this._ctx) {
        return;
      }
      const ctx = this._ctx;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, size.x, size.y);
      ctx.lineJoin = "miter";
      ctx.lineCap = "butt";

      for (const item of this._items) {
        const style = entryGridStyle(item.kind);
        const points = item.corners.map((latLng) => this._map.latLngToLayerPoint(latLng).subtract(this._topLeft));
        ctx.beginPath();
        ctx.moveTo(points[0].x, points[0].y);
        ctx.lineTo(points[1].x, points[1].y);
        ctx.lineTo(points[2].x, points[2].y);
        ctx.lineTo(points[3].x, points[3].y);
        ctx.closePath();
        ctx.strokeStyle = style.color;
        ctx.lineWidth = style.weight;
        ctx.stroke();
      }
    },
  });
  return new EntryGridCanvasLayer(items);
}

function createEntryTileLayer(tileEntry) {
  const layer = createEntryPolygon(tileEntry.bounds, {
    ...entryTileLayerStyle(tileEntry),
    interactive: true,
  });

  layer.on("mouseover", (event) => {
    entryMap.hoveredTileId = tileEntry.id;
    syncEntryTileLayerStyle(tileEntry);
    if (event.originalEvent) {
      showEntryMapTooltip(event.originalEvent.clientX, event.originalEvent.clientY, entryMapTooltipHtml(tileEntry.id));
    }
  });
  layer.on("mousemove", (event) => {
    if (event.originalEvent) {
      showEntryMapTooltip(event.originalEvent.clientX, event.originalEvent.clientY, entryMapTooltipHtml(tileEntry.id));
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
  entryMap.map.createPane("entryGridPane");
  entryMap.map.getPane("entryGridPane").style.zIndex = "620";
  entryMap.map.getPane("entryGridPane").style.pointerEvents = "none";
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
  entryMap.gridLayer = createEntryGridCanvasLayer();
  entryMap.gridLayer.addTo(entryMap.map);
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

  const gridItems = [];
  for (let sheet = 1; sheet <= ENTRY_MAP_SHEET_COUNT; sheet += 1) {
    const major = majorBounds(sheet);
    gridItems.push({kind: "major", corners: hkBoundsCorners(major)});

    for (const quadrantId of ENTRY_MAP_QUADRANTS) {
      const quadrant = quadrantBounds(major, quadrantId);
      gridItems.push({kind: "quadrant", corners: hkBoundsCorners(quadrant)});

      for (let number = 1; number <= 25; number += 1) {
        const numberCell = numberBounds(quadrant, number);
        gridItems.push({kind: "number", corners: hkBoundsCorners(numberCell)});
      }
    }
  }
  entryMap.gridLayer.setItems(gridItems);

  for (const tileId of overview.availableTileIds) {
    const bounds = boundsForTileId(tileId);
    if (!bounds) {
      continue;
    }
    const tileEntry = {
      id: tileId,
      displayId: toDisplayTileId(tileId),
      available: true,
      selected: false,
      loaded: false,
      bounds,
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
  ui.btnEntrySidebarToggle.textContent = collapsed ? "⌕" : "‹";
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
  ui.panelToggle.textContent = collapsed ? "☰" : "‹";
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

  updateEntryMapBadge({
    selectedCount: selected.length,
    loadedCount: selected.length ? selectedLoadedCount : loaded.length,
    pendingCount,
    meshCount: selectedMeshCount,
  });
  const sceneActionDisabled = state.tileLoadBusy || selected.length === 0;
  const sceneActionLabel = state.entry.sceneReady ? "Apply Tile Selection" : "Load Selected Tiles";
  ui.btnEnterScene.disabled = sceneActionDisabled;
  ui.btnEnterScene.textContent = sceneActionLabel;
  ui.btnEntryReturnScene.disabled = state.tileLoadBusy || !state.entry.sceneReady;
  ui.btnEntrySearch.disabled = state.tileLoadBusy || state.entry.search.inFlight;
  ui.entryPlaceInput.disabled = state.tileLoadBusy || state.entry.search.inFlight;
  ui.btnEntryFocusSelection.disabled = selected.length === 0;
  ui.btnOpenTileIndex.disabled = state.tileLoadBusy;

  for (const [tileId, tileEntry] of entryMap.tilesById.entries()) {
    tileEntry.available = overview.tileById.has(tileId);
    tileEntry.selected = selectedSet.has(tileId);
    tileEntry.loaded = loadedSet.has(tileId);
    syncEntryTileLayerStyle(tileEntry);
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
    fitEntryMapToView,
    focusEntryMapTiles,
    hideEntryMapTooltip,
  };
}
