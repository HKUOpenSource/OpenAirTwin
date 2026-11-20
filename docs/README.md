# OpenAirTwin Documentation

This directory contains versioned architecture, design-decision, licensing, and UI contract documentation accompanying the OpenAirTwin runtime and tutorial website.

- [Interactive Architecture Map](https://hkuopensource.github.io/OpenAirTwin/architecture/): explores frontend, REST transport, backend service, job manager, and 3D viewer relationships (source: [`openairtwin-architecture.html`](openairtwin-architecture.html)).
- [Development Guide](development.md): modular-monolith Feature catalog architecture, extension workflow, CI scope, and test suites.
- [UI Component & Interaction Contracts](ui/component-contracts.md): component ownership rules, Astryx design-system boundaries, and typed command contracts (alongside [`ui/interaction-contracts.md`](ui/interaction-contracts.md) and [`ui/icon-contracts.md`](ui/icon-contracts.md)).
- [Architecture Decision Records (ADRs)](adr/0003-adopt-astryx-design-system.md): key technology choices including React + Vite workbench packaging (`0001`) and Astryx adoption (`0003`).
- [Release Checklist](release-checklist.md): local and CI gates required before tagging a release.
- [Scene Data and Third-Party Terms](data-licenses.md): Open3Dhk/CSDI spatial data responsibilities, OpenFreeMap basemap attribution, and CC BY 4.0 drone-model licensing.
- [Contributor Guide](../CONTRIBUTING.md) & [Changelog](../CHANGELOG.md): setup instructions, style conventions, and versioned release notes.

The tutorial website build validates and copies `openairtwin-architecture.html` to `website/dist/architecture/index.html`, publishing it on GitHub Pages at `/OpenAirTwin/architecture/`.
