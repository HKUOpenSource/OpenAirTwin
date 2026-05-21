from __future__ import annotations

from collections import Counter, defaultdict
from dataclasses import dataclass
from pathlib import Path, PurePosixPath

from backend.scene.tile_bundles import TileBundleRecord, build_tile_bundle_records
from backend.scene.tile_scene_xml import load_tile_scene_xml_source, resolve_scene_filename


@dataclass(frozen=True)
class MeshRecord:
    mesh_id: str
    shape_id: str
    relative_path: str
    tile: str
    category: str
    bsdf_id: str

    def to_api_dict(self) -> dict:
        return {
            "mesh_id": self.mesh_id,
            "shape_id": self.shape_id,
            "path": self.relative_path,
            "tile": self.tile,
            "category": self.category,
            "bsdf_id": self.bsdf_id,
        }


@dataclass(frozen=True)
class SceneManifest:
    scene_id: str
    meshes: list[MeshRecord]
    bundles: list[TileBundleRecord]
    tiles: dict[str, dict[str, int]]
    bsdfs: dict[str, int]
    integrity: dict[str, object]

    @property
    def mesh_lookup(self) -> dict[str, MeshRecord]:
        return {mesh.mesh_id: mesh for mesh in self.meshes}

    @property
    def bundle_lookup(self) -> dict[str, TileBundleRecord]:
        return {bundle.bundle_id: bundle for bundle in self.bundles}

    def to_api_dict(self) -> dict:
        bundle_counts = Counter(bundle.tile for bundle in self.bundles)
        return {
            "scene_id": self.scene_id,
            "mesh_count": len(self.meshes),
            "bundle_count": len(self.bundles),
            "tiles": [
                {
                    "id": tile_id,
                    "mesh_count": sum(categories.values()),
                    "bundle_count": bundle_counts[tile_id],
                    "categories": categories,
                }
                for tile_id, categories in sorted(self.tiles.items())
            ],
            "bsdfs": self.bsdfs,
            "integrity": self.integrity,
            "bundles": [bundle.to_api_dict() for bundle in self.bundles],
            "meshes": [mesh.to_api_dict() for mesh in self.meshes],
        }


def load_scene_manifest(scene_root: Path) -> SceneManifest:
    scene_root = Path(scene_root).resolve()
    source = load_tile_scene_xml_source(scene_root)
    tile_counts: dict[str, Counter[str]] = defaultdict(Counter)
    bsdf_counts: Counter[str] = Counter()
    meshes: list[MeshRecord] = []
    referenced_paths: set[str] = set()

    for shapes in source.shape_by_tile.values():
        for shape in shapes:
            shape_id = shape.attrib.get("id", "")
            filename_node = shape.find('string[@name="filename"]')
            bsdf_node = shape.find("ref")
            if filename_node is None or bsdf_node is None:
                continue

            filename_value = filename_node.attrib.get("value", "")
            if not filename_value:
                continue
            try:
                relative_path = resolve_scene_filename(scene_root, filename_value).relative_to(scene_root).as_posix()
            except ValueError:
                continue
            parts = PurePosixPath(relative_path).parts
            if len(parts) < 4 or parts[0] != "meshes":
                continue

            tile = parts[1]
            category = parts[2]
            bsdf_id = bsdf_node.attrib.get("id", "unknown")
            mesh_id = shape_id or PurePosixPath(relative_path).stem

            meshes.append(
                MeshRecord(
                    mesh_id=mesh_id,
                    shape_id=shape_id,
                    relative_path=relative_path,
                    tile=tile,
                    category=category,
                    bsdf_id=bsdf_id,
                )
            )
            tile_counts[tile][category] += 1
            bsdf_counts[bsdf_id] += 1
            referenced_paths.add(relative_path)

    mesh_files = {
        str(path.relative_to(scene_root)).replace("\\", "/")
        for path in (scene_root / "meshes").rglob("*.ply")
    }

    orphan_files = sorted(mesh_files - referenced_paths)
    missing_files = sorted(relative_path for relative_path in referenced_paths if relative_path not in mesh_files)

    integrity = {
        "orphan_mesh_count": len(orphan_files),
        "orphan_mesh_samples": orphan_files[:16],
        "missing_mesh_count": len(missing_files),
        "missing_mesh_samples": missing_files[:16],
    }

    bundles = build_tile_bundle_records(meshes, scene_root)

    return SceneManifest(
        scene_id="hku_main",
        meshes=meshes,
        bundles=bundles,
        tiles={tile: dict(sorted(categories.items())) for tile, categories in sorted(tile_counts.items())},
        bsdfs=dict(sorted(bsdf_counts.items())),
        integrity=integrity,
    )
