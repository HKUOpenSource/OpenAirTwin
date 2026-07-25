# Changelog

All notable changes to OpenAirTwin are recorded here. This project follows
[Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

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

- Replaced the 20 legacy MP4/WebVTT tutorial pairs with nine manually reviewed
  4064x2144 PNG interface states and restored the original Features → Tutorial
  → Installation page flow.
- Updated the Radar Sensing feature preview with a dedicated drone-target image
  while keeping the approved Radar tutorial screenshot independent.

### Fixed

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

[Unreleased]: https://github.com/HKUOpenSource/OpenAirTwin/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/HKUOpenSource/OpenAirTwin/releases/tag/v1.0.0
