from __future__ import annotations

import math
from pathlib import Path
from typing import Iterable

import numpy as np

from backend import config


def parse_object(value: object, *, name: str) -> dict:
    if not isinstance(value, dict):
        raise ValueError(f"{name} must be an object")
    return value


def parse_finite_float(value: object, *, name: str) -> float:
    if isinstance(value, bool):
        raise ValueError(f"{name} must be a finite number")
    try:
        parsed = float(value)
    except (TypeError, ValueError):
        raise ValueError(f"{name} must be a finite number") from None
    if not math.isfinite(parsed):
        raise ValueError(f"{name} must be a finite number")
    return parsed


def parse_bounded_float(
    value: object,
    *,
    name: str,
    min_value: float | None = None,
    max_value: float | None = None,
) -> float:
    parsed = parse_finite_float(value, name=name)
    if min_value is not None and parsed < min_value:
        raise ValueError(f"{name} must be at least {min_value}")
    if max_value is not None and parsed > max_value:
        raise ValueError(f"{name} must be at most {max_value}")
    return parsed


def parse_bounded_int(
    value: object,
    *,
    name: str,
    min_value: int | None = None,
    max_value: int | None = None,
) -> int:
    if isinstance(value, bool):
        raise ValueError(f"{name} must be an integer")
    if isinstance(value, int):
        parsed = value
    elif isinstance(value, float):
        if not math.isfinite(value) or not value.is_integer():
            raise ValueError(f"{name} must be an integer")
        parsed = int(value)
    elif isinstance(value, str):
        text = value.strip()
        if not text or text in ("+", "-"):
            raise ValueError(f"{name} must be an integer")
        sign = text[0] if text[0] in "+-" else ""
        digits = text[1:] if sign else text
        if not digits.isdigit():
            raise ValueError(f"{name} must be an integer")
        parsed = int(text)
    else:
        raise ValueError(f"{name} must be an integer")

    if min_value is not None and parsed < min_value:
        raise ValueError(f"{name} must be at least {min_value}")
    if max_value is not None and parsed > max_value:
        raise ValueError(f"{name} must be at most {max_value}")
    return parsed


def parse_vector(values: Iterable[float], *, size: int, name: str) -> tuple[float, ...]:
    if isinstance(values, (str, bytes)):
        raise ValueError(f"{name} must contain exactly {size} numeric values")
    try:
        vector = tuple(parse_finite_float(v, name=f"{name}[{index}]") for index, v in enumerate(values))
    except TypeError:
        raise ValueError(f"{name} must contain exactly {size} numeric values") from None
    if len(vector) != size:
        raise ValueError(f"{name} must contain exactly {size} numeric values")
    return vector


def parse_bool(payload: dict, key: str, default: bool, *, name: str) -> bool:
    if key not in payload:
        return default
    value = payload[key]
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        normalized = value.strip().lower()
        if normalized in ("true", "1", "yes", "on"):
            return True
        if normalized in ("false", "0", "no", "off"):
            return False
    raise ValueError(f"{name}.{key} must be a boolean")


def solver_bool(payload: dict, key: str, default: bool) -> bool:
    return parse_bool(payload, key, default, name="solver")


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
    payload = parse_object(payload, name="payload")
    tx = parse_object(payload.get("tx", {}), name="tx")
    rx = parse_object(payload.get("rx", {}), name="rx")
    solver = parse_object(payload.get("solver", {}), name="solver")
    channel = parse_object(payload.get("channel", {}), name="channel")

    channel_l_min = parse_bounded_int(
        channel.get("l_min", config.DEFAULT_LINK_TAPS_L_MIN),
        name="channel.l_min",
        min_value=config.MIN_LINK_TAP_INDEX,
        max_value=config.MAX_LINK_TAP_INDEX,
    )
    channel_l_max = parse_bounded_int(
        channel.get("l_max", config.DEFAULT_LINK_TAPS_L_MAX),
        name="channel.l_max",
        min_value=config.MIN_LINK_TAP_INDEX,
        max_value=config.MAX_LINK_TAP_INDEX,
    )
    if channel_l_min > channel_l_max:
        raise ValueError("channel.l_min must be less than or equal to channel.l_max")
    channel_tap_count = channel_l_max - channel_l_min + 1
    if channel_tap_count > config.MAX_LINK_TAP_COUNT:
        raise ValueError(f"channel tap count must be at most {config.MAX_LINK_TAP_COUNT}")

    channel_num_time_steps = parse_bounded_int(
        channel.get("num_time_steps", 1),
        name="channel.num_time_steps",
        min_value=1,
        max_value=1,
    )

    return {
        "tx_position": parse_vector(tx.get("position", config.DEFAULT_TX_POSITION), size=3, name="tx.position"),
        "tx_orientation": parse_vector(tx.get("orientation", (0.0, 0.0, 0.0)), size=3, name="tx.orientation"),
        "rx_position": parse_vector(rx.get("position", config.DEFAULT_RX_POSITION), size=3, name="rx.position"),
        "rx_orientation": parse_vector(rx.get("orientation", (0.0, 0.0, 0.0)), size=3, name="rx.orientation"),
        "frequency_hz": parse_bounded_float(
            solver.get("frequency_hz", config.DEFAULT_FREQUENCY_HZ),
            name="solver.frequency_hz",
            min_value=config.MIN_FREQUENCY_HZ,
            max_value=config.MAX_FREQUENCY_HZ,
        ),
        "max_depth": parse_bounded_int(
            solver.get("max_depth", config.DEFAULT_MAX_DEPTH),
            name="solver.max_depth",
            min_value=config.MIN_SOLVER_DEPTH,
            max_value=config.MAX_SOLVER_DEPTH,
        ),
        "samples_per_src": parse_bounded_int(
            solver.get("samples_per_src", config.DEFAULT_LINK_SAMPLES),
            name="solver.samples_per_src",
            min_value=config.MIN_LINK_SAMPLES,
            max_value=config.MAX_LINK_SAMPLES,
        ),
        "max_num_paths_per_src": parse_bounded_int(
            solver.get("max_num_paths_per_src", config.DEFAULT_LINK_MAX_NUM_PATHS_PER_SRC),
            name="solver.max_num_paths_per_src",
            min_value=config.MIN_LINK_MAX_NUM_PATHS_PER_SRC,
            max_value=config.MAX_LINK_MAX_NUM_PATHS_PER_SRC,
        ),
        "synthetic_array": solver_bool(solver, "synthetic_array", False),
        "los": solver_bool(solver, "los", True),
        "specular_reflection": solver_bool(solver, "specular_reflection", True),
        "diffuse_reflection": solver_bool(solver, "diffuse_reflection", False),
        "refraction": solver_bool(solver, "refraction", True),
        "diffraction": solver_bool(solver, "diffraction", False),
        "edge_diffraction": solver_bool(solver, "edge_diffraction", False),
        "diffraction_lit_region": solver_bool(solver, "diffraction_lit_region", False),
        "seed": parse_bounded_int(
            solver.get("seed", 42),
            name="solver.seed",
            min_value=config.MIN_SOLVER_SEED,
            max_value=config.MAX_SOLVER_SEED,
        ),
        "compute_taps": parse_bool(channel, "compute_taps", False, name="channel"),
        "channel_l_min": channel_l_min,
        "channel_l_max": channel_l_max,
        "channel_tap_count": channel_tap_count,
        "channel_fft_size": parse_bounded_int(
            channel.get("fft_size", config.DEFAULT_LINK_TAPS_FFT_SIZE),
            name="channel.fft_size",
            min_value=config.MIN_LINK_FFT_SIZE,
            max_value=config.MAX_LINK_FFT_SIZE,
        ),
        "channel_subcarrier_spacing_hz": parse_bounded_float(
            channel.get("subcarrier_spacing_hz", config.DEFAULT_LINK_TAPS_SUBCARRIER_SPACING_HZ),
            name="channel.subcarrier_spacing_hz",
            min_value=config.MIN_LINK_SUBCARRIER_SPACING_HZ,
            max_value=config.MAX_LINK_SUBCARRIER_SPACING_HZ,
        ),
        "channel_num_time_steps": channel_num_time_steps,
    }


def parse_radiomap_payload(payload: dict) -> dict:
    payload = parse_object(payload, name="payload")
    tx = parse_object(payload.get("tx", {}), name="tx")
    surface = parse_object(payload.get("surface", {}), name="surface")
    solver = parse_object(payload.get("solver", {}), name="solver")

    if surface.get("type", "terrain_patch") != "terrain_patch":
        raise ValueError("Only terrain-patch radio maps are implemented")

    size = parse_vector(surface.get("size", config.DEFAULT_RADIOMAP_SIZE), size=2, name="surface.size")
    if size[0] <= 0 or size[1] <= 0:
        raise ValueError("surface.size values must be positive")

    height_offset = parse_bounded_float(
        surface.get("height_offset", config.DEFAULT_RADIOMAP_HEIGHT_OFFSET),
        name="surface.height_offset",
        min_value=0.0,
    )

    density_level = parse_bounded_int(
        surface.get("density_level", config.DEFAULT_RADIOMAP_DENSITY_LEVEL),
        name="surface.density_level",
        min_value=config.MIN_RADIOMAP_DENSITY_LEVEL,
        max_value=config.MAX_RADIOMAP_DENSITY_LEVEL,
    )

    metric = payload.get("metric", "path_gain")
    if not isinstance(metric, str):
        raise ValueError("metric must be a string")
    if metric != "path_gain":
        raise ValueError("Only the 'path_gain' radio map metric is implemented")

    base_samples_per_tx = parse_bounded_int(
        solver.get("samples_per_tx", config.DEFAULT_RADIOMAP_SAMPLES),
        name="solver.samples_per_tx",
        min_value=config.MIN_RADIOMAP_SAMPLES,
        max_value=config.MAX_RADIOMAP_SAMPLES,
    )
    effective_samples_per_tx = base_samples_per_tx * (4 ** (density_level - 1))
    if effective_samples_per_tx > config.MAX_RADIOMAP_EFFECTIVE_SAMPLES:
        raise ValueError(
            "solver.samples_per_tx after density scaling must be at most "
            f"{config.MAX_RADIOMAP_EFFECTIVE_SAMPLES}"
        )

    return {
        "tx_position": parse_vector(tx.get("position", config.DEFAULT_TX_POSITION), size=3, name="tx.position"),
        "tx_orientation": parse_vector(tx.get("orientation", (0.0, 0.0, 0.0)), size=3, name="tx.orientation"),
        "surface_size": size,
        "surface_height_offset": height_offset,
        "surface_density_level": density_level,
        "metric": metric,
        "frequency_hz": parse_bounded_float(
            solver.get("frequency_hz", config.DEFAULT_FREQUENCY_HZ),
            name="solver.frequency_hz",
            min_value=config.MIN_FREQUENCY_HZ,
            max_value=config.MAX_FREQUENCY_HZ,
        ),
        "max_depth": parse_bounded_int(
            solver.get("max_depth", config.DEFAULT_MAX_DEPTH),
            name="solver.max_depth",
            min_value=config.MIN_SOLVER_DEPTH,
            max_value=config.MAX_SOLVER_DEPTH,
        ),
        "base_samples_per_tx": base_samples_per_tx,
        "samples_per_tx": effective_samples_per_tx,
        "los": solver_bool(solver, "los", True),
        "specular_reflection": solver_bool(solver, "specular_reflection", True),
        "diffuse_reflection": solver_bool(solver, "diffuse_reflection", False),
        "refraction": solver_bool(solver, "refraction", True),
        "seed": parse_bounded_int(
            solver.get("seed", 42),
            name="solver.seed",
            min_value=config.MIN_SOLVER_SEED,
            max_value=config.MAX_SOLVER_SEED,
        ),
    }
