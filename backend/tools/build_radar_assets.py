from __future__ import annotations

import argparse
from copy import deepcopy
import hashlib
import io
import json
import math
import os
from pathlib import Path
import struct
from typing import Iterable
from zipfile import ZipFile

import numpy as np
import trimesh
from trimesh.exchange.ply import export_ply


PROJECT_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_SOURCE_MANIFEST = PROJECT_ROOT / "backend" / "assets" / "radar_drones" / "source-manifest.json"
DEFAULT_OUTPUT_DIR = PROJECT_ROOT / "backend" / "static" / "assets" / "radar" / "drones"
GENERATED_MANIFEST_NAME = "manifest.json"
GLB_JSON_CHUNK = b"JSON"
GLB_MAGIC = b"glTF"
GLB_VERSION = 2


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for block in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def _require_keys(payload: dict, keys: Iterable[str], *, name: str) -> None:
    missing = sorted(set(keys) - set(payload))
    if missing:
        raise ValueError(f"{name} is missing required fields: {', '.join(missing)}")


def load_source_manifest(path: Path) -> dict:
    payload = json.loads(path.read_text(encoding="utf-8"))
    _require_keys(
        payload,
        {"schema_version", "coordinate_convention", "limits", "release_gate", "assets"},
        name="source manifest",
    )
    if payload["schema_version"] != 1:
        raise ValueError("source manifest schema_version must be 1")
    if not isinstance(payload["assets"], list) or len(payload["assets"]) != 4:
        raise ValueError("source manifest must contain exactly four assets")
    ids = [asset.get("id") for asset in payload["assets"]]
    if len(set(ids)) != len(ids) or any(not isinstance(asset_id, str) or not asset_id for asset_id in ids):
        raise ValueError("source manifest asset ids must be unique non-empty strings")
    canonical_hashes = [asset.get("source_archive_sha256") for asset in payload["assets"]]
    if len(set(canonical_hashes)) != len(canonical_hashes):
        raise ValueError("source manifest canonical archives must be unique")
    return payload


def scan_source_archives(source_dir: Path) -> dict[str, list[str]]:
    archives_by_hash: dict[str, list[str]] = {}
    for path in sorted(source_dir.glob("*.zip"), key=lambda item: item.name.casefold()):
        archives_by_hash.setdefault(sha256_file(path), []).append(path.name)
    for names in archives_by_hash.values():
        names.sort(key=str.casefold)
    return archives_by_hash


def verify_source_archives(source_dir: Path, manifest: dict) -> dict[str, list[str]]:
    archives_by_hash = scan_source_archives(source_dir)
    declared_names: set[str] = set()
    for asset in manifest["assets"]:
        canonical_name = asset["source_archive"]
        duplicate_names = list(asset["duplicate_archives"])
        declared_names.add(canonical_name)
        declared_names.update(duplicate_names)
        canonical_path = source_dir / canonical_name
        if not canonical_path.is_file():
            raise FileNotFoundError(f"Missing Radar asset archive: {canonical_path}")
        actual_hash = sha256_file(canonical_path)
        if actual_hash != asset["source_archive_sha256"]:
            raise ValueError(f"Archive hash mismatch for {canonical_name}: {actual_hash}")
        observed_names = set(archives_by_hash.get(actual_hash, []))
        expected_names = {canonical_name, *duplicate_names}
        undeclared_duplicates = sorted(observed_names - expected_names)
        if undeclared_duplicates:
            raise ValueError(
                f"Archive {canonical_name} has undeclared duplicate files: {', '.join(undeclared_duplicates)}"
            )
        for duplicate_name in duplicate_names:
            duplicate_path = source_dir / duplicate_name
            if duplicate_path.is_file() and sha256_file(duplicate_path) != actual_hash:
                raise ValueError(f"Declared duplicate archive does not match {canonical_name}: {duplicate_name}")
    return archives_by_hash


def read_source_glb(source_dir: Path, asset: dict) -> bytes:
    archive_path = source_dir / asset["source_archive"]
    with ZipFile(archive_path) as archive:
        try:
            data = archive.read(asset["source_member"])
        except KeyError:
            raise ValueError(
                f"Archive {asset['source_archive']} does not contain {asset['source_member']}"
            ) from None
    actual_hash = sha256_bytes(data)
    if actual_hash != asset["source_glb_sha256"]:
        raise ValueError(f"Source GLB hash mismatch for {asset['id']}: {actual_hash}")
    return data


def parse_glb(data: bytes) -> tuple[dict, list[tuple[bytes, bytes]]]:
    if len(data) < 20:
        raise ValueError("GLB is too short")
    magic, version, declared_length = struct.unpack_from("<4sII", data, 0)
    if magic != GLB_MAGIC or version != GLB_VERSION or declared_length != len(data):
        raise ValueError("GLB header is invalid")
    offset = 12
    chunks: list[tuple[bytes, bytes]] = []
    while offset < len(data):
        if offset + 8 > len(data):
            raise ValueError("GLB chunk header is truncated")
        chunk_length, chunk_type = struct.unpack_from("<I4s", data, offset)
        offset += 8
        chunk_end = offset + chunk_length
        if chunk_end > len(data):
            raise ValueError("GLB chunk is truncated")
        chunks.append((chunk_type, data[offset:chunk_end]))
        offset = chunk_end
    if not chunks or chunks[0][0] != GLB_JSON_CHUNK:
        raise ValueError("GLB must start with a JSON chunk")
    gltf = json.loads(chunks[0][1].rstrip(b" \t\r\n\x00").decode("utf-8"))
    return gltf, chunks[1:]


def encode_glb(gltf: dict, other_chunks: list[tuple[bytes, bytes]]) -> bytes:
    json_bytes = json.dumps(
        gltf,
        allow_nan=False,
        ensure_ascii=False,
        separators=(",", ":"),
        sort_keys=True,
    ).encode("utf-8")
    json_bytes += b" " * ((-len(json_bytes)) % 4)
    chunks = [(GLB_JSON_CHUNK, json_bytes), *other_chunks]
    total_length = 12 + sum(8 + len(chunk_data) for _chunk_type, chunk_data in chunks)
    output = bytearray(struct.pack("<4sII", GLB_MAGIC, GLB_VERSION, total_length))
    for chunk_type, chunk_data in chunks:
        if len(chunk_data) % 4:
            raise ValueError("GLB chunks must be aligned to four bytes")
        output.extend(struct.pack("<I4s", len(chunk_data), chunk_type))
        output.extend(chunk_data)
    return bytes(output)


def source_scene(source_glb: bytes) -> trimesh.Scene:
    loaded = trimesh.load(io.BytesIO(source_glb), file_type="glb", force="scene", process=False)
    if not isinstance(loaded, trimesh.Scene) or not loaded.geometry:
        raise ValueError("Source GLB does not contain a mesh scene")
    return loaded


def _axis_rotation(source_up_axis: str, source_forward_axis: str) -> np.ndarray:
    if source_up_axis != "+Y":
        raise ValueError(f"Unsupported source up axis: {source_up_axis}")
    if source_forward_axis == "-Z":
        return np.asarray(
            [
                [0.0, 0.0, -1.0],
                [-1.0, 0.0, 0.0],
                [0.0, 1.0, 0.0],
            ],
            dtype=np.float64,
        )
    if source_forward_axis == "+Z":
        return np.asarray(
            [
                [0.0, 0.0, 1.0],
                [1.0, 0.0, 0.0],
                [0.0, 1.0, 0.0],
            ],
            dtype=np.float64,
        )
    raise ValueError(f"Unsupported source forward axis: {source_forward_axis}")


def normalization_transform(scene: trimesh.Scene, asset: dict) -> np.ndarray:
    geometry = scene.to_geometry()
    if not isinstance(geometry, trimesh.Trimesh) or geometry.is_empty:
        raise ValueError(f"Source GLB for {asset['id']} has no triangle geometry")
    scale = float(asset["source_unit_scale_m"])
    if not math.isfinite(scale) or scale <= 0.0:
        raise ValueError(f"source_unit_scale_m must be positive for {asset['id']}")
    rotation = _axis_rotation(asset["source_up_axis"], asset["source_forward_axis"])
    source_center = geometry.bounds.mean(axis=0)
    transform = np.eye(4, dtype=np.float64)
    transform[:3, :3] = rotation * scale
    transform[:3, 3] = -(rotation * scale) @ source_center
    if not np.isclose(np.linalg.det(rotation), 1.0, atol=1e-12):
        raise ValueError("Normalization rotation must preserve handedness")
    return transform


def normalized_visual_glb(source_glb: bytes, transform: np.ndarray, asset_id: str) -> bytes:
    gltf, chunks = parse_glb(source_glb)
    scenes = gltf.get("scenes")
    nodes = gltf.setdefault("nodes", [])
    if not isinstance(scenes, list) or not scenes:
        raise ValueError(f"Source GLB for {asset_id} has no scene")
    scene_index = int(gltf.get("scene", 0))
    if scene_index < 0 or scene_index >= len(scenes):
        raise ValueError(f"Source GLB for {asset_id} has an invalid default scene")
    original_roots = list(scenes[scene_index].get("nodes", []))
    wrapper_index = len(nodes)
    nodes.append(
        {
            "children": original_roots,
            "matrix": transform.T.reshape(-1).tolist(),
            "name": "OpenAirTwin_Normalized_Root",
        }
    )
    scenes[scene_index]["nodes"] = [wrapper_index]
    asset_metadata = gltf.setdefault("asset", {})
    extras = asset_metadata.setdefault("extras", {})
    extras["openairtwin"] = {
        "asset_id": asset_id,
        "coordinate_convention": "metres; +X forward; +Y left; +Z up; centered AABB origin",
        "pipeline_version": 1,
    }
    return encode_glb(gltf, chunks)


def _clean_mesh(mesh: trimesh.Trimesh) -> trimesh.Trimesh:
    cleaned = trimesh.Trimesh(
        vertices=np.asarray(mesh.vertices, dtype=np.float64),
        faces=np.asarray(mesh.faces, dtype=np.int64),
        process=False,
    )
    finite_vertices = np.isfinite(cleaned.vertices).all(axis=1)
    valid_faces = finite_vertices[cleaned.faces].all(axis=1)
    cleaned.update_faces(valid_faces)
    cleaned.remove_unreferenced_vertices()
    cleaned.update_faces(cleaned.nondegenerate_faces())
    cleaned.update_faces(cleaned.unique_faces())
    cleaned.remove_unreferenced_vertices()
    return cleaned


def _repair_winding(mesh: trimesh.Trimesh) -> trimesh.Trimesh:
    """Make adjacent face winding consistent without optional NetworkX dependencies."""

    faces = np.asarray(mesh.faces, dtype=np.int64).copy()
    adjacency: list[list[tuple[int, bool]]] = [[] for _face in faces]
    first_edge: dict[tuple[int, int], tuple[int, int]] = {}
    for face_index, (a, b, c) in enumerate(faces):
        for start, end in ((a, b), (b, c), (c, a)):
            edge = (int(min(start, end)), int(max(start, end)))
            direction = 1 if start < end else -1
            previous = first_edge.get(edge)
            if previous is None:
                first_edge[edge] = (face_index, direction)
                continue
            previous_face, previous_direction = previous
            opposite_flip = previous_direction == direction
            adjacency[previous_face].append((face_index, opposite_flip))
            adjacency[face_index].append((previous_face, opposite_flip))

    parity = np.full(len(faces), -1, dtype=np.int8)
    for root in range(len(faces)):
        if parity[root] >= 0:
            continue
        parity[root] = 0
        stack = [root]
        while stack:
            face_index = stack.pop()
            for neighbour, opposite_flip in adjacency[face_index]:
                required = parity[face_index] ^ int(opposite_flip)
                if parity[neighbour] < 0:
                    parity[neighbour] = required
                    stack.append(neighbour)
    flip = np.flatnonzero(parity == 1)
    faces[flip] = faces[flip][:, [0, 2, 1]]
    repaired = trimesh.Trimesh(vertices=np.asarray(mesh.vertices), faces=faces, process=False)
    repaired.remove_unreferenced_vertices()
    _ = repaired.vertex_normals
    return repaired


def _cluster_mesh(mesh: trimesh.Trimesh, pitch: float) -> trimesh.Trimesh:
    vertices = np.asarray(mesh.vertices, dtype=np.float64)
    keys = np.floor((vertices - mesh.bounds[0]) / pitch + 0.5).astype(np.int64)
    _unique_keys, inverse = np.unique(keys, axis=0, return_inverse=True)
    counts = np.bincount(inverse)
    clustered_vertices = np.zeros((len(counts), 3), dtype=np.float64)
    np.add.at(clustered_vertices, inverse, vertices)
    clustered_vertices /= counts[:, None]
    clustered_faces = inverse[np.asarray(mesh.faces, dtype=np.int64)]
    nondegenerate = (
        (clustered_faces[:, 0] != clustered_faces[:, 1])
        & (clustered_faces[:, 1] != clustered_faces[:, 2])
        & (clustered_faces[:, 0] != clustered_faces[:, 2])
    )
    clustered_faces = clustered_faces[nondegenerate]
    if len(clustered_faces):
        _keys, first = np.unique(np.sort(clustered_faces, axis=1), axis=0, return_index=True)
        clustered_faces = clustered_faces[np.sort(first)]
    return _clean_mesh(trimesh.Trimesh(vertices=clustered_vertices, faces=clustered_faces, process=False))


def simplify_mesh(mesh: trimesh.Trimesh, target_faces: int) -> trimesh.Trimesh:
    mesh = _clean_mesh(mesh)
    if len(mesh.faces) <= target_faces:
        return _repair_winding(mesh)
    diagonal = float(np.linalg.norm(mesh.extents))
    low = diagonal * 1e-7
    high = diagonal / 20.0
    high_candidate = _cluster_mesh(mesh, high)
    while len(high_candidate.faces) > target_faces:
        high *= 2.0
        high_candidate = _cluster_mesh(mesh, high)
        if high >= diagonal:
            break
    best = high_candidate
    for _iteration in range(20):
        pitch = (low + high) / 2.0
        candidate = _cluster_mesh(mesh, pitch)
        if len(candidate.faces) > target_faces:
            low = pitch
        else:
            high = pitch
            if len(candidate.faces) > len(best.faces):
                best = candidate
    if best.is_empty:
        raise ValueError("Radar mesh simplification removed all faces")
    target_bounds = mesh.bounds
    best_bounds = best.bounds
    if np.any(best.extents <= 0.0):
        raise ValueError("Radar mesh simplification collapsed an axis")
    bounds_scale = (target_bounds[1] - target_bounds[0]) / (best_bounds[1] - best_bounds[0])
    best.vertices = (best.vertices - best_bounds.mean(axis=0)) * bounds_scale + target_bounds.mean(axis=0)
    return _repair_winding(best)


def normalized_radar_mesh(scene: trimesh.Scene, transform: np.ndarray, target_faces: int) -> trimesh.Trimesh:
    mesh = scene.to_geometry()
    if not isinstance(mesh, trimesh.Trimesh):
        raise ValueError("Source scene could not be flattened to a triangle mesh")
    mesh = mesh.copy()
    mesh.apply_transform(transform)
    return simplify_mesh(mesh, target_faces)


def mesh_metrics(mesh: trimesh.Trimesh) -> dict:
    bounds = np.asarray(mesh.bounds, dtype=np.float64)
    return {
        "vertex_count": int(len(mesh.vertices)),
        "face_count": int(len(mesh.faces)),
        "bounds_m": {
            "min": [round(float(value), 9) for value in bounds[0]],
            "max": [round(float(value), 9) for value in bounds[1]],
            "size": [round(float(value), 9) for value in bounds[1] - bounds[0]],
            "center": [round(float(value), 9) for value in bounds.mean(axis=0)],
        },
    }


def _atomic_write(path: Path, data: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(f".{path.name}.tmp")
    temporary.write_bytes(data)
    temporary.replace(path)


def build_asset(source_dir: Path, output_dir: Path, source: dict, limits: dict) -> dict:
    source_glb = read_source_glb(source_dir, source)
    scene = source_scene(source_glb)
    transform = normalization_transform(scene, source)
    visual_bytes = normalized_visual_glb(source_glb, transform, source["id"])
    visual_gltf, _visual_chunks = parse_glb(visual_bytes)
    visual_scene = source_scene(visual_bytes)
    visual_mesh = visual_scene.to_geometry()
    radar_mesh = normalized_radar_mesh(scene, transform, int(limits["radar_max_faces"]))
    radar_bytes = export_ply(
        radar_mesh,
        encoding="binary_little_endian",
        vertex_normal=True,
        include_attributes=False,
    )
    if len(visual_bytes) > int(limits["visual_max_bytes"]):
        raise ValueError(f"Visual GLB for {source['id']} exceeds visual_max_bytes")
    if len(radar_bytes) > int(limits["radar_max_bytes"]):
        raise ValueError(f"Radar PLY for {source['id']} exceeds radar_max_bytes")

    asset_dir = output_dir / source["id"]
    visual_path = asset_dir / "visual.glb"
    radar_path = asset_dir / "radar.ply"
    _atomic_write(visual_path, visual_bytes)
    _atomic_write(radar_path, radar_bytes)

    source_record = deepcopy(source)
    source_record["excluded_duplicate_archives"] = source_record.pop("duplicate_archives")
    for duplicated_field in ("id", "display_name", "default_effective_rcs_m2", "author", "license"):
        source_record.pop(duplicated_field)
    return {
        "id": source["id"],
        "display_name": source["display_name"],
        "default_effective_rcs_m2": float(source["default_effective_rcs_m2"]),
        "author": deepcopy(source["author"]),
        "license": deepcopy(source["license"]),
        "source": source_record,
        "normalization": {
            "matrix_source_to_normalized": [round(float(value), 12) for value in transform.T.reshape(-1)],
            "units": "metres",
            "up_axis": "+Z",
            "forward_axis": "+X",
            "left_axis": "+Y",
            "origin": "axis_aligned_bounding_box_center",
        },
        "visual": {
            "path": f"{source['id']}/visual.glb",
            "url": f"/assets/radar/drones/{source['id']}/visual.glb",
            "format": "glb",
            "sha256": sha256_bytes(visual_bytes),
            "size_bytes": len(visual_bytes),
            "textured": bool(visual_gltf.get("images")) and bool(visual_gltf.get("textures")),
            **mesh_metrics(visual_mesh),
        },
        "radar": {
            "path": f"{source['id']}/radar.ply",
            "url": f"/assets/radar/drones/{source['id']}/radar.ply",
            "format": "ply",
            "sha256": sha256_bytes(radar_bytes),
            "size_bytes": len(radar_bytes),
            "has_vertex_normals": True,
            **mesh_metrics(radar_mesh),
        },
    }


def build_all(source_dir: Path, source_manifest_path: Path, output_dir: Path) -> dict:
    source_manifest = load_source_manifest(source_manifest_path)
    verify_source_archives(source_dir, source_manifest)
    assets = [
        build_asset(source_dir, output_dir, asset, source_manifest["limits"])
        for asset in sorted(source_manifest["assets"], key=lambda item: item["id"])
    ]
    generated = {
        "schema_version": 1,
        "pipeline_version": 1,
        "coordinate_convention": deepcopy(source_manifest["coordinate_convention"]),
        "limits": deepcopy(source_manifest["limits"]),
        "release_gate": deepcopy(source_manifest["release_gate"]),
        "source_archive_summary": {
            "unique_archive_count": len({asset["source_archive_sha256"] for asset in source_manifest["assets"]}),
            "declared_asset_count": len(assets),
            "excluded_duplicate_count": sum(
                len(asset["source"]["excluded_duplicate_archives"]) for asset in assets
            ),
        },
        "assets": assets,
    }
    manifest_bytes = (
        json.dumps(generated, allow_nan=False, ensure_ascii=False, indent=2, sort_keys=True) + "\n"
    ).encode("utf-8")
    _atomic_write(output_dir / GENERATED_MANIFEST_NAME, manifest_bytes)
    return generated


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Build normalized visual GLB and simplified Radar PLY assets for Radar Sensing."
    )
    source_dir = os.environ.get("OAT_RADAR_ASSET_SOURCE_DIR")
    parser.add_argument(
        "--source-dir",
        type=Path,
        default=Path(source_dir) if source_dir else None,
        required=source_dir is None,
        help="Directory containing the source DJI ZIP archives.",
    )
    parser.add_argument("--source-manifest", type=Path, default=DEFAULT_SOURCE_MANIFEST)
    parser.add_argument("--output-dir", type=Path, default=DEFAULT_OUTPUT_DIR)
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    generated = build_all(
        source_dir=args.source_dir.resolve(),
        source_manifest_path=args.source_manifest.resolve(),
        output_dir=args.output_dir.resolve(),
    )
    print(
        f"Built {len(generated['assets'])} Radar drone assets in {args.output_dir.resolve()}; "
        f"release gate: {generated['release_gate']['status']}"
    )


if __name__ == "__main__":
    main()
