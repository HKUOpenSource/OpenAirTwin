from __future__ import annotations

from dataclasses import dataclass
import copy
import hashlib
from pathlib import Path, PurePosixPath
import xml.etree.ElementTree as ET
from uuid import uuid4
from defusedxml.ElementTree import parse as _safe_parse


COMMON_SCENE_RELATIVE_PATH = Path("common") / "scene_common.xml"
TILE_SCENE_RELATIVE_DIR = Path("tiles")
DEFAULT_SCENE_VERSION = "3.0.0"
DEFAULT_MATERIAL_TYPES = {
    "itu_concrete": "concrete",
    "itu_medium_dry_ground": "medium_dry_ground",
    "itu_wood": "wood",
    "itu_wet_ground": "wet_ground",
}


@dataclass(frozen=True)
class TileSceneXmlResult:
    path: Path
    tile_ids: tuple[str, ...]
    shape_count: int


@dataclass(frozen=True)
class TileSceneXmlSource:
    scene_tag: str
    scene_attrib: dict[str, str]
    common_children: list[ET.Element]
    shape_by_tile: dict[str, list[ET.Element]]
    source_mode: str

    @property
    def available_tile_ids(self) -> frozenset[str]:
        return frozenset(self.shape_by_tile)


class TileSceneXmlBuilder:
    def __init__(self, scene_root: Path, output_root: Path) -> None:
        self.scene_root = Path(scene_root).resolve()
        self.output_root = Path(output_root).resolve()
        self._source = load_tile_scene_xml_source(self.scene_root)
        self._common_children = self._source.common_children
        self._shape_by_tile = self._source.shape_by_tile
        self.source_mode = self._source.source_mode
        self.available_tile_ids = self._source.available_tile_ids

    def normalize_tile_ids(self, value: object) -> tuple[str, ...]:
        if not isinstance(value, (list, tuple, set)):
            raise ValueError("tile_ids must be a list")
        tile_ids: list[str] = []
        for item in value:
            if not isinstance(item, str):
                raise ValueError("tile_ids entries must be strings")
            tile_id = item.strip()
            if not tile_id:
                raise ValueError("tile_ids entries must not be empty")
            if tile_id not in self.available_tile_ids:
                raise ValueError(f"Unknown tile id: {tile_id}")
            if tile_id not in tile_ids:
                tile_ids.append(tile_id)
        return tuple(sorted(tile_ids))

    def shape_count_for_tiles(self, tile_ids: tuple[str, ...] | list[str]) -> int:
        return sum(len(self._shape_by_tile[tile_id]) for tile_id in tile_ids)

    def write_selection(self, tile_ids: tuple[str, ...] | list[str]) -> TileSceneXmlResult:
        normalized_tile_ids = self.normalize_tile_ids(list(tile_ids))
        if not normalized_tile_ids:
            raise ValueError("tile_ids must contain at least one tile")

        selected_shapes: list[ET.Element] = []
        for tile_id in normalized_tile_ids:
            selected_shapes.extend(copy.deepcopy(shape) for shape in self._shape_by_tile[tile_id])

        if not selected_shapes:
            raise ValueError("Selected tiles contain no Sionna RT shapes")

        root = ET.Element(self._source.scene_tag, dict(self._source.scene_attrib))
        for child in self._common_children:
            root.append(copy.deepcopy(child))
        for shape in selected_shapes:
            self._rewrite_shape_filename(shape)
            root.append(shape)

        key = hashlib.sha1(ET.tostring(root, encoding="utf-8")).hexdigest()[:16]
        output_path = self.output_root / f"selection_{key}.xml"
        output_path.parent.mkdir(parents=True, exist_ok=True)
        tree = ET.ElementTree(root)
        ET.indent(tree, space="  ")
        temp_path = output_path.with_name(f"{output_path.name}.{uuid4().hex}.tmp")
        tree.write(temp_path, encoding="utf-8", xml_declaration=True)
        temp_path.replace(output_path)

        return TileSceneXmlResult(
            path=output_path,
            tile_ids=normalized_tile_ids,
            shape_count=len(selected_shapes),
        )

    def _rewrite_shape_filename(self, shape: ET.Element) -> None:
        filename_node = shape.find('string[@name="filename"]')
        if filename_node is None:
            return
        filename = filename_node.attrib.get("value", "")
        filename_node.set("value", str(resolve_scene_filename(self.scene_root, filename)))


def ensure_scene_layout(scene_root: Path) -> None:
    resolved_scene_root = Path(scene_root).resolve()
    common_xml = resolved_scene_root / COMMON_SCENE_RELATIVE_PATH
    tile_xml_dir = resolved_scene_root / TILE_SCENE_RELATIVE_DIR

    common_xml.parent.mkdir(parents=True, exist_ok=True)
    tile_xml_dir.mkdir(parents=True, exist_ok=True)
    (resolved_scene_root / "meshes").mkdir(parents=True, exist_ok=True)
    (resolved_scene_root / "cache").mkdir(parents=True, exist_ok=True)
    if not common_xml.exists():
        _write_xml(ET.ElementTree(default_common_scene_root()), common_xml)


def default_common_scene_root() -> ET.Element:
    root = ET.Element("scene", {"version": DEFAULT_SCENE_VERSION})
    ET.SubElement(root, "integrator", {"type": "path"})
    emitter = ET.SubElement(root, "emitter", {"type": "constant"})
    ET.SubElement(emitter, "rgb", {"name": "radiance", "value": "0.7 0.7 0.7"})
    for material_id, material_type in DEFAULT_MATERIAL_TYPES.items():
        bsdf = ET.SubElement(root, "bsdf", {"type": "itu-radio-material", "id": material_id})
        ET.SubElement(bsdf, "string", {"name": "type", "value": material_type})
    return root


def load_tile_scene_xml_source(scene_root: Path) -> TileSceneXmlSource:
    resolved_scene_root = Path(scene_root).resolve()
    ensure_scene_layout(resolved_scene_root)
    common_xml = resolved_scene_root / COMMON_SCENE_RELATIVE_PATH
    tile_xml_dir = resolved_scene_root / TILE_SCENE_RELATIVE_DIR
    tile_xml_paths = sorted(tile_xml_dir.glob("*.xml")) if tile_xml_dir.is_dir() else []

    return _load_per_tile_scene_source(resolved_scene_root, common_xml, tile_xml_paths)


def per_tile_scene_xml_available(scene_root: Path) -> bool:
    resolved_scene_root = Path(scene_root).resolve()
    common_xml = resolved_scene_root / COMMON_SCENE_RELATIVE_PATH
    tile_xml_dir = resolved_scene_root / TILE_SCENE_RELATIVE_DIR
    return common_xml.exists() and tile_xml_dir.is_dir()


def scene_relative_mesh_path(scene_root: Path, filename: str) -> str:
    normalized_filename = filename.strip().replace("\\", "/")
    if not normalized_filename:
        return ""

    path = Path(normalized_filename)
    if path.is_absolute():
        try:
            return path.resolve().relative_to(Path(scene_root).resolve()).as_posix()
        except ValueError:
            return PurePosixPath(normalized_filename).as_posix()
    return PurePosixPath(normalized_filename).as_posix()


def resolve_scene_filename(scene_root: Path, filename: str) -> Path:
    normalized_filename = filename.strip().replace("\\", "/")
    path = Path(normalized_filename)
    if path.is_absolute():
        return path.resolve()
    return (Path(scene_root).resolve() / normalized_filename).resolve()


def tile_id_for_mesh_path(scene_root: Path, filename: str) -> str | None:
    try:
        relative_path = resolve_scene_filename(scene_root, filename).relative_to(Path(scene_root).resolve()).as_posix()
    except ValueError:
        return None
    parts = PurePosixPath(relative_path).parts
    if len(parts) < 4 or parts[0] != "meshes":
        return None
    return parts[1]


def _load_per_tile_scene_source(
    scene_root: Path,
    common_xml: Path,
    tile_xml_paths: list[Path],
) -> TileSceneXmlSource:
    common_root = _safe_parse(common_xml).getroot()
    common_children = [
        copy.deepcopy(child)
        for child in list(common_root)
        if child.tag != "shape"
    ]
    shape_by_tile: dict[str, list[ET.Element]] = {}

    for tile_xml_path in tile_xml_paths:
        tile_id = tile_xml_path.stem
        tile_root = _safe_parse(tile_xml_path).getroot()
        shapes: list[ET.Element] = []
        for shape in tile_root.findall("shape"):
            filename_node = shape.find('string[@name="filename"]')
            if filename_node is None:
                continue
            shape_tile_id = tile_id_for_mesh_path(scene_root, filename_node.attrib.get("value", ""))
            if shape_tile_id is None:
                raise ValueError(f"Tile XML {tile_xml_path} contains a mesh filename outside the scene mesh tree")
            if shape_tile_id != tile_id:
                raise ValueError(
                    f"Tile XML {tile_xml_path} contains shape for tile {shape_tile_id}; expected {tile_id}"
                )
            shapes.append(copy.deepcopy(shape))
        if shapes:
            shape_by_tile[tile_id] = shapes

    return TileSceneXmlSource(
        scene_tag=common_root.tag,
        scene_attrib=dict(common_root.attrib),
        common_children=common_children,
        shape_by_tile=shape_by_tile,
        source_mode="per_tile",
    )


def _write_xml(tree: ET.ElementTree, path: Path) -> None:
    ET.indent(tree, space="  ")
    temp_path = path.with_name(f"{path.name}.{uuid4().hex}.tmp")
    tree.write(temp_path, encoding="utf-8", xml_declaration=True)
    temp_path.replace(path)
