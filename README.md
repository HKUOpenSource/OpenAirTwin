<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="backend/static/assets/openairtwin_logo_dark.png">
    <source media="(prefers-color-scheme: light)" srcset="backend/static/assets/openairtwin_logo.png">
    <img src="backend/static/assets/openairtwin_logo.png" alt="OpenAirTwin" width="620">
  </picture>
</p>


<p align="center">
  <a href="LICENSE"><img alt="License: Apache-2.0" src="https://img.shields.io/badge/license-Apache--2.0-green"></a>
  <img alt="Python 3.11+" src="https://img.shields.io/badge/python-3.11%2B-blue">
  <img alt="Sionna RT" src="https://img.shields.io/badge/Sionna-RT-brightgreen">
  <img alt="Open3Dhk" src="https://img.shields.io/badge/Open3D-HK-red">
  <img alt="WebGL" src="https://img.shields.io/badge/frontend-WebGL-4b8bbe">
  <img alt="DeepMIMO export" src="https://img.shields.io/badge/export-DeepMIMO-6f42c1">
</p>

<p align="center">
  <a href="#features">Features</a> &bull;
  <a href="#installation">Installation</a> &bull;
  <a href="#start-openairtwin">Start OpenAirTwin</a> &bull;
  <a href="https://zhaolin820.github.io/HKU-Ray-Tracing-Platform/">Tutorial Website</a> &bull;
  <a href="#troubleshooting">Troubleshooting</a> &bull;
  <a href="#scene-data">Scene Data</a> &bull;
  <a href="#configuration">Configuration</a> &bull;
  <a href="#license">License</a>
</p>


OpenAirTwin is an open-source digital twin platform for wireless studies. It
runs as a local web app: a Python backend does the scene and ray-tracing work,
and a browser frontend provides the map and 3D controls.

Use it to load city tiles, place transmitters and receivers, run Sionna RT
workflows, generate radio maps, simulate mobility, and export DeepMIMO-style
datasets.


## Features

<table>
  <tr>
    <td width="20%" align="center" valign="top">
      <img src="backend/static/assets/feature-map-selection.png" alt="OpenAirTwin map selection and tile download" width="100%">
      <br>
      <strong>Map Selection and Scene Download</strong>
      <br>
      Select an area on the map, then load or download only the matching city
      tiles.
    </td>
    <td width="20%" align="center" valign="top">
      <img src="backend/static/assets/feature-link-analysis.png" alt="OpenAirTwin link analysis" width="100%">
      <br>
      <strong>Link Analysis</strong>
      <br>
      Place Tx and Rx points, run link analysis, and inspect paths, power, and
      channel taps.
    </td>
    <td width="20%" align="center" valign="top">
      <img src="backend/static/assets/feature-mobility-analysis.gif" alt="OpenAirTwin mobility analysis" width="100%">
      <br>
      <strong>Mobility Analysis</strong>
      <br>
      Move receivers along a trajectory and evaluate how channel behavior
      changes over time.
    </td>
    <td width="20%" align="center" valign="top">
      <img src="backend/static/assets/feature-radio-map.png" alt="OpenAirTwin radio map" width="100%">
      <br>
      <strong>Radio Map</strong>
      <br>
      Generate coverage maps and visualize signal strength on the 3D city
      model.
    </td>
    <td width="20%" align="center" valign="top">
      <img src="backend/static/assets/feature-deepmimo-export.png" alt="OpenAirTwin DeepMIMO data export" width="100%">
      <br>
      <strong>DeepMIMO Data Export</strong>
      <br>
      Select a region of interest and export DeepMIMO-compatible wireless ML
      datasets.
    </td>
  </tr>
</table>

More functions are coming:
- Integrated Sensing and Communication
- Beamforming
- 3D Radio Map
- ...

## Installation

### Before You Install

- Python 3.11 or newer.
- A modern browser with WebGL support.
- A GPU-capable environment is recommended for practical Sionna RT workloads.
- CPU-only machines need LLVM for the Dr.Jit backend.

Sionna RT, Mitsuba, Dr.Jit, CUDA, and GPU driver compatibility are environment
specific. The installer handles the Python environment and reports system-level
issues that still need action.

If this is your first time using OpenAirTwin, it is recommended to download the sample scene during installation. Without scene data, the app can open, but ray-tracing workflows need tiles to run.

### Recommended Install

From the repository root, run:

```bash
python install.py
```

In an interactive terminal, the installer will:

- create or reuse `.venv/`;
- install the packages from `requirements.txt`;
- detect NVIDIA GPUs;
- ask you to choose a GPU when multiple GPUs are available;
- ask whether to download the sample scene;
- write local runtime settings to `.oat-env`;
- run environment diagnostics and print the launch command.


### CPU-only Install

If the machine does not have an NVIDIA GPU, or you want to run without CUDA,
install LLVM first and then force CPU mode.

On macOS:

```bash
brew install llvm
python install.py --cpu
```

On Ubuntu or Debian:

```bash
sudo apt update
sudo apt install llvm
python install.py --cpu
```

On Windows, install LLVM from the official [LLVM download page](https://releases.llvm.org/download.html), reopen PowerShell, then run:

```powershell
python install.py --cpu
```

### Non-interactive and Advanced Flags

- `python install.py --with-sample-scene`: download the bundled first-run
  sample scene.
- `python install.py --no-sample-scene`: skip the sample-scene prompt.
- `python install.py --gpu <index-or-uuid>`: pin a specific GPU on multi-GPU
  machines.
- `python install.py --cpu`: force CPU mode by setting `CUDA_VISIBLE_DEVICES`
  to an empty value.
- `python install.py --yes`: use non-interactive defaults. This skips the
  sample scene unless combined with `--with-sample-scene`.

## Start OpenAirTwin

Use the command printed by the installer, or run the matching command below.

On macOS or Linux:

```bash
set -a; . ./.oat-env; set +a
./.venv/bin/python -m backend.server
```

On Windows PowerShell:

```powershell
.\.venv\Scripts\python.exe -m backend.server
```

Open the frontend:

```text
http://127.0.0.1:8090
```

## Troubleshooting

Run diagnostics without reinstalling packages:

```bash
python install.py --doctor
```

Rebuild the virtual environment from scratch:

```bash
python install.py --recreate-venv
```

Inspect the planned installer actions without creating files:

```bash
python install.py --dry-run
```

- Missing `nvidia-smi` is not always a failure. CPU mode can run when the
  Dr.Jit LLVM backend passes the doctor check.
- If the LLVM backend check fails, install LLVM and rerun the doctor.
- CUDA warnings usually point to NVIDIA driver, CUDA, `CUDA_VISIBLE_DEVICES`,
  or Mitsuba CUDA variant compatibility.
- On Windows, the doctor also checks Dr.Jit/CUDA cache directories that can
  surface as OptiX or cache write errors.

## Scene Data

OpenAirTwin needs scene data before link analysis, radio maps, mobility
simulation, or DeepMIMO export can produce useful results.

For first-run testing, the installer can download a sample scene with four
Open3Dhk tiles: `11_SW_7A`, `11_SW_7B`, `11_SW_7C`, and `11_SW_7D`. In an
interactive terminal, `python install.py` asks whether to download it. To force
the download, run:

```bash
python install.py --with-sample-scene
```

The sample archive is installed under `scene/` and contains runtime source data
only: `common/`, `tiles/`, and `meshes/`. Render caches are rebuilt locally when
needed. See the release archive's `THIRD_PARTY_DATA.md` for the bundled data
attribution.

OpenAirTwin expects runtime scene assets under `scene/` by default:

```text
scene/
|-- common/
|   `-- scene_common.xml
|-- tiles/
|   `-- <tile_id>.xml
|-- meshes/
|   `-- <tile_id>/<category>/*.ply
`-- cache/
```

The per-tile layout is the runtime source of truth. Point the application at a
different scene root with:

```bash
OAT_SCENE_ROOT=/path/to/scene python -m backend.server
```

Build or refresh frontend render bundles with:

```bash
python -m backend.tools.build_tile_bundles --help
```

### Open3Dhk Data Use Notice

OpenAirTwin can use scene data obtained from or derived from Open3Dhk, the
Common Spatial Data Infrastructure (CSDI), and the Hong Kong Lands Department.
That data is third-party government spatial data and is not licensed under this
repository's Apache-2.0 software license.

When browsing, downloading, using, reproducing, redistributing, or publishing
copies or derivatives of Open3Dhk/CSDI data, users are responsible for complying
with the applicable official terms. In particular, users should clearly identify
the Government, CSDI, Lands Department, and/or Open3Dhk as the data source where
applicable, and acknowledge the relevant intellectual property ownership.

OpenAirTwin provides tooling for working with this data, but does not provide
any warranty regarding the data's accuracy, completeness, availability,
timeliness, or suitability for any particular purpose. See the
[CSDI 3D Visualisation Map API Terms](https://portal.csdi.gov.hk/csdi-webpage/apidoc/3d-visualisation-map-api)
and the Lands Department's
[Open Data (Geospatial)](https://www.landsd.gov.hk/en/spatial-data/open-data.html)
page for the official data terms and download guidance.

## Configuration

Runtime behavior is configured with `OAT_*` environment variables. Common
options:

- `OAT_HOST` and `OAT_PORT`: backend bind address. By default,
  OpenAirTwin listens on `127.0.0.1` for local-only access. Set
  `OAT_HOST=0.0.0.0` only when you intentionally want to expose the unauthenticated
  API to your local network.
- `OAT_SCENE_ROOT`: scene asset root.
- `OAT_GENERATED_ROOT`: generated job and runtime XML output root.
- `OAT_DEFAULT_FREQUENCY_HZ`: default carrier frequency.
- `OAT_DEFAULT_MAX_DEPTH`: default ray-tracing path depth.
- `OAT_DEFAULT_LINK_SAMPLES`: default link solver sample budget.
- `OAT_DEFAULT_RADIOMAP_SAMPLES`: default radio-map sample budget.
- `OAT_DEEPMIMO_ENV_PYTHON`: Python executable used by DeepMIMO export jobs.
- `OAT_MAP_DOWNLOAD_BASE_URL`, `OAT_MAP_DOWNLOAD_FORMAT`, and
  `OAT_MAP_DOWNLOAD_KEY`: optional tile-download source configuration.

See `backend/config.py` for the complete list of supported environment
overrides.

## Repository Layout

```text
.
|-- backend/              # HTTP server, runtime APIs, static app, scene tools
|-- tests/                # Unit and regression tests
|-- website/              # Tutorial website
|-- install.py            # Cross-platform installer and environment doctor
|-- requirements.txt      # Python package names
|-- LICENSE
`-- README.md
```

## License

OpenAirTwin is released under the Apache License 2.0. See `LICENSE` for details.
