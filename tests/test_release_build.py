import hashlib
import json
from pathlib import Path
import tarfile
from unittest.mock import patch

from tools.build_release import (
    build_archive,
    collect_payload,
    release_manifest,
    tar_info,
)
from tools.smoke_release_archive import ReleaseSmokeError, verify_archive


def test_release_manifest_is_sorted_and_content_addressed(tmp_path: Path) -> None:
    first = tmp_path / "first.txt"
    second = tmp_path / "second.txt"
    first.write_text("first\n", encoding="utf-8")
    second.write_text("second\n", encoding="utf-8")
    entries = {"z/second.txt": second, "a/first.txt": first}

    payload = json.loads(
        release_manifest(
            entries,
            version="1.1.0",
            git_commit="a" * 40,
            build_id="1.1.0+aaaaaaaaaaaa",
        )
    )

    assert payload["schemaVersion"] == 2
    assert payload["payloadContract"] == {
        "source": "all-git-tracked-files",
        "workbench": "verified-prebuilt-overlay",
    }
    assert [entry["path"] for entry in payload["files"]] == ["a/first.txt", "z/second.txt"]
    assert payload["files"][0] == {
        "path": "a/first.txt",
        "bytes": 6,
        "sha256": hashlib.sha256(b"first\n").hexdigest(),
    }


def test_release_archive_is_byte_reproducible(tmp_path: Path) -> None:
    payload = tmp_path / "payload.txt"
    payload.write_text("release payload\n", encoding="utf-8")
    manifest = b'{"schemaVersion":1}\n'
    first = tmp_path / "first.tar.gz"
    second = tmp_path / "second.tar.gz"
    kwargs = {
        "entries": {"payload.txt": payload},
        "manifest_data": manifest,
        "archive_root": "openairtwin-1.1.0",
        "timestamp": 1_753_900_000,
    }

    build_archive(first, **kwargs)
    build_archive(second, **kwargs)

    assert first.read_bytes() == second.read_bytes()
    with tarfile.open(first, "r:gz") as archive:
        members = archive.getmembers()
        assert [member.name for member in members] == sorted(member.name for member in members)
        assert all(member.mtime == 1_753_900_000 for member in members)
        assert all((member.uid, member.gid, member.uname, member.gname) == (0, 0, "root", "root") for member in members)


def test_release_payload_contains_all_tracked_sources_and_prebuilt_workbench(tmp_path: Path) -> None:
    tracked = (
        "install.py",
        "requirements.txt",
        "README.md",
        "LICENSE",
        "CITATION.cff",
        "CHANGELOG.md",
        "THIRD_PARTY_NOTICES.md",
        "docs/data-licenses.md",
        "docs/release-checklist.md",
        "backend/server.py",
        "backend/static/workbench/stale.js",
        "tests/test_app.py",
        "tools/check_app.py",
        "website/src/App.tsx",
        "workbench/src/App.tsx",
    )
    for relative in tracked:
        path = tmp_path / relative
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(f"source: {relative}\n", encoding="utf-8")
    ignored = tmp_path / "node_modules" / "ignored.js"
    ignored.parent.mkdir()
    ignored.write_text("ignored\n", encoding="utf-8")

    workbench_root = tmp_path / "verified-workbench"
    (workbench_root / "assets").mkdir(parents=True)
    (workbench_root / "index.html").write_text("production workbench\n", encoding="utf-8")
    (workbench_root / "assets" / "app-hashed.js").write_text("built\n", encoding="utf-8")
    tracked_output = "\0".join(tracked).encode("utf-8") + b"\0"

    with patch("tools.build_release.run_git_bytes", return_value=tracked_output):
        entries = collect_payload(workbench_root, tmp_path)

    for relative in tracked:
        if not relative.startswith("backend/static/workbench/"):
            assert relative in entries
    assert "node_modules/ignored.js" not in entries
    assert "backend/static/workbench/stale.js" not in entries
    assert entries["backend/static/workbench/index.html"] == workbench_root / "index.html"
    assert entries["backend/static/workbench/assets/app-hashed.js"] == (
        workbench_root / "assets" / "app-hashed.js"
    )


def test_release_archive_verifier_rejects_tampered_checksum(tmp_path: Path) -> None:
    payload = tmp_path / "payload.txt"
    payload.write_text("release payload\n", encoding="utf-8")
    entries = {"payload.txt": payload}
    manifest = release_manifest(
        entries,
        version="1.1.0",
        git_commit="a" * 40,
        build_id="1.1.0+aaaaaaaaaaaa",
    )
    archive = tmp_path / "openairtwin-1.1.0.tar.gz"
    build_archive(
        archive,
        entries,
        manifest,
        archive_root="openairtwin-1.1.0",
        timestamp=1_753_900_000,
    )
    archive.with_suffix(f"{archive.suffix}.sha256").write_text(
        f"{'0' * 64}  {archive.name}\n", encoding="utf-8"
    )

    try:
        verify_archive(archive)
    except ReleaseSmokeError as error:
        assert "checksum mismatch" in str(error)
    else:
        raise AssertionError("Tampered checksum was accepted")


def test_release_archive_verifier_rejects_runtime_only_payload(tmp_path: Path) -> None:
    server = tmp_path / "server.py"
    server.write_text("print('runtime only')\n", encoding="utf-8")
    entries = {"backend/server.py": server}
    manifest = release_manifest(
        entries,
        version="1.1.0",
        git_commit="a" * 40,
        build_id="1.1.0+aaaaaaaaaaaa",
    )
    archive = tmp_path / "openairtwin-1.1.0.tar.gz"
    build_archive(
        archive,
        entries,
        manifest,
        archive_root="openairtwin-1.1.0",
        timestamp=1_753_900_000,
    )
    archive.with_suffix(f"{archive.suffix}.sha256").write_text(
        f"{hashlib.sha256(archive.read_bytes()).hexdigest()}  {archive.name}\n",
        encoding="utf-8",
    )

    try:
        verify_archive(archive)
    except ReleaseSmokeError as error:
        assert "source and Workbench payload contract" in str(error)
    else:
        raise AssertionError("Runtime-only release payload was accepted")


def test_tar_info_uses_release_owned_metadata() -> None:
    info = tar_info("fixture", size=12, timestamp=123)

    assert (info.uid, info.gid, info.uname, info.gname, info.mtime, info.size) == (
        0,
        0,
        "root",
        "root",
        123,
        12,
    )
