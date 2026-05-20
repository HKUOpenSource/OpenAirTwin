export const TILE_ID_PATTERN = /^(\d+)_([A-Z]+)_(\d+)([A-Z])$/;
export const TILE_COLUMNS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
export const ENTRY_MAP_SOURCE = {
  width: 3307,
  height: 2338,
  frame: {
    left: 221,
    top: 168,
    right: 3094,
    bottom: 2211,
  },
};
export const ENTRY_MAP_IMAGE = {
  path: "/assets/tile_map.png",
  width: ENTRY_MAP_SOURCE.width,
  height: ENTRY_MAP_SOURCE.height,
};
export const ENTRY_MAP_GRID = {
  west: 800000,
  east: 860000,
  south: 800000,
  north: 848000,
};
export const ENTRY_MAP_MODEL = {
  west: 800000,
  east: 860000,
  south: 800000,
  north: 848000,
  cols: 4,
  rows: 4,
  sheetW: 15000,
  sheetH: 12000,
};
export const ENTRY_MAP_QUADRANTS = ["NW", "NE", "SW", "SE"];
export const ENTRY_MAP_SUBTILES = ["A", "B", "C", "D"];
export const ENTRY_MAP_SHEET_COUNT = ENTRY_MAP_MODEL.cols * ENTRY_MAP_MODEL.rows;
export const ENTRY_MAP_INITIAL_ZOOM = 11;
export const ENTRY_MAP_MIN_ZOOM = 9;
export const ENTRY_MAP_MAX_ZOOM = 18;
export const HK_GRID_CRS = "EPSG:2326";
export const WGS84_CRS = "EPSG:4326";
export const HK_GRID_PROJ4 = "+proj=tmerc +lat_0=22.31213333333334 +lon_0=114.1785555555556 +k=1 +x_0=836694.05 +y_0=819069.8 +ellps=intl +towgs84=-162.619,-276.959,-161.764,-0.067753,2.243648,1.158828,-1.094246 +units=m +no_defs +type=crs";
export const CARTO_LIGHT_URL = "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png";
export const CARTO_LIGHT_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>';
export const NOMINATIM_SEARCH_URL = "https://nominatim.openstreetmap.org/search";
export const NOMINATIM_RESULT_LIMIT = 5;
export const NOMINATIM_MIN_INTERVAL_MS = 1000;
export const NOMINATIM_HK_COUNTRYCODES = "cn,hk";
export const ENTRY_PLACE_SEARCH_ZOOM = 16;

export function parseTileId(tileId) {
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

export function formatTileLabel(tileId) {
  return tileId.replaceAll("_", "-");
}

export function formatRegionLabel(regionKey) {
  return regionKey.replaceAll("_", "-");
}

export function compareTileIds(leftId, rightId) {
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

export function internalTileId(sheet, region, number, subTile) {
  return `${sheet}_${region}_${number}${subTile}`;
}

export function displayTileId(sheet, region, number, subTile) {
  return `${sheet}-${region}-${number}${subTile}`;
}

export function toDisplayTileId(tileId) {
  const parsed = parseTileId(tileId);
  if (!parsed) {
    return formatTileLabel(tileId);
  }
  return displayTileId(parsed.sheet, parsed.region, parsed.row, parsed.column);
}

export function allEntryTileIds() {
  const tileIds = [];
  for (let sheet = 1; sheet <= ENTRY_MAP_SHEET_COUNT; sheet += 1) {
    for (const quadrant of ENTRY_MAP_QUADRANTS) {
      for (let number = 1; number <= 25; number += 1) {
        for (const subTile of ENTRY_MAP_SUBTILES) {
          tileIds.push(internalTileId(sheet, quadrant, number, subTile));
        }
      }
    }
  }
  return tileIds;
}


export function assertEntryMapDeps() {
  if (!window.L || !window.proj4) {
    throw new Error("Leaflet and proj4 are required before /js/app.js.");
  }
  window.proj4.defs(HK_GRID_CRS, HK_GRID_PROJ4);
}

export function hkToLonLat(east, north) {
  const [lon, lat] = window.proj4(HK_GRID_CRS, WGS84_CRS, [east, north]);
  return {lon, lat};
}

export function hkToLatLng(east, north) {
  const {lon, lat} = hkToLonLat(east, north);
  return window.L.latLng(lat, lon);
}

export function latLngToHk(latLng) {
  const [east, north] = window.proj4(WGS84_CRS, HK_GRID_CRS, [latLng.lng, latLng.lat]);
  return {east, north};
}

export function entryModelBounds() {
  return {
    west: ENTRY_MAP_MODEL.west,
    east: ENTRY_MAP_MODEL.east,
    south: ENTRY_MAP_MODEL.south,
    north: ENTRY_MAP_MODEL.north,
  };
}

export function entryFallbackImageBounds() {
  const frameWidth = ENTRY_MAP_SOURCE.frame.right - ENTRY_MAP_SOURCE.frame.left;
  const frameHeight = ENTRY_MAP_SOURCE.frame.bottom - ENTRY_MAP_SOURCE.frame.top;
  const unitsPerPixelX = (ENTRY_MAP_GRID.east - ENTRY_MAP_GRID.west) / frameWidth;
  const unitsPerPixelY = (ENTRY_MAP_GRID.north - ENTRY_MAP_GRID.south) / frameHeight;

  return {
    west: ENTRY_MAP_GRID.west - (ENTRY_MAP_SOURCE.frame.left * unitsPerPixelX),
    east: ENTRY_MAP_GRID.west + ((ENTRY_MAP_SOURCE.width - ENTRY_MAP_SOURCE.frame.left) * unitsPerPixelX),
    south: ENTRY_MAP_GRID.north - ((ENTRY_MAP_SOURCE.height - ENTRY_MAP_SOURCE.frame.top) * unitsPerPixelY),
    north: ENTRY_MAP_GRID.north + (ENTRY_MAP_SOURCE.frame.top * unitsPerPixelY),
  };
}

export function entryMapCenter(bounds = entryModelBounds()) {
  return hkToLatLng(
    (bounds.west + bounds.east) / 2,
    (bounds.south + bounds.north) / 2,
  );
}

export function latLngBoundsFromHk(bounds) {
  return window.L.latLngBounds([
    hkToLatLng(bounds.west, bounds.south),
    hkToLatLng(bounds.west, bounds.north),
    hkToLatLng(bounds.east, bounds.south),
    hkToLatLng(bounds.east, bounds.north),
  ]);
}

export function mergeHkBounds(boundsList) {
  return boundsList.reduce((acc, bounds) => ({
    west: Math.min(acc.west, bounds.west),
    east: Math.max(acc.east, bounds.east),
    south: Math.min(acc.south, bounds.south),
    north: Math.max(acc.north, bounds.north),
  }), {
    west: Number.POSITIVE_INFINITY,
    east: Number.NEGATIVE_INFINITY,
    south: Number.POSITIVE_INFINITY,
    north: Number.NEGATIVE_INFINITY,
  });
}

export function hkBoundsCorners(bounds) {
  return [
    hkToLatLng(bounds.west, bounds.north),
    hkToLatLng(bounds.east, bounds.north),
    hkToLatLng(bounds.east, bounds.south),
    hkToLatLng(bounds.west, bounds.south),
  ];
}

export function majorBounds(sheetId) {
  const index = Number(sheetId) - 1;
  const row = Math.floor(index / ENTRY_MAP_MODEL.cols);
  const column = index % ENTRY_MAP_MODEL.cols;
  const west = ENTRY_MAP_MODEL.west + column * ENTRY_MAP_MODEL.sheetW;
  const east = west + ENTRY_MAP_MODEL.sheetW;
  const north = ENTRY_MAP_MODEL.north - row * ENTRY_MAP_MODEL.sheetH;
  const south = north - ENTRY_MAP_MODEL.sheetH;
  return {west, east, south, north, row, column};
}

export function quadrantBounds(bounds, quadrant) {
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

export function numberBounds(quadrant, number) {
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

export function subBounds(numberCell, subTile) {
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

export function boundsForTileId(tileId) {
  const parsed = parseTileId(tileId);
  if (!parsed || !ENTRY_MAP_QUADRANTS.includes(parsed.region) || !ENTRY_MAP_SUBTILES.includes(parsed.column)) {
    return null;
  }

  const major = majorBounds(parsed.sheet);
  const quadrant = quadrantBounds(major, parsed.region);
  const number = numberBounds(quadrant, parsed.row);
  return subBounds(number, parsed.column);
}

export function entrySearchViewbox() {
  const southWest = hkToLonLat(ENTRY_MAP_GRID.west, ENTRY_MAP_GRID.south);
  const northEast = hkToLonLat(ENTRY_MAP_GRID.east, ENTRY_MAP_GRID.north);
  return `${southWest.lon},${southWest.lat},${northEast.lon},${northEast.lat}`;
}

export function pointInHkBounds(point, bounds) {
  return point.east >= bounds.west
    && point.east <= bounds.east
    && point.north >= bounds.south
    && point.north <= bounds.north;
}
