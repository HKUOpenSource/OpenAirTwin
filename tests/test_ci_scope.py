import pytest

from tools.ci_scope import select_checks


@pytest.mark.parametrize("path, enabled", [
    ("backend/static/js/entry_map.js", set()),
    ("website/src/main.js", {"tutorial"}),
    ("docs/development.md", {"tutorial"}),
    ("backend/solver.py", {"runtime"}),
    ("requirements.txt", {"runtime", "audit", "release"}),
    ("workbench/package-lock.json", {"audit", "release"}),
    ("website/package-lock.json", {"tutorial", "audit"}),
    ("tests/browser/package-lock.json", {"tutorial", "audit"}),
    ("backend/static/lib/three.module.js", {"audit"}),
    ("install.py", {"runtime", "release"}),
    ("tools/build_release.py", {"release"}),
])
def test_optional_checks_follow_changed_dependencies(path, enabled):
    assert {key for key, value in select_checks([path]).items() if value} == enabled


@pytest.mark.parametrize("paths, full", [
    ([], True),
    ([".github/workflows/ci.yml"], False),
    (["tools/ci_scope.py"], False),
    (["tests/test_ci_scope.py"], False),
])
def test_full_runs_and_ci_changes_exercise_every_job(paths, full):
    assert all(select_checks(paths, full=full).values())


def test_changes_across_scopes_are_combined():
    checks = select_checks(["website/deleted.js", "backend/new.py"])
    assert checks["tutorial"] and checks["runtime"]
    assert not checks["release"]
