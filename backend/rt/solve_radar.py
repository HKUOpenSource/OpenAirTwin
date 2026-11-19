from __future__ import annotations

import math
from dataclasses import dataclass
from time import perf_counter
from typing import Callable

import numpy as np

from backend.rt.common import linear_to_db, to_numpy
from backend.rt.radar_payload import SPEED_OF_LIGHT_MPS, parse_radar_payload
from backend.rt.radar_scene import (
    RadarSceneBinding,
    RadarSceneDependencies,
    bind_radar_scene,
    capture_radar_scene_snapshot,
)
from backend.rt.runtime import log_timing, require_scene_generation


RADAR_PROPAGATION_SCHEMA_VERSION = 1
RADAR_PATH_CLASSIFICATION_RULE = (
    "target when a SENSING interaction maps to a Radar target; "
    "otherwise direct when there are no active interactions; otherwise clutter"
)
RADAR_RANGE_DEFINITION = "equivalent one-way range: speed_of_light_mps * delay_s / 2"
RADAR_RCS_SAMPLES_PER_POINT = 4096
RADAR_RCS_MAX_LEGS_PER_POINT = 512


@dataclass(frozen=True, slots=True)
class RadarPropagationDependencies:
    path_solver_factory: Callable[[], object]
    rcs_solver_factory: Callable[[], object]
    interaction_type: object
    invalid_shape_id: int
    invalid_primitive_id: int
    scene_dependencies: RadarSceneDependencies | None = None


def _radar_propagation_dependencies() -> RadarPropagationDependencies:
    from sionna.rt import InteractionType, PathSolver
    from sionna.rt.constants import INVALID_PRIMITIVE, INVALID_SHAPE
    from sionna.rt.rcs import RCSSolver

    return RadarPropagationDependencies(
        path_solver_factory=PathSolver,
        rcs_solver_factory=RCSSolver,
        interaction_type=InteractionType,
        invalid_shape_id=int(INVALID_SHAPE),
        invalid_primitive_id=int(INVALID_PRIMITIVE),
    )


def _path_tensor(value, *, valid_shape: tuple[int, ...], name: str) -> np.ndarray:
    array = np.asarray(to_numpy(value))
    if array.shape == valid_shape:
        return array
    if array.size == int(np.prod(valid_shape)):
        return array.reshape(valid_shape)
    if len(valid_shape) == 5 and array.shape == valid_shape[::2]:
        array = array[:, None, :, None, :]
    try:
        return np.broadcast_to(array, valid_shape)
    except ValueError:
        raise ValueError(
            f"{name} shape {array.shape} is incompatible with paths.valid shape {valid_shape}"
        ) from None


def _depth_tensor(
    value,
    *,
    max_depth: int,
    valid_shape: tuple[int, ...],
    name: str,
    trailing_shape: tuple[int, ...] = (),
) -> np.ndarray:
    target_shape = (max_depth, *valid_shape, *trailing_shape)
    array = np.asarray(to_numpy(value))
    if array.shape == target_shape:
        return array
    if array.size == int(np.prod(target_shape)):
        return array.reshape(target_shape)
    if len(valid_shape) == 5 and array.shape == (max_depth, *valid_shape[::2], *trailing_shape):
        array = array[:, :, None, :, None, ...]
    try:
        return np.broadcast_to(array, target_shape)
    except ValueError:
        raise ValueError(f"{name} shape {array.shape} is incompatible with expected shape {target_shape}") from None


def _interaction_labels(interaction_type) -> dict[int, str]:
    return {
        int(interaction_type.NONE): "NONE",
        int(interaction_type.SPECULAR): "SPECULAR",
        int(interaction_type.DIFFUSE): "DIFFUSE",
        int(interaction_type.REFRACTION): "REFRACTION",
        int(interaction_type.DIFFRACTION): "DIFFRACTION",
    }


def _normalize_azimuth_deg(value_rad: float) -> float:
    degrees = math.degrees(float(value_rad))
    normalized = (degrees + 180.0) % 360.0 - 180.0
    return 180.0 if normalized == -180.0 and degrees > 0.0 else normalized


def _normalize_zenith_deg(value_rad: float) -> float:
    return min(180.0, max(0.0, math.degrees(float(value_rad))))


def _path_type(interaction_sequence: list[str]) -> str:
    if not interaction_sequence:
        return "LOS"
    kinds = set(interaction_sequence)
    if len(kinds) == 1:
        return interaction_sequence[0]
    return "MIXED"


def _object_names_by_id(binding: RadarSceneBinding) -> dict[int, str]:
    objects = getattr(binding.scene, "objects", {})
    values = objects.values() if hasattr(objects, "values") else ()
    result: dict[int, str] = {}
    for scene_object in values:
        object_id = getattr(scene_object, "object_id", None)
        name = getattr(scene_object, "name", None)
        if object_id is not None and name is not None:
            result[int(object_id)] = str(name)
    return result


def _classification(target_ids: list[str], interaction_sequence: list[str]) -> str:
    if target_ids:
        return "target"
    if not interaction_sequence:
        return "direct"
    return "clutter"


def _finite_path_values(*values: float) -> bool:
    return all(math.isfinite(float(value)) for value in values)


def _extract_sionna_paths(
    paths,
    *,
    binding: RadarSceneBinding,
    params: dict,
    dependencies: RadarPropagationDependencies,
    sensing_target_object_ids: tuple[int, ...] | None = None,
) -> tuple[list[dict], dict]:
    valid = np.asarray(to_numpy(paths.valid), dtype=bool)
    if valid.ndim == 0:
        valid = valid.reshape(1)
    # Use the native carrier phase for target and background paths alike.
    cir, _ = paths.cir(normalize_delays=False, out_type="numpy")
    coefficient = cir[..., 0]
    if valid.ndim == 3 and coefficient.ndim == 5:
        valid = np.broadcast_to(valid[:, None, :, None, :], coefficient.shape)

    valid_shape = tuple(int(size) for size in valid.shape)
    pair_shape = valid_shape[:-1]
    path_slot_count = valid_shape[-1]
    pair_count = int(np.prod(pair_shape)) if pair_shape else 1
    stats = {
        "valid_tensor_shape": list(valid_shape),
        "array_pair_shape": list(pair_shape),
        "array_pair_count": pair_count,
        "path_slot_count": path_slot_count,
        "valid_slot_count": int(np.count_nonzero(valid)),
        "filtered_nonfinite_path_count": 0,
    }
    if not stats["valid_slot_count"]:
        return [], stats
    max_depth = int(params["solver"]["max_depth"])

    interactions = _depth_tensor(
        paths.interactions,
        max_depth=max_depth,
        valid_shape=valid_shape,
        name="paths.interactions",
    )
    objects = _depth_tensor(
        paths.objects,
        max_depth=max_depth,
        valid_shape=valid_shape,
        name="paths.objects",
    )
    primitives = _depth_tensor(
        paths.primitives,
        max_depth=max_depth,
        valid_shape=valid_shape,
        name="paths.primitives",
    )
    vertices = _depth_tensor(
        paths.vertices,
        max_depth=max_depth,
        valid_shape=valid_shape,
        name="paths.vertices",
        trailing_shape=(3,),
    )
    tau = _path_tensor(paths.tau, valid_shape=valid_shape, name="paths.tau")
    doppler = _path_tensor(paths.doppler, valid_shape=valid_shape, name="paths.doppler")
    theta_t = _path_tensor(paths.theta_t, valid_shape=valid_shape, name="paths.theta_t")
    phi_t = _path_tensor(paths.phi_t, valid_shape=valid_shape, name="paths.phi_t")
    theta_r = _path_tensor(paths.theta_r, valid_shape=valid_shape, name="paths.theta_r")
    phi_r = _path_tensor(paths.phi_r, valid_shape=valid_shape, name="paths.phi_r")
    coefficient = _path_tensor(coefficient, valid_shape=valid_shape, name="paths.cir coefficients")

    labels = _interaction_labels(dependencies.interaction_type)
    is_rcs = sensing_target_object_ids is not None
    if is_rcs:
        labels[int(dependencies.interaction_type.SENSING)] = "SENSING"
    solver_method = "sionna_rcs_solver" if is_rcs else "sionna_path_solver"
    path_id_prefix = "rcs" if is_rcs else "sbr"
    none_code = int(dependencies.interaction_type.NONE)
    object_names = _object_names_by_id(binding)
    tx_position = tuple(float(value) for value in binding.snapshot.platform.tx.position)
    rx_position = tuple(float(value) for value in binding.snapshot.platform.rx.position)
    records: list[dict] = []
    filtered_nonfinite_count = 0

    for path_index in range(path_slot_count):
        for pair_flat_index in range(pair_count):
            pair_index = (
                tuple(int(value) for value in np.unravel_index(pair_flat_index, pair_shape))
                if pair_shape
                else ()
            )
            tensor_index = (*pair_index, path_index)
            if not bool(valid[tensor_index]):
                continue

            coefficient_real = float(coefficient[tensor_index].real)
            coefficient_imag = float(coefficient[tensor_index].imag)
            delay_s = float(tau[tensor_index])
            doppler_hz = float(doppler[tensor_index])
            departure_zenith_deg = _normalize_zenith_deg(float(theta_t[tensor_index]))
            departure_azimuth_deg = _normalize_azimuth_deg(float(phi_t[tensor_index]))
            arrival_zenith_deg = _normalize_zenith_deg(float(theta_r[tensor_index]))
            arrival_azimuth_deg = _normalize_azimuth_deg(float(phi_r[tensor_index]))
            coefficient_abs = math.hypot(coefficient_real, coefficient_imag)
            coefficient_phase_rad = math.atan2(coefficient_imag, coefficient_real)

            if delay_s < 0.0 or not _finite_path_values(
                coefficient_real,
                coefficient_imag,
                coefficient_abs,
                coefficient_phase_rad,
                delay_s,
                doppler_hz,
                departure_zenith_deg,
                departure_azimuth_deg,
                arrival_zenith_deg,
                arrival_azimuth_deg,
            ):
                filtered_nonfinite_count += 1
                continue

            interaction_sequence: list[str] = []
            object_chain: list[dict] = []
            target_ids: list[str] = []
            polyline = [list(tx_position)]
            nonfinite_vertex = False
            depth_index = (slice(None), *pair_index, path_index)
            for depth, raw_code in enumerate(np.asarray(interactions[depth_index]).reshape(max_depth)):
                code = int(raw_code)
                if code == none_code:
                    continue
                interaction = labels.get(code, f"UNKNOWN_{code}")
                vertex = [float(value) for value in vertices[(depth, *pair_index, path_index, slice(None))]]
                if not _finite_path_values(*vertex):
                    nonfinite_vertex = True
                    break
                object_id_raw = int(objects[(depth, *pair_index, path_index)])
                primitive_id_raw = int(primitives[(depth, *pair_index, path_index)])
                object_id = None if object_id_raw == dependencies.invalid_shape_id else object_id_raw
                primitive_id = (
                    None if primitive_id_raw == dependencies.invalid_primitive_id else primitive_id_raw
                )
                target_id = None
                if sensing_target_object_ids is not None and interaction == "SENSING":
                    # Sionna overloads objects/primitives for sensing interactions.
                    if not 0 <= object_id_raw < len(sensing_target_object_ids):
                        raise ValueError("Sionna sensing path has an invalid target index")
                    object_id = sensing_target_object_ids[object_id_raw]
                    primitive_id = None
                    target_id = binding.target_id_for_sionna_object(object_id)
                if target_id is not None and target_id not in target_ids:
                    target_ids.append(target_id)
                interaction_sequence.append(interaction)
                polyline.append(vertex)
                object_chain.append(
                    {
                        "depth": depth,
                        "interaction": interaction,
                        "object_id": object_id,
                        "object_name": object_names.get(object_id) if object_id is not None else None,
                        "primitive_id": primitive_id,
                        "target_id": target_id,
                        "vertex_m": vertex,
                    }
                )
            if nonfinite_vertex:
                filtered_nonfinite_count += 1
                continue
            polyline.append(list(rx_position))

            path_gain_linear = coefficient_abs * coefficient_abs
            path_gain_db = float(linear_to_db(np.asarray([path_gain_linear]))[0])
            path_length_m = delay_s * SPEED_OF_LIGHT_MPS
            classification = _classification(target_ids, interaction_sequence)
            records.append(
                {
                    "path_id": f"{path_id_prefix}-{path_index:06d}-{pair_flat_index:06d}",
                    "solver_method": solver_method,
                    "path_index": path_index,
                    "array_pair_index": pair_flat_index,
                    "array_pair_tensor_index": list(pair_index),
                    "array_pair_count": 1,
                    "type": _path_type(interaction_sequence),
                    "classification": classification,
                    "target_ids": target_ids,
                    "interaction_sequence": interaction_sequence,
                    "object_chain": object_chain,
                    "polyline": polyline,
                    "coefficient_real": coefficient_real,
                    "coefficient_imag": coefficient_imag,
                    "coefficient_abs": coefficient_abs,
                    "coefficient_phase_rad": coefficient_phase_rad,
                    "coefficient_phase_deg": math.degrees(coefficient_phase_rad),
                    "path_gain_linear": path_gain_linear,
                    "path_gain_db": path_gain_db,
                    "strongest_pair_power_linear": path_gain_linear,
                    "strongest_pair_power_db": path_gain_db,
                    "delay_s": delay_s,
                    "delay_ns": delay_s * 1e9,
                    "path_length_m": path_length_m,
                    "equivalent_range_m": path_length_m / 2.0,
                    "doppler_hz": doppler_hz,
                    "departure_azimuth_deg": departure_azimuth_deg,
                    "departure_zenith_deg": departure_zenith_deg,
                    "arrival_azimuth_deg": arrival_azimuth_deg,
                    "arrival_zenith_deg": arrival_zenith_deg,
                    "signal_included": True,
                    "coefficient_source": solver_method,
                }
            )

    stats["filtered_nonfinite_path_count"] = filtered_nonfinite_count
    return records, stats


def _solver_kwargs(params: dict) -> dict:
    solver = params["solver"]
    return {
        "max_depth": solver["max_depth"],
        "max_num_paths_per_src": solver["max_num_paths_per_src"],
        "samples_per_src": solver["samples_per_src"],
        "synthetic_array": solver["synthetic_array"],
        "los": solver["los"],
        "specular_reflection": solver["specular_reflection"],
        "diffuse_reflection": solver["diffuse_reflection"],
        "refraction": solver["refraction"],
        "diffraction": solver["diffraction"],
        "edge_diffraction": solver["edge_diffraction"],
        "diffraction_lit_region": solver["diffraction_lit_region"],
        "seed": solver["seed"],
    }


def solve_radar_propagation(
    rt_runtime,
    payload: dict,
    *,
    dependencies: RadarPropagationDependencies | None = None,
    expected_scene_generation: int | None = None,
    progress_cb: Callable[[float, str], None] | None = None,
    cancel_check: Callable[[], None] | None = None,
) -> dict:
    """Compute Sionna background and native sensing paths for one scene snapshot."""
    if cancel_check is not None:
        cancel_check()
    if progress_cb is not None:
        progress_cb(0.03, "Validating Radar request")
    started_at = perf_counter()
    params = parse_radar_payload(payload)
    snapshot = capture_radar_scene_snapshot(
        rt_runtime, payload, expected_scene_generation=expected_scene_generation
    )
    deps = dependencies or _radar_propagation_dependencies()
    solver = _solver_kwargs(params)
    sensing_solver = {
        "max_depth": solver["max_depth"],
        "buffer_size_per_sp": min(solver["max_num_paths_per_src"], RADAR_RCS_MAX_LEGS_PER_POINT),
        "samples_per_sp": min(solver["samples_per_src"], RADAR_RCS_SAMPLES_PER_POINT),
        "synthetic_array": solver["synthetic_array"],
        "los": solver["los"],
        "specular_reflection": solver["specular_reflection"],
        "refraction": solver["refraction"],
        "seed": solver["seed"],
    }
    if progress_cb is not None:
        progress_cb(0.08, "Binding Radar targets to RT scene")

    with bind_radar_scene(
        rt_runtime,
        snapshot,
        dependencies=deps.scene_dependencies,
        environment_scattering_enabled=solver["diffuse_reflection"],
    ) as binding:
        if cancel_check is not None:
            cancel_check()
        if progress_cb is not None:
            progress_cb(0.15, "Solving Radar background paths")
        clutter_model = binding.clutter_model
        target_object_ids = dict(binding.target_id_to_sionna_object_id)
        background_started_at = perf_counter()
        paths = deps.path_solver_factory()(binding.scene, **solver)
        if cancel_check is not None:
            cancel_check()
        records, background_stats = _extract_sionna_paths(
            paths, binding=binding, params=params, dependencies=deps,
        )
        del paths
        background_ms = (perf_counter() - background_started_at) * 1_000.0

        sensing_stats = None
        sensing_ms = 0.0
        if snapshot.targets:
            if cancel_check is not None:
                cancel_check()
            if progress_cb is not None:
                progress_cb(0.42, "Solving Radar target echoes")
            sensing_started_at = perf_counter()
            paths = deps.rcs_solver_factory()(binding.scene, **sensing_solver)
            if cancel_check is not None:
                cancel_check()
            # RCSSolver numbers targets in the order returned by the scene.
            object_ids = tuple(int(target.object_id) for target in binding.scene.sensing_targets.values())
            echoes, sensing_stats = _extract_sionna_paths(
                paths,
                binding=binding,
                params=params,
                dependencies=deps,
                sensing_target_object_ids=object_ids,
            )
            del paths
            records.extend(echoes)
            sensing_ms = (perf_counter() - sensing_started_at) * 1_000.0

    if cancel_check is not None:
        cancel_check()
    require_scene_generation(rt_runtime, snapshot.scene_generation)
    if progress_cb is not None:
        progress_cb(0.62, "Radar propagation complete")

    classification_counts = dict.fromkeys(("target", "clutter", "direct"), 0)
    representative_echoes: dict[str, dict] = {}
    near_platform_clutter_count = 0
    for record in records:
        classification = record["classification"]
        classification_counts[classification] += 1
        if classification == "target":
            for target_id in record["target_ids"]:
                current = representative_echoes.get(target_id)
                # Prefer a direct echo when reporting whether the target is visible.
                if current is None or record["interaction_sequence"] == ["SENSING"]:
                    representative_echoes[target_id] = record
        elif classification == "clutter" and len(record["polyline"]) >= 3:
            vertex = record["polyline"][1]
            if min(math.dist(vertex, snapshot.platform.tx.position), math.dist(vertex, snapshot.platform.rx.position)) < 5.0:
                near_platform_clutter_count += 1

    warnings = []
    if snapshot.platform.mode == "bistatic" and classification_counts["direct"] == 0:
        warnings.append("No direct Tx-Rx path was found; verify platform line of sight")
    if near_platform_clutter_count:
        warnings.append(f"{near_platform_clutter_count} clutter paths interact within 5 m of the platform")
    targets = []
    for target in snapshot.targets:
        data = target.as_dict()
        echo = representative_echoes.get(target.id)
        if echo is None:
            # A bounded search without an echo does not establish occlusion.
            warnings.append(f"No simulated echo was found for target {target.id}")
        else:
            interactions = echo["interaction_sequence"]
            sensing_depth = interactions.index("SENSING")
            data["observability"] = {
                "status": "direct" if len(interactions) == 1 else "multipath",
                "tx_leg": {"status": "clear" if sensing_depth == 0 else "unknown"},
                "rx_leg": {"status": "clear" if sensing_depth == len(interactions) - 1 else "unknown"},
            }
        targets.append(data)

    total_power = sum(record["path_gain_linear"] for record in records)
    total_runtime_ms = (perf_counter() - started_at) * 1_000.0
    log_timing("radar_propagation_total", started_at, valid_paths=len(records), target_paths=classification_counts["target"])
    return {
        "ok": True,
        "schema_version": RADAR_PROPAGATION_SCHEMA_VERSION,
        "scene_generation": snapshot.scene_generation,
        "scene_fingerprint": snapshot.fingerprint,
        "classification_rule": RADAR_PATH_CLASSIFICATION_RULE,
        "range_definition": RADAR_RANGE_DEFINITION,
        "radar": {
            "mode": snapshot.platform.mode,
            "tx_position_m": list(snapshot.platform.tx.position),
            "rx_position_m": list(snapshot.platform.rx.position),
            "carrier_frequency_hz": snapshot.platform.carrier_frequency_hz,
            "clutter_model": clutter_model,
        },
        "targets": targets,
        "target_object_ids": target_object_ids,
        "solver": solver,
        "sensing_solver": sensing_solver,
        "summary": {
            "valid_paths": len(records),
            "raw_valid_paths": len(records),
            "display_paths": len(records),
            "deduplicated_paths": 0,
            "array_pair_paths": len(records),
            "los_paths": classification_counts["direct"],
            "received_power_db": float(linear_to_db(np.asarray([total_power]))[0]) if records else None,
            "strongest_path_db": max((record["path_gain_db"] for record in records), default=None),
            "target_path_count": classification_counts["target"],
            "clutter_path_count": classification_counts["clutter"],
            "direct_path_count": classification_counts["direct"],
            "sionna_path_count": len(records),
            "filtered_nonfinite_path_count": background_stats["filtered_nonfinite_path_count"]
            + (sensing_stats["filtered_nonfinite_path_count"] if sensing_stats is not None else 0),
        },
        "tensor_statistics": {"background": background_stats, "sensing": sensing_stats},
        "timing": {
            "background_runtime_ms": background_ms,
            "sensing_runtime_ms": sensing_ms,
            "total_runtime_ms": total_runtime_ms,
        },
        "scene_health": {
            "request_fingerprint": snapshot.fingerprint,
            "direct_path_available": classification_counts["direct"] > 0,
            "near_platform_clutter_path_count": near_platform_clutter_count,
            "warnings": warnings,
        },
        "paths": records,
    }
