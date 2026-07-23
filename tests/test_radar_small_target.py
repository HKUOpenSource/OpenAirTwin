from __future__ import annotations

import importlib.util
import math
import unittest

from backend.rt.radar_payload import RADAR_TARGET_ASSET_IDS, SPEED_OF_LIGHT_MPS
from backend.rt.radar_assets import RADAR_ASSET_ROOT, radar_asset_by_id
from backend.rt.radar_small_target import (
    RADAR_SMALL_TARGET_DIRECTED_RAY_CAP,
    RADAR_SMALL_TARGET_DISTANCES_M,
    RADAR_SMALL_TARGET_MAX_SAMPLES_PER_SRC,
    RADAR_SMALL_TARGET_SAMPLE_TIERS,
    RADAR_SMALL_TARGET_SEEDS,
    build_ordinary_sbr_validation_scene,
    build_unobstructed_validation_scene,
    classify_radar_path,
    probe_ordinary_sbr,
    solve_standard_target_case,
    solve_target_directed_scatter,
    standard_validation_positions,
)


class RadarSmallTargetContractTests(unittest.TestCase):
    def test_validation_budget_is_explicit_and_bounded(self) -> None:
        self.assertEqual(RADAR_SMALL_TARGET_SAMPLE_TIERS, (4_096, 16_384, 65_536))
        self.assertEqual(RADAR_SMALL_TARGET_MAX_SAMPLES_PER_SRC, 65_536)
        self.assertEqual(RADAR_SMALL_TARGET_DIRECTED_RAY_CAP, 2)

    def test_standard_monostatic_and_bistatic_positions(self) -> None:
        monostatic = standard_validation_positions(20.0, "monostatic")
        self.assertEqual(monostatic["tx"], monostatic["rx"])
        self.assertEqual(monostatic["target"], (20.0, 0.0, 0.0))

        bistatic = standard_validation_positions(20.0, "bistatic")
        self.assertEqual(bistatic["tx"], (0.0, -5.0, 0.0))
        self.assertEqual(bistatic["rx"], (0.0, 5.0, 0.0))

    def test_only_proven_target_object_ids_are_classified_as_target(self) -> None:
        self.assertEqual(classify_radar_path((1, 8), (8, 9)), "target")
        self.assertEqual(classify_radar_path((1, 2), (8, 9)), "clutter")
        self.assertEqual(classify_radar_path((), (8, 9)), "clutter")

    def test_invalid_geometry_and_unbounded_budget_are_rejected(self) -> None:
        with self.assertRaisesRegex(ValueError, "distance_m"):
            standard_validation_positions(0.0, "monostatic")
        with self.assertRaisesRegex(ValueError, "mode"):
            standard_validation_positions(20.0, "invalid")


@unittest.skipUnless(importlib.util.find_spec("sionna"), "Sionna RT is not installed")
class RadarSmallTargetSionnaTests(unittest.TestCase):
    def test_four_models_at_four_distances_are_stable_in_both_modes(self) -> None:
        for asset_id in sorted(RADAR_TARGET_ASSET_IDS):
            for distance_m in RADAR_SMALL_TARGET_DISTANCES_M:
                for mode in ("monostatic", "bistatic"):
                    with self.subTest(asset=asset_id, distance=distance_m, mode=mode):
                        validation_scene = build_unobstructed_validation_scene(
                            asset_id,
                            distance_m,
                            mode,
                        )
                        results = [
                            solve_target_directed_scatter(
                                validation_scene,
                                seed=seed,
                                sample_budget=RADAR_SMALL_TARGET_SAMPLE_TIERS[index],
                            )
                            for index, seed in enumerate(RADAR_SMALL_TARGET_SEEDS)
                        ]
                        self.assertTrue(all(result is not None for result in results))
                        assert all(result is not None for result in results)
                        reference = results[0]
                        for result in results:
                            self.assertEqual(result["classification"], "target")
                            self.assertEqual(result["target_object_id"], result["hit_proof"]["tx_object_id"])
                            self.assertEqual(result["target_object_id"], result["hit_proof"]["rx_object_id"])
                            self.assertEqual(result["interaction_object_ids"], [result["target_object_id"]])
                            self.assertAlmostEqual(result["path_length_m"], reference["path_length_m"], places=12)
                            self.assertAlmostEqual(result["delay_s"], reference["delay_s"], places=15)
                            self.assertAlmostEqual(result["doppler_hz"], reference["doppler_hz"], places=12)
                            self.assertAlmostEqual(result["power_gain_db"], reference["power_gain_db"], places=12)

    def test_target_present_and_removed_control(self) -> None:
        validation_scene = build_unobstructed_validation_scene(
            "dji-mini-3-pro",
            50.0,
            "monostatic",
        )
        self.assertIsNotNone(solve_target_directed_scatter(validation_scene))

        validation_scene.scene.edit(remove=validation_scene.target_object)
        self.assertIsNone(solve_target_directed_scatter(validation_scene))

    def test_environment_occluder_cannot_be_misclassified_as_target(self) -> None:
        from sionna.rt import ITURadioMaterial, SceneObject

        validation_scene = build_unobstructed_validation_scene(
            "dji-mini-3-pro",
            20.0,
            "monostatic",
        )
        blocker_asset = radar_asset_by_id("dji-air-2s")
        blocker = SceneObject(
            fname=str(RADAR_ASSET_ROOT / blocker_asset["radar"]["path"]),
            name="radar-validation-clutter-blocker",
            radio_material=ITURadioMaterial(
                name="radar-validation-clutter-blocker-metal",
                itu_type="metal",
                thickness=0.01,
            ),
        )
        validation_scene.scene.edit(add=blocker)
        blocker.position = [10.0, 0.0, 0.0]

        self.assertIsNone(solve_target_directed_scatter(validation_scene))
        self.assertEqual(
            classify_radar_path(
                (blocker.object_id,),
                (validation_scene.target_object.object_id,),
            ),
            "clutter",
        )

    def test_monostatic_and_bistatic_path_length_definitions(self) -> None:
        distance_m = 100.0
        monostatic = solve_standard_target_case(
            "dji-air-2s",
            distance_m,
            "monostatic",
            target_velocity_mps=(0.0, 0.0, 0.0),
        )
        bistatic = solve_standard_target_case(
            "dji-air-2s",
            distance_m,
            "bistatic",
            target_velocity_mps=(0.0, 0.0, 0.0),
        )
        assert monostatic is not None and bistatic is not None
        self.assertAlmostEqual(monostatic["path_length_m"], 2.0 * distance_m, places=12)
        self.assertAlmostEqual(
            bistatic["path_length_m"],
            2.0 * math.hypot(distance_m, 5.0),
            places=12,
        )
        self.assertAlmostEqual(monostatic["delay_s"], 2.0 * distance_m / SPEED_OF_LIGHT_MPS)
        self.assertEqual(monostatic["doppler_hz"], 0.0)
        self.assertEqual(bistatic["doppler_hz"], 0.0)

    def test_receding_target_has_negative_doppler_and_positive_radial_velocity(self) -> None:
        result = solve_standard_target_case(
            "dji-mini-3",
            100.0,
            "monostatic",
            target_velocity_mps=(12.0, 0.0, 0.0),
        )
        assert result is not None
        self.assertAlmostEqual(result["radial_velocity_mps"], 12.0, places=12)
        self.assertLess(result["doppler_hz"], 0.0)

    def test_removed_target_and_unbounded_sample_budget_cannot_create_a_path(self) -> None:
        validation_scene = build_unobstructed_validation_scene(
            "dji-mini-3",
            20.0,
            "bistatic",
        )
        with self.assertRaisesRegex(ValueError, "sample_budget"):
            solve_target_directed_scatter(
                validation_scene,
                sample_budget=RADAR_SMALL_TARGET_MAX_SAMPLES_PER_SRC + 1,
            )

    def test_ordinary_sbr_probe_records_sionna_object_hit_counts(self) -> None:
        validation_scene = build_ordinary_sbr_validation_scene(
            "dji-mini-3-pro",
            20.0,
            "monostatic",
        )
        probe = probe_ordinary_sbr(
            validation_scene,
            samples_per_src=RADAR_SMALL_TARGET_SAMPLE_TIERS[0],
            seed=RADAR_SMALL_TARGET_SEEDS[0],
        )
        self.assertEqual(probe["method"], "ordinary_sbr")
        self.assertEqual(probe["sample_cap"], RADAR_SMALL_TARGET_MAX_SAMPLES_PER_SRC)
        self.assertEqual(probe["target_object_id"], validation_scene.target_object.object_id)
        self.assertGreaterEqual(probe["valid_path_count"], probe["target_path_count"])


if __name__ == "__main__":
    unittest.main()
