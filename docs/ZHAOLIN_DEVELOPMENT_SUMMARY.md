# Zhaolin Development Summary

This document records Zhaolin's development context, dated feature work,
validation commands, cleanup results, and handoff notes for the HKU wireless
digital twin platform.

## Developer Context

- Developer: Zhaolin
- Remote host: `defaultuser@100.65.77.20`
- Remote work folder: `/home/defaultuser/worktree-zhaolin`
- Active validation port: `8090`
- Authoritative GPU runtime: `/home/defaultuser/venvs/sionna-gpu`
- Shared v3.0 scene assets: `/home/defaultuser/HKU-RT/v3.0/HKU_scenes`

Use `worktree-zhaolin` for Zhaolin validation. Do not restart, kill, or sync
over another developer's worktree, especially `worktree-zihao` on port `18091`,
unless explicitly requested.

## 2026-05-05 - Backend Hardening, Setup, and Remote Smoke

This round converted the backend review findings into implementation work and
added setup documentation for new developers.

Implemented functionality:

- Added `requirements.txt` with runtime dependency names: `numpy`, `sionna`,
  `mitsuba`, and `drjit`.
- Added `docs/SETUP.md` documenting what can run locally without `HKU_scenes`,
  what needs the remote Sionna/Mitsuba/Dr.Jit GPU runtime, and how Zhaolin
  should validate on `/home/defaultuser/worktree-zhaolin` port `8090`.
- Added strict solver payload parsing for finite numbers, bounded ints/floats,
  coordinate vectors, seeds, and booleans.
- Added server-side caps and `HKU_RT_*` environment overrides for frequency,
  max depth, samples, radio-map density/effective samples, seeds, advanced link
  path limits, FFT size, subcarrier spacing, and tap output size.
- Rejected invalid solver input with HTTP `400` instead of silently clamping.
- Replaced radio-map one-thread-per-job behavior with one background worker, a
  bounded pending queue, max stored job cleanup, and TTL cleanup.
- Added HTTP `429` for a full radio-map queue.
- Sanitized failed radio-map job API errors while logging full tracebacks on
  the server.
- Replaced prefix-based path containment checks with resolved `Path.relative_to`
  containment for static files and mesh serving.
- Added `scripts/smoke_remote_http.py`, an HTTP-only remote smoke script that
  covers health, manifest, gzip bundle delivery, ETag `304`, low-sample link
  solve, advanced link solve with taps enabled, and radio-map job/result
  polling.

Main files touched:

- `backend/config.py`
- `backend/rt/common.py`
- `backend/rt/solve_link.py`
- `backend/jobs/radiomap_jobs.py`
- `backend/server.py`
- `docs/SETUP.md`
- `requirements.txt`
- `scripts/smoke_remote_http.py`
- `tests/test_solver_validation.py`
- `tests/test_radiomap_jobs.py`
- `tests/test_server_hardening.py`
- `tests/test_solver_runtime_cleanup.py`

## 2026-05-05 - Advanced Link Solver and Channel Output

This round borrowed the official Sionna RT GUI's solver model, while keeping
the existing browser UI and HTTP backend.

Implemented functionality:

- Extended link solver validation with `max_num_paths_per_src`,
  `synthetic_array`, `diffraction`, `edge_diffraction`,
  `diffraction_lit_region`, and optional `channel.compute_taps`.
- Passed advanced options into Sionna RT `PathSolver` with defaults that
  preserve previous link solve behavior.
- Added compact CIR/taps output when `compute_taps=true`, returning only chart
  data and summary statistics rather than raw full channel tensors.
- Validated tap range constraints, tap count caps, FFT size, and subcarrier
  spacing bounds.
- Extended the remote smoke script with a low-sample advanced link solve.

Frontend functionality:

- Added a communication-research-oriented parameter model with Physical Layer,
  Propagation, Solver Budget, and Channel Output groups.
- Added Physical Layer controls for carrier frequency, bandwidth, OFDM carriers,
  and derived subcarrier spacing.
- Converted frontend bandwidth and OFDM carrier count into the existing backend
  `channel.subcarrier_spacing_hz` payload.
- Added a right-side Channel Analysis panel for compact CIR/taps stats and an
  SVG tap-power chart.

## 2026-05-05 - Frontend Module Split and 3D Research UI

This round split the large browser entry file into native ES modules with no
build step, then refined the 3D control surface for research workflows.

Implemented module split:

- Kept `/js/app.js` as the single script tag in `index.html`.
- Converted `app.js` into a bootstrap/orchestrator.
- Added focused modules:
  - `backend/static/js/app_state.js`
  - `backend/static/js/dom_refs.js`
  - `backend/static/js/tile_model.js`
  - `backend/static/js/entry_map.js`
  - `backend/static/js/performance_panel.js`
  - `backend/static/js/solver_controls.js`
  - `backend/static/js/scene_render_state.js`
  - `backend/static/js/param_tooltips.js`
- Fixed the duplicate `rxTitle` IDs by using non-unique class markup instead.

3D UI functionality:

- Reworked the left control panel into research parameter groups.
- Added hover/focus info tooltips for parameters, rendered through a
  viewport-level tooltip layer so panel scrolling no longer clips them.
- Moved physical units into input suffixes, including `GHz`, `MHz`, `kHz`, `m`,
  and `dB`.
- Renamed `Carrier Count / N_fft` to `OFDM Carriers`.
- Moved map return from a text control into a bottom-right round map button.
- Replaced the previous large Performance panel with a compact FPS block near
  the quick map button; clicking expands detailed performance and visibility
  controls.
- Moved CIR/taps results into the former top-right analysis area.

## 2026-05-05 - Device Controls and Map/3D Switching

This round unified the main 3D action controls and cleaned up map-page
navigation.

Implemented functionality:

- Replaced the previous Tx/Rx cards and left-panel solve buttons with a bottom
  centered action bar.
- Link mode shows `Tx`, `Rx`, and `Solve Link`.
- Radio Map mode shows `Tx` and `Run Map`.
- Added a compact Tx/Rx coordinate popover with fixed `1.0 m` number-input
  spinner steps and `m` suffixes.
- Removed the separate step input, X/Y/Z nudge buttons, Done button, and Cancel
  button from the device panel.
- Made Tx/Rx buttons toggleable: clicking an inactive device opens continuous
  placement mode; clicking the active device closes it.
- Changed placement prompts to fixed research-friendly text:
  `Click any surface to place Tx` and `Click any surface to place Rx`.
- Split tap picking from camera dragging: only short primary-pointer taps under
  `350 ms` and `6 px` movement place a device. Dragging, long press, right/mid
  button, window blur, Escape, mode switches, map return, and solve actions do
  not move Tx/Rx.
- Unified map/3D switching:
  - 3D page: bottom-right map button opens the tile map.
  - Map page: bottom-right 3D/cube button returns to the already-loaded 3D
    scene without applying pending tile selection.
  - The old map top-right `x` button was removed.
  - `Load Selected Tiles` / `Apply Tile Selection` remains the only action that
    changes the loaded tile set.

## 2026-05-05 - Existing Performance and Runtime Work Preserved

Earlier 2026-05-05 work remains part of the current baseline:

- Cached Sionna RT runtime preload avoids reloading `scenario_HKU.xml` for every
  solve request.
- Link and terrain radio-map solvers reuse the cached runtime and clean up
  temporary Tx/Rx devices in `finally`.
- Bundle serving supports pre-compressed `.glb.gz`, immutable cache headers,
  strong ETags, and `304` cache hits.
- The scene manifest exposes bundle cache metadata while staying `no-store`.
- Frontend bundle loading tracks transfer progress, parse/add phases, and
  visible performance data.
- Category visibility controls, material mode, DPR mode, and loaded bundle
  metrics remain available through the compact performance block.

## Earlier Work

### 2026-05-04 - Entry Map UX, Place Search, and Bundle Loading

- Replaced manual tile ID entry with an OSM/Leaflet map-first workflow.
- Added Hong Kong place search through user-triggered Nominatim requests.
- Added search result candidates, map fitting, temporary markers, tile
  highlighting, and manual tile selection.
- Rebuilt the entry screen with HKU/ECE branding and a floating sidebar.
- Added bundle loading diagnostics, stream progress when available, conservative
  bundle concurrency, and clearer loading overlay state.

### 2026-04-29 - Initial Map OSM Upgrade

- Rebuilt the initial tile-selection map on Leaflet 1.9.x and Carto Light OSM.
- Added vendored `proj4` and EPSG:2326 Hong Kong Grid conversion.
- Preserved the original tile model while replacing dense SVG labels with
  Canvas tile rendering.
- Removed discarded intermediate map assets and generation scripts after the
  OSM/Canvas design was selected.

## Validation

Local checks used for this development round:

```bash
for file in backend/static/js/*.js; do node --check "$file"; done
python3 -m compileall -q backend scripts tests
python3 -m unittest discover -s tests
git diff --check
```

Additional static checks used during frontend refactors:

```bash
python3 - <<'PY'
from html.parser import HTMLParser
from pathlib import Path

class IdParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.ids = {}

    def handle_starttag(self, tag, attrs):
        for key, value in attrs:
            if key == "id":
                self.ids.setdefault(value, 0)
                self.ids[value] += 1

parser = IdParser()
parser.feed(Path("backend/static/index.html").read_text())
dupes = {key: count for key, count in parser.ids.items() if count > 1}
if dupes:
    raise SystemExit(f"duplicate ids: {dupes}")
PY
```

Remote smoke after syncing/restarting Zhaolin `8090`:

```bash
python3 scripts/smoke_remote_http.py
```

The smoke script is HTTP-only. It must not SSH, sync, kill, or restart services.

## Remote Workflow

Sync code with an explicit remote root:

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

Before validating GPU-dependent flows, confirm `HKU_scenes/scenario_HKU.xml`
and meshes are available through the worktree's `HKU_scenes` path. The
repository intentionally does not include `HKU_scenes/`.

## Cleanup Notes

Final cleanup result for this round on 2026-05-05:

- No `__pycache__`, `.pyc`, `.pytest_cache`, `.DS_Store`, backup files, temp
  files, or unused generated files were found in the repository cleanup scan.
- `git clean -nd` only listed intentional new final artifacts: frontend modules,
  setup documentation, requirements, remote smoke script, and regression tests.
  They were kept.
- No scene assets, generated bundle caches, vendored libraries, remote logs, or
  unrelated files were removed.

Cleanup history:

- 2026-05-05 runtime preload work removed remote benchmark scratch files from
  `/tmp` and kept `/tmp/worktree-zhaolin-8090.log` for the active Zhaolin server.
- 2026-04-29 map exploration removed discarded generated basemap/landmask files
  and related scripts after the final OSM/Canvas design was selected.

## Handoff Checklist

When handing off future Zhaolin work:

- State the local branch or worktree used.
- State whether code was synced to `/home/defaultuser/worktree-zhaolin`.
- State whether port `8090` was restarted and which PID is active.
- State whether `18091` was only checked or intentionally changed.
- List the exact local and remote checks that passed.
- Note whether the browser-visible static files were synced after the last UI
  change.
