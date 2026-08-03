import re
import subprocess
from pathlib import Path

from tools.check_release_english import TextEntry, text_violations


PROJECT_ROOT = Path(__file__).resolve().parents[1]
DOCUMENT_SUFFIXES = {".cff", ".html", ".md", ".txt"}
PROCESS_TRACE_PATTERNS = {
    "numbered development phase": re.compile(r"\bPhase\s+\d+\b", re.IGNORECASE),
    "numbered development phase metadata": re.compile(r'"phase"\s*:\s*\d+', re.IGNORECASE),
    "Codex reference": re.compile(r"\bCodex\b", re.IGNORECASE),
    "ChatGPT reference": re.compile(r"\bChatGPT\b", re.IGNORECASE),
    "agent-facing instruction": re.compile(r"\bAgent-facing\b", re.IGNORECASE),
    "skill instruction": re.compile(r"\bSKILL\.md\b", re.IGNORECASE),
    "release candidate wording": re.compile(
        r"\bRelease Candidate\b|\b\d+\.\d+\.\d+-rc(?:\.[0-9]+)?\b",
        re.IGNORECASE,
    ),
    "release candidate tool name": re.compile(r"\bbuild_release_candidate\.py\b"),
    "stale React legacy-module wording": re.compile(
        r"\bReact(?: and| /) legacy modules\b",
        re.IGNORECASE,
    ),
    "completed migration wording": re.compile(r"\bafter migration\b", re.IGNORECASE),
}


def is_release_document(path: Path) -> bool:
    return path.suffix.lower() in DOCUMENT_SUFFIXES or (
        path.suffix.lower() == ".json" and PROJECT_ROOT / "docs" in path.parents
    )


def release_document_paths() -> list[Path]:
    result = subprocess.run(
        ["git", "ls-files", "-co", "--exclude-standard", "-z"],
        cwd=PROJECT_ROOT,
        check=True,
        capture_output=True,
    )
    return sorted(
        path
        for raw_path in result.stdout.split(b"\0")
        if raw_path
        for path in [PROJECT_ROOT / raw_path.decode("utf-8")]
        if is_release_document(path) and path.is_file()
    )


def test_release_language_gate_accepts_english_text_and_binary_data() -> None:
    entries = [
        TextEntry("index.html", b'<!doctype html><html lang="en"><title>OpenAirTwin</title>'),
        TextEntry("README.md", b"English release documentation"),
        TextEntry("logo.png", b"\x89PNG\x00\xe5\x90\x8d"),
    ]

    assert text_violations(entries) == []


def test_release_language_gate_rejects_cjk_and_non_english_html() -> None:
    entries = [
        TextEntry("notes.md", "Release \u8bf4\u660e".encode()),
        TextEntry("index.html", b'<!doctype html><html lang="fr"><title>OpenAirTwin</title>'),
    ]

    assert text_violations(entries) == [
        "notes.md:1: contains CJK text",
        "index.html: HTML language must be English, found 'fr'",
    ]


def test_release_language_module_has_no_repository_side_effect(tmp_path: Path) -> None:
    assert list(tmp_path.iterdir()) == []


def test_release_document_scope_includes_contract_json_but_not_lockfiles() -> None:
    assert is_release_document(PROJECT_ROOT / "docs/ui/component-manifest.json")
    assert not is_release_document(PROJECT_ROOT / "workbench/package-lock.json")
    assert PROCESS_TRACE_PATTERNS["numbered development phase metadata"].search('"phase": 8')


def test_release_documents_do_not_contain_development_process_traces() -> None:
    violations = []
    for path in release_document_paths():
        relative = path.relative_to(PROJECT_ROOT).as_posix()
        for line_number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
            for label, pattern in PROCESS_TRACE_PATTERNS.items():
                if pattern.search(line):
                    violations.append(f"{relative}:{line_number}: {label}")

    assert violations == []
