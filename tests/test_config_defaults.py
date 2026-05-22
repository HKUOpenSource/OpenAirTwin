from __future__ import annotations

import os
from pathlib import Path
import subprocess
import sys
import unittest


PROJECT_ROOT = Path(__file__).resolve().parents[1]


class ConfigDefaultTests(unittest.TestCase):
    def test_default_host_is_loopback_when_oat_host_is_unset(self) -> None:
        env = os.environ.copy()
        env.pop("OAT_HOST", None)
        completed = subprocess.run(
            [
                sys.executable,
                "-c",
                "from backend import config; print(config.HOST)",
            ],
            cwd=PROJECT_ROOT,
            env=env,
            check=False,
            capture_output=True,
            text=True,
            timeout=30,
        )

        self.assertEqual(completed.returncode, 0, completed.stderr)
        self.assertEqual(completed.stdout.strip(), "127.0.0.1")


if __name__ == "__main__":
    unittest.main()
