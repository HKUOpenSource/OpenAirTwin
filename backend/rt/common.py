from __future__ import annotations

from pathlib import Path
from typing import Iterable

import numpy as np

from backend import config


def parse_vector(values: Iterable[float], *, size: int, name: str) -> tuple[float, ...]:
    vector = tuple(float(v) for v in values)
    if len(vector) != size:
        raise ValueError(f"{name} must contain exactly {size} numeric values")
    return vector


def solver_bool(payload: dict, key: str, default: bool) -> bool:
    value = payload.get(key, default)
    return bool(value)


def to_numpy(value) -> np.ndarray:
    try:
        import drjit as dr

        return np.asarray(dr.detach(value))
    except Exception:
        if hasattr(value, "numpy"):
            return np.asarray(value.numpy())
        return np.asarray(value)


def linear_to_db(values: np.ndarray, floor: float = 1e-30) -> np.ndarray:
    return 10.0 * np.log10(np.maximum(values, floor))


def build_scene(scene_xml: Path, frequency_hz: float):
    from sionna.rt import PlanarArray, load_scene

    scene = load_scene(str(scene_xml))
    scene.frequency = float(frequency_hz)
    scene.tx_array = PlanarArray(
        num_rows=1,
        num_cols=1,
        vertical_spacing=0.5,
        horizontal_spacing=0.5,
        pattern="iso",
        polarization="V",
    )
    scene.rx_array = PlanarArray(
        num_rows=1,
        num_cols=1,
        vertical_spacing=0.5,
        horizontal_spacing=0.5,
        pattern="iso",
        polarization="V",
    )
    return scene


def parse_link_payload(payload: dict) -> dict:
    tx = payload.get("tx", {})
    rx = payload.get("rx", {})
    solver = payload.get("solver", {})
    return {
        "tx_position": parse_vector(tx.get("position", config.DEFAULT_TX_POSITION), size=3, name="tx.position"),
        "tx_orientation": parse_vector(tx.get("orientation", (0.0, 0.0, 0.0)), size=3, name="tx.orientation"),
        "rx_position": parse_vector(rx.get("position", config.DEFAULT_RX_POSITION), size=3, name="rx.position"),
        "rx_orientation": parse_vector(rx.get("orientation", (0.0, 0.0, 0.0)), size=3, name="rx.orientation"),
        "frequency_hz": float(solver.get("frequency_hz", config.DEFAULT_FREQUENCY_HZ)),
        "max_depth": int(solver.get("max_depth", config.DEFAULT_MAX_DEPTH)),
        "samples_per_src": int(solver.get("samples_per_src", config.DEFAULT_LINK_SAMPLES)),
        "los": solver_bool(solver, "los", True),
        "specular_reflection": solver_bool(solver, "specular_reflection", True),
        "diffuse_reflection": solver_bool(solver, "diffuse_reflection", False),
        "refraction": solver_bool(solver, "refraction", True),
        "seed": int(solver.get("seed", 42)),
    }


def parse_radiomap_payload(payload: dict) -> dict:
    tx = payload.get("tx", {})
    surface = payload.get("surface", {})
    solver = payload.get("solver", {})

    if surface.get("type", "terrain_patch") != "terrain_patch":
        raise ValueError("Only terrain-patch radio maps are implemented")

    size = parse_vector(surface.get("size", config.DEFAULT_RADIOMAP_SIZE), size=2, name="surface.size")
    if size[0] <= 0 or size[1] <= 0:
        raise ValueError("surface.size values must be positive")

    height_offset = float(surface.get("height_offset", config.DEFAULT_RADIOMAP_HEIGHT_OFFSET))
    if height_offset < 0.0:
        raise ValueError("surface.height_offset must be non-negative")

    density_level = int(surface.get("density_level", config.DEFAULT_RADIOMAP_DENSITY_LEVEL))
    if density_level < 1:
        raise ValueError("surface.density_level must be at least 1")

    metric = str(payload.get("metric", "path_gain"))
    if metric != "path_gain":
        raise ValueError("Only the 'path_gain' radio map metric is implemented")

    base_samples_per_tx = int(solver.get("samples_per_tx", config.DEFAULT_RADIOMAP_SAMPLES))
    effective_samples_per_tx = base_samples_per_tx * (4 ** (density_level - 1))

    return {
        "tx_position": parse_vector(tx.get("position", config.DEFAULT_TX_POSITION), size=3, name="tx.position"),
        "tx_orientation": parse_vector(tx.get("orientation", (0.0, 0.0, 0.0)), size=3, name="tx.orientation"),
        "surface_size": size,
        "surface_height_offset": height_offset,
        "surface_density_level": density_level,
        "metric": metric,
        "frequency_hz": float(solver.get("frequency_hz", config.DEFAULT_FREQUENCY_HZ)),
        "max_depth": int(solver.get("max_depth", config.DEFAULT_MAX_DEPTH)),
        "base_samples_per_tx": base_samples_per_tx,
        "samples_per_tx": effective_samples_per_tx,
        "los": solver_bool(solver, "los", True),
        "specular_reflection": solver_bool(solver, "specular_reflection", True),
        "diffuse_reflection": solver_bool(solver, "diffuse_reflection", False),
        "refraction": solver_bool(solver, "refraction", True),
        "seed": int(solver.get("seed", 42)),
    }
