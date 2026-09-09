"""Select optional CI jobs from both sides of a pull request diff."""

from __future__ import annotations

import os
from pathlib import Path
import subprocess


def select_checks(paths: list[str], *, full: bool = False) -> dict[str, bool]:
    full = full or any(
        path.startswith(".github/workflows/")
        or path in {"tools/ci_scope.py", "tests/test_ci_scope.py"}
        for path in paths
    )
    checks = dict.fromkeys(("full", "tutorial", "runtime", "audit", "release"), full)
    for path in paths:
        if path.startswith(("website/", "docs/", "tests/browser/tutorial-site", "tests/browser/package")) or path == "README.md":
            checks["tutorial"] = True
        if (
            path.startswith(("requirements", "scene/"))
            or (path.startswith("backend/") and not path.startswith("backend/static/"))
            or path in {"install.py", "tests/test_real_runtime.py"}
        ):
            checks["runtime"] = True
        if (
            Path(path).name in {"package.json", "package-lock.json", "LICENSE", "THIRD_PARTY_NOTICES.md"}
            or path.startswith(("requirements", "backend/static/lib/", "tools/release_dependencies", "tools/audit_release_dependencies"))
            or path in {"docs/data-licenses.md", "tests/test_release_dependencies.py"}
        ):
            checks["audit"] = True
        if (
            path.startswith(("requirements", "workbench/scripts/", "tools/build_release", "tools/smoke_release", "tools/check_release", "tools/run_production_server", "tests/test_release", "tests/test_installer", "tests/test_workbench_build"))
            or path in {"install.py", "workbench/vite.config.ts", "workbench/package.json", "workbench/package-lock.json", "backend/server.py", "backend/static/index.html"}
        ):
            checks["release"] = True
    return checks


def main() -> None:
    full = os.environ["GITHUB_EVENT_NAME"] != "pull_request"
    paths = []
    if not full:
        # No rename detection: a move must check both its old and new scope.
        diff = subprocess.check_output([
            "git", "diff", "--name-only", "--no-renames", "-z",
            f"{os.environ['PR_BASE_SHA']}...{os.environ['PR_HEAD_SHA']}",
        ])
        paths = [path.decode("utf-8") for path in diff.split(b"\0") if path]
    output = "".join(f"{key}={str(value).lower()}\n" for key, value in select_checks(paths, full=full).items())
    with Path(os.environ["GITHUB_OUTPUT"]).open("a", encoding="utf-8") as stream:
        stream.write(output)
    print(output, end="")


if __name__ == "__main__":
    main()
