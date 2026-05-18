from __future__ import annotations

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
        rx_grid.get("max_receivers", min(config.DEEPMIMO_MAX_RECEIVERS, 5000)),
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
            "crop_to_roi": parse_bool(scene_config, "crop_to_roi", True, name="scene"),
            "buffer_m": parse_bounded_float(
                scene_config.get("buffer_m", config.DEEPMIMO_DEFAULT_SCENE_BUFFER_M),
                name="scene.buffer_m",
                min_value=config.DEEPMIMO_MIN_SCENE_BUFFER_M,
                max_value=config.DEEPMIMO_MAX_SCENE_BUFFER_M,
            ),
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
