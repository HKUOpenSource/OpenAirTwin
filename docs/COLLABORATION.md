# Collaboration Workflow

## Project Boundaries

### Versioned Project Content

- `backend/`
- `HKU_scenes/scenario_HKU.xml`
- `HKU_scenes/meshes/`
- `docs/`
- `scripts/`

### Generated Content

- `HKU_scenes/cache/`
- `__pycache__/`
- `*.pyc`
- `.DS_Store`
- `._*`

Generated content should be rebuilt or cleaned, not shared as project source.

## Local vs Remote Roles

### Local Workspace

Use the local workspace for:

- code changes
- frontend iteration
- documentation
- synchronization scripts
- asset source snapshot

### Remote Workspace

Use the remote workspace for:

- GPU-backed runtime validation
- Sionna RT execution
- deployment testing
- render cache generation

## Current Remote Paths

- Host: `defaultuser@100.65.77.20`
- Root: `/home/defaultuser/HKU-RT/v3.0`
- Scene root: `/home/defaultuser/HKU-RT/v3.0/HKU_scenes`

## Recommended Team Workflow

1. Pull the latest source assets from remote if local `HKU_scenes/meshes/` is missing or stale.
2. Make code changes locally in `backend/`.
3. Run local cleanup before sharing or syncing.
4. Push code/docs/scripts to remote.
5. Push source assets to remote when `scenario_HKU.xml` or `meshes/` changes.
6. Validate on remote.
7. Rebuild caches only when scene or render-bundle logic changes.

## Runtime Notes

The current code expects:

- `HKU_scenes/scenario_HKU.xml`
- `HKU_scenes/meshes/`

The Python backend reads the scene root from:

- `HKU_RT_SCENE_ROOT`

If unset, it defaults to the local `HKU_scenes/` directory in this workspace.

## Remote Runtime Baseline

The current remote runtime has been validated against:

- Python virtual environment on the remote server
- Mitsuba / Dr.Jit / Sionna RT stack already installed there
- GPU execution on the remote server only

For team collaboration, treat the remote runtime environment as deployment infrastructure, and treat this workspace as the source tree.
