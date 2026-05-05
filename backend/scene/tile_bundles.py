from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass
import gzip
import json
import os
from pathlib import Path
import shutil
import struct
from threading import Lock

import numpy as np


TRIANGLE_FACE_DTYPE = np.dtype([("count", "u1"), ("indices", "<i4", (3,))])
VERTEX_DTYPE = np.dtype("<f4")
_BUNDLE_BUILD_LOCK = Lock()
_GLB_MAGIC = 0x46546C67
_GLB_VERSION = 2
_GLB_JSON_CHUNK = 0x4E4F534A
_GLB_BIN_CHUNK = 0x004E4942
_GL_ARRAY_BUFFER = 34962
_GL_ELEMENT_ARRAY_BUFFER = 34963
_GL_FLOAT = 5126
_GL_UNSIGNED_INT = 5125


@dataclass(frozen=True)
class TileBundleRecord:
    bundle_id: str
    relative_path: str
    tile: str
    category: str
    bsdf_id: str
    mesh_count: int
    source_relative_paths: tuple[str, ...]
    size_bytes: int | None = None
    cache_exists: bool = False
    cache_key: str | None = None
    compressed_size_bytes: int | None = None
    compressed_cache_exists: bool = False

    def to_api_dict(self) -> dict:
        return {
            "bundle_id": self.bundle_id,
            "path": self.relative_path,
            "asset_format": "glb",
            "tile": self.tile,
            "category": self.category,
            "bsdf_id": self.bsdf_id,
            "mesh_count": self.mesh_count,
            "size_bytes": self.size_bytes,
            "cache_exists": self.cache_exists,
            "cache_key": self.cache_key,
            "compressed_size_bytes": self.compressed_size_bytes,
            "compressed_cache_exists": self.compressed_cache_exists,
        }


@dataclass(frozen=True)
class TileBundleBuildResult:
    bundle: TileBundleRecord
    bundle_path: Path
    built: bool
    vertex_count: int
    face_count: int
    compressed_path: Path | None = None
    compressed: bool = False
    compressed_size_bytes: int | None = None


@dataclass(frozen=True)
class _PlyHeader:
    vertex_count: int
    face_count: int


def build_tile_bundle_records(meshes: list[object], scene_root: Path | None = None) -> list[TileBundleRecord]:
    grouped: dict[tuple[str, str, str], list[str]] = defaultdict(list)
    for mesh in meshes:
        grouped[(mesh.tile, mesh.category, mesh.bsdf_id)].append(mesh.relative_path)

    bundles: list[TileBundleRecord] = []
    for tile, category, bsdf_id in sorted(grouped):
        mesh_paths = tuple(sorted(grouped[(tile, category, bsdf_id)]))
        relative_path = f"cache/render_bundles/{tile}/{category}__{bsdf_id}.glb"
        bundle_path = None if scene_root is None else scene_root / relative_path
        cache_exists = bool(bundle_path is not None and bundle_path.exists())
        size_bytes = None
        cache_key = None
        compressed_cache_exists = False
        compressed_size_bytes = None
        if cache_exists and bundle_path is not None:
            size_bytes = bundle_path.stat().st_size
            cache_key = bundle_cache_key(bundle_path)
            compressed_path = compressed_tile_bundle_path(bundle_path)
            compressed_cache_exists = compressed_tile_bundle_is_fresh(bundle_path, compressed_path)
            compressed_size_bytes = compressed_path.stat().st_size if compressed_cache_exists else None
        bundles.append(
            TileBundleRecord(
                bundle_id=f"{tile}__{category}__{bsdf_id}",
                relative_path=relative_path,
                tile=tile,
                category=category,
                bsdf_id=bsdf_id,
                mesh_count=len(mesh_paths),
                source_relative_paths=mesh_paths,
                size_bytes=size_bytes,
                cache_exists=cache_exists,
                cache_key=cache_key,
                compressed_size_bytes=compressed_size_bytes,
                compressed_cache_exists=compressed_cache_exists,
            )
        )
    return bundles


def ensure_tile_bundle(
    scene_root: Path,
    bundle: TileBundleRecord,
    force: bool = False,
    *,
    compress: bool = True,
    compress_existing: bool = False,
) -> TileBundleBuildResult:
    bundle_path = (scene_root / bundle.relative_path).resolve()
    built = False
    compressed = False
    vertex_count = 0
    face_count = 0

    with _BUNDLE_BUILD_LOCK:
        if force or _bundle_needs_build(scene_root, bundle, bundle_path):
            vertex_count, face_count = _build_tile_bundle(scene_root, bundle, bundle_path)
            built = True
        if compress and (built or compress_existing):
            _, compressed = ensure_compressed_tile_bundle(bundle_path)

    if not built:
        header = _read_glb_geometry_counts(bundle_path)
        vertex_count = header.vertex_count
        face_count = header.face_count

    compressed_path = compressed_tile_bundle_path(bundle_path)
    compressed_exists = compressed_tile_bundle_is_fresh(bundle_path, compressed_path)
    return TileBundleBuildResult(
        bundle=bundle,
        bundle_path=bundle_path,
        built=built,
        vertex_count=vertex_count,
        face_count=face_count,
        compressed_path=compressed_path if compressed_exists else None,
        compressed=compressed,
        compressed_size_bytes=compressed_path.stat().st_size if compressed_exists else None,
    )


def build_all_tile_bundles(
    scene_root: Path,
    bundles: list[TileBundleRecord],
    *,
    tile_ids: set[str] | None = None,
    bundle_ids: set[str] | None = None,
    force: bool = False,
    compress: bool = True,
    compress_existing: bool = False,
) -> list[TileBundleBuildResult]:
    selected = [
        bundle
        for bundle in bundles
        if (tile_ids is None or bundle.tile in tile_ids) and (bundle_ids is None or bundle.bundle_id in bundle_ids)
    ]
    return [
        ensure_tile_bundle(
            scene_root,
            bundle,
            force=force,
            compress=compress,
            compress_existing=compress_existing,
        )
        for bundle in selected
    ]


def bundle_cache_key(bundle_path: Path) -> str:
    stat = bundle_path.stat()
    return f"{stat.st_mtime_ns:x}-{stat.st_size:x}"


def compressed_tile_bundle_path(bundle_path: Path) -> Path:
    return bundle_path.with_name(f"{bundle_path.name}.gz")


def compressed_tile_bundle_is_fresh(bundle_path: Path, compressed_path: Path | None = None) -> bool:
    compressed_path = compressed_path or compressed_tile_bundle_path(bundle_path)
    return (
        bundle_path.exists()
        and compressed_path.exists()
        and compressed_path.stat().st_mtime_ns >= bundle_path.stat().st_mtime_ns
    )


def ensure_compressed_tile_bundle(bundle_path: Path, *, force: bool = False) -> tuple[Path, bool]:
    if not bundle_path.exists():
        raise FileNotFoundError(f"Cannot compress missing bundle: {bundle_path}")

    compressed_path = compressed_tile_bundle_path(bundle_path)
    if not force and compressed_tile_bundle_is_fresh(bundle_path, compressed_path):
        return compressed_path, False

    compressed_path.parent.mkdir(parents=True, exist_ok=True)
    temp_path = compressed_path.with_name(f"{compressed_path.name}.tmp")
    source_stat = bundle_path.stat()
    with open(bundle_path, "rb") as source, open(temp_path, "wb") as target:
        with gzip.GzipFile(filename="", mode="wb", fileobj=target, compresslevel=1, mtime=int(source_stat.st_mtime)) as gz:
            shutil.copyfileobj(source, gz, length=1024 * 1024 * 4)

    temp_path.replace(compressed_path)
    os.utime(compressed_path, ns=(source_stat.st_mtime_ns, source_stat.st_mtime_ns))
    return compressed_path, True


def _bundle_needs_build(scene_root: Path, bundle: TileBundleRecord, bundle_path: Path) -> bool:
    if not bundle_path.exists():
        return True

    bundle_mtime = bundle_path.stat().st_mtime_ns
    for relative_path in bundle.source_relative_paths:
        source_path = (scene_root / relative_path).resolve()
        if not source_path.exists():
            raise FileNotFoundError(f"Missing source mesh for bundle {bundle.bundle_id}: {source_path}")
        if source_path.stat().st_mtime_ns > bundle_mtime:
            return True
    return False


def _build_tile_bundle(scene_root: Path, bundle: TileBundleRecord, bundle_path: Path) -> tuple[int, int]:
    mesh_paths = [(scene_root / relative_path).resolve() for relative_path in bundle.source_relative_paths]
    headers = [_read_source_ply_header(path) for path in mesh_paths]
    total_vertices = sum(header.vertex_count for header in headers)
    total_faces = sum(header.face_count for header in headers)

    vertices = np.empty((total_vertices, 3), dtype=np.float32)
    normal_accum = np.zeros((total_vertices, 3), dtype=np.float64)
    triangle_blocks: list[np.ndarray] = []

    vertex_offset = 0
    for mesh_path, header in zip(mesh_paths, headers):
        mesh_vertices, triangles = _read_source_mesh(mesh_path, header)
        next_offset = vertex_offset + header.vertex_count
        vertices[vertex_offset:next_offset] = mesh_vertices

        shifted_triangles = triangles + vertex_offset
        triangle_blocks.append(shifted_triangles)
        triangle_vertices = vertices[shifted_triangles]
        triangle_normals = np.cross(
            triangle_vertices[:, 1] - triangle_vertices[:, 0],
            triangle_vertices[:, 2] - triangle_vertices[:, 0],
        )
        np.add.at(normal_accum, shifted_triangles[:, 0], triangle_normals)
        np.add.at(normal_accum, shifted_triangles[:, 1], triangle_normals)
        np.add.at(normal_accum, shifted_triangles[:, 2], triangle_normals)

        vertex_offset = next_offset

    normal_lengths = np.linalg.norm(normal_accum, axis=1)
    valid_normals = normal_lengths > 0
    normal_accum[valid_normals] /= normal_lengths[valid_normals, None]

    merged_triangles = np.concatenate(triangle_blocks, axis=0) if triangle_blocks else np.empty((0, 3), dtype=np.uint32)
    normals = normal_accum.astype(np.float32)

    total_faces = int(merged_triangles.shape[0])

    bundle_path.parent.mkdir(parents=True, exist_ok=True)
    temp_path = bundle_path.with_suffix(".tmp")
    with open(temp_path, "wb") as handle:
        handle.write(_build_glb_blob(bundle, vertices, normals, merged_triangles))

    temp_path.replace(bundle_path)
    return total_vertices, total_faces


def _read_source_mesh(path: Path, header: _PlyHeader) -> tuple[np.ndarray, np.ndarray]:
    with open(path, "rb") as handle:
        _read_source_ply_header(handle)
        vertex_blob = handle.read(header.vertex_count * 12)
        if len(vertex_blob) != header.vertex_count * 12:
            raise ValueError(f"Incomplete vertex section in {path}")
        vertices = np.frombuffer(vertex_blob, dtype=VERTEX_DTYPE).reshape(header.vertex_count, 3).copy()
        face_blob = handle.read()

    expected_triangle_bytes = header.face_count * TRIANGLE_FACE_DTYPE.itemsize
    if len(face_blob) == expected_triangle_bytes:
        face_block = np.frombuffer(face_blob, dtype=TRIANGLE_FACE_DTYPE, count=header.face_count)
        if np.all(face_block["count"] == 3):
            return vertices, face_block["indices"].astype(np.uint32, copy=True)

    triangles: list[tuple[int, int, int]] = []
    blob = memoryview(face_blob)
    offset = 0
    for _ in range(header.face_count):
        if offset >= len(blob):
            raise ValueError(f"Incomplete face section in {path}")
        vertex_count = blob[offset]
        offset += 1
        index_bytes = vertex_count * 4
        face = np.frombuffer(blob[offset:offset + index_bytes], dtype="<i4", count=vertex_count).copy()
        triangles.extend(_triangulate_face(face.astype(np.uint32, copy=False)))
        offset += index_bytes

    if offset != len(blob):
        raise ValueError(f"Unexpected trailing face data in {path}")

    if not triangles:
        return vertices, np.empty((0, 3), dtype=np.uint32)

    return vertices, np.asarray(triangles, dtype=np.uint32)


def _read_source_ply_header(path_or_handle: Path | object) -> _PlyHeader:
    return _read_ply_header(
        path_or_handle,
        expected_vertex_layouts={
            ("property float x", "property float y", "property float z"),
        },
    )


def _read_ply_header(
    path_or_handle: Path | object,
    *,
    expected_vertex_layouts: set[tuple[str, ...]],
) -> _PlyHeader:
    close_after = False
    if isinstance(path_or_handle, Path):
        handle = open(path_or_handle, "rb")
        close_after = True
    else:
        handle = path_or_handle

    try:
        vertex_count = None
        face_count = None
        current_element = None
        vertex_properties: list[str] = []
        face_properties: list[str] = []

        while True:
            raw_line = handle.readline()
            if not raw_line:
                raise ValueError("Unexpected EOF while reading PLY header")
            line = raw_line.decode("ascii").strip()
            if line == "end_header":
                break
            if line == "ply" or line.startswith("comment "):
                continue
            if line != "format binary_little_endian 1.0" and line.startswith("format "):
                raise ValueError(f"Unsupported PLY format: {line}")
            if line.startswith("element "):
                _, element_name, element_count = line.split()
                current_element = element_name
                if element_name == "vertex":
                    vertex_count = int(element_count)
                elif element_name == "face":
                    face_count = int(element_count)
                continue
            if line.startswith("property "):
                if current_element == "vertex":
                    vertex_properties.append(line)
                elif current_element == "face":
                    face_properties.append(line)

        if vertex_count is None or face_count is None:
            raise ValueError("PLY header missing vertex or face counts")

        if tuple(vertex_properties) not in expected_vertex_layouts:
            raise ValueError(f"Unsupported vertex layout: {vertex_properties}")
        if tuple(face_properties) != ("property list uchar int vertex_indices",):
            raise ValueError(f"Unsupported face layout: {face_properties}")

        return _PlyHeader(vertex_count=vertex_count, face_count=face_count)
    finally:
        if close_after:
            handle.close()


def _triangulate_face(indices: np.ndarray) -> list[tuple[int, int, int]]:
    if len(indices) < 3:
        return []
    if len(indices) == 3:
        return [(int(indices[0]), int(indices[1]), int(indices[2]))]

    anchor = int(indices[0])
    return [
        (anchor, int(indices[offset]), int(indices[offset + 1]))
        for offset in range(1, len(indices) - 1)
    ]


def _build_glb_blob(
    bundle: TileBundleRecord,
    vertices: np.ndarray,
    normals: np.ndarray,
    triangles: np.ndarray,
) -> bytes:
    position_blob = np.asarray(vertices, dtype="<f4").reshape(-1).tobytes(order="C")
    normal_blob = np.asarray(normals, dtype="<f4").reshape(-1).tobytes(order="C")
    index_blob = np.asarray(triangles, dtype="<u4").reshape(-1).tobytes(order="C")

    bin_blob = bytearray()
    position_offset = _append_aligned(bin_blob, position_blob)
    normal_offset = _append_aligned(bin_blob, normal_blob)
    index_offset = _append_aligned(bin_blob, index_blob)

    min_corner = vertices.min(axis=0).tolist() if len(vertices) else [0.0, 0.0, 0.0]
    max_corner = vertices.max(axis=0).tolist() if len(vertices) else [0.0, 0.0, 0.0]
    index_count = int(triangles.size)
    max_index = int(triangles.max()) if index_count else 0

    gltf = {
        "asset": {"version": "2.0", "generator": "HKU-RT v3.0"},
        "scene": 0,
        "scenes": [{"nodes": [0]}],
        "nodes": [{"mesh": 0, "name": bundle.bundle_id}],
        "meshes": [
            {
                "name": bundle.bundle_id,
                "primitives": [
                    {
                        "attributes": {"POSITION": 0, "NORMAL": 1},
                        "indices": 2,
                        "mode": 4,
                    }
                ],
            }
        ],
        "buffers": [{"byteLength": len(bin_blob)}],
        "bufferViews": [
            {
                "buffer": 0,
                "byteOffset": position_offset,
                "byteLength": len(position_blob),
                "target": _GL_ARRAY_BUFFER,
            },
            {
                "buffer": 0,
                "byteOffset": normal_offset,
                "byteLength": len(normal_blob),
                "target": _GL_ARRAY_BUFFER,
            },
            {
                "buffer": 0,
                "byteOffset": index_offset,
                "byteLength": len(index_blob),
                "target": _GL_ELEMENT_ARRAY_BUFFER,
            },
        ],
        "accessors": [
            {
                "bufferView": 0,
                "componentType": _GL_FLOAT,
                "count": int(len(vertices)),
                "type": "VEC3",
                "min": [float(value) for value in min_corner],
                "max": [float(value) for value in max_corner],
            },
            {
                "bufferView": 1,
                "componentType": _GL_FLOAT,
                "count": int(len(normals)),
                "type": "VEC3",
            },
            {
                "bufferView": 2,
                "componentType": _GL_UNSIGNED_INT,
                "count": index_count,
                "type": "SCALAR",
                "min": [0],
                "max": [max_index],
            },
        ],
    }

    json_blob = json.dumps(gltf, separators=(",", ":"), ensure_ascii=True).encode("utf-8")
    json_padding = (4 - (len(json_blob) % 4)) % 4
    bin_padding = (4 - (len(bin_blob) % 4)) % 4

    json_chunk = json_blob + (b" " * json_padding)
    bin_chunk = bytes(bin_blob) + (b"\x00" * bin_padding)
    total_length = 12 + 8 + len(json_chunk) + 8 + len(bin_chunk)

    return b"".join(
        [
            struct.pack("<III", _GLB_MAGIC, _GLB_VERSION, total_length),
            struct.pack("<II", len(json_chunk), _GLB_JSON_CHUNK),
            json_chunk,
            struct.pack("<II", len(bin_chunk), _GLB_BIN_CHUNK),
            bin_chunk,
        ]
    )


def _append_aligned(blob: bytearray, payload: bytes) -> int:
    offset = len(blob)
    blob.extend(payload)
    while len(blob) % 4:
        blob.append(0)
    return offset


def _read_glb_geometry_counts(path: Path) -> _PlyHeader:
    with open(path, "rb") as handle:
        header = handle.read(12)
        if len(header) != 12:
            raise ValueError(f"Invalid GLB header in {path}")
        magic, version, _ = struct.unpack("<III", header)
        if magic != _GLB_MAGIC or version != _GLB_VERSION:
            raise ValueError(f"Unsupported GLB header in {path}")

        json_length, json_type = struct.unpack("<II", handle.read(8))
        if json_type != _GLB_JSON_CHUNK:
            raise ValueError(f"Missing JSON chunk in {path}")
        json_payload = handle.read(json_length).decode("utf-8").rstrip(" \t\r\n\x00")
        document = json.loads(json_payload)

    position_accessor_index = int(document["meshes"][0]["primitives"][0]["attributes"]["POSITION"])
    index_accessor_index = int(document["meshes"][0]["primitives"][0]["indices"])
    accessors = document["accessors"]
    vertex_count = int(accessors[position_accessor_index]["count"])
    face_count = int(accessors[index_accessor_index]["count"]) // 3
    return _PlyHeader(vertex_count=vertex_count, face_count=face_count)
