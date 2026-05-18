from __future__ import annotations

import argparse
from dataclasses import dataclass
import copy
from pathlib import Path
import xml.etree.ElementTree as ET

from backend import config
from backend.scene.tile_scene_xml import (
    COMMON_SCENE_RELATIVE_PATH,
    TILE_SCENE_RELATIVE_DIR,
    tile_id_for_mesh_path,
)


@dataclass(frozen=True)
class SplitTileSceneXmlResult:
    common_xml: Path
    tile_xml_dir: Path
    tile_count: int
    shape_count: int
    tile_shape_counts: dict[str, int]


def split_scene_xml(scene_root: Path, source_xml: Path, *, force: bool = False) -> SplitTileSceneXmlResult:
    scene_root = Path(scene_root).resolve()
    source_xml = Path(source_xml).resolve()
    source_root = ET.parse(source_xml).getroot()

    common_xml = scene_root / COMMON_SCENE_RELATIVE_PATH
    tile_xml_dir = scene_root / TILE_SCENE_RELATIVE_DIR
    tile_shapes: dict[str, list[ET.Element]] = {}

    for shape in source_root.findall("shape"):
        filename_node = shape.find('string[@name="filename"]')
        if filename_node is None:
            raise ValueError(f"Shape {shape.attrib.get('id', '<unknown>')} does not contain a filename")
        tile_id = tile_id_for_mesh_path(scene_root, filename_node.attrib.get("value", ""))
        if tile_id is None:
            raise ValueError(
                f"Shape {shape.attrib.get('id', '<unknown>')} is not under meshes/<tile>/<category>/..."
            )
        tile_shapes.setdefault(tile_id, []).append(copy.deepcopy(shape))

    if common_xml.exists() and not force:
        raise FileExistsError(f"{common_xml} already exists; pass --force to overwrite it")
    if tile_xml_dir.exists() and any(tile_xml_dir.glob("*.xml")) and not force:
        raise FileExistsError(f"{tile_xml_dir} already contains tile XML files; pass --force to overwrite them")

    common_xml.parent.mkdir(parents=True, exist_ok=True)
    tile_xml_dir.mkdir(parents=True, exist_ok=True)
    if force:
        for existing_tile_xml in tile_xml_dir.glob("*.xml"):
            existing_tile_xml.unlink()

    common_root = ET.Element(source_root.tag, dict(source_root.attrib))
    for child in list(source_root):
        if child.tag != "shape":
            common_root.append(copy.deepcopy(child))
    _write_xml(ET.ElementTree(common_root), common_xml)

    for tile_id, shapes in sorted(tile_shapes.items()):
        tile_root = ET.Element(source_root.tag, dict(source_root.attrib))
        for shape in shapes:
            tile_root.append(copy.deepcopy(shape))
        _write_xml(ET.ElementTree(tile_root), tile_xml_dir / f"{tile_id}.xml")

    return SplitTileSceneXmlResult(
        common_xml=common_xml,
        tile_xml_dir=tile_xml_dir,
        tile_count=len(tile_shapes),
        shape_count=sum(len(shapes) for shapes in tile_shapes.values()),
        tile_shape_counts={tile_id: len(shapes) for tile_id, shapes in sorted(tile_shapes.items())},
    )


def _write_xml(tree: ET.ElementTree, path: Path) -> None:
    ET.indent(tree, space="  ")
    temp_path = path.with_suffix(f"{path.suffix}.tmp")
    tree.write(temp_path, encoding="utf-8", xml_declaration=True)
    temp_path.replace(path)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Split a full HKU Sionna scene XML into per-tile XML sources.")
    parser.add_argument("--scene-root", type=Path, default=config.SCENE_ROOT)
    parser.add_argument("--source-xml", type=Path, default=config.SCENE_XML)
    parser.add_argument("--force", action="store_true", help="Overwrite existing common/tile XML files.")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    result = split_scene_xml(args.scene_root, args.source_xml, force=args.force)
    print(f"common_xml={result.common_xml}")
    print(f"tile_xml_dir={result.tile_xml_dir}")
    print(f"tile_count={result.tile_count}")
    print(f"shape_count={result.shape_count}")


if __name__ == "__main__":
    main()
