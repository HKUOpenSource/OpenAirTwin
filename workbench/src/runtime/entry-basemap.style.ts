import type { LayerSpecification, StyleSpecification } from "maplibre-gl";

const fillColors: Record<string, string> = {
  water: "#dce6eb",
  park: "#eaf0eb",
  landcover_wood: "#e6ede7",
  landuse_residential: "#f0f2f2",
  building: "#e7ebed",
  road_area_pier: "#f7f8f8",
};

const labelMinZoom: Record<string, number> = {
  label_town: 10,
  label_village: 12,
  label_other: 12,
  water_name_point_label: 10,
  water_name_line_label: 11,
  waterway_line_label: 12,
};

function styleLayer(layer: LayerSpecification): LayerSpecification {
  if (layer.type === "background") {
    return {
      ...layer,
      paint: { ...layer.paint, "background-color": "#f7f8f8" },
    };
  }
  const fillColor = fillColors[layer.id];
  if (layer.type === "fill" && fillColor) {
    return {
      ...layer,
      paint: {
        ...layer.paint,
        "fill-color": fillColor,
        ...(layer.id === "building" ? { "fill-outline-color": "#dce2e5" } : {}),
      },
    };
  }
  if (layer.type !== "symbol" || !layer.layout?.["text-field"]) return layer;

  const majorPlace = /^label_(city|country)/.test(layer.id);
  const water = ["water_name", "waterway"].includes(
    layer["source-layer"] ?? "",
  );
  const shield = layer.id.includes("shield");
  return {
    ...layer,
    minzoom: Math.max(layer.minzoom ?? 0, labelMinZoom[layer.id] ?? 0),
    layout: {
      ...layer.layout,
      "text-font": ["Noto Sans Regular"],
      "text-letter-spacing": 0,
      "text-transform": "none",
      "text-size": shield
        ? 10
        : majorPlace
          ? ["interpolate", ["linear"], ["zoom"], 4, 10, 10, 12, 14, 13]
          : ["interpolate", ["linear"], ["zoom"], 8, 10, 14, 11, 18, 12],
      "text-padding": majorPlace ? 8 : 5,
      "text-allow-overlap": false,
      "text-ignore-placement": false,
      ...(layer["source-layer"] === "place" ? { "text-max-width": 12 } : {}),
    },
    paint: {
      ...layer.paint,
      "text-color": water ? "#829aa8" : majorPlace ? "#738591" : "#81939e",
      "text-halo-color": "rgba(255,255,255,0.85)",
      "text-halo-width": 1,
      "text-halo-blur": 0.4,
      ...(layer["source-layer"] === "place" ? { "icon-opacity": 0.45 } : {}),
    },
  };
}

export function createEntryBasemapStyle(
  style: StyleSpecification,
): StyleSpecification {
  // Keep provider sources, attribution and multilingual label expressions intact.
  return { ...style, layers: style.layers.map(styleLayer) };
}
