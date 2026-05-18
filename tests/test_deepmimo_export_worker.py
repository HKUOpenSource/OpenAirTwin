from __future__ import annotations

from pathlib import Path
import struct
import tempfile
import unittest
import xml.etree.ElementTree as ET

from backend.rt.deepmimo_export_worker import _write_cropped_scene_xml


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


class DeepMIMOExportWorkerTests(unittest.TestCase):
    def test_cropped_scene_xml_keeps_intersecting_meshes_and_rewrites_paths(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            scene_root = Path(tmp_dir)
            inside = scene_root / "meshes/T/BUILDING/inside.ply"
            outside = scene_root / "meshes/T/BUILDING/outside.ply"
            write_ply(inside, [(0, 0, 0), (10, 10, 5)])
            write_ply(outside, [(100, 100, 0), (110, 110, 5)])
            source_xml = scene_root / "scenario_HKU.xml"
            source_xml.write_text(
                """<scene version="3.0.0">
  <bsdf type="itu-radio-material" id="itu_concrete" />
  <shape type="ply" id="inside">
    <string name="filename" value="meshes/T/BUILDING/inside.ply" />
    <boolean name="face_normals" value="true" />
    <ref name="bsdf" id="itu_concrete" />
  </shape>
  <shape type="ply" id="outside">
    <string name="filename" value="meshes/T/BUILDING/outside.ply" />
    <boolean name="face_normals" value="true" />
    <ref name="bsdf" id="itu_concrete" />
  </shape>
</scene>""",
                encoding="utf-8",
            )
            target_xml = scene_root / "job" / "cropped_scene.xml"

            stats = _write_cropped_scene_xml(scene_root, source_xml, target_xml, (-5, -5, 20, 20))

            self.assertEqual(stats["source_shape_count"], 2)
            self.assertEqual(stats["selected_shape_count"], 1)
            root = ET.parse(target_xml).getroot()
            shapes = root.findall("shape")
            self.assertEqual([shape.attrib["id"] for shape in shapes], ["inside"])
            filename = shapes[0].find('string[@name="filename"]').attrib["value"]
            self.assertEqual(filename, str(inside.resolve()))


if __name__ == "__main__":
    unittest.main()
