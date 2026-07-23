from __future__ import annotations

import math
import time
from dataclasses import dataclass
from typing import Iterable, Sequence

from backend import config
from backend.rt.radar_assets import RADAR_ASSET_ROOT, radar_asset_by_id
from backend.rt.radar_payload import RADAR_MODES, SPEED_OF_LIGHT_MPS


RADAR_SMALL_TARGET_VALIDATION_VERSION = 1
RADAR_SMALL_TARGET_DISTANCES_M = (20.0, 50.0, 100.0, 200.0)
RADAR_SMALL_TARGET_SAMPLE_TIERS = (4_096, 16_384, 65_536)
RADAR_SMALL_TARGET_SEEDS = (7, 42, 2_026)
RADAR_SMALL_TARGET_MAX_SAMPLES_PER_SRC = max(RADAR_SMALL_TARGET_SAMPLE_TIERS)
RADAR_SMALL_TARGET_MAX_PATHS_PER_SRC = 65_536
RADAR_SMALL_TARGET_DIRECTED_RAY_CAP = 2
RADAR_SMALL_TARGET_BISTATIC_BASELINE_M = 10.0
RADAR_SMALL_TARGET_MONOSTATIC_SBR_RX_OFFSET_M = 0.001
RADAR_SMALL_TARGET_METHOD = "deterministic_target_scatter"


@dataclass
class RadarSmallTargetScene:
    scene: object
    asset_id: str
    asset: dict
    target_object: object
    target_position_m: tuple[float, float, float]
    target_velocity_mps: tuple[float, float, float]
    tx_position_m: tuple[float, float, float]
    rx_position_m: tuple[float, float, float]
    mode: str
    carrier_frequency_hz: float


def _finite_vector3(value: Sequence[float], *, name: str) -> tuple[float, float, float]:
    if len(value) != 3:
        raise ValueError(f"{name} must contain three coordinates")
    parsed = tuple(float(component) for component in value)
    if not all(math.isfinite(component) for component in parsed):
        raise ValueError(f"{name} must contain only finite coordinates")
    return parsed


def standard_validation_positions(
    distance_m: float,
    mode: str,
    *,
    bistatic_baseline_m: float = RADAR_SMALL_TARGET_BISTATIC_BASELINE_M,
    monostatic_sbr_rx_offset_m: float = 0.0,
) -> dict[str, tuple[float, float, float]]:
    distance = float(distance_m)
    baseline = float(bistatic_baseline_m)
    receiver_offset = float(monostatic_sbr_rx_offset_m)
    if mode not in RADAR_MODES:
        raise ValueError(f"mode must be one of: {', '.join(sorted(RADAR_MODES))}")
    if not math.isfinite(distance) or distance <= 0.0:
        raise ValueError("distance_m must be positive and finite")
    if not math.isfinite(baseline) or baseline <= 0.0:
        raise ValueError("bistatic_baseline_m must be positive and finite")
    if not math.isfinite(receiver_offset) or receiver_offset < 0.0:
        raise ValueError("monostatic_sbr_rx_offset_m must be finite and non-negative")

    target = (distance, 0.0, 0.0)
    if mode == "monostatic":
        return {
            "tx": (0.0, 0.0, 0.0),
            "rx": (0.0, receiver_offset, 0.0),
            "target": target,
        }
    half_baseline = baseline / 2.0
    return {
        "tx": (0.0, -half_baseline, 0.0),
        "rx": (0.0, half_baseline, 0.0),
        "target": target,
    }


def build_unobstructed_validation_scene(
    asset_id: str,
    distance_m: float,
    mode: str,
    *,
    target_velocity_mps: Sequence[float] = (10.0, 0.0, 0.0),
    carrier_frequency_hz: float = config.DEFAULT_FREQUENCY_HZ,
    monostatic_sbr_rx_offset_m: float = 0.0,
) -> RadarSmallTargetScene:
    """Build the empty RS-03 scene with one normalized Radar target mesh."""

    from sionna.rt import ITURadioMaterial, SceneObject, load_scene

    asset = radar_asset_by_id(asset_id)
    positions = standard_validation_positions(
        distance_m,
        mode,
        monostatic_sbr_rx_offset_m=monostatic_sbr_rx_offset_m,
    )
    velocity = _finite_vector3(target_velocity_mps, name="target_velocity_mps")
    frequency = float(carrier_frequency_hz)
    if not math.isfinite(frequency) or frequency <= 0.0:
        raise ValueError("carrier_frequency_hz must be positive and finite")

    scene = load_scene()
    target_name = f"radar-target-{asset_id}"
    material = ITURadioMaterial(
        name=f"{target_name}-metal",
        itu_type="metal",
        thickness=0.01,
    )
    target_object = SceneObject(
        fname=str(RADAR_ASSET_ROOT / asset["radar"]["path"]),
        name=target_name,
        radio_material=material,
    )
    scene.edit(add=target_object)
    target_object.position = list(positions["target"])
    target_object.velocity = list(velocity)
    scene.frequency = frequency

    return RadarSmallTargetScene(
        scene=scene,
        asset_id=asset_id,
        asset=asset,
        target_object=target_object,
        target_position_m=positions["target"],
        target_velocity_mps=velocity,
        tx_position_m=positions["tx"],
        rx_position_m=positions["rx"],
        mode=mode,
        carrier_frequency_hz=frequency,
    )


def classify_radar_path(
    interaction_object_ids: Iterable[int],
    target_object_ids: Iterable[int],
) -> str:
    """Classify only paths with a proven target-object interaction as target."""

    interactions = {int(object_id) for object_id in interaction_object_ids}
    targets = {int(object_id) for object_id in target_object_ids}
    return "target" if interactions.intersection(targets) else "clutter"


def _first_scene_object_hit(
    validation_scene: RadarSmallTargetScene,
    origin_m: Sequence[float],
) -> tuple[int, tuple[float, float, float]] | None:
    """Return the Sionna SceneObject ID hit by a target-directed Mitsuba ray."""

    import drjit as dr
    import mitsuba as mi
    import numpy as np

    origin = _finite_vector3(origin_m, name="ray origin")
    destination = validation_scene.target_position_m
    delta = tuple(destination[index] - origin[index] for index in range(3))
    distance = math.sqrt(sum(component * component for component in delta))
    if distance <= 0.0:
        return None
    direction = mi.Vector3f(*(component / distance for component in delta))
    ray = mi.Ray3f(mi.Point3f(*origin), dr.normalize(direction))
    interaction = validation_scene.scene.mi_scene.ray_intersect(ray)
    is_valid = bool(np.asarray(interaction.is_valid()).reshape(-1)[0])
    if not is_valid:
        return None

    for scene_object in validation_scene.scene.objects.values():
        is_hit = bool(np.asarray(interaction.shape == scene_object.mi_mesh).reshape(-1)[0])
        if is_hit:
            point = tuple(float(value) for value in np.asarray(interaction.p).reshape(3))
            return int(scene_object.object_id), point
    return None


def inspect_target_visibility(validation_scene: RadarSmallTargetScene) -> dict:
    """Describe whether both platform legs first intersect the requested target."""

    target_object_id = int(validation_scene.target_object.object_id)

    def leg(origin_m: Sequence[float]) -> dict:
        hit = _first_scene_object_hit(validation_scene, origin_m)
        if hit is None:
            return {"status": "miss", "object_id": None, "surface_point_m": None}
        return {
            "status": "clear" if hit[0] == target_object_id else "blocked",
            "object_id": int(hit[0]),
            "surface_point_m": [float(value) for value in hit[1]],
        }

    tx_leg = leg(validation_scene.tx_position_m)
    rx_leg = leg(validation_scene.rx_position_m)
    direct = tx_leg["status"] == "clear" and rx_leg["status"] == "clear"
    return {
        "status": "direct" if direct else "blocked",
        "tx_leg": tx_leg,
        "rx_leg": rx_leg,
    }


def solve_target_directed_scatter(
    validation_scene: RadarSmallTargetScene,
    *,
    seed: int = RADAR_SMALL_TARGET_SEEDS[0],
    sample_budget: int = RADAR_SMALL_TARGET_MAX_SAMPLES_PER_SRC,
    effective_rcs_m2: float | None = None,
) -> dict | None:
    """Create one bounded point-scatter path after proving both mesh intersections.

    The two deterministic rays are visibility/identity checks against Sionna's
    active Mitsuba scene. The path coefficient then uses the bistatic radar
    equation with the target's effective RCS. This is the RS-03 fallback for
    small targets that ordinary SBR misses within its formal sample cap.
    """

    if isinstance(seed, bool) or not isinstance(seed, int) or seed < 0 or seed > (2**32 - 1):
        raise ValueError("seed must be an unsigned 32-bit integer")
    if (
        isinstance(sample_budget, bool)
        or not isinstance(sample_budget, int)
        or sample_budget <= 0
        or sample_budget > RADAR_SMALL_TARGET_MAX_SAMPLES_PER_SRC
    ):
        raise ValueError(
            f"sample_budget must be between 1 and {RADAR_SMALL_TARGET_MAX_SAMPLES_PER_SRC}"
        )
    rcs = (
        float(validation_scene.asset["default_effective_rcs_m2"])
        if effective_rcs_m2 is None
        else float(effective_rcs_m2)
    )
    if not math.isfinite(rcs) or rcs <= 0.0:
        raise ValueError("effective_rcs_m2 must be positive and finite")

    started_at = time.perf_counter()
    visibility = inspect_target_visibility(validation_scene)
    tx_leg_visibility = visibility["tx_leg"]
    rx_leg_visibility = visibility["rx_leg"]
    target_object_id = int(validation_scene.target_object.object_id)
    if visibility["status"] != "direct":
        return None

    tx_leg = math.dist(validation_scene.tx_position_m, validation_scene.target_position_m)
    rx_leg = math.dist(validation_scene.target_position_m, validation_scene.rx_position_m)
    path_length = tx_leg + rx_leg
    wavelength = SPEED_OF_LIGHT_MPS / validation_scene.carrier_frequency_hz
    velocity = validation_scene.target_velocity_mps
    tx_direction = tuple(
        (validation_scene.target_position_m[index] - validation_scene.tx_position_m[index]) / tx_leg
        for index in range(3)
    )
    rx_direction = tuple(
        (validation_scene.target_position_m[index] - validation_scene.rx_position_m[index]) / rx_leg
        for index in range(3)
    )
    path_length_rate_mps = sum(
        velocity[index] * (tx_direction[index] + rx_direction[index]) for index in range(3)
    )
    doppler_hz = -path_length_rate_mps / wavelength
    power_gain_linear = (
        wavelength * wavelength * rcs
        / (((4.0 * math.pi) ** 3) * (tx_leg * tx_leg) * (rx_leg * rx_leg))
    )

    return {
        "schema_version": RADAR_SMALL_TARGET_VALIDATION_VERSION,
        "method": RADAR_SMALL_TARGET_METHOD,
        "classification": classify_radar_path((target_object_id,), (target_object_id,)),
        "asset_id": validation_scene.asset_id,
        "mode": validation_scene.mode,
        "target_distance_m": validation_scene.target_position_m[0],
        "seed": seed,
        "sample_budget": sample_budget,
        "directed_ray_count": RADAR_SMALL_TARGET_DIRECTED_RAY_CAP,
        "target_object_id": target_object_id,
        "interaction_object_ids": [target_object_id],
        "hit_proof": {
            "tx_object_id": tx_leg_visibility["object_id"],
            "rx_object_id": rx_leg_visibility["object_id"],
            "tx_surface_point_m": tx_leg_visibility["surface_point_m"],
            "rx_surface_point_m": rx_leg_visibility["surface_point_m"],
        },
        "tx_leg_m": tx_leg,
        "rx_leg_m": rx_leg,
        "path_length_m": path_length,
        "equivalent_range_m": path_length / 2.0,
        "delay_s": path_length / SPEED_OF_LIGHT_MPS,
        "path_length_rate_mps": path_length_rate_mps,
        "radial_velocity_mps": path_length_rate_mps / 2.0,
        "doppler_hz": doppler_hz,
        "effective_rcs_m2": rcs,
        "power_gain_linear": power_gain_linear,
        "power_gain_db": 10.0 * math.log10(power_gain_linear),
        "runtime_ms": (time.perf_counter() - started_at) * 1_000.0,
    }


def solve_standard_target_case(
    asset_id: str,
    distance_m: float,
    mode: str,
    *,
    seed: int = RADAR_SMALL_TARGET_SEEDS[0],
    sample_budget: int = RADAR_SMALL_TARGET_MAX_SAMPLES_PER_SRC,
    target_velocity_mps: Sequence[float] = (10.0, 0.0, 0.0),
    effective_rcs_m2: float | None = None,
) -> dict | None:
    validation_scene = build_unobstructed_validation_scene(
        asset_id,
        distance_m,
        mode,
        target_velocity_mps=target_velocity_mps,
    )
    return solve_target_directed_scatter(
        validation_scene,
        seed=seed,
        sample_budget=sample_budget,
        effective_rcs_m2=effective_rcs_m2,
    )


def probe_ordinary_sbr(
    validation_scene: RadarSmallTargetScene,
    *,
    samples_per_src: int,
    seed: int,
) -> dict:
    """Run a capped ordinary PathSolver probe and summarize target-object hits."""

    import numpy as np
    from sionna.rt import PathSolver, PlanarArray, Receiver, Transmitter

    if samples_per_src not in RADAR_SMALL_TARGET_SAMPLE_TIERS:
        raise ValueError(f"samples_per_src must be one of {RADAR_SMALL_TARGET_SAMPLE_TIERS}")
    if seed not in RADAR_SMALL_TARGET_SEEDS:
        raise ValueError(f"seed must be one of {RADAR_SMALL_TARGET_SEEDS}")

    scene = validation_scene.scene
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
    if not scene.transmitters:
        scene.add(Transmitter(name="radar-validation-tx", position=validation_scene.tx_position_m))
    if not scene.receivers:
        scene.add(Receiver(name="radar-validation-rx", position=validation_scene.rx_position_m))

    started_at = time.perf_counter()
    paths = PathSolver()(
        scene,
        max_depth=1,
        max_num_paths_per_src=RADAR_SMALL_TARGET_MAX_PATHS_PER_SRC,
        samples_per_src=samples_per_src,
        synthetic_array=True,
        los=True,
        specular_reflection=True,
        diffuse_reflection=False,
        refraction=False,
        diffraction=False,
        edge_diffraction=False,
        seed=seed,
    )
    runtime_ms = (time.perf_counter() - started_at) * 1_000.0
    valid = np.asarray(paths.valid, dtype=bool)
    objects = np.asarray(paths.objects)
    target_object_id = int(validation_scene.target_object.object_id)
    if valid.shape[-1] == 0:
        target_path_mask = valid
    else:
        target_path_mask = valid & np.any(objects == target_object_id, axis=0)

    target_indices = np.flatnonzero(target_path_mask.reshape(-1))
    delay_s = None
    doppler_hz = None
    gain_db = None
    if target_indices.size:
        path_index = int(target_indices[0] % valid.shape[-1])
        delay_s = float(np.asarray(paths.tau).reshape(-1, valid.shape[-1])[0, path_index])
        doppler_hz = float(np.asarray(paths.doppler).reshape(-1, valid.shape[-1])[0, path_index])
        real, imaginary = paths.a
        coefficient = np.asarray(real) + 1j * np.asarray(imaginary)
        coefficient = coefficient.reshape(-1, valid.shape[-1])[0, path_index]
        gain_db = 20.0 * math.log10(max(abs(complex(coefficient)), 1e-300))

    return {
        "method": "ordinary_sbr",
        "asset_id": validation_scene.asset_id,
        "mode": validation_scene.mode,
        "target_distance_m": validation_scene.target_position_m[0],
        "seed": seed,
        "samples_per_src": samples_per_src,
        "sample_cap": RADAR_SMALL_TARGET_MAX_SAMPLES_PER_SRC,
        "max_num_paths_per_src": RADAR_SMALL_TARGET_MAX_PATHS_PER_SRC,
        "target_object_id": target_object_id,
        "valid_path_count": int(np.count_nonzero(valid)),
        "target_path_count": int(target_indices.size),
        "hit": bool(target_indices.size),
        "delay_s": delay_s,
        "doppler_hz": doppler_hz,
        "gain_db": gain_db,
        "runtime_ms": runtime_ms,
    }


def build_ordinary_sbr_validation_scene(
    asset_id: str,
    distance_m: float,
    mode: str,
    *,
    target_velocity_mps: Sequence[float] = (10.0, 0.0, 0.0),
) -> RadarSmallTargetScene:
    """Use a 1 mm monostatic Rx offset required by PathSolver device geometry."""

    return build_unobstructed_validation_scene(
        asset_id,
        distance_m,
        mode,
        target_velocity_mps=target_velocity_mps,
        monostatic_sbr_rx_offset_m=(
            RADAR_SMALL_TARGET_MONOSTATIC_SBR_RX_OFFSET_M if mode == "monostatic" else 0.0
        ),
    )
