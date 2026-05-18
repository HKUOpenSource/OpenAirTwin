from __future__ import annotations

from datetime import timezone
from email.utils import formatdate, parsedate_to_datetime
import json
import mimetypes
import os
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import sys
import traceback
from urllib.parse import parse_qs, unquote, urlparse

from backend import config
from backend.jobs.deepmimo_jobs import DeepMIMOJobManager, DeepMIMOQueueFull
from backend.jobs.mobility_jobs import MobilityJobManager, MobilityQueueFull
from backend.jobs.radiomap_jobs import RadiomapJobManager, RadiomapQueueFull
from backend.rt.common import antenna_array_capabilities
from backend.rt.runtime import RTRuntime, SceneNotReady, current_scene_generation
from backend.rt.solve_link import solve_link
from backend.scene.tile_bundles import (
    bundle_cache_key,
    compressed_tile_bundle_is_fresh,
    compressed_tile_bundle_path,
    ensure_tile_bundle,
)
from backend.scene.tile_scene_xml import TileSceneXmlBuilder
from backend.scene.xml_catalog import SceneManifest, load_scene_manifest


def resolve_under(root: Path, relative_path: str | Path) -> Path | None:
    root_path = root.resolve()
    candidate = (root_path / relative_path).resolve()
    try:
        candidate.relative_to(root_path)
    except ValueError:
        return None
    return candidate


class InvalidRangeHeader(ValueError):
    pass


def parse_single_byte_range(value: str | None, size: int) -> tuple[int, int] | None:
    if value is None:
        return None
    text = value.strip()
    if not text.startswith("bytes="):
        raise InvalidRangeHeader("Only byte ranges are supported")
    range_spec = text.removeprefix("bytes=").strip()
    if "," in range_spec:
        raise InvalidRangeHeader("Multiple ranges are not supported")

    start_text, separator, end_text = range_spec.partition("-")
    if separator != "-":
        raise InvalidRangeHeader("Invalid range syntax")
    start_text = start_text.strip()
    end_text = end_text.strip()
    if not start_text and not end_text:
        raise InvalidRangeHeader("Range must include a start or suffix length")
    if size <= 0:
        raise InvalidRangeHeader("Cannot range an empty file")

    if not start_text:
        if not end_text.isdigit():
            raise InvalidRangeHeader("Invalid suffix range")
        suffix_length = int(end_text)
        if suffix_length <= 0:
            raise InvalidRangeHeader("Suffix range must be positive")
        if suffix_length >= size:
            return (0, size - 1)
        return (size - suffix_length, size - 1)

    if not start_text.isdigit() or (end_text and not end_text.isdigit()):
        raise InvalidRangeHeader("Invalid byte range")
    start = int(start_text)
    end = int(end_text) if end_text else size - 1
    if start >= size or end < start:
        raise InvalidRangeHeader("Byte range is not satisfiable")
    return (start, min(end, size - 1))


class AppState:
    def __init__(self) -> None:
        self.manifest: SceneManifest = load_scene_manifest(config.SCENE_ROOT, config.SCENE_XML)
        self.manifest_lookup = self.manifest.mesh_lookup
        self.rt_scene_builder = TileSceneXmlBuilder(
            config.SCENE_ROOT,
            config.SCENE_XML,
            config.GENERATED_ROOT / "rt_scene_xml",
        )
        self.rt_runtime = RTRuntime(
            config.SCENE_XML,
            config.DEFAULT_FREQUENCY_HZ,
            self.rt_scene_builder,
        )
        self.job_manager = RadiomapJobManager(self.rt_runtime)
        self.mobility_job_manager = MobilityJobManager(self.rt_runtime)
        self.deepmimo_job_manager = DeepMIMOJobManager()


def capture_ready_scene_generation(rt_runtime) -> int | None:
    rt_lock = getattr(rt_runtime, "lock", None)
    if rt_lock is None:
        rt_runtime.require_ready()
        return current_scene_generation(rt_runtime)

    with rt_lock:
        rt_runtime.require_ready()
        return current_scene_generation(rt_runtime)


class RequestHandler(BaseHTTPRequestHandler):
    server_version = "HKU-RT/3.0"

    @property
    def app_state(self) -> AppState:
        return self.server.app_state  # type: ignore[attr-defined]

    def send_bytes(self, body: bytes, code: int = 200, content_type: str = "application/json; charset=utf-8") -> None:
        self.send_response(code)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def send_file(self, file_path: Path, *, content_type: str = "application/octet-stream") -> None:
        stat = file_path.stat()
        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(stat.st_size))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        with open(file_path, "rb") as handle:
            while True:
                chunk = handle.read(1024 * 1024)
                if not chunk:
                    break
                self.wfile.write(chunk)

    def send_download_file(self, file_path: Path, *, content_type: str, filename: str) -> None:
        self.close_connection = True
        with open(file_path, "rb") as handle:
            size = int(os.fstat(handle.fileno()).st_size)
            try:
                byte_range = parse_single_byte_range(self.headers.get("Range"), size)
            except InvalidRangeHeader:
                self.send_response(416)
                self.send_header("Content-Range", f"bytes */{size}")
                self.send_header("Content-Length", "0")
                self.send_header("Cache-Control", "no-store")
                self.send_header("Accept-Ranges", "bytes")
                self.send_header("Connection", "close")
                try:
                    self.end_headers()
                    self.wfile.flush()
                except (BrokenPipeError, ConnectionResetError):
                    return
                return

            if byte_range is None:
                status = 200
                start = 0
                end = size - 1
                content_length = size
            else:
                status = 206
                start, end = byte_range
                content_length = end - start + 1

            self.send_response(status)
            self.send_header("Content-Type", content_type)
            self.send_header("Content-Length", str(content_length))
            self.send_header("Cache-Control", "no-store")
            self.send_header("Content-Disposition", f'attachment; filename="{filename}"')
            self.send_header("Accept-Ranges", "bytes")
            self.send_header("Connection", "close")
            if byte_range is not None:
                self.send_header("Content-Range", f"bytes {start}-{end}/{size}")
            try:
                self.end_headers()
                handle.seek(start)
                remaining = content_length
                while remaining > 0:
                    chunk = handle.read(min(1024 * 1024, remaining))
                    if not chunk:
                        break
                    self.wfile.write(chunk)
                    remaining -= len(chunk)
                self.wfile.flush()
            except (BrokenPipeError, ConnectionResetError):
                return

    def send_bundle_file(self, raw_path: Path) -> None:
        raw_stat = raw_path.stat()
        gzip_path = compressed_tile_bundle_path(raw_path)
        use_gzip = self.accepts_content_encoding("gzip") and compressed_tile_bundle_is_fresh(raw_path, gzip_path)
        response_path = gzip_path if use_gzip else raw_path
        response_stat = response_path.stat()
        encoding = "gzip" if use_gzip else "identity"
        etag = f'"{bundle_cache_key(raw_path)}-{encoding}"'
        last_modified = formatdate(raw_stat.st_mtime, usegmt=True)
        cache_control = (
            "public, max-age=31536000, immutable"
            if "v" in parse_qs(urlparse(self.path).query)
            else "no-store"
        )

        if self.client_cache_is_fresh(etag, raw_stat.st_mtime):
            self.send_response(304)
            self.send_header("Cache-Control", cache_control)
            self.send_header("ETag", etag)
            self.send_header("Last-Modified", last_modified)
            self.send_header("Vary", "Accept-Encoding")
            self.end_headers()
            return

        self.send_response(200)
        self.send_header("Content-Type", "model/gltf-binary")
        self.send_header("Content-Length", str(response_stat.st_size))
        self.send_header("Cache-Control", cache_control)
        self.send_header("ETag", etag)
        self.send_header("Last-Modified", last_modified)
        self.send_header("Vary", "Accept-Encoding")
        self.send_header("X-Original-Content-Length", str(raw_stat.st_size))
        if use_gzip:
            self.send_header("Content-Encoding", "gzip")
            self.send_header("X-Compressed-Content-Length", str(response_stat.st_size))
        self.end_headers()
        with open(response_path, "rb") as handle:
            while True:
                chunk = handle.read(1024 * 1024)
                if not chunk:
                    break
                self.wfile.write(chunk)

    def accepts_content_encoding(self, encoding: str) -> bool:
        requested = self.headers.get("Accept-Encoding", "")
        for item in requested.split(","):
            token, *params = item.strip().split(";")
            token = token.strip().lower()
            if token not in (encoding.lower(), "*"):
                continue
            quality = 1.0
            for param in params:
                key, _, value = param.strip().partition("=")
                if key.lower() == "q":
                    try:
                        quality = float(value)
                    except ValueError:
                        quality = 0.0
            if quality > 0:
                return True
        return False

    def client_cache_is_fresh(self, etag: str, modified_time: float) -> bool:
        if_none_match = self.headers.get("If-None-Match")
        if if_none_match:
            candidates = [candidate.strip() for candidate in if_none_match.split(",")]
            if "*" in candidates or etag in candidates:
                return True

        if_modified_since = self.headers.get("If-Modified-Since")
        if not if_modified_since:
            return False
        try:
            since = parsedate_to_datetime(if_modified_since)
        except (TypeError, ValueError):
            return False
        if since.tzinfo is None:
            since = since.replace(tzinfo=timezone.utc)
        return int(since.timestamp()) >= int(modified_time)

    def send_json(self, payload: dict, code: int = 200) -> None:
        self.send_bytes(
            json.dumps(payload, ensure_ascii=False, allow_nan=False).encode("utf-8"),
            code=code,
        )

    def send_text(self, text: str, code: int = 200) -> None:
        self.send_bytes(text.encode("utf-8"), code=code, content_type="text/plain; charset=utf-8")

    def read_json_body(self) -> dict:
        length = int(self.headers.get("Content-Length", "0"))
        raw = self.rfile.read(length) if length > 0 else b"{}"
        return json.loads(raw.decode("utf-8"))

    def serve_static_file(self, relative_path: str) -> None:
        file_path = resolve_under(config.STATIC_ROOT, unquote(relative_path))
        if file_path is None or not file_path.exists():
            self.send_text("Not Found", code=404)
            return
        content_type, _ = mimetypes.guess_type(str(file_path))
        self.send_file(file_path, content_type=content_type or "application/octet-stream")

    def serve_mesh(self, mesh_id: str) -> None:
        mesh = self.app_state.manifest_lookup.get(mesh_id)
        if mesh is None:
            self.send_text("Unknown mesh id", code=404)
            return

        file_path = resolve_under(config.SCENE_ROOT, mesh.relative_path)
        if file_path is None or not file_path.exists():
            self.send_text("Mesh file missing", code=404)
            return
        self.send_file(file_path, content_type="application/octet-stream")

    def serve_bundle(self, bundle_id: str) -> None:
        bundle = self.app_state.manifest.bundle_lookup.get(bundle_id)
        if bundle is None:
            self.send_text("Unknown bundle id", code=404)
            return

        try:
            result = ensure_tile_bundle(config.SCENE_ROOT, bundle)
        except Exception as exc:
            traceback.print_exception(type(exc), exc, exc.__traceback__, file=sys.stderr)
            self.send_json({"ok": False, "error": "Internal server error"}, code=500)
            return
        self.send_bundle_file(result.bundle_path)

    def do_GET(self) -> None:
        path = urlparse(self.path).path

        if path in ("/", "/index.html"):
            self.serve_static_file("index.html")
            return

        if path.startswith("/assets/"):
            self.serve_static_file(path.removeprefix("/"))
            return
        if path.startswith("/lib/"):
            self.serve_static_file(path.removeprefix("/"))
            return
        if path.startswith("/js/"):
            self.serve_static_file(path.removeprefix("/"))
            return
        if path.startswith("/css/"):
            self.serve_static_file(path.removeprefix("/"))
            return

        if path == "/api/health":
            self.send_json(
                {
                    "ok": True,
                    "scene_xml": str(config.SCENE_XML),
                    "mesh_root": str(config.MESH_ROOT),
                }
            )
            return

        if path == "/api/rt/capabilities":
            self.send_json({"ok": True, **antenna_array_capabilities()})
            return

        if path == "/api/rt/scene-selection":
            self.send_json(self.app_state.rt_runtime.status_dict())
            return

        if path == "/api/scene/manifest":
            self.send_json(self.app_state.manifest.to_api_dict())
            return

        if path.startswith("/api/scene/mesh/"):
            mesh_id = unquote(path.removeprefix("/api/scene/mesh/"))
            self.serve_mesh(mesh_id)
            return

        if path.startswith("/api/scene/bundle/"):
            bundle_id = unquote(path.removeprefix("/api/scene/bundle/"))
            self.serve_bundle(bundle_id)
            return

        if path.startswith("/api/radiomap/jobs/"):
            suffix = path.removeprefix("/api/radiomap/jobs/")
            if suffix.endswith("/result"):
                job_id = suffix.removesuffix("/result")
                job = self.app_state.job_manager.get_job(job_id)
                if job is None:
                    self.send_text("Unknown job id", code=404)
                    return
                if job.status != "succeeded" or job.result is None:
                    self.send_json({"job_id": job_id, "status": job.status, "message": job.message}, code=409)
                    return
                self.send_json({"job_id": job_id, "status": job.status, **job.result})
                return

            job_id = suffix
            job = self.app_state.job_manager.get_job(job_id)
            if job is None:
                self.send_text("Unknown job id", code=404)
                return
            payload = job.to_status_dict()
            if job.status == "failed":
                payload["error"] = job.error
            self.send_json(payload)
            return

        if path.startswith("/api/mobility/jobs/"):
            suffix = path.removeprefix("/api/mobility/jobs/")
            if suffix.endswith("/result"):
                job_id = suffix.removesuffix("/result")
                job = self.app_state.mobility_job_manager.get_job(job_id)
                if job is None:
                    self.send_text("Unknown job id", code=404)
                    return
                if job.status != "succeeded" or job.result is None:
                    self.send_json({"job_id": job_id, "status": job.status, "message": job.message}, code=409)
                    return
                self.send_json({"job_id": job_id, "status": job.status, **job.result})
                return

            job_id = suffix
            job = self.app_state.mobility_job_manager.get_job(job_id)
            if job is None:
                self.send_text("Unknown job id", code=404)
                return
            payload = job.to_status_dict()
            if job.status == "failed":
                payload["error"] = job.error
            self.send_json(payload)
            return

        if path.startswith("/api/deepmimo/jobs/"):
            suffix = path.removeprefix("/api/deepmimo/jobs/")
            if suffix.endswith("/download"):
                job_id = suffix.removesuffix("/download")
                archive = self.app_state.deepmimo_job_manager.get_download_path(job_id)
                if archive is None:
                    self.send_text("DeepMIMO dataset is not ready", code=404)
                    return
                self.send_download_file(
                    archive,
                    content_type="application/zip",
                    filename=f"deepmimo_{job_id}.zip",
                )
                return

            job_id = suffix
            job = self.app_state.deepmimo_job_manager.get_job(job_id)
            if job is None:
                self.send_text("Unknown job id", code=404)
                return
            payload = job.to_status_dict()
            if job.status == "failed":
                payload["error"] = job.error
            self.send_json(payload)
            return

        self.send_text("Not Found", code=404)

    def do_POST(self) -> None:
        path = urlparse(self.path).path

        try:
            if path == "/api/rt/scene-selection":
                payload = self.read_json_body()
                tile_ids = payload.get("tile_ids", [])
                self.send_json(self.app_state.rt_runtime.request_scene_selection(tile_ids))
                return

            if path == "/api/link/solve":
                payload = self.read_json_body()
                result = solve_link(self.app_state.rt_runtime, payload)
                self.send_json(result)
                return

            if path == "/api/radiomap/jobs":
                payload = self.read_json_body()
                scene_generation = capture_ready_scene_generation(self.app_state.rt_runtime)
                job = self.app_state.job_manager.create_job(payload, scene_generation=scene_generation)
                self.send_json({"ok": True, "job_id": job.job_id, "status": job.status})
                return

            if path == "/api/mobility/jobs":
                payload = self.read_json_body()
                scene_generation = capture_ready_scene_generation(self.app_state.rt_runtime)
                job = self.app_state.mobility_job_manager.create_job(payload, scene_generation=scene_generation)
                self.send_json({"ok": True, "job_id": job.job_id, "status": job.status})
                return

            if path == "/api/deepmimo/jobs":
                payload = self.read_json_body()
                rt_lock = getattr(self.app_state.rt_runtime, "lock", None)
                if rt_lock is None:
                    self.app_state.rt_runtime.require_ready()
                    active_tile_ids = tuple(
                        getattr(self.app_state.rt_runtime, "active_tile_ids", ())
                        or self.app_state.rt_runtime.status_dict().get("active_tile_ids", ())
                    )
                else:
                    with rt_lock:
                        self.app_state.rt_runtime.require_ready()
                        active_tile_ids = tuple(
                            getattr(self.app_state.rt_runtime, "active_tile_ids", ())
                            or self.app_state.rt_runtime.status_dict().get("active_tile_ids", ())
                        )
                if not active_tile_ids:
                    raise SceneNotReady("empty", "No Sionna RT scene is ready; select at least one tile")
                payload = dict(payload)
                payload["scene"] = {"tile_ids": list(active_tile_ids)}
                job = self.app_state.deepmimo_job_manager.create_job(payload)
                self.send_json({"ok": True, "job_id": job.job_id, "status": job.status})
                return

            self.send_text("Not Found", code=404)
        except RadiomapQueueFull as exc:
            self.send_json(
                {
                    "ok": False,
                    "error": str(exc),
                    "max_pending_jobs": exc.max_pending_jobs,
                },
                code=429,
            )
        except MobilityQueueFull as exc:
            self.send_json(
                {
                    "ok": False,
                    "error": str(exc),
                    "max_pending_jobs": exc.max_pending_jobs,
                },
                code=429,
            )
        except DeepMIMOQueueFull as exc:
            self.send_json(
                {
                    "ok": False,
                    "error": str(exc),
                    "max_pending_jobs": exc.max_pending_jobs,
                },
                code=429,
            )
        except SceneNotReady as exc:
            self.send_json({"ok": False, "error": exc.message, "status": exc.status}, code=409)
        except ValueError as exc:
            self.send_json({"ok": False, "error": str(exc)}, code=400)
        except Exception as exc:
            traceback.print_exception(type(exc), exc, exc.__traceback__, file=sys.stderr)
            self.send_json({"ok": False, "error": "Internal server error"}, code=500)


def main() -> None:
    app_state = AppState()
    server = ThreadingHTTPServer((config.HOST, config.PORT), RequestHandler)
    server.app_state = app_state  # type: ignore[attr-defined]

    print(f"Serving HKU-RT v3.0 on http://{config.HOST}:{config.PORT}")
    print(f"Scene XML: {config.SCENE_XML}")
    print(f"Mesh root: {config.MESH_ROOT}")
    server.serve_forever()


if __name__ == "__main__":
    main()
