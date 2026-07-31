"""Release dependency metadata shared by packaging and audit gates."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
import re


@dataclass(frozen=True)
class ReleaseDependency:
    name: str
    display_name: str
    version: str
    license_id: str
    project_url: str
    purl: str


PYTHON_RUNTIME_DEPENDENCIES = (
    ReleaseDependency("numpy", "NumPy", "2.2.6", "BSD-3-Clause", "https://numpy.org/", "pkg:pypi/numpy@2.2.6"),
    ReleaseDependency(
        "sionna-rt",
        "Sionna RT",
        "2.0.1",
        "Apache-2.0",
        "https://github.com/NVlabs/sionna-rt",
        "pkg:pypi/sionna-rt@2.0.1",
    ),
    ReleaseDependency(
        "mitsuba",
        "Mitsuba",
        "3.8.0",
        "BSD-3-Clause",
        "https://github.com/mitsuba-renderer/mitsuba3",
        "pkg:pypi/mitsuba@3.8.0",
    ),
    ReleaseDependency(
        "drjit",
        "Dr.Jit",
        "1.3.1",
        "BSD-3-Clause",
        "https://github.com/mitsuba-renderer/drjit",
        "pkg:pypi/drjit@1.3.1",
    ),
    ReleaseDependency(
        "trimesh",
        "trimesh",
        "4.12.2",
        "MIT",
        "https://github.com/mikedh/trimesh",
        "pkg:pypi/trimesh@4.12.2",
    ),
    ReleaseDependency(
        "deepmimo",
        "DeepMIMO",
        "4.0.1",
        "GPL-2.0-or-later",
        "https://github.com/DeepMIMO/DeepMIMO-python",
        "pkg:pypi/deepmimo@4.0.1",
    ),
    ReleaseDependency(
        "defusedxml",
        "defusedxml",
        "0.7.1",
        "PSF-2.0",
        "https://github.com/tiran/defusedxml",
        "pkg:pypi/defusedxml@0.7.1",
    ),
)

BROWSER_RUNTIME_DEPENDENCIES = (
    ReleaseDependency("react", "React", "19.2.8", "MIT", "https://react.dev/", "pkg:npm/react@19.2.8"),
    ReleaseDependency(
        "react-dom", "React DOM", "19.2.8", "MIT", "https://react.dev/", "pkg:npm/react-dom@19.2.8"
    ),
    ReleaseDependency(
        "scheduler",
        "Scheduler",
        "0.27.0",
        "MIT",
        "https://github.com/facebook/react",
        "pkg:npm/scheduler@0.27.0",
    ),
    ReleaseDependency("three", "Three.js", "0.160.0", "MIT", "https://threejs.org/", "pkg:npm/three@0.160.0"),
    ReleaseDependency(
        "leaflet", "Leaflet", "1.9.4", "BSD-2-Clause", "https://leafletjs.com/", "pkg:npm/leaflet@1.9.4"
    ),
    ReleaseDependency(
        "proj4", "PROJ4JS", "2.11.0", "MIT", "https://github.com/proj4js/proj4js", "pkg:npm/proj4@2.11.0"
    ),
)

APPROVED_LICENSES = frozenset(
    {
        "0BSD",
        "Apache-2.0",
        "BSD-2-Clause",
        "BSD-3-Clause",
        "BlueOak-1.0.0",
        "CC-BY-4.0",
        "CC0-1.0",
        "ISC",
        "MIT",
        "MIT-0",
        "MPL-2.0",
        "PSF-2.0",
        "Python-2.0",
    }
)
APPROVED_COPYLEFT_EXCEPTIONS = frozenset({("deepmimo", "4.0.1", "GPL-2.0-or-later")})
LOCKFILE_LICENSE_OVERRIDES = {("svg-tags", "1.0.0"): "MIT"}

VENDORED_RUNTIME_FILES = (
    "backend/static/lib/three.module.js",
    "backend/static/lib/THREE_LICENSE.txt",
    "backend/static/lib/leaflet/leaflet.js",
    "backend/static/lib/leaflet/leaflet.css",
    "backend/static/lib/proj4/proj4.js",
)


def normalize_dependency_name(name: str) -> str:
    return name.replace("_", "-").lower()


def parse_requirements(path: Path) -> list[tuple[str, str]]:
    requirements = []
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        match = re.fullmatch(r"([A-Za-z0-9_.-]+)==([A-Za-z0-9_.+-]+)", line)
        if match is None:
            raise ValueError(f"Runtime requirement is not exactly pinned: {line}")
        requirements.append((normalize_dependency_name(match.group(1)), match.group(2)))
    return requirements
