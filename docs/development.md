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

### Backend

Backend Features live under `backend/features/`. A Feature defines its service
factory, existing REST routes and required shared resources through a
`BackendFeatureDefinition`. Register it once in:

```text
backend/features/catalog.py
```

Core static files, scene endpoints and tile downloads are server capabilities,
not analysis Features. Link remains synchronous; Radiomap and Mobility use the
shared in-process job infrastructure; DeepMIMO retains its dedicated subprocess
and download lifecycle.

## Adding a Feature

Before implementation, define the REST contract, state ownership, settings
dependencies, picking targets and scene output. Then:

1. Create `backend/static/js/features/<feature-id>/` with state, transport,
   runtime/controller integration and renderer modules.
2. Render into existing shell anchors without adding CSS-affecting wrapper
   elements unless the UI change is intentional.
3. Register picking targets through the shared picking registry.
4. Render scene output through Feature-owned viewer layers and common
   primitives. Use a custom renderer only when the common primitives are
   insufficient.
5. Add a backend module under `backend/features/` and declare its service,
   routes and shared resources.
6. Use the common in-process job manager for ordinary queued work. Use a
   dedicated subprocess manager only when process isolation or downloadable
   artifacts require it.
7. Add the frontend and backend definitions to their catalogs.
8. Add protocol, lifecycle, isolation and visual regression tests.

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

The production build also copies the interactive architecture document to
`dist/architecture/index.html`, which becomes the GitHub Pages
`/OpenAirTwin/architecture/` route.

GitHub Actions runs the Python, tutorial and deterministic browser contract
suites for every pull request and every push to `master`. The macOS visual
snapshots remain a local review gate because raster output is platform-specific;
run the full browser suite before publishing a UI change.

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
- the architecture map reflects new registration and runtime connections;
- third-party data or model sources are recorded with their applicable terms.
