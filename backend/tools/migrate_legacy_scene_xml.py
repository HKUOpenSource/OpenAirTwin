from __future__ import annotations

import argparse
import copy
from dataclasses import asdict, dataclass
from pathlib import Path
import sys
import xml.etree.ElementTree as ET

from backend import config
from backend.scene.tile_scene_xml import (
    COMMON_SCENE_RELATIVE_PATH,
    TILE_SCENE_RELATIVE_DIR,
    TileSceneXmlSource,
    load_legacy_scene_xml_source,
)


@dataclass(frozen=True)
class PerTileStats:
    tile_xml_count: int
    nonempty_tile_count: int
    shape_count: int


@dataclass(frozen=True)
class MigrationStats:
    legacy_tile_count: int
    legacy_shape_count: int
    existing_tile_xml_count: int
    existing_nonempty_tile_count: int
    existing_shape_count: int
    written_tile_count: int
    written_shape_count: int
    skipped_existing_tile_count: int
    common_xml: str
    tile_xml_dir: str


class PerTileSceneExists(RuntimeError):
    def __init__(self, stats: MigrationStats) -> None:
        super().__init__(
            "Per-tile scene XML already exists; rerun with --merge-missing-tiles "
            "to import only missing legacy tiles."
        )
        self.stats = stats


def migrate_legacy_scene_xml(
    scene_root: Path,
    source_xml: Path,
    *,
    merge_missing_tiles: bool = False,
) -> MigrationStats:
    scene_root = Path(scene_root).resolve()
    source_xml = Path(source_xml).resolve()
    legacy_source = load_legacy_scene_xml_source(scene_root, source_xml)
    existing_stats = collect_per_tile_stats(scene_root)
    common_xml = scene_root / COMMON_SCENE_RELATIVE_PATH
    tile_xml_dir = scene_root / TILE_SCENE_RELATIVE_DIR

    stats = MigrationStats(
        legacy_tile_count=len(legacy_source.shape_by_tile),
        legacy_shape_count=sum(len(shapes) for shapes in legacy_source.shape_by_tile.values()),
        existing_tile_xml_count=existing_stats.tile_xml_count,
        existing_nonempty_tile_count=existing_stats.nonempty_tile_count,
        existing_shape_count=existing_stats.shape_count,
        written_tile_count=0,
        written_shape_count=0,
        skipped_existing_tile_count=0,
        common_xml=str(common_xml),
        tile_xml_dir=str(tile_xml_dir),
    )

    if existing_stats.tile_xml_count > 0 and not merge_missing_tiles:
        raise PerTileSceneExists(stats)

    common_xml.parent.mkdir(parents=True, exist_ok=True)
    tile_xml_dir.mkdir(parents=True, exist_ok=True)
    if existing_stats.tile_xml_count == 0 or not common_xml.exists():
        _write_common_xml(legacy_source, common_xml)

    written_tile_count = 0
    written_shape_count = 0
    skipped_existing_tile_count = 0
    for tile_id, shapes in sorted(legacy_source.shape_by_tile.items()):
        tile_xml_path = tile_xml_dir / f"{tile_id}.xml"
        if tile_xml_path.exists():
            skipped_existing_tile_count += 1
            continue
        _write_tile_xml(legacy_source, tile_xml_path, shapes)
        written_tile_count += 1
        written_shape_count += len(shapes)

    return MigrationStats(
        legacy_tile_count=stats.legacy_tile_count,
        legacy_shape_count=stats.legacy_shape_count,
        existing_tile_xml_count=stats.existing_tile_xml_count,
        existing_nonempty_tile_count=stats.existing_nonempty_tile_count,
        existing_shape_count=stats.existing_shape_count,
        written_tile_count=written_tile_count,
        written_shape_count=written_shape_count,
        skipped_existing_tile_count=skipped_existing_tile_count,
        common_xml=stats.common_xml,
        tile_xml_dir=stats.tile_xml_dir,
    )


def collect_per_tile_stats(scene_root: Path) -> PerTileStats:
    tile_xml_dir = Path(scene_root).resolve() / TILE_SCENE_RELATIVE_DIR
    tile_xml_paths = sorted(tile_xml_dir.glob("*.xml")) if tile_xml_dir.is_dir() else []
    shape_count = 0
    nonempty_tile_count = 0
    for tile_xml_path in tile_xml_paths:
        shapes = ET.parse(tile_xml_path).getroot().findall("shape")
        shape_count += len(shapes)
        if shapes:
            nonempty_tile_count += 1
    return PerTileStats(
        tile_xml_count=len(tile_xml_paths),
        nonempty_tile_count=nonempty_tile_count,
        shape_count=shape_count,
    )


def _write_common_xml(source: TileSceneXmlSource, path: Path) -> None:
    root = ET.Element(source.scene_tag, dict(source.scene_attrib))
    for child in source.common_children:
        root.append(copy.deepcopy(child))
    _write_xml(ET.ElementTree(root), path)


def _write_tile_xml(source: TileSceneXmlSource, path: Path, shapes: list[ET.Element]) -> None:
    root = ET.Element(source.scene_tag, dict(source.scene_attrib))
    for shape in shapes:
        root.append(copy.deepcopy(shape))
    _write_xml(ET.ElementTree(root), path)


def _write_xml(tree: ET.ElementTree, path: Path) -> None:
    ET.indent(tree, space="  ")
    temp_path = path.with_suffix(f"{path.suffix}.tmp")
    tree.write(temp_path, encoding="utf-8", xml_declaration=True)
    temp_path.replace(path)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Safely migrate a legacy full scene XML into per-tile XML files.")
    parser.add_argument("--scene-root", type=Path, default=config.SCENE_ROOT)
    parser.add_argument("--source-xml", type=Path, default=config.SCENE_XML)
    parser.add_argument(
        "--merge-missing-tiles",
        action="store_true",
        help="Only write legacy tiles that do not already have a per-tile XML file.",
    )
    return parser.parse_args()


def print_stats(stats: MigrationStats) -> None:
    for key, value in asdict(stats).items():
        print(f"{key}={value}")


def main() -> None:
    args = parse_args()
    try:
        stats = migrate_legacy_scene_xml(
            args.scene_root,
            args.source_xml,
            merge_missing_tiles=args.merge_missing_tiles,
        )
    except PerTileSceneExists as exc:
        print(str(exc), file=sys.stderr)
        print_stats(exc.stats)
        raise SystemExit(2) from exc
    print_stats(stats)


if __name__ == "__main__":
    main()
