from __future__ import annotations

import math
import importlib.util
from threading import Lock
from types import SimpleNamespace
import unittest

from backend.rt.process_radar import process_radar_propagation
from backend.rt.solve_radar import solve_radar_propagation
from backend.rt.radar_payload import SPEED_OF_LIGHT_MPS


CARRIER_HZ = 5.8e9
WAVELENGTH_M = SPEED_OF_LIGHT_MPS / CARRIER_HZ


@unittest.skipUnless(importlib.util.find_spec("sionna"), "Sionna RT is not installed")
class NativeRadarTests(unittest.TestCase):
    def setUp(self) -> None:
        from sionna.rt import load_scene

        self.scene = load_scene()
        self.runtime = SimpleNamespace(lock=Lock(), generation=7, require_ready=lambda: self.scene)
        self.initial_frequency = float(self.scene.frequency[0])

    def payload(self, mode: str) -> dict:
        request = {
            "mode": mode,
            "tx": {"position": [0.0, 0.0, 5.0]},
            "targets": [{
                "id": "uav",
                "asset_id": "dji-mini-3",
                "position": [30.0, 0.0, 5.0],
                "velocity": [6.0, 0.0, 0.0],
                "rcs_m2": 0.1,
            }],
            "waveform": {"carrier_frequency_hz": CARRIER_HZ, "num_subcarriers": 64, "num_symbols": 32},
            "solver": {
                "max_depth": 1,
                "samples_per_src": 64,
                "max_num_paths_per_src": 32,
                "specular_reflection": False,
                "diffuse_reflection": False,
                "refraction": False,
            },
        }
        if mode == "bistatic":
            request["rx"] = {"position": [0.0, 40.0, 5.0]}
        return request

    def solve(self, request: dict) -> dict:
        object_names = set(self.scene.objects)
        result = solve_radar_propagation(self.runtime, request, expected_scene_generation=7)
        self.assertEqual(result["scene_generation"], 7)
        self.assertEqual(set(self.scene.objects), object_names)
        self.assertEqual(self.scene.sensing_targets, {})
        self.assertEqual(self.scene.transmitters, {})
        self.assertEqual(self.scene.receivers, {})
        self.assertIsNone(self.scene.tx_array)
        self.assertIsNone(self.scene.rx_array)
        self.assertEqual(float(self.scene.frequency[0]), self.initial_frequency)
        return result

    def target_path(self, propagation: dict) -> dict:
        paths = [path for path in propagation["paths"] if path["classification"] == "target"]
        self.assertEqual(len(paths), 1)
        path = paths[0]
        self.assertEqual(path["target_ids"], ["uav"])
        self.assertEqual(path["solver_method"], "sionna_rcs_solver")
        self.assertEqual(path["interaction_sequence"], ["SENSING"])
        self.assertEqual(path["object_chain"][0]["target_id"], "uav")
        self.assertIsNone(path["object_chain"][0]["primitive_id"])
        self.assertEqual(path["polyline"][1], [30.0, 0.0, 5.0])
        return path

    def test_monostatic_matches_radar_equation_and_doppler(self) -> None:
        request = self.payload("monostatic")
        propagation = self.solve(request)
        path = self.target_path(propagation)
        self.assertAlmostEqual(path["equivalent_range_m"], 30.0, delta=2e-5)
        self.assertAlmostEqual(path["doppler_hz"], -12.0 / WAVELENGTH_M, delta=0.01)
        gain = WAVELENGTH_M**2 * 0.1 / ((4.0 * math.pi)**3 * 30.0**4)
        self.assertTrue(math.isclose(path["path_gain_linear"], gain, rel_tol=2e-3), path)

        result = process_radar_propagation(request, propagation)
        self.assertEqual(result["summary"]["total_target_path_count"], 1)
        target_path = next(path for path in result["paths"] if path["classification"] == "target")
        self.assertEqual(target_path["coefficient_source"], "sionna_rcs_solver")
        self.assertEqual(target_path["target_ids"], ["uav"])

    def test_bistatic_has_distinct_target_echo_and_direct_path(self) -> None:
        request = self.payload("bistatic")
        propagation = self.solve(request)
        path = self.target_path(propagation)
        self.assertAlmostEqual(path["path_length_m"], 80.0, delta=2e-5)
        self.assertAlmostEqual(path["doppler_hz"], -9.6 / WAVELENGTH_M, delta=0.01)
        background = [path for path in propagation["paths"] if path["classification"] == "direct"]
        self.assertEqual(len(background), 1)
        self.assertAlmostEqual(background[0]["path_length_m"], 40.0, delta=2e-5)
        self.assertEqual(background[0]["target_ids"], [])

    def test_blocking_one_bistatic_leg_removes_only_target_echo(self) -> None:
        import mitsuba as mi
        from sionna.rt import ITURadioMaterial, SceneObject

        request = self.payload("bistatic")
        self.target_path(self.solve(request))
        blocker = mi.load_dict({
            "type": "cube",
            "to_world": mi.ScalarTransform4f().translate([15.0, 0.0, 5.0]).scale([0.25, 3.0, 3.0]),
        })
        self.scene.add(SceneObject(
            name="wall",
            mi_mesh=blocker,
            radio_material=ITURadioMaterial("wall-concrete", itu_type="concrete", thickness=0.5),
        ))
        propagation = self.solve(request)
        self.assertEqual([path["classification"] for path in propagation["paths"]], ["direct"])
        result = process_radar_propagation(request, propagation)
        self.assertEqual(result["summary"]["total_target_path_count"], 0)

    def test_synthetic_array_preserves_both_target_ids_and_element_paths(self) -> None:
        request = self.payload("bistatic")
        request["solver"].update({"synthetic_array": True, "rx_array": {"num_cols": 2}})
        request["targets"].append({**request["targets"][0], "id": "other-uav", "position": [30.0, 15.0, 5.0]})
        propagation = self.solve(request)
        paths = [path for path in propagation["paths"] if path["classification"] == "target"]
        self.assertEqual(len(paths), 4)
        for target in request["targets"]:
            target_paths = [path for path in paths if path["target_ids"] == [target["id"]]]
            self.assertEqual({path["array_pair_index"] for path in target_paths}, {0, 1})
            self.assertTrue(all(path["polyline"][1] == target["position"] for path in target_paths))
