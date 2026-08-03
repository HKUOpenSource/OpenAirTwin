#!/usr/bin/env python3
"""Build a deterministic, self-contained OpenAirTwin application archive."""

from __future__ import annotations

import argparse
import gzip
import hashlib
import io
import json
from pathlib import Path
import subprocess
import sys
import tarfile
import uuid

PROJECT_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT_ROOT))

from backend.workbench import GIT_COMMIT_PATTERN, RELEASE_VERSION_PATTERN, load_workbench_build  # noqa: E402
from tools.release_dependencies import (  # noqa: E402
    BROWSER_RUNTIME_DEPENDENCIES,
    PYTHON_RUNTIME_DEPENDENCIES,
    parse_requirements,
)


REQUIRED_RELEASE_FILES = (
    "install.py",
    "requirements.txt",
    "README.md",
    "LICENSE",
    "CITATION.cff",
    "CHANGELOG.md",
    "THIRD_PARTY_NOTICES.md",
    "docs/data-licenses.md",
    "docs/release-checklist.md",
)
WORKBENCH_TARGET_ROOT = "backend/static/workbench"


class ReleaseBuildError(RuntimeError):
    pass


def run_git_bytes(arguments: list[str], repository: Path = PROJECT_ROOT) -> bytes:
    result = subprocess.run(
        ["git", *arguments],
        cwd=repository,
        check=True,
        capture_output=True,
    )
    return result.stdout


def run_git(arguments: list[str], repository: Path = PROJECT_ROOT) -> str:
    return run_git_bytes(arguments, repository).decode("utf-8").strip()


def validate_release_identity(version: str, git_commit: str, repository: Path = PROJECT_ROOT) -> int:
    if RELEASE_VERSION_PATTERN.fullmatch(version) is None or version == "development":
        raise ReleaseBuildError(f"Invalid release version: {version}")
    if GIT_COMMIT_PATTERN.fullmatch(git_commit) is None:
        raise ReleaseBuildError("Git commit must be a full lowercase 40-character SHA")
    head = run_git(["rev-parse", "HEAD"], repository)
    if head != git_commit:
        raise ReleaseBuildError(f"Requested Git commit {git_commit} does not match HEAD {head}")
    if run_git(["status", "--porcelain", "--untracked-files=no"], repository):
        raise ReleaseBuildError("Tracked files are dirty; commit or restore them before packaging")
    return int(run_git(["show", "-s", "--format=%ct", git_commit], repository))


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def add_tree(entries: dict[str, Path], source_root: Path, target_root: str, pattern: str = "*") -> None:
    for source in sorted(source_root.rglob(pattern)):
        if source.is_file() and "__pycache__" not in source.parts:
            target = f"{target_root}/{source.relative_to(source_root).as_posix()}"
            entries[target] = source


def tracked_source_entries(project_root: Path = PROJECT_ROOT) -> dict[str, Path]:
    root = project_root.resolve()
    entries: dict[str, Path] = {}
    for raw_path in run_git_bytes(["ls-files", "-z"], root).split(b"\0"):
        if not raw_path:
            continue
        try:
            relative = raw_path.decode("utf-8")
        except UnicodeDecodeError as exc:
            raise ReleaseBuildError("Tracked release paths must be UTF-8") from exc
        target = Path(relative)
        if target.is_absolute() or ".." in target.parts:
            raise ReleaseBuildError(f"Tracked release path is unsafe: {relative}")
        source = root / target
        if not source.is_file():
            raise ReleaseBuildError(f"Tracked release source is missing: {relative}")
        entries[target.as_posix()] = source
    for required in REQUIRED_RELEASE_FILES:
        if required not in entries:
            raise ReleaseBuildError(f"Required release file is not tracked: {required}")
    return entries


def collect_payload(workbench_root: Path, project_root: Path = PROJECT_ROOT) -> dict[str, Path]:
    entries = tracked_source_entries(project_root)
    workbench_prefix = f"{WORKBENCH_TARGET_ROOT}/"
    for target in tuple(entries):
        if target == WORKBENCH_TARGET_ROOT or target.startswith(workbench_prefix):
            del entries[target]
    add_tree(entries, workbench_root, WORKBENCH_TARGET_ROOT)
    if f"{workbench_prefix}index.html" not in entries:
        raise ReleaseBuildError("Verified Workbench payload is missing index.html")
    return entries


def release_manifest(
    entries: dict[str, Path], *, version: str, git_commit: str, build_id: str
) -> bytes:
    files = []
    for target, source in sorted(entries.items()):
        data = source.read_bytes()
        files.append({"path": target, "bytes": len(data), "sha256": sha256_bytes(data)})
    manifest = {
        "schemaVersion": 2,
        "releaseVersion": version,
        "gitCommit": git_commit,
        "buildId": build_id,
        "payloadContract": {
            "source": "all-git-tracked-files",
            "workbench": "verified-prebuilt-overlay",
        },
        "files": files,
    }
    return f"{json.dumps(manifest, indent=2)}\n".encode()


def tar_info(name: str, *, size: int, timestamp: int, mode: int = 0o644) -> tarfile.TarInfo:
    info = tarfile.TarInfo(name)
    info.size = size
    info.mtime = timestamp
    info.mode = mode
    info.uid = 0
    info.gid = 0
    info.uname = "root"
    info.gname = "root"
    return info


def build_archive(
    destination: Path,
    entries: dict[str, Path],
    manifest_data: bytes,
    *,
    archive_root: str,
    timestamp: int,
) -> None:
    uncompressed = io.BytesIO()
    with tarfile.open(fileobj=uncompressed, mode="w", format=tarfile.PAX_FORMAT) as package:
        payload: list[tuple[str, bytes, int]] = []
        for target, source in sorted(entries.items()):
            mode = 0o755 if target == "install.py" else 0o644
            payload.append((f"{archive_root}/{target}", source.read_bytes(), mode))
        payload.append((f"{archive_root}/release-manifest.json", manifest_data, 0o644))
        for name, data, mode in sorted(payload):
            package.addfile(tar_info(name, size=len(data), timestamp=timestamp, mode=mode), io.BytesIO(data))
    destination.parent.mkdir(parents=True, exist_ok=True)
    with destination.open("wb") as raw_output:
        with gzip.GzipFile(filename="", mode="wb", fileobj=raw_output, mtime=timestamp, compresslevel=9) as output:
            output.write(uncompressed.getvalue())


def component(name: str, version: str, license_id: str, purl: str, kind: str = "library") -> dict:
    return {
        "type": kind,
        "name": name,
        "version": version,
        "licenses": [{"license": {"id": license_id}}],
        "purl": purl,
    }


def write_sbom(path: Path, *, version: str, git_commit: str, build_id: str, archive_hash: str) -> None:
    components = []
    requirement_versions = dict(parse_requirements(PROJECT_ROOT / "requirements.txt"))
    for dependency in PYTHON_RUNTIME_DEPENDENCIES:
        normalized = dependency.name.replace("_", "-").lower()
        if requirement_versions.get(normalized) != dependency.version:
            raise ReleaseBuildError(f"Runtime dependency policy mismatch for {dependency.name}")
        components.append(
            component(
                dependency.name,
                dependency.version,
                dependency.license_id,
                dependency.purl,
            )
        )
    for dependency in BROWSER_RUNTIME_DEPENDENCIES:
        components.append(
            component(
                dependency.name,
                dependency.version,
                dependency.license_id,
                dependency.purl,
            )
        )
    components.sort(key=lambda item: item["purl"])
    serial = uuid.uuid5(uuid.NAMESPACE_URL, f"https://openairtwin.com/releases/{build_id}")
    sbom = {
        "bomFormat": "CycloneDX",
        "specVersion": "1.5",
        "serialNumber": f"urn:uuid:{serial}",
        "version": 1,
        "metadata": {
            "component": {
                "type": "application",
                "name": "OpenAirTwin",
                "version": version,
                "bom-ref": f"pkg:generic/openairtwin@{version}?commit={git_commit}",
                "hashes": [{"alg": "SHA-256", "content": archive_hash}],
            }
        },
        "components": components,
    }
    path.write_text(f"{json.dumps(sbom, indent=2)}\n", encoding="utf-8")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--version", required=True)
    parser.add_argument("--git-commit", required=True)
    parser.add_argument(
        "--workbench-root",
        type=Path,
        default=PROJECT_ROOT / "backend/static/workbench",
    )
    parser.add_argument("--output-dir", type=Path, default=PROJECT_ROOT / "dist/release")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    timestamp = validate_release_identity(args.version, args.git_commit)
    workbench = load_workbench_build(args.workbench_root)
    if workbench.release_version != args.version or workbench.git_commit != args.git_commit:
        raise ReleaseBuildError("Workbench release identity does not match package identity")
    entries = collect_payload(workbench.root)
    manifest_data = release_manifest(
        entries,
        version=args.version,
        git_commit=args.git_commit,
        build_id=workbench.build_id,
    )
    archive_root = f"openairtwin-{args.version}"
    archive = args.output_dir / f"{archive_root}.tar.gz"
    build_archive(
        archive,
        entries,
        manifest_data,
        archive_root=archive_root,
        timestamp=timestamp,
    )
    archive_hash = sha256_file(archive)
    archive.with_suffix(f"{archive.suffix}.sha256").write_text(
        f"{archive_hash}  {archive.name}\n",
        encoding="utf-8",
    )
    write_sbom(
        args.output_dir / f"{archive_root}.cdx.json",
        version=args.version,
        git_commit=args.git_commit,
        build_id=workbench.build_id,
        archive_hash=archive_hash,
    )
    print(f"Built {archive} ({archive_hash})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
