from __future__ import annotations

from http.server import ThreadingHTTPServer
import json
from pathlib import Path
from types import SimpleNamespace
import tempfile
import threading
import unittest
import urllib.error
import urllib.request

from backend import config
from backend.jobs.radiomap_jobs import RadiomapQueueFull
from backend.server import RequestHandler, resolve_under


class QueueFullJobManager:
    def create_job(self, _payload):
        raise RadiomapQueueFull(8)


class ServerHardeningTests(unittest.TestCase):
    def run_server(self, app_state):
        server = ThreadingHTTPServer(("127.0.0.1", 0), RequestHandler)
        server.app_state = app_state  # type: ignore[attr-defined]
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        return server, thread

    def test_resolve_under_rejects_prefix_sibling_paths(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            root = Path(tmp_dir) / "static"
            evil = Path(tmp_dir) / "static_evil" / "secret.txt"
            root.mkdir()
            evil.parent.mkdir()
            evil.write_text("secret", encoding="utf-8")

            self.assertIsNone(resolve_under(root, "../static_evil/secret.txt"))

    def test_static_endpoint_rejects_encoded_traversal_to_prefix_sibling(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            previous_static_root = config.STATIC_ROOT
            static_root = Path(tmp_dir) / "static"
            evil_path = Path(tmp_dir) / "static_evil" / "secret.txt"
            static_root.mkdir()
            evil_path.parent.mkdir()
            evil_path.write_text("secret", encoding="utf-8")
            config.STATIC_ROOT = static_root

            server, thread = self.run_server(SimpleNamespace())
            try:
                host, port = server.server_address
                url = f"http://{host}:{port}/js/%2e%2e/static_evil/secret.txt"
                with self.assertRaises(urllib.error.HTTPError) as error:
                    urllib.request.urlopen(url)
                self.assertEqual(error.exception.code, 404)
            finally:
                server.shutdown()
                thread.join(timeout=2)
                server.server_close()
                config.STATIC_ROOT = previous_static_root

    def test_mesh_endpoint_rejects_prefix_sibling_paths(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            previous_scene_root = config.SCENE_ROOT
            scene_root = Path(tmp_dir) / "scene"
            evil_path = Path(tmp_dir) / "scene_evil" / "secret.ply"
            scene_root.mkdir()
            evil_path.parent.mkdir()
            evil_path.write_bytes(b"secret")
            config.SCENE_ROOT = scene_root

            server, thread = self.run_server(
                SimpleNamespace(
                    manifest_lookup={
                        "mesh": SimpleNamespace(relative_path="../scene_evil/secret.ply"),
                    }
                )
            )
            try:
                host, port = server.server_address
                url = f"http://{host}:{port}/api/scene/mesh/mesh"
                with self.assertRaises(urllib.error.HTTPError) as error:
                    urllib.request.urlopen(url)
                self.assertEqual(error.exception.code, 404)
            finally:
                server.shutdown()
                thread.join(timeout=2)
                server.server_close()
                config.SCENE_ROOT = previous_scene_root

    def test_radiomap_queue_full_returns_429(self) -> None:
        server, thread = self.run_server(
            SimpleNamespace(
                job_manager=QueueFullJobManager(),
            )
        )
        try:
            host, port = server.server_address
            request = urllib.request.Request(
                f"http://{host}:{port}/api/radiomap/jobs",
                data=b"{}",
                headers={"Content-Type": "application/json"},
                method="POST",
            )
            with self.assertRaises(urllib.error.HTTPError) as error:
                urllib.request.urlopen(request)
            self.assertEqual(error.exception.code, 429)
            payload = json.loads(error.exception.read().decode("utf-8"))
            self.assertFalse(payload["ok"])
            self.assertEqual(payload["max_pending_jobs"], 8)
        finally:
            server.shutdown()
            thread.join(timeout=2)
            server.server_close()


if __name__ == "__main__":
    unittest.main()
