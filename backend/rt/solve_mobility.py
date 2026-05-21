from __future__ import annotations

import math
from time import perf_counter

from backend.rt.common import parse_mobility_payload
from backend.rt.runtime import log_timing
from backend.rt.solve_link import solve_link


def _finite_values(values: list[float | None]) -> list[float]:
    finite_values = []
    for value in values:
        if value is None:
            continue
        parsed = float(value)
        if math.isfinite(parsed):
            finite_values.append(parsed)
    return finite_values


def _max_abs_doppler(paths: list[dict]) -> float | None:
    values = [
        abs(float(path["doppler_hz"]))
        for path in paths
        if isinstance(path.get("doppler_hz"), (int, float)) and math.isfinite(float(path["doppler_hz"]))
    ]
    return max(values) if values else None


def _link_payload_for_step(params: dict, sample: dict) -> dict:
    return {
        "tx": {
            "position": params["tx_position"],
            "orientation": params["tx_orientation"],
            "velocity": params["tx_velocity"],
        },
        "rx": {
            "position": sample["position"],
            "orientation": params["rx_orientation"],
            "velocity": sample["velocity"],
        },
        "solver": {
            "frequency_hz": params["frequency_hz"],
            "max_depth": params["max_depth"],
            "samples_per_src": params["samples_per_src"],
            "max_num_paths_per_src": params["max_num_paths_per_src"],
            "synthetic_array": params["synthetic_array"],
            "los": params["los"],
            "specular_reflection": params["specular_reflection"],
            "diffuse_reflection": params["diffuse_reflection"],
            "refraction": params["refraction"],
            "diffraction": params["diffraction"],
            "edge_diffraction": params["edge_diffraction"],
            "diffraction_lit_region": params["diffraction_lit_region"],
            "seed": params["seed"],
            "tx_array": params["tx_array"],
            "rx_array": params["rx_array"],
        },
        "channel": {
            "compute_taps": params["compute_taps"],
            "l_min": params["channel_l_min"],
            "l_max": params["channel_l_max"],
            "fft_size": params["channel_fft_size"],
            "subcarrier_spacing_hz": params["channel_subcarrier_spacing_hz"],
            "num_time_steps": params["channel_num_time_steps"],
        },
    }


def solve_mobility(
    rt_runtime,
    payload: dict,
    *,
    dependencies=None,
    progress_cb=None,
    expected_scene_generation: int | None = None,
) -> dict:
    params = parse_mobility_payload(payload)
    trajectory = params["rx_trajectory"]
    samples = trajectory["samples"]
    total_started_at = perf_counter()

    result_samples = []
    series = {
        "time_s": [],
        "distance_m": [],
        "received_power_db": [],
        "valid_paths": [],
        "strongest_path_db": [],
        "max_abs_doppler_hz": [],
        "peak_tap_power_db": [],
    }

    for sample in samples:
        step_index = sample["step_index"]
        if progress_cb is not None:
            progress_cb(
                0.02 + (0.96 * step_index / max(len(samples), 1)),
                f"Solving mobility step {step_index + 1}/{len(samples)}",
            )

        link_result = solve_link(
            rt_runtime,
            _link_payload_for_step(params, sample),
            dependencies=dependencies,
            expected_scene_generation=expected_scene_generation,
        )
        step_summary = link_result["summary"]
        paths = link_result.get("paths", [])
        channel = link_result.get("channel")
        max_abs_doppler = _max_abs_doppler(paths)
        peak_tap_power = None if channel is None else channel.get("peak_tap_power_db")

        result_samples.append(
            {
                "step_index": int(step_index),
                "time_s": sample["time_s"],
                "distance_m": sample["distance_m"],
                "rx_position": list(sample["position"]),
                "rx_velocity": list(sample["velocity"]),
                "summary": step_summary,
                "paths": paths,
                **({"channel": channel} if channel is not None else {}),
            }
        )
        series["time_s"].append(sample["time_s"])
        series["distance_m"].append(sample["distance_m"])
        series["received_power_db"].append(step_summary.get("received_power_db"))
        series["valid_paths"].append(int(step_summary.get("valid_paths", 0)))
        series["strongest_path_db"].append(step_summary.get("strongest_path_db"))
        series["max_abs_doppler_hz"].append(max_abs_doppler)
        series["peak_tap_power_db"].append(peak_tap_power)

    received_powers = _finite_values(series["received_power_db"])
    dopplers = _finite_values(series["max_abs_doppler_hz"])
    summary = {
        "step_count": len(result_samples),
        "duration_s": trajectory["duration_s"],
        "distance_m": trajectory["total_distance_m"],
        "velocity_mps": trajectory["velocity_mps"],
        "time_step_s": trajectory["time_step_s"],
        "max_steps": trajectory["max_steps"],
        "min_received_power_db": min(received_powers) if received_powers else None,
        "max_received_power_db": max(received_powers) if received_powers else None,
        "max_abs_doppler_hz": max(dopplers) if dopplers else None,
    }
    log_timing(
        "mobility_total",
        total_started_at,
        steps=len(result_samples),
        distance=f"{summary['distance_m']:.2f}m",
    )

    return {
        "ok": True,
        "summary": summary,
        "series": series,
        "samples": result_samples,
        "trajectory": {
            "points": [list(point) for point in trajectory["points"]],
            "velocity_mps": trajectory["velocity_mps"],
            "time_step_s": trajectory["time_step_s"],
            "max_steps": trajectory["max_steps"],
        },
    }
