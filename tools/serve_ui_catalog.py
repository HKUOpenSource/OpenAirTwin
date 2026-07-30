from __future__ import annotations

import argparse
import os
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[1]
WORKBENCH_ROOT = PROJECT_ROOT / "workbench"


def main() -> None:
    parser = argparse.ArgumentParser(description="Serve the development-only React UI catalog through Vite.")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=int(os.environ.get("OAT_UI_CATALOG_PORT", "8091")))
    args = parser.parse_args()

    environment = os.environ.copy()
    environment["OAT_UI_CATALOG_HOST"] = args.host
    environment["OAT_UI_CATALOG_PORT"] = str(args.port)
    command = ["npm", "--prefix", str(WORKBENCH_ROOT), "run", "dev:catalog"]
    os.execvpe(command[0], command, environment)


if __name__ == "__main__":
    main()
