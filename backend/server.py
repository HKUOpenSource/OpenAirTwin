from __future__ import annotations

import json
import mimetypes
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlparse

from backend import config
from backend.jobs.radiomap_jobs import RadiomapJobManager
from backend.rt.solve_link import solve_link
from backend.scene.tile_bundles import ensure_tile_bundle
from backend.scene.xml_catalog import SceneManifest, load_scene_manifest


class AppState:
    def __init__(self) -> None:
        self.manifest: SceneManifest = load_scene_manifest(config.SCENE_ROOT, config.SCENE_XML)
        self.manifest_lookup = self.manifest.mesh_lookup
        self.job_manager = RadiomapJobManager(config.SCENE_XML)


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
        file_path = (config.STATIC_ROOT / relative_path).resolve()
        if not str(file_path).startswith(str(config.STATIC_ROOT.resolve())) or not file_path.exists():
            self.send_text("Not Found", code=404)
            return
        content_type, _ = mimetypes.guess_type(str(file_path))
        self.send_file(file_path, content_type=content_type or "application/octet-stream")

    def serve_mesh(self, mesh_id: str) -> None:
        mesh = self.app_state.manifest_lookup.get(mesh_id)
        if mesh is None:
            self.send_text("Unknown mesh id", code=404)
            return

        file_path = (config.SCENE_ROOT / mesh.relative_path).resolve()
        if not str(file_path).startswith(str(config.SCENE_ROOT.resolve())) or not file_path.exists():
            self.send_text("Mesh file missing", code=404)
            return
        self.send_file(file_path, content_type="application/octet-stream")

    def serve_bundle(self, bundle_id: str) -> None:
        bundle = self.app_state.manifest.bundle_lookup.get(bundle_id)
        if bundle is None:
            self.send_text("Unknown bundle id", code=404)
            return

        result = ensure_tile_bundle(config.SCENE_ROOT, bundle)
        self.send_file(result.bundle_path, content_type="model/gltf-binary")

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

        self.send_text("Not Found", code=404)

    def do_POST(self) -> None:
        path = urlparse(self.path).path

        try:
            if path == "/api/link/solve":
                payload = self.read_json_body()
                result = solve_link(config.SCENE_XML, payload)
                self.send_json(result)
                return

            if path == "/api/radiomap/jobs":
                payload = self.read_json_body()
                job = self.app_state.job_manager.create_job(payload)
                self.send_json({"ok": True, "job_id": job.job_id, "status": job.status})
                return

            self.send_text("Not Found", code=404)
        except ValueError as exc:
            self.send_json({"ok": False, "error": str(exc)}, code=400)
        except Exception as exc:
            self.send_json({"ok": False, "error": str(exc)}, code=500)


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
