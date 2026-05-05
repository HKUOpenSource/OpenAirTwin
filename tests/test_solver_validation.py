from __future__ import annotations

import unittest

from backend import config
from backend.rt.common import parse_link_payload, parse_radiomap_payload


class SolverValidationTests(unittest.TestCase):
    def test_default_payloads_are_valid(self) -> None:
        link = parse_link_payload({})
        radiomap = parse_radiomap_payload({})

        self.assertEqual(link["max_depth"], config.DEFAULT_MAX_DEPTH)
        self.assertEqual(link["samples_per_src"], config.DEFAULT_LINK_SAMPLES)
        self.assertEqual(link["max_num_paths_per_src"], config.DEFAULT_LINK_MAX_NUM_PATHS_PER_SRC)
        self.assertFalse(link["synthetic_array"])
        self.assertFalse(link["diffraction"])
        self.assertFalse(link["edge_diffraction"])
        self.assertFalse(link["diffraction_lit_region"])
        self.assertFalse(link["compute_taps"])
        self.assertEqual(link["channel_tap_count"], config.DEFAULT_LINK_TAPS_L_MAX - config.DEFAULT_LINK_TAPS_L_MIN + 1)
        self.assertEqual(radiomap["surface_density_level"], config.DEFAULT_RADIOMAP_DENSITY_LEVEL)
        self.assertEqual(
            radiomap["samples_per_tx"],
            config.DEFAULT_RADIOMAP_SAMPLES * (4 ** (config.DEFAULT_RADIOMAP_DENSITY_LEVEL - 1)),
        )

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
            {"surface": {"height_offset": -0.1}},
            {"surface": {"size": [0, 160]}},
            {"solver": {"samples_per_tx": config.MAX_RADIOMAP_SAMPLES + 1}},
            {"solver": {"max_depth": config.MAX_SOLVER_DEPTH + 1}},
        ]

        for payload in invalid_payloads:
            with self.subTest(payload=payload):
                with self.assertRaises(ValueError):
                    parse_radiomap_payload(payload)

    def test_radiomap_effective_sample_cap_is_enforced(self) -> None:
        previous = config.MAX_RADIOMAP_EFFECTIVE_SAMPLES
        config.MAX_RADIOMAP_EFFECTIVE_SAMPLES = 100
        try:
            with self.assertRaisesRegex(ValueError, "density scaling"):
                parse_radiomap_payload(
                    {
                        "surface": {"density_level": 2},
                        "solver": {"samples_per_tx": 26},
                    }
                )
        finally:
            config.MAX_RADIOMAP_EFFECTIVE_SAMPLES = previous


if __name__ == "__main__":
    unittest.main()
