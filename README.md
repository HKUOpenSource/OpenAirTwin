<div align="center">

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="backend/static/assets/openairtwin_logo_dark.png">
  <source media="(prefers-color-scheme: light)" srcset="backend/static/assets/openairtwin_logo.png">
  <img src="backend/static/assets/openairtwin_logo.png" alt="OpenAirTwin" width="540">
</picture>

<p><strong>Interactive Digital Twin Platform for Ray-Traced Wireless &amp; Radar Research</strong></p>

<p>
  <a href="LICENSE"><img alt="License: Apache-2.0" src="https://img.shields.io/badge/license-Apache--2.0-green"></a>
  <img alt="Python 3.11+" src="https://img.shields.io/badge/python-3.11%2B-blue">
  <img alt="Sionna RT 2.2.0" src="https://img.shields.io/badge/Sionna_RT-2.2.0-brightgreen">
  <a href="https://github.com/HKUOpenSource/OpenAirTwin/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/HKUOpenSource/OpenAirTwin/actions/workflows/ci.yml/badge.svg"></a>
</p>

<p>
  <a href="https://hkuopensource.github.io/OpenAirTwin/">Website</a> ·
  <a href="https://hkuopensource.github.io/OpenAirTwin/architecture/">Architecture</a> ·
  <a href="docs/development.md">Development</a> ·
  <a href="CONTRIBUTING.md">Contributing</a> ·
  <a href="LICENSE">License</a>
</p>

</div>

**OpenAirTwin** is an open-source digital twin workbench for interactive wireless communication and radar sensing research. Powered by **Sionna RT 2.2.0**, **Three.js WebGL**, and a **React** desktop interface, it streams 3D city scenes alongside GPU- or CPU-accelerated propagation, mobility, coverage, dataset export, and OFDM radar workflows.

<p align="center">
  <img src="backend/static/assets/openairtwin_showcase.png" alt="OpenAirTwin workbench interface" width="100%">
</p>

## Features

- **3D City Digital Twin** — Stream real-world 3D urban tiles on demand with buildings, terrain, infrastructure, and vegetation for site-specific ray tracing.
- **Link Analysis** — Compute 3D multipath propagation between configurable Tx/Rx antenna arrays, inspecting ray geometry, received power, CIR, and power delay profiles.
- **Mobility Simulation** — Evaluate time-varying multipath channels along 3D trajectories with synchronized step-by-step channel metrics and path playback.
- **Radio Map** — Generate terrain-following spatial coverage and path-gain heatmaps across dense urban geometry for blockage and deployment analysis.
- **DeepMIMO Dataset Export** — Export site-specific, ray-traced channel datasets over custom 3D regions of interest in standard DeepMIMO format for wireless AI/ML research.
- **OFDM Radar Sensing** — Simulate monostatic and bistatic urban radar with 3D moving UAV targets, physical RCS and clutter modeling, range-Doppler processing, and CA-CFAR detection.

## Quick Start

### macOS / Linux

```bash
git clone https://github.com/HKUOpenSource/OpenAirTwin.git
cd OpenAirTwin
python3 install.py --with-sample-scene
set -a; . ./.oat-env; set +a
./.venv/bin/python -m backend.server
```

### Windows PowerShell

```powershell
git clone https://github.com/HKUOpenSource/OpenAirTwin.git
Set-Location OpenAirTwin
py -3.11 install.py --with-sample-scene
. .\.oat-env.ps1
.\.venv\Scripts\python.exe -m backend.server
```

Open **`http://127.0.0.1:8090`** in a desktop browser with WebGL2 support (`>= 1280x720`). The local server binds to `127.0.0.1` by default without built-in authentication; place it behind an authenticated reverse proxy before exposing it beyond localhost.

<details>
<summary><strong>Requirements, CPU Setup, Installer Flags &amp; Troubleshooting</strong></summary>

- **Requirements:** Python `3.11+`, Chromium/Chrome with WebGL2 (`>= 1280x720`), and an NVIDIA GPU for CUDA acceleration or LLVM for CPU-only execution.
- **CPU-only setup:** Install LLVM first, then pass `--cpu`:
  - **macOS:** `brew install llvm && python3 install.py --cpu --with-sample-scene`
  - **Ubuntu / Debian:** `sudo apt update && sudo apt install -y llvm && python3 install.py --cpu --with-sample-scene`
  - **Windows:** Install from [LLVM releases](https://releases.llvm.org/download.html), then run `py -3.11 install.py --cpu --with-sample-scene` in a new PowerShell window.
- **Useful installer flags (`python3 install.py --help`):** `--with-sample-scene` / `--no-sample-scene`, `--cpu`, `--gpu <index-or-uuid>`, `--yes`, `--doctor`, `--recreate-venv`, `--dry-run`.
- **Troubleshooting:** Run `python3 install.py --doctor` if CUDA or LLVM initialization fails; select and load at least one tile (`11_SW_7A-D`) in **Map** if solver controls appear disabled; source `.oat-env` (or `.oat-env.ps1` on Windows) before launching the server.

</details>

## Architecture

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="backend/static/assets/openairtwin_architecture_dark.svg">
    <source media="(prefers-color-scheme: light)" srcset="backend/static/assets/openairtwin_architecture.svg">
    <img src="backend/static/assets/openairtwin_architecture.svg" alt="OpenAirTwin system architecture" width="100%">
  </picture>
</p>

Explore the full dependency graph, Feature boundaries, and module paths in the **[Interactive Architecture Map](https://hkuopensource.github.io/OpenAirTwin/architecture/)** ([`docs/openairtwin-architecture.html`](docs/openairtwin-architecture.html)).

### Project Layout

```text
.
├── backend/       # Python HTTP server, Sionna RT 2.2.0 solvers, job managers, scene pipeline & UI assets
├── workbench/     # React + TypeScript + Astryx workstation UI source
├── website/       # Astryx official landing page, interactive physics lab & embedded architecture docs
├── docs/          # Architecture map, development guide, data notices & UI contracts
├── tests/         # Python unit/integration suites and Playwright browser tests
├── tools/         # Scene build, local launch & packaging utilities
└── install.py     # Cross-platform environment installer and diagnostics
```

## Configuration

The sample scene bundles four Open3Dhk tiles (`11_SW_7A`, `11_SW_7B`, `11_SW_7C`, `11_SW_7D`). Override common runtime settings with environment variables before starting the server:

```bash
OAT_HOST=127.0.0.1 OAT_PORT=8090 OAT_SCENE_ROOT=/path/to/scene ./.venv/bin/python -m backend.server
```

All `OAT_*` options and validation bounds are documented in [`backend/config.py`](backend/config.py). Refer to [`docs/data-licenses.md`](docs/data-licenses.md) for third-party spatial data and 3D drone asset licensing terms.

## Development

Normal usage requires only Python because a prebuilt Workbench bundle is included. Contributors working on frontend UI or backend solvers can run:

```bash
npm --prefix workbench ci && npm --prefix workbench test
./.venv/bin/python -m pytest -q tests/
```

See [`CONTRIBUTING.md`](CONTRIBUTING.md) and [`docs/development.md`](docs/development.md) for contributor setup, UI conventions, and additional test suites.

## Citation

If OpenAirTwin supports your research, please cite:

> Wang, Z., Zhou, Z., &amp; Zhao, Z. (2026). OpenAirTwin (Version 1.1.0) [Computer software]. https://github.com/HKUOpenSource/OpenAirTwin/releases/tag/v1.1.0

```bibtex
@software{wang2026openairtwin,
  author  = {Wang, Zhaolin and Zhou, Zihao and Zhao, Zongyao},
  title   = {OpenAirTwin},
  version = {1.1.0},
  year    = {2026},
  url     = {https://github.com/HKUOpenSource/OpenAirTwin/releases/tag/v1.1.0},
  license = {Apache-2.0}
}
```

Machine-readable citation metadata is available in [`CITATION.cff`](CITATION.cff).

## License

OpenAirTwin source code is released under the **Apache License 2.0**. See [`LICENSE`](LICENSE) and [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md) for software notices, and [`docs/data-licenses.md`](docs/data-licenses.md) for scene data and 3D model terms.
