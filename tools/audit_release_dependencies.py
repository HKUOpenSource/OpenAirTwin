#!/usr/bin/env python3
"""Validate release dependency versions, licenses, notices and vendored files."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
import sys


PROJECT_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT_ROOT))

from tools.release_dependencies import (
    APPROVED_COPYLEFT_EXCEPTIONS,
    APPROVED_LICENSES,
    BROWSER_RUNTIME_DEPENDENCIES,
    LOCKFILE_LICENSE_OVERRIDES,
    PYTHON_RUNTIME_DEPENDENCIES,
    VENDORED_RUNTIME_FILES,
    normalize_dependency_name,
    parse_requirements,
)


LOCKFILES = (
    "workbench/package-lock.json",
    "website/package-lock.json",
    "tests/browser/package-lock.json",
)


def package_name_from_lock_path(path: str, metadata: dict) -> str | None:
    declared = metadata.get("name")
    if isinstance(declared, str) and declared:
        return declared
    marker = "node_modules/"
    if marker not in path:
        return None
    return path.rsplit(marker, 1)[-1]


def audit_lockfile(path: Path) -> tuple[list[dict], list[str]]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    packages = payload.get("packages")
    if not isinstance(packages, dict):
        return [], [f"{path}: missing packages object"]
    records = []
    violations = []
    for package_path, metadata in sorted(packages.items()):
        if package_path == "" or not isinstance(metadata, dict):
            continue
        name = package_name_from_lock_path(package_path, metadata)
        version = metadata.get("version")
        if not isinstance(name, str) or not isinstance(version, str):
            violations.append(f"{path}:{package_path}: missing package name or version")
            continue
        license_id = metadata.get("license")
        if not isinstance(license_id, str):
            license_id = LOCKFILE_LICENSE_OVERRIDES.get((name, version))
        if license_id not in APPROVED_LICENSES:
            violations.append(
                f"{path}:{package_path}: unknown or unapproved license {license_id!r} for {name}@{version}"
            )
        records.append(
            {
                "ecosystem": "npm",
                "lockfile": path.as_posix(),
                "name": name,
                "version": version,
                "license": license_id,
            }
        )
    return records, violations


def audit_python_runtime(repository: Path) -> tuple[list[dict], list[str]]:
    declared = {
        normalize_dependency_name(item.name): item for item in PYTHON_RUNTIME_DEPENDENCIES
    }
    requirements = dict(parse_requirements(repository / "requirements.txt"))
    violations = []
    if set(requirements) != set(declared):
        violations.append(
            "requirements.txt dependency set does not match the release dependency policy"
        )
    records = []
    for name, dependency in sorted(declared.items()):
        version = requirements.get(name)
        if version != dependency.version:
            violations.append(
                f"requirements.txt pins {name} to {version!r}; expected {dependency.version}"
            )
        exception = (name, dependency.version, dependency.license_id)
        if (
            dependency.license_id not in APPROVED_LICENSES
            and exception not in APPROVED_COPYLEFT_EXCEPTIONS
        ):
            violations.append(
                f"Unapproved runtime license {dependency.license_id} for {name}@{dependency.version}"
            )
        records.append(
            {
                "ecosystem": "pypi",
                "name": name,
                "version": dependency.version,
                "license": dependency.license_id,
            }
        )
    return records, violations


def audit_runtime_contract(repository: Path) -> list[str]:
    violations = []
    notices = (repository / "THIRD_PARTY_NOTICES.md").read_text(encoding="utf-8")
    for dependency in (*PYTHON_RUNTIME_DEPENDENCIES, *BROWSER_RUNTIME_DEPENDENCIES):
        if dependency.display_name not in notices or dependency.license_id not in notices:
            violations.append(
                f"THIRD_PARTY_NOTICES.md is missing {dependency.display_name} ({dependency.license_id})"
            )
    for relative_path in VENDORED_RUNTIME_FILES:
        if not (repository / relative_path).is_file():
            violations.append(f"Missing vendored runtime file: {relative_path}")
    return violations


def run_audit(repository: Path) -> tuple[dict, list[str]]:
    records, violations = audit_python_runtime(repository)
    for relative_path in LOCKFILES:
        lock_records, lock_violations = audit_lockfile(repository / relative_path)
        records.extend(lock_records)
        violations.extend(lock_violations)
    violations.extend(audit_runtime_contract(repository))
    records.sort(key=lambda item: (item["ecosystem"], item["name"], item["version"], item.get("lockfile", "")))
    return {"schemaVersion": 1, "dependencies": records}, violations


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repository", type=Path, default=PROJECT_ROOT)
    parser.add_argument("--report", type=Path)
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    report, violations = run_audit(args.repository.resolve())
    report["ok"] = not violations
    report["violations"] = violations
    if args.report:
        args.report.parent.mkdir(parents=True, exist_ok=True)
        args.report.write_text(f"{json.dumps(report, indent=2)}\n", encoding="utf-8")
    if violations:
        print("Release dependency audit failed:")
        for violation in violations:
            print(f"- {violation}")
        return 1
    print(f"Release dependency audit passed for {len(report['dependencies'])} dependency records.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
