from __future__ import annotations

from copy import deepcopy
import math
import unittest

from backend import config
from backend.rt.radar_payload import (
    RADAR_AZIMUTH_DEFINITION,
    RADAR_CONTRACT_VERSION,
    RADAR_ERROR_RESPONSE_KEYS,
    RADAR_HTTP_ERROR_CONTRACT,
    RADAR_HTTP_ERROR_MESSAGES,
    RADAR_HTTP_SUCCESS_CONTRACT,
    RADAR_JOB_ROUTE_CONTRACT,
    RADAR_JOB_STATUSES,
    RADAR_RADIAL_VELOCITY_DEFINITION,
    RADAR_RANGE_DEFINITION,
    RADAR_TARGET_ASSET_IDS,
    RADAR_ZENITH_DEFINITION,
    SPEED_OF_LIGHT_MPS,
    parse_radar_payload,
    validate_radar_job_status,
    validate_radar_result,
)


def valid_result() -> dict:
    return {
        "schema_version": RADAR_CONTRACT_VERSION,
        "scene_generation": 3,
        "summary": {
            "mode": "monostatic",
            "target_count": 1,
            "total_detection_count": 1,
            "returned_detection_count": 1,
            "detections_truncated": False,
            "total_target_path_count": 1,
            "total_clutter_path_count": 1,
            "total_direct_path_count": 0,
            "returned_path_count": 2,
            "paths_truncated": False,
        },
        "radar": {
            "mode": "monostatic",
            "tx_position_m": [0.0, 0.0, 0.0],
            "rx_position_m": [0.0, 0.0, 0.0],
            "carrier_frequency_hz": 3.5e9,
            "bandwidth_hz": 100e6,
            "subcarrier_spacing_hz": 100e6 / 256,
            "num_subcarriers": 256,
            "num_symbols": 128,
            "tx_power_dbm": 30.0,
            "noise_figure_db": 7.0,
            "system_loss_db": 3.0,
            "noise_temperature_k": 290.0,
            "range_definition": RADAR_RANGE_DEFINITION,
            "radial_velocity_definition": RADAR_RADIAL_VELOCITY_DEFINITION,
            "azimuth_definition": RADAR_AZIMUTH_DEFINITION,
            "zenith_definition": RADAR_ZENITH_DEFINITION,
        },
        "targets": [
            {
                "id": "drone_1",
                "asset_id": "dji-air-2s",
                "position_m": [20.0, 0.0, 10.0],
                "orientation_rad": [0.0, 0.0, 0.0],
                "velocity_mps": [-5.0, 0.0, 0.0],
                "rcs_m2": 0.01,
            }
        ],
        "detections": [
            {
                "detection_id": "detection_1",
                "equivalent_range_m": 20.0,
                "equivalent_radial_velocity_mps": -(SPEED_OF_LIGHT_MPS / 3.5e9) * 116.7 / 2.0,
                "doppler_hz": 116.7,
                "power_dbm": -80.0,
                "snr_db": 12.0,
                "arrival_azimuth_deg": 0.0,
                "arrival_zenith_deg": 90.0,
                "target_id": "drone_1",
            }
        ],
        "paths": [
            {
                "path_id": "path_1",
                "classification": "target",
                "target_ids": ["drone_1"],
                "delay_s": 40.0 / SPEED_OF_LIGHT_MPS,
                "doppler_hz": 116.7,
                "path_gain_db": -80.0,
                "path_length_m": 40.0,
                "equivalent_range_m": 20.0,
                "departure_azimuth_deg": 0.0,
                "departure_zenith_deg": 90.0,
                "arrival_azimuth_deg": 180.0,
                "arrival_zenith_deg": 90.0,
                "polyline": [[0.0, 0.0, 0.0], [20.0, 0.0, 10.0], [0.0, 0.0, 0.0]],
            },
            {
                "path_id": "path_2",
                "classification": "clutter",
                "target_ids": [],
                "delay_s": 60.0 / SPEED_OF_LIGHT_MPS,
                "doppler_hz": 0.0,
                "path_gain_db": -95.0,
                "path_length_m": 60.0,
                "equivalent_range_m": 30.0,
                "departure_azimuth_deg": 0.0,
                "departure_zenith_deg": 90.0,
                "arrival_azimuth_deg": 180.0,
                "arrival_zenith_deg": 90.0,
                "polyline": [[0.0, 0.0, 0.0], [30.0, 0.0, 0.0], [0.0, 0.0, 0.0]],
            },
        ],
        "range_profile": {"equivalent_range_axis_m": [0.0, 1.5], "power_dbm": [-100.0, -80.0]},
        "range_doppler": {
            "equivalent_range_axis_m": [0.0, 1.5],
            "doppler_axis_hz": [-10.0, 10.0],
            "equivalent_radial_velocity_axis_mps": [
                (SPEED_OF_LIGHT_MPS / 3.5e9) * 10.0 / 2.0,
                -(SPEED_OF_LIGHT_MPS / 3.5e9) * 10.0 / 2.0,
            ],
            "power_dbm": [[-100.0, -90.0], [-95.0, -80.0]],
            "source_shape": {"doppler_bins": 128, "range_bins": 256},
            "downsample_factor": {"doppler": 64, "range": 128},
            "truncated": True,
        },
        "resolution": {
            "equivalent_range_m": 1.5,
            "doppler_hz": 20.0,
            "equivalent_radial_velocity_mps": (SPEED_OF_LIGHT_MPS / 3.5e9) * 20.0 / 2.0,
        },
        "statistics": {
            "solver_seconds": 1.0,
            "processing_seconds": 0.1,
            "total_seconds": 1.1,
            "noise_power_dbm": -92.0,
            "peak_snr_db": 12.0,
            "raw_path_count": 2,
            "returned_path_count": 2,
        },
    }


class RadarRequestContractTests(unittest.TestCase):
    def test_optional_processing_views_are_strict_and_bounded(self) -> None:
        result = valid_result()
        detection = {
            **deepcopy(result["detections"][0]),
            "classification": "target",
            "position_m": None,
            "position_source": "unavailable",
        }
        focus = {
            **deepcopy(result["range_doppler"]),
            "source_offset": {"doppler_bin": 0, "range_bin": 0},
            "window": {
                "equivalent_range_min_m": 0.0,
                "equivalent_range_max_m": 1.5,
                "doppler_min_hz": -10.0,
                "doppler_max_hz": 10.0,
                "auto_focus": True,
            },
        }
        base_view = {
            "detections": [detection],
            "detection_summary": {
                "total_detection_count": 1,
                "returned_detection_count": 1,
                "detections_truncated": False,
                "target_detection_count": 1,
                "clutter_detection_count": 0,
                "unassociated_detection_count": 0,
            },
            "range_profile": deepcopy(result["range_profile"]),
            "range_doppler": deepcopy(result["range_doppler"]),
            "range_doppler_focus": focus,
            "peak_snr_db": 12.0,
        }
        result["processing_views"] = {
            "mean_subtracted": {
                **deepcopy(base_view),
                "method": "slow_time_complex_mean_subtraction",
            },
            "ideal_clutter_cancelled": {
                **deepcopy(base_view),
                "method": "ideal_coherent_known_clutter_subtraction",
            },
        }
        self.assertIs(validate_radar_result(result), result)

        bad_method = deepcopy(result)
        bad_method["processing_views"]["mean_subtracted"]["method"] = "zero_bin"
        with self.assertRaisesRegex(ValueError, "processing method"):
            validate_radar_result(bad_method)

    def test_default_payload_is_bistatic_and_bounded(self) -> None:
        parsed = parse_radar_payload({})

        self.assertEqual(parsed["schema_version"], RADAR_CONTRACT_VERSION)
        self.assertEqual(parsed["mode"], "bistatic")
        self.assertNotEqual(parsed["tx"]["position"], parsed["rx"]["position"])
        self.assertEqual(parsed["solver"]["tx_array"], parsed["solver"]["rx_array"])
        self.assertEqual(parsed["targets"], ())
        self.assertEqual(parsed["waveform"]["num_subcarriers"], config.DEFAULT_RADAR_NUM_SUBCARRIERS)
        self.assertEqual(parsed["waveform"]["num_symbols"], config.DEFAULT_RADAR_NUM_SYMBOLS)
        self.assertEqual(parsed["solver"]["samples_per_src"], 65536)
        self.assertTrue(parsed["solver"]["diffuse_reflection"])
        self.assertEqual(
            parsed["waveform"]["subcarrier_spacing_hz"],
            config.DEFAULT_RADAR_BANDWIDTH_HZ / config.DEFAULT_RADAR_NUM_SUBCARRIERS,
        )
        self.assertEqual(
            parsed["waveform"]["cell_count"],
            config.DEFAULT_RADAR_NUM_SUBCARRIERS * config.DEFAULT_RADAR_NUM_SYMBOLS,
        )
        self.assertTrue(parsed["signal"]["direct_path_cancellation"])

    def test_monostatic_copies_omitted_rx_and_array(self) -> None:
        parsed = parse_radar_payload(
            {
                "mode": "monostatic",
                "tx": {"position": [1, 2, 3], "orientation": [0.1, 0.2, 0.3], "velocity": [4, 5, 6]},
                "solver": {
                    "tx_array": {"num_rows": 2, "num_cols": 2},
                },
            }
        )

        self.assertEqual(parsed["rx"], parsed["tx"])
        self.assertEqual(parsed["solver"]["rx_array"], parsed["solver"]["tx_array"])

    def test_monostatic_rejects_explicit_rx_or_array_mismatch(self) -> None:
        with self.assertRaisesRegex(ValueError, "rx must match tx"):
            parse_radar_payload(
                {"mode": "monostatic", "tx": {"position": [1, 2, 3]}, "rx": {"position": [9, 9, 9]}}
            )
        with self.assertRaisesRegex(ValueError, "rx_array must match"):
            parse_radar_payload(
                {
                    "mode": "monostatic",
                    "solver": {
                        "tx_array": {"num_rows": 2, "num_cols": 2},
                        "rx_array": {"num_rows": 1, "num_cols": 1},
                    },
                }
            )

    def test_bistatic_preserves_independent_rx_and_array(self) -> None:
        parsed = parse_radar_payload(
            {
                "mode": "bistatic",
                "tx": {"position": [1, 2, 3]},
                "rx": {"position": [4, 5, 6]},
                "solver": {
                    "tx_array": {"num_rows": 2, "num_cols": 2},
                    "rx_array": {"num_rows": 3, "num_cols": 1},
                },
            }
        )

        self.assertEqual(parsed["tx"]["position"], (1.0, 2.0, 3.0))
        self.assertEqual(parsed["rx"]["position"], (4.0, 5.0, 6.0))
        self.assertEqual(parsed["solver"]["tx_array"]["num_rows"], 2)
        self.assertEqual(parsed["solver"]["rx_array"]["num_rows"], 3)

    def test_targets_are_canonicalized_and_must_have_unique_ids(self) -> None:
        parsed = parse_radar_payload(
            {
                "targets": [
                    {
                        "id": "drone_1",
                        "asset_id": "DJI-AIR-2S",
                        "position": [20, 0, 10],
                        "velocity": [-5, 0, 0],
                    }
                ]
            }
        )
        self.assertEqual(parsed["targets"][0]["asset_id"], "dji-air-2s")
        self.assertEqual(parsed["targets"][0]["rcs_m2"], config.DEFAULT_RADAR_TARGET_RCS_M2)

        duplicate = {
            "targets": [
                {"id": "drone_1", "asset_id": "dji-air-2s"},
                {"id": "drone_1", "asset_id": "dji-mini-3"},
            ]
        }
        with self.assertRaisesRegex(ValueError, "unique ids"):
            parse_radar_payload(duplicate)

    def test_target_and_array_contract_rejects_unknown_values(self) -> None:
        invalid_payloads = [
            {"targets": [{"id": "1bad", "asset_id": "dji-air-2s"}]},
            {"targets": [{"id": "drone", "asset_id": "unknown"}]},
            {"targets": [{"id": "drone", "asset_id": "dji-air-2s", "rcs_m2": 0.0}]},
            {"targets": [{"id": "drone", "asset_id": "dji-air-2s", "velocity": [1000, 0, 0]}]},
            {"solver": {"tx_array": {"num_rows": 1, "unknown": 2}}},
            {"unknown": True},
        ]
        for payload in invalid_payloads:
            with self.subTest(payload=payload):
                with self.assertRaises(ValueError):
                    parse_radar_payload(payload)

    def test_target_count_and_vectors_are_bounded(self) -> None:
        too_many = [
            {"id": f"drone_{index}", "asset_id": "dji-mini-3"}
            for index in range(config.MAX_RADAR_TARGETS + 1)
        ]
        with self.assertRaisesRegex(ValueError, "at most"):
            parse_radar_payload({"targets": too_many})
        with self.assertRaisesRegex(ValueError, "finite number"):
            parse_radar_payload({"tx": {"position": [0, math.nan, 0]}})
        with self.assertRaisesRegex(ValueError, "absolute value"):
            parse_radar_payload({"tx": {"position": [config.MAX_RADAR_COORDINATE_ABS_M + 1, 0, 0]}})

    def test_waveform_and_cfar_bounds_are_enforced(self) -> None:
        invalid_payloads = [
            {"waveform": {"num_subcarriers": 100}},
            {"waveform": {"num_symbols": 12}},
            {"waveform": {"bandwidth_hz": config.MIN_RADAR_BANDWIDTH_HZ - 1}},
            {
                "waveform": {
                    "carrier_frequency_hz": config.MIN_FREQUENCY_HZ,
                    "bandwidth_hz": 2.0 * config.MIN_FREQUENCY_HZ,
                }
            },
            {
                "waveform": {
                    "bandwidth_hz": config.MIN_RADAR_BANDWIDTH_HZ,
                    "num_subcarriers": config.MAX_RADAR_NUM_SUBCARRIERS,
                }
            },
            {"waveform": {"num_subcarriers": 16, "num_symbols": 8}, "cfar": {"training_cells_range": 8}},
            {"waveform": {"num_subcarriers": 64, "num_symbols": 8}, "cfar": {"training_cells_doppler": 4}},
            {"cfar": {"false_alarm_probability": 0.5}},
        ]
        for payload in invalid_payloads:
            with self.subTest(payload=payload):
                with self.assertRaises(ValueError):
                    parse_radar_payload(payload)

    def test_signal_and_solver_values_are_strict(self) -> None:
        parsed = parse_radar_payload(
            {
                "signal": {"tx_power_dbm": 20, "noise_figure_db": 5, "system_loss_db": 2},
                "solver": {"los": "false", "diffuse_reflection": "true", "seed": 7},
            }
        )
        self.assertEqual(parsed["signal"]["tx_power_dbm"], 20.0)
        self.assertTrue(parsed["signal"]["direct_path_cancellation"])
        self.assertFalse(parsed["solver"]["los"])
        self.assertTrue(parsed["solver"]["diffuse_reflection"])
        self.assertEqual(parsed["solver"]["seed"], 7)

        disabled = parse_radar_payload({"signal": {"direct_path_cancellation": False}})
        self.assertFalse(disabled["signal"]["direct_path_cancellation"])
        with self.assertRaisesRegex(ValueError, "direct_path_cancellation must be a boolean"):
            parse_radar_payload({"signal": {"direct_path_cancellation": 1}})


class RadarJobAndResultContractTests(unittest.TestCase):
    def test_job_routes_statuses_and_error_codes_are_frozen(self) -> None:
        self.assertEqual(
            RADAR_JOB_ROUTE_CONTRACT,
            (
                ("POST", "/api/radar/jobs", "radar.create"),
                ("GET", "/api/radar/jobs/{job_id}", "radar.status"),
                ("GET", "/api/radar/jobs/{job_id}/result", "radar.result"),
                ("POST", "/api/radar/jobs/{job_id}/cancel", "radar.cancel"),
            ),
        )
        self.assertEqual(RADAR_JOB_STATUSES, {"queued", "running", "succeeded", "failed", "cancelled"})
        self.assertEqual(
            RADAR_HTTP_ERROR_CONTRACT,
            {
                "invalid_payload": 400,
                "unknown_job": 404,
                "result_not_ready": 409,
                "scene_not_ready": 409,
                "scene_stale": 409,
                "request_too_large": 413,
                "queue_full": 429,
                "internal_error": 500,
            },
        )
        self.assertEqual(
            RADAR_HTTP_SUCCESS_CONTRACT,
            {"create_job": 202, "get_status": 200, "get_result": 200, "cancel_job": 200},
        )
        self.assertEqual(RADAR_ERROR_RESPONSE_KEYS, {"ok", "error", "message"})
        self.assertEqual(set(RADAR_HTTP_ERROR_MESSAGES), set(RADAR_HTTP_ERROR_CONTRACT))
        self.assertEqual(RADAR_HTTP_ERROR_MESSAGES["invalid_payload"], "Invalid Radar request")
        self.assertEqual(RADAR_HTTP_ERROR_MESSAGES["unknown_job"], "Radar job not found")
        self.assertEqual(RADAR_HTTP_ERROR_MESSAGES["result_not_ready"], "Radar result is not ready")
        self.assertNotIn(("GET", "/api/radar/jobs/{job_id}/download", "radar.download"), RADAR_JOB_ROUTE_CONTRACT)

    def test_job_status_contract_requires_bounded_fields(self) -> None:
        status = {
            "job_id": "radar_123",
            "status": "queued",
            "progress": 0.0,
            "message": "Queued",
            "created_at": "2026-07-21T00:00:00+00:00",
            "started_at": None,
            "finished_at": None,
            "scene_generation": 3,
        }
        self.assertIs(validate_radar_job_status(status), status)
        with self.assertRaises(ValueError):
            validate_radar_job_status({**status, "progress": 2.0})
        with self.assertRaises(ValueError):
            validate_radar_job_status({**status, "status": "cancelling"})
        with self.assertRaises(ValueError):
            validate_radar_job_status({**status, "status": "Queued"})
        with self.assertRaises(ValueError):
            validate_radar_job_status({**status, "created_at": "2026-07-21T00:00:00"})

        running = {
            **status,
            "status": "running",
            "progress": 0.5,
            "started_at": "2026-07-21T00:00:01+00:00",
        }
        self.assertIs(validate_radar_job_status(running), running)
        succeeded = {
            **running,
            "status": "succeeded",
            "progress": 1.0,
            "finished_at": "2026-07-21T00:00:02+00:00",
        }
        self.assertIs(validate_radar_job_status(succeeded), succeeded)
        with self.assertRaisesRegex(ValueError, "requires a non-empty error"):
            validate_radar_job_status({**succeeded, "status": "failed"})

    def test_valid_result_contract_is_accepted(self) -> None:
        result = valid_result()
        self.assertIs(validate_radar_result(result), result)

    def test_optional_focused_range_doppler_is_bounded_inside_full_dimensions(self) -> None:
        result = valid_result()
        result["range_doppler_focus"] = {
            **deepcopy(result["range_doppler"]),
            "source_shape": {"doppler_bins": 2, "range_bins": 2},
            "downsample_factor": {"doppler": 1, "range": 1},
            "truncated": False,
            "source_offset": {"doppler_bin": 63, "range_bin": 0},
            "window": {
                "equivalent_range_min_m": 0.0,
                "equivalent_range_max_m": 1.5,
                "doppler_min_hz": -10.0,
                "doppler_max_hz": 10.0,
                "auto_focus": True,
            },
        }
        self.assertIs(validate_radar_result(result), result)

        bad_offset = deepcopy(result)
        bad_offset["range_doppler_focus"]["source_offset"]["doppler_bin"] = 127
        with self.assertRaisesRegex(ValueError, "source_offset"):
            validate_radar_result(bad_offset)

    def test_result_counts_shapes_and_references_are_enforced(self) -> None:
        bad_count = valid_result()
        bad_count["summary"]["target_count"] = 2
        with self.assertRaisesRegex(ValueError, "target_count"):
            validate_radar_result(bad_count)

        bad_matrix = valid_result()
        bad_matrix["range_doppler"]["power_dbm"] = [[-90.0]]
        with self.assertRaisesRegex(ValueError, "rows"):
            validate_radar_result(bad_matrix)

        bad_reference = valid_result()
        bad_reference["detections"][0]["target_id"] = "missing"
        with self.assertRaisesRegex(ValueError, "reference"):
            validate_radar_result(bad_reference)

        duplicate_detection = valid_result()
        duplicate_detection["detections"].append(dict(duplicate_detection["detections"][0]))
        duplicate_detection["summary"]["total_detection_count"] = 2
        duplicate_detection["summary"]["returned_detection_count"] = 2
        with self.assertRaisesRegex(ValueError, "detection_id"):
            validate_radar_result(duplicate_detection)

    def test_result_physical_conventions_and_truncation_are_enforced(self) -> None:
        bad_velocity = valid_result()
        bad_velocity["detections"][0]["equivalent_radial_velocity_mps"] = 5.0
        with self.assertRaisesRegex(ValueError, "does not match doppler_hz"):
            validate_radar_result(bad_velocity)

        bad_length = valid_result()
        bad_length["paths"][0]["path_length_m"] = 41.0
        with self.assertRaisesRegex(ValueError, "does not match delay_s"):
            validate_radar_result(bad_length)

        bad_angle = valid_result()
        bad_angle["paths"][0]["arrival_zenith_deg"] = 181.0
        with self.assertRaises(ValueError):
            validate_radar_result(bad_angle)

        truncated = valid_result()
        truncated["summary"]["total_clutter_path_count"] = 4
        truncated["summary"]["paths_truncated"] = True
        truncated["statistics"]["raw_path_count"] = 5
        self.assertIs(validate_radar_result(truncated), truncated)

        bad_truncation = valid_result()
        bad_truncation["range_doppler"]["truncated"] = False
        with self.assertRaisesRegex(ValueError, "truncated"):
            validate_radar_result(bad_truncation)

    def test_result_rejects_nonfinite_and_artifact_fields(self) -> None:
        nonfinite = valid_result()
        nonfinite["range_profile"]["power_dbm"][0] = math.nan
        with self.assertRaisesRegex(ValueError, "finite number"):
            validate_radar_result(nonfinite)

        artifact = valid_result()
        artifact["radar"]["download_url"] = "/api/radar/jobs/1/download"
        with self.assertRaisesRegex(ValueError, "forbidden artifact"):
            validate_radar_result(artifact)

    def test_result_is_defensively_copied_in_invalid_cases(self) -> None:
        result = valid_result()
        original = deepcopy(result)
        validate_radar_result(result)
        self.assertEqual(result, original)

    def test_asset_ids_are_the_four_unique_models(self) -> None:
        self.assertEqual(
            RADAR_TARGET_ASSET_IDS,
            {"dji-air-2s", "dji-mavic-3-cine", "dji-mini-3", "dji-mini-3-pro"},
        )


if __name__ == "__main__":
    unittest.main()
