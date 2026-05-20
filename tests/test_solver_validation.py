from __future__ import annotations

import unittest

from backend import config
from backend.rt.common import (
    antenna_array_default_config,
    parse_link_payload,
    parse_mobility_payload,
    parse_radiomap_payload,
)
from backend.rt.deepmimo_payload import parse_deepmimo_payload, sanitize_scenario_name


class SolverValidationTests(unittest.TestCase):
    def test_default_payloads_are_valid(self) -> None:
        link = parse_link_payload({})
        radiomap = parse_radiomap_payload({})
        default_array = antenna_array_default_config()

        self.assertEqual(link["max_depth"], config.DEFAULT_MAX_DEPTH)
        self.assertEqual(link["samples_per_src"], config.DEFAULT_LINK_SAMPLES)
        self.assertEqual(link["max_num_paths_per_src"], config.DEFAULT_LINK_MAX_NUM_PATHS_PER_SRC)
        self.assertEqual(link["tx_array"], default_array)
        self.assertEqual(link["rx_array"], default_array)
        self.assertFalse(link["synthetic_array"])
        self.assertFalse(link["diffraction"])
        self.assertFalse(link["edge_diffraction"])
        self.assertFalse(link["diffraction_lit_region"])
        self.assertFalse(link["compute_taps"])
        self.assertEqual(link["tx_velocity"], (0.0, 0.0, 0.0))
        self.assertEqual(link["rx_velocity"], (0.0, 0.0, 0.0))
        self.assertEqual(link["channel_tap_count"], config.DEFAULT_LINK_TAPS_L_MAX - config.DEFAULT_LINK_TAPS_L_MIN + 1)
        self.assertEqual(radiomap["tx_array"], default_array)
        self.assertEqual(radiomap["surface_density_level"], config.DEFAULT_RADIOMAP_DENSITY_LEVEL)
        self.assertIsNone(radiomap["surface_cell_size"])
        self.assertEqual(radiomap["surface_resolution_mode"], "density_level")
        self.assertEqual(radiomap["base_samples_per_tx"], config.DEFAULT_RADIOMAP_SAMPLES)

    def test_deepmimo_payload_is_sanitized_and_forces_synthetic_arrays(self) -> None:
        parsed = parse_deepmimo_payload(
            {
                "roi": {"min": [10, 20], "max": [2, 6]},
                "tx": {"position": [1, 2, 3]},
                "rx_grid": {"spacing": 1.0, "max_receivers": 200, "filter_buildings": False},
                "scene": {"tile_ids": ["TILE_A", "TILE_B", "TILE_A"]},
                "solver": {"synthetic_array": False, "samples_per_src": 42, "diffraction": True},
                "export": {"scenario_name": "../HKU demo data"},
            }
        )

        self.assertEqual(parsed["roi"]["min"], (2.0, 6.0))
        self.assertEqual(parsed["roi"]["max"], (10.0, 20.0))
        self.assertEqual(parsed["roi"]["size"], (8.0, 14.0))
        self.assertTrue(parsed["solver"]["synthetic_array"])
        self.assertEqual(parsed["scene"]["mode"], "selected_tiles")
        self.assertEqual(parsed["scene"]["tile_ids"], ("TILE_A", "TILE_B"))
        self.assertEqual(parsed["solver"]["samples_per_src"], 42)
        self.assertTrue(parsed["solver"]["diffraction"])
        self.assertFalse(parsed["rx_grid"]["filter_buildings"])
        self.assertEqual(parsed["export"]["scenario_name"], "HKU_demo_data")

    def test_deepmimo_payload_defaults_max_receivers_to_30000(self) -> None:
        parsed = parse_deepmimo_payload(
            {
                "roi": {"min": [0, 0], "max": [1, 1]},
                "scene": {"tile_ids": ["TILE_A"]},
            }
        )

        self.assertEqual(config.DEEPMIMO_DEFAULT_MAX_RECEIVERS, 30000)
        self.assertEqual(parsed["rx_grid"]["max_receivers"], 30000)

    def test_deepmimo_payload_bounds_are_enforced(self) -> None:
        for payload in [
            {"roi": {"min": [0, 0], "max": [0, 1]}},
            {"roi": {"min": [0, 0], "max": [1, 1]}, "scene": {"tile_ids": []}},
            {"roi": {"min": [0, 0], "max": [1, 1]}, "scene": {"tile_ids": ["TILE_A"]}, "rx_grid": {"spacing": 0.01}},
            {"roi": {"min": [0, 0], "max": [1, 1]}, "scene": {"tile_ids": ["TILE_A"]}, "rx_grid": {"max_receivers": config.DEEPMIMO_MAX_RECEIVERS + 1}},
            {"roi": {"min": [0, 0], "max": [1, 1]}, "scene": {"tile_ids": ["TILE_A"]}, "rx_grid": {"filter_buildings": "maybe"}},
        ]:
            with self.subTest(payload=payload):
                with self.assertRaises(ValueError):
                    parse_deepmimo_payload(payload)

        self.assertEqual(sanitize_scenario_name("HKU:ROI/01"), "HKU_ROI_01")

    def test_deepmimo_payload_rejects_oversized_receiver_grid(self) -> None:
        with self.assertRaisesRegex(ValueError, "ROI grid creates 121 receivers, above max_receivers=120"):
            parse_deepmimo_payload(
                {
                    "roi": {"min": [0, 0], "max": [10, 10]},
                    "scene": {"tile_ids": ["TILE_A"]},
                    "rx_grid": {"spacing": 1.0, "max_receivers": 120},
                }
            )

    def test_antenna_array_payloads_are_validated(self) -> None:
        link = parse_link_payload(
            {
                "solver": {
                    "tx_array": {
                        "num_rows": "2",
                        "num_cols": 4,
                        "vertical_spacing": "0.25",
                        "horizontal_spacing": 0.75,
                        "pattern": "iso",
                        "polarization": "V",
                    },
                    "rx_array": {
                        "num_rows": 3,
                        "num_cols": 1,
                        "vertical_spacing": 0.5,
                        "horizontal_spacing": 0.5,
                        "pattern": "iso",
                        "polarization": "V",
                    },
                }
            }
        )

        self.assertEqual(link["tx_array"]["num_rows"], 2)
        self.assertEqual(link["tx_array"]["num_cols"], 4)
        self.assertEqual(link["tx_array"]["vertical_spacing"], 0.25)
        self.assertEqual(link["tx_array"]["horizontal_spacing"], 0.75)
        self.assertEqual(link["rx_array"]["num_rows"], 3)

        radiomap = parse_radiomap_payload(
            {
                "solver": {
                    "tx_array": {
                        "num_rows": 2,
                        "num_cols": 2,
                        "vertical_spacing": 0.5,
                        "horizontal_spacing": 0.5,
                        "pattern": "iso",
                        "polarization": "V",
                    }
                }
            }
        )
        self.assertEqual(radiomap["tx_array"]["num_rows"], 2)

    def test_antenna_array_bounds_are_enforced(self) -> None:
        invalid_payloads = [
            {"solver": {"tx_array": {"num_rows": config.MAX_ANTENNA_ARRAY_ROWS + 1}}},
            {"solver": {"tx_array": {"num_cols": config.MAX_ANTENNA_ARRAY_COLS + 1}}},
            {"solver": {"tx_array": {"vertical_spacing": config.MIN_ANTENNA_ARRAY_SPACING / 2}}},
            {"solver": {"tx_array": {"horizontal_spacing": config.MAX_ANTENNA_ARRAY_SPACING + 1}}},
            {"solver": {"tx_array": {"pattern": "not-a-pattern"}}},
            {"solver": {"tx_array": {"polarization": "not-a-polarization"}}},
            {"solver": {"rx_array": {"num_rows": False}}},
        ]

        for payload in invalid_payloads:
            with self.subTest(payload=payload):
                with self.assertRaises(ValueError):
                    parse_link_payload(payload)

        previous = config.MAX_ANTENNA_ARRAY_ELEMENTS
        config.MAX_ANTENNA_ARRAY_ELEMENTS = 4
        try:
            with self.assertRaisesRegex(ValueError, "element count"):
                parse_link_payload({"solver": {"tx_array": {"num_rows": 3, "num_cols": 2}}})
        finally:
            config.MAX_ANTENNA_ARRAY_ELEMENTS = previous

    def test_boolean_strings_are_strictly_parsed(self) -> None:
        parsed = parse_link_payload(
            {
                "solver": {
                    "los": "false",
                    "specular_reflection": "true",
                    "diffuse_reflection": "off",
                    "refraction": "on",
                }
            }
        )

        self.assertFalse(parsed["los"])
        self.assertTrue(parsed["specular_reflection"])
        self.assertFalse(parsed["diffuse_reflection"])
        self.assertTrue(parsed["refraction"])

        with self.assertRaisesRegex(ValueError, "solver.los must be a boolean"):
            parse_link_payload({"solver": {"los": "maybe"}})

    def test_vectors_must_be_finite_numbers(self) -> None:
        with self.assertRaisesRegex(ValueError, "tx.position\\[2\\] must be a finite number"):
            parse_link_payload({"tx": {"position": [1.0, 2.0, float("nan")]}})

        with self.assertRaisesRegex(ValueError, "rx.position must contain exactly 3 numeric values"):
            parse_link_payload({"rx": {"position": "1,2,3"}})

        parsed = parse_link_payload({"rx": {"velocity": [1, 2, 3]}})
        self.assertEqual(parsed["rx_velocity"], (1.0, 2.0, 3.0))

    def test_link_solver_bounds_are_enforced(self) -> None:
        invalid_payloads = [
            {"solver": {"frequency_hz": config.MIN_FREQUENCY_HZ - 1}},
            {"solver": {"frequency_hz": config.MAX_FREQUENCY_HZ + 1}},
            {"solver": {"max_depth": config.MAX_SOLVER_DEPTH + 1}},
            {"solver": {"max_depth": 1.5}},
            {"solver": {"samples_per_src": config.MAX_LINK_SAMPLES + 1}},
            {"solver": {"max_num_paths_per_src": config.MAX_LINK_MAX_NUM_PATHS_PER_SRC + 1}},
            {"solver": {"seed": config.MAX_SOLVER_SEED + 1}},
            {"solver": {"seed": -1}},
        ]

        for payload in invalid_payloads:
            with self.subTest(payload=payload):
                with self.assertRaises(ValueError):
                    parse_link_payload(payload)

    def test_advanced_link_options_are_validated(self) -> None:
        parsed = parse_link_payload(
            {
                "solver": {
                    "synthetic_array": "true",
                    "diffraction": "on",
                    "edge_diffraction": "1",
                    "diffraction_lit_region": False,
                    "max_num_paths_per_src": 10,
                },
                "channel": {
                    "compute_taps": "true",
                    "l_min": -2,
                    "l_max": 2,
                    "fft_size": 256,
                    "subcarrier_spacing_hz": 15000,
                },
            }
        )

        self.assertTrue(parsed["synthetic_array"])
        self.assertTrue(parsed["diffraction"])
        self.assertTrue(parsed["edge_diffraction"])
        self.assertFalse(parsed["diffraction_lit_region"])
        self.assertEqual(parsed["max_num_paths_per_src"], 10)
        self.assertTrue(parsed["compute_taps"])
        self.assertEqual(parsed["channel_tap_count"], 5)
        self.assertEqual(parsed["channel_fft_size"], 256)

        invalid_payloads = [
            {"solver": {"diffraction": "maybe"}},
            {"channel": {"compute_taps": "sometimes"}},
            {"channel": {"l_min": 4, "l_max": 3}},
            {"channel": {"l_min": 0, "l_max": config.MAX_LINK_TAP_COUNT}},
            {"channel": {"fft_size": config.MAX_LINK_FFT_SIZE + 1}},
            {"channel": {"subcarrier_spacing_hz": config.MAX_LINK_SUBCARRIER_SPACING_HZ + 1}},
            {"channel": {"num_time_steps": 2}},
        ]

        for payload in invalid_payloads:
            with self.subTest(payload=payload):
                with self.assertRaises(ValueError):
                    parse_link_payload(payload)

    def test_radiomap_solver_bounds_are_enforced(self) -> None:
        invalid_payloads = [
            {"surface": {"density_level": config.MAX_RADIOMAP_DENSITY_LEVEL + 1}},
            {"surface": {"cell_size": config.MIN_RADIOMAP_CELL_SIZE / 2}},
            {"surface": {"cell_size": config.MAX_RADIOMAP_CELL_SIZE + 1}},
            {"surface": {"height_offset": -0.1}},
            {"surface": {"size": [0, 160]}},
            {"solver": {"samples_per_tx": config.MAX_RADIOMAP_SAMPLES + 1}},
            {"solver": {"max_depth": config.MAX_SOLVER_DEPTH + 1}},
        ]

        for payload in invalid_payloads:
            with self.subTest(payload=payload):
                with self.assertRaises(ValueError):
                    parse_radiomap_payload(payload)

    def test_radiomap_cell_size_overrides_density_mode(self) -> None:
        parsed = parse_radiomap_payload(
            {
                "surface": {"cell_size": "2.5", "density_level": 1},
                "solver": {"samples_per_tx": 26},
            }
        )

        self.assertEqual(parsed["surface_cell_size"], 2.5)
        self.assertEqual(parsed["surface_resolution_mode"], "cell_size")
        self.assertEqual(parsed["surface_density_level"], 1)
        self.assertEqual(parsed["base_samples_per_tx"], 26)

    def test_mobility_payload_samples_rx_trajectory(self) -> None:
        parsed = parse_mobility_payload(
            {
                "tx": {"position": [1, 2, 3]},
                "rx_trajectory": {
                    "points": [[0, 0, 0], [3, 4, 0]],
                    "velocity_mps": 2.5,
                    "time_step_s": 1.0,
                },
                "solver": {
                    "samples_per_src": 10,
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
            }
        )

        trajectory = parsed["rx_trajectory"]
        self.assertTrue(parsed["compute_taps"])
        self.assertEqual(parsed["tx_position"], (1.0, 2.0, 3.0))
        self.assertEqual(trajectory["total_distance_m"], 5.0)
        self.assertEqual(trajectory["duration_s"], 2.0)
        self.assertEqual(trajectory["max_steps"], config.DEFAULT_MOBILITY_MAX_STEPS)
        self.assertEqual(len(trajectory["samples"]), 3)
        self.assertEqual(trajectory["samples"][1]["position"], (1.5, 2.0, 0.0))
        self.assertEqual(trajectory["samples"][1]["velocity"], (1.5, 2.0, 0.0))

    def test_mobility_payload_accepts_custom_max_steps(self) -> None:
        parsed = parse_mobility_payload(
            {
                "rx_trajectory": {
                    "points": [[0, 0, 0], [60, 0, 0]],
                    "velocity_mps": 1.0,
                    "time_step_s": 1.0,
                    "max_steps": 1200,
                }
            }
        )

        trajectory = parsed["rx_trajectory"]
        self.assertEqual(trajectory["max_steps"], 1200)
        self.assertEqual(len(trajectory["samples"]), 61)

    def test_mobility_payload_bounds_are_enforced(self) -> None:
        valid_points = [[0, 0, 0], [3, 0, 0]]
        invalid_payloads = [
            {"rx_trajectory": {"points": [[0, 0, 0]]}},
            {"rx_trajectory": {"points": [[0, 0, 0], [0, 0, 0]]}},
            {"rx_trajectory": {"points": valid_points, "velocity_mps": config.MIN_MOBILITY_VELOCITY_MPS / 2}},
            {"rx_trajectory": {"points": valid_points, "velocity_mps": config.MAX_MOBILITY_VELOCITY_MPS + 1}},
            {"rx_trajectory": {"points": valid_points, "time_step_s": config.MIN_MOBILITY_TIME_STEP_S / 2}},
            {"rx_trajectory": {"points": valid_points, "time_step_s": config.MAX_MOBILITY_TIME_STEP_S + 1}},
            {"rx_trajectory": {"points": valid_points, "max_steps": config.MIN_MOBILITY_STEPS - 1}},
            {"rx_trajectory": {"points": valid_points, "max_steps": 3.5}},
        ]

        for payload in invalid_payloads:
            with self.subTest(payload=payload):
                with self.assertRaises(ValueError):
                    parse_mobility_payload(payload)

        with self.assertRaisesRegex(ValueError, "increase rx_trajectory.max_steps"):
            parse_mobility_payload(
                {
                    "rx_trajectory": {
                        "points": [[0, 0, 0], [10, 0, 0]],
                        "velocity_mps": 1.0,
                        "time_step_s": 1.0,
                        "max_steps": 3,
                    }
                }
            )

        with self.assertRaisesRegex(ValueError, "computed steps"):
            parse_mobility_payload(
                {
                    "rx_trajectory": {
                        "points": [[0, 0, 0], [1001, 0, 0]],
                        "velocity_mps": 1.0,
                        "time_step_s": 1.0,
                    }
                }
            )


if __name__ == "__main__":
    unittest.main()
