from __future__ import annotations

from html import unescape
from pathlib import Path
import re
import unittest


PROJECT_ROOT = Path(__file__).resolve().parents[1]
DOCUMENT_PATHS = (
    PROJECT_ROOT / "README.md",
    PROJECT_ROOT / "CHANGELOG.md",
    *sorted((PROJECT_ROOT / "docs").glob("*.md")),
    *sorted((PROJECT_ROOT / "docs").glob("*.html")),
)


def document_text(path: Path) -> str:
    return path.read_text(encoding="utf-8")


class RadarDocumentationTests(unittest.TestCase):
    def test_release_documents_do_not_restore_stale_radar_claims(self) -> None:
        combined = "\n".join(document_text(path) for path in DOCUMENT_PATHS)
        for stale in (
            "33blocks",
            "e913c9bf161243b9b6b1085677908edc",
            "blocked_pending_written_permission",
            "Link and Radar Sensing remain synchronous",
            "shared by all four analysis Features",
            "visual snapshots for all four modes",
            "all four current analysis Features",
        ):
            with self.subTest(stale=stale):
                self.assertNotIn(stale, combined)

    def test_radar_architecture_documents_the_fifth_feature_and_job_flow(self) -> None:
        architecture = unescape(
            document_text(PROJECT_ROOT / "docs" / "openairtwin-architecture.html")
        )
        for expected in (
            'data-feature-row="radar"',
            'id: "radar-front"',
            'id: "radar-api"',
            'id: "radar-back"',
            'id: "radar-exec"',
            'from: "feature-core", to: "radar-front"',
            'from: "radar-exec", to: "rt-scene"',
            "/api/radar/jobs",
            "shared by all five analysis Features",
            "visual snapshots for all five modes",
        ):
            with self.subTest(expected=expected):
                self.assertIn(expected, architecture)

    def test_processing_view_documentation_omits_detection_association_discussion(self) -> None:
        processing_view = re.compile(r"mean[- ]subtracted", re.IGNORECASE)
        prohibited = re.compile(
            r"\b(?:association|associated|unassociated|target\s+id)\b|关联",
            re.IGNORECASE,
        )
        for path in DOCUMENT_PATHS:
            for paragraph in re.split(r"\n\s*\n", document_text(path)):
                if processing_view.search(paragraph):
                    with self.subTest(path=path):
                        self.assertIsNone(prohibited.search(paragraph))


if __name__ == "__main__":
    unittest.main()
