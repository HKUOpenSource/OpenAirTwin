from __future__ import annotations

from dataclasses import dataclass
import json
import math
import re
import shutil
import socket
import tempfile
import time
from typing import Callable
import urllib.error
import urllib.request
import zipfile
from pathlib import Path
import xml.etree.ElementTree as ET

import numpy as np

from backend.scene.tile_scene_xml import (
    TILE_SCENE_RELATIVE_DIR,
    load_tile_scene_xml_source,
    per_tile_scene_xml_available,
)


TILE_ID_PATTERN = re.compile(r"^(\d{1,2})[-_]([A-Za-z]{2})[-_](\d{1,2})([A-Za-z])$")
STAGE_SCHEMA_VERSION = 1
ProgressCallback = Callable[[float, str], None]
CancelCheck = Callable[[], bool]
DOWNLOAD_STALL_TIMEOUT_SECONDS = 300
GLTF_TO_Z_UP = np.array(
    [
        [1.0, 0.0, 0.0, 0.0],
        [0.0, 0.0, -1.0, 0.0],
        [0.0, 1.0, 0.0, 0.0],
        [0.0, 0.0, 0.0, 1.0],
    ],
    dtype=np.float64,
)

ENTRY_MAP_MODEL = {
    "west": 800000.0,
    "north": 848000.0,
    "cols": 4,
    "sheet_w": 15000.0,
    "sheet_h": 12000.0,
}
ENTRY_MAP_QUADRANTS = {"NW", "NE", "SW", "SE"}
ENTRY_MAP_SUBTILES = {"A", "B", "C", "D"}
DEFAULT_CATEGORY_TO_MATERIAL = {
    "BUILDING": "itu_concrete",
    "GENERIC": "itu_concrete",
    "INFRASTRUCTURE": "itu_concrete",
    "INFRASTRUCTURE(TB)": "itu_concrete",
    "INFRASTRUCTURE_TB": "itu_concrete",
    "TERRAIN(TB)": "itu_medium_dry_ground",
    "TERRAIN_TB": "itu_medium_dry_ground",
    "VEGETATION(TB)": "itu_wood",
    "VEGETATION_TB": "itu_wood",
    "WATERBODY": "itu_wet_ground",
}


def _trimesh_module():
    import trimesh

    return trimesh


@dataclass(frozen=True)
class TileIds:
    internal: str
    display: str


def normalize_tile_id(tile_id: str) -> TileIds:
    match = TILE_ID_PATTERN.match(str(tile_id).strip())
    if not match:
        raise ValueError(f"Invalid 1:1000 tile sheet number: {tile_id}")
    sheet, quadrant, number, sub_tile = match.groups()
    quadrant = quadrant.upper()
    sub_tile = sub_tile.upper()
    if quadrant not in ENTRY_MAP_QUADRANTS or sub_tile not in ENTRY_MAP_SUBTILES:
        raise ValueError(f"Invalid 1:1000 tile sheet number: {tile_id}")
    sheet_num = int(sheet)
    number_num = int(number)
    if sheet_num < 1 or sheet_num > 19 or number_num < 1 or number_num > 25:
        raise ValueError(f"Invalid 1:1000 tile sheet number: {tile_id}")
    return TileIds(
        internal=f"{sheet_num}_{quadrant}_{number_num}{sub_tile}",
        display=f"{sheet_num}-{quadrant}-{number_num}{sub_tile}",
    )


def build_download_url(tile_id: str, *, base_url: str, file_format: str, key: str) -> str:
    ids = normalize_tile_id(tile_id)
    base = base_url.rstrip("/")
    return f"{base}/{file_format}/{ids.display}.zip?key={key}"


def _format_bytes(num_bytes: int | None) -> str:
    if not num_bytes:
        return "unknown size"
    units = ["B", "KB", "MB", "GB"]
    value = float(num_bytes)
    for unit in units:
        if value < 1024 or unit == units[-1]:
            return f"{value:.1f} {unit}"
        value /= 1024
    return f"{value:.1f} GB"


def _content_range_total(value: str | None) -> int | None:
    if not value:
        return None
    match = re.search(r"/(\d+)$", value.strip())
    return int(match.group(1)) if match else None


def _report(progress_cb: ProgressCallback | None, progress: float, message: str) -> None:
    if progress_cb:
        progress_cb(progress, message)


class TileDownloadCancelled(RuntimeError):
    pass


def _raise_if_cancelled(cancel_check: CancelCheck | None) -> None:
    if cancel_check and cancel_check():
        raise TileDownloadCancelled("Tile download cancelled")


def cleanup_tile_download_artifacts(tile_id: str, workspace_root: Path, stage_root: Path, scene_root: Path | None = None) -> None:
    ids = normalize_tile_id(tile_id)
    for path in (
        workspace_root / "downloads" / ids.internal / f"{ids.display}.zip.tmp",
        workspace_root / "downloads" / ids.internal / f"{ids.display}.zip",
    ):
        path.unlink(missing_ok=True)
    for path in (
        workspace_root / "downloads" / ids.internal,
        workspace_root / "sources" / ids.internal,
        stage_root / "tiles" / ids.internal,
    ):
        if path.exists():
            shutil.rmtree(path)
    if scene_root is not None:
        mesh_dir = scene_root / "meshes" / ids.internal
        if mesh_dir.exists():
            shutil.rmtree(mesh_dir)
        (scene_root / TILE_SCENE_RELATIVE_DIR / f"{ids.internal}.xml").unlink(missing_ok=True)


def download_tile_zip(
    tile_id: str,
    target_root: Path,
    *,
    base_url: str,
    file_format: str,
    key: str,
    progress_cb: ProgressCallback | None = None,
    cancel_check: CancelCheck | None = None,
    retries: int = 5,
    stall_timeout_seconds: int = DOWNLOAD_STALL_TIMEOUT_SECONDS,
) -> tuple[Path, str]:
    ids = normalize_tile_id(tile_id)
    target_dir = target_root / "downloads" / ids.internal
    target_dir.mkdir(parents=True, exist_ok=True)
    target_path = target_dir / f"{ids.display}.zip"
    url = build_download_url(ids.display, base_url=base_url, file_format=file_format, key=key)
    if target_path.exists() and target_path.stat().st_size > 0:
        _report(progress_cb, 0.55, f"Using cached GLTF archive ({_format_bytes(target_path.stat().st_size)})")
        return target_path, url

    temp_path = target_path.with_suffix(".zip.tmp")
    last_error: Exception | None = None

    for attempt in range(retries + 1):
        _raise_if_cancelled(cancel_check)
        existing_size = temp_path.stat().st_size if temp_path.exists() else 0
        headers = {"User-Agent": "HKU-RT/3.0"}
        if existing_size > 0:
            headers["Range"] = f"bytes={existing_size}-"
        request = urllib.request.Request(url, headers=headers)

        try:
            with urllib.request.urlopen(request, timeout=stall_timeout_seconds) as response:
                status_code = getattr(response, "status", response.getcode())
                if existing_size > 0 and status_code != 206:
                    existing_size = 0
                    temp_path.unlink(missing_ok=True)

                content_length = response.headers.get("Content-Length")
                total_size = _content_range_total(response.headers.get("Content-Range"))
                if total_size is None and content_length:
                    total_size = int(content_length) + existing_size

                downloaded = existing_size
                if total_size and downloaded >= total_size and temp_path.exists():
                    temp_path.replace(target_path)
                    _report(progress_cb, 0.55, f"Downloaded GLTF archive ({_format_bytes(total_size)})")
                    return target_path, url

                mode = "ab" if existing_size > 0 and status_code == 206 else "wb"
                last_report = 0.0
                with open(temp_path, mode) as handle:
                    while True:
                        _raise_if_cancelled(cancel_check)
                        chunk = response.read(1024 * 1024)
                        if not chunk:
                            break
                        handle.write(chunk)
                        downloaded += len(chunk)
                        now = time.monotonic()
                        if now - last_report >= 0.5:
                            last_report = now
                            if total_size:
                                fraction = min(downloaded / total_size, 1.0)
                                progress = 0.05 + 0.50 * fraction
                                message = f"Downloading GLTF archive: {_format_bytes(downloaded)} / {_format_bytes(total_size)}"
                            else:
                                progress = 0.08
                                message = f"Downloading GLTF archive: {_format_bytes(downloaded)}"
                            _report(progress_cb, progress, message)

                if total_size and downloaded < total_size:
                    raise OSError(f"Incomplete download: got {downloaded} of {total_size} bytes")

                temp_path.replace(target_path)
                _report(progress_cb, 0.55, f"Downloaded GLTF archive ({_format_bytes(downloaded)})")
                return target_path, url
        except TileDownloadCancelled:
            temp_path.unlink(missing_ok=True)
            raise
        except (TimeoutError, socket.timeout, urllib.error.URLError, OSError) as exc:
            last_error = exc
            if attempt >= retries:
                break
            pause = min(2 ** attempt, 10)
            _report(
                progress_cb,
                0.05,
                f"Download had no byte progress for {stall_timeout_seconds // 60} min; "
                f"retrying from {_format_bytes(existing_size)} in {pause}s",
            )
            for _ in range(pause * 10):
                _raise_if_cancelled(cancel_check)
                time.sleep(0.1)

    raise RuntimeError(f"Could not download {ids.display} after {retries + 1} attempts: {last_error}") from last_error


def extract_tile_zip(
    zip_path: Path,
    target_root: Path,
    tile_id: str,
    *,
    progress_cb: ProgressCallback | None = None,
    cancel_check: CancelCheck | None = None,
) -> Path:
    ids = normalize_tile_id(tile_id)
    extract_dir = target_root / "sources" / ids.internal
    if extract_dir.exists() and any(extract_dir.rglob("*.gltf")):
        _report(progress_cb, 0.62, "Using cached extracted GLTF assets")
        return extract_dir
    if extract_dir.exists():
        shutil.rmtree(extract_dir)
    extract_dir.mkdir(parents=True, exist_ok=True)
    _report(progress_cb, 0.56, "Extracting GLTF archive")
    with zipfile.ZipFile(zip_path) as archive:
        members = archive.infolist()
        report_every = max(1, len(members) // 20)
        for index, member in enumerate(members, start=1):
            _raise_if_cancelled(cancel_check)
            member_path = Path(member.filename)
            if member.is_dir() or member_path.is_absolute() or ".." in member_path.parts:
                continue
            archive.extract(member, extract_dir)
            if index % report_every == 0:
                _report(progress_cb, 0.56 + 0.06 * (index / len(members)), "Extracting GLTF archive")
    if not any(extract_dir.rglob("*.gltf")):
        raise FileNotFoundError(f"No .gltf assets found in {zip_path}")
    _report(progress_cb, 0.62, "Extracted GLTF assets")
    return extract_dir


def sanitize_id(text: str) -> str:
    cleaned = re.sub(r"[^0-9A-Za-z_]+", "_", text)
    cleaned = re.sub(r"_+", "_", cleaned).strip("_")
    return cleaned or "unnamed"


def iter_scene_meshes(scene: trimesh.Scene):
    trimesh = _trimesh_module()
    for node_index, node_name in enumerate(scene.graph.nodes_geometry):
        transform, geom_name = scene.graph[node_name]
        geom = scene.geometry[geom_name]
        if not isinstance(geom, trimesh.Trimesh):
            continue
        if geom.vertices.size == 0 or geom.faces.size == 0:
            continue
        mesh = geom.copy()
        mesh.apply_transform(transform)
        yield node_index, str(node_name), mesh


def to_z_up_world(mesh: trimesh.Trimesh) -> trimesh.Trimesh:
    mesh = mesh.copy()
    mesh.apply_transform(GLTF_TO_Z_UP)
    return mesh


def build_shape_id(tile: str, category: str, asset_stem: str, node_index: int, num_nodes: int) -> str:
    base = sanitize_id(f"{tile}__{category}__{asset_stem}")
    if num_nodes > 1:
        base = f"{base}__part_{node_index:03d}"
    return f"obj_{base}"


def write_stage_mesh_cache(output_path: Path, mesh_world_zup: trimesh.Trimesh) -> None:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    np.savez_compressed(
        output_path,
        vertices=np.asarray(mesh_world_zup.vertices, dtype=np.float64),
        faces=np.asarray(mesh_world_zup.faces, dtype=np.int64),
    )


def load_stage_mesh(stage_path: Path) -> trimesh.Trimesh:
    trimesh = _trimesh_module()
    with np.load(stage_path, allow_pickle=False) as payload:
        vertices = np.asarray(payload["vertices"], dtype=np.float64)
        faces = np.asarray(payload["faces"], dtype=np.int64)
    return trimesh.Trimesh(vertices=vertices, faces=faces, process=False)


def _gltf_category(path: Path, source_root: Path, ids: TileIds) -> str:
    rel_parts = path.relative_to(source_root).parts
    for index, part in enumerate(rel_parts[:-1]):
        if part.replace("_", "-").upper() == ids.display.upper() and index + 1 < len(rel_parts) - 1:
            return rel_parts[index + 1]
    if len(rel_parts) >= 2:
        return rel_parts[0]
    return path.parent.name


def stage_tile_assets(
    source_root: Path,
    stage_root: Path,
    tile_id: str,
    *,
    overwrite: bool = False,
    progress_cb: ProgressCallback | None = None,
    cancel_check: CancelCheck | None = None,
) -> Path:
    ids = normalize_tile_id(tile_id)
    tile_stage_dir = stage_root / "tiles" / ids.internal
    manifest_path = tile_stage_dir / "tile_manifest.json"
    if manifest_path.exists() and not overwrite:
        _report(progress_cb, 0.82, "Using cached staged tile meshes")
        return manifest_path
    if tile_stage_dir.exists():
        shutil.rmtree(tile_stage_dir)
    tile_stage_dir.mkdir(parents=True, exist_ok=True)

    gltf_paths = sorted(source_root.rglob("*.gltf"))
    if not gltf_paths:
        raise FileNotFoundError(f"No .gltf assets found under {source_root}")

    scene_min = np.array([np.inf, np.inf, np.inf], dtype=np.float64)
    scene_max = np.array([-np.inf, -np.inf, -np.inf], dtype=np.float64)
    objects: list[dict] = []

    for asset_index, asset_path in enumerate(gltf_paths, start=1):
        _raise_if_cancelled(cancel_check)
        _report(
            progress_cb,
            0.62 + 0.20 * ((asset_index - 1) / len(gltf_paths)),
            f"Staging GLTF mesh {asset_index} of {len(gltf_paths)}",
        )
        category = _gltf_category(asset_path, source_root, ids)
        trimesh = _trimesh_module()
        scene = trimesh.load(asset_path, force="scene", process=False)
        meshes = list(iter_scene_meshes(scene))
        num_nodes = len(meshes)
        material_id = DEFAULT_CATEGORY_TO_MATERIAL.get(category, DEFAULT_CATEGORY_TO_MATERIAL.get(sanitize_id(category), "itu_concrete"))

        for node_index, node_name, mesh_world_yup in meshes:
            _raise_if_cancelled(cancel_check)
            mesh_world_zup = to_z_up_world(mesh_world_yup)
            bbox = mesh_world_zup.bounds.astype(float)
            scene_min = np.minimum(scene_min, bbox[0])
            scene_max = np.maximum(scene_max, bbox[1])
            shape_id = build_shape_id(ids.internal, category, asset_path.stem, node_index, num_nodes)
            cache_relpath = Path("tiles") / ids.internal / ".cache" / sanitize_id(category) / f"{shape_id}.npz"
            write_stage_mesh_cache(stage_root / cache_relpath, mesh_world_zup)
            objects.append(
                {
                    "shape_id": shape_id,
                    "tile": ids.internal,
                    "tile_sheet_num": ids.display,
                    "category": category,
                    "category_path": sanitize_id(category),
                    "source_gltf": str(asset_path.relative_to(source_root)).replace("\\", "/"),
                    "source_node": node_name,
                    "node_index": int(node_index),
                    "material_id": material_id,
                    "stage_cache_relpath": str(cache_relpath).replace("\\", "/"),
                    "bbox_world_z_up": bbox.tolist(),
                }
            )

    if not objects:
        raise ValueError(f"Tile {ids.display} produced no mesh objects")

    manifest = {
        "schema_version": STAGE_SCHEMA_VERSION,
        "tile": ids.internal,
        "tile_sheet_num": ids.display,
        "source_root": str(source_root),
        "source_assets_count": len(gltf_paths),
        "staged_objects_count": len(objects),
        "world_bbox_z_up": np.array([scene_min, scene_max], dtype=np.float64).tolist(),
        "objects": objects,
    }
    manifest_path.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    _report(progress_cb, 0.82, f"Staged {len(objects)} tile mesh objects")
    return manifest_path


def _tile_bounds(tile_id: str) -> dict[str, float] | None:
    ids = normalize_tile_id(tile_id)
    sheet_text, quadrant, number_text = ids.internal.split("_")
    number = int(number_text[:-1])
    sub_tile = number_text[-1]
    sheet_index = int(sheet_text) - 1
    sheet_row = sheet_index // int(ENTRY_MAP_MODEL["cols"])
    sheet_col = sheet_index % int(ENTRY_MAP_MODEL["cols"])
    west = ENTRY_MAP_MODEL["west"] + sheet_col * ENTRY_MAP_MODEL["sheet_w"]
    east = west + ENTRY_MAP_MODEL["sheet_w"]
    north = ENTRY_MAP_MODEL["north"] - sheet_row * ENTRY_MAP_MODEL["sheet_h"]
    south = north - ENTRY_MAP_MODEL["sheet_h"]

    mid_x = (west + east) / 2
    mid_y = (south + north) / 2
    if quadrant == "NW":
        west, east, south, north = west, mid_x, mid_y, north
    elif quadrant == "NE":
        west, east, south, north = mid_x, east, mid_y, north
    elif quadrant == "SW":
        west, east, south, north = west, mid_x, south, mid_y
    else:
        west, east, south, north = mid_x, east, south, mid_y

    row = (number - 1) // 5
    col = (number - 1) % 5
    cell_w = (east - west) / 5
    cell_h = (north - south) / 5
    west = west + col * cell_w
    east = west + cell_w
    north = north - row * cell_h
    south = north - cell_h

    mid_x = (west + east) / 2
    mid_y = (south + north) / 2
    if sub_tile == "A":
        return {"west": west, "east": mid_x, "south": mid_y, "north": north}
    if sub_tile == "B":
        return {"west": mid_x, "east": east, "south": mid_y, "north": north}
    if sub_tile == "C":
        return {"west": west, "east": mid_x, "south": south, "north": mid_y}
    return {"west": mid_x, "east": east, "south": south, "north": mid_y}


def _scene_tile_ids(scene_root: Path, scene_xml: Path) -> set[str]:
    if not scene_xml.exists():
        return set()
    source = load_tile_scene_xml_source(scene_root, scene_xml)
    return set(source.shape_by_tile)


def scene_contains_tile(scene_root: Path, scene_xml: Path, tile_id: str) -> bool:
    ids = normalize_tile_id(tile_id)
    return ids.internal in _scene_tile_ids(scene_root, scene_xml)


def _origin_path(stage_root: Path) -> Path:
    return stage_root / "origin.json"


def load_or_create_scene_origin(scene_root: Path, scene_xml: Path, stage_root: Path) -> np.ndarray:
    path = _origin_path(stage_root)
    if path.exists():
        payload = json.loads(path.read_text(encoding="utf-8"))
        return np.asarray(payload["origin_world_z_up"], dtype=np.float64)

    tile_ids = sorted(_scene_tile_ids(scene_root, scene_xml))
    bounds = [_tile_bounds(tile_id) for tile_id in tile_ids]
    bounds = [item for item in bounds if item is not None]
    if not bounds:
        raise ValueError("Cannot infer current scene origin because the scene XML has no tile mesh paths")

    west = min(item["west"] for item in bounds)
    east = max(item["east"] for item in bounds)
    south = min(item["south"] for item in bounds)
    north = max(item["north"] for item in bounds)
    origin = np.array([(west + east) / 2, (south + north) / 2, 0.0], dtype=np.float64)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(
            {
                "origin_world_z_up": origin.tolist(),
                "source": "inferred from current scene tile sheet bounds",
                "scene_xml": str(scene_xml),
            },
            indent=2,
        ),
        encoding="utf-8",
    )
    return origin


def write_mesh(mesh: trimesh.Trimesh, output_path: Path) -> None:
    from trimesh.exchange import ply

    output_path.parent.mkdir(parents=True, exist_ok=True)
    payload = ply.export_ply(mesh, encoding="binary", vertex_normal=False, include_attributes=False)
    output_path.write_bytes(payload)


def make_local(mesh: trimesh.Trimesh, origin: np.ndarray) -> trimesh.Trimesh:
    mesh = mesh.copy()
    mesh.vertices = mesh.vertices - origin
    mesh.remove_unreferenced_vertices()
    return mesh


def _append_tile_shapes(scene_xml: Path, records: list[dict]) -> None:
    tree = ET.parse(scene_xml)
    root = tree.getroot()
    existing_shape_ids = {shape.attrib.get("id", "") for shape in root.findall("shape")}
    for record in records:
        shape_id = record["shape_id"]
        if shape_id in existing_shape_ids:
            continue
        shape = ET.SubElement(root, "shape", {"type": "ply", "id": shape_id})
        ET.SubElement(shape, "string", {"name": "filename", "value": record["mesh_relpath"]})
        ET.SubElement(shape, "boolean", {"name": "face_normals", "value": "true"})
        ET.SubElement(shape, "ref", {"name": "bsdf", "id": record["material_id"]})
    ET.indent(tree, space="  ")
    with tempfile.NamedTemporaryFile("wb", delete=False, dir=str(scene_xml.parent), suffix=".xml.tmp") as handle:
        temp_path = Path(handle.name)
        tree.write(handle, encoding="utf-8", xml_declaration=True)
    temp_path.replace(scene_xml)


def _write_tile_scene_xml(scene_root: Path, scene_xml: Path, tile_id: str, records: list[dict]) -> Path | None:
    if not per_tile_scene_xml_available(scene_root):
        _append_tile_shapes(scene_xml, records)
        return None

    ids = normalize_tile_id(tile_id)
    source = load_tile_scene_xml_source(scene_root, scene_xml)
    root = ET.Element(source.scene_tag, dict(source.scene_attrib))
    existing_shape_ids: set[str] = set()
    tile_xml_path = scene_root / TILE_SCENE_RELATIVE_DIR / f"{ids.internal}.xml"
    if tile_xml_path.exists():
        tile_root = ET.parse(tile_xml_path).getroot()
        existing_shape_ids = {shape.attrib.get("id", "") for shape in tile_root.findall("shape")}
        for shape in tile_root.findall("shape"):
            root.append(shape)

    for record in records:
        shape_id = record["shape_id"]
        if shape_id in existing_shape_ids:
            continue
        shape = ET.SubElement(root, "shape", {"type": "ply", "id": shape_id})
        ET.SubElement(shape, "string", {"name": "filename", "value": record["mesh_relpath"]})
        ET.SubElement(shape, "boolean", {"name": "face_normals", "value": "true"})
        ET.SubElement(shape, "ref", {"name": "bsdf", "id": record["material_id"]})

    ET.indent(ET.ElementTree(root), space="  ")
    tile_xml_path.parent.mkdir(parents=True, exist_ok=True)
    temp_path = tile_xml_path.with_suffix(".xml.tmp")
    ET.ElementTree(root).write(temp_path, encoding="utf-8", xml_declaration=True)
    temp_path.replace(tile_xml_path)
    return tile_xml_path


def integrate_staged_tile(
    scene_root: Path,
    scene_xml: Path,
    stage_root: Path,
    tile_id: str,
    *,
    progress_cb: ProgressCallback | None = None,
    cancel_check: CancelCheck | None = None,
) -> dict:
    ids = normalize_tile_id(tile_id)
    if scene_contains_tile(scene_root, scene_xml, ids.internal):
        return {"status": "already_integrated", "tile": ids.internal, "tile_sheet_num": ids.display, "mesh_count": 0}

    manifest_path = stage_root / "tiles" / ids.internal / "tile_manifest.json"
    if not manifest_path.exists():
        raise FileNotFoundError(f"Tile {ids.display} has not been staged yet")
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    origin = load_or_create_scene_origin(scene_root, scene_xml, stage_root)
    records: list[dict] = []
    staged_objects = manifest["objects"]
    report_every = max(1, len(staged_objects) // 40)

    for object_index, staged_object in enumerate(staged_objects, start=1):
        _raise_if_cancelled(cancel_check)
        if object_index == 1 or object_index % report_every == 0:
            _report(
                progress_cb,
                0.84 + 0.11 * ((object_index - 1) / len(staged_objects)),
                f"Writing scene mesh {object_index} of {len(staged_objects)}",
            )
        mesh_world = load_stage_mesh(stage_root / staged_object["stage_cache_relpath"])
        mesh_local = make_local(mesh_world, origin)
        rel_mesh_path = (
            Path("meshes")
            / ids.internal
            / sanitize_id(staged_object["category"])
            / f"{staged_object['shape_id']}.ply"
        )
        write_mesh(mesh_local, scene_root / rel_mesh_path)
        records.append(
            {
                "shape_id": staged_object["shape_id"],
                "material_id": staged_object["material_id"],
                "mesh_relpath": str(rel_mesh_path).replace("\\", "/"),
            }
        )

    _raise_if_cancelled(cancel_check)
    _report(progress_cb, 0.96, "Writing tile scene XML")
    tile_xml_path = _write_tile_scene_xml(scene_root, scene_xml, ids.display, records)
    return {
        "status": "integrated",
        "tile": ids.internal,
        "tile_sheet_num": ids.display,
        "mesh_count": len(records),
        "origin_world_z_up": origin.tolist(),
        "tile_xml_path": str(tile_xml_path) if tile_xml_path else None,
    }


def download_stage_and_integrate_tile(
    tile_id: str,
    *,
    scene_root: Path,
    scene_xml: Path,
    workspace_root: Path,
    stage_root: Path,
    base_url: str,
    file_format: str,
    key: str,
    progress_cb: ProgressCallback | None = None,
    cancel_check: CancelCheck | None = None,
) -> dict:
    ids = normalize_tile_id(tile_id)
    if scene_contains_tile(scene_root, scene_xml, ids.internal):
        return {"status": "already_integrated", "tile": ids.internal, "tile_sheet_num": ids.display}
    try:
        zip_path, url = download_tile_zip(
            ids.display,
            workspace_root,
            base_url=base_url,
            file_format=file_format,
            key=key,
            progress_cb=progress_cb,
            cancel_check=cancel_check,
        )
        source_root = extract_tile_zip(zip_path, workspace_root, ids.display, progress_cb=progress_cb, cancel_check=cancel_check)
        stage_tile_assets(
            source_root,
            stage_root,
            ids.display,
            overwrite=False,
            progress_cb=progress_cb,
            cancel_check=cancel_check,
        )
        result = integrate_staged_tile(
            scene_root,
            scene_xml,
            stage_root,
            ids.display,
            progress_cb=progress_cb,
            cancel_check=cancel_check,
        )
    except TileDownloadCancelled:
        cleanup_tile_download_artifacts(ids.display, workspace_root, stage_root, scene_root)
        raise
    result["download_url"] = url
    result["zip_path"] = str(zip_path)
    return result
