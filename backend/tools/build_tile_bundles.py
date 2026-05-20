from __future__ import annotations

import argparse

from backend import config
from backend.scene.incremental_tiles import normalize_tile_id
from backend.scene.tile_bundles import build_all_tile_bundles
from backend.scene.xml_catalog import load_scene_manifest


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Build cached GLB render bundles for OpenAirTwin.")
    parser.add_argument("--force", action="store_true", help="Rebuild bundles even if cache files are fresh.")
    parser.add_argument(
        "--compress",
        action="store_true",
        help="Pre-compress selected fresh bundles as .glb.gz files without forcing a GLB rebuild.",
    )
    parser.add_argument("--tile", action="append", default=[], help="Restrict build to one or more tile ids.")
    parser.add_argument("--bundle-id", action="append", default=[], help="Restrict build to one or more bundle ids.")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    tile_ids = set()
    for tile_id in args.tile:
        try:
            tile_ids.add(normalize_tile_id(tile_id).internal)
        except ValueError:
            tile_ids.add(tile_id)
    manifest = load_scene_manifest(config.SCENE_ROOT)
    results = build_all_tile_bundles(
        config.SCENE_ROOT,
        manifest.bundles,
        tile_ids=tile_ids or None,
        bundle_ids=set(args.bundle_id) or None,
        force=args.force,
        compress_existing=args.compress,
    )

    if not results:
        print("No tile bundles selected.")
        return

    built_count = 0
    compressed_count = 0
    for result in results:
        state = "built" if result.built else "fresh"
        built_count += int(result.built)
        compressed_count += int(result.compressed)
        compressed_label = (
            f"  gzip {result.compressed_size_bytes:9d} bytes"
            if result.compressed_size_bytes is not None
            else "  gzip unavailable"
        )
        print(
            f"{state:5s}  {result.bundle.bundle_id:40s}  "
            f"{result.bundle.mesh_count:4d} meshes  "
            f"{result.vertex_count:9d} vertices  {result.face_count:9d} faces"
            f"{compressed_label}"
        )

    print(
        f"Processed {len(results)} bundles, rebuilt {built_count}, compressed {compressed_count}. "
        f"GLB cache root: {config.BUNDLE_ROOT}"
    )


if __name__ == "__main__":
    main()
