# Changelog

All notable changes to OpenAirTwin are recorded here. This project follows
[Semantic Versioning](https://semver.org/).

## [Unreleased]

### Fixed

- Restored persisted DeepMIMO jobs across server restarts, enforced TTL and
  storage limits for historical job directories, and hardened server shutdown
  so active DeepMIMO workers are terminated and reaped.

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
