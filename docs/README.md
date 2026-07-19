# OpenAirTwin Documentation

This directory contains the versioned documentation that accompanies the
runtime and tutorial website.

- [Interactive architecture map](https://hkuopensource.github.io/OpenAirTwin/architecture/)
  visualizes the current frontend, REST, backend service, job and renderer
  relationships. Its source is
  [`openairtwin-architecture.html`](openairtwin-architecture.html).
- [`development.md`](development.md) describes the modular Feature architecture,
  test suites and contribution workflow.
- [`release-checklist.md`](release-checklist.md) defines the local and GitHub
  checks required before publishing a tag.
- [`data-licenses.md`](data-licenses.md) records scene-data responsibilities and
  third-party attribution requirements.
- [`../CHANGELOG.md`](../CHANGELOG.md) records the v1.0.0 release and future
  unreleased changes.

The tutorial website build copies `openairtwin-architecture.html` to
`dist/architecture/index.html`. GitHub Pages therefore publishes it at the
stable `/OpenAirTwin/architecture/` URL without maintaining a duplicate file.
