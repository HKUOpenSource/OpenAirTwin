from __future__ import annotations

import math
from dataclasses import dataclass
from time import perf_counter
from typing import Callable

import numpy as np

from backend.rt.common import linear_to_db, to_numpy
from backend.rt.radar_assets import radar_asset_by_id
from backend.rt.radar_payload import SPEED_OF_LIGHT_MPS, parse_radar_payload
from backend.rt.radar_scene import (
    RADAR_CLUTTER_DIRECTIVE_ALPHA_R,
    RADAR_CLUTTER_MODEL_METHOD,
    RADAR_CLUTTER_MODEL_PRESET,
    RADAR_CLUTTER_SCATTERING_COEFFICIENT,
    RadarSceneBinding,
    RadarSceneDependencies,
    bind_radar_scene,
    capture_radar_scene_snapshot,
)
from backend.rt.radar_small_target import (
    RADAR_SMALL_TARGET_MAX_SAMPLES_PER_SRC,
    RadarSmallTargetScene,
    inspect_target_visibility,
    solve_target_directed_scatter,
)
from backend.rt.runtime import log_timing


RADAR_PROPAGATION_SCHEMA_VERSION = 1
RADAR_PATH_CLASSIFICATION_RULE = (
    "target when any active interaction object maps to a Radar target; "
    "otherwise direct when there are no active interactions; otherwise clutter"
)
RADAR_RANGE_DEFINITION = "equivalent one-way range: speed_of_light_mps * delay_s / 2"
RADAR_TARGET_FALLBACK_METHOD = "deterministic_target_scatter"


@dataclass(frozen=True, slots=True)
class RadarPropagationDependencies:
    path_solver_factory: Callable[[], object]
    interaction_type: object
    invalid_shape_id: int
    invalid_primitive_id: int
    scene_dependencies: RadarSceneDependencies | None = None
    directed_scatter_solver: Callable[..., dict | None] = solve_target_directed_scatter
    visibility_inspector: Callable[[RadarSmallTargetScene], dict] | None = None


def _radar_propagation_dependencies() -> RadarPropagationDependencies:
    from sionna.rt import InteractionType, PathSolver
    from sionna.rt.constants import INVALID_PRIMITIVE, INVALID_SHAPE

    return RadarPropagationDependencies(
        path_solver_factory=PathSolver,
        interaction_type=InteractionType,
        invalid_shape_id=int(INVALID_SHAPE),
        invalid_primitive_id=int(INVALID_PRIMITIVE),
        visibility_inspector=inspect_target_visibility,
    )


def _path_tensor(value, *, valid_shape: tuple[int, ...], name: str) -> np.ndarray:
    array = np.asarray(to_numpy(value))
    if array.shape == valid_shape:
        return array
    if array.size == int(np.prod(valid_shape)):
        return array.reshape(valid_shape)
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


def _direction_angles(direction: tuple[float, float, float]) -> tuple[float, float]:
    length = math.sqrt(sum(component * component for component in direction))
    if length <= 0.0:
        raise ValueError("Radar path direction must have positive length")
    unit = tuple(component / length for component in direction)
    azimuth_deg = _normalize_azimuth_deg(math.atan2(unit[1], unit[0]))
    zenith_deg = _normalize_zenith_deg(math.acos(min(1.0, max(-1.0, unit[2]))))
    return azimuth_deg, zenith_deg


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
) -> tuple[list[dict], dict]:
    valid = np.asarray(to_numpy(paths.valid), dtype=bool)
    if valid.ndim == 0:
        valid = valid.reshape(1)
    valid_shape = tuple(int(size) for size in valid.shape)
    if not valid_shape:
        raise ValueError("paths.valid must contain a path dimension")
    pair_shape = valid_shape[:-1]
    path_slot_count = valid_shape[-1]
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
    coefficient = paths.a
    if not isinstance(coefficient, (tuple, list)) or len(coefficient) != 2:
        raise ValueError("paths.a must contain real and imaginary coefficient tensors")
    a_real = _path_tensor(coefficient[0], valid_shape=valid_shape, name="paths.a[0]")
    a_imag = _path_tensor(coefficient[1], valid_shape=valid_shape, name="paths.a[1]")

    labels = _interaction_labels(dependencies.interaction_type)
    none_code = int(dependencies.interaction_type.NONE)
    object_names = _object_names_by_id(binding)
    tx_position = tuple(float(value) for value in binding.snapshot.platform.tx.position)
    rx_position = tuple(float(value) for value in binding.snapshot.platform.rx.position)
    pair_count = int(np.prod(pair_shape)) if pair_shape else 1
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

            coefficient_real = float(a_real[tensor_index])
            coefficient_imag = float(a_imag[tensor_index])
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
                target_id = binding.target_id_for_sionna_object(object_id) if object_id is not None else None
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
                    "path_id": f"sbr-{path_index:06d}-{pair_flat_index:06d}",
                    "solver_method": "sionna_path_solver",
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
                    "coefficient_source": "sionna_path_solver",
                }
            )

    return records, {
        "valid_tensor_shape": list(valid_shape),
        "array_pair_shape": list(pair_shape),
        "array_pair_count": pair_count,
        "path_slot_count": path_slot_count,
        "valid_slot_count": int(np.count_nonzero(valid)),
        "filtered_nonfinite_path_count": filtered_nonfinite_count,
    }


def _deterministic_target_record(
    binding: RadarSceneBinding,
    target_index: int,
    *,
    params: dict,
    dependencies: RadarPropagationDependencies,
) -> dict | None:
    target = binding.snapshot.targets[target_index]
    validation_scene = _target_validation_scene(binding, target_index)
    solver = params["solver"]
    scatter = dependencies.directed_scatter_solver(
        validation_scene,
        seed=int(solver["seed"]),
        sample_budget=min(
            int(solver["samples_per_src"]),
            RADAR_SMALL_TARGET_MAX_SAMPLES_PER_SRC,
        ),
        effective_rcs_m2=target.effective_rcs_m2,
    )
    if scatter is None:
        return None

    tx = target.position
    tx_origin = binding.snapshot.platform.tx.position
    rx = binding.snapshot.platform.rx.position
    departure_direction = tuple(tx[index] - tx_origin[index] for index in range(3))
    arrival_direction = tuple(rx[index] - tx[index] for index in range(3))
    try:
        departure_azimuth_deg, departure_zenith_deg = _direction_angles(departure_direction)
        arrival_azimuth_deg, arrival_zenith_deg = _direction_angles(arrival_direction)
    except ValueError:
        return None

    delay_s = float(scatter["delay_s"])
    path_gain_linear = float(scatter["power_gain_linear"])
    coefficient_abs = math.sqrt(path_gain_linear)
    phase_rad = math.remainder(
        -2.0 * math.pi * binding.snapshot.platform.carrier_frequency_hz * delay_s,
        2.0 * math.pi,
    )
    coefficient_real = coefficient_abs * math.cos(phase_rad)
    coefficient_imag = coefficient_abs * math.sin(phase_rad)
    target_object_id = int(scatter["target_object_id"])
    hit_proof = dict(scatter["hit_proof"])
    vertex = list(target.position)
    path_gain_db = float(linear_to_db(np.asarray([path_gain_linear]))[0])
    return {
        "path_id": f"target-directed-{target_index:06d}",
        "solver_method": RADAR_TARGET_FALLBACK_METHOD,
        "path_index": None,
        "array_pair_index": None,
        "array_pair_tensor_index": [],
        "array_pair_count": 1,
        "array_pair_model": "device_phase_center",
        "type": "TARGET_SCATTER",
        "classification": "target",
        "target_ids": [target.id],
        "interaction_sequence": ["DETERMINISTIC_TARGET_SCATTER"],
        "object_chain": [
            {
                "depth": 0,
                "interaction": "DETERMINISTIC_TARGET_SCATTER",
                "object_id": target_object_id,
                "object_name": target.sionna_object_name,
                "primitive_id": None,
                "target_id": target.id,
                "vertex_m": vertex,
            }
        ],
        "hit_proof": hit_proof,
        "polyline": [list(tx_origin), vertex, list(rx)],
        "coefficient_real": coefficient_real,
        "coefficient_imag": coefficient_imag,
        "coefficient_abs": coefficient_abs,
        "coefficient_phase_rad": phase_rad,
        "coefficient_phase_deg": math.degrees(phase_rad),
        "path_gain_linear": path_gain_linear,
        "path_gain_db": path_gain_db,
        "strongest_pair_power_linear": path_gain_linear,
        "strongest_pair_power_db": path_gain_db,
        "delay_s": delay_s,
        "delay_ns": delay_s * 1e9,
        "path_length_m": float(scatter["path_length_m"]),
        "equivalent_range_m": float(scatter["equivalent_range_m"]),
        "doppler_hz": float(scatter["doppler_hz"]),
        "departure_azimuth_deg": departure_azimuth_deg,
        "departure_zenith_deg": departure_zenith_deg,
        "arrival_azimuth_deg": arrival_azimuth_deg,
        "arrival_zenith_deg": arrival_zenith_deg,
        "effective_rcs_m2": target.effective_rcs_m2,
        "signal_included": True,
        "coefficient_source": "effective_rcs_radar_equation",
    }


def _target_validation_scene(binding: RadarSceneBinding, target_index: int) -> RadarSmallTargetScene:
    target = binding.snapshot.targets[target_index]
    return RadarSmallTargetScene(
        scene=binding.scene,
        asset_id=target.asset_id,
        asset=radar_asset_by_id(target.asset_id),
        target_object=binding.target_objects[target_index],
        target_position_m=target.position,
        target_velocity_mps=target.velocity,
        tx_position_m=binding.snapshot.platform.tx.position,
        rx_position_m=binding.snapshot.platform.rx.position,
        mode=binding.snapshot.platform.mode,
        carrier_frequency_hz=binding.snapshot.platform.carrier_frequency_hz,
    )


def _scale_sbr_target_records(records: list[dict], target) -> None:
    """Make the effective RCS control SBR target amplitudes reproducibly."""

    default_rcs = float(radar_asset_by_id(target.asset_id)["default_effective_rcs_m2"])
    amplitude_scale = math.sqrt(float(target.effective_rcs_m2) / default_rcs)
    power_scale = amplitude_scale * amplitude_scale
    for record in records:
        if list(record.get("target_ids", [])) != [target.id]:
            record["signal_included"] = False
            record["coefficient_source"] = "multi_target_geometry_only"
            continue
        record["coefficient_real"] *= amplitude_scale
        record["coefficient_imag"] *= amplitude_scale
        record["coefficient_abs"] *= amplitude_scale
        record["path_gain_linear"] *= power_scale
        record["strongest_pair_power_linear"] *= power_scale
        record["path_gain_db"] = float(linear_to_db(np.asarray([record["path_gain_linear"]]))[0])
        record["strongest_pair_power_db"] = record["path_gain_db"]
        record["effective_rcs_m2"] = float(target.effective_rcs_m2)
        record["coefficient_source"] = "sionna_scaled_by_effective_rcs"


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
    """Compute independent, unmerged Radar propagation paths for one scene snapshot."""

    if cancel_check is not None:
        cancel_check()
    if progress_cb is not None:
        progress_cb(0.03, "Validating Radar request")
    deps = dependencies or _radar_propagation_dependencies()
    params = parse_radar_payload(payload)
    snapshot = capture_radar_scene_snapshot(
        rt_runtime,
        payload,
        expected_scene_generation=expected_scene_generation,
    )
    total_started_at = perf_counter()
    kwargs = _solver_kwargs(params)
    if progress_cb is not None:
        progress_cb(0.08, "Binding Radar targets to RT scene")

    with bind_radar_scene(
        rt_runtime,
        snapshot,
        dependencies=deps.scene_dependencies,
        environment_scattering_enabled=bool(params["solver"]["diffuse_reflection"]),
    ) as binding:
        clutter_model = {
            "method": RADAR_CLUTTER_MODEL_METHOD,
            "preset": RADAR_CLUTTER_MODEL_PRESET,
            "enabled": bool(params["solver"]["diffuse_reflection"]),
            "calibrated": False,
            "scattering_coefficient": RADAR_CLUTTER_SCATTERING_COEFFICIENT,
            "scattering_pattern": "directive",
            "directive_alpha_r": RADAR_CLUTTER_DIRECTIVE_ALPHA_R,
            "environment_material_count": binding.environment_material_count,
            "material_profile_counts": dict(binding.environment_material_profile_counts),
        }
        if cancel_check is not None:
            cancel_check()
        if progress_cb is not None:
            progress_cb(0.15, "Solving Radar propagation paths")
        solver_started_at = perf_counter()
        sionna_paths = deps.path_solver_factory()(binding.scene, **kwargs)
        if cancel_check is not None:
            cancel_check()
        solver_runtime_ms = (perf_counter() - solver_started_at) * 1_000.0
        log_timing(
            "radar_propagation_solver",
            solver_started_at,
            max_depth=kwargs["max_depth"],
            samples=kwargs["samples_per_src"],
        )
        records, tensor_stats = _extract_sionna_paths(
            sionna_paths,
            binding=binding,
            params=params,
            dependencies=deps,
        )
        if cancel_check is not None:
            cancel_check()
        if progress_cb is not None:
            progress_cb(0.50, "Classifying target and clutter paths")

        directed_started_at = perf_counter()
        directed_attempt_count = 0
        replaced_sbr_target_path_count = 0
        target_observability: dict[str, dict] = {}
        object_names = _object_names_by_id(binding)
        for target_index, target in enumerate(snapshot.targets):
            if cancel_check is not None:
                cancel_check()
            directed_attempt_count += 1
            validation_scene = _target_validation_scene(binding, target_index)
            visibility = None
            if deps.visibility_inspector is not None:
                visibility = deps.visibility_inspector(validation_scene)
            record = _deterministic_target_record(
                binding,
                target_index,
                params=params,
                dependencies=deps,
            )
            if record is not None:
                replaced = [
                    existing
                    for existing in records
                    if existing.get("classification") == "target"
                    and target.id in existing.get("target_ids", [])
                ]
                if replaced:
                    replaced_ids = {id(existing) for existing in replaced}
                    records = [existing for existing in records if id(existing) not in replaced_ids]
                    replaced_sbr_target_path_count += len(replaced)
                records.append(record)
                status = "direct"
            else:
                target_sbr_records = [
                    existing
                    for existing in records
                    if existing.get("classification") == "target"
                    and target.id in existing.get("target_ids", [])
                ]
                if target_sbr_records:
                    _scale_sbr_target_records(target_sbr_records, target)
                    status = "multipath"
                else:
                    status = "blocked"

            if visibility is None:
                visibility = {
                    "status": status,
                    "tx_leg": {"status": "unknown", "object_id": None, "surface_point_m": None},
                    "rx_leg": {"status": "unknown", "object_id": None, "surface_point_m": None},
                }
            visibility = dict(visibility)
            visibility["status"] = status
            for leg_name in ("tx_leg", "rx_leg"):
                leg = dict(visibility.get(leg_name) or {})
                object_id = leg.get("object_id")
                leg["object_name"] = object_names.get(int(object_id)) if object_id is not None else None
                visibility[leg_name] = leg
            target_observability[target.id] = visibility
        directed_runtime_ms = (perf_counter() - directed_started_at) * 1_000.0
        target_object_ids = {
            target_id: int(object_id)
            for target_id, object_id in binding.target_id_to_sionna_object_id.items()
        }

    if cancel_check is not None:
        cancel_check()
    if progress_cb is not None:
        progress_cb(0.62, "Radar propagation complete")

    classification_counts = {
        name: sum(1 for record in records if record["classification"] == name)
        for name in ("target", "clutter", "direct")
    }
    near_platform_clutter_count = 0
    for record in records:
        if record.get("classification") != "clutter" or len(record.get("polyline", [])) < 3:
            continue
        vertex = record["polyline"][1]
        if min(math.dist(vertex, snapshot.platform.tx.position), math.dist(vertex, snapshot.platform.rx.position)) < 5.0:
            near_platform_clutter_count += 1
    warnings: list[str] = []
    if snapshot.platform.mode == "bistatic" and classification_counts["direct"] == 0:
        warnings.append("No direct Tx-Rx path was found; verify platform line of sight")
    if near_platform_clutter_count:
        warnings.append(f"{near_platform_clutter_count} clutter paths interact within 5 m of the platform")
    for target in snapshot.targets:
        status = target_observability[target.id]["status"]
        if status == "blocked":
            warnings.append(f"Target {target.id} is blocked and has no simulated echo")
    powers = np.asarray([record["path_gain_linear"] for record in records], dtype=float)
    received_power_db = (
        float(linear_to_db(np.asarray([float(np.sum(powers))]))[0])
        if powers.size
        else None
    )
    strongest_path_db = (
        float(max(record["path_gain_db"] for record in records))
        if records
        else None
    )
    deterministic_count = sum(
        1 for record in records if record["solver_method"] == RADAR_TARGET_FALLBACK_METHOD
    )
    total_runtime_ms = (perf_counter() - total_started_at) * 1_000.0
    log_timing(
        "radar_propagation_total",
        total_started_at,
        valid_paths=len(records),
        target_paths=classification_counts["target"],
    )

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
        "targets": [
            {**target.as_dict(), "observability": target_observability[target.id]}
            for target in snapshot.targets
        ],
        "target_object_ids": target_object_ids,
        "solver": {**kwargs},
        "summary": {
            "valid_paths": len(records),
            "raw_valid_paths": len(records),
            "display_paths": len(records),
            "deduplicated_paths": 0,
            "array_pair_paths": sum(1 for record in records if record["array_pair_index"] is not None),
            "los_paths": classification_counts["direct"],
            "received_power_db": received_power_db,
            "strongest_path_db": strongest_path_db,
            "target_path_count": classification_counts["target"],
            "clutter_path_count": classification_counts["clutter"],
            "direct_path_count": classification_counts["direct"],
            "sionna_path_count": len(records) - deterministic_count,
            "deterministic_target_path_count": deterministic_count,
            "directed_target_attempt_count": directed_attempt_count,
            "replaced_sbr_target_path_count": replaced_sbr_target_path_count,
            "filtered_nonfinite_path_count": tensor_stats["filtered_nonfinite_path_count"],
        },
        "tensor_statistics": tensor_stats,
        "timing": {
            "solver_runtime_ms": solver_runtime_ms,
            "directed_target_runtime_ms": directed_runtime_ms,
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
