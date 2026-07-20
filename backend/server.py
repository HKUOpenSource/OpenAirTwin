from __future__ import annotations

from datetime import timezone
from email.utils import formatdate, parsedate_to_datetime
import json
import mimetypes
import os
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import sys
import threading
import traceback
from urllib.parse import parse_qs, unquote, urlparse

from backend import __version__, config
from backend.features.catalog import BACKEND_FEATURE_CATALOG, FEATURE_ROUTES
from backend.features.core import FeatureQueueFull, FeatureServiceRegistry, capture_ready_scene_generation
from backend.jobs.tile_download_jobs import TileDownloadBusy, TileDownloadJobManager
from backend.rt.common import antenna_array_capabilities
from backend.rt.runtime import RTRuntime, SceneNotReady
from backend.scene.incremental_tiles import download_stage_and_integrate_tile, normalize_tile_id
from backend.scene.open3dhk_coverage import is_open3dhk_download_base_url, open3dhk_tile_is_downloadable
from backend.scene.tile_bundles import (
    compressed_tile_bundle_path,
    ensure_tile_bundle,
)
from backend.scene.tile_scene_xml import (
    COMMON_SCENE_RELATIVE_PATH,
    TILE_SCENE_RELATIVE_DIR,
    TileSceneXmlBuilder,
    ensure_scene_layout,
)
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


class RequestBodyTooLarge(ValueError):
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
        self._closed = False
        self.reload_lock = threading.Lock()
        ensure_scene_layout(config.SCENE_ROOT)
        self.manifest: SceneManifest = load_scene_manifest(config.SCENE_ROOT)
        self.manifest_lookup = self.manifest.mesh_lookup
        self.rt_scene_builder = TileSceneXmlBuilder(
            config.SCENE_ROOT,
            config.GENERATED_ROOT / "rt_scene_xml",
        )
        self.rt_runtime = RTRuntime(
            config.DEFAULT_FREQUENCY_HZ,
            self.rt_scene_builder,
        )
        self.feature_services = FeatureServiceRegistry({
            "config": config,
            "rt_runtime": self.rt_runtime,
            "scene_generation": capture_ready_scene_generation,
        })
        self.feature_services.register_all(BACKEND_FEATURE_CATALOG)
        self.job_manager = self.feature_services.get("radiomap").manager
        self.mobility_job_manager = self.feature_services.get("mobility").manager
        self.deepmimo_job_manager = self.feature_services.get("deepmimo").manager
        self.tile_download_job_manager = TileDownloadJobManager(self.download_and_integrate_tile)

    def close(self) -> None:
        if self._closed:
            return
        self.deepmimo_job_manager.shutdown()
        self._closed = True

    def reload_scene_catalog(self) -> None:
        with self.reload_lock:
            manifest = load_scene_manifest(config.SCENE_ROOT)
            manifest_lookup = manifest.mesh_lookup
            rt_scene_builder = TileSceneXmlBuilder(
                config.SCENE_ROOT,
                config.GENERATED_ROOT / "rt_scene_xml",
            )
            with self.rt_runtime.lock:
                self.rt_scene_builder = rt_scene_builder
                self.rt_runtime.scene_builder = rt_scene_builder
                self.manifest = manifest
                self.manifest_lookup = manifest_lookup

    def download_and_integrate_tile(self, tile_id: str, *, progress_cb=None, cancel_check=None) -> dict:
        result = download_stage_and_integrate_tile(
            tile_id,
            scene_root=config.SCENE_ROOT,
            workspace_root=config.INCREMENTAL_TILE_ROOT,
            stage_root=config.INCREMENTAL_TILE_STAGE_ROOT,
            base_url=config.MAP_DOWNLOAD_BASE_URL,
            file_format=config.MAP_DOWNLOAD_FORMAT,
            key=config.MAP_DOWNLOAD_KEY,
            progress_cb=progress_cb,
            cancel_check=cancel_check,
        )
        internal_tile_id = normalize_tile_id(tile_id).internal
        needs_reload = (
            result.get("status") != "already_integrated"
            or internal_tile_id not in self.manifest.tiles
        )
        if needs_reload:
            if progress_cb:
                progress_cb(0.98, "Reloading scene manifest")
            self.reload_scene_catalog()
        return result


class RequestHandler(BaseHTTPRequestHandler):
    server_version = f"OpenAirTwin/{__version__}"

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
        with open(file_path, "rb") as handle:
            size = os.fstat(handle.fileno()).st_size
            self.send_response(200)
            self.send_header("Content-Type", content_type)
            self.send_header("Content-Length", str(size))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            remaining = size
            while remaining > 0:
                chunk = handle.read(min(1024 * 1024, remaining))
                if not chunk:
                    # File shrank mid-read. Headers already advertised `size`
                    # bytes, so the only way to flag the protocol mismatch is
                    # to force-close the connection.
                    self.close_connection = True
                    raise OSError(
                        f"send_file: {file_path} shrank during read "
                        f"({remaining} bytes short of declared Content-Length)"
                    )
                self.wfile.write(chunk)
                remaining -= len(chunk)

    def send_download_file(self, file_path: Path, *, content_type: str, filename: str) -> None:
        with open(file_path, "rb") as handle:
            self.send_download_handle(handle, content_type=content_type, filename=filename)

    def send_download_handle(self, handle, *, content_type: str, filename: str) -> None:
        self.close_connection = True
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
        with open(raw_path, "rb") as raw_handle:
            raw_stat = os.fstat(raw_handle.fileno())
            gzip_path = compressed_tile_bundle_path(raw_path)
            gzip_handle = None
            try:
                if self.accepts_content_encoding("gzip"):
                    candidate = open(gzip_path, "rb")
                    candidate_stat = os.fstat(candidate.fileno())
                    if candidate_stat.st_mtime_ns == raw_stat.st_mtime_ns:
                        gzip_handle = candidate
                    else:
                        candidate.close()
            except OSError:
                gzip_handle = None
            use_gzip = gzip_handle is not None
            encoding = "gzip" if use_gzip else "identity"
            etag = f'"{raw_stat.st_mtime_ns:x}-{raw_stat.st_size:x}-{encoding}"'
            last_modified = formatdate(raw_stat.st_mtime, usegmt=True)
            cache_control = (
                "public, max-age=31536000, immutable"
                if "v" in parse_qs(urlparse(self.path).query)
                else "no-store"
            )

            if self.client_cache_is_fresh(etag, raw_stat.st_mtime):
                if gzip_handle is not None:
                    gzip_handle.close()
                self.send_response(304)
                self.send_header("Cache-Control", cache_control)
                self.send_header("ETag", etag)
                self.send_header("Last-Modified", last_modified)
                self.send_header("Vary", "Accept-Encoding")
                self.end_headers()
                return

            handle = gzip_handle if use_gzip else raw_handle
            try:
                self._send_open_bundle_handle(handle, raw_stat=raw_stat, cache_control=cache_control, etag=etag, last_modified=last_modified, use_gzip=use_gzip)
            finally:
                if handle is not raw_handle:
                    handle.close()

    def _send_open_bundle_handle(self, handle, *, raw_stat, cache_control: str, etag: str, last_modified: str, use_gzip: bool) -> None:
        response_size = os.fstat(handle.fileno()).st_size
        self.send_response(200)
        self.send_header("Content-Type", "model/gltf-binary")
        self.send_header("Content-Length", str(response_size))
        self.send_header("Cache-Control", cache_control)
        self.send_header("ETag", etag)
        self.send_header("Last-Modified", last_modified)
        self.send_header("Vary", "Accept-Encoding")
        self.send_header("X-Original-Content-Length", str(raw_stat.st_size))
        if use_gzip:
            self.send_header("Content-Encoding", "gzip")
            self.send_header("X-Compressed-Content-Length", str(response_size))
        self.end_headers()
        remaining = response_size
        while remaining > 0:
            chunk = handle.read(min(1024 * 1024, remaining))
            if not chunk:
                break
            self.wfile.write(chunk)
            remaining -= len(chunk)

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
            return "*" in candidates or etag in candidates

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
        raw_length = self.headers.get("Content-Length", "0")
        try:
            length = int(raw_length)
        except (TypeError, ValueError) as exc:
            raise ValueError("Invalid Content-Length header") from exc
        if length < 0:
            raise ValueError("Invalid Content-Length header")
        if length > config.MAX_REQUEST_BODY_BYTES:
            raise RequestBodyTooLarge(
                f"Request body of {length} bytes exceeds limit of {config.MAX_REQUEST_BODY_BYTES} bytes"
            )
        raw = self.rfile.read(length) if length > 0 else b"{}"
        payload = json.loads(raw.decode("utf-8"))
        if not isinstance(payload, dict):
            raise ValueError("Request body must be a JSON object")
        return payload

    def serve_static_file(self, relative_path: str) -> None:
        file_path = resolve_under(config.STATIC_ROOT, unquote(relative_path))
        if file_path is None or not file_path.is_file():
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
        if file_path is None or not file_path.is_file():
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

        try:
            self._dispatch_get(path)
        except (BrokenPipeError, ConnectionResetError):
            return
        except ValueError as exc:
            try:
                self.send_json({"ok": False, "error": str(exc)}, code=400)
            except (BrokenPipeError, ConnectionResetError, OSError):
                pass
        except Exception as exc:
            traceback.print_exception(type(exc), exc, exc.__traceback__, file=sys.stderr)
            try:
                self.send_json({"ok": False, "error": "Internal server error"}, code=500)
            except (BrokenPipeError, ConnectionResetError, OSError):
                pass

    def _dispatch_get(self, path: str) -> None:
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
                    "scene_source_mode": "per_tile",
                    "scene_root": str(config.SCENE_ROOT),
                    "common_scene_xml": str(config.SCENE_ROOT / COMMON_SCENE_RELATIVE_PATH),
                    "tile_xml_dir": str(config.SCENE_ROOT / TILE_SCENE_RELATIVE_DIR),
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

        if path.startswith("/api/scene/tile-downloads/"):
            job_id = path.removeprefix("/api/scene/tile-downloads/")
            job = self.app_state.tile_download_job_manager.get_job(job_id)
            if job is None:
                self.send_text("Unknown job id", code=404)
                return
            self.send_json(job.to_status_dict())
            return

        if path.startswith("/api/scene/mesh/"):
            mesh_id = unquote(path.removeprefix("/api/scene/mesh/"))
            self.serve_mesh(mesh_id)
            return

        if path.startswith("/api/scene/bundle/"):
            bundle_id = unquote(path.removeprefix("/api/scene/bundle/"))
            self.serve_bundle(bundle_id)
            return

        if FEATURE_ROUTES.dispatch("GET", path, self):
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

            if FEATURE_ROUTES.dispatch("POST", path, self):
                return

            if path.startswith("/api/scene/tile-downloads/") and path.endswith("/cancel"):
                job_id = path.removeprefix("/api/scene/tile-downloads/").removesuffix("/cancel")
                job = self.app_state.tile_download_job_manager.cancel_job(job_id)
                if job is None:
                    self.send_text("Unknown job id", code=404)
                    return
                self.send_json(job.to_status_dict())
                return

            if path == "/api/scene/tile-downloads":
                payload = self.read_json_body()
                tile_id = normalize_tile_id(str(payload.get("tile_id", ""))).internal
                if is_open3dhk_download_base_url(config.MAP_DOWNLOAD_BASE_URL) and not open3dhk_tile_is_downloadable(tile_id):
                    raise ValueError(f"No Open3D HK download is available for tile {tile_id}")
                job = self.app_state.tile_download_job_manager.create_job(tile_id)
                self.send_json({"ok": True, "job_id": job.job_id, "status": job.status, "tile_id": tile_id})
                return

            self.send_text("Not Found", code=404)
        except TileDownloadBusy as exc:
            self.send_json(
                {
                    "ok": False,
                    "error": str(exc),
                    "active_job_id": exc.active_job_id,
                    "active_tile_id": exc.active_tile_id,
                },
                code=409,
            )
        except FeatureQueueFull as exc:
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
        except RequestBodyTooLarge as exc:
            self.send_json({"ok": False, "error": str(exc)}, code=413)
        except ValueError as exc:
            self.send_json({"ok": False, "error": str(exc)}, code=400)
        except Exception as exc:
            traceback.print_exception(type(exc), exc, exc.__traceback__, file=sys.stderr)
            self.send_json({"ok": False, "error": "Internal server error"}, code=500)


def main() -> None:
    app_state = AppState()
    server = None
    try:
        server = ThreadingHTTPServer((config.HOST, config.PORT), RequestHandler)
        server.app_state = app_state  # type: ignore[attr-defined]

        print(f"Serving OpenAirTwin v{__version__} on http://{config.HOST}:{config.PORT}")
        print(f"Scene root: {config.SCENE_ROOT}")
        print(f"Scene source: {config.SCENE_ROOT / COMMON_SCENE_RELATIVE_PATH} + {config.SCENE_ROOT / TILE_SCENE_RELATIVE_DIR}")
        print(f"Mesh root: {config.MESH_ROOT}")
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        try:
            if server is not None:
                server.server_close()
        finally:
            app_state.close()


if __name__ == "__main__":
    main()
