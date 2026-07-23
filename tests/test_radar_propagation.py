from __future__ import annotations

import importlib.util
import math
from enum import IntEnum
from threading import Lock
import unittest

import numpy as np

from backend.rt.process_radar import process_radar_propagation
from backend.rt.radar_payload import SPEED_OF_LIGHT_MPS
from backend.rt.runtime import SceneNotReady
from backend.rt.solve_radar import (
    RADAR_PATH_CLASSIFICATION_RULE,
    RADAR_TARGET_FALLBACK_METHOD,
    RadarPropagationDependencies,
    solve_radar_propagation,
)
from tests.test_radar_scene import (
    FAKE_DEPENDENCIES,
    FakeRuntime,
    drone_target,
    radar_payload,
)


INVALID_ID = 2**32 - 1


class FakeInteractionType(IntEnum):
    NONE = 0
    SPECULAR = 1
    DIFFUSE = 2
    REFRACTION = 3
    DIFFRACTION = 4


class FakePaths:
    def __init__(self, *, max_depth: int, pair_count: int = 1, path_count: int = 1) -> None:
        shape = (pair_count, path_count)
        self.valid = np.ones(shape, dtype=bool)
        self.interactions = np.zeros((max_depth, *shape), dtype=np.int32)
        self.objects = np.full((max_depth, *shape), INVALID_ID, dtype=np.uint32)
        self.primitives = np.full((max_depth, *shape), INVALID_ID, dtype=np.uint32)
        self.vertices = np.zeros((max_depth, *shape, 3), dtype=float)
        self.tau = np.full(shape, 100e-9, dtype=float)
        self.doppler = np.zeros(shape, dtype=float)
        self.theta_t = np.full(shape, math.pi / 2.0, dtype=float)
        self.phi_t = np.zeros(shape, dtype=float)
        self.theta_r = np.full(shape, math.pi / 2.0, dtype=float)
        self.phi_r = np.full(shape, math.pi, dtype=float)
        self.a = (
            np.ones(shape, dtype=float),
            np.zeros(shape, dtype=float),
        )


class FakePathSolver:
    def __init__(self, paths: FakePaths, calls: list[dict]) -> None:
        self.paths = paths
        self.calls = calls

    def __call__(self, scene, **kwargs):
        self.calls.append({"scene": scene, "kwargs": kwargs})
        return self.paths


def propagation_payload(*, mode: str = "bistatic", targets: list[dict] | None = None) -> dict:
    payload = radar_payload(mode=mode, targets=targets)
    payload["solver"].update(
        {
            "max_depth": 2,
            "samples_per_src": 321,
            "max_num_paths_per_src": 654,
            "synthetic_array": False,
            "los": True,
            "specular_reflection": True,
            "diffuse_reflection": False,
            "refraction": False,
            "diffraction": False,
            "edge_diffraction": False,
            "diffraction_lit_region": False,
            "seed": 17,
        }
    )
    return payload


def dependencies_for(
    paths: FakePaths,
    calls: list[dict],
    *,
    directed_scatter_solver=lambda *_args, **_kwargs: None,
) -> RadarPropagationDependencies:
    return RadarPropagationDependencies(
        path_solver_factory=lambda: FakePathSolver(paths, calls),
        interaction_type=FakeInteractionType,
        invalid_shape_id=INVALID_ID,
        invalid_primitive_id=INVALID_ID,
        scene_dependencies=FAKE_DEPENDENCIES,
        directed_scatter_solver=directed_scatter_solver,
    )


class RadarPropagationTests(unittest.TestCase):
    def test_single_target_sbr_amplitude_scales_with_effective_rcs(self) -> None:
        runtime = FakeRuntime()
        target_value = drone_target("alpha", "dji-mini-3")
        target_value["rcs_m2"] = 0.04
        paths = FakePaths(max_depth=2, path_count=1)
        paths.a = (np.asarray([[0.25]], dtype=float), np.asarray([[-0.2]], dtype=float))
        paths.interactions[0, 0, 0] = FakeInteractionType.SPECULAR
        paths.objects[0, 0, 0] = 100
        paths.vertices[0, 0, 0] = [20.0, 0.0, 10.0]

        result = solve_radar_propagation(
            runtime,
            propagation_payload(targets=[target_value]),
            dependencies=dependencies_for(paths, []),
        )

        record = next(item for item in result["paths"] if item["classification"] == "target")
        self.assertAlmostEqual(record["coefficient_abs"], 2.0 * math.hypot(0.25, -0.2))
        self.assertEqual(record["coefficient_source"], "sionna_scaled_by_effective_rcs")
        self.assertEqual(result["targets"][0]["observability"]["status"], "multipath")

    def test_propagation_honors_queued_generation_and_reports_stage_progress(self) -> None:
        runtime = FakeRuntime(generation=6)
        payload = propagation_payload()
        payload["solver"]["diffuse_reflection"] = True
        paths = FakePaths(max_depth=2, path_count=0)
        calls: list[dict] = []
        checks: list[int] = []
        progress: list[tuple[float, str]] = []

        result = solve_radar_propagation(
            runtime,
            payload,
            dependencies=dependencies_for(paths, calls),
            expected_scene_generation=6,
            cancel_check=lambda: checks.append(len(checks)),
            progress_cb=lambda value, message: progress.append((value, message)),
        )

        self.assertEqual(result["scene_generation"], 6)
        self.assertEqual(result["radar"]["clutter_model"]["preset"], "urban-heuristic-v2")
        self.assertTrue(result["radar"]["clutter_model"]["enabled"])
        self.assertFalse(result["radar"]["clutter_model"]["calibrated"])
        self.assertGreaterEqual(len(checks), 4)
        self.assertEqual(progress[-1][0], 0.62)
        with self.assertRaisesRegex(SceneNotReady, "scene changed"):
            solve_radar_propagation(
                runtime,
                payload,
                dependencies=dependencies_for(paths, []),
                expected_scene_generation=5,
            )

    def test_point_plate_target_and_array_pairs_remain_distinct(self) -> None:
        runtime = FakeRuntime()
        payload = propagation_payload(
            targets=[
                drone_target("alpha", "dji-mini-3"),
                drone_target("bravo", "dji-air-2s", position=[45.0, 3.0, 12.0]),
            ]
        )
        paths = FakePaths(max_depth=2, pair_count=2, path_count=3)
        paths.valid[1, 1:] = False
        paths.a = (
            np.asarray([[1.0, 0.5, 0.25], [0.75, 0.0, 0.0]], dtype=float),
            np.asarray([[0.0, 0.1, -0.2], [0.0, 0.0, 0.0]], dtype=float),
        )

        # Path slot 0 is a point-like LOS leakage for both array pairs.
        # Path slot 1 hits an environment plate only.
        paths.interactions[0, 0, 1] = FakeInteractionType.SPECULAR
        paths.objects[0, 0, 1] = 7
        paths.primitives[0, 0, 1] = 11
        paths.vertices[0, 0, 1] = [12.0, 4.0, 6.0]

        # Path slot 2 hits two distinct drone objects in order.
        paths.interactions[0, 0, 2] = FakeInteractionType.SPECULAR
        paths.interactions[1, 0, 2] = FakeInteractionType.DIFFUSE
        paths.objects[0, 0, 2] = 100
        paths.objects[1, 0, 2] = 101
        paths.primitives[0, 0, 2] = 21
        paths.primitives[1, 0, 2] = 22
        paths.vertices[0, 0, 2] = [20.0, 0.0, 10.0]
        paths.vertices[1, 0, 2] = [45.0, 3.0, 12.0]
        calls: list[dict] = []

        result = solve_radar_propagation(
            runtime,
            payload,
            dependencies=dependencies_for(paths, calls),
        )

        self.assertEqual(result["classification_rule"], RADAR_PATH_CLASSIFICATION_RULE)
        self.assertEqual(result["summary"]["valid_paths"], 4)
        self.assertEqual(result["summary"]["direct_path_count"], 2)
        self.assertEqual(result["summary"]["clutter_path_count"], 1)
        self.assertEqual(result["summary"]["target_path_count"], 1)
        self.assertEqual(result["summary"]["deduplicated_paths"], 0)

        direct = [record for record in result["paths"] if record["classification"] == "direct"]
        self.assertEqual([record["array_pair_index"] for record in direct], [0, 1])
        self.assertEqual(len({record["path_id"] for record in direct}), 2)
        self.assertNotEqual(direct[0]["coefficient_real"], direct[1]["coefficient_real"])

        clutter = next(record for record in result["paths"] if record["classification"] == "clutter")
        self.assertEqual(clutter["target_ids"], [])
        self.assertEqual(clutter["object_chain"][0]["object_id"], 7)
        self.assertEqual(clutter["object_chain"][0]["primitive_id"], 11)

        target = next(record for record in result["paths"] if record["classification"] == "target")
        self.assertEqual(target["target_ids"], ["alpha", "bravo"])
        self.assertEqual(
            [interaction["object_id"] for interaction in target["object_chain"]],
            [100, 101],
        )
        self.assertEqual(
            [interaction["target_id"] for interaction in target["object_chain"]],
            ["alpha", "bravo"],
        )
        self.assertEqual(len(target["polyline"]), 4)
        self.assertAlmostEqual(target["coefficient_abs"], math.hypot(0.25, -0.2))
        self.assertEqual(result["target_object_ids"], {"alpha": 100, "bravo": 101})
        self.assertEqual(runtime.scene.objects, {})
        self.assertEqual(runtime.scene.devices, {})

    def test_solver_receives_exact_seed_sampling_and_path_limits(self) -> None:
        runtime = FakeRuntime()
        paths = FakePaths(max_depth=2, path_count=0)
        calls: list[dict] = []

        solve_radar_propagation(
            runtime,
            propagation_payload(),
            dependencies=dependencies_for(paths, calls),
        )

        self.assertEqual(len(calls), 1)
        kwargs = calls[0]["kwargs"]
        self.assertEqual(kwargs["seed"], 17)
        self.assertEqual(kwargs["samples_per_src"], 321)
        self.assertEqual(kwargs["max_num_paths_per_src"], 654)
        self.assertEqual(kwargs["max_depth"], 2)
        self.assertFalse(kwargs["synthetic_array"])
        self.assertEqual(set(kwargs), {
            "max_depth",
            "max_num_paths_per_src",
            "samples_per_src",
            "synthetic_array",
            "los",
            "specular_reflection",
            "diffuse_reflection",
            "refraction",
            "diffraction",
            "edge_diffraction",
            "diffraction_lit_region",
            "seed",
        })

    def test_same_scene_payload_and_seed_are_reproducible(self) -> None:
        runtime = FakeRuntime(generation=12)
        payload = propagation_payload()
        first_paths = FakePaths(max_depth=2, path_count=2)
        first_paths.doppler[:] = [5.0, -7.0]
        second_paths = FakePaths(max_depth=2, path_count=2)
        second_paths.doppler[:] = [5.0, -7.0]

        first = solve_radar_propagation(
            runtime,
            payload,
            dependencies=dependencies_for(first_paths, []),
        )
        second = solve_radar_propagation(
            runtime,
            payload,
            dependencies=dependencies_for(second_paths, []),
        )

        self.assertEqual(first["scene_fingerprint"], second["scene_fingerprint"])
        self.assertEqual(first["solver"], second["solver"])
        self.assertEqual(first["paths"], second["paths"])

    def test_solver_failure_still_releases_radar_scene_binding(self) -> None:
        runtime = FakeRuntime()

        class FailingSolver:
            def __call__(self, _scene, **_kwargs):
                raise RuntimeError("synthetic radar solver failure")

        dependencies = RadarPropagationDependencies(
            path_solver_factory=FailingSolver,
            interaction_type=FakeInteractionType,
            invalid_shape_id=INVALID_ID,
            invalid_primitive_id=INVALID_ID,
            scene_dependencies=FAKE_DEPENDENCIES,
            directed_scatter_solver=lambda *_args, **_kwargs: None,
        )

        with self.assertRaisesRegex(RuntimeError, "synthetic radar solver failure"):
            solve_radar_propagation(runtime, propagation_payload(), dependencies=dependencies)

        self.assertEqual(runtime.scene.objects, {})
        self.assertEqual(runtime.scene.materials, {})
        self.assertEqual(runtime.scene.devices, {})
        self.assertEqual(runtime.scene.frequency, 2.4e9)
        self.assertEqual(runtime.scene.tx_array, "previous-tx-array")
        self.assertEqual(runtime.scene.rx_array, "previous-rx-array")
        self.assertTrue(runtime.lock.acquire(blocking=False))
        runtime.lock.release()

    def test_monostatic_and_bistatic_use_total_path_length_over_two(self) -> None:
        delay_s = 160.0 / SPEED_OF_LIGHT_MPS
        for mode in ("monostatic", "bistatic"):
            with self.subTest(mode=mode):
                runtime = FakeRuntime()
                paths = FakePaths(max_depth=2)
                paths.tau[:] = delay_s
                calls: list[dict] = []
                result = solve_radar_propagation(
                    runtime,
                    propagation_payload(mode=mode),
                    dependencies=dependencies_for(paths, calls),
                )

                record = result["paths"][0]
                self.assertAlmostEqual(record["path_length_m"], 160.0)
                self.assertAlmostEqual(record["equivalent_range_m"], 80.0)
                self.assertEqual(result["radar"]["mode"], mode)
                if mode == "monostatic":
                    self.assertEqual(result["radar"]["tx_position_m"], result["radar"]["rx_position_m"])
                else:
                    self.assertNotEqual(result["radar"]["tx_position_m"], result["radar"]["rx_position_m"])

    def test_doppler_sign_and_value_are_preserved_per_path(self) -> None:
        runtime = FakeRuntime()
        paths = FakePaths(max_depth=2, path_count=3)
        paths.doppler[:] = [-120.5, 0.0, 87.25]
        calls: list[dict] = []
        result = solve_radar_propagation(
            runtime,
            propagation_payload(),
            dependencies=dependencies_for(paths, calls),
        )

        self.assertEqual([record["doppler_hz"] for record in result["paths"]], [-120.5, 0.0, 87.25])

    def test_empty_path_result_is_successful_and_does_not_fabricate_targets(self) -> None:
        runtime = FakeRuntime()
        paths = FakePaths(max_depth=2, pair_count=1, path_count=0)
        calls: list[dict] = []
        result = solve_radar_propagation(
            runtime,
            propagation_payload(),
            dependencies=dependencies_for(paths, calls),
        )

        self.assertTrue(result["ok"])
        self.assertEqual(result["paths"], [])
        self.assertEqual(result["summary"]["valid_paths"], 0)
        self.assertEqual(result["summary"]["received_power_db"], None)
        self.assertEqual(result["summary"]["strongest_path_db"], None)

    def test_nonfinite_path_and_vertex_records_are_filtered(self) -> None:
        runtime = FakeRuntime()
        paths = FakePaths(max_depth=2, path_count=3)
        paths.tau[0, 0] = math.nan
        paths.interactions[0, 0, 1] = FakeInteractionType.SPECULAR
        paths.objects[0, 0, 1] = 7
        paths.vertices[0, 0, 1] = [math.inf, 0.0, 0.0]
        paths.a[0][0, 2] = math.nan
        calls: list[dict] = []

        result = solve_radar_propagation(
            runtime,
            propagation_payload(),
            dependencies=dependencies_for(paths, calls),
        )

        self.assertEqual(result["paths"], [])
        self.assertEqual(result["summary"]["filtered_nonfinite_path_count"], 3)

    def test_single_drone_fallback_requires_identity_proof_and_builds_complex_coefficient(self) -> None:
        runtime = FakeRuntime()
        paths = FakePaths(max_depth=2, path_count=0)
        calls: list[dict] = []
        directed_calls: list[dict] = []

        def directed(validation_scene, **kwargs):
            directed_calls.append({"scene": validation_scene, "kwargs": kwargs})
            target_object_id = int(validation_scene.target_object.object_id)
            path_length_m = 50.0
            return {
                "target_object_id": target_object_id,
                "hit_proof": {
                    "tx_object_id": target_object_id,
                    "rx_object_id": target_object_id,
                    "tx_surface_point_m": [19.8, 0.0, 10.0],
                    "rx_surface_point_m": [20.2, 0.0, 10.0],
                },
                "delay_s": path_length_m / SPEED_OF_LIGHT_MPS,
                "path_length_m": path_length_m,
                "equivalent_range_m": path_length_m / 2.0,
                "doppler_hz": -75.0,
                "power_gain_linear": 1e-10,
            }

        result = solve_radar_propagation(
            runtime,
            propagation_payload(targets=[drone_target("single")]),
            dependencies=dependencies_for(paths, calls, directed_scatter_solver=directed),
        )

        self.assertEqual(len(directed_calls), 1)
        self.assertEqual(directed_calls[0]["kwargs"]["seed"], 17)
        self.assertEqual(directed_calls[0]["kwargs"]["sample_budget"], 321)
        record = result["paths"][0]
        self.assertEqual(record["solver_method"], RADAR_TARGET_FALLBACK_METHOD)
        self.assertEqual(record["classification"], "target")
        self.assertEqual(record["target_ids"], ["single"])
        self.assertEqual(record["object_chain"][0]["object_id"], 100)
        self.assertEqual(record["hit_proof"]["tx_object_id"], 100)
        self.assertAlmostEqual(record["coefficient_abs"], 1e-5)
        self.assertAlmostEqual(
            record["coefficient_real"] ** 2 + record["coefficient_imag"] ** 2,
            1e-10,
        )
        self.assertEqual(record["doppler_hz"], -75.0)

    def test_multi_drone_fallback_does_not_create_unproven_target_path(self) -> None:
        runtime = FakeRuntime()
        paths = FakePaths(max_depth=2, path_count=0)
        calls: list[dict] = []

        def directed(validation_scene, **_kwargs):
            if validation_scene.asset_id == "dji-mini-3":
                object_id = int(validation_scene.target_object.object_id)
                return {
                    "target_object_id": object_id,
                    "hit_proof": {
                        "tx_object_id": object_id,
                        "rx_object_id": object_id,
                        "tx_surface_point_m": [20.0, 0.0, 10.0],
                        "rx_surface_point_m": [20.0, 0.0, 10.0],
                    },
                    "delay_s": 1e-7,
                    "path_length_m": SPEED_OF_LIGHT_MPS * 1e-7,
                    "equivalent_range_m": SPEED_OF_LIGHT_MPS * 0.5e-7,
                    "doppler_hz": 0.0,
                    "power_gain_linear": 1e-12,
                }
            return None

        result = solve_radar_propagation(
            runtime,
            propagation_payload(
                targets=[
                    drone_target("proved", "dji-mini-3"),
                    drone_target("occluded", "dji-air-2s", position=[50.0, 0.0, 10.0]),
                ]
            ),
            dependencies=dependencies_for(paths, calls, directed_scatter_solver=directed),
        )

        self.assertEqual(result["summary"]["directed_target_attempt_count"], 2)
        self.assertEqual(result["summary"]["deterministic_target_path_count"], 1)
        self.assertEqual([record["target_ids"] for record in result["paths"]], [["proved"]])
        self.assertFalse(any("occluded" in record["target_ids"] for record in result["paths"]))


@unittest.skipUnless(importlib.util.find_spec("sionna"), "Sionna RT is not installed")
class RadarPropagationSionnaTests(unittest.TestCase):
    def test_real_sionna_single_drone_bistatic_and_monostatic_paths_cleanup(self) -> None:
        from sionna.rt import load_scene

        class Runtime:
            def __init__(self) -> None:
                self.scene = load_scene()
                self.lock = Lock()
                self.generation = 9

            def require_ready(self):
                return self.scene

        runtime = Runtime()
        payload = {
            "mode": "bistatic",
            "tx": {"position": [0.0, -3.0, 5.0]},
            "rx": {"position": [0.0, 3.0, 5.0]},
            "targets": [
                {
                    "id": "real-drone",
                    "asset_id": "dji-mini-3-pro",
                    "position": [20.0, 0.0, 5.0],
                    "orientation": [0.0, 0.0, 0.0],
                    "velocity": [8.0, 0.0, 0.0],
                    "rcs_m2": 0.01,
                }
            ],
            "solver": {
                "max_depth": 1,
                "samples_per_src": 32,
                "max_num_paths_per_src": 512,
                "synthetic_array": True,
                "los": True,
                "specular_reflection": True,
                "diffuse_reflection": False,
                "refraction": False,
                "diffraction": False,
                "edge_diffraction": False,
                "diffraction_lit_region": False,
                "seed": 7,
            },
        }

        result = solve_radar_propagation(runtime, payload)
        sensing_result = process_radar_propagation(payload, result)

        target_records = [record for record in result["paths"] if record["classification"] == "target"]
        self.assertGreaterEqual(len(target_records), 1)
        self.assertTrue(any(record["target_ids"] == ["real-drone"] for record in target_records))
        for record in target_records:
            self.assertTrue(record["object_chain"])
            self.assertTrue(any(item["target_id"] == "real-drone" for item in record["object_chain"]))
            self.assertTrue(math.isfinite(record["coefficient_real"]))
            self.assertTrue(math.isfinite(record["coefficient_imag"]))
            self.assertTrue(math.isfinite(record["doppler_hz"]))
        self.assertFalse(any(name.startswith("radar-target-") for name in runtime.scene.objects))
        self.assertFalse(any(name.startswith("radar-target-") for name in runtime.scene.radio_materials))
        self.assertNotIn("radar-platform-tx", runtime.scene.transmitters)
        self.assertNotIn("radar-platform-rx", runtime.scene.receivers)
        self.assertEqual(sensing_result["summary"]["target_count"], 1)
        self.assertGreaterEqual(sensing_result["summary"]["total_target_path_count"], 1)
        self.assertEqual(len(sensing_result["range_profile"]["power_dbm"]), 1024)
        self.assertTrue(math.isfinite(sensing_result["statistics"]["peak_snr_db"]))

        monostatic_runtime = Runtime()
        monostatic_payload = dict(payload)
        monostatic_payload["mode"] = "monostatic"
        monostatic_payload["tx"] = {"position": [0.0, 0.0, 5.0]}
        monostatic_payload.pop("rx", None)
        monostatic_result = solve_radar_propagation(monostatic_runtime, monostatic_payload)
        monostatic_targets = [
            record for record in monostatic_result["paths"] if record["classification"] == "target"
        ]
        self.assertGreaterEqual(len(monostatic_targets), 1)
        self.assertEqual(
            monostatic_result["radar"]["tx_position_m"],
            monostatic_result["radar"]["rx_position_m"],
        )
        self.assertTrue(all(record["equivalent_range_m"] > 0.0 for record in monostatic_targets))
        self.assertFalse(any(name.startswith("radar-target-") for name in monostatic_runtime.scene.objects))
        self.assertNotIn("radar-platform-tx", monostatic_runtime.scene.transmitters)
        self.assertNotIn("radar-platform-rx", monostatic_runtime.scene.receivers)


if __name__ == "__main__":
    unittest.main()
