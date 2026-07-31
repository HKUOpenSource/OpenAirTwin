import json
from pathlib import Path

from tools.audit_release_dependencies import audit_lockfile, run_audit


def test_release_dependency_audit_passes_for_repository() -> None:
    repository = Path(__file__).resolve().parents[1]
    report, violations = run_audit(repository)

    assert violations == []
    assert report["schemaVersion"] == 1
    assert any(item["name"] == "deepmimo" for item in report["dependencies"])
    assert any(item["name"] == "react" for item in report["dependencies"])


def test_lockfile_audit_rejects_unknown_license(tmp_path: Path) -> None:
    lockfile = tmp_path / "package-lock.json"
    lockfile.write_text(
        json.dumps(
            {
                "packages": {
                    "": {"name": "fixture"},
                    "node_modules/unlicensed": {"version": "1.0.0"},
                }
            }
        ),
        encoding="utf-8",
    )

    _records, violations = audit_lockfile(lockfile)

    assert violations == [
        f"{lockfile}:node_modules/unlicensed: unknown or unapproved license None for unlicensed@1.0.0"
    ]
