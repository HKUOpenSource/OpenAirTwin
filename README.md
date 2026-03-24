# HKU Wireless Digital Twin Platform

This repository contains the current `v3.0` codebase for the HKU wireless digital twin platform.

## Repository Scope

- `backend/` contains the Python server, Sionna RT integration, scene parsing, job management, and static frontend.
- `docs/` contains collaboration and deployment notes.
- `scripts/` contains repeatable local/remote sync and cleanup scripts.
- `HKU_scenes/` is intentionally not included in this GitHub repository for now.

## Expected Project Layout

```text
HKU-RT_v3.0/
|-- backend/
|-- docs/
|-- HKU_scenes/
|   |-- meshes/
|   `-- scenario_HKU.xml
|-- scripts/
|-- .gitignore
`-- README.md
```

## Remote Deployment Layout

The current remote deployment root is:

```text
/home/defaultuser/HKU-RT/v3.0
```

It should mirror the same high-level structure as the local workspace, with generated artifacts rebuilt on demand.

## Collaboration Rules

- Treat `backend/` as the authoritative code content in this repository.
- Treat `HKU_scenes/`, `__pycache__/`, `.DS_Store`, `._*`, and `*.pyc` as non-versioned content for this repo snapshot.
- Make code changes locally first, then sync to remote when needed.

## Scripts

- `scripts/sync_assets_from_remote.sh`
- `scripts/sync_assets_to_remote.sh`
- `scripts/sync_code_to_remote.sh`
- `scripts/sync_code_from_remote.sh`
- `scripts/clean_generated_files.sh`
- `scripts/clean_remote_generated_files.sh`

Detailed workflow notes are in [docs/COLLABORATION.md](docs/COLLABORATION.md).
