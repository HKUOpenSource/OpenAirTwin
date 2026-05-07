from __future__ import annotations

from contextlib import redirect_stderr
from http.server import ThreadingHTTPServer
import io
import json
from pathlib import Path
from types import SimpleNamespace
import tempfile
import threading
import unittest
import urllib.error
import urllib.request
from unittest.mock import patch

from backend import config
from backend.jobs.mobility_jobs import MobilityQueueFull
from backend.jobs.radiomap_jobs import RadiomapQueueFull
from backend.server import RequestHandler, resolve_under


class QueueFullJobManager:
    def create_job(self, _payload):
        raise RadiomapQueueFull(8)


class QueueFullMobilityJobManager:
    def create_job(self, _payload):
        raise MobilityQueueFull(4)


class FakeMobilityJobManager:
    def __init__(self) -> None:
        self.job = SimpleNamespace(
            job_id="mob_test",
            status="succeeded",
            progress=1.0,
            message="Mobility result ready",
            result={
                "ok": True,
                "summary": {"step_count": 1},
                "series": {"time_s": [0.0]},
                "samples": [{"step_index": 0, "paths": []}],
            },
            error=None,
            to_status_dict=lambda: {
                "job_id": "mob_test",
                "status": "succeeded",
                "progress": 1.0,
                "message": "Mobility result ready",
            },
        )

    def create_job(self, _payload):
        return self.job

    def get_job(self, job_id):
        return self.job if job_id == self.job.job_id else None


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

    def test_mobility_queue_full_returns_429(self) -> None:
        server, thread = self.run_server(
            SimpleNamespace(
                mobility_job_manager=QueueFullMobilityJobManager(),
            )
        )
        try:
            host, port = server.server_address
            request = urllib.request.Request(
                f"http://{host}:{port}/api/mobility/jobs",
                data=b"{}",
                headers={"Content-Type": "application/json"},
                method="POST",
            )
            with self.assertRaises(urllib.error.HTTPError) as error:
                urllib.request.urlopen(request)
            self.assertEqual(error.exception.code, 429)
            payload = json.loads(error.exception.read().decode("utf-8"))
            self.assertFalse(payload["ok"])
            self.assertEqual(payload["max_pending_jobs"], 4)
        finally:
            server.shutdown()
            thread.join(timeout=2)
            server.server_close()

    def test_mobility_job_routes_return_status_and_result(self) -> None:
        manager = FakeMobilityJobManager()
        server, thread = self.run_server(SimpleNamespace(mobility_job_manager=manager))
        try:
            host, port = server.server_address
            request = urllib.request.Request(
                f"http://{host}:{port}/api/mobility/jobs",
                data=b"{}",
                headers={"Content-Type": "application/json"},
                method="POST",
            )
            created = json.loads(urllib.request.urlopen(request).read().decode("utf-8"))
            self.assertTrue(created["ok"])
            self.assertEqual(created["job_id"], "mob_test")

            status = json.loads(urllib.request.urlopen(f"http://{host}:{port}/api/mobility/jobs/mob_test").read())
            self.assertEqual(status["status"], "succeeded")
            result = json.loads(urllib.request.urlopen(f"http://{host}:{port}/api/mobility/jobs/mob_test/result").read())
            self.assertEqual(result["summary"]["step_count"], 1)
            self.assertEqual(result["samples"][0]["step_index"], 0)
        finally:
            server.shutdown()
            thread.join(timeout=2)
            server.server_close()

    def test_rt_capabilities_endpoint_returns_antenna_arrays(self) -> None:
        capabilities = {
            "antenna_arrays": {
                "defaults": {
                    "num_rows": 1,
                    "num_cols": 1,
                    "vertical_spacing": 0.5,
                    "horizontal_spacing": 0.5,
                    "pattern": "iso",
                    "polarization": "V",
                },
                "limits": {
                    "num_rows": {"min": 1, "max": 16},
                    "num_cols": {"min": 1, "max": 16},
                    "element_count": {"max": 256},
                    "vertical_spacing": {"min": 0.01, "max": 10.0},
                    "horizontal_spacing": {"min": 0.01, "max": 10.0},
                },
                "patterns": ["iso"],
                "polarizations": ["V"],
            }
        }
        server, thread = self.run_server(SimpleNamespace())
        try:
            host, port = server.server_address
            url = f"http://{host}:{port}/api/rt/capabilities"
            with patch("backend.server.antenna_array_capabilities", return_value=capabilities):
                payload = json.loads(urllib.request.urlopen(url).read().decode("utf-8"))
            self.assertTrue(payload["ok"])
            self.assertEqual(payload["antenna_arrays"]["defaults"]["pattern"], "iso")
            self.assertEqual(payload["antenna_arrays"]["limits"]["element_count"]["max"], 256)
        finally:
            server.shutdown()
            thread.join(timeout=2)
            server.server_close()

    def test_bundle_build_failure_returns_json_500(self) -> None:
        bundle = SimpleNamespace(bundle_id="T__BUILDING__itu_concrete")
        server, thread = self.run_server(
            SimpleNamespace(
                manifest=SimpleNamespace(bundle_lookup={bundle.bundle_id: bundle}),
                manifest_lookup={},
                job_manager=None,
            )
        )
        try:
            host, port = server.server_address
            url = f"http://{host}:{port}/api/scene/bundle/{bundle.bundle_id}"
            with patch("backend.server.ensure_tile_bundle", side_effect=RuntimeError("build exploded")):
                stderr = io.StringIO()
                with redirect_stderr(stderr):
                    with self.assertRaises(urllib.error.HTTPError) as error:
                        urllib.request.urlopen(url)
            self.assertEqual(error.exception.code, 500)
            payload = json.loads(error.exception.read().decode("utf-8"))
            self.assertFalse(payload["ok"])
            self.assertEqual(payload["error"], "Internal server error")
            self.assertIn("Traceback", stderr.getvalue())
        finally:
            server.shutdown()
            thread.join(timeout=2)
            server.server_close()


if __name__ == "__main__":
    unittest.main()
