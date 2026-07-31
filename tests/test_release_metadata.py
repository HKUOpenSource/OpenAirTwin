from __future__ import annotations

import json
from pathlib import Path
import unittest

from backend import __version__
from backend.server import RequestHandler


PROJECT_ROOT = Path(__file__).resolve().parents[1]
EXPECTED_VERSION = "1.1.0-rc.1"
EXPECTED_RELEASE_DATE = "2026-07-31"


class ReleaseMetadataTests(unittest.TestCase):
    def test_runtime_and_tutorial_versions_match_release(self) -> None:
        package = json.loads((PROJECT_ROOT / "website/package.json").read_text(encoding="utf-8"))
        package_lock = json.loads((PROJECT_ROOT / "website/package-lock.json").read_text(encoding="utf-8"))
        workbench_package = json.loads(
            (PROJECT_ROOT / "workbench/package.json").read_text(encoding="utf-8")
        )
        workbench_lock = json.loads(
            (PROJECT_ROOT / "workbench/package-lock.json").read_text(encoding="utf-8")
        )

        self.assertEqual(__version__, EXPECTED_VERSION)
        self.assertEqual(RequestHandler.server_version, f"OpenAirTwin/{EXPECTED_VERSION}")
        self.assertEqual(package["version"], EXPECTED_VERSION)
        self.assertEqual(package_lock["version"], EXPECTED_VERSION)
        self.assertEqual(package_lock["packages"][""]["version"], EXPECTED_VERSION)
        self.assertEqual(package["packageManager"], "npm@11.9.0")
        self.assertEqual(workbench_package["version"], EXPECTED_VERSION)
        self.assertEqual(workbench_lock["version"], EXPECTED_VERSION)
        self.assertEqual(workbench_lock["packages"][""]["version"], EXPECTED_VERSION)
        self.assertEqual(workbench_package["packageManager"], "npm@11.9.0")

    def test_changelog_and_citation_describe_release(self) -> None:
        changelog = (PROJECT_ROOT / "CHANGELOG.md").read_text(encoding="utf-8")
        citation = (PROJECT_ROOT / "CITATION.cff").read_text(encoding="utf-8")

        self.assertIn(f"## [{EXPECTED_VERSION}] - {EXPECTED_RELEASE_DATE}", changelog)
        self.assertIn(f"version: {EXPECTED_VERSION}", citation)
        self.assertIn(f"date-released: {EXPECTED_RELEASE_DATE}", citation)
        self.assertIn("license: Apache-2.0", citation)
        self.assertIn(f"releases/tag/v{EXPECTED_VERSION}", citation)

    def test_readme_links_to_versioned_release_and_citation(self) -> None:
        readme = (PROJECT_ROOT / "README.md").read_text(encoding="utf-8")

        self.assertIn(f"Version {EXPECTED_VERSION}", readme)
        self.assertIn(f"releases/tag/v{EXPECTED_VERSION}", readme)
        self.assertIn("[`CITATION.cff`](CITATION.cff)", readme)


if __name__ == "__main__":
    unittest.main()
