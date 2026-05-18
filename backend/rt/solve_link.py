from __future__ import annotations

from time import perf_counter

import numpy as np

from backend.rt.common import linear_to_db, parse_link_payload, to_numpy
from backend.rt.runtime import log_timing

SPEED_OF_LIGHT_M_PER_S = 299_792_458.0
POWER_POLICY_SUM_OVER_ARRAY_PAIRS = "sum_over_antenna_pairs"


def _link_dependencies():
    from sionna.rt import InteractionType, PathSolver, Receiver, Transmitter

    return InteractionType, PathSolver, Receiver, Transmitter


def _channel_summary(paths, params: dict) -> dict:
    tap_indices = list(range(params["channel_l_min"], params["channel_l_max"] + 1))
    tap_count = len(tap_indices)
    sampling_frequency_hz = float(params["channel_subcarrier_spacing_hz"])
    bandwidth_hz = int(params["channel_fft_size"]) * sampling_frequency_hz

    taps = np.asarray(
        paths.taps(
            bandwidth=bandwidth_hz,
            l_min=params["channel_l_min"],
            l_max=params["channel_l_max"],
            sampling_frequency=sampling_frequency_hz,
            num_time_steps=params["channel_num_time_steps"],
            normalize=False,
            normalize_delays=True,
            out_type="numpy",
        )
    )
    if taps.size == 0:
        tap_power_linear = np.zeros(tap_count, dtype=float)
    elif taps.size % tap_count == 0:
        tap_power_linear = np.sum(np.abs(taps.reshape(-1, tap_count)) ** 2, axis=0)
    else:
        raise ValueError(f"paths.taps returned {taps.size} values for {tap_count} requested taps")

    tap_power_db = linear_to_db(tap_power_linear)
    total_power_linear = float(np.sum(tap_power_linear))
    peak_tap_offset = int(np.argmax(tap_power_linear)) if tap_count else -1

    cir = paths.cir(normalize_delays=True, out_type="numpy")
    coefficients = np.asarray(cir[0] if isinstance(cir, (tuple, list)) and cir else cir)
    coefficient_abs = np.abs(coefficients).reshape(-1)
    if coefficient_abs.size:
        strongest_coefficient_abs = float(np.max(coefficient_abs))
    else:
        strongest_coefficient_abs = 0.0

    return {
        "tap_indices": [int(index) for index in tap_indices],
        "delays_s": [float(index / sampling_frequency_hz) for index in tap_indices],
        "power_db": [float(value) for value in tap_power_db],
        "total_power_db": (
            float(linear_to_db(np.array([total_power_linear]))[0])
            if total_power_linear > 0.0
            else None
        ),
        "peak_tap_index": int(tap_indices[peak_tap_offset]) if peak_tap_offset >= 0 else None,
        "peak_tap_power_db": float(tap_power_db[peak_tap_offset]) if peak_tap_offset >= 0 else None,
        "cir_summary": {
            "coefficient_count": int(coefficient_abs.size),
            "strongest_coefficient_abs": strongest_coefficient_abs,
        },
        "config": {
            "l_min": int(params["channel_l_min"]),
            "l_max": int(params["channel_l_max"]),
            "fft_size": int(params["channel_fft_size"]),
            "subcarrier_spacing_hz": sampling_frequency_hz,
            "bandwidth_hz": float(bandwidth_hz),
            "num_time_steps": int(params["channel_num_time_steps"]),
        },
    }


def _path_tensor(value, *, valid_shape: tuple[int, ...], name: str) -> np.ndarray:
    array = np.asarray(value)
    if array.shape == valid_shape:
        return array
    if array.size == int(np.prod(valid_shape)):
        return array.reshape(valid_shape)
    try:
        return np.broadcast_to(array, valid_shape)
    except ValueError:
        raise ValueError(f"{name} shape {array.shape} is incompatible with paths.valid shape {valid_shape}") from None


def _interaction_tensor(value, *, max_depth: int, valid_shape: tuple[int, ...]) -> np.ndarray:
    target_shape = (max_depth, *valid_shape)
    array = np.asarray(value)
    if array.shape == target_shape:
        return array
    if array.size == int(np.prod(target_shape)):
        return array.reshape(target_shape)
    try:
        return np.broadcast_to(array, target_shape)
    except ValueError:
        raise ValueError(
            f"paths.interactions shape {array.shape} is incompatible with expected shape {target_shape}"
        ) from None


def _vertex_tensor(value, *, max_depth: int, valid_shape: tuple[int, ...]) -> np.ndarray:
    target_shape = (max_depth, *valid_shape, 3)
    array = np.asarray(value)
    if array.shape == target_shape:
        return array
    if array.size == int(np.prod(target_shape)):
        return array.reshape(target_shape)
    try:
        return np.broadcast_to(array, target_shape)
    except ValueError:
        raise ValueError(
            f"paths.vertices shape {array.shape} is incompatible with expected shape {target_shape}"
        ) from None


def _pair_index(flat_index: int, pair_shape: tuple[int, ...]) -> tuple[int, ...]:
    if not pair_shape:
        return ()
    return tuple(int(index) for index in np.unravel_index(flat_index, pair_shape))


def _set_device_velocity(device, velocity: tuple[float, float, float]) -> None:
    try:
        device.velocity = velocity
    except Exception:
        return
    try:
        import drjit as dr

        dr.make_opaque(device.velocity)
    except Exception:
        pass


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
        scene = rt_runtime.require_ready()
        rt_runtime.set_frequency(params["frequency_hz"])
        rt_runtime.set_arrays(tx_array=params["tx_array"], rx_array=params["rx_array"])
        try:
            tx_device = Transmitter(name="tx_link", position=tx_position, orientation=params["tx_orientation"])
            rx_device = Receiver(name="rx_link", position=rx_position, orientation=params["rx_orientation"])
            _set_device_velocity(tx_device, params["tx_velocity"])
            _set_device_velocity(rx_device, params["rx_velocity"])
            scene.add(tx_device)
            scene.add(rx_device)
            solver_started_at = perf_counter()
            paths = PathSolver()(
                scene,
                max_depth=params["max_depth"],
                max_num_paths_per_src=params["max_num_paths_per_src"],
                samples_per_src=params["samples_per_src"],
                synthetic_array=params["synthetic_array"],
                los=params["los"],
                specular_reflection=params["specular_reflection"],
                diffuse_reflection=params["diffuse_reflection"],
                refraction=params["refraction"],
                diffraction=params["diffraction"],
                edge_diffraction=params["edge_diffraction"],
                diffraction_lit_region=params["diffraction_lit_region"],
                seed=params["seed"],
            )
            log_timing(
                "link_solver",
                solver_started_at,
                max_depth=params["max_depth"],
                samples=params["samples_per_src"],
            )

            valid = np.asarray(to_numpy(paths.valid), dtype=bool)
            if valid.ndim == 0:
                valid = valid.reshape(1)
            valid_shape = tuple(int(size) for size in valid.shape)
            interactions = _interaction_tensor(
                to_numpy(paths.interactions),
                max_depth=params["max_depth"],
                valid_shape=valid_shape,
            )
            vertices = _vertex_tensor(
                to_numpy(paths.vertices),
                max_depth=params["max_depth"],
                valid_shape=valid_shape,
            )
            tau = _path_tensor(to_numpy(paths.tau), valid_shape=valid_shape, name="paths.tau")
            theta_t = _path_tensor(to_numpy(paths.theta_t), valid_shape=valid_shape, name="paths.theta_t")
            phi_t = _path_tensor(to_numpy(paths.phi_t), valid_shape=valid_shape, name="paths.phi_t")
            theta_r = _path_tensor(to_numpy(paths.theta_r), valid_shape=valid_shape, name="paths.theta_r")
            phi_r = _path_tensor(to_numpy(paths.phi_r), valid_shape=valid_shape, name="paths.phi_r")
            doppler = _path_tensor(to_numpy(paths.doppler), valid_shape=valid_shape, name="paths.doppler")
            a_real, a_imag = paths.a
            a_real = _path_tensor(to_numpy(a_real), valid_shape=valid_shape, name="paths.a[0]")
            a_imag = _path_tensor(to_numpy(a_imag), valid_shape=valid_shape, name="paths.a[1]")
            channel = _channel_summary(paths, params) if params["compute_taps"] else None
        finally:
            scene.remove("tx_link")
            scene.remove("rx_link")

    pair_shape = valid.shape[:-1]
    path_count = valid.shape[-1]
    path_records = []
    path_powers_linear: list[float] = []
    array_pair_paths = 0

    for path_index in range(path_count):
        valid_pairs = valid[..., path_index].reshape(-1)
        if not np.any(valid_pairs):
            continue

        pair_count = int(np.count_nonzero(valid_pairs))
        array_pair_paths += pair_count
        pair_powers = (
            a_real[..., path_index].reshape(-1) ** 2
            + a_imag[..., path_index].reshape(-1) ** 2
        )
        valid_pair_powers = np.where(valid_pairs, pair_powers, -1.0)
        strongest_pair_flat = int(np.argmax(valid_pair_powers))
        strongest_pair_index = _pair_index(strongest_pair_flat, pair_shape)
        representative_index = (*strongest_pair_index, path_index)

        interaction_chain = interactions[(slice(None), *strongest_pair_index, path_index)]
        interaction_sequence = [
            interaction_labels.get(int(code), f"UNKNOWN_{int(code)}")
            for code in interaction_chain
            if int(code) != int(InteractionType.NONE)
        ]
        power_linear = float(np.sum(np.where(valid_pairs, pair_powers, 0.0)))
        path_powers_linear.append(power_linear)
        power_db = float(linear_to_db(np.array([power_linear]))[0])
        strongest_pair_power_linear = float(max(pair_powers[strongest_pair_flat], 0.0))
        strongest_pair_power_db = float(linear_to_db(np.array([strongest_pair_power_linear]))[0])

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
                vertex = vertices[(depth, *strongest_pair_index, path_index, slice(None))].tolist()
                polyline.append([float(vertex[0]), float(vertex[1]), float(vertex[2])])
        polyline.append(list(map(float, rx_position)))

        coefficient_real = float(a_real[representative_index])
        coefficient_imag = float(a_imag[representative_index])
        coefficient_abs = float(np.hypot(coefficient_real, coefficient_imag))
        coefficient_phase_deg = float(np.degrees(np.arctan2(coefficient_imag, coefficient_real)))
        delay_s = float(tau[representative_index])
        departure_zenith_deg = float(np.degrees(theta_t[representative_index]))
        departure_azimuth_deg = float(np.degrees(phi_t[representative_index]))
        arrival_zenith_deg = float(np.degrees(theta_r[representative_index]))
        arrival_azimuth_deg = float(np.degrees(phi_r[representative_index]))

        path_records.append(
            {
                "path_index": path_index,
                "type": path_type,
                "polyline": polyline,
                "path_gain_db": power_db,
                "path_gain_linear": power_linear,
                "array_pair_count": pair_count,
                "strongest_pair_power_db": strongest_pair_power_db,
                "strongest_pair_power_linear": strongest_pair_power_linear,
                "power_policy": POWER_POLICY_SUM_OVER_ARRAY_PAIRS,
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
                "doppler_hz": float(doppler[representative_index]),
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
        result = {
            "ok": True,
            "summary": {
                "valid_paths": 0,
                "array_pair_paths": 0,
                "los_paths": 0,
                "received_power_db": None,
                "strongest_path_db": None,
            },
            "paths": [],
        }
        if channel is not None:
            result["channel"] = channel
        return result

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

    result = {
        "ok": True,
        "summary": {
            "valid_paths": len(path_records),
            "array_pair_paths": array_pair_paths,
            "los_paths": los_count,
            "received_power_db": total_power_db,
            "strongest_path_db": strongest_path_db,
        },
        "paths": path_records,
    }
    if channel is not None:
        result["channel"] = channel
    return result
