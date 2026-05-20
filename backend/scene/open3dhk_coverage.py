from __future__ import annotations

from functools import lru_cache
import json
from pathlib import Path
from urllib.parse import urlparse

from backend import config


OPEN3DHK_COVERAGE_PATH = config.STATIC_ROOT / "assets" / "open3dhk_tile_coverage.json"


@lru_cache(maxsize=1)
def open3dhk_downloadable_tile_ids(path: str | None = None) -> frozenset[str]:
    coverage_path = Path(path) if path else OPEN3DHK_COVERAGE_PATH
    payload = json.loads(coverage_path.read_text(encoding="utf-8"))
    return frozenset(str(tile["id"]) for tile in payload.get("tiles") or [] if tile.get("id"))


def is_open3dhk_download_base_url(base_url: str) -> bool:
    parsed = urlparse(str(base_url))
    host = parsed.hostname or ""
    path = parsed.path.rstrip("/")
    return host.endswith("map.gov.hk") and path.endswith("/api/3d-zip")


def open3dhk_tile_is_downloadable(tile_id: str) -> bool:
    return str(tile_id) in open3dhk_downloadable_tile_ids()
