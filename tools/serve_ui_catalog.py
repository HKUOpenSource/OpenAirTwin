from __future__ import annotations

import argparse
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import os
from pathlib import Path
from urllib.parse import unquote, urlparse


PROJECT_ROOT = Path(__file__).resolve().parents[1]
CATALOG_ROOT = PROJECT_ROOT / "tools" / "ui-catalog"
CSS_ROOT = PROJECT_ROOT / "backend" / "static" / "css"


class CatalogHandler(SimpleHTTPRequestHandler):
    def do_GET(self) -> None:
        path = unquote(urlparse(self.path).path)
        if path in {"/ui-catalog", "/ui-catalog/"}:
            self._send_file(CATALOG_ROOT / "index.html")
            return
        if path == "/ui-catalog/catalog.css":
            self._send_file(CATALOG_ROOT / "catalog.css")
            return
        if path.startswith("/css/"):
            filename = path.removeprefix("/css/")
            if "/" not in filename and "\\" not in filename:
                self._send_file(CSS_ROOT / filename)
                return
        self.send_error(404)

    def _send_file(self, path: Path) -> None:
        if not path.is_file():
            self.send_error(404)
            return
        body = path.read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", "text/css" if path.suffix == ".css" else "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, format: str, *args: object) -> None:
        return


def main() -> None:
    parser = argparse.ArgumentParser(description="Serve the development-only OpenAirTwin UI catalog.")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=int(os.environ.get("OAT_UI_CATALOG_PORT", "8091")))
    args = parser.parse_args()
    with ThreadingHTTPServer((args.host, args.port), CatalogHandler) as server:
        print(f"OpenAirTwin UI catalog: http://{args.host}:{args.port}/ui-catalog/", flush=True)
        server.serve_forever()


if __name__ == "__main__":
    main()
