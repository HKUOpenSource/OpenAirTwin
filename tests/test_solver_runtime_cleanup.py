from __future__ import annotations

from threading import Lock
import unittest
from unittest.mock import patch

import numpy as np

from backend.rt.solve_link import solve_link
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

    def set_frequency(self, frequency_hz: float) -> None:
        self.scene.frequency = float(frequency_hz)


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


class FakePathSolver:
    last_kwargs = None

    def __call__(self, scene, *, max_depth, **kwargs):
        FakePathSolver.last_kwargs = {"max_depth": max_depth, **kwargs}
        assert "tx_link" in scene.items
        assert "rx_link" in scene.items
        return FakePaths(max_depth)


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
        self.assertIsNone(result.get("channel"))
        self.assertFalse(FakePathSolver.last_kwargs["synthetic_array"])
        self.assertEqual(runtime.scene.items, {})
        self.assertEqual(runtime.scene.removed, ["tx_link", "rx_link"])

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

    def test_radiomap_solver_removes_temporary_transmitter_after_success(self) -> None:
        runtime = FakeRuntime()
        with patch("backend.rt.solve_radiomap.build_terrain_patch", fake_terrain_patch):
            result = solve_terrain_radiomap(
                runtime,
                {"surface": {"density_level": 1}, "solver": {"samples_per_tx": 10}},
                dependencies=(FakeRadioMapSolver, FakeDevice),
            )

        self.assertEqual(result["values"]["count"], 2)
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
