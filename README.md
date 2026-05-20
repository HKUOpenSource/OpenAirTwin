<p align="center">
  <img src="backend/static/assets/openairtwin_logo.png" alt="OpenAirTwin" width="620">
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
  <a href="#quickstart">Quickstart</a> &bull;
  <a href="#features">Features</a> &bull;
  <a href="#scene-data">Scene Data</a> &bull;
  <a href="#configuration">Configuration</a> &bull;
  <a href="#validation">Validation</a> &bull;
  <a href="#license">License</a>
</p>


OpenAirTwin is an open-source platform for interactive urban wireless
propagation studies. It combines a Python backend, a static browser frontend,
tile-based scene management, and Sionna RT workflows for link analysis,
radio-map generation, mobility simulation, DeepMIMO dataset export, and more.

## Features

<table>
  <tr>
    <td width="20%" align="center" valign="top">
      <img src="backend/static/assets/feature-map-selection.png" alt="OpenAirTwin map selection and tile download" width="100%">
      <br>
      <strong>Map Selection and Tile Download</strong>
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

## Quickstart

Install the Python dependencies:

```bash
python3 -m pip install -r requirements.txt
```

Start the backend:

```bash
python3 -m backend.server
```

Open the frontend:

```text
http://127.0.0.1:8090
```

The server listens on `0.0.0.0:8090` by default. Override the bind address when
needed:

```bash
OAT_HOST=127.0.0.1 OAT_PORT=8090 python3 -m backend.server
```

If no scene assets are present, the server creates an empty `scene/` layout and
the frontend opens with an empty scene manifest. Add scene data before running
ray-tracing workflows.

## Requirements

- Python 3.11 or newer.
- Python packages listed in `requirements.txt`: `numpy`, `sionna-rt`,
  `mitsuba`, `drjit`, `trimesh`, and `DeepMIMO`.
- A GPU-capable environment is recommended for practical Sionna RT workloads.
- A modern browser with WebGL support.
- Node.js is optional, but useful for JavaScript syntax checks during
  development.

Sionna RT, Mitsuba, Dr.Jit, CUDA, and GPU driver compatibility are environment
specific. Follow the upstream installation guidance for those packages when
preparing a solver machine.

## Project Structure

```text
.
|-- backend/
|   |-- server.py          # HTTP server, API routes, and static file serving
|   |-- config.py          # Runtime defaults and environment overrides
|   |-- jobs/              # Background job managers
|   |-- rt/                # Sionna RT payload parsing and solver helpers
|   |-- scene/             # Scene catalog, tile XML, and bundle logic
|   |-- static/            # Browser UI assets
|   `-- tools/             # Public scene bundle-build utilities
|-- tests/                 # Unit and regression tests
|-- requirements.txt       # Python package names
|-- LICENSE
`-- README.md
```

## Scene Data

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
OAT_SCENE_ROOT=/path/to/scene python3 -m backend.server
```

Build or refresh frontend render bundles with:

```bash
python3 -m backend.tools.build_tile_bundles --help
```

## Configuration

Runtime behavior is configured with `OAT_*` environment variables. Common
options:

- `OAT_HOST` and `OAT_PORT`: backend bind address.
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

## Validation

Run the Python checks:

```bash
python3 -m compileall -q backend tests
python3 -m unittest discover -s tests
```

Run frontend syntax checks when Node.js is available:

```bash
find backend/static/js -maxdepth 1 -name '*.js' -print0 | xargs -0 -n1 node --check
node --check backend/static/lib/GLBGeometryLoader.js
```

Check for whitespace issues before committing:

```bash
git diff --check
```

## License

OpenAirTwin is released under the Apache License 2.0. See `LICENSE` for details.
