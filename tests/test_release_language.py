from pathlib import Path

from tools.check_release_english import TextEntry, text_violations


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
