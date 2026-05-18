# Setup and Validation

This project is a source snapshot for the HKU Wireless Digital Twin Platform. The
GitHub repository contains the Python backend, static frontend, tests, docs, and
sync scripts. It does not contain `HKU_scenes/`.

## Local Development

Use the local workspace for code edits, docs, static frontend checks, and unit
tests that do not need the full scene or GPU runtime.

Recommended local checks:

```bash
python3 -m compileall -q backend scripts tests
python3 -m unittest discover -s tests
node --check backend/static/js/app.js
node --check backend/static/js/viewer.js
node --check backend/static/js/api.js
for file in backend/static/js/*.js; do node --check "$file"; done
node --check backend/static/lib/GLBGeometryLoader.js
git diff --check
```

The dependency manifest is intentionally minimal:

```bash
python3 -m pip install -r requirements.txt
```

The listed packages are the runtime package names. The remote GPU environment
remains authoritative for Sionna RT, Mitsuba, Dr.Jit, CUDA, and device-specific
validation.

## Scene and Runtime Requirements

Local backend startup and RT solve flows require the scene assets plus either
the per-tile XML source or the legacy full-scene XML:

- `HKU_scenes/common/scene_common.xml` and `HKU_scenes/tiles/*.xml`
- or `HKU_scenes/scenario_HKU.xml` as the fallback legacy source
- `HKU_scenes/meshes/`
- Sionna RT
- Mitsuba
- Dr.Jit
- a compatible GPU runtime for practical solver validation

If `HKU_scenes/` is missing, `python3 -m backend.server` is expected to fail
during startup because the manifest cannot be built. The Sionna RT scene itself
is loaded lazily after the user selects one or more tiles.

To pull scene assets from the configured remote:

```bash
bash scripts/sync_assets_from_remote.sh
```

Generated scene caches under `HKU_scenes/cache/` are not source assets and are
excluded from asset sync.

The sync script default root is the shared/legacy remote root,
`/home/defaultuser/HKU-RT/v3.0`. For code work, use a developer-specific
worktree and pass `HKU_RT_REMOTE_ROOT` explicitly.

## Multi-User Remote Workflow

Before syncing code, restarting a service, or cleaning remote files:

1. Confirm the developer identity and matching worktree.
2. Read that developer's notes under `docs/`.
3. Use the matching worktree, port, and service only.
4. Pass `HKU_RT_REMOTE_ROOT=/home/defaultuser/worktree-...` for code syncs.

Known validation worktrees:

- Zhaolin: `/home/defaultuser/worktree-zhaolin`, port `8090`
- Zihao: `/home/defaultuser/worktree-zihao`, port `18091`

If the developer is not identified or no matching notes exist, ask before using
the script default or touching a remote service.

## Zhaolin Remote Workflow

Use Zhaolin's remote worktree for validation:

- host: `defaultuser@100.65.77.20`
- worktree: `/home/defaultuser/worktree-zhaolin`
- validation port: `8090`
- authoritative GPU virtualenv: `/home/defaultuser/venvs/env_hku_rt_gpu`

Sync code to Zhaolin's worktree:

```bash
HKU_RT_REMOTE_ROOT=/home/defaultuser/worktree-zhaolin bash scripts/sync_code_to_remote.sh
```

Restart only Zhaolin's service from `/home/defaultuser/worktree-zhaolin` when
backend or frontend runtime code changes. Do not restart or kill Zihao's
`worktree-zihao` service on port `18091` unless explicitly requested.

## Remote HTTP Smoke Test

After syncing and restarting the Zhaolin `8090` backend, run:

```bash
python3 scripts/smoke_remote_http.py
```

The smoke script is HTTP-only. It does not SSH, sync files, kill processes, or
restart services. By default it targets the Zhaolin validation service:

```text
http://100.65.77.20:8090
```

Override the target when needed:

```bash
HKU_RT_SMOKE_BASE_URL=http://127.0.0.1:8090 python3 scripts/smoke_remote_http.py
python3 scripts/smoke_remote_http.py --base-url http://100.65.77.20:8090
```

The smoke test checks `/api/health`, `/api/scene/manifest`,
`/api/rt/scene-selection`, gzip bundle serving, ETag/304 handling, low-sample
basic and advanced link solves, and a low-sample radio-map job. It expects at
least one manifest bundle to have a fresh
pre-compressed `.glb.gz` cache. If none exists, pre-compress bundles on the
remote before running the smoke test.

Advanced link solver caps are controlled by `HKU_RT_MAX_LINK_SAMPLES`,
`HKU_RT_MAX_LINK_MAX_NUM_PATHS_PER_SRC`, `HKU_RT_MAX_LINK_TAP_COUNT`,
`HKU_RT_MAX_LINK_FFT_SIZE`, and `HKU_RT_MAX_LINK_SUBCARRIER_SPACING_HZ`.
