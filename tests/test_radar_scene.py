from __future__ import annotations

import importlib.util
from dataclasses import FrozenInstanceError, replace
from threading import Lock
import unittest

from backend.rt.radar_scene import (
    RADAR_RX_DEVICE_NAME,
    RADAR_TX_DEVICE_NAME,
    RadarSceneBinding,
    RadarSceneDependencies,
    bind_radar_scene,
    capture_radar_scene_snapshot,
    create_radar_scene_snapshot,
    radar_sionna_object_name,
    radar_visual_instance_id,
)
from backend.rt.runtime import SceneNotReady, STALE_SCENE_MESSAGE


def radar_payload(*, mode: str = "bistatic", targets: list[dict] | None = None) -> dict:
    payload = {
        "mode": mode,
        "tx": {
            "position": [1.0, 2.0, 3.0],
            "orientation": [0.1, 0.2, 0.3],
            "velocity": [1.0, 0.0, 0.0],
        },
        "targets": targets or [],
        "waveform": {"carrier_frequency_hz": 5.8e9},
        "solver": {
            "tx_array": {
                "num_rows": 2,
                "num_cols": 1,
                "vertical_spacing": 0.4,
                "horizontal_spacing": 0.5,
                "pattern": "iso",
                "polarization": "V",
            },
        },
    }
    if mode == "bistatic":
        payload["rx"] = {
            "position": [4.0, 5.0, 6.0],
            "orientation": [-0.1, -0.2, -0.3],
            "velocity": [0.0, 1.0, 0.0],
        }
        payload["solver"]["rx_array"] = {
            "num_rows": 1,
            "num_cols": 2,
            "vertical_spacing": 0.5,
            "horizontal_spacing": 0.4,
            "pattern": "iso",
            "polarization": "V",
        }
    return payload


def drone_target(
    target_id: str,
    asset_id: str = "dji-mini-3-pro",
    *,
    position: list[float] | None = None,
    orientation: list[float] | None = None,
    velocity: list[float] | None = None,
    rcs_m2: float = 0.02,
) -> dict:
    return {
        "id": target_id,
        "asset_id": asset_id,
        "position": position or [20.0, 0.0, 10.0],
        "orientation": orientation or [0.0, 0.0, 0.0],
        "velocity": velocity or [10.0, 0.0, 0.0],
        "rcs_m2": rcs_m2,
    }


class FakeDevice:
    def __init__(self, *, name, position, orientation) -> None:
        self.name = name
        self.position = position
        self.orientation = orientation
        self.velocity = None


class FakeMaterial:
    def __init__(self, **kwargs) -> None:
        self.kwargs = kwargs
        self.name = kwargs["name"]
        self.object_count = 0
        self.scattering_coefficient = kwargs.get("scattering_coefficient", 0.0)
        self.scattering_pattern = kwargs.get("scattering_pattern")

    def add_object(self) -> None:
        self.object_count += 1

    def remove_object(self) -> None:
        self.object_count -= 1


class FakeSceneObject:
    def __init__(self, *, fname, name, radio_material) -> None:
        self.fname = fname
        self.name = name
        self.radio_material = radio_material
        self.radio_material.add_object()
        self.position = None
        self.orientation = None
        self.velocity = None
        self.object_id = None


class FakeScene:
    def __init__(self) -> None:
        self.frequency = 2.4e9
        self.tx_array = "previous-tx-array"
        self.rx_array = "previous-rx-array"
        self.devices = {}
        self.materials = {}
        self.objects = {}
        self.removed_devices = []
        self.removed_objects = []
        self.next_object_id = 100
        self.fail_target_add = False

    def add(self, item) -> None:
        if item.name in self.devices:
            raise ValueError(f"duplicate device: {item.name}")
        self.devices[item.name] = item

    def remove(self, name: str) -> None:
        if name in self.materials:
            if self.materials[name].object_count:
                raise ValueError(f"material still used: {name}")
            self.materials.pop(name)
            return
        self.removed_devices.append(name)
        self.devices.pop(name, None)

    def get(self, name: str):
        return self.materials.get(name) or self.devices.get(name) or self.objects.get(name)

    def edit(self, *, add=None, remove=None) -> None:
        if add is not None:
            additions = list(add) if isinstance(add, list) else [add]
            for index, item in enumerate(additions):
                item.object_id = self.next_object_id
                self.next_object_id += 1
                self.objects[item.name] = item
                self.materials[item.radio_material.name] = item.radio_material
                if self.fail_target_add and index == 0:
                    raise RuntimeError("synthetic target add failure")
        if remove is not None:
            removals = list(remove) if isinstance(remove, list) else [remove]
            for item in removals:
                name = item if isinstance(item, str) else item.name
                self.removed_objects.append(name)
                self.objects.pop(name, None)


class FakeRuntime:
    def __init__(self, *, generation: int = 3) -> None:
        self.scene = FakeScene()
        self.lock = Lock()
        self.generation = generation

    def require_ready(self):
        return self.scene


FAKE_DEPENDENCIES = RadarSceneDependencies(
    transmitter_type=FakeDevice,
    receiver_type=FakeDevice,
    scene_object_type=FakeSceneObject,
    material_type=FakeMaterial,
    array_factory=lambda config: ("array", tuple(sorted(config.items()))),
    scattering_pattern_factory=lambda: {"kind": "directive", "alpha_r": 10.0},
)


class RadarSceneSnapshotTests(unittest.TestCase):
    def test_monostatic_platform_copies_rx_pose_and_array(self) -> None:
        snapshot = create_radar_scene_snapshot(radar_payload(mode="monostatic"), scene_generation=4)

        self.assertEqual(snapshot.platform.mode, "monostatic")
        self.assertEqual(snapshot.platform.rx, snapshot.platform.tx)
        self.assertEqual(snapshot.platform.rx_array, snapshot.platform.tx_array)
        self.assertEqual(snapshot.platform.carrier_frequency_hz, 5.8e9)

    def test_bistatic_platform_preserves_independent_devices_and_arrays(self) -> None:
        snapshot = create_radar_scene_snapshot(radar_payload(), scene_generation=4)

        self.assertNotEqual(snapshot.platform.rx, snapshot.platform.tx)
        self.assertNotEqual(snapshot.platform.rx_array, snapshot.platform.tx_array)
        self.assertEqual(snapshot.platform.tx.position, (1.0, 2.0, 3.0))
        self.assertEqual(snapshot.platform.rx.position, (4.0, 5.0, 6.0))

    def test_zero_targets_and_stable_cross_tier_ids_are_supported(self) -> None:
        empty = create_radar_scene_snapshot(radar_payload(), scene_generation=0)
        self.assertEqual(empty.targets, ())
        self.assertEqual(dict(empty.visual_instance_id_to_target_id), {})

        snapshot = create_radar_scene_snapshot(
            radar_payload(targets=[drone_target("Alpha_1")]),
            scene_generation=0,
        )
        target = snapshot.targets[0]
        self.assertEqual(target.visual_instance_id, radar_visual_instance_id("Alpha_1"))
        self.assertEqual(target.sionna_object_name, radar_sionna_object_name("Alpha_1"))
        self.assertEqual(snapshot.visual_instance_id_to_target_id[target.visual_instance_id], "Alpha_1")
        self.assertEqual(snapshot.sionna_object_name_to_target_id[target.sionna_object_name], "Alpha_1")

    def test_snapshot_is_immutable_and_detached_from_ui_payload(self) -> None:
        source_target = drone_target("mutable")
        payload = radar_payload(targets=[source_target])
        snapshot = create_radar_scene_snapshot(payload, scene_generation=7)

        source_target["position"][0] = 999.0
        payload["tx"]["position"][0] = 999.0
        self.assertEqual(snapshot.targets[0].position, (20.0, 0.0, 10.0))
        self.assertEqual(snapshot.platform.tx.position, (1.0, 2.0, 3.0))
        with self.assertRaises(FrozenInstanceError):
            snapshot.targets[0].position = (0.0, 0.0, 0.0)
        with self.assertRaises(TypeError):
            snapshot.targets_by_id["other"] = snapshot.targets[0]

    def test_fingerprint_is_reproducible_and_tracks_scene_changes(self) -> None:
        payload = radar_payload(targets=[drone_target("stable")])
        first = create_radar_scene_snapshot(payload, scene_generation=2)
        second = create_radar_scene_snapshot(payload, scene_generation=2)
        changed_generation = create_radar_scene_snapshot(payload, scene_generation=3)
        changed_target = create_radar_scene_snapshot(
            radar_payload(targets=[drone_target("stable", rcs_m2=0.5)]),
            scene_generation=2,
        )

        self.assertEqual(first.fingerprint, second.fingerprint)
        self.assertNotEqual(first.fingerprint, changed_generation.fingerprint)
        self.assertNotEqual(first.fingerprint, changed_target.fingerprint)

    def test_capture_uses_runtime_generation(self) -> None:
        runtime = FakeRuntime(generation=11)
        snapshot = capture_radar_scene_snapshot(runtime, radar_payload())
        self.assertEqual(snapshot.scene_generation, 11)

        same_generation = capture_radar_scene_snapshot(
            runtime,
            radar_payload(),
            expected_scene_generation=11,
        )
        self.assertEqual(same_generation.scene_generation, 11)
        with self.assertRaisesRegex(SceneNotReady, STALE_SCENE_MESSAGE):
            capture_radar_scene_snapshot(
                runtime,
                radar_payload(),
                expected_scene_generation=10,
            )

        with self.assertRaisesRegex(ValueError, "scene_generation"):
            create_radar_scene_snapshot({}, scene_generation=-1)


class RadarSceneBindingTests(unittest.TestCase):
    def test_environment_scattering_preset_is_temporary_on_success_failure_and_cancel(self) -> None:
        class SyntheticCancellation(RuntimeError):
            pass

        for raised in (None, RuntimeError("solver failed"), SyntheticCancellation("cancelled")):
            with self.subTest(raised=type(raised).__name__ if raised else "success"):
                runtime = FakeRuntime()
                original_pattern = object()
                environment = FakeMaterial(
                    name="itu_concrete",
                    scattering_coefficient=0.125,
                    scattering_pattern=original_pattern,
                )
                runtime.scene.materials[environment.name] = environment
                dependencies = replace(
                    FAKE_DEPENDENCIES,
                    scattering_pattern_factory=lambda: {"kind": "directive", "alpha_r": 10.0},
                )
                snapshot = create_radar_scene_snapshot(
                    radar_payload(targets=[drone_target("alpha")]),
                    scene_generation=runtime.generation,
                )

                try:
                    with bind_radar_scene(
                        runtime,
                        snapshot,
                        dependencies=dependencies,
                        environment_scattering_enabled=True,
                    ) as binding:
                        self.assertEqual(binding.environment_material_count, 1)
                        self.assertAlmostEqual(environment.scattering_coefficient, 0.35)
                        self.assertEqual(environment.scattering_pattern["alpha_r"], 10.0)
                        self.assertEqual(binding.environment_material_profile_counts, {"masonry": 1})
                        if raised is not None:
                            raise raised
                except (RuntimeError, SyntheticCancellation) as error:
                    self.assertIs(error, raised)

                self.assertEqual(environment.scattering_coefficient, 0.125)
                self.assertIs(environment.scattering_pattern, original_pattern)
                self.assertEqual(runtime.scene.devices, {})
                self.assertEqual(runtime.scene.objects, {})
                self.assertEqual(runtime.scene.materials, {"itu_concrete": environment})

    def test_multi_target_binding_maps_ids_and_restores_scene_state(self) -> None:
        runtime = FakeRuntime()
        snapshot = create_radar_scene_snapshot(
            radar_payload(
                targets=[
                    drone_target("alpha", "dji-mini-3", orientation=[0.1, 0.2, 0.3]),
                    drone_target(
                        "bravo",
                        "dji-air-2s",
                        position=[50.0, 4.0, 12.0],
                        velocity=[0.0, -8.0, 1.0],
                    ),
                ]
            ),
            scene_generation=runtime.generation,
        )

        with bind_radar_scene(runtime, snapshot, dependencies=FAKE_DEPENDENCIES) as binding:
            self.assertFalse(runtime.lock.acquire(blocking=False))
            self.assertEqual(set(runtime.scene.devices), {RADAR_TX_DEVICE_NAME, RADAR_RX_DEVICE_NAME})
            self.assertEqual(set(runtime.scene.objects), {"radar-target-alpha", "radar-target-bravo"})
            self.assertEqual(binding.target_id_for_sionna_object(100), "alpha")
            self.assertEqual(binding.target_id_for_sionna_object(101), "bravo")
            self.assertEqual(binding.target_id_for_sionna_object(999), None)
            self.assertEqual(binding.target_id_to_visual_instance_id["alpha"], "radar-target-visual-alpha")
            self.assertEqual(binding.visual_instance_id_to_sionna_object_id["radar-target-visual-alpha"], 100)
            self.assertEqual(binding.sionna_object_id_to_visual_instance_id[101], "radar-target-visual-bravo")
            self.assertEqual(binding.target_objects[0].orientation, (0.1, 0.2, 0.3))
            self.assertEqual(binding.target_objects[1].velocity, (0.0, -8.0, 1.0))
            self.assertEqual(runtime.scene.frequency, 5.8e9)
            self.assertNotEqual(runtime.scene.tx_array, "previous-tx-array")

        self.assertTrue(binding.closed)
        self.assertEqual(runtime.scene.devices, {})
        self.assertEqual(runtime.scene.objects, {})
        self.assertEqual(runtime.scene.materials, {})
        self.assertEqual(runtime.scene.frequency, 2.4e9)
        self.assertEqual(runtime.scene.tx_array, "previous-tx-array")
        self.assertEqual(runtime.scene.rx_array, "previous-rx-array")
        self.assertEqual(binding.target_objects, ())
        self.assertTrue(runtime.lock.acquire(blocking=False))
        runtime.lock.release()

    def test_zero_target_binding_only_installs_platform(self) -> None:
        runtime = FakeRuntime()
        snapshot = create_radar_scene_snapshot(radar_payload(), scene_generation=runtime.generation)

        with bind_radar_scene(runtime, snapshot, dependencies=FAKE_DEPENDENCIES) as binding:
            self.assertEqual(binding.target_objects, ())
            self.assertEqual(runtime.scene.objects, {})
            self.assertEqual(len(runtime.scene.devices), 2)

        self.assertEqual(runtime.scene.devices, {})
        self.assertEqual(runtime.scene.materials, {})

    def test_scene_generation_change_rejects_snapshot_before_mutation(self) -> None:
        runtime = FakeRuntime(generation=8)
        snapshot = create_radar_scene_snapshot(
            radar_payload(targets=[drone_target("stale")]),
            scene_generation=runtime.generation,
        )
        runtime.generation += 1

        with self.assertRaisesRegex(SceneNotReady, STALE_SCENE_MESSAGE):
            with bind_radar_scene(runtime, snapshot, dependencies=FAKE_DEPENDENCIES):
                self.fail("stale snapshot entered the scene")
        self.assertEqual(runtime.scene.devices, {})
        self.assertEqual(runtime.scene.objects, {})
        self.assertEqual(runtime.scene.materials, {})

    def test_partial_add_failure_removes_devices_and_targets(self) -> None:
        runtime = FakeRuntime()
        runtime.scene.fail_target_add = True
        snapshot = create_radar_scene_snapshot(
            radar_payload(targets=[drone_target("failure"), drone_target("second")]),
            scene_generation=runtime.generation,
        )
        binding = RadarSceneBinding(runtime, snapshot, dependencies=FAKE_DEPENDENCIES)

        with self.assertRaisesRegex(RuntimeError, "synthetic target add failure"):
            with binding:
                self.fail("failed binding entered")
        self.assertTrue(binding.closed)
        self.assertEqual(runtime.scene.devices, {})
        self.assertEqual(runtime.scene.objects, {})
        self.assertEqual(runtime.scene.materials, {})
        self.assertTrue(runtime.lock.acquire(blocking=False))
        runtime.lock.release()

    def test_solver_body_failure_still_releases_all_scene_resources(self) -> None:
        runtime = FakeRuntime()
        snapshot = create_radar_scene_snapshot(
            radar_payload(targets=[drone_target("body-error")]),
            scene_generation=runtime.generation,
        )
        binding = RadarSceneBinding(runtime, snapshot, dependencies=FAKE_DEPENDENCIES)

        with self.assertRaisesRegex(RuntimeError, "synthetic solver failure"):
            with binding:
                raise RuntimeError("synthetic solver failure")
        self.assertTrue(binding.closed)
        self.assertEqual(runtime.scene.devices, {})
        self.assertEqual(runtime.scene.objects, {})
        self.assertEqual(runtime.scene.materials, {})
        self.assertEqual(runtime.scene.frequency, 2.4e9)
        binding.close()

    def test_add_remove_and_pose_update_do_not_leak_between_snapshots(self) -> None:
        runtime = FakeRuntime()
        first = create_radar_scene_snapshot(
            radar_payload(targets=[drone_target("changing")]),
            scene_generation=runtime.generation,
        )
        second = create_radar_scene_snapshot(
            radar_payload(
                targets=[
                    drone_target(
                        "changing",
                        position=[80.0, 3.0, 20.0],
                        orientation=[0.4, 0.5, 0.6],
                        velocity=[-4.0, 0.0, 0.0],
                    ),
                    drone_target("added", "dji-mavic-3-cine"),
                ]
            ),
            scene_generation=runtime.generation,
        )

        with bind_radar_scene(runtime, first, dependencies=FAKE_DEPENDENCIES) as binding:
            self.assertEqual(binding.target_objects[0].position, (20.0, 0.0, 10.0))
        self.assertEqual(runtime.scene.objects, {})
        self.assertEqual(runtime.scene.materials, {})

        with bind_radar_scene(runtime, second, dependencies=FAKE_DEPENDENCIES) as binding:
            self.assertEqual(len(binding.target_objects), 2)
            self.assertEqual(binding.target_objects[0].position, (80.0, 3.0, 20.0))
            self.assertEqual(binding.target_objects[0].orientation, (0.4, 0.5, 0.6))
            self.assertEqual(binding.target_objects[0].velocity, (-4.0, 0.0, 0.0))
        self.assertEqual(runtime.scene.objects, {})


@unittest.skipUnless(importlib.util.find_spec("sionna"), "Sionna RT is not installed")
class RadarSceneSionnaTests(unittest.TestCase):
    def test_real_sionna_scene_object_ids_pose_velocity_and_cleanup(self) -> None:
        import numpy as np
        from sionna.rt import load_scene

        class Runtime:
            def __init__(self) -> None:
                self.scene = load_scene()
                self.lock = Lock()
                self.generation = 6

            def require_ready(self):
                return self.scene

        runtime = Runtime()
        snapshot = create_radar_scene_snapshot(
            radar_payload(
                targets=[
                    drone_target(
                        "real-one",
                        "dji-mini-3",
                        position=[20.0, 0.0, 10.0],
                        orientation=[0.1, 0.2, 0.3],
                        velocity=[6.0, 1.0, 0.0],
                    ),
                    drone_target(
                        "real-two",
                        "dji-air-2s",
                        position=[40.0, 5.0, 15.0],
                        velocity=[-2.0, 0.0, 1.0],
                    ),
                ]
            ),
            scene_generation=runtime.generation,
        )

        with bind_radar_scene(runtime, snapshot) as binding:
            self.assertEqual(set(binding.target_id_to_sionna_object_id), {"real-one", "real-two"})
            self.assertEqual(len(set(binding.target_id_to_sionna_object_id.values())), 2)
            for target, scene_object in zip(snapshot.targets, binding.target_objects, strict=True):
                self.assertEqual(
                    binding.target_id_for_sionna_object(scene_object.object_id),
                    target.id,
                )
                np.testing.assert_allclose(np.asarray(scene_object.position).reshape(3), target.position)
                np.testing.assert_allclose(np.asarray(scene_object.orientation).reshape(3), target.orientation)
                np.testing.assert_allclose(np.asarray(scene_object.velocity).reshape(3), target.velocity)
            self.assertIn(RADAR_TX_DEVICE_NAME, runtime.scene.transmitters)
            self.assertIn(RADAR_RX_DEVICE_NAME, runtime.scene.receivers)

        self.assertNotIn(RADAR_TX_DEVICE_NAME, runtime.scene.transmitters)
        self.assertNotIn(RADAR_RX_DEVICE_NAME, runtime.scene.receivers)
        self.assertFalse(any(name.startswith("radar-target-") for name in runtime.scene.objects))
        self.assertFalse(any(name.startswith("radar-target-") for name in runtime.scene.radio_materials))

        with bind_radar_scene(runtime, snapshot) as rebound:
            self.assertEqual(set(rebound.target_id_to_sionna_object_id), {"real-one", "real-two"})


if __name__ == "__main__":
    unittest.main()
