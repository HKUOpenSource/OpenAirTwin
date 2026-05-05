from __future__ import annotations

from time import perf_counter

import numpy as np

from backend.rt.common import linear_to_db, parse_link_payload, to_numpy
from backend.rt.runtime import log_timing

SPEED_OF_LIGHT_M_PER_S = 299_792_458.0


def _link_dependencies():
    from sionna.rt import InteractionType, PathSolver, Receiver, Transmitter

    return InteractionType, PathSolver, Receiver, Transmitter


def solve_link(
    rt_runtime,
    payload: dict,
    *,
    dependencies=None,
) -> dict:
    InteractionType, PathSolver, Receiver, Transmitter = dependencies or _link_dependencies()

    interaction_labels = {
        int(InteractionType.NONE): "NONE",
        int(InteractionType.SPECULAR): "SPECULAR",
        int(InteractionType.DIFFUSE): "DIFFUSE",
        int(InteractionType.REFRACTION): "REFRACTION",
        int(InteractionType.DIFFRACTION): "DIFFRACTION",
    }

    params = parse_link_payload(payload)
    tx_position = params["tx_position"]
    rx_position = params["rx_position"]
    total_started_at = perf_counter()

    with rt_runtime.lock:
        scene = rt_runtime.scene
        rt_runtime.set_frequency(params["frequency_hz"])
        try:
            scene.add(Transmitter(name="tx_link", position=tx_position, orientation=params["tx_orientation"]))
            scene.add(Receiver(name="rx_link", position=rx_position, orientation=params["rx_orientation"]))
            solver_started_at = perf_counter()
            paths = PathSolver()(
                scene,
                max_depth=params["max_depth"],
                samples_per_src=params["samples_per_src"],
                los=params["los"],
                specular_reflection=params["specular_reflection"],
                diffuse_reflection=params["diffuse_reflection"],
                refraction=params["refraction"],
                synthetic_array=False,
                seed=params["seed"],
            )
            log_timing(
                "link_solver",
                solver_started_at,
                max_depth=params["max_depth"],
                samples=params["samples_per_src"],
            )

            valid = to_numpy(paths.valid).reshape(-1)
            interactions = to_numpy(paths.interactions).reshape(params["max_depth"], -1)
            vertices = to_numpy(paths.vertices).reshape(params["max_depth"], -1, 3)
            tau = to_numpy(paths.tau).reshape(-1)
            theta_t = to_numpy(paths.theta_t).reshape(-1)
            phi_t = to_numpy(paths.phi_t).reshape(-1)
            theta_r = to_numpy(paths.theta_r).reshape(-1)
            phi_r = to_numpy(paths.phi_r).reshape(-1)
            doppler = to_numpy(paths.doppler).reshape(-1)
            a_real, a_imag = paths.a
            a_real = to_numpy(a_real).reshape(-1)
            a_imag = to_numpy(a_imag).reshape(-1)
        finally:
            scene.remove("tx_link")
            scene.remove("rx_link")

    path_count = valid.shape[-1]
    path_records = []
    path_powers_linear: list[float] = []

    for path_index in range(path_count):
        if not bool(valid[path_index]):
            continue

        interaction_chain = interactions[:, path_index]
        interaction_sequence = [
            interaction_labels.get(int(code), f"UNKNOWN_{int(code)}")
            for code in interaction_chain
            if int(code) != int(InteractionType.NONE)
        ]
        power_linear = float(a_real[path_index] ** 2 + a_imag[path_index] ** 2)
        path_powers_linear.append(power_linear)
        power_db = float(linear_to_db(np.array([power_linear]))[0])

        is_los = not interaction_sequence
        interaction_kinds = set(interaction_sequence)
        if is_los:
            path_type = "LOS"
        elif interaction_kinds == {"SPECULAR"}:
            path_type = "SPECULAR"
        elif interaction_kinds == {"REFRACTION"}:
            path_type = "REFRACTION"
        elif interaction_kinds == {"DIFFUSE"}:
            path_type = "DIFFUSE"
        elif interaction_kinds == {"DIFFRACTION"}:
            path_type = "DIFFRACTION"
        else:
            path_type = "MIXED"

        polyline = [list(map(float, tx_position))]
        for depth in range(params["max_depth"]):
            if interaction_chain[depth] != InteractionType.NONE:
                vertex = vertices[depth, path_index].tolist()
                polyline.append([float(vertex[0]), float(vertex[1]), float(vertex[2])])
        polyline.append(list(map(float, rx_position)))

        coefficient_real = float(a_real[path_index])
        coefficient_imag = float(a_imag[path_index])
        coefficient_abs = float(np.hypot(coefficient_real, coefficient_imag))
        coefficient_phase_deg = float(np.degrees(np.arctan2(coefficient_imag, coefficient_real)))
        delay_s = float(tau[path_index])
        departure_zenith_deg = float(np.degrees(theta_t[path_index]))
        departure_azimuth_deg = float(np.degrees(phi_t[path_index]))
        arrival_zenith_deg = float(np.degrees(theta_r[path_index]))
        arrival_azimuth_deg = float(np.degrees(phi_r[path_index]))

        path_records.append(
            {
                "path_index": path_index,
                "type": path_type,
                "polyline": polyline,
                "path_gain_db": power_db,
                "path_gain_linear": power_linear,
                "coefficient_real": coefficient_real,
                "coefficient_imag": coefficient_imag,
                "coefficient_abs": coefficient_abs,
                "coefficient_phase_deg": coefficient_phase_deg,
                "delay_s": delay_s,
                "delay_ns": delay_s * 1e9,
                "path_length_m": delay_s * SPEED_OF_LIGHT_M_PER_S,
                "departure_zenith_deg": departure_zenith_deg,
                "departure_azimuth_deg": departure_azimuth_deg,
                "arrival_zenith_deg": arrival_zenith_deg,
                "arrival_azimuth_deg": arrival_azimuth_deg,
                "doppler_hz": float(doppler[path_index]),
                "interaction_count": len(interaction_sequence),
                "interaction_sequence": interaction_sequence,
            }
        )

    if not path_records:
        log_timing(
            "link_total",
            total_started_at,
            valid_paths=0,
            max_depth=params["max_depth"],
            samples=params["samples_per_src"],
        )
        return {
            "ok": True,
            "summary": {
                "valid_paths": 0,
                "los_paths": 0,
                "received_power_db": None,
                "strongest_path_db": None,
            },
            "paths": [],
        }

    powers_db = linear_to_db(np.asarray(path_powers_linear))
    total_power_db = float(linear_to_db(np.array([np.sum(path_powers_linear)]))[0])
    strongest_path_db = float(np.max(powers_db))
    los_count = sum(1 for path in path_records if path["type"] == "LOS")
    log_timing(
        "link_total",
        total_started_at,
        valid_paths=len(path_records),
        max_depth=params["max_depth"],
        samples=params["samples_per_src"],
    )

    return {
        "ok": True,
        "summary": {
            "valid_paths": len(path_records),
            "los_paths": los_count,
            "received_power_db": total_power_db,
            "strongest_path_db": strongest_path_db,
        },
        "paths": path_records,
    }
