# Zhaolin Development Summary

This document records Zhaolin's development context, dated feature work, validation results, cleanup notes, and handoff requirements for the HKU wireless digital twin platform.

## Developer Context

- Developer: Zhaolin
- Remote host: `defaultuser@100.65.77.20`
- Remote work folder: `/home/defaultuser/worktree-zhaolin`
- Active validation port: `8090`
- Shared v3.0 scene assets: `/home/defaultuser/HKU-RT/v3.0/HKU_scenes`

Use `worktree-zhaolin` for Zhaolin's validation work. Do not restart or kill another developer's worktree, especially `worktree-zihao` on port `18091`, unless explicitly requested.

## 2026-05-04 - Entry Map UX, Place Search, and Bundle Loading

This development round replaced the old manual tile-entry flow with a branded map-first workflow, added searchable Hong Kong place lookup, improved GLB bundle loading diagnostics, and made the entry map and loaded 3D scene feel like one continuous digital twin experience.

Implemented functionality:

- Replaced the left-side `Manual Tile IDs` control with `Place Search`.
- Added explicit OSM Nominatim search for Hong Kong places using candidate results rather than autocomplete.
- Limited place search to user-triggered Search or Enter actions, with simple request throttling to avoid high-frequency public Nominatim calls.
- Shows up to five candidates with name, address summary, and type metadata.
- Clicking a candidate fits the entry map to the result bounding box when available, otherwise zooms to the result center.
- Places a temporary marker at the result center and highlights the containing available tile when one exists.
- Keeps tile selection manual: search results never auto-select a tile and never auto-load the 3D scene.
- Shows search errors and empty states without changing current map selection.

Entry map and brand experience:

- Rebuilt the entry screen into an Apple Maps-style fullscreen map.
- Added a floating search sidebar, compact in-map legend, selection summary chip, right-side map controls, and a smaller floating `Load Selected Tiles` / `Apply Tile Selection` button.
- Removed duplicate load buttons, explanatory copy, left-side tile stats, manual tile controls, and visible Nominatim attribution copy outside Leaflet's own map attribution.
- Changed the map entry title to `HKU Wireless Digital Twin`.
- Added HKU and ECE branding to the map sidebar as a separate logo block beneath the search block, using the same visual proportions as the 3D page.
- Updated the map title, status badge, and legend so `Available`, `Selected`, `Loaded`, and `No Data` visually match the map polygons.

3D scene continuity:

- Updated the loaded 3D page brand text to `HKU Wireless Digital Twin` with the existing realtime solver and radio-map subtitle.
- Redesigned the 3D control sidebar to match the entry map sidebar's glass-panel visual language.
- Removed the old visible tile checkbox loader from the 3D page.
- Replaced the 3D tile-management controls with a `Map Selection` area and a `Choose Tiles on Map` button.
- Kept the entry map's floating button as the only apply/load path: before entering 3D it loads selected tiles, and after entering 3D it applies updated map selections.
- Preserved existing tile selection, loaded tile tracking, mesh counts, focus behavior, solver controls, and radio-map controls.

Bundle loading diagnostics and performance:

- Added `size_bytes` and `cache_exists` metadata to tile bundle manifest records.
- Reads existing GLB cache file sizes without triggering bundle builds.
- Updated the loading overlay to show bundle count, downloaded MB, total MB when known, and aggregate MB/s.
- Reworked `GLBGeometryLoader.loadAsync(url, { onProgress })` to stream downloads when supported.
- Reports bundle phases: `waiting`, `downloading`, `parsing`, `adding`, and `ready`.
- Tracks TTFB, downloaded bytes, download speed, download duration, and parse duration.
- Keeps a fallback path for browsers without stream support, with progress marked as unavailable.
- Changed `Viewer.syncBundles()` from fully serial loading to conservative fixed concurrency of two bundles.
- Keeps bundle removal synchronous and only adds meshes after each bundle finishes downloading and parsing.
- Stops loading on bundle failure and reports the specific failed bundle id.

Loading state and sidebar polish:

- Aggregated progress across concurrent bundles instead of allowing individual bundle events to replace the whole overlay message.
- Throttled loading overlay DOM updates and made progress percentage monotonic during each load session.
- Reduced flicker by avoiding repeated identical status writes.
- Simplified the overlay to one main loading summary plus concise active-work detail.
- Replaced the old panel-to-circle collapse animation with horizontal slide-in / slide-out motion.
- Added independent sidebar toggle buttons for the map page and 3D page.
- Kept map and 3D sidebar state alive while collapsed, including search input, candidates, and solver controls.
- Added reduced-motion handling for the sidebar transitions.
- Fixed the map sidebar collapse button alignment by using the same panel-width, button-size, and inset formula as the 3D sidebar.

Validation performed during this feature round:

- `node --check backend/static/js/app.js`
- `node --check backend/static/js/viewer.js`
- `node --check backend/static/lib/GLBGeometryLoader.js`
- `python3 -m compileall -q backend`
- `git diff --check`
- Browser validation for entry map layout, place search, candidate selection, tile selection, sidebar collapse / expand behavior, 3D entry, return-to-map flow, and loading overlay stability.
- Synced code to `/home/defaultuser/worktree-zhaolin`.
- Restarted only the Zhaolin `8090` service.
- Confirmed `/api/health` returned OK.

Cleanup for this round:

- Final scan found no untracked files.
- Final scan found no `__pycache__`, `.pyc`, `.DS_Store`, or `.log` leftovers.
- No generated cache, scene asset, vendored library, or tracked source file was removed during final cleanup.

## 2026-04-29 - Initial Map OSM Upgrade

The initial tile-selection map was rebuilt from a static government tile-map image workflow into an interactive OSM-based map experience.

Implemented functionality:

- Added a Leaflet 1.9.x / Carto Light OSM basemap for the initial tile index view.
- Added vendored `proj4` support and EPSG:2326 Hong Kong Grid to WGS84 conversion.
- Preserved the original `tile_map.png` tile model for sheet, quadrant, numbered cell, and A/B/C/D subtile bounds.
- Removed dense map text labels from the overlay; tile IDs are surfaced through hover tooltips, badges, search / selection UI, and selection stats.
- Replaced the old per-node SVG overlay with Leaflet Canvas rendering for smoother zooming, dragging, and tile selection.
- Represented no-data regions with lightweight grid lines instead of filled blocks.
- Kept `tile_map.png` as the local fallback image and historical coordinate reference source.
- Computed fallback image bounds from the original image frame offsets so the useful map frame remains aligned with the tile grid.

Final runtime assets introduced by this work:

- `backend/static/lib/leaflet/`
- `backend/static/lib/proj4/`

Discarded intermediate approaches:

- Hybrid static PNG plus SVG overlay.
- Generated landmask SVG basemap.
- Generated AI-style static basemap as the primary map.
- Fixed-screen grid anchored over OSM.
- Per-frame SVG coordinate reprojection.

Validation performed during this feature round:

- `node --check backend/static/js/app.js`
- `PYTHONPYCACHEPREFIX=.codex_pycache python3 -m compileall -q backend scripts`
- Playwright checks for OSM tile requests, no `tile_map.png` request during normal online loading, no SVG text labels, Canvas grid rendering, zoom, drag, tile selection, fallback behavior, and mobile layout.
- Synced code to `/home/defaultuser/worktree-zhaolin`.
- Restarted only the `8090` backend service from `worktree-zhaolin`.
- Confirmed `/api/health` returned OK.
- Confirmed `worktree-zihao` / `18091` was not restarted or killed.
- Verified the initial map at `http://100.65.77.20:8090` with Playwright.

## Remote Workflow Notes

Use the sync scripts with an explicit remote root when validating Zhaolin's work:

```bash
HKU_RT_REMOTE_ROOT=/home/defaultuser/worktree-zhaolin bash scripts/sync_code_to_remote.sh
```

Start or restart the remote backend from the Zhaolin worktree only:

```bash
cd /home/defaultuser/worktree-zhaolin
nohup env \
  HKU_RT_HOST=0.0.0.0 \
  HKU_RT_PORT=8090 \
  HKU_RT_SCENE_ROOT=/home/defaultuser/worktree-zhaolin/HKU_scenes \
  PYTHONPATH=/home/defaultuser/worktree-zhaolin \
  /home/defaultuser/venvs/sionna-gpu/bin/python -m backend.server \
  > /tmp/worktree-zhaolin-8090.log 2>&1 &
```

Before validating GPU-dependent flows, confirm scene assets are available through the worktree's `HKU_scenes` path. The repository does not include `HKU_scenes/`.

## Cleanup Notes

Keep generated caches, Python bytecode, `.DS_Store`, log files, and scene cache output out of version control.

Cleanup history:

- 2026-05-04: final cleanup scan found no unused generated files to delete.
- 2026-04-29: removed intermediate map exploration files after the final OSM / Canvas design was selected:
  - `backend/static/assets/tile_landmask.svg`
  - `backend/static/assets/tile_basemap.png`
  - `scripts/generate_tile_landmask_svg.py`
  - `scripts/generate_tile_basemap.py`
  - `scripts/__pycache__/`

## Open Follow-up Items

The latest backend review findings are still open and were not part of the map-entry or bundle-loading work:

- Add server-side caps for solver samples, max depth, frequency, and radio-map density.
- Add queue/backpressure for radio-map jobs instead of unbounded daemon threads.
- Add TTL cleanup, result deletion, pagination, or persistence for radio-map results.
- Avoid returning full internal tracebacks to API clients.
- Replace string-prefix path checks with `Path.resolve()` plus robust containment checks.
- Improve startup behavior when `HKU_scenes/scenario_HKU.xml` is missing.

## Handoff Checklist

When handing off future Zhaolin work:

- State the local branch or worktree used.
- State whether code was synced to `/home/defaultuser/worktree-zhaolin`.
- State whether port `8090` was restarted and which PID is active.
- State whether `18091` was only checked or intentionally changed.
- List the exact local and remote checks that passed.
