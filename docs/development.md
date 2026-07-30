# OpenAirTwin Development Guide

This guide describes the current modular-monolith architecture and the checks
expected when changing an existing Feature or adding a new one.

## Architecture at a Glance

OpenAirTwin uses a shared runtime with explicitly registered Features:

```text
UI shell
  -> frontend Feature catalog
  -> Feature state / transport / controller / result view / renderer
  -> existing REST contract
  -> backend Feature catalog and route registry
  -> Feature service
  -> Sionna RT runtime or job manager
  -> viewer layer / primitive output
```

Open [`openairtwin-architecture.html`](openairtwin-architecture.html) in a browser
for an interactive view of the current dependencies and direct connections.

The current production catalog order is:

1. Link
2. Mobility
3. Radiomap
4. DeepMIMO
5. Radar Sensing

## Main Extension Points

### Frontend

Frontend Features live under `backend/static/js/features/<feature-id>/`. Each
Feature owns its state, transport, runtime/controller integration and renderer.
Register production Features once in:

```text
backend/static/js/features/feature_catalog.js
```

Shared infrastructure belongs in `backend/static/js/core/` or
`backend/static/js/viewer/`. New Features should use viewer layers, primitives
and the Asset Manager instead of adding Feature-specific branches to `app.js` or
`viewer.js`.

Compatibility facades such as the existing `api.js` exports, global state
properties and legacy Viewer methods remain available for existing callers, but
new Feature code should prefer the registry and layer interfaces.

### Core workbench CSS

The desktop workbench loads native CSS modules directly from `index.html` in
this fixed order:

1. `tokens.css` declares the layer order and every `--oat-*` design token.
2. `base.css` owns reset, document defaults, the canvas and utilities.
3. `components.css` owns reusable controls, fields, badges, metric grids, list
   cards and scroll regions.
4. `shell.css` owns the control/results shell, device dock, performance panel,
   loading state and dialogs.
5. `entry-map.css` owns the map entry experience and first-party Leaflet
   overrides.
6. `results.css` owns result UI shared by Link, Mobility, Radio Map and
   DeepMIMO.
7. `radar.css` owns only Radar-specific target editing, waveform, CFAR,
   Range-Doppler and scene-label UI.

The global Cascade Layer order is `reset, tokens, base, components, layout,
features, utilities`. Every rule must belong to one of those layers. Do not
change the HTML load order to resolve a specificity problem.

All reusable design values use the `--oat-*` namespace. Color literals are
allowed only in `tokens.css`; other modules consume colors through `var()`.
Dynamic runtime properties such as `--analysis-dock-bottom-reserve`, Radar
label scale, legend colors and chart crosshair coordinates remain component
inputs rather than design tokens. Canvas UI chrome must use `readUiToken()`;
Feature data palettes remain in their JavaScript domain modules.

Prefer these public classes before adding a Feature-specific component:
`oat-panel`, `oat-button` and its modifiers, `oat-field`, `oat-input`,
`oat-check`, `oat-badge`, `oat-metric-grid`, `oat-list-card`, and
`oat-scroll-region`. Preserve DOM IDs and Feature semantic classes because they
are lifecycle and JavaScript hooks. Add a Feature rule only when the behavior is
domain-specific, then place it in `results.css`, `radar.css`, or a future
Feature module with a clearly documented owner.

The core workbench is desktop-only. Its supported contract starts at
`1280x720`; `1440x900` is the visual-regression reference. Do not add mobile
breakpoints to these files. The tutorial website has a separate responsive
stylesheet and test suite.

The frozen pre-framework UI evidence is documented in
[`ui-phase-0-baseline.md`](ui-phase-0-baseline.md). It includes DOM, computed
style, network and resource contracts plus full-workbench snapshots at both
supported reference sizes. Do not regenerate these artifacts during component
or framework work unless the contract change is explicit, reviewed and listed
in that phase's fidelity evidence.

Phase 1 UI work is contract-first. Before implementing or changing a reusable
component, read [`ui/component-contracts.md`](ui/component-contracts.md), map
every user action to a named command in
[`ui/interaction-contracts.md`](ui/interaction-contracts.md), and preserve the
browser-generated [`ui/dom-compatibility-contract.json`](ui/dom-compatibility-contract.json).
Command-style DOM and runtime inline styles are a closed allowlist documented in
[`ui/imperative-ui-exceptions.md`](ui/imperative-ui-exceptions.md). Framework
and component-library decisions are recorded under `docs/adr/`.

Phase 2 adds the machine-readable
[`ui/component-manifest.json`](ui/component-manifest.json), the icon rules in
[`ui/icon-contracts.md`](ui/icon-contracts.md), and the temporary Alias policy in
[`ui/legacy-aliases.md`](ui/legacy-aliases.md). New UI must use the public
`oat-*` classes and appear in the native component catalog before it is used by
a Feature. Start the development-only catalog separately; the production Python
server intentionally does not expose it:

```bash
.venv/bin/python tools/serve_ui_catalog.py
```

Then open `http://127.0.0.1:8091/ui-catalog/`. The Playwright configuration
starts this catalog automatically and verifies its public variants, states,
accessible names, and contract-only test Feature.

When the existing DOM intentionally changes, regenerate the Phase 1 contract
with the real browser and review the diff; never edit the generated JSON by
hand:

```bash
cd tests/browser
OAT_TEST_PYTHON=.venv/bin/python OAT_UPDATE_PHASE1_CONTRACT=1 \
  npx playwright test feature_modes.spec.js --grep "phase 1 DOM ownership"
```

### Backend

Backend Features live under `backend/features/`. A Feature defines its service
factory, existing REST routes and required shared resources through a
`BackendFeatureDefinition`. Register it once in:

```text
backend/features/catalog.py
```

Core static files, scene endpoints and tile downloads are server capabilities,
not analysis Features. Link remains synchronous. Mobility and Radiomap use the
shared in-process job infrastructure, Radar Sensing owns a bounded in-memory
`RadarJobManager`, and DeepMIMO retains its dedicated subprocess and download
lifecycle.

Radar Sensing exposes four asynchronous routes under `/api/radar/jobs` for
creation, status polling, result retrieval and cancellation. Its service runs
the independent Radar propagation solver followed by OFDM sensing processing.
The frontend owns Radar-specific target, path and detection Viewer Layers and
loads the four CC BY 4.0 drone assets through the shared Asset Manager. Radar
results remain in memory and have no download route or generated result files.

## Adding a Feature

Before implementation, define the REST contract, state ownership, settings
dependencies, picking targets and scene output. Then:

1. Create `backend/static/js/features/<feature-id>/` with state, transport,
   runtime/controller integration and renderer modules.
2. Define the Feature View Model and named Commands, then map its UI to the
   public component contract before writing markup.
3. Render into existing shell anchors without adding CSS-affecting wrapper
   elements unless the UI change is intentional.
4. Register picking targets through the shared picking registry.
5. Render scene output through Feature-owned viewer layers and common
   primitives. Use a custom renderer only when the common primitives are
   insufficient.
6. Add a backend module under `backend/features/` and declare its service,
   routes and shared resources.
7. Use the common in-process job manager for ordinary queued work. Use a
   dedicated subprocess manager only when process isolation or downloadable
   artifacts require it.
8. Add the frontend and backend definitions to their catalogs.
9. Add protocol, lifecycle, isolation and visual regression tests, then update
   the generated DOM/interaction contract.

Do not access a sibling Feature's DOM, state object or viewer layer directly.
Cross-Feature domain reuse should be exposed as an explicit capability, as
Mobility does with Link-domain payload and path rendering behavior.

## Compatibility Expectations

Unless a change deliberately introduces a versioned contract, preserve:

- REST URL, method, status code and JSON field names;
- synchronous versus asynchronous behavior;
- polling interval and job terminal states;
- current DOM IDs, control order, labels and operation sequence;
- Feature result invalidation rules;
- Three.js scene output and layer isolation;
- existing facade exports used by tests and external callers.

## Tests

### Python unit and contract suite

```bash
python3 -m unittest discover -s tests -p 'test_*.py'
```

The Python suite covers configuration, server hardening, route contracts, scene
generation, solver validation, runtime cleanup and job lifecycles.

### Real runtime smoke suite

The lightweight suite skips tests that require Sionna RT, Mitsuba, Dr.Jit and
DeepMIMO. Install the full pinned runtime and opt in to the CPU smoke suite:

```bash
python3 -m pip install --requirement requirements.txt
OAT_RUN_REAL_RUNTIME_TESTS=1 python3 -m unittest discover -s tests -p 'test_real_runtime.py' -v
```

These tests use Sionna's bundled floor mesh and temporary directories to run a
real link solve with channel taps, a two-cell radio map and a one-receiver
DeepMIMO export. They do not require the sample scene or an NVIDIA GPU, but the
Dr.Jit LLVM backend must be available.

### Browser and visual regression suite

```bash
cd tests/browser
npm ci
npx playwright install chromium
npm test
```

Use `npm run test:update` only after intentionally reviewing every changed
snapshot. Do not update snapshots merely to make a failing visual test pass.

### Tutorial site

```bash
cd website
npm ci
npm test
npm run build
```

The production tutorial uses nine manually reviewed 4064x2144 PNG interface
states in `website/public/media/tutorial/manual/`: four Map Selection states
and one state for each analysis Feature. Keep the dedicated Feature-card media
separate from these approved tutorial images, and do not reintroduce MP4 or
WebVTT walkthrough assets.

Run the interactive browser contracts after changing tutorial layout, steps,
hotspots, progress handling or media:

```bash
cd tests/browser
npm run test:tutorial-site
```

This suite starts the Vite site and verifies deep links, history, v2 progress
migration, compound hotspots, image failure fallback, keyboard behavior and
responsive layouts at 1440, 768 and 375 pixels.

The production build also copies the interactive architecture document to
`dist/architecture/index.html`, which becomes the GitHub Pages
`/OpenAirTwin/architecture/` route.

GitHub Actions runs the lightweight Python suite, the full CPU runtime smoke
suite, tutorial checks and deterministic browser contracts for every pull
request and every push to `master`. The macOS visual snapshots remain a local
review gate because raster output is platform-specific; run the full browser
suite before publishing a UI change.

## Configuration Changes

All runtime environment settings are defined in `backend/config.py`. When adding
or changing an `OAT_*` value:

1. choose a safe local default;
2. validate bounds at the request boundary when user-controlled;
3. add or update configuration tests;
4. update the common-options table in the root README when users are likely to
   set it directly;
5. document security or resource-consumption consequences.

The server is unauthenticated and defaults to loopback. Treat changes that bind
to broader interfaces, increase request sizes, or relax queue limits as security
and resource-management changes.

## Documentation Checks

Before merging a user-visible change, verify that:

- the root README still provides a working first-run path;
- the tutorial matches current labels and control order;
- the nine approved tutorial screenshots remain 4064x2144 and no legacy
  MP4/VTT walkthrough files are present;
- the architecture map reflects new registration and runtime connections;
- third-party data or model sources are recorded with their applicable terms.
