from __future__ import annotations

from copy import deepcopy
import math
import unittest
from unittest.mock import patch

import numpy as np

from backend import config
from backend.rt.process_radar import _focus_range_doppler, process_radar_propagation
from backend.rt.radar_payload import (
    RADAR_ANGLE_ESTIMATION_APPLICABILITY,
    RADAR_ANGLE_ESTIMATION_METHOD,
    SPEED_OF_LIGHT_MPS,
    validate_radar_result,
)


def target(target_id: str, *, position: list[float], velocity: list[float] | None = None) -> dict:
    return {
        "id": target_id,
        "asset_id": "dji-mini-3-pro",
        "position": position,
        "orientation": [0.0, 0.0, 0.0],
        "velocity": velocity or [0.0, 0.0, 0.0],
        "rcs_m2": 0.02,
    }


def request(
    *,
    mode: str = "monostatic",
    targets: list[dict] | None = None,
    num_subcarriers: int = 512,
    num_symbols: int = 256,
    bandwidth_hz: float = 16e6,
    cfar_enabled: bool = True,
    seed: int = 19,
    direct_path_cancellation: bool = True,
) -> dict:
    payload = {
        "schema_version": 1,
        "mode": mode,
        "tx": {"position": [0.0, 0.0, 5.0]},
        "targets": targets or [],
        "waveform": {
            "carrier_frequency_hz": 6e9,
            "bandwidth_hz": bandwidth_hz,
            "num_subcarriers": num_subcarriers,
            "num_symbols": num_symbols,
        },
        "solver": {
            "seed": seed,
            "tx_array": {
                "num_rows": 2,
                "num_cols": 2,
                "vertical_spacing": 0.5,
                "horizontal_spacing": 0.5,
                "pattern": "iso",
                "polarization": "V",
            },
        },
        "signal": {
            "tx_power_dbm": 30.0,
            "noise_figure_db": 0.0,
            "system_loss_db": 0.0,
            "noise_temperature_k": 290.0,
            "direct_path_cancellation": direct_path_cancellation,
        },
        "cfar": {
            "enabled": cfar_enabled,
            "guard_cells_range": 1,
            "guard_cells_doppler": 1,
            "training_cells_range": 2,
            "training_cells_doppler": 2,
            "false_alarm_probability": 1e-8,
        },
    }
    if mode == "bistatic":
        payload["rx"] = {"position": [0.0, 8.0, 5.0]}
        payload["solver"]["rx_array"] = dict(payload["solver"]["tx_array"])
    return payload


def propagation_target(value: dict) -> dict:
    return {
        **value,
        "visual_instance_id": f"radar-target-visual-{value['id']}",
        "sionna_object_name": f"radar-target-{value['id']}",
    }


def path(
    path_id: str,
    *,
    equivalent_range_m: float,
    doppler_hz: float,
    coefficient_abs: float = 1e-7,
    classification: str = "target",
    target_ids: list[str] | None = None,
    arrival_azimuth_deg: float = 15.0,
    arrival_zenith_deg: float = 80.0,
) -> dict:
    path_length_m = 2.0 * equivalent_range_m
    return {
        "path_id": path_id,
        "classification": classification,
        "target_ids": list(target_ids or []),
        "coefficient_real": coefficient_abs,
        "coefficient_imag": 0.0,
        "path_gain_linear": coefficient_abs * coefficient_abs,
        "path_gain_db": 20.0 * math.log10(coefficient_abs),
        "delay_s": path_length_m / SPEED_OF_LIGHT_MPS,
        "doppler_hz": doppler_hz,
        "path_length_m": path_length_m,
        "equivalent_range_m": equivalent_range_m,
        "departure_azimuth_deg": 0.0,
        "departure_zenith_deg": 90.0,
        "arrival_azimuth_deg": arrival_azimuth_deg,
        "arrival_zenith_deg": arrival_zenith_deg,
        "polyline": [[0.0, 0.0, 5.0], [equivalent_range_m, 0.0, 5.0], [0.0, 0.0, 5.0]],
    }


def propagation(payload: dict, paths: list[dict]) -> dict:
    return {
        "ok": True,
        "scene_generation": 7,
        "targets": [propagation_target(value) for value in payload.get("targets", [])],
        "paths": paths,
        "timing": {"total_runtime_ms": 12.5},
    }


def find_target_detection(result: dict, target_id: str) -> dict:
    return next(item for item in result["detections"] if item["target_id"] == target_id)


class RadarOfdmProcessingTests(unittest.TestCase):
    def test_processing_views_suppress_static_clutter_with_shared_noise(self) -> None:
        moving_target = target("moving", position=[150.0, 0.0, 5.0], velocity=[-10.0, 0.0, 0.0])
        payload = request(
            targets=[moving_target],
            num_subcarriers=64,
            num_symbols=32,
            bandwidth_hz=16e6,
            cfar_enabled=False,
        )
        range_resolution = SPEED_OF_LIGHT_MPS / (2.0 * payload["waveform"]["bandwidth_hz"])
        doppler_resolution = (
            payload["waveform"]["bandwidth_hz"]
            / payload["waveform"]["num_subcarriers"]
            / payload["waveform"]["num_symbols"]
        )
        result = process_radar_propagation(
            payload,
            propagation(
                payload,
                [
                    path(
                        "static-clutter",
                        equivalent_range_m=8.0 * range_resolution,
                        doppler_hz=0.0,
                        coefficient_abs=1e-5,
                        classification="clutter",
                    ),
                    path(
                        "moving-target",
                        equivalent_range_m=16.0 * range_resolution,
                        doppler_hz=4.0 * doppler_resolution,
                        coefficient_abs=1e-7,
                        target_ids=["moving"],
                    ),
                ],
            ),
        )

        raw = result["range_doppler"]
        mean_subtracted = result["processing_views"]["mean_subtracted"]["range_doppler"]
        ideal = result["processing_views"]["ideal_clutter_cancelled"]["range_doppler"]
        zero_row = int(np.argmin(np.abs(np.asarray(raw["doppler_axis_hz"]))))
        moving_row = int(np.argmin(np.abs(np.asarray(raw["doppler_axis_hz"]) - 4.0 * doppler_resolution)))
        clutter_column = int(np.argmin(np.abs(np.asarray(raw["equivalent_range_axis_m"]) - 8.0 * range_resolution)))
        target_column = int(np.argmin(np.abs(np.asarray(raw["equivalent_range_axis_m"]) - 16.0 * range_resolution)))

        self.assertGreater(
            raw["power_dbm"][zero_row][clutter_column]
            - mean_subtracted["power_dbm"][zero_row][clutter_column],
            40.0,
        )
        self.assertGreater(
            raw["power_dbm"][zero_row][clutter_column]
            - ideal["power_dbm"][zero_row][clutter_column],
            40.0,
        )
        self.assertAlmostEqual(
            raw["power_dbm"][moving_row][target_column],
            mean_subtracted["power_dbm"][moving_row][target_column],
            delta=0.5,
        )
        self.assertAlmostEqual(
            raw["power_dbm"][moving_row][target_column],
            ideal["power_dbm"][moving_row][target_column],
            delta=0.5,
        )
        self.assertEqual(
            result["processing_views"]["mean_subtracted"]["method"],
            "slow_time_complex_mean_subtraction",
        )
        self.assertEqual(result["statistics"]["ideal_cancelled_clutter_path_count"], 1)
        self.assertIs(validate_radar_result(result), result)

    def test_target_focus_ignores_far_clutter_detections(self) -> None:
        range_axis = np.arange(512, dtype=float)
        doppler_axis = np.linspace(-2000.0, 2000.0, 256)
        velocity_axis = -doppler_axis
        power = np.ones((256, 512), dtype=float)
        focused = _focus_range_doppler(
            power,
            range_axis,
            doppler_axis,
            velocity_axis,
            paths=[{"classification": "target", "equivalent_range_m": 40.0, "doppler_hz": 250.0}],
            detections=[{"classification": "clutter", "equivalent_range_m": 300.0, "doppler_hz": 0.0}],
            range_resolution_m=1.0,
            doppler_resolution_hz=15.7,
            unambiguous_range_m=512.0,
            doppler_sampling_rate_hz=4000.0,
        )
        self.assertLess(focused["window"]["equivalent_range_max_m"], 100.0)
        self.assertGreaterEqual(focused["window"]["doppler_max_hz"], 250.0)

    def test_point_targets_resolve_range_doppler_velocity_and_ids(self) -> None:
        static_target = target("static", position=[75.0, 0.0, 5.0])
        moving_target = target("moving", position=[170.0, 0.0, 5.0], velocity=[-15.0, 0.0, 0.0])
        payload = request(targets=[static_target, moving_target])
        delta_f = payload["waveform"]["bandwidth_hz"] / payload["waveform"]["num_subcarriers"]
        doppler_resolution = delta_f / payload["waveform"]["num_symbols"]
        range_resolution = SPEED_OF_LIGHT_MPS / (2.0 * payload["waveform"]["bandwidth_hz"])
        static_range = 8.0 * range_resolution
        moving_range = 18.0 * range_resolution
        moving_doppler = 5.0 * doppler_resolution
        result = process_radar_propagation(
            payload,
            propagation(
                payload,
                [
                    path("static-path", equivalent_range_m=static_range, doppler_hz=0.0, target_ids=["static"]),
                    path(
                        "moving-path",
                        equivalent_range_m=moving_range,
                        doppler_hz=moving_doppler,
                        target_ids=["moving"],
                        arrival_azimuth_deg=-35.0,
                        arrival_zenith_deg=72.0,
                    ),
                ],
            ),
        )

        static_detection = find_target_detection(result, "static")
        moving_detection = find_target_detection(result, "moving")
        self.assertLessEqual(abs(static_detection["equivalent_range_m"] - static_range), range_resolution)
        self.assertLessEqual(abs(static_detection["doppler_hz"]), doppler_resolution)
        self.assertLessEqual(abs(moving_detection["equivalent_range_m"] - moving_range), range_resolution)
        self.assertLessEqual(abs(moving_detection["doppler_hz"] - moving_doppler), doppler_resolution)
        self.assertLess(moving_detection["equivalent_radial_velocity_mps"], 0.0)
        self.assertEqual(moving_detection["arrival_azimuth_deg"], -35.0)
        self.assertEqual(moving_detection["arrival_zenith_deg"], 72.0)
        self.assertEqual(result["radar"]["angle_estimation_method"], RADAR_ANGLE_ESTIMATION_METHOD)
        self.assertEqual(
            result["radar"]["angle_estimation_applicability"],
            RADAR_ANGLE_ESTIMATION_APPLICABILITY,
        )
        focus = result["range_doppler_focus"]
        self.assertLess(
            len(focus["equivalent_range_axis_m"]),
            len(result["range_doppler"]["equivalent_range_axis_m"]),
        )
        for expected_range, expected_doppler in (
            (static_range, 0.0),
            (moving_range, moving_doppler),
        ):
            self.assertLessEqual(focus["equivalent_range_axis_m"][0] - range_resolution, expected_range)
            self.assertGreaterEqual(focus["equivalent_range_axis_m"][-1] + range_resolution, expected_range)
            self.assertLessEqual(focus["doppler_axis_hz"][0] - doppler_resolution, expected_doppler)
            self.assertGreaterEqual(focus["doppler_axis_hz"][-1] + doppler_resolution, expected_doppler)
        self.assertEqual(
            result["range_doppler"]["source_shape"],
            {"doppler_bins": 256, "range_bins": 512},
        )

    def test_bistatic_range_and_receding_velocity_use_frozen_equivalent_conventions(self) -> None:
        drone = target("bistatic", position=[100.0, 2.0, 5.0], velocity=[12.0, 0.0, 0.0])
        payload = request(mode="bistatic", targets=[drone])
        delta_f = payload["waveform"]["bandwidth_hz"] / payload["waveform"]["num_subcarriers"]
        doppler_resolution = delta_f / payload["waveform"]["num_symbols"]
        range_resolution = SPEED_OF_LIGHT_MPS / (2.0 * payload["waveform"]["bandwidth_hz"])
        equivalent_range = 12.0 * range_resolution
        receding_doppler = -4.0 * doppler_resolution
        result = process_radar_propagation(
            payload,
            propagation(
                payload,
                [
                    path(
                        "bistatic-path",
                        equivalent_range_m=equivalent_range,
                        doppler_hz=receding_doppler,
                        target_ids=["bistatic"],
                    )
                ],
            ),
        )

        detection = find_target_detection(result, "bistatic")
        self.assertLessEqual(abs(detection["equivalent_range_m"] - equivalent_range), range_resolution)
        self.assertGreater(detection["equivalent_radial_velocity_mps"], 0.0)
        self.assertEqual(result["summary"]["mode"], "bistatic")

    def test_clutter_contributes_without_receiving_a_target_id(self) -> None:
        drone = target("drone", position=[80.0, 0.0, 5.0])
        payload = request(targets=[drone])
        range_resolution = SPEED_OF_LIGHT_MPS / (2.0 * payload["waveform"]["bandwidth_hz"])
        result = process_radar_propagation(
            payload,
            propagation(
                payload,
                [
                    path("target", equivalent_range_m=8 * range_resolution, doppler_hz=0.0, target_ids=["drone"]),
                    path(
                        "clutter",
                        equivalent_range_m=22 * range_resolution,
                        doppler_hz=0.0,
                        coefficient_abs=2e-7,
                        classification="clutter",
                    ),
                ],
            ),
        )

        self.assertEqual(result["summary"]["total_target_path_count"], 1)
        self.assertEqual(result["summary"]["total_clutter_path_count"], 1)
        self.assertTrue(any(item["target_id"] == "drone" for item in result["detections"]))
        clutter_ranges = [
            item for item in result["detections"] if item["target_id"] is None
        ]
        self.assertTrue(clutter_ranges)

    def test_empty_scene_is_reproducible_and_returns_noise_only_without_artifacts(self) -> None:
        payload = request(cfar_enabled=True, seed=123)
        payload["cfar"]["false_alarm_probability"] = 1e-12
        first = process_radar_propagation(payload, propagation(payload, []))
        second = process_radar_propagation(payload, propagation(payload, []))

        self.assertEqual(first["summary"]["target_count"], 0)
        self.assertEqual(first["summary"]["returned_path_count"], 0)
        self.assertEqual(first["detections"], second["detections"])
        self.assertEqual(first["range_profile"], second["range_profile"])
        self.assertEqual(first["range_doppler"], second["range_doppler"])
        self.assertGreater(len(first["range_profile"]["power_dbm"]), 0)

        forbidden = {"iq", "raw_iq", "download", "download_url", "file", "file_path"}

        def assert_no_artifacts(value) -> None:
            if isinstance(value, dict):
                self.assertFalse(forbidden & set(value))
                for child in value.values():
                    assert_no_artifacts(child)
            elif isinstance(value, list):
                for child in value:
                    assert_no_artifacts(child)

        assert_no_artifacts(first)

    def test_cfar_does_not_report_a_below_noise_target(self) -> None:
        weak = target("weak", position=[100.0, 0.0, 5.0])
        payload = request(targets=[weak], seed=211)
        payload["cfar"]["false_alarm_probability"] = 1e-12
        range_resolution = SPEED_OF_LIGHT_MPS / (2.0 * payload["waveform"]["bandwidth_hz"])
        result = process_radar_propagation(
            payload,
            propagation(
                payload,
                [
                    path(
                        "below-noise",
                        equivalent_range_m=10.0 * range_resolution,
                        doppler_hz=0.0,
                        coefficient_abs=1e-12,
                        target_ids=["weak"],
                    )
                ],
            ),
        )

        self.assertFalse(any(item["target_id"] == "weak" for item in result["detections"]))

    def test_known_direct_path_is_cancelled_before_range_doppler_processing(self) -> None:
        drone = target("drone", position=[120.0, 0.0, 5.0])
        range_bin = 24
        direct_bin = 8
        compensated_payload = request(targets=[drone])
        uncompensated_payload = request(targets=[drone], direct_path_cancellation=False)
        range_resolution = SPEED_OF_LIGHT_MPS / (2.0 * compensated_payload["waveform"]["bandwidth_hz"])
        paths = [
            path(
                "direct-leakage",
                equivalent_range_m=direct_bin * range_resolution,
                doppler_hz=0.0,
                coefficient_abs=1e-4,
                classification="direct",
            ),
            path(
                "target-return",
                equivalent_range_m=range_bin * range_resolution,
                doppler_hz=0.0,
                coefficient_abs=1e-7,
                target_ids=["drone"],
            ),
        ]

        compensated = process_radar_propagation(
            compensated_payload,
            propagation(compensated_payload, paths),
        )
        uncompensated = process_radar_propagation(
            uncompensated_payload,
            propagation(uncompensated_payload, paths),
        )

        compensated_peak_bin = max(
            range(len(compensated["range_profile"]["power_dbm"])),
            key=compensated["range_profile"]["power_dbm"].__getitem__,
        )
        uncompensated_peak_bin = max(
            range(len(uncompensated["range_profile"]["power_dbm"])),
            key=uncompensated["range_profile"]["power_dbm"].__getitem__,
        )
        self.assertLessEqual(abs(compensated_peak_bin - range_bin), 1)
        self.assertLessEqual(abs(uncompensated_peak_bin - direct_bin), 1)
        self.assertTrue(any(item["target_id"] == "drone" for item in compensated["detections"]))
        self.assertEqual(compensated["summary"]["total_direct_path_count"], 1)
        self.assertEqual(compensated["statistics"]["cancelled_direct_path_count"], 1)
        self.assertTrue(compensated["statistics"]["direct_path_cancellation_enabled"])
        self.assertEqual(uncompensated["statistics"]["cancelled_direct_path_count"], 0)
        self.assertFalse(uncompensated["statistics"]["direct_path_cancellation_enabled"])

    def test_range_doppler_output_is_bounded_and_records_unambiguous_limits(self) -> None:
        payload = request(
            num_subcarriers=1024,
            num_symbols=512,
            bandwidth_hz=32e6,
            cfar_enabled=False,
        )
        result = process_radar_propagation(payload, propagation(payload, []))
        rd = result["range_doppler"]

        self.assertEqual(rd["source_shape"], {"doppler_bins": 512, "range_bins": 1024})
        self.assertTrue(rd["truncated"])
        self.assertLessEqual(len(rd["equivalent_range_axis_m"]), config.MAX_RADAR_RESULT_RANGE_BINS)
        self.assertLessEqual(len(rd["doppler_axis_hz"]), config.MAX_RADAR_RESULT_DOPPLER_BINS)
        self.assertLessEqual(
            len(rd["equivalent_range_axis_m"]) * len(rd["doppler_axis_hz"]),
            config.MAX_RADAR_RESULT_CELLS,
        )
        self.assertGreater(result["resolution"]["max_unambiguous_equivalent_range_m"], 0.0)
        self.assertGreater(result["resolution"]["max_unambiguous_doppler_hz"], 0.0)
        self.assertGreater(
            result["resolution"]["max_unambiguous_equivalent_radial_velocity_mps"],
            0.0,
        )

    def test_signal_path_budget_is_deterministic_and_disclosed(self) -> None:
        alpha = target("alpha", position=[80.0, 0.0, 5.0])
        bravo = target("bravo", position=[160.0, 0.0, 5.0])
        payload = request(targets=[alpha, bravo], cfar_enabled=False)
        paths = [
            path("alpha-weak", equivalent_range_m=80.0, doppler_hz=0.0, coefficient_abs=1e-8, target_ids=["alpha"]),
            path("alpha-strong", equivalent_range_m=82.0, doppler_hz=0.0, coefficient_abs=2e-8, target_ids=["alpha"]),
            path("bravo", equivalent_range_m=160.0, doppler_hz=0.0, target_ids=["bravo"]),
            path("clutter", equivalent_range_m=120.0, doppler_hz=0.0, classification="clutter"),
            path("direct", equivalent_range_m=10.0, doppler_hz=0.0, classification="direct"),
        ]
        cell_count = payload["waveform"]["num_subcarriers"] * payload["waveform"]["num_symbols"]
        with patch("backend.rt.process_radar.MAX_RADAR_CFR_PATH_CELL_PRODUCTS", 3 * cell_count):
            first = process_radar_propagation(payload, propagation(payload, paths))
            second = process_radar_propagation(payload, propagation(payload, deepcopy(paths)))

        self.assertEqual(first["statistics"]["processed_signal_path_count"], 3)
        self.assertTrue(first["statistics"]["signal_paths_truncated"])
        self.assertEqual(first["statistics"]["cancelled_direct_path_count"], 1)
        self.assertEqual(first["range_doppler"], second["range_doppler"])
        self.assertIs(validate_radar_result(first), first)

    def test_display_clutter_is_spatially_reduced_without_changing_signal_paths(self) -> None:
        payload = request(cfar_enabled=False)

        def clutter(path_id: str, vertex: list[float], gain: float) -> dict:
            item = path(
                path_id,
                equivalent_range_m=60.0 + vertex[0],
                doppler_hz=0.0,
                coefficient_abs=gain,
                classification="clutter",
            )
            item["object_chain"] = [{"target_id": None, "vertex_m": vertex}]
            item["polyline"] = [[0.0, 0.0, 5.0], vertex, [0.0, 0.0, 5.0]]
            return item

        paths = [
            clutter("voxel-a-weak", [10.1, 0.0, 1.0], 1e-8),
            clutter("voxel-a-strong", [10.9, 0.0, 1.0], 3e-8),
            clutter("voxel-b", [20.1, 0.0, 1.0], 2e-8),
            clutter("voxel-c", [30.1, 0.0, 1.0], 2e-8),
            clutter("voxel-d", [40.1, 0.0, 1.0], 2e-8),
            clutter("voxel-e", [50.1, 0.0, 1.0], 2e-8),
        ]
        duplicate = deepcopy(paths[-1])
        duplicate["path_id"] = "voxel-e-exact-overlap"
        duplicate["coefficient_real"] = 1e-8
        duplicate["path_gain_linear"] = 1e-16
        duplicate["path_gain_db"] = -160.0
        paths.append(duplicate)

        result = process_radar_propagation(payload, propagation(payload, paths))
        reduction = result["statistics"]["display_path_reduction"]
        returned_ids = {item["path_id"] for item in result["paths"]}

        self.assertEqual(result["statistics"]["processed_signal_path_count"], len(paths))
        self.assertEqual(reduction["source_clutter_path_count"], len(paths))
        self.assertEqual(reduction["unique_geometry_path_count"], len(paths) - 1)
        self.assertEqual(reduction["spatial_clutter_bin_count"], 5)
        self.assertEqual(reduction["returned_clutter_path_count"], 5)
        self.assertNotIn("voxel-a-weak", returned_ids)
        self.assertNotIn("voxel-e-exact-overlap", returned_ids)
        self.assertTrue(result["summary"]["paths_truncated"])

    def test_processing_reports_progress_and_checks_cancellation_between_stages(self) -> None:
        payload = request(num_subcarriers=64, num_symbols=32, cfar_enabled=False)
        checks: list[int] = []
        progress: list[tuple[float, str]] = []

        result = process_radar_propagation(
            payload,
            propagation(payload, []),
            cancel_check=lambda: checks.append(len(checks)),
            progress_cb=lambda value, message: progress.append((value, message)),
        )

        self.assertEqual(result["summary"]["target_count"], 0)
        self.assertGreaterEqual(len(checks), 4)
        self.assertEqual(progress[-1][0], 0.99)
        self.assertTrue(any("Range-Doppler" in message for _value, message in progress))

    def test_display_path_budget_is_capped_and_spatially_distributed(self) -> None:
        payload = request(num_subcarriers=64, num_symbols=32, cfar_enabled=False)
        paths = []
        for index in range(300):
            item = path(
                f"clutter-{index}",
                equivalent_range_m=20.0 + index,
                doppler_hz=0.0,
                coefficient_abs=1e-9,
                classification="clutter",
            )
            vertex = [float(index * 3), 0.0, 1.0]
            item["object_chain"] = [{"target_id": None, "vertex_m": vertex}]
            item["polyline"] = [[0.0, 0.0, 5.0], vertex, [0.0, 0.0, 5.0]]
            paths.append(item)

        result = process_radar_propagation(payload, propagation(payload, paths))

        self.assertEqual(result["summary"]["returned_path_count"], 64)
        self.assertEqual(result["statistics"]["display_path_reduction"]["returned_path_count"], 64)
        self.assertLessEqual(result["statistics"]["display_path_reduction"]["returned_clutter_path_count"], 64)
        self.assertTrue(result["summary"]["paths_truncated"])


if __name__ == "__main__":
    unittest.main()
