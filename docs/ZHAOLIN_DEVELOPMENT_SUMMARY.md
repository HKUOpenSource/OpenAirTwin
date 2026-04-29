# Zhaolin Development Summary

This document records Zhaolin's development context and the latest feature work for the HKU wireless digital twin platform.

## Developer Context

- Developer: Zhaolin
- Remote host: `defaultuser@100.65.77.20`
- Remote work folder: `/home/defaultuser/worktree-zhaolin`
- Active validation port: `8090`
- Shared v3.0 scene assets: `/home/defaultuser/HKU-RT/v3.0/HKU_scenes`

Use `worktree-zhaolin` for Zhaolin's validation work. Do not restart or kill another developer's worktree, especially `worktree-zihao` on port `18091`, unless explicitly requested.

## 2026-04-29 - Initial Map OSM Upgrade

The initial tile-selection map was rebuilt from a static government tile-map image workflow into an interactive OSM-based map experience.

Implemented functionality:

- Added a Leaflet 1.9.x / Carto Light OSM basemap for the initial tile index view.
- Added vendored `proj4` support and EPSG:2326 Hong Kong Grid to WGS84 conversion.
- Preserved the original `tile_map.png` tile model for sheet, quadrant, numbered cell, and A/B/C/D subtile bounds.
- Removed dense map text labels from the overlay; tile IDs are now surfaced through hover tooltips, the Last Tile badge, manual input, and selection stats.
- Replaced the old per-node SVG overlay with Leaflet Canvas rendering:
  - available, selected, and loaded tiles stay interactive;
  - no-data regions are represented by lightweight grid lines only;
  - the normal grid is rendered by a single cached canvas layer for smoother zooming.
- Uses the original `tile_map.png` as the local fallback image when Carto/OSM tiles fail.
- Computes fallback image bounds from the original image frame offsets, so the useful map frame remains aligned with the tile grid.
- Keeps `tile_map.png` as the historical coordinate reference source; the frontend does not request it during normal online OSM loading.

Final runtime assets introduced by this work:

- `backend/static/lib/leaflet/`
- `backend/static/lib/proj4/`

Discarded intermediate approaches:

- Hybrid static PNG plus SVG overlay.
- Generated landmask SVG basemap.
- Generated AI-style static basemap as the primary map.
- Fixed-screen grid anchored over OSM.
- Per-frame SVG coordinate reprojection.

## Validation Record

Local checks run during the final map iteration:

- `node --check backend/static/js/app.js`
- `PYTHONPYCACHEPREFIX=.codex_pycache python3 -m compileall -q backend scripts`
- Playwright checks for OSM tile requests, no `tile_map.png` request during normal online loading, no SVG text labels, Canvas grid rendering, zoom, drag, tile selection, fallback behavior, and mobile layout.

Remote checks run on `worktree-zhaolin`:

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

The following intermediate files from the map exploration were removed after the final OSM/Canvas design was selected:

- `backend/static/assets/tile_landmask.svg`
- `backend/static/assets/tile_basemap.png`
- `scripts/generate_tile_landmask_svg.py`
- `scripts/generate_tile_basemap.py`
- `scripts/__pycache__/`

Keep generated caches, Python bytecode, `.DS_Store`, and scene cache output out of version control.

## Open Follow-up Items

The latest backend review findings are still open and were not part of the map work:

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
