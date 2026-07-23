from __future__ import annotations

import hashlib
import json
import math
from dataclasses import dataclass
from types import MappingProxyType
from typing import Callable, Mapping

from backend.rt.common import create_planar_array
from backend.rt.radar_assets import RADAR_ASSET_ROOT, radar_asset_by_id
from backend.rt.radar_payload import RADAR_CONTRACT_VERSION, parse_radar_payload
from backend.rt.runtime import current_scene_generation, require_scene_generation


RADAR_TX_DEVICE_NAME = "radar-platform-tx"
RADAR_RX_DEVICE_NAME = "radar-platform-rx"
RADAR_TARGET_OBJECT_PREFIX = "radar-target-"
RADAR_VISUAL_INSTANCE_PREFIX = "radar-target-visual-"
RADAR_CLUTTER_MODEL_METHOD = "sionna_diffuse_reflection"
RADAR_CLUTTER_MODEL_PRESET = "urban-heuristic-v2"
RADAR_CLUTTER_SCATTERING_COEFFICIENT = 0.30
RADAR_CLUTTER_DIRECTIVE_ALPHA_R = 10.0
RADAR_CLUTTER_MATERIAL_PROFILES = (
    (("vegetation", "foliage", "tree"), "vegetation", 0.60, 4.0),
    (("concrete", "brick"), "masonry", 0.35, 10.0),
    (("asphalt", "ground", "soil"), "ground", 0.25, 15.0),
    (("glass",), "glass", 0.15, 20.0),
    (("metal",), "metal", 0.10, 30.0),
    (("water", "sea"), "water", 0.05, 40.0),
)

Vector3 = tuple[float, float, float]


@dataclass(frozen=True, slots=True)
class RadarAntennaArray:
    num_rows: int
    num_cols: int
    vertical_spacing: float
    horizontal_spacing: float
    pattern: str
    polarization: str

    @classmethod
    def from_canonical(cls, value: Mapping[str, object]) -> RadarAntennaArray:
        return cls(
            num_rows=int(value["num_rows"]),
            num_cols=int(value["num_cols"]),
            vertical_spacing=float(value["vertical_spacing"]),
            horizontal_spacing=float(value["horizontal_spacing"]),
            pattern=str(value["pattern"]),
            polarization=str(value["polarization"]),
        )

    def as_dict(self) -> dict:
        return {
            "num_rows": self.num_rows,
            "num_cols": self.num_cols,
            "vertical_spacing": self.vertical_spacing,
            "horizontal_spacing": self.horizontal_spacing,
            "pattern": self.pattern,
            "polarization": self.polarization,
        }


@dataclass(frozen=True, slots=True)
class RadarDevice:
    position: Vector3
    orientation: Vector3
    velocity: Vector3

    @classmethod
    def from_canonical(cls, value: Mapping[str, object]) -> RadarDevice:
        return cls(
            position=tuple(float(component) for component in value["position"]),
            orientation=tuple(float(component) for component in value["orientation"]),
            velocity=tuple(float(component) for component in value["velocity"]),
        )

    def as_dict(self) -> dict:
        return {
            "position": list(self.position),
            "orientation": list(self.orientation),
            "velocity": list(self.velocity),
        }


def radar_visual_instance_id(target_id: str) -> str:
    return f"{RADAR_VISUAL_INSTANCE_PREFIX}{target_id}"


def radar_sionna_object_name(target_id: str) -> str:
    return f"{RADAR_TARGET_OBJECT_PREFIX}{target_id}"


@dataclass(frozen=True, slots=True)
class DroneTarget:
    id: str
    asset_id: str
    position: Vector3
    orientation: Vector3
    velocity: Vector3
    effective_rcs_m2: float
    visual_instance_id: str
    sionna_object_name: str

    @classmethod
    def from_canonical(cls, value: Mapping[str, object]) -> DroneTarget:
        target_id = str(value["id"])
        return cls(
            id=target_id,
            asset_id=str(value["asset_id"]),
            position=tuple(float(component) for component in value["position"]),
            orientation=tuple(float(component) for component in value["orientation"]),
            velocity=tuple(float(component) for component in value["velocity"]),
            effective_rcs_m2=float(value["rcs_m2"]),
            visual_instance_id=radar_visual_instance_id(target_id),
            sionna_object_name=radar_sionna_object_name(target_id),
        )

    def as_dict(self) -> dict:
        return {
            "id": self.id,
            "asset_id": self.asset_id,
            "position": list(self.position),
            "orientation": list(self.orientation),
            "velocity": list(self.velocity),
            "rcs_m2": self.effective_rcs_m2,
            "visual_instance_id": self.visual_instance_id,
            "sionna_object_name": self.sionna_object_name,
        }


@dataclass(frozen=True, slots=True)
class RadarPlatform:
    mode: str
    tx: RadarDevice
    rx: RadarDevice
    tx_array: RadarAntennaArray
    rx_array: RadarAntennaArray
    carrier_frequency_hz: float

    def as_dict(self) -> dict:
        return {
            "mode": self.mode,
            "tx": self.tx.as_dict(),
            "rx": self.rx.as_dict(),
            "tx_array": self.tx_array.as_dict(),
            "rx_array": self.rx_array.as_dict(),
            "carrier_frequency_hz": self.carrier_frequency_hz,
        }


@dataclass(frozen=True, slots=True)
class RadarSceneSnapshot:
    schema_version: int
    scene_generation: int
    platform: RadarPlatform
    targets: tuple[DroneTarget, ...]

    @property
    def target_ids(self) -> tuple[str, ...]:
        return tuple(target.id for target in self.targets)

    @property
    def targets_by_id(self) -> Mapping[str, DroneTarget]:
        return MappingProxyType({target.id: target for target in self.targets})

    @property
    def visual_instance_id_to_target_id(self) -> Mapping[str, str]:
        return MappingProxyType({target.visual_instance_id: target.id for target in self.targets})

    @property
    def sionna_object_name_to_target_id(self) -> Mapping[str, str]:
        return MappingProxyType({target.sionna_object_name: target.id for target in self.targets})

    @property
    def fingerprint(self) -> str:
        canonical = json.dumps(
            self.as_dict(),
            ensure_ascii=True,
            sort_keys=True,
            separators=(",", ":"),
        ).encode("utf-8")
        return hashlib.sha256(canonical).hexdigest()

    def as_dict(self) -> dict:
        return {
            "schema_version": self.schema_version,
            "scene_generation": self.scene_generation,
            "platform": self.platform.as_dict(),
            "targets": [target.as_dict() for target in self.targets],
        }


def create_radar_scene_snapshot(payload: dict, *, scene_generation: int) -> RadarSceneSnapshot:
    if isinstance(scene_generation, bool) or not isinstance(scene_generation, int) or scene_generation < 0:
        raise ValueError("scene_generation must be a non-negative integer")
    canonical = parse_radar_payload(payload)
    platform = RadarPlatform(
        mode=canonical["mode"],
        tx=RadarDevice.from_canonical(canonical["tx"]),
        rx=RadarDevice.from_canonical(canonical["rx"]),
        tx_array=RadarAntennaArray.from_canonical(canonical["solver"]["tx_array"]),
        rx_array=RadarAntennaArray.from_canonical(canonical["solver"]["rx_array"]),
        carrier_frequency_hz=float(canonical["waveform"]["carrier_frequency_hz"]),
    )
    targets = tuple(DroneTarget.from_canonical(target) for target in canonical["targets"])
    return RadarSceneSnapshot(
        schema_version=RADAR_CONTRACT_VERSION,
        scene_generation=scene_generation,
        platform=platform,
        targets=targets,
    )


def capture_radar_scene_snapshot(
    rt_runtime,
    payload: dict,
    *,
    expected_scene_generation: int | None = None,
) -> RadarSceneSnapshot:
    with rt_runtime.lock:
        require_scene_generation(rt_runtime, expected_scene_generation)
        generation = current_scene_generation(rt_runtime)
    if generation is None:
        raise ValueError("Radar scene snapshots require a runtime scene generation")
    return create_radar_scene_snapshot(payload, scene_generation=generation)


@dataclass(frozen=True, slots=True)
class RadarSceneDependencies:
    transmitter_type: type
    receiver_type: type
    scene_object_type: type
    material_type: type
    array_factory: Callable[[dict], object]
    scattering_pattern_factory: Callable[..., object] | None = None


def _radar_scene_dependencies() -> RadarSceneDependencies:
    from sionna.rt import DirectivePattern, ITURadioMaterial, Receiver, SceneObject, Transmitter

    return RadarSceneDependencies(
        transmitter_type=Transmitter,
        receiver_type=Receiver,
        scene_object_type=SceneObject,
        material_type=ITURadioMaterial,
        array_factory=create_planar_array,
        scattering_pattern_factory=lambda alpha_r=RADAR_CLUTTER_DIRECTIVE_ALPHA_R: DirectivePattern(alpha_r=alpha_r),
    )


def _set_velocity(item, velocity: Vector3) -> None:
    item.velocity = velocity
    try:
        import drjit as dr

        dr.make_opaque(item.velocity)
    except Exception:
        pass


class RadarSceneCleanupError(RuntimeError):
    pass


class RadarSceneBinding:
    """Temporarily materialize one immutable Radar snapshot in an RT scene."""

    def __init__(
        self,
        rt_runtime,
        snapshot: RadarSceneSnapshot,
        *,
        dependencies: RadarSceneDependencies | None = None,
        environment_scattering_enabled: bool = False,
    ) -> None:
        self.rt_runtime = rt_runtime
        self.snapshot = snapshot
        self.dependencies = dependencies or _radar_scene_dependencies()
        self.environment_scattering_enabled = bool(environment_scattering_enabled)
        self.scene = None
        self.tx_device = None
        self.rx_device = None
        self.target_objects: tuple[object, ...] = ()
        self.target_id_to_sionna_object_id: Mapping[str, int] = MappingProxyType({})
        self.sionna_object_id_to_target_id: Mapping[int, str] = MappingProxyType({})
        self.target_id_to_visual_instance_id: Mapping[str, str] = MappingProxyType({})
        self.visual_instance_id_to_sionna_object_id: Mapping[str, int] = MappingProxyType({})
        self.sionna_object_id_to_visual_instance_id: Mapping[int, str] = MappingProxyType({})
        self._device_names: list[str] = []
        self._target_objects_pending: list[object] = []
        self._previous_frequency = None
        self._previous_tx_array = None
        self._previous_rx_array = None
        self._environment_material_states: list[tuple[object, object, object]] = []
        self.environment_material_profile_counts: dict[str, int] = {}
        self._lock_acquired = False
        self._entered = False
        self._closed = False

    @property
    def closed(self) -> bool:
        return self._closed

    def target_id_for_sionna_object(self, object_id: int) -> str | None:
        return self.sionna_object_id_to_target_id.get(int(object_id))

    @property
    def environment_material_count(self) -> int:
        return len(self._environment_material_states)

    def _enable_environment_scattering(self) -> None:
        if not self.environment_scattering_enabled:
            return
        pattern_factory = self.dependencies.scattering_pattern_factory
        if pattern_factory is None:
            raise RuntimeError("Radar diffuse clutter requires a scattering pattern factory")
        materials = getattr(self.scene, "radio_materials", None)
        if materials is None:
            materials = getattr(self.scene, "materials", {})
        values = materials.values() if hasattr(materials, "values") else materials
        for material in tuple(values or ()):
            if bool(getattr(material, "is_placeholder", False)):
                continue
            previous_coefficient = getattr(material, "scattering_coefficient", 0.0)
            previous_pattern = getattr(material, "scattering_pattern", None)
            self._environment_material_states.append(
                (material, previous_coefficient, previous_pattern)
            )
            identity = " ".join(
                str(getattr(material, attribute, "") or "").lower()
                for attribute in ("name", "itu_type")
            )
            profile_name = "fallback"
            coefficient = RADAR_CLUTTER_SCATTERING_COEFFICIENT
            alpha_r = RADAR_CLUTTER_DIRECTIVE_ALPHA_R
            for keywords, candidate_name, candidate_coefficient, candidate_alpha in RADAR_CLUTTER_MATERIAL_PROFILES:
                if any(keyword in identity for keyword in keywords):
                    profile_name = candidate_name
                    coefficient = candidate_coefficient
                    alpha_r = candidate_alpha
                    break
            self.environment_material_profile_counts[profile_name] = (
                self.environment_material_profile_counts.get(profile_name, 0) + 1
            )
            material.scattering_coefficient = coefficient
            try:
                material.scattering_pattern = pattern_factory(alpha_r)
            except TypeError:
                material.scattering_pattern = pattern_factory()

    def __enter__(self) -> RadarSceneBinding:
        if self._entered:
            raise RuntimeError("Radar scene binding cannot be entered more than once")
        self._entered = True
        self.rt_runtime.lock.acquire()
        self._lock_acquired = True
        try:
            require_scene_generation(self.rt_runtime, self.snapshot.scene_generation)
            self.scene = self.rt_runtime.require_ready()
            self._previous_frequency = getattr(self.scene, "frequency", None)
            self._previous_tx_array = getattr(self.scene, "tx_array", None)
            self._previous_rx_array = getattr(self.scene, "rx_array", None)
            self.scene.frequency = self.snapshot.platform.carrier_frequency_hz
            self.scene.tx_array = self.dependencies.array_factory(self.snapshot.platform.tx_array.as_dict())
            self.scene.rx_array = self.dependencies.array_factory(self.snapshot.platform.rx_array.as_dict())
            self._enable_environment_scattering()

            self.tx_device = self.dependencies.transmitter_type(
                name=RADAR_TX_DEVICE_NAME,
                position=self.snapshot.platform.tx.position,
                orientation=self.snapshot.platform.tx.orientation,
            )
            _set_velocity(self.tx_device, self.snapshot.platform.tx.velocity)
            self.scene.add(self.tx_device)
            self._device_names.append(RADAR_TX_DEVICE_NAME)

            self.rx_device = self.dependencies.receiver_type(
                name=RADAR_RX_DEVICE_NAME,
                position=self.snapshot.platform.rx.position,
                orientation=self.snapshot.platform.rx.orientation,
            )
            _set_velocity(self.rx_device, self.snapshot.platform.rx.velocity)
            self.scene.add(self.rx_device)
            self._device_names.append(RADAR_RX_DEVICE_NAME)

            for target in self.snapshot.targets:
                asset = radar_asset_by_id(target.asset_id)
                material = self.dependencies.material_type(
                    name=f"{target.sionna_object_name}-metal",
                    itu_type="metal",
                    thickness=0.01,
                )
                scene_object = self.dependencies.scene_object_type(
                    fname=str(RADAR_ASSET_ROOT / asset["radar"]["path"]),
                    name=target.sionna_object_name,
                    radio_material=material,
                )
                self._target_objects_pending.append(scene_object)

            if self._target_objects_pending:
                self.scene.edit(add=self._target_objects_pending)
            self.target_objects = tuple(self._target_objects_pending)
            for target, scene_object in zip(
                self.snapshot.targets,
                self.target_objects,
                strict=True,
            ):
                scene_object.orientation = target.orientation
                scene_object.position = target.position
                _set_velocity(scene_object, target.velocity)

            target_to_object = {
                target.id: int(scene_object.object_id)
                for target, scene_object in zip(self.snapshot.targets, self.target_objects, strict=True)
            }
            if len(set(target_to_object.values())) != len(target_to_object):
                raise RuntimeError("Sionna assigned duplicate object IDs to Radar targets")
            self.target_id_to_sionna_object_id = MappingProxyType(target_to_object)
            self.sionna_object_id_to_target_id = MappingProxyType(
                {object_id: target_id for target_id, object_id in target_to_object.items()}
            )
            self.target_id_to_visual_instance_id = MappingProxyType(
                {target.id: target.visual_instance_id for target in self.snapshot.targets}
            )
            self.visual_instance_id_to_sionna_object_id = MappingProxyType(
                {
                    target.visual_instance_id: target_to_object[target.id]
                    for target in self.snapshot.targets
                }
            )
            self.sionna_object_id_to_visual_instance_id = MappingProxyType(
                {
                    target_to_object[target.id]: target.visual_instance_id
                    for target in self.snapshot.targets
                }
            )
            return self
        except Exception as exc:
            cleanup_errors = self._cleanup_locked()
            self._release_lock()
            self._closed = True
            if cleanup_errors and hasattr(exc, "add_note"):
                exc.add_note("Radar cleanup also failed: " + "; ".join(cleanup_errors))
            raise

    def _cleanup_locked(self) -> list[str]:
        errors: list[str] = []
        removed_target_objects: list[object] = []
        if self.scene is not None and self._target_objects_pending:
            try:
                self.scene.edit(remove=list(self._target_objects_pending))
                removed_target_objects.extend(self._target_objects_pending)
            except Exception as batch_error:
                individual_errors = []
                for scene_object in self._target_objects_pending:
                    try:
                        self.scene.edit(remove=scene_object)
                        removed_target_objects.append(scene_object)
                    except Exception as exc:
                        individual_errors.append(f"{scene_object.name}: {exc}")
                if individual_errors:
                    errors.append(f"target batch removal failed ({batch_error}); " + ", ".join(individual_errors))

        if self.scene is not None:
            for scene_object in removed_target_objects:
                material = getattr(scene_object, "radio_material", None)
                material_name = getattr(material, "name", None)
                if hasattr(material, "remove_object"):
                    try:
                        material.remove_object()
                    except Exception as exc:
                        errors.append(f"{scene_object.name} material reference: {exc}")
                        continue
                if material_name and hasattr(self.scene, "get"):
                    try:
                        if self.scene.get(material_name) is material:
                            self.scene.remove(material_name)
                    except Exception as exc:
                        errors.append(f"{scene_object.name} material removal: {exc}")

        if self.scene is not None:
            for material, previous_coefficient, previous_pattern in reversed(
                self._environment_material_states
            ):
                try:
                    material.scattering_coefficient = previous_coefficient
                    material.scattering_pattern = previous_pattern
                except Exception as exc:
                    errors.append(f"environment material {getattr(material, 'name', '?')}: {exc}")
            for device_name in reversed(self._device_names):
                try:
                    self.scene.remove(device_name)
                except Exception as exc:
                    errors.append(f"{device_name}: {exc}")
            for public_name, private_name, previous_value in (
                ("frequency", "_frequency", self._previous_frequency),
                ("tx_array", "_tx_array", self._previous_tx_array),
                ("rx_array", "_rx_array", self._previous_rx_array),
            ):
                try:
                    if previous_value is None and hasattr(self.scene, private_name):
                        setattr(self.scene, private_name, None)
                    else:
                        setattr(self.scene, public_name, previous_value)
                except Exception as exc:
                    errors.append(f"scene {public_name}: {exc}")

        self._target_objects_pending.clear()
        self._device_names.clear()
        self._environment_material_states.clear()
        if not errors:
            self.target_objects = ()
            self.tx_device = None
            self.rx_device = None
            self.scene = None
        return errors

    def _release_lock(self) -> None:
        if self._lock_acquired:
            self.rt_runtime.lock.release()
            self._lock_acquired = False

    def close(self) -> None:
        if self._closed:
            return
        if not self._entered:
            self._closed = True
            return
        cleanup_errors = self._cleanup_locked()
        self._release_lock()
        self._closed = True
        if cleanup_errors:
            raise RadarSceneCleanupError("; ".join(cleanup_errors))

    def __exit__(self, exc_type, exc, _traceback) -> bool:
        try:
            self.close()
        except RadarSceneCleanupError as cleanup_error:
            if exc is None:
                raise
            if hasattr(exc, "add_note"):
                exc.add_note(str(cleanup_error))
        return False


def bind_radar_scene(
    rt_runtime,
    snapshot: RadarSceneSnapshot,
    *,
    dependencies: RadarSceneDependencies | None = None,
    environment_scattering_enabled: bool = False,
) -> RadarSceneBinding:
    return RadarSceneBinding(
        rt_runtime,
        snapshot,
        dependencies=dependencies,
        environment_scattering_enabled=environment_scattering_enabled,
    )
