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


def vector_length(values: Iterable[float]) -> float:
    return math.sqrt(sum(float(value) * float(value) for value in values))


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


def antenna_array_default_config() -> dict:
    return {
        "num_rows": int(config.DEFAULT_ANTENNA_ARRAY_NUM_ROWS),
        "num_cols": int(config.DEFAULT_ANTENNA_ARRAY_NUM_COLS),
        "vertical_spacing": float(config.DEFAULT_ANTENNA_ARRAY_VERTICAL_SPACING),
        "horizontal_spacing": float(config.DEFAULT_ANTENNA_ARRAY_HORIZONTAL_SPACING),
        "pattern": str(config.DEFAULT_ANTENNA_ARRAY_PATTERN),
        "polarization": str(config.DEFAULT_ANTENNA_ARRAY_POLARIZATION),
    }


def _registry_values(kind: str, fallback: list[str]) -> list[str]:
    try:
        from sionna.rt.antenna_pattern import antenna_pattern_registry, polarization_registry

        registry = antenna_pattern_registry if kind == "pattern" else polarization_registry
        values = list(registry.list())
    except Exception:
        values = fallback

    cleaned: list[str] = []
    for value in values:
        if isinstance(value, str) and value and value not in cleaned:
            cleaned.append(value)
    for value in fallback:
        if value not in cleaned:
            cleaned.append(value)
    return cleaned


def antenna_array_capabilities() -> dict:
    defaults = antenna_array_default_config()
    patterns = _registry_values("pattern", [defaults["pattern"], "iso"])
    polarizations = _registry_values("polarization", [defaults["polarization"], "V"])
    return {
        "antenna_arrays": {
            "defaults": defaults,
            "limits": {
                "num_rows": {
                    "min": int(config.MIN_ANTENNA_ARRAY_ROWS),
                    "max": int(config.MAX_ANTENNA_ARRAY_ROWS),
                },
                "num_cols": {
                    "min": int(config.MIN_ANTENNA_ARRAY_COLS),
                    "max": int(config.MAX_ANTENNA_ARRAY_COLS),
                },
                "element_count": {
                    "max": int(config.MAX_ANTENNA_ARRAY_ELEMENTS),
                },
                "vertical_spacing": {
                    "min": float(config.MIN_ANTENNA_ARRAY_SPACING),
                    "max": float(config.MAX_ANTENNA_ARRAY_SPACING),
                },
                "horizontal_spacing": {
                    "min": float(config.MIN_ANTENNA_ARRAY_SPACING),
                    "max": float(config.MAX_ANTENNA_ARRAY_SPACING),
                },
            },
            "patterns": patterns,
            "polarizations": polarizations,
        }
    }


def parse_antenna_array_payload(value: object, *, name: str) -> dict:
    defaults = antenna_array_default_config()
    payload = parse_object(value, name=name) if value is not None else {}
    capabilities = antenna_array_capabilities()["antenna_arrays"]

    num_rows = parse_bounded_int(
        payload.get("num_rows", defaults["num_rows"]),
        name=f"{name}.num_rows",
        min_value=config.MIN_ANTENNA_ARRAY_ROWS,
        max_value=config.MAX_ANTENNA_ARRAY_ROWS,
    )
    num_cols = parse_bounded_int(
        payload.get("num_cols", defaults["num_cols"]),
        name=f"{name}.num_cols",
        min_value=config.MIN_ANTENNA_ARRAY_COLS,
        max_value=config.MAX_ANTENNA_ARRAY_COLS,
    )
    if num_rows * num_cols > config.MAX_ANTENNA_ARRAY_ELEMENTS:
        raise ValueError(f"{name} element count must be at most {config.MAX_ANTENNA_ARRAY_ELEMENTS}")

    vertical_spacing = parse_bounded_float(
        payload.get("vertical_spacing", defaults["vertical_spacing"]),
        name=f"{name}.vertical_spacing",
        min_value=config.MIN_ANTENNA_ARRAY_SPACING,
        max_value=config.MAX_ANTENNA_ARRAY_SPACING,
    )
    horizontal_spacing = parse_bounded_float(
        payload.get("horizontal_spacing", defaults["horizontal_spacing"]),
        name=f"{name}.horizontal_spacing",
        min_value=config.MIN_ANTENNA_ARRAY_SPACING,
        max_value=config.MAX_ANTENNA_ARRAY_SPACING,
    )

    pattern = payload.get("pattern", defaults["pattern"])
    if not isinstance(pattern, str):
        raise ValueError(f"{name}.pattern must be a string")
    pattern = pattern.strip()
    if pattern not in capabilities["patterns"]:
        raise ValueError(f"{name}.pattern must be one of: {', '.join(capabilities['patterns'])}")

    polarization = payload.get("polarization", defaults["polarization"])
    if not isinstance(polarization, str):
        raise ValueError(f"{name}.polarization must be a string")
    polarization = polarization.strip()
    if polarization not in capabilities["polarizations"]:
        raise ValueError(f"{name}.polarization must be one of: {', '.join(capabilities['polarizations'])}")

    return {
        "num_rows": num_rows,
        "num_cols": num_cols,
        "vertical_spacing": vertical_spacing,
        "horizontal_spacing": horizontal_spacing,
        "pattern": pattern,
        "polarization": polarization,
    }


def create_planar_array(array_config: dict):
    from sionna.rt import PlanarArray

    return PlanarArray(
        num_rows=array_config["num_rows"],
        num_cols=array_config["num_cols"],
        vertical_spacing=array_config["vertical_spacing"],
        horizontal_spacing=array_config["horizontal_spacing"],
        pattern=array_config["pattern"],
        polarization=array_config["polarization"],
    )


def build_scene(scene_xml: Path, frequency_hz: float):
    from sionna.rt import load_scene

    scene = load_scene(str(scene_xml))
    scene.frequency = float(frequency_hz)
    default_array = antenna_array_default_config()
    scene.tx_array = create_planar_array(default_array)
    scene.rx_array = create_planar_array(default_array)
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
    tx_array = parse_antenna_array_payload(solver.get("tx_array"), name="solver.tx_array")
    rx_array = parse_antenna_array_payload(solver.get("rx_array"), name="solver.rx_array")

    return {
        "tx_position": parse_vector(tx.get("position", config.DEFAULT_TX_POSITION), size=3, name="tx.position"),
        "tx_orientation": parse_vector(tx.get("orientation", (0.0, 0.0, 0.0)), size=3, name="tx.orientation"),
        "tx_velocity": parse_vector(tx.get("velocity", (0.0, 0.0, 0.0)), size=3, name="tx.velocity"),
        "rx_position": parse_vector(rx.get("position", config.DEFAULT_RX_POSITION), size=3, name="rx.position"),
        "rx_orientation": parse_vector(rx.get("orientation", (0.0, 0.0, 0.0)), size=3, name="rx.orientation"),
        "rx_velocity": parse_vector(rx.get("velocity", (0.0, 0.0, 0.0)), size=3, name="rx.velocity"),
        "tx_array": tx_array,
        "rx_array": rx_array,
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


def _trajectory_position_at_distance(
    points: list[tuple[float, float, float]],
    cumulative_distances: list[float],
    distance_m: float,
) -> tuple[tuple[float, float, float], tuple[float, float, float]]:
    safe_distance = max(0.0, min(float(distance_m), cumulative_distances[-1]))
    end_index = int(np.searchsorted(np.asarray(cumulative_distances), safe_distance, side="left"))
    end_index = min(max(end_index, 1), len(points) - 1)
    start_index = end_index - 1
    start_distance = cumulative_distances[start_index]
    end_distance = cumulative_distances[end_index]
    segment_distance = end_distance - start_distance
    start = points[start_index]
    end = points[end_index]
    direction = tuple(end[axis] - start[axis] for axis in range(3))
    if segment_distance <= 0.0:
        unit_direction = (0.0, 0.0, 0.0)
        t = 0.0
    else:
        unit_direction = tuple(value / segment_distance for value in direction)
        t = (safe_distance - start_distance) / segment_distance
    position = tuple(start[axis] + t * direction[axis] for axis in range(3))
    return position, unit_direction


def sample_rx_trajectory(
    points: list[tuple[float, float, float]],
    velocity_mps: float,
    time_step_s: float,
    max_steps: int,
) -> dict:
    cumulative_distances = [0.0]
    for index in range(1, len(points)):
        segment = tuple(points[index][axis] - points[index - 1][axis] for axis in range(3))
        segment_length = vector_length(segment)
        if segment_length <= 0.0:
            raise ValueError("rx_trajectory.points must not contain repeated consecutive waypoints")
        cumulative_distances.append(cumulative_distances[-1] + segment_length)

    total_distance_m = cumulative_distances[-1]
    duration_s = total_distance_m / velocity_mps
    times = [0.0]
    next_time = time_step_s
    while next_time < duration_s:
        times.append(next_time)
        next_time += time_step_s
    if duration_s > 0.0 and (not math.isclose(times[-1], duration_s, rel_tol=0.0, abs_tol=1e-9)):
        times.append(duration_s)

    if len(times) < config.MIN_MOBILITY_STEPS:
        raise ValueError(f"rx_trajectory computed steps must be at least {config.MIN_MOBILITY_STEPS}")
    if len(times) > max_steps:
        raise ValueError(
            f"rx_trajectory computed steps must be at most {max_steps}; "
            "increase rx_trajectory.max_steps, increase rx_trajectory.time_step_s, or shorten the trajectory"
        )

    samples = []
    for step_index, time_s in enumerate(times):
        distance_m = min(time_s * velocity_mps, total_distance_m)
        position, direction = _trajectory_position_at_distance(points, cumulative_distances, distance_m)
        velocity = tuple(direction[axis] * velocity_mps for axis in range(3))
        samples.append(
            {
                "step_index": step_index,
                "time_s": float(time_s),
                "distance_m": float(distance_m),
                "position": tuple(float(value) for value in position),
                "velocity": tuple(float(value) for value in velocity),
            }
        )

    return {
        "points": points,
        "velocity_mps": float(velocity_mps),
        "time_step_s": float(time_step_s),
        "max_steps": int(max_steps),
        "total_distance_m": float(total_distance_m),
        "duration_s": float(duration_s),
        "samples": samples,
    }


def parse_mobility_payload(payload: dict) -> dict:
    payload = parse_object(payload, name="payload")
    trajectory = parse_object(payload.get("rx_trajectory", {}), name="rx_trajectory")

    raw_points = trajectory.get("points")
    if not isinstance(raw_points, list):
        raise ValueError("rx_trajectory.points must be a list")
    if len(raw_points) < config.MIN_MOBILITY_WAYPOINTS:
        raise ValueError(f"rx_trajectory.points must contain at least {config.MIN_MOBILITY_WAYPOINTS} waypoints")
    if len(raw_points) > config.MAX_MOBILITY_WAYPOINTS:
        raise ValueError(f"rx_trajectory.points must contain at most {config.MAX_MOBILITY_WAYPOINTS} waypoints")
    points = [
        parse_vector(point, size=3, name=f"rx_trajectory.points[{index}]")
        for index, point in enumerate(raw_points)
    ]

    velocity_mps = parse_bounded_float(
        trajectory.get("velocity_mps", 1.5),
        name="rx_trajectory.velocity_mps",
        min_value=config.MIN_MOBILITY_VELOCITY_MPS,
        max_value=config.MAX_MOBILITY_VELOCITY_MPS,
    )
    time_step_s = parse_bounded_float(
        trajectory.get("time_step_s", 1.0),
        name="rx_trajectory.time_step_s",
        min_value=config.MIN_MOBILITY_TIME_STEP_S,
        max_value=config.MAX_MOBILITY_TIME_STEP_S,
    )
    max_steps = parse_bounded_int(
        trajectory.get("max_steps", config.DEFAULT_MOBILITY_MAX_STEPS),
        name="rx_trajectory.max_steps",
        min_value=config.MIN_MOBILITY_STEPS,
    )

    channel = dict(parse_object(payload.get("channel", {}), name="channel"))
    channel.setdefault("compute_taps", True)
    link_payload = {
        "tx": payload.get("tx", {}),
        "rx": {
            "position": points[0],
            "orientation": parse_object(payload.get("rx", {}), name="rx").get("orientation", (0.0, 0.0, 0.0)),
        },
        "solver": payload.get("solver", {}),
        "channel": channel,
    }
    link_params = parse_link_payload(link_payload)
    trajectory_samples = sample_rx_trajectory(points, velocity_mps, time_step_s, max_steps)
    return {**link_params, "rx_trajectory": trajectory_samples}


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
    cell_size = None
    if surface.get("cell_size") is not None:
        cell_size = parse_bounded_float(
            surface.get("cell_size"),
            name="surface.cell_size",
            min_value=config.MIN_RADIOMAP_CELL_SIZE,
            max_value=config.MAX_RADIOMAP_CELL_SIZE,
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
    tx_array = parse_antenna_array_payload(solver.get("tx_array"), name="solver.tx_array")

    return {
        "tx_position": parse_vector(tx.get("position", config.DEFAULT_TX_POSITION), size=3, name="tx.position"),
        "tx_orientation": parse_vector(tx.get("orientation", (0.0, 0.0, 0.0)), size=3, name="tx.orientation"),
        "tx_array": tx_array,
        "surface_size": size,
        "surface_height_offset": height_offset,
        "surface_density_level": density_level,
        "surface_cell_size": cell_size,
        "surface_resolution_mode": "cell_size" if cell_size is not None else "density_level",
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
