from __future__ import annotations

from copy import deepcopy
import importlib.util
import json
import os
from pathlib import Path
import shutil
import tempfile
import unittest
from zipfile import ZipFile

import numpy as np
import trimesh

from backend.rt.radar_assets import (
    RADAR_ASSET_COORDINATE_CONVENTION,
    RADAR_ASSET_MANIFEST_PATH,
    RADAR_ASSET_ROOT,
    load_radar_asset_manifest,
    radar_asset_by_id,
    require_radar_asset_release_approval,
    validate_radar_asset_manifest,
)
from backend.rt.radar_payload import RADAR_TARGET_ASSET_IDS
from backend.tools.build_radar_assets import (
    DEFAULT_SOURCE_MANIFEST,
    build_all,
    parse_glb,
    scan_source_archives,
    sha256_file,
    verify_source_archives,
)


_ATTACHMENT_DIR_VALUE = os.environ.get("OAT_RADAR_ASSET_SOURCE_DIR")
ATTACHMENT_DIR = Path(_ATTACHMENT_DIR_VALUE).expanduser() if _ATTACHMENT_DIR_VALUE else None


def source_archives_available() -> bool:
    if ATTACHMENT_DIR is None or not ATTACHMENT_DIR.is_dir():
        return False
    source = json.loads(DEFAULT_SOURCE_MANIFEST.read_text(encoding="utf-8"))
    return all((ATTACHMENT_DIR / asset["source_archive"]).is_file() for asset in source["assets"])


class RadarAssetManifestTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.manifest = load_radar_asset_manifest()

    def test_manifest_contains_four_frozen_assets_and_one_excluded_duplicate(self) -> None:
        self.assertEqual(
            {asset["id"] for asset in self.manifest["assets"]},
            set(RADAR_TARGET_ASSET_IDS),
        )
        self.assertEqual(
            self.manifest["source_archive_summary"],
            {"unique_archive_count": 4, "declared_asset_count": 4, "excluded_duplicate_count": 1},
        )
        mini_pro = radar_asset_by_id("dji-mini-3-pro", self.manifest)
        self.assertEqual(mini_pro["source"]["excluded_duplicate_archives"], ["dji-mini-3-pro.zip"])

    def test_manifest_freezes_units_axes_origin_author_and_license(self) -> None:
        self.assertEqual(self.manifest["coordinate_convention"], RADAR_ASSET_COORDINATE_CONVENTION)
        for asset in self.manifest["assets"]:
            with self.subTest(asset=asset["id"]):
                self.assertEqual(asset["author"]["name"], "aurumjuda747")
                self.assertEqual(asset["author"]["profile_url"], "https://sketchfab.com/aurumjuda747")
                self.assertEqual(asset["license"]["spdx"], "CC-BY-4.0")
                self.assertIn("aurumjuda747", asset["license"]["attribution"])
                self.assertTrue(asset["license"]["redistribution_allowed"])
                self.assertTrue(asset["license"]["derivatives_allowed"])
                self.assertEqual(asset["normalization"]["units"], "metres")
                self.assertEqual(asset["normalization"]["up_axis"], "+Z")
                self.assertEqual(asset["normalization"]["forward_axis"], "+X")
                self.assertEqual(asset["normalization"]["left_axis"], "+Y")
                self.assertEqual(asset["normalization"]["origin"], "axis_aligned_bounding_box_center")

        air_2s = radar_asset_by_id("dji-air-2s", self.manifest)
        self.assertEqual(
            air_2s["license"]["source_url"],
            "https://sketchfab.com/3d-models/dji-air-2s-e310c02928bd42e3ba13d1160feb091a",
        )

    def test_release_gate_approves_cc_by_assets(self) -> None:
        self.assertEqual(self.manifest["release_gate"]["status"], "approved")
        require_radar_asset_release_approval(self.manifest)

    def test_manifest_rejects_path_traversal_and_unbounded_outputs(self) -> None:
        traversal = deepcopy(self.manifest)
        traversal["assets"][0]["visual"]["path"] = "../visual.glb"
        with self.assertRaises(ValueError):
            validate_radar_asset_manifest(traversal, root=RADAR_ASSET_ROOT, verify_files=False)

        too_many_faces = deepcopy(self.manifest)
        too_many_faces["assets"][0]["radar"]["face_count"] = (
            too_many_faces["limits"]["radar_max_faces"] + 1
        )
        with self.assertRaisesRegex(ValueError, "face count limit"):
            validate_radar_asset_manifest(too_many_faces, root=RADAR_ASSET_ROOT, verify_files=False)

    def test_visual_and_radar_files_match_manifest_and_are_aligned(self) -> None:
        tolerance = self.manifest["limits"]["alignment_tolerance_m"]
        for asset in self.manifest["assets"]:
            with self.subTest(asset=asset["id"]):
                visual_path = RADAR_ASSET_ROOT / asset["visual"]["path"]
                radar_path = RADAR_ASSET_ROOT / asset["radar"]["path"]
                visual = trimesh.load(visual_path, force="scene", process=False).to_geometry()
                radar = trimesh.load(radar_path, force="mesh", process=False)
                np.testing.assert_allclose(visual.bounds.mean(axis=0), np.zeros(3), atol=1e-7)
                np.testing.assert_allclose(radar.bounds.mean(axis=0), np.zeros(3), atol=1e-7)
                np.testing.assert_allclose(visual.bounds, radar.bounds, atol=tolerance)
                np.testing.assert_allclose(
                    visual.extents,
                    asset["visual"]["bounds_m"]["size"],
                    atol=1e-7,
                )
                self.assertLessEqual(len(radar.faces), self.manifest["limits"]["radar_max_faces"])
                self.assertLessEqual(radar_path.stat().st_size, self.manifest["limits"]["radar_max_bytes"])
                self.assertLessEqual(visual_path.stat().st_size, self.manifest["limits"]["visual_max_bytes"])
                normal_properties = radar.metadata["_ply_raw"]["vertex"]["properties"]
                self.assertTrue({"nx", "ny", "nz"}.issubset(normal_properties))

    def test_visual_glbs_retain_textures_and_normalization_metadata(self) -> None:
        for asset in self.manifest["assets"]:
            with self.subTest(asset=asset["id"]):
                visual_path = RADAR_ASSET_ROOT / asset["visual"]["path"]
                gltf, _chunks = parse_glb(visual_path.read_bytes())
                self.assertTrue(gltf.get("images"))
                self.assertTrue(gltf.get("textures"))
                metadata = gltf["asset"]["extras"]["openairtwin"]
                self.assertEqual(metadata["asset_id"], asset["id"])
                self.assertEqual(metadata["pipeline_version"], 1)


class RadarAssetPipelineTests(unittest.TestCase):
    def test_zip_hash_scan_identifies_and_excludes_duplicate_archive(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            canonical = root / "canonical.zip"
            duplicate = root / "duplicate.zip"
            with ZipFile(canonical, "w") as archive:
                archive.writestr("source/model.glb", b"fixture")
            shutil.copyfile(canonical, duplicate)
            groups = scan_source_archives(root)
            digest = sha256_file(canonical)
            self.assertEqual(groups[digest], ["canonical.zip", "duplicate.zip"])
            verify_source_archives(
                root,
                {
                    "assets": [
                        {
                            "source_archive": "canonical.zip",
                            "source_archive_sha256": digest,
                            "duplicate_archives": ["duplicate.zip"],
                        }
                    ]
                },
            )

    @unittest.skipUnless(source_archives_available(), "DJI source archives are not available")
    def test_checked_in_assets_are_reproducible_from_source_archives(self) -> None:
        assert ATTACHMENT_DIR is not None
        expected = json.loads(RADAR_ASSET_MANIFEST_PATH.read_text(encoding="utf-8"))
        with tempfile.TemporaryDirectory() as temporary:
            rebuilt = build_all(ATTACHMENT_DIR, DEFAULT_SOURCE_MANIFEST, Path(temporary))
            self.assertEqual(rebuilt, expected)
            self.assertEqual(
                (Path(temporary) / "manifest.json").read_bytes(),
                RADAR_ASSET_MANIFEST_PATH.read_bytes(),
            )


@unittest.skipUnless(importlib.util.find_spec("sionna"), "Sionna RT is not installed")
class RadarAssetSionnaTests(unittest.TestCase):
    def test_all_radar_meshes_load_as_sionna_scene_objects(self) -> None:
        from sionna.rt import ITURadioMaterial, SceneObject

        manifest = load_radar_asset_manifest()
        for index, asset in enumerate(manifest["assets"]):
            with self.subTest(asset=asset["id"]):
                material = ITURadioMaterial(
                    name=f"radar-asset-test-material-{index}",
                    itu_type="metal",
                    thickness=0.01,
                )
                scene_object = SceneObject(
                    fname=str(RADAR_ASSET_ROOT / asset["radar"]["path"]),
                    name=f"radar-asset-test-{index}",
                    radio_material=material,
                )
                self.assertEqual(scene_object.name, f"radar-asset-test-{index}")


if __name__ == "__main__":
    unittest.main()
