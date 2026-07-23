from __future__ import annotations

import hashlib
import json
import math
from pathlib import Path, PurePosixPath
from typing import Iterable

from backend import config
from backend.rt.radar_payload import RADAR_TARGET_ASSET_IDS


RADAR_ASSET_MANIFEST_VERSION = 1
RADAR_ASSET_ROOT = config.STATIC_ROOT / "assets" / "radar" / "drones"
RADAR_ASSET_MANIFEST_PATH = RADAR_ASSET_ROOT / "manifest.json"
RADAR_ASSET_RELEASE_STATUSES = frozenset({"approved", "blocked_pending_written_permission"})
RADAR_ASSET_COORDINATE_CONVENTION = {
    "units": "metres",
    "up_axis": "+Z",
    "forward_axis": "+X",
    "left_axis": "+Y",
    "handedness": "right",
    "origin": "axis_aligned_bounding_box_center",
    "rotation_order": "intrinsic XYZ radians",
}

_TOP_LEVEL_KEYS = {
    "schema_version",
    "pipeline_version",
    "coordinate_convention",
    "limits",
    "release_gate",
    "source_archive_summary",
    "assets",
}
_ASSET_KEYS = {
    "id",
    "display_name",
    "default_effective_rcs_m2",
    "author",
    "license",
    "source",
    "normalization",
    "visual",
    "radar",
}
_OUTPUT_KEYS = {
    "path",
    "url",
    "format",
    "sha256",
    "size_bytes",
    "vertex_count",
    "face_count",
    "bounds_m",
}


class RadarAssetReleaseBlocked(RuntimeError):
    pass


def _require_exact_keys(payload: dict, required: Iterable[str], *, name: str) -> None:
    required_set = set(required)
    missing = sorted(required_set - set(payload))
    unknown = sorted(set(payload) - required_set)
    if missing:
        raise ValueError(f"{name} is missing required fields: {', '.join(missing)}")
    if unknown:
        raise ValueError(f"{name} contains unsupported fields: {', '.join(unknown)}")


def _finite_number(value: object, *, name: str, minimum: float | None = None) -> float:
    if isinstance(value, bool):
        raise ValueError(f"{name} must be a finite number")
    try:
        parsed = float(value)
    except (TypeError, ValueError):
        raise ValueError(f"{name} must be a finite number") from None
    if not math.isfinite(parsed) or (minimum is not None and parsed < minimum):
        raise ValueError(f"{name} must be a finite number at least {minimum}")
    return parsed


def _positive_int(value: object, *, name: str) -> int:
    if isinstance(value, bool) or not isinstance(value, int) or value <= 0:
        raise ValueError(f"{name} must be a positive integer")
    return value


def _sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for block in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def _asset_file(root: Path, relative_path: object, *, name: str) -> Path:
    if not isinstance(relative_path, str) or not relative_path:
        raise ValueError(f"{name} must be a non-empty relative path")
    pure_path = PurePosixPath(relative_path)
    if pure_path.is_absolute() or ".." in pure_path.parts or "\\" in relative_path:
        raise ValueError(f"{name} must stay inside the Radar asset root")
    resolved_root = root.resolve()
    resolved = (resolved_root / Path(*pure_path.parts)).resolve()
    try:
        resolved.relative_to(resolved_root)
    except ValueError:
        raise ValueError(f"{name} must stay inside the Radar asset root") from None
    return resolved


def _vector3(value: object, *, name: str) -> tuple[float, float, float]:
    if not isinstance(value, list) or len(value) != 3:
        raise ValueError(f"{name} must contain three finite numbers")
    return tuple(_finite_number(item, name=f"{name}[{index}]") for index, item in enumerate(value))


def _validate_bounds(payload: object, *, name: str) -> dict:
    if not isinstance(payload, dict):
        raise ValueError(f"{name} must be an object")
    _require_exact_keys(payload, {"min", "max", "size", "center"}, name=name)
    lower = _vector3(payload["min"], name=f"{name}.min")
    upper = _vector3(payload["max"], name=f"{name}.max")
    size = _vector3(payload["size"], name=f"{name}.size")
    center = _vector3(payload["center"], name=f"{name}.center")
    for axis in range(3):
        if lower[axis] >= upper[axis]:
            raise ValueError(f"{name} must have positive extent on every axis")
        if not math.isclose(size[axis], upper[axis] - lower[axis], rel_tol=1e-7, abs_tol=1e-8):
            raise ValueError(f"{name}.size is inconsistent with min/max")
        if not math.isclose(center[axis], (upper[axis] + lower[axis]) / 2.0, abs_tol=1e-8):
            raise ValueError(f"{name}.center is inconsistent with min/max")
        if abs(center[axis]) > 1e-7:
            raise ValueError(f"{name} must be centered at the normalized origin")
    if max(size) > 1.0 or min(size) < 0.01:
        raise ValueError(f"{name} is outside the supported drone size envelope")
    return payload


def _validate_author(payload: object, *, name: str) -> None:
    if not isinstance(payload, dict):
        raise ValueError(f"{name} must be an object")
    _require_exact_keys(payload, {"name", "profile_url"}, name=name)
    if not all(isinstance(payload[key], str) and payload[key] for key in ("name", "profile_url")):
        raise ValueError(f"{name} fields must be non-empty strings")


def _validate_license(payload: object, *, name: str) -> None:
    if not isinstance(payload, dict):
        raise ValueError(f"{name} must be an object")
    required = {
        "spdx",
        "name",
        "url",
        "source_url",
        "attribution",
        "evidence",
        "redistribution_allowed",
        "derivatives_allowed",
    }
    _require_exact_keys(payload, required, name=name)
    for key in required - {"redistribution_allowed", "derivatives_allowed"}:
        if not isinstance(payload[key], str) or not payload[key]:
            raise ValueError(f"{name}.{key} must be a non-empty string")
    if payload["redistribution_allowed"] is not True or payload["derivatives_allowed"] is not True:
        raise ValueError(f"{name} must permit redistribution and derivative meshes")


def _validate_source(payload: object, *, name: str) -> None:
    if not isinstance(payload, dict):
        raise ValueError(f"{name} must be an object")
    required = {
        "source_archive",
        "source_archive_sha256",
        "excluded_duplicate_archives",
        "source_member",
        "source_glb_sha256",
        "source_unit_scale_m",
        "source_up_axis",
        "source_forward_axis",
    }
    _require_exact_keys(payload, required, name=name)
    if not isinstance(payload["excluded_duplicate_archives"], list) or any(
        not isinstance(item, str) or not item for item in payload["excluded_duplicate_archives"]
    ):
        raise ValueError(f"{name}.excluded_duplicate_archives must be a string list")
    for key in required - {"excluded_duplicate_archives", "source_unit_scale_m"}:
        if not isinstance(payload[key], str) or not payload[key]:
            raise ValueError(f"{name}.{key} must be a non-empty string")
    _finite_number(payload["source_unit_scale_m"], name=f"{name}.source_unit_scale_m", minimum=1e-12)


def _validate_normalization(payload: object, *, name: str) -> None:
    if not isinstance(payload, dict):
        raise ValueError(f"{name} must be an object")
    required = {"matrix_source_to_normalized", "units", "up_axis", "forward_axis", "left_axis", "origin"}
    _require_exact_keys(payload, required, name=name)
    matrix = payload["matrix_source_to_normalized"]
    if not isinstance(matrix, list) or len(matrix) != 16:
        raise ValueError(f"{name}.matrix_source_to_normalized must contain 16 numbers")
    for index, value in enumerate(matrix):
        _finite_number(value, name=f"{name}.matrix_source_to_normalized[{index}]")
    expected = {
        "units": "metres",
        "up_axis": "+Z",
        "forward_axis": "+X",
        "left_axis": "+Y",
        "origin": "axis_aligned_bounding_box_center",
    }
    for key, value in expected.items():
        if payload[key] != value:
            raise ValueError(f"{name}.{key} must equal {value}")


def _validate_output(
    payload: object,
    *,
    name: str,
    asset_id: str,
    kind: str,
    root: Path,
    max_bytes: int,
    max_faces: int | None,
    verify_files: bool,
) -> tuple[dict, Path]:
    if not isinstance(payload, dict):
        raise ValueError(f"{name} must be an object")
    kind_keys = {"textured"} if kind == "visual" else {"has_vertex_normals"}
    _require_exact_keys(payload, _OUTPUT_KEYS | kind_keys, name=name)
    expected_format = "glb" if kind == "visual" else "ply"
    if payload["format"] != expected_format:
        raise ValueError(f"{name}.format must be {expected_format}")
    expected_path = f"{asset_id}/{'visual.glb' if kind == 'visual' else 'radar.ply'}"
    expected_url = f"/assets/radar/drones/{expected_path}"
    if payload["path"] != expected_path or payload["url"] != expected_url:
        raise ValueError(f"{name} path and URL do not match the asset id")
    if not isinstance(payload["sha256"], str) or len(payload["sha256"]) != 64:
        raise ValueError(f"{name}.sha256 must be a SHA-256 hex digest")
    size_bytes = _positive_int(payload["size_bytes"], name=f"{name}.size_bytes")
    _positive_int(payload["vertex_count"], name=f"{name}.vertex_count")
    face_count = _positive_int(payload["face_count"], name=f"{name}.face_count")
    if size_bytes > max_bytes:
        raise ValueError(f"{name} exceeds its file size limit")
    if max_faces is not None and face_count > max_faces:
        raise ValueError(f"{name} exceeds its face count limit")
    if kind == "visual" and payload["textured"] is not True:
        raise ValueError(f"{name} must retain embedded textures")
    if kind == "radar" and payload["has_vertex_normals"] is not True:
        raise ValueError(f"{name} must include repaired vertex normals")
    _validate_bounds(payload["bounds_m"], name=f"{name}.bounds_m")
    path = _asset_file(root, payload["path"], name=f"{name}.path")
    if verify_files:
        if not path.is_file():
            raise FileNotFoundError(f"Missing Radar asset file: {path}")
        if path.stat().st_size != size_bytes:
            raise ValueError(f"{name}.size_bytes does not match the asset file")
        if _sha256_file(path) != payload["sha256"]:
            raise ValueError(f"{name}.sha256 does not match the asset file")
    return payload, path


def validate_radar_asset_manifest(payload: object, *, root: Path, verify_files: bool = True) -> dict:
    if not isinstance(payload, dict):
        raise ValueError("Radar asset manifest must be an object")
    _require_exact_keys(payload, _TOP_LEVEL_KEYS, name="Radar asset manifest")
    if payload["schema_version"] != RADAR_ASSET_MANIFEST_VERSION or payload["pipeline_version"] != 1:
        raise ValueError("Radar asset manifest and pipeline versions must be 1")
    if payload["coordinate_convention"] != RADAR_ASSET_COORDINATE_CONVENTION:
        raise ValueError("Radar asset coordinate convention does not match version one")

    limits = payload["limits"]
    if not isinstance(limits, dict):
        raise ValueError("Radar asset limits must be an object")
    limit_keys = {"visual_max_bytes", "radar_max_bytes", "radar_max_faces", "alignment_tolerance_m"}
    _require_exact_keys(limits, limit_keys, name="Radar asset limits")
    visual_max_bytes = _positive_int(limits["visual_max_bytes"], name="Radar asset limits.visual_max_bytes")
    radar_max_bytes = _positive_int(limits["radar_max_bytes"], name="Radar asset limits.radar_max_bytes")
    radar_max_faces = _positive_int(limits["radar_max_faces"], name="Radar asset limits.radar_max_faces")
    alignment_tolerance_m = _finite_number(
        limits["alignment_tolerance_m"], name="Radar asset limits.alignment_tolerance_m", minimum=0.0
    )

    release_gate = payload["release_gate"]
    if not isinstance(release_gate, dict):
        raise ValueError("Radar asset release_gate must be an object")
    _require_exact_keys(release_gate, {"status", "reason"}, name="Radar asset release_gate")
    if release_gate["status"] not in RADAR_ASSET_RELEASE_STATUSES:
        raise ValueError("Radar asset release_gate.status is unknown")
    if not isinstance(release_gate["reason"], str) or not release_gate["reason"]:
        raise ValueError("Radar asset release_gate.reason must be a non-empty string")

    summary = payload["source_archive_summary"]
    if not isinstance(summary, dict):
        raise ValueError("Radar source_archive_summary must be an object")
    _require_exact_keys(
        summary,
        {"unique_archive_count", "declared_asset_count", "excluded_duplicate_count"},
        name="Radar source_archive_summary",
    )
    if summary != {"unique_archive_count": 4, "declared_asset_count": 4, "excluded_duplicate_count": 1}:
        raise ValueError("Radar source archive summary must record four unique assets and one duplicate")

    assets = payload["assets"]
    if not isinstance(assets, list) or len(assets) != 4:
        raise ValueError("Radar asset manifest must contain exactly four assets")
    asset_ids: set[str] = set()
    for index, asset in enumerate(assets):
        name = f"Radar asset[{index}]"
        if not isinstance(asset, dict):
            raise ValueError(f"{name} must be an object")
        _require_exact_keys(asset, _ASSET_KEYS, name=name)
        asset_id = asset["id"]
        if asset_id not in RADAR_TARGET_ASSET_IDS or asset_id in asset_ids:
            raise ValueError(f"{name}.id must be one of the four unique Radar target assets")
        asset_ids.add(asset_id)
        if not isinstance(asset["display_name"], str) or not asset["display_name"]:
            raise ValueError(f"{name}.display_name must be a non-empty string")
        rcs = _finite_number(
            asset["default_effective_rcs_m2"], name=f"{name}.default_effective_rcs_m2", minimum=0.0
        )
        if not config.MIN_RADAR_RCS_M2 <= rcs <= config.MAX_RADAR_RCS_M2:
            raise ValueError(f"{name}.default_effective_rcs_m2 is outside Radar limits")
        _validate_author(asset["author"], name=f"{name}.author")
        _validate_license(asset["license"], name=f"{name}.license")
        _validate_source(asset["source"], name=f"{name}.source")
        _validate_normalization(asset["normalization"], name=f"{name}.normalization")
        visual, _visual_path = _validate_output(
            asset["visual"],
            name=f"{name}.visual",
            asset_id=asset_id,
            kind="visual",
            root=root,
            max_bytes=visual_max_bytes,
            max_faces=None,
            verify_files=verify_files,
        )
        radar, _radar_path = _validate_output(
            asset["radar"],
            name=f"{name}.radar",
            asset_id=asset_id,
            kind="radar",
            root=root,
            max_bytes=radar_max_bytes,
            max_faces=radar_max_faces,
            verify_files=verify_files,
        )
        for bound_key in ("min", "max", "size", "center"):
            for visual_value, radar_value in zip(
                visual["bounds_m"][bound_key], radar["bounds_m"][bound_key]
            ):
                if abs(float(visual_value) - float(radar_value)) > alignment_tolerance_m:
                    raise ValueError(f"{name} visual and Radar bounds are not aligned")
    if asset_ids != set(RADAR_TARGET_ASSET_IDS):
        raise ValueError("Radar asset manifest does not contain the frozen Radar target asset ids")
    return payload


def load_radar_asset_manifest(
    path: Path = RADAR_ASSET_MANIFEST_PATH,
    *,
    verify_files: bool = True,
) -> dict:
    resolved = Path(path).resolve()
    payload = json.loads(resolved.read_text(encoding="utf-8"))
    return validate_radar_asset_manifest(payload, root=resolved.parent, verify_files=verify_files)


def radar_asset_by_id(asset_id: str, manifest: dict | None = None) -> dict:
    source = manifest if manifest is not None else load_radar_asset_manifest()
    for asset in source["assets"]:
        if asset["id"] == asset_id:
            return asset
    raise KeyError(f"Unknown Radar asset id: {asset_id}")


def require_radar_asset_release_approval(manifest: dict | None = None) -> None:
    source = manifest if manifest is not None else load_radar_asset_manifest()
    release_gate = source["release_gate"]
    if release_gate["status"] != "approved":
        raise RadarAssetReleaseBlocked(release_gate["reason"])
