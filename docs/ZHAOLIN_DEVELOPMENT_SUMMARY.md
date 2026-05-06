# Zhaolin Development Summary

This document records Zhaolin's dated development work, validation context,
cleanup notes, and handoff guidance for the HKU wireless digital twin platform.

## Developer Context

- Developer: Zhaolin
- Remote host: `defaultuser@100.65.77.20`
- Remote work folder: `/home/defaultuser/worktree-zhaolin`
- Main validation port: `8090`
- Demo port used this round: `9000`
- GPU runtime: `/home/defaultuser/venvs/sionna-gpu`
- Scene root for remote runtime: `/home/defaultuser/worktree-zhaolin/HKU_scenes`

Use `worktree-zhaolin` for Zhaolin validation. Do not restart, kill, or sync
over another developer's worktree, especially `worktree-zihao`, unless explicitly
requested.

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

## Current API Surface Added on 2026-05-06

- `GET /api/rt/capabilities`
- `POST /api/mobility/jobs`
- `GET /api/mobility/jobs/{job_id}`
- `GET /api/mobility/jobs/{job_id}/result`
- Link solver payload additions: `solver.tx_array`, `solver.rx_array`
- Radio Map solver payload addition: `solver.tx_array`
- Mobility trajectory payload addition: `rx_trajectory.max_steps`

## New Final Files Kept

These files were created during this round and are intentional final artifacts:

- `backend/jobs/mobility_jobs.py`
- `backend/rt/solve_mobility.py`
- `tests/test_frontend_regressions.py`
- `tests/test_mobility_jobs.py`

They are referenced by server, solver, and regression tests, so they should not
be removed during cleanup.

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

Remote targeted validation should use the Sionna GPU venv:

```bash
cd /home/defaultuser/worktree-zhaolin
/home/defaultuser/venvs/sionna-gpu/bin/python -m compileall -q backend scripts tests
/home/defaultuser/venvs/sionna-gpu/bin/python -m unittest tests.test_frontend_regressions tests.test_mobility_jobs tests.test_server_hardening
for file in backend/static/js/*.js; do node --input-type=module --check < "$file" >/dev/null; done
node --input-type=module --check < backend/static/lib/GLBGeometryLoader.js >/dev/null
git diff --check
```

Useful remote smoke checks:

```bash
curl -fsS http://127.0.0.1:8090/api/health
curl -fsS http://127.0.0.1:8090/api/rt/capabilities
curl -fsS http://127.0.0.1:9000/api/health
```

## Remote Workflow

Start or restart the main Zhaolin backend from the Zhaolin worktree:

```bash
cd /home/defaultuser/worktree-zhaolin
export HKU_RT_HOST=0.0.0.0
export HKU_RT_PORT=8090
export HKU_RT_SCENE_ROOT=/home/defaultuser/worktree-zhaolin/HKU_scenes
nohup /home/defaultuser/venvs/sionna-gpu/bin/python -m backend.server >> server-8090.log 2>&1 &
```

Start a presentation instance only after confirming port `9000` is free:

```bash
cd /home/defaultuser/worktree-zhaolin
export HKU_RT_HOST=0.0.0.0
export HKU_RT_PORT=9000
export HKU_RT_SCENE_ROOT=/home/defaultuser/worktree-zhaolin/HKU_scenes
nohup /home/defaultuser/venvs/sionna-gpu/bin/python -m backend.server >> server-9000.log 2>&1 &
```

Before syncing to the remote worktree, back up overwritten files and remote diffs
under `/home/defaultuser/backups/...`. Do not touch other developers' worktrees.

## Cleanup Notes

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
