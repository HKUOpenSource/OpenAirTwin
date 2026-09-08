import { maplibreGL } from "@maplibre/maplibre-gl-leaflet";
import type { Map as LeafletMap } from "leaflet";
import type { Map as MapLibreMap } from "maplibre-gl";

import { createEntryBasemapStyle } from "./entry-basemap.style.ts";
import "./entry-basemap.css";

interface EntryBasemapOptions {
  style: string;
  attribution: string;
  onReady: () => void;
  onError: () => void;
}

export function createEntryBasemap(
  map: LeafletMap,
  { style, attribution, onReady, onError }: EntryBasemapOptions,
) {
  const layer = maplibreGL({
    attributionControl: { customAttribution: attribution },
    interactive: false,
  });
  // The upstream adapter assumes WebGL construction succeeded when removing.
  const remove = layer.onRemove.bind(layer);
  layer.onRemove = (owner) => {
    if (layer.getMaplibreMap() as MapLibreMap | undefined) remove(owner);
    else layer.getContainer().remove();
    return layer;
  };
  try {
    layer.addTo(map);
  } catch (error) {
    map.removeLayer(layer);
    throw error;
  }
  const renderer = layer.getMaplibreMap();
  let active = true;
  const ready = () => {
    if (active) onReady();
  };
  const failed = () => {
    // Removing a layer during a renderer event can interrupt its own cleanup.
    queueMicrotask(() => {
      if (active) onError();
    });
  };
  void renderer.once("load", ready);
  renderer.on("error", failed);
  renderer.on("webglcontextlost", failed);
  layer.once("remove", () => {
    active = false;
    renderer.off("load", ready);
    renderer.off("error", failed);
    renderer.off("webglcontextlost", failed);
  });
  renderer.setStyle(style, {
    transformStyle: (_previous, next) => createEntryBasemapStyle(next),
  });
  return layer;
}
