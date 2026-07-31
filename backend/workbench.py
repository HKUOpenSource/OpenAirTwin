from __future__ import annotations

from dataclasses import dataclass
import hashlib
import json
from pathlib import Path
import re

from backend import config


HASHED_ASSET_PATTERN = re.compile(r"(?:^|/)[^/]+-[A-Za-z0-9_-]{8,}\.[A-Za-z0-9]+$")
RELEASE_VERSION_PATTERN = re.compile(r"^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$")
GIT_COMMIT_PATTERN = re.compile(r"^[0-9a-f]{40}$")


class WorkbenchBuildError(RuntimeError):
    pass


@dataclass(frozen=True)
class WorkbenchBuild:
    root: Path
    index_path: Path
    asset_root: Path
    manifest_path: Path
    build_info_path: Path
    integrity_path: Path
    release_version: str
    git_commit: str
    build_id: str


def configured_workbench_root() -> Path:
    override = config.WORKBENCH_DIST_ROOT
    return Path(override) if override is not None else config.STATIC_ROOT / "workbench"


def _resolve_under(root: Path, relative_path: str) -> Path | None:
    root_path = root.resolve()
    candidate = (root_path / relative_path).resolve()
    try:
        candidate.relative_to(root_path)
    except ValueError:
        return None
    return candidate


def _manifest_files(entry: dict) -> list[str]:
    values: list[str] = []
    file_value = entry.get("file")
    if isinstance(file_value, str):
        values.append(file_value)
    for key in ("css", "assets"):
        collection = entry.get(key, [])
        if not isinstance(collection, list) or not all(isinstance(value, str) for value in collection):
            raise WorkbenchBuildError(f"manifest entry has invalid {key}")
        values.extend(collection)
    return values


def _load_json_object(path: Path, label: str) -> dict:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise WorkbenchBuildError(f"invalid {label}: {path}") from exc
    if not isinstance(value, dict):
        raise WorkbenchBuildError(f"{label} must be an object")
    return value


def _validate_build_info(path: Path) -> tuple[str, str, str]:
    info = _load_json_object(path, "workbench build info")
    if info.get("schemaVersion") != 1:
        raise WorkbenchBuildError("unsupported workbench build-info schema")
    release_version = info.get("releaseVersion")
    git_commit = info.get("gitCommit")
    build_id = info.get("buildId")
    if (release_version, git_commit, build_id) == ("development", "development", "development"):
        return release_version, git_commit, build_id
    if not isinstance(release_version, str) or RELEASE_VERSION_PATTERN.fullmatch(release_version) is None:
        raise WorkbenchBuildError("invalid workbench release version")
    if not isinstance(git_commit, str) or GIT_COMMIT_PATTERN.fullmatch(git_commit) is None:
        raise WorkbenchBuildError("invalid workbench Git commit")
    expected_id = f"{release_version}+{git_commit[:12]}"
    if build_id != expected_id:
        raise WorkbenchBuildError("workbench Build ID does not match release metadata")
    return release_version, git_commit, expected_id


def _sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _validate_integrity(build_root: Path, integrity_path: Path, build_id: str) -> None:
    integrity = _load_json_object(integrity_path, "workbench integrity manifest")
    if integrity.get("schemaVersion") != 1 or integrity.get("buildId") != build_id:
        raise WorkbenchBuildError("workbench integrity metadata does not match Build ID")
    entries = integrity.get("files")
    if not isinstance(entries, list):
        raise WorkbenchBuildError("workbench integrity files must be an array")
    expected: dict[str, tuple[int, str]] = {}
    for entry in entries:
        if not isinstance(entry, dict):
            raise WorkbenchBuildError("invalid workbench integrity entry")
        relative_path = entry.get("path")
        size = entry.get("bytes")
        digest = entry.get("sha256")
        if (
            not isinstance(relative_path, str)
            or relative_path in expected
            or not isinstance(size, int)
            or size < 0
            or not isinstance(digest, str)
            or re.fullmatch(r"[0-9a-f]{64}", digest) is None
        ):
            raise WorkbenchBuildError("invalid workbench integrity entry")
        expected[relative_path] = (size, digest)

    actual = {
        path.relative_to(build_root).as_posix()
        for path in build_root.rglob("*")
        if path.is_file() and path != integrity_path
    }
    if actual != set(expected):
        missing = sorted(set(expected) - actual)
        extra = sorted(actual - set(expected))
        raise WorkbenchBuildError(
            f"workbench integrity file set mismatch; missing={missing}, extra={extra}"
        )
    for relative_path, (expected_size, expected_digest) in expected.items():
        file_path = _resolve_under(build_root, relative_path)
        if file_path is None or not file_path.is_file():
            raise WorkbenchBuildError(f"workbench integrity path is unsafe: {relative_path}")
        if file_path.stat().st_size != expected_size or _sha256_file(file_path) != expected_digest:
            raise WorkbenchBuildError(f"workbench integrity mismatch: {relative_path}")


def load_workbench_build(root: Path | None = None) -> WorkbenchBuild:
    build_root = (root or configured_workbench_root()).resolve()
    index_path = build_root / "index.html"
    manifest_path = build_root / ".vite" / "manifest.json"
    build_info_path = build_root / "build-info.json"
    integrity_path = build_root / "integrity.json"
    asset_root = build_root / "assets"
    if not index_path.is_file():
        raise WorkbenchBuildError(f"missing workbench entry: {index_path}")
    if not manifest_path.is_file():
        raise WorkbenchBuildError(f"missing Vite manifest: {manifest_path}")
    if not asset_root.is_dir():
        raise WorkbenchBuildError(f"missing workbench assets: {asset_root}")
    if not build_info_path.is_file():
        raise WorkbenchBuildError(f"missing workbench build info: {build_info_path}")
    if not integrity_path.is_file():
        raise WorkbenchBuildError(f"missing workbench integrity manifest: {integrity_path}")

    release_version, git_commit, build_id = _validate_build_info(build_info_path)
    _validate_integrity(build_root, integrity_path, build_id)
    manifest = _load_json_object(manifest_path, "Vite manifest")
    app_entry = manifest.get("js/app.js")
    if not isinstance(app_entry, dict) or not (
        app_entry.get("isEntry") is True or app_entry.get("isDynamicEntry") is True
    ):
        raise WorkbenchBuildError("Vite manifest has no js/app.js entry")

    for source, raw_entry in manifest.items():
        if not isinstance(raw_entry, dict):
            raise WorkbenchBuildError(f"invalid manifest entry: {source}")
        for relative_path in _manifest_files(raw_entry):
            if not relative_path.startswith("assets/") or not HASHED_ASSET_PATTERN.search(relative_path):
                raise WorkbenchBuildError(f"manifest contains an unhashed asset: {relative_path}")
            file_path = _resolve_under(build_root, relative_path)
            if file_path is None or not file_path.is_file():
                raise WorkbenchBuildError(f"manifest asset is missing: {relative_path}")

    index_source = index_path.read_text(encoding="utf-8")
    if "/workbench/assets/" not in index_source or '<script type="importmap">' not in index_source:
        raise WorkbenchBuildError("workbench index is not a production Vite entry")
    app_file = app_entry.get("file")
    app_url = f"/workbench/{app_file}" if isinstance(app_file, str) else ""
    if not app_url or index_source.count(f'<script type="module" crossorigin src="{app_url}"></script>') != 1:
        raise WorkbenchBuildError("workbench index must load exactly one hashed app entry")
    if any(path.suffix == ".map" for path in build_root.rglob("*")):
        raise WorkbenchBuildError("production workbench contains source maps")

    return WorkbenchBuild(
        root=build_root,
        index_path=index_path,
        asset_root=asset_root,
        manifest_path=manifest_path,
        build_info_path=build_info_path,
        integrity_path=integrity_path,
        release_version=release_version,
        git_commit=git_commit,
        build_id=build_id,
    )
