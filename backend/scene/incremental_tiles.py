from __future__ import annotations

from dataclasses import dataclass
import hashlib
import json
import math
import re
import shutil
import socket
import time
from typing import Callable
import urllib.error
import urllib.request
from uuid import uuid4
import zipfile
from pathlib import Path
import xml.etree.ElementTree as ET
from defusedxml.ElementTree import parse as _safe_parse

import numpy as np

from backend.scene.tile_scene_xml import (
    COMMON_SCENE_RELATIVE_PATH,
    TILE_SCENE_RELATIVE_DIR,
    ensure_scene_layout,
    load_tile_scene_xml_source,
    resolve_scene_filename,
)


TILE_ID_PATTERN = re.compile(r"^(\d{1,2})[-_]([A-Za-z]{2})[-_](\d{1,2})([A-Za-z])$")
STAGE_SCHEMA_VERSION = 1
EXTRACT_SCHEMA_VERSION = 1
ProgressCallback = Callable[[float, str], None]
CancelCheck = Callable[[], bool]
DOWNLOAD_STALL_TIMEOUT_SECONDS = 300
GLTF_SOURCE_ASSET_SUFFIXES = {
    ".bin",
    ".basis",
    ".glb",
    ".gltf",
    ".jpeg",
    ".jpg",
    ".ktx",
    ".ktx2",
    ".png",
    ".webp",
}
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
OPEN3D_HK_CATEGORIES = (
    "BUILDING",
    "GENERIC",
    "INFRASTRUCTURE",
    "INFRASTRUCTURE(TB)",
    "TERRAIN(TB)",
    "VEGETATION(TB)",
    "WATERBODY",
)


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


def _zip_archive_is_valid(path: Path) -> bool:
    try:
        return zipfile.is_zipfile(path)
    except OSError:
        return False


def _path_fingerprint(path: Path) -> dict[str, int]:
    stat = path.stat()
    return {"mtime_ns": int(stat.st_mtime_ns), "size_bytes": int(stat.st_size)}


def _source_asset_fingerprints(source_root: Path) -> list[dict[str, object]]:
    resolved_source_root = Path(source_root).resolve()
    assets = []
    for path in sorted(resolved_source_root.rglob("*")):
        if not path.is_file() or path.suffix.lower() not in GLTF_SOURCE_ASSET_SUFFIXES:
            continue
        try:
            relative_path = path.resolve().relative_to(resolved_source_root).as_posix()
        except ValueError:
            continue
        assets.append({"path": relative_path, **_path_fingerprint(path)})
    return assets


def _extract_manifest_path(extract_dir: Path) -> Path:
    return extract_dir / ".extract_manifest.json"


def _extract_cache_is_current(zip_path: Path, extract_dir: Path, ids: TileIds) -> bool:
    manifest_path = _extract_manifest_path(extract_dir)
    try:
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return False
    return (
        manifest.get("schema_version") == EXTRACT_SCHEMA_VERSION
        and manifest.get("tile") == ids.internal
        and manifest.get("zip") == _path_fingerprint(zip_path)
        and manifest.get("assets") == _source_asset_fingerprints(extract_dir)
        and any(extract_dir.rglob("*.gltf"))
    )


def _promote_downloaded_zip(temp_path: Path, target_path: Path) -> None:
    temp_path.replace(target_path)
    if not _zip_archive_is_valid(target_path):
        target_path.unlink(missing_ok=True)
        raise zipfile.BadZipFile(f"Downloaded archive is not a valid zip file: {target_path}")


def _report(progress_cb: ProgressCallback | None, progress: float, message: str) -> None:
    if progress_cb:
        progress_cb(progress, message)


class TileDownloadCancelled(RuntimeError):
    pass


def _raise_if_cancelled(cancel_check: CancelCheck | None) -> None:
    if cancel_check and cancel_check():
        raise TileDownloadCancelled("Tile download cancelled")


def _tile_mesh_dir(scene_root: Path, tile_id: str) -> Path:
    ids = normalize_tile_id(tile_id)
    return scene_root / "meshes" / ids.internal


def _tile_xml_path(scene_root: Path, tile_id: str) -> Path:
    ids = normalize_tile_id(tile_id)
    return scene_root / TILE_SCENE_RELATIVE_DIR / f"{ids.internal}.xml"


def cleanup_tile_scene_outputs(tile_id: str, scene_root: Path) -> None:
    mesh_dir = _tile_mesh_dir(scene_root, tile_id)
    if mesh_dir.exists():
        shutil.rmtree(mesh_dir)
    _tile_xml_path(scene_root, tile_id).unlink(missing_ok=True)


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
        cleanup_tile_scene_outputs(ids.internal, scene_root)


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
        if _zip_archive_is_valid(target_path):
            _report(progress_cb, 0.55, f"Using cached GLTF archive ({_format_bytes(target_path.stat().st_size)})")
            return target_path, url
        target_path.unlink(missing_ok=True)
        _report(progress_cb, 0.05, "Cached GLTF archive is invalid; downloading it again")

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
                    _promote_downloaded_zip(temp_path, target_path)
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

                _promote_downloaded_zip(temp_path, target_path)
                _report(progress_cb, 0.55, f"Downloaded GLTF archive ({_format_bytes(downloaded)})")
                return target_path, url
        except TileDownloadCancelled:
            temp_path.unlink(missing_ok=True)
            raise
        except (TimeoutError, socket.timeout, urllib.error.URLError, OSError, zipfile.BadZipFile) as exc:
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
    if extract_dir.exists() and _extract_cache_is_current(zip_path, extract_dir, ids):
        _report(progress_cb, 0.62, "Using cached extracted GLTF assets")
        return extract_dir
    extract_dir.parent.mkdir(parents=True, exist_ok=True)
    temp_extract_dir = extract_dir.parent / f".{extract_dir.name}.{uuid4().hex}.tmp"
    if temp_extract_dir.exists():
        shutil.rmtree(temp_extract_dir)
    temp_extract_dir.mkdir(parents=True, exist_ok=False)
    _report(progress_cb, 0.56, "Extracting GLTF archive")
    try:
        with zipfile.ZipFile(zip_path) as archive:
            members = archive.infolist()
            report_every = max(1, len(members) // 20)
            for index, member in enumerate(members, start=1):
                _raise_if_cancelled(cancel_check)
                member_path = Path(member.filename)
                if member.is_dir() or member_path.is_absolute() or ".." in member_path.parts:
                    continue
                archive.extract(member, temp_extract_dir)
                if index % report_every == 0:
                    _report(progress_cb, 0.56 + 0.06 * (index / len(members)), "Extracting GLTF archive")
        if not any(temp_extract_dir.rglob("*.gltf")):
            raise FileNotFoundError(f"No .gltf assets found in {zip_path}")
        _extract_manifest_path(temp_extract_dir).write_text(
            json.dumps(
                {
                    "schema_version": EXTRACT_SCHEMA_VERSION,
                    "tile": ids.internal,
                    "zip": _path_fingerprint(zip_path),
                    "assets": _source_asset_fingerprints(temp_extract_dir),
                },
                indent=2,
            ),
            encoding="utf-8",
        )
        if extract_dir.exists():
            shutil.rmtree(extract_dir)
        temp_extract_dir.replace(extract_dir)
    except Exception:
        shutil.rmtree(temp_extract_dir, ignore_errors=True)
        raise
    _report(progress_cb, 0.62, "Extracted GLTF assets")
    return extract_dir


def sanitize_id(text: str) -> str:
    cleaned = re.sub(r"[^0-9A-Za-z_]+", "_", text)
    cleaned = re.sub(r"_+", "_", cleaned).strip("_")
    return cleaned or "unnamed"


def _category_lookup_key(text: str) -> str:
    return sanitize_id(text).upper()


OPEN3D_HK_CATEGORY_BY_KEY = {
    key: category
    for category in OPEN3D_HK_CATEGORIES
    for key in (category.upper(), _category_lookup_key(category))
}


def _canonical_open3d_category(text: str) -> str | None:
    return OPEN3D_HK_CATEGORY_BY_KEY.get(text.strip().upper()) or OPEN3D_HK_CATEGORY_BY_KEY.get(_category_lookup_key(text))


def _material_for_category(category: str) -> str:
    return DEFAULT_CATEGORY_TO_MATERIAL.get(
        category,
        DEFAULT_CATEGORY_TO_MATERIAL.get(sanitize_id(category), "itu_concrete"),
    )


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


def _asset_shape_key(asset_path: Path, source_root: Path, duplicate_stem: bool) -> str:
    if not duplicate_stem:
        return asset_path.stem
    relative_path = asset_path.relative_to(source_root).as_posix()
    digest = hashlib.sha1(relative_path.encode("utf-8")).hexdigest()[:10]
    return f"{asset_path.stem}_{digest}"


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
    for part in rel_parts[:-1]:
        category = _canonical_open3d_category(part)
        if category:
            return category
    source_root_category = _canonical_open3d_category(source_root.name)
    if source_root_category:
        return source_root_category
    for index, part in enumerate(rel_parts[:-1]):
        if part.replace("_", "-").upper() == ids.display.upper() and index + 1 < len(rel_parts) - 1:
            return rel_parts[index + 1]
    if len(rel_parts) >= 2:
        return rel_parts[0]
    return path.parent.name


def _cached_stage_manifest_is_current(manifest_path: Path, source_root: Path, stage_root: Path, ids: TileIds) -> bool:
    try:
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return False
    if manifest.get("schema_version") != STAGE_SCHEMA_VERSION or manifest.get("tile") != ids.internal:
        return False
    if manifest.get("source_assets") != _source_asset_fingerprints(source_root):
        return False

    objects = manifest.get("objects")
    if not isinstance(objects, list) or not objects:
        return False
    for staged_object in objects:
        if not isinstance(staged_object, dict):
            return False
        source_gltf = staged_object.get("source_gltf")
        if not isinstance(source_gltf, str) or not source_gltf:
            return False
        source_path = (source_root / source_gltf).resolve()
        try:
            source_path.relative_to(Path(source_root).resolve())
        except ValueError:
            return False
        if not source_path.is_file():
            return False
        if staged_object.get("source_fingerprint") != _path_fingerprint(source_path):
            return False
        try:
            expected_category = _gltf_category(source_path, source_root, ids)
        except ValueError:
            return False
        if staged_object.get("category") != expected_category:
            return False
        if staged_object.get("category_path") != sanitize_id(expected_category):
            return False
        if staged_object.get("material_id") != _material_for_category(expected_category):
            return False
        stage_cache_relpath = staged_object.get("stage_cache_relpath")
        if not isinstance(stage_cache_relpath, str) or not stage_cache_relpath:
            return False
        cache_path = (stage_root / stage_cache_relpath).resolve()
        try:
            cache_path.relative_to(stage_root.resolve())
        except ValueError:
            return False
        if not cache_path.is_file():
            return False
    return True


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
        if _cached_stage_manifest_is_current(manifest_path, source_root, stage_root, ids):
            _report(progress_cb, 0.82, "Using cached staged tile meshes")
            return manifest_path
        _report(progress_cb, 0.62, "Refreshing stale staged tile category cache")
    if tile_stage_dir.exists():
        shutil.rmtree(tile_stage_dir)
    tile_stage_dir.mkdir(parents=True, exist_ok=True)

    gltf_paths = sorted(source_root.rglob("*.gltf"))
    if not gltf_paths:
        raise FileNotFoundError(f"No .gltf assets found under {source_root}")
    source_assets = _source_asset_fingerprints(source_root)
    asset_infos = [
        (
            asset_path,
            _gltf_category(asset_path, source_root, ids),
            asset_path.relative_to(source_root).as_posix(),
        )
        for asset_path in gltf_paths
    ]
    asset_identity_counts: dict[tuple[str, str], int] = {}
    for asset_path, category, _relative_path in asset_infos:
        key = (category, asset_path.stem)
        asset_identity_counts[key] = asset_identity_counts.get(key, 0) + 1

    scene_min = np.array([np.inf, np.inf, np.inf], dtype=np.float64)
    scene_max = np.array([-np.inf, -np.inf, -np.inf], dtype=np.float64)
    objects: list[dict] = []

    for asset_index, (asset_path, category, source_gltf) in enumerate(asset_infos, start=1):
        _raise_if_cancelled(cancel_check)
        _report(
            progress_cb,
            0.62 + 0.20 * ((asset_index - 1) / len(gltf_paths)),
            f"Staging GLTF mesh {asset_index} of {len(gltf_paths)}",
        )
        trimesh = _trimesh_module()
        scene = trimesh.load(asset_path, force="scene", process=False)
        meshes = list(iter_scene_meshes(scene))
        num_nodes = len(meshes)
        material_id = _material_for_category(category)
        asset_key = _asset_shape_key(
            asset_path,
            source_root,
            asset_identity_counts[(category, asset_path.stem)] > 1,
        )

        for node_index, node_name, mesh_world_yup in meshes:
            _raise_if_cancelled(cancel_check)
            mesh_world_zup = to_z_up_world(mesh_world_yup)
            bbox = mesh_world_zup.bounds.astype(float)
            scene_min = np.minimum(scene_min, bbox[0])
            scene_max = np.maximum(scene_max, bbox[1])
            shape_id = build_shape_id(ids.internal, category, asset_key, node_index, num_nodes)
            cache_relpath = Path("tiles") / ids.internal / ".cache" / sanitize_id(category) / f"{shape_id}.npz"
            write_stage_mesh_cache(stage_root / cache_relpath, mesh_world_zup)
            objects.append(
                {
                    "shape_id": shape_id,
                    "tile": ids.internal,
                    "tile_sheet_num": ids.display,
                    "category": category,
                    "category_path": sanitize_id(category),
                    "source_gltf": source_gltf,
                    "source_fingerprint": _path_fingerprint(asset_path),
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
        "source_assets_count": len(source_assets),
        "source_assets": source_assets,
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


def _scene_tile_ids(scene_root: Path) -> set[str]:
    source = load_tile_scene_xml_source(scene_root)
    return set(source.shape_by_tile)


def _shape_mesh_exists(scene_root: Path, shape: ET.Element) -> bool:
    filename_node = shape.find('string[@name="filename"]')
    if filename_node is None:
        return False
    filename = filename_node.attrib.get("value", "")
    if not filename:
        return False
    scene_root = Path(scene_root).resolve()
    mesh_path = resolve_scene_filename(scene_root, filename)
    try:
        mesh_path.relative_to(scene_root)
    except ValueError:
        return False
    return mesh_path.is_file()


def scene_contains_tile(scene_root: Path, tile_id: str) -> bool:
    ids = normalize_tile_id(tile_id)
    source = load_tile_scene_xml_source(scene_root)
    shapes = source.shape_by_tile.get(ids.internal, [])
    return bool(shapes) and all(_shape_mesh_exists(scene_root, shape) for shape in shapes)


def _origin_path(stage_root: Path) -> Path:
    return stage_root / "origin.json"


def load_or_create_scene_origin(
    scene_root: Path,
    stage_root: Path,
    *,
    fallback_tile_id: str | None = None,
) -> np.ndarray:
    path = _origin_path(stage_root)
    if path.exists():
        try:
            payload = json.loads(path.read_text(encoding="utf-8"))
            cached_origin = np.asarray(payload.get("origin_world_z_up"), dtype=np.float64)
            if cached_origin.shape == (3,) and np.all(np.isfinite(cached_origin)):
                cached_tile_ids = payload.get("source_tile_ids")
                if not isinstance(cached_tile_ids, list) or not cached_tile_ids:
                    # Legacy origin.json (no source_tile_ids recorded).
                    return cached_origin
                current_internal: set[str] = set()
                for scene_tile_id in _scene_tile_ids(scene_root):
                    try:
                        current_internal.add(normalize_tile_id(scene_tile_id).internal)
                    except ValueError:
                        continue
                if set(cached_tile_ids).issubset(current_internal):
                    # Tiles that informed the origin are still present;
                    # newly added tiles attach without shifting the origin.
                    return cached_origin
                # Scene lost tiles the origin was derived from; recompute.
        except (OSError, TypeError, ValueError, json.JSONDecodeError):
            pass

    source_tile_ids: list[str] = []
    bounds: list[dict[str, float]] = []
    for tile_id in sorted(_scene_tile_ids(scene_root)):
        try:
            tile_bounds = _tile_bounds(tile_id)
        except ValueError:
            continue
        if tile_bounds is not None:
            bounds.append(tile_bounds)
            source_tile_ids.append(normalize_tile_id(tile_id).internal)
    if not bounds and fallback_tile_id:
        fallback_bounds = _tile_bounds(fallback_tile_id)
        if fallback_bounds is not None:
            bounds = [fallback_bounds]
            source_tile_ids = [normalize_tile_id(fallback_tile_id).internal]

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
                "scene_source": "per_tile",
                "source_tile_ids": source_tile_ids,
                "source_bounds": bounds,
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


def _build_tile_scene_xml_tree(scene_root: Path, tile_id: str, records: list[dict]) -> ET.ElementTree:
    ensure_scene_layout(scene_root)
    ids = normalize_tile_id(tile_id)
    common_root = _safe_parse(Path(scene_root) / COMMON_SCENE_RELATIVE_PATH).getroot()
    root = ET.Element(common_root.tag, dict(common_root.attrib))

    for record in records:
        shape_id = record["shape_id"]
        shape = ET.SubElement(root, "shape", {"type": "ply", "id": shape_id})
        ET.SubElement(shape, "string", {"name": "filename", "value": record["mesh_relpath"]})
        ET.SubElement(shape, "boolean", {"name": "face_normals", "value": "true"})
        ET.SubElement(shape, "ref", {"name": "bsdf", "id": record["material_id"]})

    tree = ET.ElementTree(root)
    ET.indent(tree, space="  ")
    return tree


def _write_xml_tree(tree: ET.ElementTree, output_path: Path) -> None:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    tree.write(output_path, encoding="utf-8", xml_declaration=True)


def _replace_path(source: Path, target: Path) -> None:
    target.parent.mkdir(parents=True, exist_ok=True)
    source.replace(target)


def _write_tile_scene_xml(scene_root: Path, tile_id: str, records: list[dict]) -> Path:
    ids = normalize_tile_id(tile_id)
    tile_xml_path = _tile_xml_path(scene_root, ids.internal)
    tree = _build_tile_scene_xml_tree(scene_root, ids.internal, records)
    temp_path = tile_xml_path.with_name(f"{tile_xml_path.name}.{uuid4().hex}.tmp")
    _write_xml_tree(tree, temp_path)
    _replace_path(temp_path, tile_xml_path)
    return tile_xml_path


def _tile_commit_root(scene_root: Path, tile_id: str) -> Path:
    ids = normalize_tile_id(tile_id)
    return scene_root / "cache" / "incremental_tile_commits" / ids.internal / uuid4().hex


def _cleanup_tile_commit_root(commit_root: Path) -> None:
    shutil.rmtree(commit_root, ignore_errors=True)
    for parent in (commit_root.parent, commit_root.parent.parent):
        try:
            parent.rmdir()
        except OSError:
            break


def _remove_path(path: Path) -> None:
    if path.is_dir():
        shutil.rmtree(path)
    else:
        path.unlink(missing_ok=True)


def _restore_backup_path(backup_path: Path, target_path: Path) -> None:
    if not backup_path.exists():
        return
    _remove_path(target_path)
    target_path.parent.mkdir(parents=True, exist_ok=True)
    shutil.move(str(backup_path), str(target_path))


def _commit_staged_tile_outputs(scene_root: Path, tile_id: str, commit_root: Path, staged_tile_xml_path: Path) -> Path:
    ids = normalize_tile_id(tile_id)
    staged_mesh_dir = commit_root / "meshes" / ids.internal
    final_mesh_dir = _tile_mesh_dir(scene_root, ids.internal)
    tile_xml_path = _tile_xml_path(scene_root, ids.internal)
    rollback_root = commit_root / "rollback"
    backup_mesh_dir = rollback_root / "meshes" / ids.internal
    backup_tile_xml_path = rollback_root / TILE_SCENE_RELATIVE_DIR / f"{ids.internal}.xml"
    try:
        if final_mesh_dir.exists():
            backup_mesh_dir.parent.mkdir(parents=True, exist_ok=True)
            shutil.move(str(final_mesh_dir), str(backup_mesh_dir))
        if tile_xml_path.exists():
            backup_tile_xml_path.parent.mkdir(parents=True, exist_ok=True)
            shutil.move(str(tile_xml_path), str(backup_tile_xml_path))
        if staged_mesh_dir.exists():
            final_mesh_dir.parent.mkdir(parents=True, exist_ok=True)
            shutil.move(str(staged_mesh_dir), str(final_mesh_dir))
        _replace_path(staged_tile_xml_path, tile_xml_path)
    except Exception:
        _remove_path(final_mesh_dir)
        tile_xml_path.unlink(missing_ok=True)
        _restore_backup_path(backup_mesh_dir, final_mesh_dir)
        _restore_backup_path(backup_tile_xml_path, tile_xml_path)
        raise
    return tile_xml_path


def integrate_staged_tile(
    scene_root: Path,
    stage_root: Path,
    tile_id: str,
    *,
    progress_cb: ProgressCallback | None = None,
    cancel_check: CancelCheck | None = None,
) -> dict:
    ids = normalize_tile_id(tile_id)
    if scene_contains_tile(scene_root, ids.internal):
        return {"status": "already_integrated", "tile": ids.internal, "tile_sheet_num": ids.display, "mesh_count": 0}

    commit_root = _tile_commit_root(scene_root, ids.internal)
    try:
        manifest_path = stage_root / "tiles" / ids.internal / "tile_manifest.json"
        if not manifest_path.exists():
            raise FileNotFoundError(f"Tile {ids.display} has not been staged yet")
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        origin = load_or_create_scene_origin(scene_root, stage_root, fallback_tile_id=ids.internal)
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
            write_mesh(mesh_local, commit_root / rel_mesh_path)
            records.append(
                {
                    "shape_id": staged_object["shape_id"],
                    "material_id": staged_object["material_id"],
                    "mesh_relpath": str(rel_mesh_path).replace("\\", "/"),
                }
            )

        _raise_if_cancelled(cancel_check)
        _report(progress_cb, 0.96, "Writing tile scene XML")
        staged_tile_xml_path = commit_root / TILE_SCENE_RELATIVE_DIR / f"{ids.internal}.xml"
        tree = _build_tile_scene_xml_tree(scene_root, ids.internal, records)
        _write_xml_tree(tree, staged_tile_xml_path)
        _raise_if_cancelled(cancel_check)
        _report(progress_cb, 0.98, "Committing tile scene files")
        tile_xml_path = _commit_staged_tile_outputs(scene_root, ids.internal, commit_root, staged_tile_xml_path)
        _cleanup_tile_commit_root(commit_root)
    except Exception:
        _cleanup_tile_commit_root(commit_root)
        raise
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
    workspace_root: Path,
    stage_root: Path,
    base_url: str,
    file_format: str,
    key: str,
    progress_cb: ProgressCallback | None = None,
    cancel_check: CancelCheck | None = None,
) -> dict:
    ids = normalize_tile_id(tile_id)
    if scene_contains_tile(scene_root, ids.internal):
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
            stage_root,
            ids.display,
            progress_cb=progress_cb,
            cancel_check=cancel_check,
        )
    except TileDownloadCancelled:
        cleanup_tile_download_artifacts(ids.display, workspace_root, stage_root)
        raise
    result["download_url"] = url
    result["zip_path"] = str(zip_path)
    return result
