#!/usr/bin/env python3
"""Reject CJK text and non-English HTML metadata in release content."""

from __future__ import annotations

import argparse
import re
import subprocess
import tarfile
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable


CJK_PATTERN = re.compile(
    "["
    "\u2e80-\u2eff"
    "\u3000-\u303f"
    "\u31c0-\u31ef"
    "\u3400-\u4dbf"
    "\u4e00-\u9fff"
    "\uf900-\ufaff"
    "]"
)
HTML_LANG_PATTERN = re.compile(r"<html\b[^>]*\blang=[\"']([^\"']+)[\"']", re.IGNORECASE)
ENGLISH_LANG_PATTERN = re.compile(r"^en(?:-|$)", re.IGNORECASE)


@dataclass(frozen=True)
class TextEntry:
    name: str
    data: bytes


def tracked_entries(repository: Path) -> Iterable[TextEntry]:
    result = subprocess.run(
        ["git", "ls-files", "-z"],
        cwd=repository,
        check=True,
        capture_output=True,
    )
    for raw_name in result.stdout.split(b"\0"):
        if not raw_name:
            continue
        relative = raw_name.decode("utf-8")
        path = repository / relative
        if path.is_file():
            yield TextEntry(relative, path.read_bytes())


def tar_entries(archive: Path) -> Iterable[TextEntry]:
    with tarfile.open(archive, "r:gz") as package:
        for member in package.getmembers():
            if not member.isfile():
                continue
            stream = package.extractfile(member)
            if stream is not None:
                yield TextEntry(member.name, stream.read())


def text_violations(entries: Iterable[TextEntry]) -> list[str]:
    violations: list[str] = []
    for entry in entries:
        if b"\0" in entry.data:
            continue
        try:
            source = entry.data.decode("utf-8")
        except UnicodeDecodeError:
            continue
        cjk = CJK_PATTERN.search(source)
        if cjk:
            line = source.count("\n", 0, cjk.start()) + 1
            violations.append(f"{entry.name}:{line}: contains CJK text")
        if entry.name.lower().endswith((".html", ".htm")) and re.search(
            r"<html\b", source, re.IGNORECASE
        ):
            language = HTML_LANG_PATTERN.search(source)
            if language is None:
                violations.append(f"{entry.name}: missing HTML language metadata")
            elif ENGLISH_LANG_PATTERN.match(language.group(1)) is None:
                violations.append(
                    f"{entry.name}: HTML language must be English, found {language.group(1)!r}"
                )
    return violations


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--repository",
        type=Path,
        default=Path(__file__).resolve().parents[1],
        help="Repository whose tracked files are checked.",
    )
    parser.add_argument(
        "--archive",
        action="append",
        type=Path,
        default=[],
        help="Release .tar.gz archive to check in addition to tracked files.",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    entries: list[TextEntry] = list(tracked_entries(args.repository.resolve()))
    for archive in args.archive:
        entries.extend(tar_entries(archive.resolve()))
    violations = text_violations(entries)
    if violations:
        print("English release gate failed:")
        for violation in violations:
            print(f"- {violation}")
        return 1
    print(f"English release gate passed for {len(entries)} files.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
