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

The sync scripts keep their historical default remote root:

```text
/home/defaultuser/HKU-RT/v3.0
```

Treat this as the shared/legacy root and shared scene-asset location, not as the
active code worktree for every developer. Active validation work happens in
developer-specific remote worktrees, for example:

```text
/home/defaultuser/worktree-zhaolin
/home/defaultuser/worktree-zihao
```

Code syncs to a developer worktree must pass `HKU_RT_REMOTE_ROOT` explicitly.
Do not rely on the script default unless the task explicitly targets the
shared/legacy root.

## Collaboration Rules

- Treat `backend/` as the authoritative code content in this repository.
- Treat `HKU_scenes/`, `__pycache__/`, `.DS_Store`, `._*`, and `*.pyc` as non-versioned content for this repo snapshot.
- Make code changes locally first, then sync to remote when needed.
- Before any remote sync or restart, identify the developer/worktree, read the
  matching developer notes in `docs/`, and use that worktree and port. If the
  developer is unknown, ask before running remote commands.

## Scripts

- `scripts/sync_assets_from_remote.sh`
- `scripts/sync_assets_to_remote.sh`
- `scripts/sync_code_to_remote.sh`
- `scripts/sync_code_from_remote.sh`
- `scripts/clean_generated_files.sh`
- `scripts/clean_remote_generated_files.sh`

Detailed workflow notes are in [docs/COLLABORATION.md](docs/COLLABORATION.md).
