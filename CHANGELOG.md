# Changelog

All notable changes to OpenAirTwin are recorded here. This project follows
[Semantic Versioning](https://semver.org/).

## [Unreleased]

## [1.2.0] - 2026-11-22

### Added

- Upgraded the official website (`website/`) to an Astryx `centered-hero` landing page featuring a Three.js WebGL interactive 3D Lab (`Link`, `Mobility`, `Radio Map`, `DeepMIMO`, `Radar`), capability matrix, architecture map link, and cross-platform Quick Start guide, replacing ~70 MB of static screenshots, GIFs, and videos.
- Stratified the 3D Lab `Radar` mode airspace with collision-free 3D UAV orbits dispersed across X–Y, azimuth, and altitude tiers, synchronized Tx detection sector coverage, exact 3D line-of-sight occlusion filtering, and a unified `Range–Doppler · CA-CFAR` overlay aligned 1:1 with heatmap peaks.

### Changed

- Upgraded the ray-tracing runtime stack in `requirements.txt` to **Sionna RT `2.2.0`** (`mitsuba==3.9.1`, `drjit==1.5.0`) and switched Radar target propagation to Sionna's native `RCSSolver`. Re-running `install.py` is recommended when upgrading an existing environment.
- Replaced the custom workbench UI system with Meta's Astryx React component library (`@astryxdesign/core` and `@astryxdesign/theme-neutral`, high-density light theme) and reorganized the workstation layout into a Top Workspace Bar, collapsible Left Inspector, floating DeviceBar, and collapsible Right Analysis Drawer (`ADR-0003`).
- Refined workstation ergonomics and UI density: renamed `Tiles` to `Map`, simplified bottom DeviceBar controls to uniform `Tx` / `Rx` labels, shortened single-line loading overlays, fixed FPS popover width, enabled numeric steppers, and added gradient colorbar swatches across all six Radio Map colormaps.
- Adopted unidirectional data flow (`Domain State -> WorkbenchStore -> React/Astryx -> CommandBus`) and `ImperativeHostRegistry`, removing legacy CSS chains, `dom_refs.js`, `param_tooltips.js`, and the retired development UI catalog.
- Replaced CARTO raster tiles on the entry map with custom-styled OpenFreeMap Positron vector tiles (no API key required; Leaflet tile selection and local fallback map retained).
- Overhauled [`README.md`](README.md), added [`CONTRIBUTING.md`](CONTRIBUTING.md), updated [`docs/openairtwin-architecture.html`](docs/openairtwin-architecture.html), [`docs/development.md`](docs/development.md), and [`docs/ui/component-contracts.md`](docs/ui/component-contracts.md) for the Astryx workbench architecture, and added scoped CI execution (`tools/ci_scope.py`).

### Fixed

- Fixed `.github/workflows/deploy-pages.yml` step ordering so `npm run build` runs before `npm run test:tutorial-site`, ensuring `vite preview` serves a built `website/dist/` bundle on GitHub Pages deployments.
- Transpiled `website/src/physics/urbanModel.ts` in-memory via TypeScript inside `website/scripts/validate-tutorial.mjs` for Node.js 22 compatibility.
- Fixed Range–Doppler spectral peak vs. CA-CFAR marker misalignment by eliminating SVG aspect-ratio letterboxing, unifying coordinate transforms, and computing clutter suppression inside `computeRadarScene`.

## [1.1.0] - 2026-08-01

### Added

- Added a production React and TypeScript Workbench with explicit component,
  DOM compatibility, state ownership and styling contracts.
- Added deterministic Workbench identity and integrity manifests, immutable
  hashed assets, startup failure recovery and a complete application archive
  containing all tracked project source plus a prebuilt Workbench, so installation
  and normal operation do not require Node.js.
- Added English-only repository and package gates, deterministic size budgets,
  dependency and license auditing, third-party notices, CycloneDX SBOM output,
  clean-install smoke tests, accessibility checks and lifecycle soak coverage.
- Added a complete Radar Sensing workflow with monostatic and bistatic Tx/Rx,
  a four-model 3D drone target picker, editable target motion and orientation,
  OFDM waveform controls, CA-CFAR detection and a dedicated propagation solver.
- Added bounded asynchronous Radar jobs with progress, cancellation, stale-scene
  protection and in-memory results, exposed through `/api/radar/jobs`.
- Added Radar-specific Range–Doppler, range-profile, detection, target-truth and
  classified-path views with isolated Viewer Layers and no data-export route.
- Added a CPU-only CI smoke gate that loads a real Sionna RT scene and exercises
  Link, Radio Map and DeepMIMO export workflows with the pinned runtime stack.
- Added a responsive interactive screenshot tutorial covering six modes and 24
  steps, with stable deep links, saved progress, accessible hotspots and
  deterministic browser contracts.

### Changed

- Migrated the application shell, Entry Map, controls, forms, device workflows
  and repeated result views to standardized React components while preserving
  desktop geometry, DOM IDs, REST APIs and Feature lifecycle behavior.
- Hardened JSON requests with explicit timeout, cancellation, offline and server
  error states while preventing stale generations from replacing current data.
- Standardized release-facing text, documentation, metadata and CI output in
  English and fixed the release toolchain at Node.js 22.13.0, npm 11.9.0 and
  Python 3.11.
- Replaced the 20 legacy MP4/WebVTT tutorial pairs with nine manually reviewed
  4064x2144 PNG interface states and restored the original Features → Tutorial
  → Installation page flow.
- Updated the Radar Sensing feature preview with a dedicated drone-target image
  while keeping the approved Radar tutorial screenshot independent.

### Fixed

- Prevented a selected Link path detail card from leaking into another
  Feature's result dock.
- Restored the complete active Feature controls after returning to the Entry
  Map, changing the tile selection and loading the scene again.
- Restored persisted DeepMIMO jobs across server restarts, enforced TTL and
  storage limits for historical job directories, and hardened server shutdown
  so active DeepMIMO workers are terminated and reaped.
- Prevented Radar state from disabling the shared Tx Orbit control while Link,
  Mobility, Radio Map or DeepMIMO is the active Feature.

## [1.0.0] - 2026-07-19

### Added

- Explicit frontend and backend Feature registries for Link, Mobility,
  Radiomap and DeepMIMO.
- Feature-owned state, transport, lifecycle and renderer modules, with shared
  viewer layers, primitives and model asset management.
- Shared in-process job infrastructure for Mobility and Radiomap while
  preserving the existing REST contracts and asynchronous behavior.
- Python contract tests, Playwright behavior and visual baselines, and GitHub
  Actions checks for backend, browser and tutorial changes.
- Interactive architecture documentation, development guidance and data-license
  notices.
- Cross-platform installation guidance and Windows environment support.

### Changed

- Simplified the core application and server entry points so production
  Features are registered through catalogs instead of mode-specific branches.
- Improved the tutorial's navigation, accessibility, installation instructions,
  media delivery and public project links.
- GitHub Pages now validates the tutorial and publishes the architecture map at
  `/OpenAirTwin/architecture/`.

### Compatibility

- Existing REST URLs, response fields, polling behavior and synchronous versus
  asynchronous execution are preserved.
- Existing UI labels, DOM IDs, control order and Feature operation flows remain
  compatible.
- Existing global state, API exports and Viewer methods remain available as
  compatibility facades.

[Unreleased]: https://github.com/HKUOpenSource/OpenAirTwin/compare/v1.2.0...HEAD
[1.2.0]: https://github.com/HKUOpenSource/OpenAirTwin/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/HKUOpenSource/OpenAirTwin/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/HKUOpenSource/OpenAirTwin/releases/tag/v1.0.0
