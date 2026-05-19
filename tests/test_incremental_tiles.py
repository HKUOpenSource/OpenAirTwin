from __future__ import annotations

from pathlib import Path
import tempfile
import unittest

import numpy as np

from backend.scene.incremental_tiles import (
    _gltf_category,
    build_download_url,
    cleanup_tile_download_artifacts,
    integrate_staged_tile,
    normalize_tile_id,
)


class IncrementalTileTests(unittest.TestCase):
    def test_tile_id_normalization_accepts_display_and_internal_forms(self) -> None:
        self.assertEqual(normalize_tile_id("11-SW-7A").internal, "11_SW_7A")
        self.assertEqual(normalize_tile_id("11_SW_7A").display, "11-SW-7A")
        self.assertEqual(normalize_tile_id("8-ne-15d").display, "8-NE-15D")

    def test_download_url_matches_open3dhk_query_builder(self) -> None:
        url = build_download_url(
            "11_SW_7A",
            base_url="https://data11.map.gov.hk/api/3d-zip",
            file_format="GLTF",
            key="key123",
        )

        self.assertEqual(url, "https://data11.map.gov.hk/api/3d-zip/GLTF/11-SW-7A.zip?key=key123")

    def test_invalid_tile_id_is_rejected(self) -> None:
        with self.assertRaises(ValueError):
            normalize_tile_id("../11-SW-7A")

    def test_gltf_category_uses_top_level_extract_directory(self) -> None:
        ids = normalize_tile_id("11-NW-23D")
        source_root = Path("/tmp/source/11_NW_23D")

        category = _gltf_category(
            source_root / "TERRAIN(TB)" / "T33750180000106E12" / "T33750180000106E12.gltf",
            source_root,
            ids,
        )

        self.assertEqual(category, "TERRAIN(TB)")

    def test_gltf_category_accepts_nested_tile_directory(self) -> None:
        ids = normalize_tile_id("11-NW-23D")
        source_root = Path("/tmp/source")

        category = _gltf_category(
            source_root / "11-NW-23D" / "TERRAIN(TB)" / "T33750180000106E12" / "T33750180000106E12.gltf",
            source_root,
            ids,
        )

        self.assertEqual(category, "TERRAIN(TB)")

    def test_cleanup_tile_download_artifacts_removes_partial_outputs(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            workspace = root / "workspace"
            stage = root / "stage"
            scene = root / "scene"
            for path in (
                workspace / "downloads" / "11_SW_7A" / "11-SW-7A.zip.tmp",
                workspace / "downloads" / "11_SW_7A" / "11-SW-7A.zip",
                workspace / "sources" / "11_SW_7A" / "asset.gltf",
                stage / "tiles" / "11_SW_7A" / "tile_manifest.json",
                scene / "tiles" / "11_SW_7A.xml",
                scene / "meshes" / "11_SW_7A" / "mesh.ply",
            ):
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_text("partial", encoding="utf-8")

            cleanup_tile_download_artifacts("11-SW-7A", workspace, stage, scene)

            self.assertFalse((workspace / "downloads" / "11_SW_7A").exists())
            self.assertFalse((workspace / "sources" / "11_SW_7A").exists())
            self.assertFalse((stage / "tiles" / "11_SW_7A").exists())
            self.assertFalse((scene / "tiles" / "11_SW_7A.xml").exists())
            self.assertFalse((scene / "meshes" / "11_SW_7A").exists())

    def test_integrate_staged_tile_writes_per_tile_xml_when_split_scene_exists(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            scene_root = root / "scene"
            stage_root = root / "stage"
            scene_xml = scene_root / "scenario_HKU.xml"
            (scene_root / "common").mkdir(parents=True)
            (scene_root / "tiles").mkdir(parents=True)
            scene_xml.write_text('<scene version="2.1.0"><shape id="legacy"/></scene>', encoding="utf-8")
            (scene_root / "common" / "scene_common.xml").write_text(
                '<scene version="2.1.0"><bsdf type="diffuse" id="itu_concrete"/></scene>',
                encoding="utf-8",
            )
            (scene_root / "tiles" / "11_SW_8A.xml").write_text('<scene version="2.1.0"/>', encoding="utf-8")
            (stage_root / "origin.json").parent.mkdir(parents=True)
            (stage_root / "origin.json").write_text('{"origin_world_z_up":[0,0,0]}', encoding="utf-8")

            cache_relpath = Path("tiles") / "11_SW_7A" / ".cache" / "BUILDING" / "obj_11_SW_7A__BUILDING__demo.npz"
            cache_path = stage_root / cache_relpath
            cache_path.parent.mkdir(parents=True, exist_ok=True)
            np.savez_compressed(
                cache_path,
                vertices=np.array([[0, 0, 0], [1, 0, 0], [0, 1, 0]], dtype=np.float64),
                faces=np.array([[0, 1, 2]], dtype=np.int64),
            )
            manifest_dir = stage_root / "tiles" / "11_SW_7A"
            manifest_dir.mkdir(parents=True, exist_ok=True)
            (manifest_dir / "tile_manifest.json").write_text(
                """
{
  "objects": [
    {
      "shape_id": "obj_11_SW_7A__BUILDING__demo",
      "category": "BUILDING",
      "material_id": "itu_concrete",
      "stage_cache_relpath": "tiles/11_SW_7A/.cache/BUILDING/obj_11_SW_7A__BUILDING__demo.npz"
    }
  ]
}
""".strip(),
                encoding="utf-8",
            )

            result = integrate_staged_tile(scene_root, scene_xml, stage_root, "11-SW-7A")

            tile_xml = scene_root / "tiles" / "11_SW_7A.xml"
            self.assertEqual(result["tile_xml_path"], str(tile_xml))
            self.assertTrue(tile_xml.exists())
            self.assertIn('value="meshes/11_SW_7A/BUILDING/obj_11_SW_7A__BUILDING__demo.ply"', tile_xml.read_text())
            self.assertNotIn("obj_11_SW_7A__BUILDING__demo", scene_xml.read_text())


if __name__ == "__main__":
    unittest.main()
