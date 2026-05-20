from __future__ import annotations

import json
import unittest

from backend.scene.open3dhk_coverage import (
    OPEN3DHK_COVERAGE_PATH,
    is_open3dhk_download_base_url,
    open3dhk_tile_is_downloadable,
)


class Open3dHkCoverageTests(unittest.TestCase):
    def test_bundled_coverage_has_expected_tile_membership(self) -> None:
        payload = json.loads(OPEN3DHK_COVERAGE_PATH.read_text(encoding="utf-8"))
        tile_ids = {tile["id"] for tile in payload["tiles"]}

        self.assertEqual(payload["tile_count"], len(payload["tiles"]))
        self.assertIn("11_SW_7A", tile_ids)
        self.assertNotIn("1_NW_1A", tile_ids)
        self.assertTrue(open3dhk_tile_is_downloadable("11_SW_7A"))
        self.assertFalse(open3dhk_tile_is_downloadable("1_NW_1A"))

    def test_open3dhk_download_url_detection_is_limited_to_official_3d_zip(self) -> None:
        self.assertTrue(is_open3dhk_download_base_url("https://data11.map.gov.hk/api/3d-zip"))
        self.assertTrue(is_open3dhk_download_base_url("https://download.map.gov.hk/api/3d-zip/"))
        self.assertFalse(is_open3dhk_download_base_url("https://example.test/api/3d-zip"))
        self.assertFalse(is_open3dhk_download_base_url("https://data11.map.gov.hk/api/other"))


if __name__ == "__main__":
    unittest.main()
