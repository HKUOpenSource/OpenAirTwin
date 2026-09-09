import { maplibreGL } from "@maplibre/maplibre-gl-leaflet";
import type { Map as LeafletMap } from "leaflet";
import type { Map as MapLibreMap } from "maplibre-gl";

import { createEntryBasemapStyle } from "./entry-basemap.style.ts";
import leaflet from "./leaflet-runtime.ts";
import "./entry-basemap.css";

interface EntryBasemapOptions {
  style: string;
  attribution: string;
  onReady: () => void;
  onError: () => void;
}

type ManagedBasemapLayer = ReturnType<typeof maplibreGL> & {
  _transitionEnd: () => void;
  _resizeContainer: () => void;
  _zoomEnd: () => void;
};

export function createEntryBasemap(
  map: LeafletMap,
  { style, attribution, onReady, onError }: EntryBasemapOptions,
) {
  let active = true;
  let transitionFrame: number | undefined;
  const layer = maplibreGL({
    attributionControl: { customAttribution: attribution },
    interactive: false,
  }) as ManagedBasemapLayer;
  // The pinned adapter does not retain/cancel its deferred resize/zoom frame.
  layer._transitionEnd = () => {
    if (!active) return;
    if (transitionFrame !== undefined)
      leaflet.Util.cancelAnimFrame(transitionFrame);
    transitionFrame = leaflet.Util.requestAnimFrame(() => {
      transitionFrame = undefined;
      if (!active) return;
      const renderer = layer.getMaplibreMap();
      const offset = map.latLngToContainerPoint(map.getBounds().getNorthWest());
      layer._resizeContainer();
      leaflet.DomUtil.setTransform(renderer.getCanvas(), offset, 1);
      void renderer.once("moveend", () => {
        if (active) layer._zoomEnd();
      });
      renderer.jumpTo({ center: map.getCenter(), zoom: map.getZoom() - 1 });
    });
  };
  // The upstream adapter assumes WebGL construction succeeded when removing.
  const remove = layer.onRemove.bind(layer);
  layer.onRemove = (owner) => {
    active = false;
    if (transitionFrame !== undefined)
      leaflet.Util.cancelAnimFrame(transitionFrame);
    transitionFrame = undefined;
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
