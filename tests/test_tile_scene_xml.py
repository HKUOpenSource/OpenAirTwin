from __future__ import annotations

from pathlib import Path
from types import SimpleNamespace
import tempfile
from threading import Event
import time
import unittest
import xml.etree.ElementTree as ET

from backend.rt.runtime import RTRuntime, SceneNotReady
from backend.scene.tile_scene_xml import TileSceneXmlBuilder, ensure_scene_layout
from backend.scene.xml_catalog import load_scene_manifest
from backend.tools.migrate_legacy_scene_xml import PerTileSceneExists, migrate_legacy_scene_xml
from backend.tools.split_tile_scene_xml import split_scene_xml


def write_scene_xml(scene_root: Path) -> Path:
    xml_path = scene_root / "scene.xml"
    xml_path.write_text(
        """<?xml version="1.0" encoding="utf-8"?>
<scene version="3.0.0">
  <integrator type="path" />
  <emitter type="constant">
    <rgb name="radiance" value="0.7 0.7 0.7" />
  </emitter>
  <bsdf type="itu-radio-material" id="itu_concrete">
    <string name="type" value="concrete" />
  </bsdf>
  <bsdf type="itu-radio-material" id="itu_medium_dry_ground">
    <string name="type" value="medium_dry_ground" />
  </bsdf>
  <shape type="ply" id="a_building_1">
    <string name="filename" value="meshes/TILE_A/BUILDING/a_building_1.ply" />
    <boolean name="face_normals" value="true" />
    <ref name="bsdf" id="itu_concrete" />
  </shape>
  <shape type="ply" id="a_terrain_1">
    <string name="filename" value="meshes/TILE_A/TERRAIN_TB/a_terrain_1.ply" />
    <boolean name="face_normals" value="true" />
    <ref name="bsdf" id="itu_medium_dry_ground" />
  </shape>
  <shape type="ply" id="b_building_1">
    <string name="filename" value="meshes/TILE_B/BUILDING/b_building_1.ply" />
    <boolean name="face_normals" value="true" />
    <ref name="bsdf" id="itu_concrete" />
  </shape>
</scene>
""",
        encoding="utf-8",
    )
    return xml_path


def write_legacy_only_scene_xml(scene_root: Path) -> Path:
    xml_path = scene_root / "scene.xml"
    xml_path.write_text(
        """<?xml version="1.0" encoding="utf-8"?>
<scene version="3.0.0">
  <integrator type="path" />
  <bsdf type="itu-radio-material" id="itu_concrete">
    <string name="type" value="concrete" />
  </bsdf>
  <shape type="ply" id="legacy_building_1">
    <string name="filename" value="meshes/TILE_LEGACY/BUILDING/legacy_building_1.ply" />
    <boolean name="face_normals" value="true" />
    <ref name="bsdf" id="itu_concrete" />
  </shape>
</scene>
""",
        encoding="utf-8",
    )
    return xml_path


def write_per_tile_xml(scene_root: Path) -> None:
    common_dir = scene_root / "common"
    tile_dir = scene_root / "tiles"
    common_dir.mkdir(parents=True, exist_ok=True)
    tile_dir.mkdir(parents=True, exist_ok=True)
    (common_dir / "scene_common.xml").write_text(
        """<?xml version="1.0" encoding="utf-8"?>
<scene version="3.0.0">
  <integrator type="path" />
  <emitter type="constant">
    <rgb name="radiance" value="0.7 0.7 0.7" />
  </emitter>
  <bsdf type="itu-radio-material" id="itu_concrete">
    <string name="type" value="concrete" />
  </bsdf>
  <bsdf type="itu-radio-material" id="itu_medium_dry_ground">
    <string name="type" value="medium_dry_ground" />
  </bsdf>
</scene>
""",
        encoding="utf-8",
    )
    (tile_dir / "TILE_A.xml").write_text(
        """<?xml version="1.0" encoding="utf-8"?>
<scene version="3.0.0">
  <shape type="ply" id="a_building_1">
    <string name="filename" value="meshes/TILE_A/BUILDING/a_building_1.ply" />
    <boolean name="face_normals" value="true" />
    <ref name="bsdf" id="itu_concrete" />
  </shape>
  <shape type="ply" id="a_terrain_1">
    <string name="filename" value="meshes/TILE_A/TERRAIN_TB/a_terrain_1.ply" />
    <boolean name="face_normals" value="true" />
    <ref name="bsdf" id="itu_medium_dry_ground" />
  </shape>
</scene>
""",
        encoding="utf-8",
    )
    (tile_dir / "TILE_B.xml").write_text(
        """<?xml version="1.0" encoding="utf-8"?>
<scene version="3.0.0">
  <shape type="ply" id="b_building_1">
    <string name="filename" value="meshes/TILE_B/BUILDING/b_building_1.ply" />
    <boolean name="face_normals" value="true" />
    <ref name="bsdf" id="itu_concrete" />
  </shape>
</scene>
""",
        encoding="utf-8",
    )


class TileSceneXmlBuilderTests(unittest.TestCase):
    def test_single_tile_selection_contains_only_that_tile(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            scene_root = Path(tmp_dir)
            source_xml = write_scene_xml(scene_root)
            split_scene_xml(scene_root, source_xml)
            builder = TileSceneXmlBuilder(scene_root, source_xml, scene_root / "generated")

            result = builder.write_selection(["TILE_A"])

            self.assertEqual(result.tile_ids, ("TILE_A",))
            self.assertEqual(result.shape_count, 2)
            root = ET.parse(result.path).getroot()
            shape_ids = [shape.attrib["id"] for shape in root.findall("shape")]
            self.assertEqual(shape_ids, ["a_building_1", "a_terrain_1"])
            filenames = [
                shape.find('string[@name="filename"]').attrib["value"]
                for shape in root.findall("shape")
            ]
            self.assertTrue(all(Path(filename).is_absolute() for filename in filenames))
            self.assertTrue(all("TILE_A" in filename for filename in filenames))
            self.assertEqual(len(root.findall("bsdf")), 2)

    def test_multi_tile_selection_keeps_common_nodes_once(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            scene_root = Path(tmp_dir)
            source_xml = write_scene_xml(scene_root)
            split_scene_xml(scene_root, source_xml)
            builder = TileSceneXmlBuilder(scene_root, source_xml, scene_root / "generated")

            result = builder.write_selection(["TILE_B", "TILE_A"])

            root = ET.parse(result.path).getroot()
            self.assertEqual(result.tile_ids, ("TILE_A", "TILE_B"))
            self.assertEqual(result.shape_count, 3)
            self.assertEqual(len(root.findall("integrator")), 1)
            self.assertEqual(len(root.findall("emitter")), 1)
            self.assertEqual(len(root.findall("bsdf")), 2)
            self.assertEqual(len(root.findall("shape")), 3)

    def test_empty_and_unknown_tile_selection_are_rejected(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            scene_root = Path(tmp_dir)
            source_xml = write_scene_xml(scene_root)
            split_scene_xml(scene_root, source_xml)
            builder = TileSceneXmlBuilder(scene_root, source_xml, scene_root / "generated")

            self.assertEqual(builder.normalize_tile_ids([]), ())
            with self.assertRaisesRegex(ValueError, "at least one tile"):
                builder.write_selection([])
            with self.assertRaisesRegex(ValueError, "Unknown tile id"):
                builder.normalize_tile_ids(["TILE_Z"])

    def test_per_tile_source_is_preferred_over_legacy_scene(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            scene_root = Path(tmp_dir)
            source_xml = write_legacy_only_scene_xml(scene_root)
            write_per_tile_xml(scene_root)

            builder = TileSceneXmlBuilder(scene_root, source_xml, scene_root / "generated")
            result = builder.write_selection(["TILE_A"])

            self.assertEqual(builder.source_mode, "per_tile")
            self.assertEqual(builder.available_tile_ids, frozenset({"TILE_A", "TILE_B"}))
            self.assertEqual(result.shape_count, 2)
            root = ET.parse(result.path).getroot()
            shape_ids = [shape.attrib["id"] for shape in root.findall("shape")]
            self.assertEqual(shape_ids, ["a_building_1", "a_terrain_1"])
            self.assertNotIn("TILE_LEGACY", result.path.read_text(encoding="utf-8"))

    def test_per_tile_source_does_not_require_legacy_scene_xml(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            scene_root = Path(tmp_dir)
            source_xml = scene_root / "scene.xml"
            write_per_tile_xml(scene_root)

            builder = TileSceneXmlBuilder(scene_root, source_xml, scene_root / "generated")
            manifest = load_scene_manifest(scene_root, source_xml)
            result = builder.write_selection(["TILE_B"])

            self.assertEqual(builder.source_mode, "per_tile")
            self.assertFalse(source_xml.exists())
            self.assertEqual(set(manifest.tiles), {"TILE_A", "TILE_B"})
            self.assertEqual(result.shape_count, 1)

    def test_absolute_tile_filename_is_rewritten_and_manifest_relative(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            scene_root = Path(tmp_dir)
            source_xml = write_scene_xml(scene_root)
            write_per_tile_xml(scene_root)
            tile_a_xml = scene_root / "tiles" / "TILE_A.xml"
            absolute_mesh = (scene_root / "meshes/TILE_A/BUILDING/a_building_1.ply").resolve()
            tile_a_xml.write_text(
                tile_a_xml.read_text(encoding="utf-8").replace(
                    "meshes/TILE_A/BUILDING/a_building_1.ply",
                    str(absolute_mesh),
                ),
                encoding="utf-8",
            )

            builder = TileSceneXmlBuilder(scene_root, source_xml, scene_root / "generated")
            result = builder.write_selection(["TILE_A"])
            manifest = load_scene_manifest(scene_root, source_xml)

            filename = ET.parse(result.path).getroot().find('shape/string[@name="filename"]').attrib["value"]
            self.assertEqual(Path(filename), absolute_mesh)
            self.assertIn("meshes/TILE_A/BUILDING/a_building_1.ply", [mesh.relative_path for mesh in manifest.meshes])


class SceneManifestXmlSourceTests(unittest.TestCase):
    def test_manifest_prefers_per_tile_xml_over_legacy_scene(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            scene_root = Path(tmp_dir)
            source_xml = write_legacy_only_scene_xml(scene_root)
            write_per_tile_xml(scene_root)

            manifest = load_scene_manifest(scene_root, source_xml)

            self.assertEqual(set(manifest.tiles), {"TILE_A", "TILE_B"})
            self.assertEqual(manifest.tiles["TILE_A"]["BUILDING"], 1)
            self.assertEqual(manifest.tiles["TILE_A"]["TERRAIN_TB"], 1)
            self.assertEqual(manifest.tiles["TILE_B"]["BUILDING"], 1)
            self.assertNotIn("TILE_LEGACY", manifest.tiles)

    def test_manifest_ignores_legacy_only_scene_at_runtime(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            scene_root = Path(tmp_dir)
            source_xml = write_legacy_only_scene_xml(scene_root)

            manifest = load_scene_manifest(scene_root, source_xml)
            builder = TileSceneXmlBuilder(scene_root, source_xml, scene_root / "generated")

            self.assertEqual(manifest.tiles, {})
            self.assertEqual(builder.available_tile_ids, frozenset())
            self.assertTrue((scene_root / "common" / "scene_common.xml").exists())
            self.assertTrue((scene_root / "tiles").is_dir())
            self.assertTrue(source_xml.exists())

    def test_empty_scene_layout_loads_as_empty_manifest(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            scene_root = Path(tmp_dir)
            source_xml = scene_root / "scene.xml"

            ensure_scene_layout(scene_root)
            manifest = load_scene_manifest(scene_root, source_xml)

            self.assertFalse(source_xml.exists())
            self.assertEqual(manifest.meshes, [])
            self.assertEqual(manifest.tiles, {})
            self.assertEqual(manifest.bundles, [])


class SplitTileSceneXmlTests(unittest.TestCase):
    def test_split_scene_xml_writes_common_and_tile_files(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            scene_root = Path(tmp_dir)
            source_xml = write_scene_xml(scene_root)

            result = split_scene_xml(scene_root, source_xml)

            self.assertEqual(result.tile_count, 2)
            self.assertEqual(result.shape_count, 3)
            common_root = ET.parse(scene_root / "common" / "scene_common.xml").getroot()
            tile_a_root = ET.parse(scene_root / "tiles" / "TILE_A.xml").getroot()
            tile_b_root = ET.parse(scene_root / "tiles" / "TILE_B.xml").getroot()
            self.assertEqual(len(common_root.findall("shape")), 0)
            self.assertEqual(len(common_root.findall("bsdf")), 2)
            self.assertEqual(len(tile_a_root.findall("shape")), 2)
            self.assertEqual(len(tile_b_root.findall("shape")), 1)

            builder = TileSceneXmlBuilder(scene_root, source_xml, scene_root / "generated")
            self.assertEqual(builder.source_mode, "per_tile")
            self.assertEqual(builder.shape_count_for_tiles(("TILE_A", "TILE_B")), 3)


class LegacySceneMigrationTests(unittest.TestCase):
    def test_legacy_only_scene_migrates_to_per_tile_xml(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            scene_root = Path(tmp_dir)
            source_xml = write_scene_xml(scene_root)

            result = migrate_legacy_scene_xml(scene_root, source_xml)
            manifest = load_scene_manifest(scene_root, source_xml)

            self.assertEqual(result.written_tile_count, 2)
            self.assertEqual(result.written_shape_count, 3)
            self.assertEqual(set(manifest.tiles), {"TILE_A", "TILE_B"})
            self.assertTrue((scene_root / "common" / "scene_common.xml").exists())

    def test_migration_refuses_to_overwrite_existing_per_tile_xml(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            scene_root = Path(tmp_dir)
            source_xml = write_scene_xml(scene_root)
            write_per_tile_xml(scene_root)
            tile_a_xml = scene_root / "tiles" / "TILE_A.xml"
            original_tile_a = tile_a_xml.read_text(encoding="utf-8")

            with self.assertRaises(PerTileSceneExists) as error:
                migrate_legacy_scene_xml(scene_root, source_xml)

            self.assertEqual(error.exception.stats.existing_tile_xml_count, 2)
            self.assertEqual(tile_a_xml.read_text(encoding="utf-8"), original_tile_a)

    def test_migration_merges_only_missing_tiles(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            scene_root = Path(tmp_dir)
            source_xml = write_scene_xml(scene_root)
            write_per_tile_xml(scene_root)
            tile_a_xml = scene_root / "tiles" / "TILE_A.xml"
            tile_b_xml = scene_root / "tiles" / "TILE_B.xml"
            original_tile_a = tile_a_xml.read_text(encoding="utf-8")
            tile_b_xml.unlink()

            result = migrate_legacy_scene_xml(scene_root, source_xml, merge_missing_tiles=True)

            self.assertEqual(result.written_tile_count, 1)
            self.assertEqual(result.skipped_existing_tile_count, 1)
            self.assertEqual(tile_a_xml.read_text(encoding="utf-8"), original_tile_a)
            self.assertTrue(tile_b_xml.exists())


class LazyRTRuntimeTests(unittest.TestCase):
    def wait_for_ready(self, runtime: RTRuntime, timeout: float = 2.0) -> dict:
        deadline = time.time() + timeout
        while time.time() < deadline:
            status = runtime.status_dict()
            if status["status"] == "ready":
                return status
            if status["status"] == "failed":
                self.fail(status["message"])
            time.sleep(0.01)
        self.fail("Timed out waiting for runtime to become ready")

    def test_startup_does_not_load_scene(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            scene_root = Path(tmp_dir)
            source_xml = write_scene_xml(scene_root)
            split_scene_xml(scene_root, source_xml)
            builder = TileSceneXmlBuilder(scene_root, source_xml, scene_root / "generated")

            def loader(_path: Path, _frequency: float):
                raise AssertionError("loader should not run during startup")

            runtime = RTRuntime(source_xml, 3.5e9, builder, scene_loader=loader)

            self.assertEqual(runtime.status_dict()["status"], "empty")
            with self.assertRaises(SceneNotReady):
                runtime.require_ready()

    def test_selection_loading_sets_active_tiles(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            scene_root = Path(tmp_dir)
            source_xml = write_scene_xml(scene_root)
            split_scene_xml(scene_root, source_xml)
            builder = TileSceneXmlBuilder(scene_root, source_xml, scene_root / "generated")

            def loader(path: Path, frequency: float):
                return SimpleNamespace(path=path, frequency=frequency)

            runtime = RTRuntime(source_xml, 3.5e9, builder, scene_loader=loader)
            created = runtime.request_scene_selection(["TILE_A"])
            self.assertEqual(created["status"], "loading")

            ready = self.wait_for_ready(runtime)

            self.assertEqual(ready["active_tile_ids"], ["TILE_A"])
            self.assertEqual(ready["shape_count"], 2)
            self.assertIs(runtime.require_ready(), runtime.scene)

    def test_latest_generation_wins(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            scene_root = Path(tmp_dir)
            source_xml = write_scene_xml(scene_root)
            split_scene_xml(scene_root, source_xml)
            builder = TileSceneXmlBuilder(scene_root, source_xml, scene_root / "generated")

            def loader(path: Path, frequency: float):
                time.sleep(0.03)
                return SimpleNamespace(path=path, frequency=frequency)

            runtime = RTRuntime(source_xml, 3.5e9, builder, scene_loader=loader)

            runtime.request_scene_selection(["TILE_A"])
            runtime.request_scene_selection(["TILE_B"])
            ready = self.wait_for_ready(runtime)

            self.assertEqual(ready["active_tile_ids"], ["TILE_B"])
            self.assertEqual(ready["shape_count"], 1)

    def test_loading_runtime_rejects_solver_access(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            scene_root = Path(tmp_dir)
            source_xml = write_scene_xml(scene_root)
            split_scene_xml(scene_root, source_xml)
            builder = TileSceneXmlBuilder(scene_root, source_xml, scene_root / "generated")
            started = Event()
            release = Event()

            def loader(path: Path, frequency: float):
                started.set()
                release.wait(timeout=2)
                return SimpleNamespace(path=path, frequency=frequency)

            runtime = RTRuntime(source_xml, 3.5e9, builder, scene_loader=loader)
            runtime.request_scene_selection(["TILE_A"])
            self.assertTrue(started.wait(timeout=1))

            with self.assertRaisesRegex(SceneNotReady, "still loading"):
                runtime.require_ready()

            release.set()
            self.wait_for_ready(runtime)


if __name__ == "__main__":
    unittest.main()
