from __future__ import annotations

from dataclasses import dataclass
import json
from pathlib import Path
import re

from backend import config


HASHED_ASSET_PATTERN = re.compile(r"(?:^|/)[^/]+-[A-Za-z0-9_-]{8,}\.[A-Za-z0-9]+$")


class WorkbenchBuildError(RuntimeError):
    pass


@dataclass(frozen=True)
class WorkbenchBuild:
    root: Path
    index_path: Path
    asset_root: Path
    manifest_path: Path


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


def load_workbench_build(root: Path | None = None) -> WorkbenchBuild:
    build_root = (root or configured_workbench_root()).resolve()
    index_path = build_root / "index.html"
    manifest_path = build_root / ".vite" / "manifest.json"
    asset_root = build_root / "assets"
    if not index_path.is_file():
        raise WorkbenchBuildError(f"missing workbench entry: {index_path}")
    if not manifest_path.is_file():
        raise WorkbenchBuildError(f"missing Vite manifest: {manifest_path}")
    if not asset_root.is_dir():
        raise WorkbenchBuildError(f"missing workbench assets: {asset_root}")

    try:
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise WorkbenchBuildError(f"invalid Vite manifest: {manifest_path}") from exc
    if not isinstance(manifest, dict):
        raise WorkbenchBuildError("Vite manifest must be an object")
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
    )
