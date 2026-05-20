from __future__ import annotations

from pathlib import Path
import struct
import sys
import tempfile
from types import SimpleNamespace
import unittest
import xml.etree.ElementTree as ET
from unittest.mock import patch

import numpy as np

from backend import config
from backend.rt.deepmimo_export_worker import _building_aabbs, _receiver_grid, _write_selected_tile_scene_xml
from backend.rt.terrain_patch import sample_points_on_terrain


def write_ply(path: Path, vertices: list[tuple[float, float, float]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    header = (
        "ply\n"
        "format binary_little_endian 1.0\n"
        f"element vertex {len(vertices)}\n"
        "property float x\n"
        "property float y\n"
        "property float z\n"
        "element face 0\n"
        "property list uchar int vertex_indices\n"
        "end_header\n"
    ).encode("ascii")
    body = b"".join(struct.pack("<fff", *vertex) for vertex in vertices)
    path.write_bytes(header + body)


def write_per_tile_xml(scene_root: Path) -> None:
    (scene_root / "common").mkdir(parents=True)
    (scene_root / "tiles").mkdir(parents=True)
    (scene_root / "common" / "scene_common.xml").write_text(
        """<scene version="3.0.0">
  <bsdf type="itu-radio-material" id="itu_concrete" />
</scene>""",
        encoding="utf-8",
    )
    (scene_root / "tiles" / "TILE_A.xml").write_text(
        """<scene version="3.0.0">
  <shape type="ply" id="a_building">
    <string name="filename" value="meshes/TILE_A/BUILDING/a_building.ply" />
    <ref name="bsdf" id="itu_concrete" />
  </shape>
</scene>""",
        encoding="utf-8",
    )
    (scene_root / "tiles" / "TILE_B.xml").write_text(
        """<scene version="3.0.0">
  <shape type="ply" id="b_building">
    <string name="filename" value="meshes/TILE_B/BUILDING/b_building.ply" />
    <ref name="bsdf" id="itu_concrete" />
  </shape>
</scene>""",
        encoding="utf-8",
    )


class DeepMIMOExportWorkerTests(unittest.TestCase):
    def test_selected_tile_scene_xml_uses_per_tile_source(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            scene_root = Path(tmp_dir)
            write_per_tile_xml(scene_root)
            previous_scene_root = config.SCENE_ROOT
            config.SCENE_ROOT = scene_root
            try:
                result, source_mode = _write_selected_tile_scene_xml(scene_root / "job", ("TILE_A",))
            finally:
                config.SCENE_ROOT = previous_scene_root

            self.assertEqual(source_mode, "per_tile")
            self.assertEqual(result.tile_ids, ("TILE_A",))
            self.assertEqual(result.shape_count, 1)
            root = ET.parse(result.path).getroot()
            shape_ids = [shape.attrib["id"] for shape in root.findall("shape")]
            self.assertEqual(shape_ids, ["a_building"])
            filename = root.find('shape/string[@name="filename"]').attrib["value"]
            self.assertTrue(Path(filename).is_absolute())

    def test_building_filter_reads_only_selected_tiles(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            scene_root = Path(tmp_dir)
            write_per_tile_xml(scene_root)
            write_ply(scene_root / "meshes/TILE_A/BUILDING/a_building.ply", [(0, 0, 0), (10, 10, 5)])
            write_ply(scene_root / "meshes/TILE_B/BUILDING/b_building.ply", [(2, 2, 0), (8, 8, 5)])

            boxes = _building_aabbs(scene_root, ("TILE_A",), (-5, -5), (20, 20))

            self.assertEqual(boxes.shape, (1, 4))
            self.assertEqual(boxes[0].tolist(), [0.0, 0.0, 10.0, 10.0])

    def test_receiver_grid_rejects_oversized_roi_before_allocating_arrays(self) -> None:
        with (
            patch("backend.rt.deepmimo_export_worker.np.arange") as arange,
            patch("backend.rt.deepmimo_export_worker.np.meshgrid") as meshgrid,
        ):
            with self.assertRaisesRegex(ValueError, "ROI grid creates 121 receivers, above max_receivers=120"):
                _receiver_grid((0.0, 0.0), (10.0, 10.0), 1.0, max_receivers=120)

        arange.assert_not_called()
        meshgrid.assert_not_called()

    def test_deepmimo_terrain_sampling_accepts_multiple_selected_tile_surfaces(self) -> None:
        material = SimpleNamespace(name=config.RADIOMAP_MEASUREMENT_MATERIAL)

        class FakeTerrain:
            def __init__(self, vertices):
                self.radio_material = material
                self.params = {
                    "vertex_positions": np.asarray(vertices, dtype=np.float32).reshape(-1),
                    "faces": np.asarray([[0, 1, 2]], dtype=np.uint32).reshape(-1),
                }

            def clone(self, *, as_mesh: bool = False):
                return self

        fake_mitsuba = SimpleNamespace(traverse=lambda mesh: mesh.params)
        scene = SimpleNamespace(
            objects={
                "terrain_a": FakeTerrain([(0, 0, 1), (1, 0, 1), (0, 1, 1)]),
                "terrain_b": FakeTerrain([(2, 0, 3), (3, 0, 3), (2, 1, 3)]),
            }
        )
        points_xy = np.asarray([[0.25, 0.25], [2.25, 0.25]], dtype=np.float32)

        with patch.dict(sys.modules, {"mitsuba": fake_mitsuba}):
            positions, normals = sample_points_on_terrain(
                scene,
                points_xy,
                center_xy=(1.5, 0.5),
                size_xy=(3.0, 1.0),
                height_offset=0.5,
            )

        self.assertEqual(positions.shape, (2, 3))
        self.assertEqual(normals.shape, (2, 3))
        self.assertAlmostEqual(float(positions[0, 2]), 1.5)
        self.assertAlmostEqual(float(positions[1, 2]), 3.5)


if __name__ == "__main__":
    unittest.main()
