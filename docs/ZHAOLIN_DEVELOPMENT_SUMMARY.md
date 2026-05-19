# Zhaolin Development Summary

This document records Zhaolin's dated development work, validation context,
cleanup notes, and handoff guidance for the HKU wireless digital twin platform.

## Developer Context

- Developer: Zhaolin
- Remote host: `defaultuser@100.65.77.20`
- Remote work folder: `/home/defaultuser/worktree-zhaolin`
- Main validation port: `8090`
- Optional demo port: `9000`
- GPU runtime: `/home/defaultuser/venvs/env_hku_rt_gpu`
- Scene root entry for remote runtime: `/home/defaultuser/worktree-zhaolin/scene`
- Current scene data is exposed through the worktree `scene` entry.

Use `worktree-zhaolin` for Zhaolin validation. Do not restart, kill, or sync
over another developer's worktree, especially `worktree-zihao`, unless explicitly
requested. The Zhaolin scene-root entry is currently a symlink to the shared
scene asset store; do not change the remote symlink or asset-sharing policy as
part of code sync work.

## 2026-05-19 - Tile Download Hardening, Per-Tile Runtime Cleanup, and Open-Source Scene Defaults

This round focused on making the new-tile download path reliable for open-source
users: fresh installs can start from an empty `scene/` directory, downloaded
tiles integrate into the per-tile layout without corrupting existing data, and
the default scene naming no longer exposes project-specific data-folder names.

### Loading Progress for New Tile Bundles

- Fixed the loading overlay for newly downloaded tiles whose manifest bundles do
  not yet have cached `.glb`/`.gz` sizes.
- `viewer.syncBundles()` now starts with manifest size hints and then updates
  per-bundle transfer totals from the runtime loader progress events, including
  `Content-Length`, `X-Original-Content-Length`, and
  `X-Compressed-Content-Length`.
- Finished bundles that still lack a server-reported total fall back to their
  final loaded byte count, so completed transfers do not remain unresolved.
- The scene loading copy no longer prints `unknown`; unresolved totals are shown
  as downloaded bytes plus speed, with optional size-resolution wording.

### Serialized Tile Downloads

- Added a global active-job guard to `TileDownloadJobManager`.
- Repeated requests for the same active tile still return the existing job, but
  a different tile download while another tile is queued, running, or canceling
  returns HTTP `409` with the active job and tile IDs.
- The entry-map frontend now blocks starting any other tile download while one
  download is active, covering both map-click and direct download paths.
- This protects scene mutation from concurrent tile integrations, especially the
  XML write path.

### Per-Tile-Only Runtime and Migration

- Fixed per-tile-only origin inference by letting `_scene_tile_ids()` read
  `common/scene_common.xml + tiles/*.xml` even when the optional full-scene XML
  file is absent.
- Removed implicit runtime fallback to a full-scene XML source. Runtime manifest
  loading and RT selection now use the per-tile layout as the source of truth.
- Added `ensure_scene_layout()` so an empty scene root is bootstrapped with
  `common/`, `tiles/`, `meshes/`, and cache directories.
- Empty scene roots now return an empty manifest instead of failing startup,
  allowing first-time users to launch the app and download their first tile.
- Added `backend.tools.migrate_legacy_scene_xml` as the explicit safety path for
  existing full-scene XML users. It refuses to overwrite existing per-tile XML by
  default and can merge only missing tiles when requested.

### Staged Tile Integration

- Changed tile integration to a staged commit: mesh files are written under a
  temporary commit directory inside `scene/cache/` first.
- Tile XML is prepared before the final commit and references the final
  `meshes/<tile>/...` paths.
- Commit order is now: move staged mesh directory into `scene/meshes/<tile>/`,
  then atomically replace `scene/tiles/<tile>.xml`.
- Non-cancel exceptions and cancellation both clean the current tile's staged
  and final outputs, avoiding orphan meshes and half-integrated tile XML.
- `origin.json` remains a reusable scene/stage cache and is not removed on
  integration failure.

### Open3D HK Category Recovery

- Added canonical Open3D HK category resolution for downloaded GLTF paths,
  including nested wrappers such as `tile/GLTF/BUILDING/...` and source roots
  that are already category directories.
- Supported categories include `BUILDING`, `GENERIC`, `INFRASTRUCTURE`,
  `INFRASTRUCTURE(TB)`, `TERRAIN(TB)`, `VEGETATION(TB)`, and `WATERBODY`.
- Stage cache reuse now validates category, category path, and material
  inference against each `source_gltf`; stale bad manifests are discarded and
  regenerated.
- Material mapping was covered for terrain, vegetation, and waterbody categories.
- Existing uncategorized remote tile remnants were cleaned from the Zhaolin scene
  for `11_SW_3B`, `11_SW_4A`, and `11_SW_4C`; later downloads can rebuild those
  tiles with the corrected category logic.

### Open-Source Scene Directory Naming

- Changed the default scene root from the project-specific old name to `scene/`.
- Changed the default optional full-scene XML name to `scene/scene.xml`.
- Kept `HKU_RT_SCENE_ROOT` as the runtime override, but stopped resolving
  `config.SCENE_ROOT` at definition time so health/log output preserves the
  worktree symlink path.
- Updated `.gitignore`, README, setup/collaboration docs, asset-sync scripts,
  config defaults, and default tests to use `scene/`.
- Zhaolin's remote worktree now exposes runtime data through
  `/home/defaultuser/worktree-zhaolin/scene`; the old worktree-level scene
  symlink name was removed.

### Validation and Remote State

- Local validation run during the round:
  - `python3 -m unittest tests.test_frontend_regressions`
  - `python3 -m unittest tests.test_tile_download_jobs tests.test_server_hardening`
  - `python3 -m unittest tests.test_incremental_tiles`
  - `python3 -m unittest tests.test_tile_scene_xml`
  - `python3 -m unittest tests.test_deepmimo_export_worker`
  - `find backend/static/js -maxdepth 1 -name '*.js' -print0 | xargs -0 -n1 node --check`
  - `git diff --check`
- The final open-source naming pass was synced to
  `/home/defaultuser/worktree-zhaolin` and the Zhaolin `8090` service was
  restarted.
- Latest recorded Zhaolin service PID for this round: `519385`.
- Zihao's `18091` service was not touched; latest observed PID remained
  `468828`.
- Remote HTTP smoke passed against `http://100.65.77.20:8090`, including
  health, manifest, RT scene selection, gzip bundle/304, Link, advanced Link,
  and Radio Map job checks.

### Cleanup Result

- Ran `bash scripts/clean_generated_files.sh`.
- Scanned for `__pycache__`, `.pyc`, `.pytest_cache`, `.mypy_cache`,
  `.ruff_cache`, `.DS_Store`, AppleDouble `._*`, patch rejects, and backup
  rejects; none remained in the local worktree.
- Kept `backend/tools/migrate_legacy_scene_xml.py` because it is the explicit
  migration path for existing full-scene users and is covered by
  `tests/test_tile_scene_xml.py`.
- Kept `tests/test_tile_download_jobs.py` because it covers the global active-job
  guard and duplicate-job semantics.
- No unused source, test, script, frontend, or documentation file remains from
  the 2026-05-19 development round.

## 2026-05-18 - DeepMIMO Export, Scene-Bound Jobs, and Multi-User Sync Docs

This round added the selected-tile DeepMIMO ROI export workflow and then closed
two P1 correctness/safety issues plus one P3 collaboration-documentation issue.

### DeepMIMO ROI Export

- Added DeepMIMO mode to the UI with Tx placement, rectangular ROI drawing,
  manual ROI dimensions, Rx spacing/height/max receiver/chunk controls, solver
  budget controls, progress display, and dataset download.
- Added asynchronous DeepMIMO job APIs for create, status, and download.
- The server binds DeepMIMO export jobs to the currently loaded RT tile
  selection; users must load at least one tile before export.
- The worker builds a selected-tile Sionna scene XML, projects receivers onto
  terrain, optionally filters building footprints by AABB, traces receivers in
  chunks, exports Sionna RT paths, converts to DeepMIMO, and packages
  `dataset.zip`.
- DeepMIMO jobs use bounded queue/stored-job settings and a dedicated worker
  Python executable from `HKU_RT_DEEPMIMO_ENV_PYTHON`.

### DeepMIMO Receiver Grid Safety

- Added pure mathematical receiver-grid counting before any NumPy grid
  allocation.
- The payload parser now rejects oversized ROI/spacing/max-receiver
  combinations before job creation, returning HTTP `400` instead of starting a
  worker that fails later.
- The worker repeats the same guard before `np.arange`, `np.meshgrid`, or
  `np.column_stack` can allocate large candidate arrays.
- The frontend receiver estimate now uses the same half-step tolerance as the
  backend `np.arange(min, max + spacing * 0.5, spacing)` behavior.
- Oversized grids fail with the explicit message:
  `ROI grid creates N receivers, above max_receivers=M`.

### Scene-Generation Binding for Background Jobs

- Radio Map and Mobility job creation now captures the current RT runtime
  `scene_generation` while the scene is ready.
- Each background job stores that generation and passes it into the solver.
- Link, Radio Map, and Mobility solvers validate the expected generation before
  mutating the scene or adding temporary devices.
- If the user changes the selected scene while a job is queued, the job fails
  instead of silently running against the newer scene.
- Stale jobs report:
  `Sionna RT scene changed since this job was queued; create a new job`.

### Multi-User Remote Sync Documentation

- Kept all `scripts/sync_*` and remote cleanup script defaults unchanged for
  backward compatibility.
- Documented `/home/defaultuser/HKU-RT/v3.0` as the shared/legacy root and
  shared scene-asset location, not as every developer's active code worktree.
- Added a multi-user rule: confirm developer identity, read that developer's
  notes, use the matching `worktree-*` and port, and pass
  `HKU_RT_REMOTE_ROOT` explicitly for code syncs.
- Added Zihao's known worktree context:
  `/home/defaultuser/worktree-zihao`, port `18091`.
- Clarified that Zhaolin's `scene` entry in
  `/home/defaultuser/worktree-zhaolin` points to the shared scene asset store.

### Validation and Remote State

- Local validation passed:
  - `python3 -m compileall -q backend scripts tests`
  - `python3 -m unittest discover -s tests`
  - `find backend/static/js -name '*.js' -maxdepth 1 -print0 | xargs -0 -n1 node --check`
  - `node --check backend/static/lib/GLBGeometryLoader.js`
  - `git diff --check`
- DeepMIMO and scene-generation fixes were synced to
  `/home/defaultuser/worktree-zhaolin`.
- The Zhaolin `8090` service was restarted; latest recorded PID for this round:
  `449265`.
- Remote HTTP smoke passed against `http://100.65.77.20:8090`, including
  health, manifest, RT scene preload, bundle gzip/304, Link, advanced Link, and
  Radio Map job checks.
- The final documentation-only cleanup for the multi-user sync notes is local
  until the next requested sync.

## 2026-05-18 - Tile-Lazy Sionna Runtime and Per-Tile XML Source

This round removed the full-scene Sionna preload from startup and made selected
tiles the source of truth for runtime RT loading. The backend still exposes the
same user-facing tile workflow, but Sionna now loads only the current tile
selection instead of all 10510 scene shapes.

### Lazy RT Scene Selection

- Stopped loading `scene.xml` into Sionna during backend startup.
- Added `GET /api/rt/scene-selection` and `POST /api/rt/scene-selection` for
  runtime Sionna scene status and selected tile changes.
- Added background selection loading with generation/latest-wins semantics, so
  stale loads cannot replace a newer tile selection.
- Added explicit `empty`, `loading`, `ready`, and `failed` runtime states with
  active/requested tile IDs, shape counts, generation, preload time, and active
  generated XML path.
- Made Link, Radio Map, and Mobility return HTTP `409` while the Sionna scene is
  empty, loading, or failed instead of running against a missing scene.
- Freed the old loaded scene reference before starting a new selection load and
  attempted Dr.Jit memory/cache flushes to reduce GPU memory pressure.
- Updated the frontend tile synchronization path so every tile add/remove posts
  the full selected tile list to `/api/rt/scene-selection`.
- Updated the loading overlay copy to `Load scene for x tile(s)`.

### Per-Tile XML Source of Truth

- Added `scene/common/scene_common.xml` as the long-term location for
  shared Mitsuba/Sionna XML nodes such as `integrator`, `emitter`, and `bsdf`.
- Added `scene/tiles/<tile_id>.xml` as the long-term location for each
  tile's `shape` nodes.
- Kept `scene.xml` as a compatibility/debug full-scene export; lazy
  runtime and manifest loading now prefer `common/` + `tiles/` when present.
- Later runtime revisions removed implicit full-scene fallback; use explicit
  migration/import tooling for full-scene XML sources.
- Generated temporary runtime XML files under `generated/rt_scene_xml/` by
  combining common XML plus the currently selected tile XML files.
- Rewrote generated shape filenames to absolute mesh paths before Sionna loads
  the temporary selection XML.
- Confirmed the lazy path still works when `scene.xml` is absent, as long
  as `common/scene_common.xml` and `tiles/*.xml` exist.

### Migration Tool

- Added `backend.tools.split_tile_scene_xml`.
- The tool splits an existing full `scene.xml` into:
  - `scene/common/scene_common.xml`
  - `scene/tiles/<tile_id>.xml`
- It validates that each shape belongs under `meshes/<tile>/<category>/...`.
- It refuses to overwrite existing per-tile XML unless `--force` is passed.
- Remote migration on 2026-05-18 produced `14` tile XML files and preserved all
  `10510` original shape nodes.

### Remote Validation

- Synced code to `/home/defaultuser/worktree-zhaolin`.
- Restarted the Zhaolin validation service on port `8090`.
- Last recorded restart PID for this round: `426989`.
- Verified startup no longer waits for full Sionna scene preload; initial
  `/api/rt/scene-selection` returns `empty`.
- Verified single-tile loading:
  - `11_SW_14A`
  - `491` shapes
  - generated XML contains only that tile
- Verified multi-tile loading:
  - `11_SW_14A + 11_SW_14B`
  - `1620` shapes
  - Link solve returned `ok: true`
- Verified removing a tile reloads the runtime selection and removes that tile
  from `active_tile_ids`.

## 2026-05-07 - Radio Map Grid, Live Link Preview, Mobility Editing, and Dock Polish

This round focused on making the RT demo feel interactive and explainable:
Radio Map now has explicit sampling, terrain-following grid resolution, clearer
display controls, and a better result dock; Link mode gained low-cost live
preview and surface clearance for physically safer Tx/Rx placement; Mobility
editing became keyboard-driven; and the top-right Results dock can now collapse.

### Radio Map Reliability and Budget Semantics

- Fixed the visible `Samples / Tx` control so Radio Map submits
  `solver.samples_per_tx` from the UI instead of hard-coding `1000000`.
- Changed Radio Map failure handling to show `job.error` before generic
  messages, so Sionna/terrain errors are visible in the frontend overlay.
- Added `surface.cell_size` parsing with meter units and bounded validation
  through `MIN_RADIOMAP_CELL_SIZE..MAX_RADIOMAP_CELL_SIZE`.
- Split sampling semantics into base and effective samples:
  `base_samples_per_tx` is parsed from the request, then
  `effective_samples_per_tx` is derived after terrain patch metadata is known.
- Kept Auto mode compatible: when `Cell Size` is blank, the existing
  `density_level` path remains the fallback behavior.

### Radio Map Cell-Size Grid

- Replaced the first cell-size implementation, which globally subdivided
  selected terrain triangles, with a regular XY measurement grid that follows
  the terrain height.
- `cell_size=10` over `160 x 160 m` now means a `16 x 16` grid, represented as
  `512` solver triangles. `cell_size=100` over the same area becomes a `2 x 2`
  grid, represented as `8` solver triangles.
- Grid vertices are projected onto the selected terrain mesh with barycentric
  interpolation in XY and a nearest-triangle plane fallback for edge misses.
- The cell-size path reports:
  - `resolution_mode: "cell_size_grid"`
  - `requested_cell_size`
  - `resolved_cell_size_x`
  - `resolved_cell_size_y`
  - `grid_shape`
  - `grid_cell_count`
  - `triangle_count`
- `MAX_RADIOMAP_CELLS` now guards the solver triangle count for the regular
  grid path.

### Radio Map Display and Result Dock

- Added a shared frontend colormap helper with `viridis`, `plasma`, `turbo`, and
  `jet`.
- Set Radio Map's default and fallback colormap to `jet`, including viewer
  rendering and the UI select.
- Added a horizontal Radio Map colorbar in the result dock with display limits
  and colormap name.
- Moved Radio Map results into the same top-right dock used by Link and
  Mobility.
- Rewrote the Radio Map result summary to separate:
  - status and metric
  - grid cells versus solver triangles
  - area
  - target versus resolved cell size
  - base versus effective samples
  - solver result range versus display color scale
- Fixed Radio Map completion UI refresh so the bottom `Tx` and `Run Map`
  buttons come back automatically after a job finishes or fails.

### Link Live Preview and Surface Clearance

- Added opt-in `Live Preview` for Link mode only, default off to protect shared
  GPU time.
- Link preview uses low samples, disables taps, caps preview path count, ignores
  stale responses with generation tokens, and replaces preview output with a
  final solve after movement stops.
- Added true canvas drag for active Link Tx/Rx placement while preserving
  click-to-place behavior.
- Removed Radio Map live preview after validation showed it was too slow for the
  current remote workflow. Radio Map remains manual via `Run Map`.
- Added `Surface Clearance (m)`, default `1.5`, for Link Tx/Rx placement.
  Picked solver coordinates are lifted along the hit triangle normal by this
  clearance.
- Extended the same clearance behavior to Radio Map Tx placement. Direct manual
  coordinate entry remains exact and is not automatically projected or lifted.

### Device Position Compact Bar

- Replaced the bulky bottom device-position card with a compact one-line float
  bar for `Tx`, `Rx`, and `RM Tx`.
- Kept X/Y/Z manual inputs, clearance input, click placement, drag placement,
  and solver payload semantics unchanged.
- Balanced the coordinate and clearance input widths after visual QA:
  values stay left-aligned, unit spacing is tighter, and mobile layouts wrap
  without horizontal overflow.

### Mobility Empty Trajectory and Keyboard Editing

- Changed Mobility's initial Rx trajectory from two default waypoints to an
  empty list.
- Added `selectedWaypointIndex` and active waypoint row styling.
- `Enter` in Mobility mode adds the current Link Rx coordinate as a waypoint
  when focus is not inside an editable input.
- `Delete` removes the selected waypoint when focus is not inside an editable
  input.
- `Clear` now truly clears all waypoints.
- The viewer now renders a single Mobility waypoint marker, and renders a
  trajectory line once there are at least two points.
- Backend Mobility validation is unchanged: running a Mobility job still
  requires at least two waypoints.

### Results Dock Scrollbar and Collapse

- Moved Results dock scrolling into an inner `.channelAnalysisScroll` container
  so the scrollbar stays inside the rounded panel instead of sitting on the
  outer corner.
- Added a clickable Results header with `aria-expanded`, `aria-label`,
  `aria-controls`, and hidden-content `inert` handling.
- Added `state.resultDock.expanded = true`, shared by Link, Mobility, and
  Radio Map.
- Collapsed state keeps a compact title strip with the result type, subtitle or
  live status, and a chevron. Mode switches and new results preserve the user's
  current collapsed/expanded choice.

### Remote Validation

- Synced the latest local code to `/home/defaultuser/worktree-zhaolin`.
- Restarted the remote validation service on port `8090`.
- Last recorded restart PID for this round: `173826`.
- Browser QA on `http://100.65.77.20:8090/` confirmed:
  - page identity and initial render
  - tile loading into the 3D scene
  - Link result dock default expanded
  - Results dock collapse and re-expand
  - `aria-expanded` and `collapsed` class updates
  - no relevant app-side console errors

## 2026-05-06 - Advanced RT UI, Antenna Arrays, Mobility, and Showcase Mode

This round moved the platform from static Link/Radio Map experiments toward an
interactive communication-research demo: array-aware link solving, geometry-path
aggregation, dynamic Rx mobility, cleaner result analysis, and a camera orbit
showcase button.

### Review Fixes

- Fixed partial bundle failure accounting so a tile is marked loaded only after
  all expected bundles for that tile are present.
- Hardened bundle GET error handling so cache/build failures return controlled
  HTTP errors instead of dropping the connection.
- Fixed entry-map search focus so focusing a search result no longer resets the
  tile selection badge to a zero-count state.

### Antenna Array Control

- Added `GET /api/rt/capabilities` for antenna-array defaults, limits, available
  patterns, and polarizations.
- Added array payloads for Link and Radio Map:
  - Link: `solver.tx_array` and `solver.rx_array`
  - Radio Map: `solver.tx_array`
- Added backend validation for rows, columns, element count, spacing, pattern,
  and polarization.
- Added runtime scene array configuration before each solve.
- Added frontend `Antenna Arrays` controls with options populated from
  `/api/rt/capabilities`.

### Array Path Aggregation

- Changed Link result semantics from antenna-pair path contributions to
  geometry-path display.
- `summary.valid_paths` now reports aggregated geometry paths.
- Added `summary.array_pair_paths` for diagnostic antenna-pair contribution
  count.
- Each displayed path sums power over valid antenna pairs and exposes
  `array_pair_count`, `strongest_pair_power_db`, and
  `power_policy: "sum_over_antenna_pairs"`.
- Path details in the UI now show array-pair diagnostics.

### Link Results Dock and Channel Chart

- Consolidated Link result summary, Path Details, optional Channel Analysis, and
  path selection into the top-right result dock.
- Renamed the dock to `Link Results` for Link mode and `Mobility Results` for
  Mobility mode.
- Moved variable-length path buttons into a dedicated bottom `Paths` block so
  path count changes no longer disrupt the middle of the analysis dock.
- Improved the CIR/tap chart with non-clipped labels, `Power (dB)` and
  `Tap Index` axis titles, max/mid/min Y ticks, first/peak/last X ticks, and
  clearer tooltip text.

### Mobility Mode

- Added a third `Mobility` tab for Rx trajectory experiments with fixed Tx.
- Added asynchronous Mobility job APIs:
  - `POST /api/mobility/jobs`
  - `GET /api/mobility/jobs/{job_id}`
  - `GET /api/mobility/jobs/{job_id}/result`
- Implemented polyline waypoint sampling with velocity and time-step inputs,
  always including the trajectory endpoint.
- Reused Link solver configuration, antenna arrays, and optional CIR/taps for
  every mobility sample.
- Added Rx velocity to temporary Sionna devices so returned path Doppler has
  physical meaning.
- Added result series for time, distance, received power, valid paths, strongest
  path, max absolute Doppler, and peak tap power.
- Added frontend trajectory controls, waypoint preview, sample markers,
  timeline chart, step scrubber, playback, speed selection, and looping.
- Added configurable `rx_trajectory.max_steps`, default `50`, with user-adjustable
  range `2..500`.

### Tx Orbit Showcase

- Added a bottom-bar `Orbit` button for demonstration.
- Link and Mobility modes orbit around `state.link.txVisual`.
- Radio Map mode orbits around `state.radiomap.txVisual`.
- The button toggles between `Orbit` and `Stop`, and stops automatically on
  manual camera interaction, Reset View, WASD/free-look, or mode switch.
- This is a pure frontend camera feature and does not change solver payloads or
  backend APIs.

### Remote Demo

- Kept the normal validation instance on port `8090`.
- Started a separate demo instance on port `9000` from the same Zhaolin worktree
  when the port was confirmed free.
- The demo instance serves the same latest UI and is intended for presentation
  use without disturbing the main `8090` validation service.

## Current API and Payload Surface Added by Recent Rounds

- `GET /api/rt/capabilities`
- `GET /api/rt/scene-selection`
- `POST /api/rt/scene-selection`
- `POST /api/mobility/jobs`
- `GET /api/mobility/jobs/{job_id}`
- `GET /api/mobility/jobs/{job_id}/result`
- `POST /api/deepmimo/jobs`
- `GET /api/deepmimo/jobs/{job_id}`
- `GET /api/deepmimo/jobs/{job_id}/download`
- Link solver payload additions: `solver.tx_array`, `solver.rx_array`
- Radio Map solver payload addition: `solver.tx_array`
- Radio Map surface payload addition: optional `surface.cell_size`, in meters
- Radio Map result metadata additions:
  - `surface.resolution_mode`
  - `surface.requested_cell_size`
  - `surface.resolved_cell_size`
  - `surface.resolved_cell_size_x`
  - `surface.resolved_cell_size_y`
  - `surface.grid_shape`
  - `surface.grid_cell_count`
  - `surface.triangle_count`
  - `solver.base_samples_per_tx`
  - `solver.effective_samples_per_tx`
- Mobility trajectory payload addition: `rx_trajectory.max_steps`
- DeepMIMO payload surface:
  - `tx.position`, `tx.orientation`
  - rectangular `roi`
  - `rx_grid.spacing`, `height`, `max_receivers`, `chunk_size`,
    `filter_buildings`
  - solver budget/reflection flags
  - `export.scenario_name`
- Radio Map and Mobility background jobs now bind to the RT scene generation
  captured at job creation.

## New Final Files Kept

These files were created during recent Zhaolin rounds and are intentional final
artifacts:

2026-05-18 DeepMIMO/job-binding/P3 round:

- No new standalone source or test files were introduced; this round updated
  existing backend, frontend, test, and documentation files.
- The DeepMIMO job manager, payload parser, export worker, frontend controls,
  Radio Map/Mobility scene-generation guards, and related regression tests are
  intentional final changes and should not be removed as cleanup.

2026-05-18:

- `backend/scene/tile_scene_xml.py`
- `backend/tools/split_tile_scene_xml.py`
- `tests/test_tile_scene_xml.py`

2026-05-07:

- `backend/static/js/colormaps.js`
- `tests/test_terrain_patch.py`

2026-05-06:

- `backend/jobs/mobility_jobs.py`
- `backend/rt/solve_mobility.py`
- `tests/test_frontend_regressions.py`
- `tests/test_mobility_jobs.py`

They are referenced by server, solver, frontend modules, and regression tests,
so they should not be removed during cleanup.

## 2026-05-05 - Backend Hardening, Setup, and Advanced Link Output

- Added strict solver payload parsing for finite numbers, bounded ints/floats,
  coordinate vectors, seeds, booleans, and channel settings.
- Added server-side caps and `HKU_RT_*` overrides for solver, radio-map, tap, and
  queue settings.
- Replaced radio-map one-thread-per-job behavior with a bounded background job
  manager and queue-full HTTP `429`.
- Hardened static and mesh path containment checks.
- Added setup documentation and remote validation notes in `docs/SETUP.md`.
- Added advanced Link solver options and compact CIR/taps output.
- Added Physical Layer, Propagation, Solver Budget, and Channel Output control
  groups in the UI.

## 2026-05-05 - Frontend Module Split and 3D Research UI

- Kept `/js/app.js` as the browser entrypoint and split implementation into
  focused native ES modules.
- Added modules for state, DOM refs, tile modeling, entry map, performance panel,
  solver controls, scene rendering, and parameter tooltips.
- Reworked the control panel into research parameter groups with unit suffixes
  and viewport-level tooltips.
- Added a compact performance dock with category visibility, material mode, DPR
  mode, and loaded bundle metrics.
- Replaced previous device cards with the bottom-centered Tx/Rx action bar and
  compact coordinate popover.
- Improved map/3D switching so tile selection changes only when explicitly
  applied.

## Earlier Work

### 2026-05-04 - Entry Map UX, Place Search, and Bundle Loading

- Replaced manual tile ID entry with an OSM/Leaflet map-first workflow.
- Added Hong Kong place search, search result candidates, map fitting, temporary
  markers, tile highlighting, and manual tile selection.
- Rebuilt the entry screen with HKU/ECE branding and a floating sidebar.
- Added bundle loading diagnostics, stream progress where available,
  conservative bundle concurrency, and clearer loading overlay state.

### 2026-04-29 - Initial Map OSM Upgrade

- Rebuilt the initial tile-selection map on Leaflet 1.9.x and Carto Light OSM.
- Added vendored `proj4` and EPSG:2326 Hong Kong Grid conversion.
- Preserved the original tile model while replacing dense SVG labels with Canvas
  tile rendering.
- Removed discarded intermediate map assets and generation scripts after the
  OSM/Canvas design was selected.

## Validation

Run this local validation set before handoff:

```bash
python3 -m compileall -q backend scripts tests
python3 -m unittest discover -s tests
for file in backend/static/js/*.js; do node --check "$file"; done && node --check backend/static/lib/GLBGeometryLoader.js
git diff --check
```

Remote targeted validation should use the authoritative GPU environment:

```bash
cd /home/defaultuser/worktree-zhaolin
/home/defaultuser/venvs/env_hku_rt_gpu/bin/python -m compileall -q backend scripts tests
/home/defaultuser/venvs/env_hku_rt_gpu/bin/python -m unittest tests.test_tile_scene_xml tests.test_frontend_regressions tests.test_mobility_jobs tests.test_server_hardening tests.test_terrain_patch
for file in backend/static/js/*.js; do node --input-type=module --check < "$file" >/dev/null; done
node --input-type=module --check < backend/static/lib/GLBGeometryLoader.js >/dev/null
git diff --check
```

Useful remote smoke checks:

```bash
curl -fsS http://127.0.0.1:8090/api/health
curl -fsS http://127.0.0.1:8090/api/rt/capabilities
curl -fsS http://127.0.0.1:8090/api/rt/scene-selection
curl -fsS http://127.0.0.1:9000/api/health
```

## Remote Workflow

Sync to Zhaolin's remote worktree with an explicit target. Do not rely on the
script default, which remains the shared/legacy root:

```bash
HKU_RT_REMOTE_ROOT=/home/defaultuser/worktree-zhaolin bash scripts/sync_code_to_remote.sh
```

Create or refresh the per-tile scene XML source from the current full scene:

```bash
cd /home/defaultuser/worktree-zhaolin
/home/defaultuser/venvs/env_hku_rt_gpu/bin/python -m backend.tools.split_tile_scene_xml \
  --scene-root /home/defaultuser/worktree-zhaolin/scene \
  --source-xml /home/defaultuser/worktree-zhaolin/scene/scene.xml \
  --force
```

Start or restart the main Zhaolin backend from the Zhaolin worktree:

```bash
cd /home/defaultuser/worktree-zhaolin
export HKU_RT_HOST=0.0.0.0
export HKU_RT_PORT=8090
export HKU_RT_SCENE_ROOT=/home/defaultuser/worktree-zhaolin/scene
nohup /home/defaultuser/venvs/env_hku_rt_gpu/bin/python -m backend.server >> server-8090.log 2>&1 &
```

Start a presentation instance only after confirming port `9000` is free:

```bash
cd /home/defaultuser/worktree-zhaolin
export HKU_RT_HOST=0.0.0.0
export HKU_RT_PORT=9000
export HKU_RT_SCENE_ROOT=/home/defaultuser/worktree-zhaolin/scene
nohup /home/defaultuser/venvs/env_hku_rt_gpu/bin/python -m backend.server >> server-9000.log 2>&1 &
```

Before syncing to the remote worktree, back up overwritten files and remote diffs
under `/home/defaultuser/backups/...`. Do not touch other developers' worktrees.

## Cleanup Notes

Final cleanup result for 2026-05-18 DeepMIMO/job-binding/P3 round:

- Ran the local generated-file cleanup script:
  `bash scripts/clean_generated_files.sh`.
- Scanned for `__pycache__`, `.pyc`, `.pytest_cache`, `.mypy_cache`,
  `.ruff_cache`, `.DS_Store`, AppleDouble `._*`, patch rejects, and backup
  rejects; none remained in the local worktree.
- Confirmed there are no untracked repository files after cleanup.
- No unused source, test, frontend, script, or documentation file was produced
  by this round.
- Remote runtime logs and generated job directories are runtime artifacts on the
  remote server, not repository-tracked files; they were not deleted during this
  local cleanup.

Final cleanup result for 2026-05-18:

- Removed local `.DS_Store` files from the repository root, `backend/`, and
  `backend/static/`.
- Removed stale remote generated selection XML files from
  `/home/defaultuser/worktree-zhaolin/generated/rt_scene_xml/`.
- Restored the currently active remote selection XML after detecting that the
  running 8090 service had an active browser-submitted tile selection.
- Kept `scene/common/scene_common.xml` and `scene/tiles/*.xml` on the
  remote because they are now the runtime scene source of truth, not temporary
  artifacts.
- Kept `backend/scene/tile_scene_xml.py`, `backend/tools/split_tile_scene_xml.py`,
  and `tests/test_tile_scene_xml.py` because they are referenced by runtime,
  manifest loading, migration, and regression tests.
- No unused source, test, tool, or generated frontend file remains from the
  2026-05-18 development round.

Final cleanup result for 2026-05-07:

- Scanned the repository for `__pycache__`, `.pyc`, `.pytest_cache`,
  `.DS_Store`, patch rejects, backups, and common temporary files; none were
  present in the worktree.
- Removed local validation scratch file `/tmp/hku_rt_caps.json`.
- Confirmed the only untracked repository files are intentional final artifacts:
  `backend/static/js/colormaps.js` and `tests/test_terrain_patch.py`.
- Kept remote `server-8090.log` as a runtime diagnostic log; it is not a
  repository-tracked artifact.
- No unused source, test, or generated frontend file remains from the 2026-05-07
  development round.

Final cleanup result for 2026-05-06:

- Removed local `.DS_Store` from the repository root.
- Removed remote AppleDouble `._*` files that macOS tar created during sync.
- No unused source, test, generated asset, or scratch implementation file remains
  in the local cleanup scan.
- The new Mobility source and regression tests are intentionally kept because
  they are referenced by the server, solver runtime, or test suite.
- Remote `server-8090.log` and `server-9000.log` are runtime logs on the remote
  worktree and are not repository-tracked artifacts.

Cleanup history:

- 2026-05-05 runtime preload work removed remote benchmark scratch files from
  `/tmp` and kept the active Zhaolin server log for diagnostics.
- 2026-04-29 map exploration removed discarded generated basemap/landmask files
  and related scripts after the final OSM/Canvas design was selected.

## Handoff Checklist

When handing off future Zhaolin work:

- State the local branch or worktree used.
- State whether code was synced to `/home/defaultuser/worktree-zhaolin`.
- State whether `8090` was restarted and which validation checks passed.
- State whether `9000` is running as a demo instance.
- Confirm that browser-visible static files were synced after the last UI change.
- List any cleanup performed and any intentionally kept new final artifacts.
