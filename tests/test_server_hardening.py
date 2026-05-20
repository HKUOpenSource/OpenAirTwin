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
import zipfile
from unittest.mock import patch

from backend import config
from backend.jobs.deepmimo_jobs import DeepMIMOQueueFull
from backend.jobs.mobility_jobs import MobilityQueueFull
from backend.jobs.radiomap_jobs import RadiomapQueueFull
from backend.jobs.tile_download_jobs import TileDownloadBusy
from backend.rt.runtime import SceneNotReady
from backend.server import AppState, RequestHandler, resolve_under


class QueueFullJobManager:
    def create_job(self, _payload, **_kwargs):
        raise RadiomapQueueFull(8)


class QueueFullMobilityJobManager:
    def create_job(self, _payload, **_kwargs):
        raise MobilityQueueFull(4)


class QueueFullDeepMIMOJobManager:
    def create_job(self, _payload):
        raise DeepMIMOQueueFull(2)


class BusyTileDownloadJobManager:
    def create_job(self, _tile_id):
        raise TileDownloadBusy("tile_active", "11_SW_7A")


class FakeMobilityJobManager:
    def __init__(self) -> None:
        self.last_scene_generation = None
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

    def create_job(self, _payload, *, scene_generation=None):
        self.last_scene_generation = scene_generation
        return self.job

    def get_job(self, job_id):
        return self.job if job_id == self.job.job_id else None


class FakeDeepMIMOJobManager:
    def __init__(self, download_path: Path | None = None) -> None:
        self.last_payload = None
        self.download_path = download_path
        self.job = SimpleNamespace(
            job_id="dm_test",
            status="succeeded",
            progress=1.0,
            message="DeepMIMO dataset ready",
            result={"archive_name": "dataset.zip"},
            error=None,
            to_status_dict=lambda: {
                "job_id": "dm_test",
                "status": "succeeded",
                "progress": 1.0,
                "message": "DeepMIMO dataset ready",
                "result": {"archive_name": "dataset.zip"},
            },
        )

    def create_job(self, payload):
        self.last_payload = payload
        return self.job

    def get_job(self, job_id):
        return self.job if job_id == self.job.job_id else None

    def get_download_path(self, job_id):
        if job_id != self.job.job_id:
            return None
        return self.download_path


class FakeReadyRuntime:
    active_tile_ids = ("TILE_A",)

    def status_dict(self):
        return {
            "ok": True,
            "status": "ready",
            "active_tile_ids": ["TILE_A"],
            "requested_tile_ids": ["TILE_A"],
            "generation": 1,
            "message": "Sionna RT scene ready",
            "preload_seconds": 0.01,
        }

    def request_scene_selection(self, tile_ids):
        return {
            **self.status_dict(),
            "requested_tile_ids": list(tile_ids),
            "status": "loading",
            "generation": 2,
        }

    def require_ready(self):
        return object()


class FakeSceneSelectionRuntime(FakeReadyRuntime):
    def __init__(self) -> None:
        self.tile_ids = []

    def status_dict(self):
        return {
            "ok": True,
            "status": "empty",
            "active_tile_ids": [],
            "requested_tile_ids": self.tile_ids,
            "generation": 0,
            "message": "No Sionna RT tiles selected",
            "preload_seconds": None,
        }

    def request_scene_selection(self, tile_ids):
        if tile_ids == ["BAD_TILE"]:
            raise ValueError("Unknown tile id: BAD_TILE")
        self.tile_ids = list(tile_ids)
        return {
            **self.status_dict(),
            "status": "loading",
            "generation": 1,
        }

    def require_ready(self):
        raise SceneNotReady("loading", "Sionna scene is still loading")


class ServerHardeningTests(unittest.TestCase):
    def run_server(self, app_state):
        if not hasattr(app_state, "rt_runtime"):
            app_state.rt_runtime = FakeReadyRuntime()
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

    def test_app_state_bootstraps_empty_scene_root(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            root = Path(tmp_dir)
            scene_root = root / "scene"
            previous = {
                "SCENE_ROOT": config.SCENE_ROOT,
                "MESH_ROOT": config.MESH_ROOT,
                "BUNDLE_ROOT": config.BUNDLE_ROOT,
                "GENERATED_ROOT": config.GENERATED_ROOT,
                "INCREMENTAL_TILE_ROOT": config.INCREMENTAL_TILE_ROOT,
                "INCREMENTAL_TILE_STAGE_ROOT": config.INCREMENTAL_TILE_STAGE_ROOT,
            }
            config.SCENE_ROOT = scene_root
            config.MESH_ROOT = scene_root / "meshes"
            config.BUNDLE_ROOT = scene_root / "cache" / "render_bundles"
            config.GENERATED_ROOT = root / "generated"
            config.INCREMENTAL_TILE_ROOT = config.GENERATED_ROOT / "incremental_tiles"
            config.INCREMENTAL_TILE_STAGE_ROOT = scene_root / "cache" / "incremental_tile_stage"
            try:
                app_state = AppState()
            finally:
                for name, value in previous.items():
                    setattr(config, name, value)

            manifest = app_state.manifest.to_api_dict()
            self.assertTrue((scene_root / "common" / "scene_common.xml").exists())
            self.assertTrue((scene_root / "tiles").is_dir())
            self.assertEqual(manifest["mesh_count"], 0)
            self.assertEqual(manifest["tiles"], [])
            self.assertEqual(manifest["bundles"], [])

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

    def test_deepmimo_queue_full_returns_429(self) -> None:
        server, thread = self.run_server(
            SimpleNamespace(
                deepmimo_job_manager=QueueFullDeepMIMOJobManager(),
            )
        )
        try:
            host, port = server.server_address
            request = urllib.request.Request(
                f"http://{host}:{port}/api/deepmimo/jobs",
                data=b"{}",
                headers={"Content-Type": "application/json"},
                method="POST",
            )
            with self.assertRaises(urllib.error.HTTPError) as error:
                urllib.request.urlopen(request)
            self.assertEqual(error.exception.code, 429)
            payload = json.loads(error.exception.read().decode("utf-8"))
            self.assertFalse(payload["ok"])
            self.assertEqual(payload["max_pending_jobs"], 2)
        finally:
            server.shutdown()
            thread.join(timeout=2)
            server.server_close()

    def test_tile_download_busy_returns_409(self) -> None:
        server, thread = self.run_server(
            SimpleNamespace(
                tile_download_job_manager=BusyTileDownloadJobManager(),
            )
        )
        try:
            host, port = server.server_address
            request = urllib.request.Request(
                f"http://{host}:{port}/api/scene/tile-downloads",
                data=json.dumps({"tile_id": "11_SW_7B"}).encode("utf-8"),
                headers={"Content-Type": "application/json"},
                method="POST",
            )
            with self.assertRaises(urllib.error.HTTPError) as error:
                urllib.request.urlopen(request)
            self.assertEqual(error.exception.code, 409)
            payload = json.loads(error.exception.read().decode("utf-8"))
            self.assertFalse(payload["ok"])
            self.assertEqual(payload["active_job_id"], "tile_active")
            self.assertEqual(payload["active_tile_id"], "11_SW_7A")
            self.assertIn("11_SW_7A", payload["error"])
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
            self.assertEqual(manager.last_scene_generation, 1)

            status = json.loads(urllib.request.urlopen(f"http://{host}:{port}/api/mobility/jobs/mob_test").read())
            self.assertEqual(status["status"], "succeeded")
            result = json.loads(urllib.request.urlopen(f"http://{host}:{port}/api/mobility/jobs/mob_test/result").read())
            self.assertEqual(result["summary"]["step_count"], 1)
            self.assertEqual(result["samples"][0]["step_index"], 0)
        finally:
            server.shutdown()
            thread.join(timeout=2)
            server.server_close()

    def test_radiomap_create_passes_rt_scene_generation_to_job_manager(self) -> None:
        manager = FakeMobilityJobManager()
        server, thread = self.run_server(SimpleNamespace(job_manager=manager))
        try:
            host, port = server.server_address
            request = urllib.request.Request(
                f"http://{host}:{port}/api/radiomap/jobs",
                data=b"{}",
                headers={"Content-Type": "application/json"},
                method="POST",
            )
            created = json.loads(urllib.request.urlopen(request).read().decode("utf-8"))
            self.assertTrue(created["ok"])
            self.assertEqual(created["job_id"], "mob_test")
            self.assertEqual(manager.last_scene_generation, 1)
        finally:
            server.shutdown()
            thread.join(timeout=2)
            server.server_close()

    def test_deepmimo_job_routes_return_status_and_download_conflict(self) -> None:
        manager = FakeDeepMIMOJobManager()
        server, thread = self.run_server(SimpleNamespace(deepmimo_job_manager=manager))
        try:
            host, port = server.server_address
            request = urllib.request.Request(
                f"http://{host}:{port}/api/deepmimo/jobs",
                data=b"{}",
                headers={"Content-Type": "application/json"},
                method="POST",
            )
            created = json.loads(urllib.request.urlopen(request).read().decode("utf-8"))
            self.assertTrue(created["ok"])
            self.assertEqual(created["job_id"], "dm_test")
            self.assertEqual(manager.last_payload["scene"]["tile_ids"], ["TILE_A"])

            status = json.loads(urllib.request.urlopen(f"http://{host}:{port}/api/deepmimo/jobs/dm_test").read())
            self.assertEqual(status["status"], "succeeded")
            self.assertEqual(status["result"]["archive_name"], "dataset.zip")
            with self.assertRaises(urllib.error.HTTPError) as error:
                urllib.request.urlopen(f"http://{host}:{port}/api/deepmimo/jobs/dm_test/download")
            self.assertEqual(error.exception.code, 404)
        finally:
            server.shutdown()
            thread.join(timeout=2)
            server.server_close()

    def test_deepmimo_download_stream_returns_complete_zip_and_closes(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            archive = Path(tmp_dir) / "dataset.zip"
            with zipfile.ZipFile(archive, "w") as dataset:
                dataset.writestr("hello.txt", "hello world")

            manager = FakeDeepMIMOJobManager(download_path=archive)
            server, thread = self.run_server(SimpleNamespace(deepmimo_job_manager=manager))
            try:
                host, port = server.server_address
                with urllib.request.urlopen(
                    f"http://{host}:{port}/api/deepmimo/jobs/dm_test/download"
                ) as response:
                    body = response.read()
                    headers = response.headers

                self.assertEqual(len(body), archive.stat().st_size)
                self.assertEqual(int(headers["Content-Length"]), archive.stat().st_size)
                self.assertEqual(headers["Content-Type"], "application/zip")
                self.assertEqual(headers["Content-Disposition"], 'attachment; filename="deepmimo_dm_test.zip"')
                self.assertEqual(headers["Accept-Ranges"], "bytes")
                self.assertEqual(headers["Connection"].lower(), "close")
                with zipfile.ZipFile(io.BytesIO(body)) as dataset:
                    self.assertEqual(dataset.read("hello.txt"), b"hello world")
            finally:
                server.shutdown()
                thread.join(timeout=2)
                server.server_close()

    def test_deepmimo_download_supports_single_byte_ranges(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            archive = Path(tmp_dir) / "dataset.zip"
            with zipfile.ZipFile(archive, "w") as dataset:
                dataset.writestr("hello.txt", "hello world")
                dataset.writestr("data.bin", b"0123456789" * 8)
            archive_bytes = archive.read_bytes()

            manager = FakeDeepMIMOJobManager(download_path=archive)
            server, thread = self.run_server(SimpleNamespace(deepmimo_job_manager=manager))
            try:
                host, port = server.server_address
                url = f"http://{host}:{port}/api/deepmimo/jobs/dm_test/download"

                request = urllib.request.Request(url, headers={"Range": "bytes=0-0"})
                with urllib.request.urlopen(request) as response:
                    body = response.read()
                    self.assertEqual(response.status, 206)
                    self.assertEqual(response.headers["Content-Range"], f"bytes 0-0/{len(archive_bytes)}")
                    self.assertEqual(response.headers["Content-Length"], "1")
                    self.assertEqual(response.headers["Accept-Ranges"], "bytes")
                    self.assertEqual(response.headers["Connection"].lower(), "close")
                    self.assertEqual(body, archive_bytes[:1])

                request = urllib.request.Request(url, headers={"Range": "bytes=10-19"})
                with urllib.request.urlopen(request) as response:
                    body = response.read()
                    self.assertEqual(response.status, 206)
                    self.assertEqual(response.headers["Content-Range"], f"bytes 10-19/{len(archive_bytes)}")
                    self.assertEqual(response.headers["Content-Length"], "10")
                    self.assertEqual(body, archive_bytes[10:20])

                request = urllib.request.Request(url, headers={"Range": "bytes=-16"})
                with urllib.request.urlopen(request) as response:
                    body = response.read()
                    start = len(archive_bytes) - 16
                    self.assertEqual(response.status, 206)
                    self.assertEqual(response.headers["Content-Range"], f"bytes {start}-{len(archive_bytes) - 1}/{len(archive_bytes)}")
                    self.assertEqual(response.headers["Content-Length"], "16")
                    self.assertEqual(body, archive_bytes[-16:])

                request = urllib.request.Request(url, headers={"Range": f"bytes={len(archive_bytes)}-"})
                with self.assertRaises(urllib.error.HTTPError) as error:
                    urllib.request.urlopen(request)
                self.assertEqual(error.exception.code, 416)
                self.assertEqual(error.exception.headers["Content-Range"], f"bytes */{len(archive_bytes)}")
                self.assertEqual(error.exception.headers["Content-Length"], "0")
                self.assertEqual(error.exception.headers["Connection"].lower(), "close")
                self.assertEqual(error.exception.read(), b"")
            finally:
                server.shutdown()
                thread.join(timeout=2)
                server.server_close()

    def test_deepmimo_create_rejects_when_rt_scene_is_not_ready(self) -> None:
        server, thread = self.run_server(
            SimpleNamespace(
                rt_runtime=FakeSceneSelectionRuntime(),
                deepmimo_job_manager=FakeDeepMIMOJobManager(),
            )
        )
        try:
            host, port = server.server_address
            request = urllib.request.Request(
                f"http://{host}:{port}/api/deepmimo/jobs",
                data=b"{}",
                headers={"Content-Type": "application/json"},
                method="POST",
            )
            with self.assertRaises(urllib.error.HTTPError) as error:
                urllib.request.urlopen(request)
            self.assertEqual(error.exception.code, 409)
            payload = json.loads(error.exception.read().decode("utf-8"))
            self.assertFalse(payload["ok"])
            self.assertEqual(payload["status"], "loading")
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

    def test_rt_scene_selection_routes_return_status_and_validation_errors(self) -> None:
        runtime = FakeSceneSelectionRuntime()
        server, thread = self.run_server(SimpleNamespace(rt_runtime=runtime))
        try:
            host, port = server.server_address
            status = json.loads(urllib.request.urlopen(f"http://{host}:{port}/api/rt/scene-selection").read())
            self.assertEqual(status["status"], "empty")

            request = urllib.request.Request(
                f"http://{host}:{port}/api/rt/scene-selection",
                data=json.dumps({"tile_ids": ["TILE_A"]}).encode("utf-8"),
                headers={"Content-Type": "application/json"},
                method="POST",
            )
            created = json.loads(urllib.request.urlopen(request).read())
            self.assertEqual(created["status"], "loading")
            self.assertEqual(created["requested_tile_ids"], ["TILE_A"])

            bad_request = urllib.request.Request(
                f"http://{host}:{port}/api/rt/scene-selection",
                data=json.dumps({"tile_ids": ["BAD_TILE"]}).encode("utf-8"),
                headers={"Content-Type": "application/json"},
                method="POST",
            )
            with self.assertRaises(urllib.error.HTTPError) as error:
                urllib.request.urlopen(bad_request)
            self.assertEqual(error.exception.code, 400)
        finally:
            server.shutdown()
            thread.join(timeout=2)
            server.server_close()

    def test_radiomap_create_rejects_when_rt_scene_is_not_ready(self) -> None:
        server, thread = self.run_server(
            SimpleNamespace(
                rt_runtime=FakeSceneSelectionRuntime(),
                job_manager=FakeMobilityJobManager(),
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
            self.assertEqual(error.exception.code, 409)
            payload = json.loads(error.exception.read().decode("utf-8"))
            self.assertFalse(payload["ok"])
            self.assertEqual(payload["status"], "loading")
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
