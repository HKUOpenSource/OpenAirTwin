from __future__ import annotations

import gzip
from http.server import ThreadingHTTPServer
import os
from pathlib import Path
import struct
from types import SimpleNamespace
import tempfile
import threading
import unittest
import urllib.error
import urllib.request

import numpy as np

from backend import config
from backend.scene.tile_bundles import (
    TileBundleRecord,
    _build_glb_blob,
    _read_source_mesh,
    _read_source_ply_header,
    build_tile_bundle_records,
    compressed_tile_bundle_is_fresh,
    compressed_tile_bundle_path,
    ensure_compressed_tile_bundle,
)
from backend.server import RequestHandler


class BundleAccelerationTests(unittest.TestCase):
    def _write_binary_ply(self, path: Path, indices: tuple[int, int, int]) -> None:
        header = (
            "ply\n"
            "format binary_little_endian 1.0\n"
            "element vertex 3\n"
            "property float x\n"
            "property float y\n"
            "property float z\n"
            "element face 1\n"
            "property list uchar int vertex_indices\n"
            "end_header\n"
        ).encode("ascii")
        vertices = struct.pack("<fffffffff", 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0, 0.0)
        face = struct.pack("<Biii", 3, *indices)
        path.write_bytes(header + vertices + face)

    def test_bundle_record_sanitizes_path_components(self) -> None:
        mesh = SimpleNamespace(
            tile="T",
            category="BUILDING",
            bsdf_id="../escape",
            relative_path="meshes/T/a.ply",
        )

        [record] = build_tile_bundle_records([mesh])

        self.assertTrue(record.relative_path.startswith("cache/render_bundles/T/"))
        self.assertNotIn("..", Path(record.relative_path).parts)
        self.assertNotIn("/", Path(record.relative_path).name)

    def test_bundle_cache_key_tracks_source_mesh_fingerprint(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            scene_root = Path(tmp_dir)
            source_path = scene_root / "meshes/T/BUILDING/a.ply"
            source_path.parent.mkdir(parents=True, exist_ok=True)
            self._write_binary_ply(source_path, (0, 1, 2))
            mesh = SimpleNamespace(
                tile="T",
                category="BUILDING",
                bsdf_id="itu_concrete",
                relative_path="meshes/T/BUILDING/a.ply",
            )
            bundle_path = scene_root / "cache/render_bundles/T/BUILDING__itu_concrete.glb"
            bundle_path.parent.mkdir(parents=True, exist_ok=True)
            bundle_path.write_bytes(b"old bundle")

            first_key = build_tile_bundle_records([mesh], scene_root)[0].cache_key
            next_mtime_ns = source_path.stat().st_mtime_ns + 1_000_000_000
            os.utime(source_path, ns=(next_mtime_ns, next_mtime_ns))
            second_key = build_tile_bundle_records([mesh], scene_root)[0].cache_key

            self.assertTrue(first_key.startswith("src-"))
            self.assertNotEqual(first_key, second_key)

    def test_ply_reader_rejects_negative_and_out_of_range_indices(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            root = Path(tmp_dir)
            for filename, indices in {
                "negative.ply": (-1, 0, 1),
                "too_large.ply": (0, 1, 3),
            }.items():
                path = root / filename
                self._write_binary_ply(path, indices)
                header = _read_source_ply_header(path)
                with self.subTest(filename=filename):
                    with self.assertRaisesRegex(ValueError, "Face index out of bounds"):
                        _read_source_mesh(path, header)

    def test_compressed_bundle_round_trip_and_freshness(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            bundle_path = Path(tmp_dir) / "sample.glb"
            bundle_path.write_bytes(b"first payload")

            compressed_path, built = ensure_compressed_tile_bundle(bundle_path)
            self.assertTrue(built)
            self.assertEqual(compressed_path, compressed_tile_bundle_path(bundle_path))
            self.assertTrue(compressed_tile_bundle_is_fresh(bundle_path, compressed_path))
            with gzip.open(compressed_path, "rb") as handle:
                self.assertEqual(handle.read(), b"first payload")

            next_mtime_ns = compressed_path.stat().st_mtime_ns + 1_000_000_000
            bundle_path.write_bytes(b"second payload")
            os.utime(bundle_path, ns=(next_mtime_ns, next_mtime_ns))
            self.assertFalse(compressed_tile_bundle_is_fresh(bundle_path, compressed_path))

            _, rebuilt = ensure_compressed_tile_bundle(bundle_path)
            self.assertTrue(rebuilt)
            with gzip.open(compressed_path, "rb") as handle:
                self.assertEqual(handle.read(), b"second payload")

    def test_bundle_endpoint_serves_gzip_and_304(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            scene_root = Path(tmp_dir)
            bundle = TileBundleRecord(
                bundle_id="T__BUILDING__itu_concrete",
                relative_path="cache/render_bundles/T/BUILDING__itu_concrete.glb",
                tile="T",
                category="BUILDING",
                bsdf_id="itu_concrete",
                mesh_count=1,
                source_relative_paths=(),
            )
            bundle_path = scene_root / bundle.relative_path
            bundle_path.parent.mkdir(parents=True, exist_ok=True)
            raw_bytes = _build_glb_blob(
                bundle,
                vertices=np.asarray([[0, 0, 0], [1, 0, 0], [0, 1, 0]], dtype=np.float32),
                normals=np.asarray([[0, 0, 1], [0, 0, 1], [0, 0, 1]], dtype=np.float32),
                triangles=np.asarray([[0, 1, 2]], dtype=np.uint32),
            )
            bundle_path.write_bytes(raw_bytes)
            ensure_compressed_tile_bundle(bundle_path)

            previous_scene_root = config.SCENE_ROOT
            config.SCENE_ROOT = scene_root
            server = ThreadingHTTPServer(("127.0.0.1", 0), RequestHandler)
            server.app_state = SimpleNamespace(  # type: ignore[attr-defined]
                manifest=SimpleNamespace(bundle_lookup={bundle.bundle_id: bundle}),
                manifest_lookup={},
                job_manager=None,
            )
            thread = threading.Thread(target=server.serve_forever, daemon=True)
            thread.start()
            try:
                host, port = server.server_address
                url = f"http://{host}:{port}/api/scene/bundle/{bundle.bundle_id}?v=test"
                request = urllib.request.Request(url, headers={"Accept-Encoding": "gzip"})
                with urllib.request.urlopen(request) as response:
                    body = response.read()
                    etag = response.headers["ETag"]
                    self.assertEqual(response.headers["Content-Encoding"], "gzip")
                    self.assertEqual(response.headers["Cache-Control"], "public, max-age=31536000, immutable")
                    self.assertEqual(response.headers["Vary"], "Accept-Encoding")
                    self.assertEqual(int(response.headers["X-Original-Content-Length"]), len(raw_bytes))
                    self.assertGreater(int(response.headers["X-Compressed-Content-Length"]), 0)
                    self.assertEqual(gzip.decompress(body), raw_bytes)

                cached_request = urllib.request.Request(
                    url,
                    headers={"Accept-Encoding": "gzip", "If-None-Match": etag},
                )
                with self.assertRaises(urllib.error.HTTPError) as error:
                    urllib.request.urlopen(cached_request)
                self.assertEqual(error.exception.code, 304)
            finally:
                server.shutdown()
                thread.join(timeout=2)
                server.server_close()
                config.SCENE_ROOT = previous_scene_root


if __name__ == "__main__":
    unittest.main()
