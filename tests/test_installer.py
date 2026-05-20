from __future__ import annotations

import importlib.util
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest


PROJECT_ROOT = Path(__file__).resolve().parents[1]
INSTALLER_PATH = PROJECT_ROOT / "install.py"


def load_installer():
    spec = importlib.util.spec_from_file_location("openairtwin_installer", INSTALLER_PATH)
    module = importlib.util.module_from_spec(spec)
    assert spec and spec.loader
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


class InstallerHelperTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.installer = load_installer()

    def test_python_version_requirement(self) -> None:
        self.assertTrue(self.installer.python_version_ok((3, 11, 0)))
        self.assertTrue(self.installer.python_version_ok((3, 12, 1)))
        self.assertFalse(self.installer.python_version_ok((3, 10, 12)))

    def test_venv_python_path_is_platform_specific(self) -> None:
        root = Path("/tmp/project/.venv")
        self.assertEqual(
            self.installer.venv_python_path(root, "Linux"),
            root / "bin" / "python",
        )
        self.assertEqual(
            self.installer.venv_python_path(root, "Darwin"),
            root / "bin" / "python",
        )
        self.assertEqual(
            self.installer.venv_python_path(root, "Windows"),
            root / "Scripts" / "python.exe",
        )

    def test_parse_nvidia_smi_gpu_list(self) -> None:
        output = "\n".join(
            [
                "GPU 0: NVIDIA GeForce RTX 4090 (UUID: GPU-1111)",
                "GPU 1: NVIDIA RTX A6000 (UUID: GPU-2222)",
                "  MIG 1g.5gb Device 0: (UUID: MIG-ignored)",
            ]
        )
        gpus = self.installer.parse_nvidia_smi_gpus(output)
        self.assertEqual([gpu.index for gpu in gpus], ["0", "1"])
        self.assertEqual(gpus[0].name, "NVIDIA GeForce RTX 4090")
        self.assertEqual(gpus[1].uuid, "GPU-2222")

    def test_gpu_selection_accepts_index_and_uuid_prefix(self) -> None:
        gpus = [
            self.installer.GpuInfo("0", "NVIDIA A", "GPU-aaaa"),
            self.installer.GpuInfo("1", "NVIDIA B", "GPU-bbbb"),
        ]
        self.assertEqual(self.installer.resolve_gpu_selection("1", gpus), "1")
        self.assertEqual(self.installer.resolve_gpu_selection("GPU-b", gpus), "GPU-bbbb")
        with self.assertRaises(ValueError):
            self.installer.resolve_gpu_selection("4", gpus)

    def test_choose_gpu_value_keeps_multi_gpu_unset_when_non_interactive(self) -> None:
        gpus = [
            self.installer.GpuInfo("0", "NVIDIA A", "GPU-aaaa"),
            self.installer.GpuInfo("1", "NVIDIA B", "GPU-bbbb"),
        ]
        value, message = self.installer.choose_gpu_value(
            gpus,
            requested_gpu=None,
            force_cpu=False,
            assume_yes=True,
        )
        self.assertIsNone(value)
        self.assertIn("Multiple NVIDIA GPUs", message)

    def test_build_env_values_and_format_file(self) -> None:
        values = self.installer.build_env_values(
            python_executable=Path("/tmp/project/.venv/bin/python"),
            gpu_value="1",
            system_name="Linux",
        )
        self.assertEqual(values["OAT_HOST"], "127.0.0.1")
        self.assertEqual(values["OAT_PORT"], "8090")
        self.assertEqual(values["CUDA_VISIBLE_DEVICES"], "1")
        text = self.installer.format_env_file(values)
        self.assertIn("CUDA_VISIBLE_DEVICES=1", text)
        self.assertIn("OAT_DEEPMIMO_ENV_PYTHON=/tmp/project/.venv/bin/python", text)

    def test_windows_cache_paths_use_user_writable_locations(self) -> None:
        paths = self.installer.windows_cache_paths(
            {
                "TEMP": r"C:\Users\Tester\AppData\Local\Temp",
                "APPDATA": r"C:\Users\Tester\AppData\Roaming",
            }
        )
        self.assertEqual(paths["drjit_cache"], Path(r"C:\Users\Tester\AppData\Local\Temp") / "drjit")
        self.assertEqual(paths["optix_cache"], paths["drjit_cache"])
        self.assertEqual(
            paths["cuda_cache"],
            Path(r"C:\Users\Tester\AppData\Roaming") / "NVIDIA" / "ComputeCache",
        )

    def test_dry_run_does_not_create_venv_or_env_file(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "install.py").write_text(INSTALLER_PATH.read_text(encoding="utf-8"), encoding="utf-8")
            (root / "requirements.txt").write_text("", encoding="utf-8")
            completed = subprocess.run(
                [sys.executable, str(root / "install.py"), "--dry-run", "--yes"],
                cwd=str(root),
                check=False,
                capture_output=True,
                text=True,
                timeout=30,
            )
            self.assertEqual(completed.returncode, 0, completed.stdout + completed.stderr)
            self.assertFalse((root / ".venv").exists())
            self.assertFalse((root / ".oat-env").exists())
            self.assertIn("Dry run complete", completed.stdout)

    def test_gitignore_covers_generated_install_artifacts(self) -> None:
        gitignore = (PROJECT_ROOT / ".gitignore").read_text(encoding="utf-8")
        self.assertIn("/.venv/", gitignore)
        self.assertIn("/.oat-env", gitignore)
        self.assertIn("/.env.local", gitignore)


if __name__ == "__main__":
    unittest.main()
