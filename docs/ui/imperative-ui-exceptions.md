# Imperative UI and Inline Runtime Style Exceptions

The machine-readable registry is [imperative-ui-exceptions.json](imperative-ui-exceptions.json). It is an allowlist, not a recommended API. A new file or operation must first document its sole owner, rationale, cleanup path, and removal condition.

## Allowed Boundaries

| Category | Owner | Rationale | Lifecycle or removal condition |
| --- | --- | --- | --- |
| Leaflet Entry Map | `shell:entry-map` | Leaflet must manage panes, markers, tooltips, and the map host imperatively | React owns only the host; map adapter disposal performs cleanup |
| Three.js Viewer and picking | `shell:viewer` | WebGL canvas, controls, pointer capture, and the scene graph are imperative engines | React owns only the stable canvas host; Viewer disposal performs cleanup |
| Canvas and SVG charts | Each feature | Pixel drawing, crosshairs, and tooltip coordinates are calculated from live chart layout | Chart adapter disposal; React retains a stable controlled host for the adapter lifecycle |
| Radar 3D labels and connectors | `feature:radar` | Label projection, occlusion, scaling, color, and connector lines change every frame | Feature deactivate/dispose removes the layer and frame listener |
| Dynamic geometry styles | Shell or feature owner | `left`, `top`, `width`, `transform`, reserve space, progress, and domain palettes are runtime inputs | Only registered files are allowed; static design values must use CSS tokens |

## Runtime Style Categories

- Layout coordinates: tooltips, Radar labels and crosshairs, and Canvas tooltips.
- Progress and visibility: loading and Entry/Scene states.
- Dynamic reserve: `--analysis-dock-bottom-reserve`.
- Domain data colors: Radio Map gradients and Radar target, detection, and clutter palettes.
- Engine properties: Leaflet pane z-index and pointer events, and the Viewer cursor.

Inline styles may not set static colors, spacing, font sizes, radii, shadows, control heights, or arbitrary z-index values. Leaflet pane z-index is a third-party engine configuration exception, not a design-system layer.

Normal Shell, control, device, dynamic place, tile, performance-category, and result-row UI is rendered by React components. Imperative DOM files in the registry may operate only inside Leaflet hosts, Radar projected labels, or SVG and Canvas charts; they may not create normal application UI.
