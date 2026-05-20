from __future__ import annotations

import math
import re

from backend import config
from backend.rt.common import (
    parse_bool,
    parse_bounded_float,
    parse_bounded_int,
    parse_object,
    parse_vector,
    solver_bool,
)


_SCENARIO_NAME_RE = re.compile(r"[^A-Za-z0-9_.-]+")


def sanitize_scenario_name(value: object, *, fallback: str = "hku_deepmimo_roi") -> str:
    text = str(value or fallback).strip()
    text = _SCENARIO_NAME_RE.sub("_", text)
    text = text.strip("._-")
    return text[:80] or fallback


def parse_tile_ids(value: object, *, name: str = "scene.tile_ids") -> tuple[str, ...]:
    if not isinstance(value, (list, tuple)):
        raise ValueError(f"{name} must be a non-empty list")
    tile_ids: list[str] = []
    for index, item in enumerate(value):
        if not isinstance(item, str):
            raise ValueError(f"{name}[{index}] must be a string")
        tile_id = item.strip()
        if not tile_id:
            raise ValueError(f"{name}[{index}] must not be empty")
        if tile_id not in tile_ids:
            tile_ids.append(tile_id)
    if not tile_ids:
        raise ValueError(f"{name} must be a non-empty list")
    return tuple(tile_ids)


def receiver_grid_axis_count(lower: float, upper: float, spacing: float) -> int:
    start = float(lower)
    stop = float(upper)
    step = float(spacing)
    if not all(math.isfinite(value) for value in (start, stop, step)) or step <= 0.0:
        raise ValueError("receiver grid bounds and spacing must be finite")
    if stop < start:
        return 0
    return int(math.floor(((stop - start) / step) + 1e-9)) + 1


def receiver_grid_candidate_count(
    min_xy: tuple[float, float],
    max_xy: tuple[float, float],
    spacing: float,
) -> int:
    x_count = receiver_grid_axis_count(min_xy[0], max_xy[0], spacing)
    y_count = receiver_grid_axis_count(min_xy[1], max_xy[1], spacing)
    return x_count * y_count


def validate_receiver_grid_limit(
    min_xy: tuple[float, float],
    max_xy: tuple[float, float],
    spacing: float,
    max_receivers: int,
) -> int:
    receiver_count = receiver_grid_candidate_count(min_xy, max_xy, spacing)
    if receiver_count > int(max_receivers):
        raise ValueError(f"ROI grid creates {receiver_count} receivers, above max_receivers={max_receivers}")
    return receiver_count


def parse_deepmimo_payload(payload: dict) -> dict:
    payload = parse_object(payload, name="payload")
    roi = parse_object(payload.get("roi", {}), name="roi")
    tx = parse_object(payload.get("tx", {}), name="tx")
    rx_grid = parse_object(payload.get("rx_grid", {}), name="rx_grid")
    scene_config = parse_object(payload.get("scene", {}), name="scene")
    solver = parse_object(payload.get("solver", {}), name="solver")
    export = parse_object(payload.get("export", {}), name="export")

    if roi.get("type", "rectangle") != "rectangle":
        raise ValueError("Only rectangular DeepMIMO ROI export is implemented")

    lower = parse_vector(roi.get("min"), size=2, name="roi.min")
    upper = parse_vector(roi.get("max"), size=2, name="roi.max")
    min_xy = (min(lower[0], upper[0]), min(lower[1], upper[1]))
    max_xy = (max(lower[0], upper[0]), max(lower[1], upper[1]))
    size = (max_xy[0] - min_xy[0], max_xy[1] - min_xy[1])
    if size[0] <= 0.0 or size[1] <= 0.0:
        raise ValueError("roi rectangle must have positive width and height")

    spacing = parse_bounded_float(
        rx_grid.get("spacing", 2.0),
        name="rx_grid.spacing",
        min_value=config.DEEPMIMO_MIN_GRID_SPACING,
        max_value=config.DEEPMIMO_MAX_GRID_SPACING,
    )
    rx_height = parse_bounded_float(
        rx_grid.get("height", 1.5),
        name="rx_grid.height",
        min_value=0.0,
        max_value=100.0,
    )
    max_receivers = parse_bounded_int(
        rx_grid.get("max_receivers", min(config.DEEPMIMO_MAX_RECEIVERS, config.DEEPMIMO_DEFAULT_MAX_RECEIVERS)),
        name="rx_grid.max_receivers",
        min_value=1,
        max_value=config.DEEPMIMO_MAX_RECEIVERS,
    )
    chunk_size = parse_bounded_int(
        rx_grid.get("chunk_size", config.DEEPMIMO_DEFAULT_CHUNK_SIZE),
        name="rx_grid.chunk_size",
        min_value=1,
        max_value=max(config.DEEPMIMO_DEFAULT_CHUNK_SIZE, 8192),
    )
    validate_receiver_grid_limit(min_xy, max_xy, spacing, max_receivers)

    return {
        "roi": {
            "type": "rectangle",
            "min": min_xy,
            "max": max_xy,
            "size": size,
            "center": ((min_xy[0] + max_xy[0]) * 0.5, (min_xy[1] + max_xy[1]) * 0.5),
        },
        "tx": {
            "position": parse_vector(tx.get("position", config.DEFAULT_TX_POSITION), size=3, name="tx.position"),
            "orientation": parse_vector(tx.get("orientation", (0.0, 0.0, 0.0)), size=3, name="tx.orientation"),
        },
        "rx_grid": {
            "spacing": spacing,
            "height": rx_height,
            "max_receivers": max_receivers,
            "chunk_size": chunk_size,
            "filter_buildings": parse_bool(rx_grid, "filter_buildings", True, name="rx_grid"),
        },
        "scene": {
            "mode": "selected_tiles",
            "tile_ids": parse_tile_ids(scene_config.get("tile_ids")),
        },
        "solver": {
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
            "synthetic_array": True,
            "los": solver_bool(solver, "los", True),
            "specular_reflection": solver_bool(solver, "specular_reflection", True),
            "diffuse_reflection": solver_bool(solver, "diffuse_reflection", False),
            "refraction": solver_bool(solver, "refraction", True),
            "diffraction": solver_bool(solver, "diffraction", False),
            "edge_diffraction": solver_bool(solver, "edge_diffraction", False),
            "diffraction_lit_region": solver_bool(solver, "diffraction_lit_region", True),
            "seed": parse_bounded_int(
                solver.get("seed", 42),
                name="solver.seed",
                min_value=config.MIN_SOLVER_SEED,
                max_value=config.MAX_SOLVER_SEED,
            ),
        },
        "export": {
            "scenario_name": sanitize_scenario_name(export.get("scenario_name")),
            "format": "deepmimo",
        },
    }
