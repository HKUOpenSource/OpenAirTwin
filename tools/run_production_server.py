from __future__ import annotations

import os
from pathlib import Path
import sys


os.environ["OAT_REQUIRE_WORKBENCH_BUILD"] = "1"
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from backend.server import main  # noqa: E402


if __name__ == "__main__":
    main()
