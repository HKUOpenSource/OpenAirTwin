#!/usr/bin/env python3
"""Verify, optionally install, and smoke-test an OpenAirTwin release archive."""

from __future__ import annotations

import argparse
import hashlib
import http.client
import json
import os
from pathlib import Path, PurePosixPath
import re
import signal
import socket
import subprocess
import sys
import tarfile
import tempfile
import time


SHA256_PATTERN = re.compile(r"^[0-9a-f]{64}$")
PAYLOAD_CONTRACT = {
    "source": "all-git-tracked-files",
    "workbench": "verified-prebuilt-overlay",
}
SOURCE_CONTRACT_FILES = {
    "backend/server.py",
    "tests/test_release_build.py",
    "tools/build_release.py",
    "website/package.json",
    "website/src/App.tsx",
    "workbench/package.json",
    "workbench/src/app-shell/AppShell.tsx",
}
WORKBENCH_CONTRACT_FILES = {
    "backend/static/workbench/.vite/manifest.json",
    "backend/static/workbench/build-info.json",
    "backend/static/workbench/index.html",
    "backend/static/workbench/integrity.json",
}


class ReleaseSmokeError(RuntimeError):
    pass


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def verify_external_checksum(archive: Path) -> None:
    checksum_path = archive.with_suffix(f"{archive.suffix}.sha256")
    if not checksum_path.is_file():
        raise ReleaseSmokeError(f"Missing release checksum: {checksum_path}")
    fields = checksum_path.read_text(encoding="utf-8").strip().split()
    if len(fields) != 2 or fields[1] != archive.name or SHA256_PATTERN.fullmatch(fields[0]) is None:
        raise ReleaseSmokeError("Invalid release checksum file")
    actual = sha256_file(archive)
    if fields[0] != actual:
        raise ReleaseSmokeError(f"Release checksum mismatch: expected {fields[0]}, got {actual}")


def safe_member_path(member_name: str) -> PurePosixPath:
    path = PurePosixPath(member_name)
    if path.is_absolute() or ".." in path.parts or len(path.parts) < 2:
        raise ReleaseSmokeError(f"Unsafe release archive member: {member_name}")
    return path


def verify_archive(archive: Path) -> tuple[str, dict]:
    verify_external_checksum(archive)
    with tarfile.open(archive, "r:gz") as package:
        members = package.getmembers()
        if any(not member.isfile() for member in members):
            raise ReleaseSmokeError("Release archive may contain regular files only")
        paths = [safe_member_path(member.name) for member in members]
        roots = {path.parts[0] for path in paths}
        if len(roots) != 1:
            raise ReleaseSmokeError("Release archive must contain exactly one root directory")
        root = roots.pop()
        manifest_name = f"{root}/release-manifest.json"
        try:
            manifest_member = package.getmember(manifest_name)
        except KeyError as exc:
            raise ReleaseSmokeError("Release archive is missing release-manifest.json") from exc
        manifest_stream = package.extractfile(manifest_member)
        if manifest_stream is None:
            raise ReleaseSmokeError("Release manifest cannot be read")
        manifest = json.loads(manifest_stream.read().decode("utf-8"))
        entries = manifest.get("files")
        if (
            manifest.get("schemaVersion") != 2
            or manifest.get("payloadContract") != PAYLOAD_CONTRACT
            or not isinstance(entries, list)
        ):
            raise ReleaseSmokeError("Invalid release manifest schema")
        expected = {}
        for entry in entries:
            if not isinstance(entry, dict):
                raise ReleaseSmokeError("Invalid release manifest entry")
            path = entry.get("path")
            size = entry.get("bytes")
            digest = entry.get("sha256")
            if (
                not isinstance(path, str)
                or path in expected
                or not isinstance(size, int)
                or size < 0
                or not isinstance(digest, str)
                or SHA256_PATTERN.fullmatch(digest) is None
            ):
                raise ReleaseSmokeError("Invalid release manifest entry")
            expected[path] = (size, digest)
        actual_paths = {
            str(path.relative_to(root)) for path in paths if str(path) != manifest_name
        }
        if actual_paths != set(expected):
            raise ReleaseSmokeError("Release archive file set does not match release manifest")
        missing_contract_files = sorted(
            (SOURCE_CONTRACT_FILES | WORKBENCH_CONTRACT_FILES) - actual_paths
        )
        if missing_contract_files:
            raise ReleaseSmokeError(
                "Release archive does not satisfy the source and Workbench payload contract: "
                + ", ".join(missing_contract_files)
            )
        for relative_path, (expected_size, expected_digest) in expected.items():
            stream = package.extractfile(f"{root}/{relative_path}")
            if stream is None:
                raise ReleaseSmokeError(f"Release file cannot be read: {relative_path}")
            data = stream.read()
            if len(data) != expected_size or sha256_bytes(data) != expected_digest:
                raise ReleaseSmokeError(f"Release file integrity mismatch: {relative_path}")
    return root, manifest


def extract_archive(archive: Path, destination: Path) -> Path:
    root, _manifest = verify_archive(archive)
    with tarfile.open(archive, "r:gz") as package:
        package.extractall(destination)
    return destination / root


def venv_python(root: Path) -> Path:
    if os.name == "nt":
        return root / ".venv" / "Scripts" / "python.exe"
    return root / ".venv" / "bin" / "python"


def install_release(root: Path) -> Path:
    result = subprocess.run(
        [
            sys.executable,
            "install.py",
            "--yes",
            "--no-sample-scene",
            "--cpu",
        ],
        cwd=root,
        text=True,
    )
    if result.returncode != 0:
        raise ReleaseSmokeError(f"Release installer failed with exit code {result.returncode}")
    python = venv_python(root)
    if not python.is_file():
        raise ReleaseSmokeError("Release installer did not create its Python environment")
    return python


def available_port() -> int:
    with socket.socket() as listener:
        listener.bind(("127.0.0.1", 0))
        return int(listener.getsockname()[1])


def request(port: int, path: str) -> tuple[int, dict[str, str], bytes]:
    connection = http.client.HTTPConnection("127.0.0.1", port, timeout=10)
    try:
        connection.request("GET", path)
        response = connection.getresponse()
        return response.status, {name.lower(): value for name, value in response.getheaders()}, response.read()
    finally:
        connection.close()


def manifest_assets(root: Path) -> list[str]:
    manifest_path = root / "backend" / "static" / "workbench" / ".vite" / "manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    assets = set()
    for entry in manifest.values():
        if not isinstance(entry, dict):
            continue
        file_value = entry.get("file")
        if isinstance(file_value, str):
            assets.add(file_value)
        for key in ("css", "assets"):
            for value in entry.get(key, []):
                if isinstance(value, str):
                    assets.add(value)
    return sorted(assets)


def wait_for_health(process: subprocess.Popen, port: int) -> None:
    deadline = time.monotonic() + 90
    while time.monotonic() < deadline:
        if process.poll() is not None:
            output = process.stdout.read() if process.stdout is not None else ""
            raise ReleaseSmokeError(
                f"Release server exited with code {process.returncode}:\n{output}"
            )
        try:
            status, _headers, _body = request(port, "/api/health")
            if status == 200:
                return
        except OSError:
            pass
        time.sleep(0.25)
    raise ReleaseSmokeError("Release server did not become healthy within 90 seconds")


def smoke_service(root: Path, python: Path, build_id: str) -> None:
    port = available_port()
    environment = {
        **os.environ,
        "OAT_HOST": "127.0.0.1",
        "OAT_PORT": str(port),
        "OAT_REQUIRE_WORKBENCH_BUILD": "1",
        "PYTHONUNBUFFERED": "1",
        "PATH": str(python.parent),
    }
    if any((python.parent / name).exists() for name in ("node", "node.exe")):
        raise ReleaseSmokeError("The release smoke PATH unexpectedly contains Node.js")
    process = subprocess.Popen(
        [str(python), "-m", "backend.server"],
        cwd=root,
        env=environment,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
    )
    try:
        wait_for_health(process, port)
        status, headers, html = request(port, "/")
        if status != 200 or headers.get("cache-control") != "no-store":
            raise ReleaseSmokeError("Release homepage response is invalid")
        if headers.get("x-openairtwin-frontend-build-id") != build_id:
            raise ReleaseSmokeError("Release homepage Build ID is invalid")
        if b"/workbench/assets/" not in html:
            raise ReleaseSmokeError("Release homepage does not reference hashed assets")
        for asset in manifest_assets(root):
            status, asset_headers, _body = request(port, f"/workbench/{asset}")
            if status != 200:
                raise ReleaseSmokeError(f"Release asset failed: {asset} ({status})")
            if asset.startswith("assets/") and asset_headers.get("cache-control") != (
                "public, max-age=31536000, immutable"
            ):
                raise ReleaseSmokeError(f"Release asset cache contract failed: {asset}")
    finally:
        if process.poll() is None:
            if os.name == "nt":
                process.terminate()
            else:
                process.send_signal(signal.SIGINT)
            try:
                process.wait(timeout=15)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait(timeout=5)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("archive", type=Path)
    parser.add_argument(
        "--python",
        type=Path,
        help="Existing runtime Python to use instead of running the packaged installer.",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    archive = args.archive.resolve()
    with tempfile.TemporaryDirectory(prefix="openairtwin-release-smoke-") as temporary:
        root = extract_archive(archive, Path(temporary))
        manifest = json.loads((root / "release-manifest.json").read_text(encoding="utf-8"))
        python = args.python.resolve() if args.python else install_release(root)
        smoke_service(root, python, manifest["buildId"])
    print(f"Release archive smoke passed: {archive.name}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
