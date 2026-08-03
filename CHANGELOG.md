# Changelog

All notable changes to OpenAirTwin are recorded here. This project follows
[Semantic Versioning](https://semver.org/).

## [Unreleased]

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

[Unreleased]: https://github.com/HKUOpenSource/OpenAirTwin/compare/v1.1.0...HEAD
[1.1.0]: https://github.com/HKUOpenSource/OpenAirTwin/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/HKUOpenSource/OpenAirTwin/releases/tag/v1.0.0
