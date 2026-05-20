from __future__ import annotations

import importlib.util
import json
from pathlib import Path
import unittest

from backend.scene.open3dhk_coverage import (
    OPEN3DHK_COVERAGE_PATH,
    is_open3dhk_download_base_url,
    open3dhk_tile_is_downloadable,
)


PROJECT_ROOT = Path(__file__).resolve().parents[1]
SCRIPT_PATH = PROJECT_ROOT / "scripts" / "update_open3dhk_tile_coverage.py"


def load_refresh_script():
    spec = importlib.util.spec_from_file_location("update_open3dhk_tile_coverage", SCRIPT_PATH)
    module = importlib.util.module_from_spec(spec)
    assert spec and spec.loader
    spec.loader.exec_module(module)
    return module


class Open3dHkCoverageTests(unittest.TestCase):
    def test_bundled_coverage_has_expected_tile_membership(self) -> None:
        payload = json.loads(OPEN3DHK_COVERAGE_PATH.read_text(encoding="utf-8"))
        tile_ids = {tile["id"] for tile in payload["tiles"]}

        self.assertEqual(payload["tile_count"], len(payload["tiles"]))
        self.assertIn("11_SW_7A", tile_ids)
        self.assertNotIn("1_NW_1A", tile_ids)
        self.assertTrue(open3dhk_tile_is_downloadable("11_SW_7A"))
        self.assertFalse(open3dhk_tile_is_downloadable("1_NW_1A"))

    def test_refresh_script_normalizes_and_sorts_tile_ids(self) -> None:
        script = load_refresh_script()

        self.assertEqual(script.normalize_tile_name("11-SW-7A"), ("11_SW_7A", "11-SW-7A"))
        tiles = [{"id": "11_SW_8A"}, {"id": "1_SE_19D"}, {"id": "11_SW_7B"}]
        sorted_ids = [tile["id"] for tile in sorted(tiles, key=script.tile_sort_key)]
        self.assertEqual(sorted_ids, ["1_SE_19D", "11_SW_7B", "11_SW_8A"])

    def test_open3dhk_download_url_detection_is_limited_to_official_3d_zip(self) -> None:
        self.assertTrue(is_open3dhk_download_base_url("https://data11.map.gov.hk/api/3d-zip"))
        self.assertTrue(is_open3dhk_download_base_url("https://download.map.gov.hk/api/3d-zip/"))
        self.assertFalse(is_open3dhk_download_base_url("https://example.test/api/3d-zip"))
        self.assertFalse(is_open3dhk_download_base_url("https://data11.map.gov.hk/api/other"))


if __name__ == "__main__":
    unittest.main()
