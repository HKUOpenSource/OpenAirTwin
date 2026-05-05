# Zhaolin Development Summary

This document records Zhaolin's development context, dated feature work, validation results, cleanup notes, and handoff requirements for the HKU wireless digital twin platform.

## Developer Context

- Developer: Zhaolin
- Remote host: `defaultuser@100.65.77.20`
- Remote work folder: `/home/defaultuser/worktree-zhaolin`
- Active validation port: `8090`
- Shared v3.0 scene assets: `/home/defaultuser/HKU-RT/v3.0/HKU_scenes`

Use `worktree-zhaolin` for Zhaolin's validation work. Do not restart or kill another developer's worktree, especially `worktree-zihao` on port `18091`, unless explicitly requested.

## 2026-05-05 - Backend Solver Runtime Preload and Warm Solve Optimization

This development round optimized the backend path solver and terrain radio-map solver without changing numerical defaults or API responses.

Root cause confirmed before implementation:

- Remote DGX Spark CUDA backend was available through Sionna RT / Mitsuba / Dr.Jit.
- Low-sample probes showed the actual Sionna `PathSolver` took roughly `0.02s`, while every backend request spent roughly `42s` reloading `scenario_HKU.xml`.
- Terrain radio-map probes showed the same repeated scene-load cost before the real patch and solver work.

Implemented functionality:

- Added a cached RT runtime that preloads `scenario_HKU.xml` once during backend startup.
- Moved solver serialization from a module-level lock to the cached runtime's lock.
- Updated the link solver to reuse the cached scene, temporarily add Tx/Rx, copy path outputs, and remove temporary devices in `finally`.
- Updated the terrain radio-map solver to reuse the cached scene, temporarily add Tx, copy radio-map output, and remove the temporary transmitter in `finally`.
- Kept existing API response shapes and solver defaults unchanged, including link samples, radio-map samples, and density scaling.
- Added lightweight `[rt]` timing logs for link, radio-map patch build, radio-map solver, finalization, and total solve time.

Validation performed during this feature round:

- `python3 -m compileall -q backend scripts tests`
- `python3 -m unittest discover -s tests`
- `git diff --check`
- Synced code to `/home/defaultuser/worktree-zhaolin`.
- Restarted only the Zhaolin `8090` backend service from `/home/defaultuser/worktree-zhaolin`.
- Confirmed `/api/health` returned OK after restart.
- Remote warm link benchmark on `8090` with current UI parameters completed in `0.041s`.
- Remote default radio-map job on `8090` completed in `1.178s` end-to-end for `29,588` cells; server timing logged `0.417s` terrain patch build, `0.288s` Sionna solver, and `0.706s` backend compute total.

Final runtime files introduced by this work:

- `backend/rt/runtime.py`
- `tests/test_solver_runtime_cleanup.py`

Cleanup for this round:

- Deleted remote benchmark scratch files from `/tmp`: `worktree-zhaolin-link-benchmark.json` and `worktree-zhaolin-radiomap-benchmark.py`.
- Kept `/tmp/worktree-zhaolin-8090.log` because the active Zhaolin `8090` backend process writes runtime logs there.
- Final local cleanup scan found no `__pycache__`, `.pyc`, `.DS_Store`, `._*`, `.tmp`, `.bak`, `.log`, or unused generated files to delete.
- Kept `backend/rt/runtime.py` and `tests/test_solver_runtime_cleanup.py` because they are part of the final runtime implementation and regression coverage.

## 2026-05-05 - Load Scene Acceleration and Multi-Tile 3D Performance

This development round focused on keeping geometry exact while improving large scene delivery and browser-side interaction performance when many tile bundles are loaded.

Implemented functionality:

- Added pre-compressed `.glb.gz` tile bundle support using Python's standard `gzip` module.
- Extended the scene manifest with non-breaking bundle metadata: `cache_key`, `compressed_size_bytes`, and `compressed_cache_exists`.
- Versioned frontend bundle URLs with `?v={cache_key}` so browser caching can safely use immutable cache headers.
- Updated `/api/scene/bundle/{bundle_id}` to serve gzip when the browser sends `Accept-Encoding: gzip`, with raw GLB fallback.
- Added strong bundle response headers: `Cache-Control: public, max-age=31536000, immutable`, `ETag`, `Last-Modified`, `Vary: Accept-Encoding`, `Content-Encoding: gzip`, and original/compressed size headers.
- Added 304 handling for cached bundle requests.
- Added `--compress` to `backend.tools.build_tile_bundles` so remote deployments can pre-warm compressed bundle caches.
- Updated frontend load progress to distinguish transfer size from raw GLB size, avoiding misleading progress when browsers auto-decompress gzip responses.
- Kept manifest responses `no-store` so clients still discover fresh bundle cache keys.

3D rendering and interaction performance:

- Added `Performance Mode` controls: `Auto`, `Quality`, and `Fast`, with `Auto` as the default.
- Set the Three.js renderer `powerPreference` to `high-performance`.
- Reduced the default DPR cap from `2.0` to `1.5`.
- In `Auto`, lowers DPR to `1.0` during camera interaction and restores after the interaction settles.
- In `Fast`, keeps DPR fixed at `1.0`; in `Quality`, uses the capped high-quality DPR path.
- Added a lightweight material mode that uses `MeshLambertMaterial` for large scene bundles while preserving color, transparency, render order, polygon offset, and double-sided rendering.
- Added category visibility controls with loaded faces/vertices estimates per category.
- Added `Show All` and `Hide Heavy`; the heavy shortcut hides `VEGETATION_TB` and `GENERIC`.
- Added a performance HUD showing rolling FPS, DPR, draw calls, renderer triangles, visible faces/vertices, loaded tiles, and loaded bundles.
- Added a frame yield after adding large bundles to the scene to reduce long main-thread stalls during multi-bundle loading.
- Kept geometry coordinates, bundle selection, solver inputs, radio-map overlays, Tx/Rx picking, and visual scene correctness unchanged.

Performance panel layout:

- Moved the complete Performance controls out of the main left-side workflow panel.
- Added a separate top-right Performance dock below the logo block.
- The dock is hidden on the entry map and during loading, and appears only in the 3D page.
- The dock defaults to collapsed and shows a compact summary for FPS, DPR, and visible/total bundle load.
- Expanding the dock reveals all performance mode, material, HUD, and category visibility controls.
- Matched the Performance dock width and border radius to the original logo block's natural width rather than stretching it across the viewport.

Validation performed during this feature round:

- `node --check backend/static/js/app.js`
- `node --check backend/static/js/viewer.js`
- `node --check backend/static/lib/GLBGeometryLoader.js`
- `python3 -m compileall -q backend scripts tests`
- `python3 -m unittest tests.test_bundle_acceleration`
- Verified duplicate HTML IDs after the dock move; the only existing duplicate was the older `rxTitle`, not introduced by this work.
- Synced code to `/home/defaultuser/worktree-zhaolin`.
- Pre-compressed remote render bundles before remote validation.
- Restarted only the Zhaolin `8090` service when backend or frontend runtime code changed.
- Confirmed `/api/health` returned OK after remote updates.
- Confirmed remote bundle responses returned gzip, immutable caching headers, original/compressed size headers, and 304 cache hits.
- Confirmed remote `/index.html`, `/js/app.js`, and `/css/app.css` served the latest Performance dock and layout changes.

Final runtime files introduced by this work:

- `tests/test_bundle_acceleration.py`

Cleanup for this round:

- Final scan found no unused generated files to delete.
- Final scan found no `__pycache__`, `.pyc`, `.DS_Store`, `.tmp`, or `.bak` leftovers.
- Kept `tests/test_bundle_acceleration.py` because it validates the new gzip bundle cache and HTTP cache behavior.
- No scene cache, remote asset, vendored library, or unrelated source file was removed during final cleanup.

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
setsid env \
  HKU_RT_HOST=0.0.0.0 \
  HKU_RT_PORT=8090 \
  HKU_RT_SCENE_ROOT=/home/defaultuser/worktree-zhaolin/HKU_scenes \
  PYTHONPATH=/home/defaultuser/worktree-zhaolin \
  /home/defaultuser/venvs/sionna-gpu/bin/python -m backend.server \
  </dev/null > /tmp/worktree-zhaolin-8090.log 2>&1 &
```

Before validating GPU-dependent flows, confirm scene assets are available through the worktree's `HKU_scenes` path. The repository does not include `HKU_scenes/`.

## Cleanup Notes

Keep generated caches, Python bytecode, `.DS_Store`, log files, and scene cache output out of version control.

Cleanup history:

- 2026-05-05 backend solver runtime preload: removed remote benchmark scratch files from `/tmp`; final local cleanup scan found no generated leftovers; kept `backend/rt/runtime.py` and `tests/test_solver_runtime_cleanup.py` as final implementation and regression coverage.
- 2026-05-05 load-scene acceleration: final cleanup scan found no unused generated files to delete; kept `tests/test_bundle_acceleration.py` as a functional regression test.
- 2026-05-04: final cleanup scan found no unused generated files to delete.
- 2026-04-29: removed intermediate map exploration files after the final OSM / Canvas design was selected:
  - `backend/static/assets/tile_landmask.svg`
  - `backend/static/assets/tile_basemap.png`
  - `scripts/generate_tile_landmask_svg.py`
  - `scripts/generate_tile_basemap.py`
  - `scripts/__pycache__/`

## Open Follow-up Items

The latest backend hardening findings are still open after the solver runtime preload:

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
