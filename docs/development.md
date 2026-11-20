# OpenAirTwin Development Guide

This guide describes OpenAirTwin's modular-monolith architecture, extension points, Astryx UI ownership boundaries, and the verification suites expected when changing code or adding a new Feature.

> New contributors should also review [`../CONTRIBUTING.md`](../CONTRIBUTING.md) for local toolchain setup and pull request guidelines.

## Architecture at a Glance

OpenAirTwin connects a declarative React 19 + Astryx workstation UI to modular domain runtimes and Sionna RT 2.2.0 solvers through strict unidirectional data flow:

```text
React App Shell (@astryxdesign/core + WorkbenchStore)
  -> typed UiCommand (CommandBus)
  -> frontend Feature catalog & domain runtime
  -> Feature state / transport / controller adapters / renderer
  -> REST API (sync or async job endpoints)
  -> backend Feature catalog & route registry
  -> Feature service
  -> Sionna RT runtime or job manager
  -> Three.js Viewer layer / SVG & Canvas charts
```

Open [`openairtwin-architecture.html`](openairtwin-architecture.html) in a browser (or view the hosted [Architecture Map](https://hkuopensource.github.io/OpenAirTwin/architecture/)) for an interactive module dependency graph.

The current production catalog order is:

1. Link (`link`)
2. Mobility (`mobility`)
3. Radio Map (`radiomap`)
4. DeepMIMO (`deepmimo`)
5. Radar Sensing (`radar`)

## Main Extension Points

### Frontend Domain & Entry Map

Frontend Features live under `backend/static/js/features/<feature-id>/`. Each Feature owns its state, REST transport, controller/runtime integration, and Three.js renderer. Register production Features once in:

```text
backend/static/js/features/feature_catalog.js
```

Shared infrastructure belongs in `backend/static/js/core/` or `backend/static/js/viewer/`. New Features should use Viewer Layers, common primitives, and the shared Asset Manager instead of adding Feature-specific branches to `app.js` or `viewer.js`. Compatibility facades (`api.js` exports, global `state` properties, and Viewer helper methods) remain intact for existing callers.

The Entry Map uses **OpenFreeMap Positron** through the lazy-loaded MapLibre GL Leaflet adapter in `workbench/src/runtime/entry-basemap.ts`. Vite resolves Leaflet imports to `window.L`; Leaflet retains tile-grid selection ownership while MapLibre owns only its tile-pane WebGL canvas. `entry-basemap.style.ts` transforms the map style into OpenAirTwin's muted light palette while preserving OpenMapTiles and OpenStreetMap attribution. Missing WebGL2, style errors, or a 15-second load timeout fall back gracefully to the local overview image. Separate Vite bundle budgets enforce that the basemap runtime stays outside the initial entry graph (`<= 300 KiB` renderer, `<= 160 KiB` worker, `<= 12 KiB` CSS gzip).

### Core Workbench UI & CSS (`workbench/`)

The desktop workbench uses Meta's **Astryx** design system (`@astryxdesign/core` with `@astryxdesign/theme-neutral` and `lucide-react` icons in light mode), bundled with React 19, TypeScript, and Vite from `workbench/src/styles/workbench.css` (see [`adr/0003-adopt-astryx-design-system.md`](adr/0003-adopt-astryx-design-system.md)).

The global CSS Cascade Layer stack declared in `workbench/src/styles/workbench.css` is:

```text
reset, astryx-base, astryx-theme, oat-theme, oat-layout, oat-charts
```

- `reset`, `astryx-base`, and `astryx-theme` import `@astryxdesign/core/reset.css`, `@astryxdesign/core/astryx.css`, and `@astryxdesign/theme-neutral/theme.css`.
- `oat-theme` sets high-density light workstation variables and offline system font stacks.
- `oat-layout` defines the workstation shell geometry (`44 px` Top Workspace Bar with `Map` launcher, 5-mode switcher, Datasets popover, and fixed-width FPS popover; collapsible `356 px` Left Inspector with stepped inputs and concise hover tooltips; full-bleed center 3D viewport with compact `Tx`/`Rx`/`Orbit Tx` DeviceBar; collapsible `392 px` Right Analysis Drawer; and Entry Map screen).
- `oat-charts` styles SVG/Canvas chart framing, fixed-width gradient colormap swatches, Leaflet overrides, and Radar 3D projected target labels.

Dynamic runtime custom properties (Radar label scale, legend colors, chart crosshair positions) remain runtime inputs on closed exception containers. The desktop workbench contract targets `1280x720` and larger (`1440x900` primary reference); do not add mobile breakpoints here (the separate tutorial site in `website/` manages responsive layouts).

UI development is contract-first. Review these specifications before changing workbench markup or styles:

- [`ui/component-contracts.md`](ui/component-contracts.md) & [`ui/component-manifest.json`](ui/component-manifest.json)
- [`ui/interaction-contracts.md`](ui/interaction-contracts.md)
- [`ui/dom-compatibility-contract.json`](ui/dom-compatibility-contract.json)
- [`ui/imperative-ui-exceptions.md`](ui/imperative-ui-exceptions.md) & [`ui/icon-contracts.md`](ui/icon-contracts.md)

Production mounts one React root (`app-shell`) wrapped in `<Theme theme={neutralTheme} mode="light">` via `ReactRootRegistry`, owning all shell panels, controls, DeviceBar, Right Analysis Drawer, LoadingOverlay, and Alert/Modal Dialogs. Run the Workbench toolchain with:

```bash
cd workbench
npm ci
npm test   # typecheck (tsc), eslint, stylelint, prettier, vitest unit tests & verified production build
```

React UI components obey these ownership rules:

1. Compose controls from `@astryxdesign/core` and thin domain wrappers in `workbench/src/ui/` (`ParamFields.tsx`, `WorkbenchChrome.tsx`).
2. Receive immutable snapshots as Props and dispatch typed `UiCommand` actions through `CommandBus`; never issue raw `fetch` requests or import mutable feature globals directly inside TSX.
3. Bridge domain state into React strictly through `ObservableStateAdapter` + `useSyncExternalStore`.
4. Mount production UI once as `app-shell`; clean up all listeners and timers on dispose and let unmount/dialog dismiss restore focus.
5. Keep imperative engines (Three.js 3D viewer, Leaflet + MapLibre GL entry map, SVG/Canvas plots, Radar GLB asset preview) outside React via `ImperativeHostRegistry`.
6. Maintain one React renderer per production subtree without parallel DOM factories, templates, `dom_refs.js`, or hidden scraping bridges.

### Backend (`backend/`)

Backend Features live under `backend/features/`. Each Feature declares its service factory, REST routes, and required resources through `BackendFeatureDefinition` and registers once in:

```text
backend/features/catalog.py
```

Core static serving, scene selection/manifest endpoints, and Open3Dhk tile downloads remain server core capabilities rather than analysis Features:

- **Link** (`POST /api/link/solve`): synchronous Sionna RT `PathSolver` execution.
- **Mobility** & **Radiomap**: shared `InProcessJobManager` queue (`/api/mobility/jobs`, `/api/radiomap/jobs`) tracking queued/running/succeeded/failed states with TTL eviction.
- **Radar Sensing**: bounded in-memory `RadarJobManager` (`/api/radar/jobs`) combining Sionna RT 2.2.0 `RCSSolver` (target echoes, up to 4,096 samples and 512 buffered legs per scattering point) and `PathSolver` (clutter/direct paths) with OFDM + CA-CFAR post-processing, isolated 3D Viewer Layers, and 4 CC BY 4.0 drone models. Results stay in memory with no export route.
- **DeepMIMO**: dedicated worker subprocess (`/api/deepmimo/jobs`) supporting cancellation, persistent job metadata across restarts, and ZIP download leases.

## Adding a Feature

1. Define the REST contract, immutable snapshot shape, `UiCommand` actions, solver/antenna dependencies, picking targets, and Viewer layer contract.
2. Create `backend/static/js/features/<feature-id>/` with isolated `index.js`, `state.js`, `transport.js`, `runtime.js`, `renderer.js`, and UI view adapters.
3. Build TSX controls (`workbench/src/features/controls/`) and result views (`RightAnalysisDrawer.tsx`) over `ParamFields.tsx` and `WorkbenchChrome.tsx`, registering picking targets cleanly in `PickingRegistry`.
4. Implement the backend module under `backend/features/` + `backend/rt/` (reusing `InProcessJobManager` unless dedicated subprocess isolation or downloadable archives require otherwise), then register both frontend and backend definitions in their catalogs.
5. Add unit, contract, lifecycle, accessibility (`axe-core`), and end-to-end Playwright tests covering the new Feature.

## Compatibility Expectations

Unless deliberately versioning a public contract, preserve:

- REST endpoint paths, HTTP methods, status codes, polling semantics, and JSON field names;
- synchronous vs. asynchronous execution guarantees;
- Feature result invalidation behavior across device moves and scene selection changes;
- Three.js Viewer layer isolation and resource cleanup invariants;
- public compatibility exports expected by regression tests and external callers.

## Continuous Integration & Testing

Pull requests run Workbench quality checks, unit tests, verified production build checks, the Python suite, and core browser behavior tests. `tools/ci_scope.py` selects optional jobs based on changed files:

- Website or docs changes build and verify `website/`.
- Backend or requirement changes trigger real Sionna RT CPU smoke tests.
- Dependency/license changes trigger `pip-audit`, `npm audit`, and SPDX license audits.
- Installer, packaging, or build tool changes run reproducible archive smoke checks and browser soak tests.
- Pushes to `master` and manual/scheduled workflows run the full matrix.

### Commands

```bash
# Python unit, contract, hardening & architecture tests (pytest or unittest)
./.venv/bin/python -m pytest -q tests/
./.venv/bin/python -m unittest discover -s tests -p 'test_*.py'

# Real Sionna RT CPU smoke suite (requires full runtime dependencies + LLVM)
OAT_RUN_REAL_RUNTIME_TESTS=1 ./.venv/bin/python -m unittest discover -s tests -p 'test_real_runtime.py' -v

# Workbench lint, typecheck, unit tests & production build
npm --prefix workbench test

# Playwright browser suite (with optional OAT_RUN_SOAK_TESTS=true)
cd tests/browser && npm ci && npx playwright install chromium && npm run test:ci

# Tutorial website & architecture copy check
npm --prefix website ci && npm --prefix website test && npm --prefix website run build
```

Visual snapshot baselines in `tests/browser/` remain a local macOS (`1440x900` / `1280x720`) review gate; use `npm run test:update` only after manually inspecting changed images. Resource soak tests track active timers, frame callbacks, canvases, DOM nodes, and Radar projected labels across consecutive mode cycles.

## Configuration & Documentation Checks

Runtime `OAT_*` options are defined and bounds-checked in `backend/config.py`. Treat changes binding beyond loopback (`127.0.0.1`), enlarging request limits, or raising job queue limits as security changes.

Before merging user-visible changes, verify:

- root [`../README.md`](../README.md) accurately reflects installation, configuration, repository layout, and citation details;
- [`openairtwin-architecture.html`](openairtwin-architecture.html) stays synchronized with active files, module connections, and REST flows;
- [`website/`](../website/src/data/siteData.ts) presents OpenAirTwin's centered-hero showcase, 3D interactive physics lab (`Link`, `Mobility`, `Radio Map`, `DeepMIMO`, `Radar`), and 3x2 capability matrix without static UI screenshot or GIF assets;
- third-party datasets and models remain properly attributed in [`data-licenses.md`](data-licenses.md).
