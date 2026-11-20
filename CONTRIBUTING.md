# Contributing to OpenAirTwin

Thank you for your interest in improving **OpenAirTwin**. This guide explains how to set up a development environment, follow architectural and UI ownership conventions, and run verification checks before opening a pull request.

## Development Prerequisites

- **Python 3.11+** (all backend and test suites target Python 3.11)
- **Node.js 22.13.0** and **npm 11.9.0** (required when editing `workbench/`, `website/`, or `tests/browser/`)
- **LLVM** on CPU-only hosts, or an **NVIDIA CUDA** driver for GPU ray tracing with Sionna RT 2.2.0

## Local Development Setup

```bash
# 1. Configure Python runtime and optional sample scene
python3 install.py --with-sample-scene

# 2. Install Frontend Workbench toolchain
npm --prefix workbench ci

# 3. Install Tutorial site and Playwright dependencies (as needed)
npm --prefix website ci
cd tests/browser && npm ci && npx playwright install chromium
```

For fast UI iteration against a running backend server:

```bash
# Terminal 1: Start Python API server
./.venv/bin/python tools/run_production_server.py

# Terminal 2: Rebuild Workbench on edits
npm --prefix workbench run build
```

## Architecture & Code Standards

Read [`docs/development.md`](docs/development.md) and [`docs/openairtwin-architecture.html`](docs/openairtwin-architecture.html) before introducing new Features or refactoring core modules:

1. **Feature Catalog Isolation**: Register new capabilities in `backend/static/js/features/feature_catalog.js` and `backend/features/catalog.py` rather than adding mode-specific branches to `app.js`, `viewer.js`, or `server.py`.
2. **UI Design System (Astryx)**: Compose desktop workbench UI with Meta's **Astryx** library (`@astryxdesign/core`, `@astryxdesign/theme-neutral`, `lucide-react`) and domain wrappers in [`workbench/src/ui/`](workbench/src/ui/ParamFields.tsx), following [`docs/adr/0003-adopt-astryx-design-system.md`](docs/adr/0003-adopt-astryx-design-system.md).
3. **Unidirectional State**: State flows strictly from domain stores into `WorkbenchStore` snapshots and React (`useSyncExternalStore`); interactions dispatch typed `UiCommand` objects through `CommandBus`.
4. **Imperative Engine Boundaries**: Keep Three.js, Leaflet, MapLibre GL, and SVG/Canvas charts outside React component trees and access them only through `ImperativeHostRegistry`.
5. **Backward-Compatible Contracts**: Preserve existing REST routes, JSON schemas, DOM IDs, and command names unless intentionally versioning a contract.

## Verification Checklist

Run the checks relevant to your changes before submitting a pull request:

```bash
# Workbench typecheck, ESLint, Stylelint, Prettier, unit tests, and verified production bundle
npm --prefix workbench test

# Python backend, contract, dependency, and UI ownership tests
./.venv/bin/python -m pytest -q tests/

# Browser end-to-end and Axe accessibility suite
cd tests/browser && npm run test:ci

# Tutorial site and interactive architecture copy check (if editing docs/website)
npm --prefix website test && npm --prefix website run build
```

## Pull Request Guidelines

- Keep commits and pull requests focused on a single bug fix, Feature enhancement, or documentation improvement.
- Update [`CHANGELOG.md`](CHANGELOG.md) under `## [Unreleased]` for user-visible changes.
- Confirm `workbench/` production assets are freshly rebuilt (`backend/static/workbench/`) whenever `workbench/src/` changes.
- Never commit untracked caches (`node_modules/`, `.venv/`, `generated/`, test traces, or temporary screenshots).
