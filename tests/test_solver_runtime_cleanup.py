from __future__ import annotations

from threading import Lock
import unittest
from unittest.mock import patch

import numpy as np

from backend import config
from backend.rt.solve_link import solve_link
from backend.rt.solve_mobility import solve_mobility
from backend.rt.solve_radiomap import solve_terrain_radiomap


class FakeDevice:
    def __init__(self, name, position, orientation) -> None:
        self.name = name
        self.position = position
        self.orientation = orientation


class FakeInteractionType:
    NONE = 0
    SPECULAR = 1
    DIFFUSE = 2
    REFRACTION = 3
    DIFFRACTION = 4


class FakeScene:
    def __init__(self) -> None:
        self.frequency = None
        self.tx_array = None
        self.rx_array = None
        self.items = {}
        self.removed = []

    def add(self, item) -> None:
        if item.name in self.items:
            raise ValueError(f"duplicate item: {item.name}")
        self.items[item.name] = item

    def remove(self, name: str) -> None:
        self.removed.append(name)
        self.items.pop(name, None)


class FakeRuntime:
    def __init__(self) -> None:
        self.scene = FakeScene()
        self.lock = Lock()
        self.array_calls = []

    def set_frequency(self, frequency_hz: float) -> None:
        self.scene.frequency = float(frequency_hz)

    def set_arrays(self, *, tx_array=None, rx_array=None) -> None:
        self.array_calls.append({"tx_array": tx_array, "rx_array": rx_array})
        if tx_array is not None:
            self.scene.tx_array = tx_array
        if rx_array is not None:
            self.scene.rx_array = rx_array


class FakePaths:
    def __init__(self, max_depth: int) -> None:
        self.valid = np.asarray([True])
        self.interactions = np.zeros((max_depth, 1), dtype=np.int32)
        self.vertices = np.zeros((max_depth, 1, 3), dtype=np.float32)
        self.tau = np.asarray([1e-9], dtype=np.float32)
        self.theta_t = np.asarray([0.1], dtype=np.float32)
        self.phi_t = np.asarray([0.2], dtype=np.float32)
        self.theta_r = np.asarray([0.3], dtype=np.float32)
        self.phi_r = np.asarray([0.4], dtype=np.float32)
        self.doppler = np.asarray([0.0], dtype=np.float32)
        self.a = (np.asarray([1.0], dtype=np.float32), np.asarray([0.0], dtype=np.float32))

    def taps(self, **_kwargs):
        return np.asarray([[[[[[1.0 + 0.0j, 0.0 + 0.0j, 0.0 + 2.0j]]]]]])

    def cir(self, **_kwargs):
        return (
            np.asarray([[[[[[3.0 + 4.0j]]]]]]),
            np.asarray([[[[[[1e-9]]]]]]),
        )


class FakeArrayPaths:
    def __init__(self, max_depth: int) -> None:
        shape = (1, 2, 1, 2, 2)
        self.valid = np.zeros(shape, dtype=bool)
        self.valid[..., 0] = True
        self.valid[0, 0, 0, 0, 1] = True
        self.valid[0, 1, 0, 0, 1] = True

        self.interactions = np.zeros((max_depth, *shape), dtype=np.int32)
        self.interactions[0, ..., 1] = FakeInteractionType.SPECULAR
        self.vertices = np.zeros((max_depth, *shape, 3), dtype=np.float32)
        self.vertices[0, ..., 1, :] = np.asarray([10.0, 20.0, 30.0], dtype=np.float32)

        self.tau = np.zeros(shape, dtype=np.float32)
        self.tau[..., 0] = 1e-9
        self.tau[..., 1] = 2e-9
        self.theta_t = np.full(shape, 0.1, dtype=np.float32)
        self.phi_t = np.full(shape, 0.2, dtype=np.float32)
        self.theta_r = np.full(shape, 0.3, dtype=np.float32)
        self.phi_r = np.full(shape, 0.4, dtype=np.float32)
        self.doppler = np.zeros(shape, dtype=np.float32)

        a_real = np.zeros(shape, dtype=np.float32)
        a_real[0, 0, 0, 0, 0] = 1.0
        a_real[0, 0, 0, 1, 0] = 2.0
        a_real[0, 1, 0, 0, 0] = 3.0
        a_real[0, 1, 0, 1, 0] = 4.0
        a_real[0, 0, 0, 0, 1] = 5.0
        a_real[0, 1, 0, 0, 1] = 1.0
        self.a = (a_real, np.zeros(shape, dtype=np.float32))

    def taps(self, **_kwargs):
        raise AssertionError("channel taps are not used in this test")

    def cir(self, **_kwargs):
        raise AssertionError("channel CIR is not used in this test")


class FakePathSolver:
    last_kwargs = None

    def __call__(self, scene, *, max_depth, **kwargs):
        FakePathSolver.last_kwargs = {"max_depth": max_depth, **kwargs}
        assert "tx_link" in scene.items
        assert "rx_link" in scene.items
        return FakePaths(max_depth)


class FakeArrayPathSolver:
    def __call__(self, scene, *, max_depth, **_kwargs):
        assert "tx_link" in scene.items
        assert "rx_link" in scene.items
        return FakeArrayPaths(max_depth)


class FakeMobilityPathSolver:
    calls = []

    def __call__(self, scene, *, max_depth, **kwargs):
        tx = scene.items["tx_link"]
        rx = scene.items["rx_link"]
        FakeMobilityPathSolver.calls.append(
            {
                "tx_position": tx.position,
                "rx_position": rx.position,
                "tx_velocity": getattr(tx, "velocity", None),
                "rx_velocity": getattr(rx, "velocity", None),
                "kwargs": kwargs,
            }
        )
        paths = FakePaths(max_depth)
        rx_velocity = np.asarray(getattr(rx, "velocity", [0.0, 0.0, 0.0]), dtype=np.float32)
        paths.doppler = np.asarray([float(np.linalg.norm(rx_velocity))], dtype=np.float32)
        return paths


class FailingPathSolver:
    def __call__(self, *_args, **_kwargs):
        raise RuntimeError("path solver failed")


class FakeRadioMap:
    path_gain = np.asarray([[1.0, 0.5]], dtype=np.float32)


class FakeRadioMapSolver:
    def __call__(self, scene, **_kwargs):
        assert "tx_radiomap" in scene.items
        return FakeRadioMap()


class FailingRadioMapSolver:
    def __call__(self, *_args, **_kwargs):
        raise RuntimeError("radio map solver failed")


def fake_terrain_patch(_scene, **_kwargs):
    return object(), {
        "cell_count": 2,
        "density_level": 1,
        "resolution_mode": "density_level",
        "requested_cell_size": None,
        "resolved_cell_size": 1.0,
        "subdivision_levels": 0,
        "bounds_min": np.asarray([0.0, 0.0, 0.0], dtype=np.float32),
        "bounds_max": np.asarray([1.0, 1.0, 1.0], dtype=np.float32),
        "triangle_positions": np.asarray(
            [
                [[0.0, 0.0, 0.0], [1.0, 0.0, 0.0], [0.0, 1.0, 0.0]],
                [[1.0, 0.0, 0.0], [1.0, 1.0, 0.0], [0.0, 1.0, 0.0]],
            ],
            dtype=np.float32,
        ),
    }


def fake_dense_terrain_patch(_scene, **_kwargs):
    _surface, meta = fake_terrain_patch(_scene)
    return _surface, {**meta, "density_level": 2, "subdivision_levels": 1}


class SolverRuntimeCleanupTests(unittest.TestCase):
    def test_link_solver_removes_temporary_devices_after_success(self) -> None:
        runtime = FakeRuntime()
        FakePathSolver.last_kwargs = None
        result = solve_link(
            runtime,
            {},
            dependencies=(FakeInteractionType, FakePathSolver, FakeDevice, FakeDevice),
        )

        self.assertEqual(result["summary"]["valid_paths"], 1)
        self.assertEqual(result["summary"]["array_pair_paths"], 1)
        self.assertIsNone(result.get("channel"))
        self.assertFalse(FakePathSolver.last_kwargs["synthetic_array"])
        self.assertEqual(runtime.scene.tx_array["num_rows"], 1)
        self.assertEqual(runtime.scene.rx_array["num_cols"], 1)
        self.assertEqual(runtime.scene.items, {})
        self.assertEqual(runtime.scene.removed, ["tx_link", "rx_link"])

    def test_link_solver_groups_array_pair_contributions_by_geometry_path(self) -> None:
        runtime = FakeRuntime()
        result = solve_link(
            runtime,
            {
                "solver": {
                    "max_depth": 2,
                    "samples_per_src": 10,
                    "tx_array": {
                        "num_rows": 2,
                        "num_cols": 2,
                        "vertical_spacing": 0.5,
                        "horizontal_spacing": 0.5,
                        "pattern": "iso",
                        "polarization": "V",
                    },
                    "rx_array": {
                        "num_rows": 2,
                        "num_cols": 1,
                        "vertical_spacing": 0.5,
                        "horizontal_spacing": 0.5,
                        "pattern": "iso",
                        "polarization": "V",
                    },
                }
            },
            dependencies=(FakeInteractionType, FakeArrayPathSolver, FakeDevice, FakeDevice),
        )

        self.assertEqual(result["summary"]["valid_paths"], 2)
        self.assertEqual(result["summary"]["array_pair_paths"], 6)
        self.assertEqual(len(result["paths"]), 2)
        self.assertAlmostEqual(result["paths"][0]["path_gain_linear"], 30.0, places=6)
        self.assertEqual(result["paths"][0]["array_pair_count"], 4)
        self.assertAlmostEqual(result["paths"][0]["strongest_pair_power_db"], 12.041199826, places=6)
        self.assertEqual(result["paths"][0]["power_policy"], "sum_over_antenna_pairs")
        self.assertAlmostEqual(result["paths"][0]["coefficient_real"], 4.0, places=6)
        self.assertAlmostEqual(result["paths"][1]["path_gain_linear"], 26.0, places=6)
        self.assertEqual(result["paths"][1]["array_pair_count"], 2)
        self.assertEqual(result["paths"][1]["type"], "SPECULAR")
        self.assertEqual(result["paths"][1]["polyline"][1], [10.0, 20.0, 30.0])
        self.assertAlmostEqual(result["summary"]["received_power_db"], 17.481880270, places=6)
        self.assertAlmostEqual(result["summary"]["strongest_path_db"], 14.771212547, places=6)

    def test_link_solver_passes_advanced_options_and_summarizes_channel(self) -> None:
        runtime = FakeRuntime()
        FakePathSolver.last_kwargs = None
        result = solve_link(
            runtime,
            {
                "solver": {
                    "max_depth": 2,
                    "samples_per_src": 10,
                    "max_num_paths_per_src": 20,
                    "synthetic_array": True,
                    "diffraction": True,
                    "edge_diffraction": True,
                    "diffraction_lit_region": True,
                    "tx_array": {
                        "num_rows": 2,
                        "num_cols": 4,
                        "vertical_spacing": 0.25,
                        "horizontal_spacing": 0.5,
                        "pattern": "iso",
                        "polarization": "V",
                    },
                    "rx_array": {
                        "num_rows": 3,
                        "num_cols": 2,
                        "vertical_spacing": 0.5,
                        "horizontal_spacing": 0.75,
                        "pattern": "iso",
                        "polarization": "V",
                    },
                },
                "channel": {
                    "compute_taps": True,
                    "l_min": 0,
                    "l_max": 2,
                    "fft_size": 16,
                    "subcarrier_spacing_hz": 1000,
                },
            },
            dependencies=(FakeInteractionType, FakePathSolver, FakeDevice, FakeDevice),
        )

        self.assertEqual(FakePathSolver.last_kwargs["samples_per_src"], 10)
        self.assertEqual(FakePathSolver.last_kwargs["max_num_paths_per_src"], 20)
        self.assertTrue(FakePathSolver.last_kwargs["synthetic_array"])
        self.assertTrue(FakePathSolver.last_kwargs["diffraction"])
        self.assertTrue(FakePathSolver.last_kwargs["edge_diffraction"])
        self.assertTrue(FakePathSolver.last_kwargs["diffraction_lit_region"])
        self.assertEqual(runtime.scene.tx_array["num_rows"], 2)
        self.assertEqual(runtime.scene.tx_array["num_cols"], 4)
        self.assertEqual(runtime.scene.rx_array["num_rows"], 3)
        self.assertEqual(runtime.scene.rx_array["horizontal_spacing"], 0.75)

        channel = result["channel"]
        self.assertEqual(channel["tap_indices"], [0, 1, 2])
        self.assertEqual(channel["delays_s"], [0.0, 0.001, 0.002])
        self.assertAlmostEqual(channel["power_db"][0], 0.0, places=6)
        self.assertAlmostEqual(channel["power_db"][2], 6.020599913, places=6)
        self.assertEqual(channel["peak_tap_index"], 2)
        self.assertAlmostEqual(channel["peak_tap_power_db"], 6.020599913, places=6)
        self.assertAlmostEqual(channel["total_power_db"], 6.989700043, places=6)
        self.assertEqual(channel["cir_summary"]["coefficient_count"], 1)
        self.assertEqual(channel["cir_summary"]["strongest_coefficient_abs"], 5.0)
        self.assertEqual(runtime.scene.items, {})
        self.assertEqual(runtime.scene.removed, ["tx_link", "rx_link"])

    def test_link_solver_sets_device_velocity_for_doppler(self) -> None:
        runtime = FakeRuntime()
        FakeMobilityPathSolver.calls = []
        result = solve_link(
            runtime,
            {
                "tx": {"velocity": [0, 0, 0]},
                "rx": {"velocity": [3, 4, 0]},
                "solver": {"samples_per_src": 10},
            },
            dependencies=(FakeInteractionType, FakeMobilityPathSolver, FakeDevice, FakeDevice),
        )

        self.assertEqual(result["paths"][0]["doppler_hz"], 5.0)
        self.assertEqual(FakeMobilityPathSolver.calls[0]["rx_velocity"], (3.0, 4.0, 0.0))

    def test_link_solver_removes_temporary_devices_after_error(self) -> None:
        runtime = FakeRuntime()

        with self.assertRaises(RuntimeError):
            solve_link(
                runtime,
                {},
                dependencies=(FakeInteractionType, FailingPathSolver, FakeDevice, FakeDevice),
            )

        self.assertEqual(runtime.scene.items, {})
        self.assertEqual(runtime.scene.removed, ["tx_link", "rx_link"])

    def test_mobility_solver_moves_rx_and_aggregates_series(self) -> None:
        runtime = FakeRuntime()
        FakeMobilityPathSolver.calls = []
        result = solve_mobility(
            runtime,
            {
                "tx": {"position": [10, 20, 30]},
                "rx_trajectory": {
                    "points": [[0, 0, 1], [2, 0, 1]],
                    "velocity_mps": 1.0,
                    "time_step_s": 1.0,
                },
                "solver": {
                    "samples_per_src": 10,
                    "max_depth": 2,
                    "tx_array": {
                        "num_rows": 1,
                        "num_cols": 1,
                        "vertical_spacing": 0.5,
                        "horizontal_spacing": 0.5,
                        "pattern": "iso",
                        "polarization": "V",
                    },
                    "rx_array": {
                        "num_rows": 1,
                        "num_cols": 1,
                        "vertical_spacing": 0.5,
                        "horizontal_spacing": 0.5,
                        "pattern": "iso",
                        "polarization": "V",
                    },
                },
                "channel": {"compute_taps": False},
            },
            dependencies=(FakeInteractionType, FakeMobilityPathSolver, FakeDevice, FakeDevice),
        )

        self.assertEqual(result["summary"]["step_count"], 3)
        self.assertEqual(result["summary"]["duration_s"], 2.0)
        self.assertEqual(result["summary"]["max_steps"], 50)
        self.assertEqual(result["trajectory"]["max_steps"], 50)
        self.assertEqual(result["series"]["time_s"], [0.0, 1.0, 2.0])
        self.assertEqual(result["series"]["valid_paths"], [1, 1, 1])
        self.assertEqual(result["series"]["max_abs_doppler_hz"], [1.0, 1.0, 1.0])
        self.assertEqual(result["samples"][1]["rx_position"], [1.0, 0.0, 1.0])
        self.assertEqual(result["samples"][1]["rx_velocity"], [1.0, 0.0, 0.0])
        self.assertEqual(FakeMobilityPathSolver.calls[0]["tx_position"], (10.0, 20.0, 30.0))
        self.assertEqual(FakeMobilityPathSolver.calls[2]["rx_position"], (2.0, 0.0, 1.0))
        self.assertEqual(runtime.scene.items, {})
        self.assertEqual(runtime.scene.removed, ["tx_link", "rx_link"] * 3)

    def test_radiomap_solver_removes_temporary_transmitter_after_success(self) -> None:
        runtime = FakeRuntime()
        with patch("backend.rt.solve_radiomap.build_terrain_patch", fake_terrain_patch):
            result = solve_terrain_radiomap(
                runtime,
                {
                    "surface": {"density_level": 1},
                    "solver": {
                        "samples_per_tx": 10,
                        "tx_array": {
                            "num_rows": 2,
                            "num_cols": 2,
                            "vertical_spacing": 0.5,
                            "horizontal_spacing": 0.5,
                            "pattern": "iso",
                            "polarization": "V",
                        },
                    },
                },
                dependencies=(FakeRadioMapSolver, FakeDevice),
            )

        self.assertEqual(result["values"]["count"], 2)
        self.assertEqual(runtime.scene.tx_array["num_rows"], 2)
        self.assertIsNone(runtime.array_calls[-1]["rx_array"])
        self.assertEqual(runtime.scene.items, {})
        self.assertEqual(runtime.scene.removed, ["tx_radiomap"])

    def test_radiomap_effective_sample_cap_is_enforced_after_patch(self) -> None:
        runtime = FakeRuntime()
        previous = config.MAX_RADIOMAP_EFFECTIVE_SAMPLES
        config.MAX_RADIOMAP_EFFECTIVE_SAMPLES = 30
        try:
            with patch("backend.rt.solve_radiomap.build_terrain_patch", fake_dense_terrain_patch):
                with self.assertRaisesRegex(ValueError, "surface subdivision scaling"):
                    solve_terrain_radiomap(
                        runtime,
                        {"surface": {"density_level": 2}, "solver": {"samples_per_tx": 8}},
                        dependencies=(FakeRadioMapSolver, FakeDevice),
                    )
        finally:
            config.MAX_RADIOMAP_EFFECTIVE_SAMPLES = previous

        self.assertEqual(runtime.scene.items, {})
        self.assertEqual(runtime.scene.removed, ["tx_radiomap"])

    def test_radiomap_solver_removes_temporary_transmitter_after_error(self) -> None:
        runtime = FakeRuntime()
        with patch("backend.rt.solve_radiomap.build_terrain_patch", fake_terrain_patch):
            with self.assertRaises(RuntimeError):
                solve_terrain_radiomap(
                    runtime,
                    {"surface": {"density_level": 1}, "solver": {"samples_per_tx": 10}},
                    dependencies=(FailingRadioMapSolver, FakeDevice),
                )

        self.assertEqual(runtime.scene.items, {})
        self.assertEqual(runtime.scene.removed, ["tx_radiomap"])


if __name__ == "__main__":
    unittest.main()
