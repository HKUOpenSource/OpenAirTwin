from __future__ import annotations

import os
from pathlib import Path


BACKEND_ROOT = Path(__file__).resolve().parent
PROJECT_ROOT = BACKEND_ROOT.parent
STATIC_ROOT = BACKEND_ROOT / "static"
SCENE_ROOT = Path(os.environ.get("HKU_RT_SCENE_ROOT", str(PROJECT_ROOT / "HKU_scenes"))).resolve()
SCENE_XML = SCENE_ROOT / "scenario_HKU.xml"
MESH_ROOT = SCENE_ROOT / "meshes"
BUNDLE_ROOT = SCENE_ROOT / "cache" / "render_bundles"

HOST = os.environ.get("HKU_RT_HOST", "0.0.0.0")
PORT = int(os.environ.get("HKU_RT_PORT", "8090"))

DEFAULT_FREQUENCY_HZ = float(os.environ.get("HKU_RT_DEFAULT_FREQUENCY_HZ", "3500000000"))
DEFAULT_MAX_DEPTH = int(os.environ.get("HKU_RT_DEFAULT_MAX_DEPTH", "4"))
DEFAULT_LINK_SAMPLES = int(os.environ.get("HKU_RT_DEFAULT_LINK_SAMPLES", "30000"))
DEFAULT_RADIOMAP_SAMPLES = int(os.environ.get("HKU_RT_DEFAULT_RADIOMAP_SAMPLES", "1000000"))
MAX_RADIOMAP_CELLS = int(os.environ.get("HKU_RT_MAX_RADIOMAP_CELLS", "100000"))
RADIOMAP_MEASUREMENT_MATERIAL = os.environ.get("HKU_RT_RADIOMAP_MEASUREMENT_MATERIAL", "itu_medium_dry_ground")

DEFAULT_TX_POSITION = (72.0, 37.0, 40.0)
DEFAULT_RX_POSITION = (90.0, 52.0, 1.5)
DEFAULT_RADIOMAP_SIZE = (160.0, 160.0)
DEFAULT_RADIOMAP_HEIGHT_OFFSET = 1.5
DEFAULT_RADIOMAP_DENSITY_LEVEL = 2
