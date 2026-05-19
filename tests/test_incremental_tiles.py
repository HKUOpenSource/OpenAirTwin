from __future__ import annotations

import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import numpy as np

from backend.scene.incremental_tiles import (
    TileDownloadCancelled,
    _gltf_category,
    build_download_url,
    cleanup_tile_download_artifacts,
    download_stage_and_integrate_tile,
    integrate_staged_tile,
    load_or_create_scene_origin,
    normalize_tile_id,
    scene_contains_tile,
    stage_tile_assets,
)


class IncrementalTileTests(unittest.TestCase):
    def _write_staged_tile_manifest(self, stage_root: Path, tile_id: str = "11-SW-7A", object_count: int = 1) -> None:
        ids = normalize_tile_id(tile_id)
        objects = []
        for index in range(object_count):
            shape_id = f"obj_{ids.internal}__BUILDING__demo_{index}"
            cache_relpath = Path("tiles") / ids.internal / ".cache" / "BUILDING" / f"{shape_id}.npz"
            cache_path = stage_root / cache_relpath
            cache_path.parent.mkdir(parents=True, exist_ok=True)
            offset = float(index)
            np.savez_compressed(
                cache_path,
                vertices=np.array(
                    [[800000 + offset, 844000, 0], [800001 + offset, 844000, 0], [800000 + offset, 844001, 0]],
                    dtype=np.float64,
                ),
                faces=np.array([[0, 1, 2]], dtype=np.int64),
            )
            objects.append(
                {
                    "shape_id": shape_id,
                    "category": "BUILDING",
                    "material_id": "itu_concrete",
                    "stage_cache_relpath": str(cache_relpath).replace("\\", "/"),
                }
            )
        manifest_dir = stage_root / "tiles" / ids.internal
        manifest_dir.mkdir(parents=True, exist_ok=True)
        (manifest_dir / "tile_manifest.json").write_text(
            json.dumps({"objects": objects}, indent=2),
            encoding="utf-8",
        )

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

        building_category = _gltf_category(
            source_root / "BUILDING" / "B33750180000106E12" / "B33750180000106E12.gltf",
            source_root,
            ids,
        )
        category = _gltf_category(
            source_root / "TERRAIN(TB)" / "T33750180000106E12" / "T33750180000106E12.gltf",
            source_root,
            ids,
        )

        self.assertEqual(building_category, "BUILDING")
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

    def test_gltf_category_accepts_multilevel_wrapper_before_category(self) -> None:
        ids = normalize_tile_id("11-SW-3B")
        source_root = Path("/tmp/source")

        category = _gltf_category(
            source_root / "downloads" / "11-SW-3B" / "GLTF" / "BUILDING" / "B340331785401063A0" / "B340331785401063A0.gltf",
            source_root,
            ids,
        )

        self.assertEqual(category, "BUILDING")

    def test_gltf_category_accepts_source_root_as_category_directory(self) -> None:
        ids = normalize_tile_id("11-SW-3B")
        source_root = Path("/tmp/source/BUILDING")

        category = _gltf_category(
            source_root / "B340331785401063A0" / "B340331785401063A0.gltf",
            source_root,
            ids,
        )

        self.assertEqual(category, "BUILDING")

    def test_stage_tile_assets_refreshes_stale_category_cache(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            source_root = root / "source"
            stage_root = root / "stage"
            gltf_path = source_root / "BUILDING" / "B340331785401063A0" / "B340331785401063A0.gltf"
            gltf_path.parent.mkdir(parents=True)
            gltf_path.write_text("{}", encoding="utf-8")
            tile_stage_dir = stage_root / "tiles" / "11_SW_3B"
            stale_cache = tile_stage_dir / ".cache" / "B340331785401063A0" / "stale.npz"
            stale_cache.parent.mkdir(parents=True)
            stale_cache.write_text("stale", encoding="utf-8")
            (tile_stage_dir / "tile_manifest.json").write_text(
                json.dumps(
                    {
                        "schema_version": 1,
                        "tile": "11_SW_3B",
                        "objects": [
                            {
                                "shape_id": "obj_11_SW_3B_B340331785401063A0_B340331785401063A0",
                                "category": "B340331785401063A0",
                                "category_path": "B340331785401063A0",
                                "source_gltf": "BUILDING/B340331785401063A0/B340331785401063A0.gltf",
                                "material_id": "itu_concrete",
                            }
                        ],
                    },
                    indent=2,
                ),
                encoding="utf-8",
            )
            fake_mesh = type("FakeMesh", (), {"bounds": np.array([[0, 0, 0], [1, 1, 1]], dtype=np.float64)})()
            fake_trimesh = type("FakeTrimesh", (), {"load": lambda self, *args, **kwargs: object()})()

            with (
                patch("backend.scene.incremental_tiles._trimesh_module", return_value=fake_trimesh),
                patch("backend.scene.incremental_tiles.iter_scene_meshes", return_value=[(0, "node", fake_mesh)]),
                patch("backend.scene.incremental_tiles.to_z_up_world", return_value=fake_mesh),
                patch("backend.scene.incremental_tiles.write_stage_mesh_cache"),
            ):
                manifest_path = stage_tile_assets(source_root, stage_root, "11-SW-3B")

            manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
            self.assertFalse(stale_cache.exists())
            self.assertEqual(manifest["objects"][0]["category"], "BUILDING")
            self.assertEqual(manifest["objects"][0]["category_path"], "BUILDING")
            self.assertEqual(manifest["objects"][0]["material_id"], "itu_concrete")
            self.assertEqual(
                manifest["objects"][0]["stage_cache_relpath"],
                "tiles/11_SW_3B/.cache/BUILDING/obj_11_SW_3B_BUILDING_B340331785401063A0.npz",
            )

    def test_stage_tile_assets_maps_open3d_hk_categories_to_materials(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            source_root = root / "source"
            stage_root = root / "stage"
            for category, stem in (
                ("TERRAIN(TB)", "T33750174000106E12"),
                ("VEGETATION(TB)", "V337501740001062A0"),
                ("WATERBODY", "W341791785814062A0"),
            ):
                gltf_path = source_root / category / stem / f"{stem}.gltf"
                gltf_path.parent.mkdir(parents=True, exist_ok=True)
                gltf_path.write_text("{}", encoding="utf-8")
            fake_mesh = type("FakeMesh", (), {"bounds": np.array([[0, 0, 0], [1, 1, 1]], dtype=np.float64)})()
            fake_trimesh = type("FakeTrimesh", (), {"load": lambda self, *args, **kwargs: object()})()

            with (
                patch("backend.scene.incremental_tiles._trimesh_module", return_value=fake_trimesh),
                patch("backend.scene.incremental_tiles.iter_scene_meshes", return_value=[(0, "node", fake_mesh)]),
                patch("backend.scene.incremental_tiles.to_z_up_world", return_value=fake_mesh),
                patch("backend.scene.incremental_tiles.write_stage_mesh_cache"),
            ):
                manifest_path = stage_tile_assets(source_root, stage_root, "11-SW-3B")

            manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
            material_by_category = {item["category"]: item["material_id"] for item in manifest["objects"]}
            self.assertEqual(material_by_category["TERRAIN(TB)"], "itu_medium_dry_ground")
            self.assertEqual(material_by_category["VEGETATION(TB)"], "itu_wood")
            self.assertEqual(material_by_category["WATERBODY"], "itu_wet_ground")

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

    def test_per_tile_only_scene_infers_origin_without_legacy_scene_xml(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            scene_root = root / "scene"
            stage_root = root / "stage"
            scene_xml = scene_root / "scene.xml"
            (scene_root / "common").mkdir(parents=True)
            (scene_root / "tiles").mkdir(parents=True)
            (scene_root / "common" / "scene_common.xml").write_text(
                '<scene version="2.1.0"><bsdf type="diffuse" id="itu_concrete"/></scene>',
                encoding="utf-8",
            )
            (scene_root / "tiles" / "11_SW_8A.xml").write_text(
                """
<scene version="2.1.0">
  <shape type="ply" id="existing_11_SW_8A">
    <string name="filename" value="meshes/11_SW_8A/BUILDING/existing.ply" />
    <boolean name="face_normals" value="true" />
    <ref name="bsdf" id="itu_concrete" />
  </shape>
</scene>
""".strip(),
                encoding="utf-8",
            )

            self.assertFalse(scene_xml.exists())
            self.assertTrue(scene_contains_tile(scene_root, scene_xml, "11-SW-8A"))

            origin = load_or_create_scene_origin(scene_root, scene_xml, stage_root)

            origin_path = stage_root / "origin.json"
            self.assertTrue(origin_path.exists())
            payload = json.loads(origin_path.read_text(encoding="utf-8"))
            np.testing.assert_allclose(origin, np.asarray(payload["origin_world_z_up"], dtype=np.float64))
            self.assertEqual(origin[2], 0.0)

    def test_integrate_first_staged_tile_bootstraps_empty_scene_layout(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            scene_root = root / "scene"
            stage_root = root / "stage"
            scene_xml = scene_root / "scene.xml"

            cache_relpath = Path("tiles") / "11_SW_7A" / ".cache" / "BUILDING" / "obj_11_SW_7A__BUILDING__demo.npz"
            cache_path = stage_root / cache_relpath
            cache_path.parent.mkdir(parents=True, exist_ok=True)
            np.savez_compressed(
                cache_path,
                vertices=np.array([[800000, 844000, 0], [800001, 844000, 0], [800000, 844001, 0]], dtype=np.float64),
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
            self.assertFalse(scene_xml.exists())
            self.assertTrue((scene_root / "common" / "scene_common.xml").exists())
            self.assertTrue((stage_root / "origin.json").exists())
            self.assertEqual(result["tile_xml_path"], str(tile_xml))
            self.assertTrue(tile_xml.exists())
            self.assertIn('value="meshes/11_SW_7A/BUILDING/obj_11_SW_7A__BUILDING__demo.ply"', tile_xml.read_text())
            self.assertTrue((scene_root / "meshes" / "11_SW_7A" / "BUILDING" / "obj_11_SW_7A__BUILDING__demo.ply").exists())
            self.assertFalse((scene_root / "cache" / "incremental_tile_commits" / "11_SW_7A").exists())

    def test_integrate_staged_tile_cleans_temp_outputs_when_xml_prepare_fails(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            scene_root = root / "scene"
            stage_root = root / "stage"
            scene_xml = scene_root / "scene.xml"
            self._write_staged_tile_manifest(stage_root)

            with patch("backend.scene.incremental_tiles._build_tile_scene_xml_tree", side_effect=RuntimeError("xml boom")):
                with self.assertRaises(RuntimeError):
                    integrate_staged_tile(scene_root, scene_xml, stage_root, "11-SW-7A")

            self.assertFalse((scene_root / "meshes" / "11_SW_7A").exists())
            self.assertFalse((scene_root / "tiles" / "11_SW_7A.xml").exists())
            self.assertFalse((scene_root / "cache" / "incremental_tile_commits" / "11_SW_7A").exists())
            self.assertTrue((stage_root / "origin.json").exists())

    def test_integrate_staged_tile_cleans_final_mesh_when_xml_replace_fails(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            scene_root = root / "scene"
            stage_root = root / "stage"
            scene_xml = scene_root / "scene.xml"
            self._write_staged_tile_manifest(stage_root)

            def fail_xml_replace(source: Path, target: Path) -> None:
                if target == scene_root / "tiles" / "11_SW_7A.xml":
                    raise OSError("replace failed")
                source.replace(target)

            with patch("backend.scene.incremental_tiles._replace_path", side_effect=fail_xml_replace):
                with self.assertRaises(OSError):
                    integrate_staged_tile(scene_root, scene_xml, stage_root, "11-SW-7A")

            self.assertFalse((scene_root / "meshes" / "11_SW_7A").exists())
            self.assertFalse((scene_root / "tiles" / "11_SW_7A.xml").exists())
            self.assertFalse((scene_root / "cache" / "incremental_tile_commits" / "11_SW_7A").exists())
            self.assertTrue((stage_root / "origin.json").exists())

    def test_integrate_staged_tile_cleans_staged_outputs_when_cancelled(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            scene_root = root / "scene"
            stage_root = root / "stage"
            scene_xml = scene_root / "scene.xml"
            self._write_staged_tile_manifest(stage_root, object_count=2)
            checks = {"count": 0}

            def cancel_after_first_mesh() -> bool:
                checks["count"] += 1
                return checks["count"] > 1

            with self.assertRaises(TileDownloadCancelled):
                integrate_staged_tile(scene_root, scene_xml, stage_root, "11-SW-7A", cancel_check=cancel_after_first_mesh)

            self.assertFalse((scene_root / "meshes" / "11_SW_7A").exists())
            self.assertFalse((scene_root / "tiles" / "11_SW_7A.xml").exists())
            self.assertFalse((scene_root / "cache" / "incremental_tile_commits" / "11_SW_7A").exists())
            self.assertTrue((stage_root / "origin.json").exists())

    def test_download_stage_and_integrate_tile_cleans_scene_outputs_on_non_cancel_failure(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            scene_root = root / "scene"
            scene_xml = scene_root / "scene.xml"
            workspace_root = root / "workspace"
            stage_root = root / "stage"
            (scene_root / "meshes" / "11_SW_7A").mkdir(parents=True)
            (scene_root / "meshes" / "11_SW_7A" / "partial.ply").write_text("partial", encoding="utf-8")
            (scene_root / "tiles").mkdir(parents=True)
            (scene_root / "tiles" / "11_SW_7A.xml").write_text('<scene version="2.1.0"/>', encoding="utf-8")
            zip_path = workspace_root / "downloads" / "11_SW_7A" / "11-SW-7A.zip"

            with (
                patch("backend.scene.incremental_tiles.download_tile_zip", return_value=(zip_path, "https://example.test/11-SW-7A.zip")),
                patch("backend.scene.incremental_tiles.extract_tile_zip", return_value=workspace_root / "sources" / "11_SW_7A"),
                patch("backend.scene.incremental_tiles.stage_tile_assets", return_value=stage_root / "tiles" / "11_SW_7A" / "tile_manifest.json"),
                patch("backend.scene.incremental_tiles.integrate_staged_tile", side_effect=RuntimeError("integration failed")),
            ):
                with self.assertRaises(RuntimeError):
                    download_stage_and_integrate_tile(
                        "11-SW-7A",
                        scene_root=scene_root,
                        scene_xml=scene_xml,
                        workspace_root=workspace_root,
                        stage_root=stage_root,
                        base_url="https://example.test",
                        file_format="GLTF",
                        key="key",
                    )

            self.assertFalse((scene_root / "meshes" / "11_SW_7A").exists())
            self.assertFalse((scene_root / "tiles" / "11_SW_7A.xml").exists())

    def test_integrate_staged_tile_writes_per_tile_xml_when_split_scene_exists(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            scene_root = root / "scene"
            stage_root = root / "stage"
            scene_xml = scene_root / "scene.xml"
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
