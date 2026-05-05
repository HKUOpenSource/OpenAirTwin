from __future__ import annotations

from collections.abc import Callable
from time import perf_counter

import numpy as np

from backend.rt.common import linear_to_db, parse_radiomap_payload, to_numpy
from backend.rt.runtime import log_timing
from backend.rt.terrain_patch import build_terrain_patch


ProgressCallback = Callable[[float, str], None]


def _radiomap_dependencies():
    from sionna.rt import RadioMapSolver, Transmitter

    return RadioMapSolver, Transmitter


def solve_terrain_radiomap(
    rt_runtime,
    payload: dict,
    progress_cb: ProgressCallback | None = None,
    *,
    dependencies=None,
) -> dict:
    RadioMapSolver, Transmitter = dependencies or _radiomap_dependencies()

    def report(progress: float, message: str) -> None:
        if progress_cb is not None:
            progress_cb(progress, message)

    params = parse_radiomap_payload(payload)
    total_started_at = perf_counter()
    report(0.02, "Waiting for solver")
    with rt_runtime.lock:
        report(0.05, "Using cached scene")
        scene = rt_runtime.scene
        rt_runtime.set_frequency(params["frequency_hz"])
        try:
            scene.add(
                Transmitter(
                    name="tx_radiomap",
                    position=params["tx_position"],
                    orientation=params["tx_orientation"],
                )
            )

            report(0.16, "Preparing terrain patch")
            patch_started_at = perf_counter()
            measurement_surface, patch_meta = build_terrain_patch(
                scene,
                tx_position=params["tx_position"],
                size_xy=params["surface_size"],
                height_offset=params["surface_height_offset"],
                density_level=params["surface_density_level"],
            )
            log_timing(
                "radiomap_patch",
                patch_started_at,
                cells=patch_meta["cell_count"],
                density=params["surface_density_level"],
            )

            report(
                0.28,
                f"Computing terrain radio map on {patch_meta['cell_count']} cells with {params['samples_per_tx']} samples",
            )
            solver_started_at = perf_counter()
            radio_map = RadioMapSolver()(
                scene,
                measurement_surface=measurement_surface,
                samples_per_tx=params["samples_per_tx"],
                max_depth=params["max_depth"],
                los=params["los"],
                specular_reflection=params["specular_reflection"],
                diffuse_reflection=params["diffuse_reflection"],
                refraction=params["refraction"],
                seed=params["seed"],
            )
            log_timing(
                "radiomap_solver",
                solver_started_at,
                cells=patch_meta["cell_count"],
                max_depth=params["max_depth"],
                samples=params["samples_per_tx"],
            )

            path_gain = np.asarray(to_numpy(radio_map.path_gain), dtype=float)
        finally:
            scene.remove("tx_radiomap")

    report(0.85, "Finalizing radio map")
    finalize_started_at = perf_counter()
    values_linear = path_gain.reshape(-1) if path_gain.shape[0] == 1 else path_gain
    values_linear = np.asarray(values_linear, dtype=float).reshape(-1)
    if values_linear.shape[0] != patch_meta["cell_count"]:
        raise ValueError(
            f"Radio map returned {values_linear.shape[0]} cells, but the terrain patch contains {patch_meta['cell_count']} cells"
        )
    values_db = linear_to_db(values_linear)
    log_timing("radiomap_finalize", finalize_started_at, cells=patch_meta["cell_count"])

    report(1.0, "Radio map ready")
    log_timing(
        "radiomap_total",
        total_started_at,
        cells=patch_meta["cell_count"],
        max_depth=params["max_depth"],
        samples=params["samples_per_tx"],
    )
    return {
        "metric": params["metric"],
        "unit": "dB",
        "surface": {
            "type": "terrain_patch",
            "center_xy": [float(params["tx_position"][0]), float(params["tx_position"][1])],
            "size": list(map(float, params["surface_size"])),
            "height_offset": float(params["surface_height_offset"]),
            "cell_count": int(patch_meta["cell_count"]),
            "density_level": int(patch_meta["density_level"]),
            "bounds": {
                "min": patch_meta["bounds_min"].astype(float).tolist(),
                "max": patch_meta["bounds_max"].astype(float).tolist(),
            },
        },
        "solver": {
            "base_samples_per_tx": int(params["base_samples_per_tx"]),
            "effective_samples_per_tx": int(params["samples_per_tx"]),
        },
        "range": {
            "min": float(np.min(values_db)),
            "max": float(np.max(values_db)),
        },
        "values": {
            "count": int(values_db.shape[0]),
            "data": values_db.astype(float).tolist(),
        },
        "geometry": {
            "triangle_positions": patch_meta["triangle_positions"].reshape(-1).astype(float).tolist(),
        },
    }
