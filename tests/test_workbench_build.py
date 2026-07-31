from __future__ import annotations

import hashlib
import json
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch
import urllib.error
import urllib.request

from http.server import ThreadingHTTPServer
import threading

import pytest

from backend import config
from backend.server import RequestHandler
from backend.workbench import WorkbenchBuildError, load_workbench_build


def write_integrity(build_root: Path, build_id: str = "development") -> None:
    files = []
    for path in sorted(build_root.rglob("*")):
        if not path.is_file() or path.name == "integrity.json":
            continue
        data = path.read_bytes()
        files.append(
            {
                "path": path.relative_to(build_root).as_posix(),
                "bytes": len(data),
                "sha256": hashlib.sha256(data).hexdigest(),
            }
        )
    (build_root / "integrity.json").write_text(
        json.dumps({"schemaVersion": 1, "buildId": build_id, "files": files}),
        encoding="utf-8",
    )


def create_build(static_root: Path) -> Path:
    build_root = static_root / "workbench"
    (build_root / ".vite").mkdir(parents=True)
    (build_root / "assets").mkdir()
    (build_root / "assets" / "app-abcdefgh.js").write_text("export const ready=true;", encoding="utf-8")
    (build_root / "index.html").write_text(
        '<script type="importmap">{"imports":{}}</script>'
        '<script type="module" crossorigin src="/workbench/assets/app-abcdefgh.js"></script>',
        encoding="utf-8",
    )
    (build_root / ".vite" / "manifest.json").write_text(
        json.dumps({"js/app.js": {"file": "assets/app-abcdefgh.js", "isDynamicEntry": True}}),
        encoding="utf-8",
    )
    (build_root / "build-info.json").write_text(
        json.dumps(
            {
                "schemaVersion": 1,
                "releaseVersion": "development",
                "gitCommit": "development",
                "buildId": "development",
            }
        ),
        encoding="utf-8",
    )
    write_integrity(build_root)
    return build_root


def run_server():
    server = ThreadingHTTPServer(("127.0.0.1", 0), RequestHandler)
    server.app_state = SimpleNamespace()  # type: ignore[attr-defined]
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    return server, thread


def test_valid_workbench_build_contract(tmp_path: Path) -> None:
    build_root = create_build(tmp_path / "static")
    build = load_workbench_build(build_root)
    assert build.index_path == build_root / "index.html"
    assert build.asset_root == build_root / "assets"
    assert build.build_id == "development"


@pytest.mark.parametrize(
    ("manifest_file", "message"),
    [
        ("assets/app.js", "unhashed asset"),
        ("assets/missing-abcdefgh.js", "asset is missing"),
        ("../assets/app-abcdefgh.js", "unhashed asset"),
    ],
)
def test_invalid_manifest_assets_are_rejected(tmp_path: Path, manifest_file: str, message: str) -> None:
    build_root = create_build(tmp_path / "static")
    (build_root / ".vite" / "manifest.json").write_text(
        json.dumps({"js/app.js": {"file": manifest_file, "isDynamicEntry": True}}),
        encoding="utf-8",
    )
    write_integrity(build_root)
    with pytest.raises(WorkbenchBuildError, match=message):
        load_workbench_build(build_root)


def test_source_maps_are_rejected(tmp_path: Path) -> None:
    build_root = create_build(tmp_path / "static")
    (build_root / "assets" / "app-abcdefgh.js.map").write_text("{}", encoding="utf-8")
    write_integrity(build_root)
    with pytest.raises(WorkbenchBuildError, match="source maps"):
        load_workbench_build(build_root)


def test_python_server_prefers_build_and_applies_split_cache_policy(tmp_path: Path) -> None:
    static_root = tmp_path / "static"
    static_root.mkdir()
    (static_root / "index.html").write_text("source fallback", encoding="utf-8")
    create_build(static_root)

    with (
        patch.object(config, "STATIC_ROOT", static_root),
        patch.object(config, "WORKBENCH_DIST_ROOT", None),
        patch.object(config, "REQUIRE_WORKBENCH_BUILD", True),
    ):
        server, thread = run_server()
        try:
            host, port = server.server_address
            origin = f"http://{host}:{port}"
            with urllib.request.urlopen(f"{origin}/") as response:
                assert response.headers["Cache-Control"] == "no-store"
                assert response.headers["X-OpenAirTwin-Frontend-Build-ID"] == "development"
                assert b"/workbench/assets/app-abcdefgh.js" in response.read()
            with urllib.request.urlopen(f"{origin}/workbench/assets/app-abcdefgh.js") as response:
                assert response.headers["Cache-Control"] == "public, max-age=31536000, immutable"
                assert response.headers["X-Content-Type-Options"] == "nosniff"
            for path in (
                "/workbench/.vite/manifest.json",
                "/workbench/assets/not-hashed.js",
                "/workbench/assets/%2e%2e/.vite/manifest.json",
            ):
                with pytest.raises(urllib.error.HTTPError) as error:
                    urllib.request.urlopen(f"{origin}{path}")
                assert error.value.code == 404
        finally:
            server.shutdown()
            thread.join(timeout=2)
            server.server_close()


def test_integrity_rejects_tampered_and_extra_files(tmp_path: Path) -> None:
    build_root = create_build(tmp_path / "static")
    (build_root / "assets" / "app-abcdefgh.js").write_text("tampered", encoding="utf-8")
    with pytest.raises(WorkbenchBuildError, match="integrity mismatch"):
        load_workbench_build(build_root)

    build_root = create_build(tmp_path / "other-static")
    (build_root / "unexpected.txt").write_text("unexpected", encoding="utf-8")
    with pytest.raises(WorkbenchBuildError, match="file set mismatch"):
        load_workbench_build(build_root)


def test_release_build_id_must_match_full_git_commit(tmp_path: Path) -> None:
    build_root = create_build(tmp_path / "static")
    commit = "a" * 40
    (build_root / "build-info.json").write_text(
        json.dumps(
            {
                "schemaVersion": 1,
                "releaseVersion": "1.1.0-rc.1",
                "gitCommit": commit,
                "buildId": "1.1.0-rc.1+incorrect",
            }
        ),
        encoding="utf-8",
    )
    write_integrity(build_root, "1.1.0-rc.1+incorrect")

    with pytest.raises(WorkbenchBuildError, match="Build ID does not match"):
        load_workbench_build(build_root)


def test_source_fallback_is_development_only(tmp_path: Path) -> None:
    static_root = tmp_path / "static"
    static_root.mkdir()
    (static_root / "index.html").write_text("source fallback", encoding="utf-8")

    with (
        patch.object(config, "STATIC_ROOT", static_root),
        patch.object(config, "WORKBENCH_DIST_ROOT", None),
        patch.object(config, "REQUIRE_WORKBENCH_BUILD", False),
    ):
        server, thread = run_server()
        try:
            host, port = server.server_address
            with urllib.request.urlopen(f"http://{host}:{port}/") as response:
                assert response.read() == b"source fallback"
        finally:
            server.shutdown()
            thread.join(timeout=2)
            server.server_close()

    with (
        patch.object(config, "STATIC_ROOT", static_root),
        patch.object(config, "WORKBENCH_DIST_ROOT", None),
        patch.object(config, "REQUIRE_WORKBENCH_BUILD", True),
    ):
        server, thread = run_server()
        try:
            host, port = server.server_address
            with pytest.raises(urllib.error.HTTPError) as error:
                urllib.request.urlopen(f"http://{host}:{port}/")
            assert error.value.code == 503
        finally:
            server.shutdown()
            thread.join(timeout=2)
            server.server_close()
