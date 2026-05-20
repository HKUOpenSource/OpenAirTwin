from __future__ import annotations

import importlib.util
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch
from zipfile import ZipFile


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
        with self.assertRaisesRegex(ValueError, "ambiguous"):
            self.installer.resolve_gpu_selection("GPU-", gpus)

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
            self.assertFalse((root / "scene").exists())
            self.assertIn("Sample scene download skipped in --yes mode", completed.stdout)
            self.assertIn("Dry run complete", completed.stdout)

    def test_dry_run_with_sample_scene_does_not_create_scene(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "install.py").write_text(INSTALLER_PATH.read_text(encoding="utf-8"), encoding="utf-8")
            (root / "requirements.txt").write_text("", encoding="utf-8")
            completed = subprocess.run(
                [sys.executable, str(root / "install.py"), "--dry-run", "--yes", "--with-sample-scene"],
                cwd=str(root),
                check=False,
                capture_output=True,
                text=True,
                timeout=30,
            )
            self.assertEqual(completed.returncode, 0, completed.stdout + completed.stderr)
            self.assertFalse((root / ".venv").exists())
            self.assertFalse((root / ".oat-env").exists())
            self.assertFalse((root / "scene").exists())
            self.assertIn("Would download sample scene", completed.stdout)
            self.assertIn("Dry run complete", completed.stdout)

    def test_gitignore_covers_generated_install_artifacts(self) -> None:
        gitignore = (PROJECT_ROOT / ".gitignore").read_text(encoding="utf-8")
        self.assertIn("/.venv/", gitignore)
        self.assertIn("/.oat-env", gitignore)
        self.assertIn("/.env.local", gitignore)

    def test_choose_sample_scene_download_defaults_to_skip_in_yes_mode(self) -> None:
        value, message = self.installer.choose_sample_scene_download(
            with_sample_scene=False,
            no_sample_scene=False,
            assume_yes=True,
        )
        self.assertFalse(value)
        self.assertIn("--yes", message)

    def test_choose_sample_scene_download_honors_explicit_flags(self) -> None:
        value, _ = self.installer.choose_sample_scene_download(
            with_sample_scene=True,
            no_sample_scene=False,
            assume_yes=True,
        )
        self.assertTrue(value)
        value, _ = self.installer.choose_sample_scene_download(
            with_sample_scene=False,
            no_sample_scene=True,
            assume_yes=False,
            interactive=True,
        )
        self.assertFalse(value)

    def test_choose_sample_scene_download_prompts_interactively(self) -> None:
        with patch("builtins.input", return_value="y"):
            value, message = self.installer.choose_sample_scene_download(
                with_sample_scene=False,
                no_sample_scene=False,
                assume_yes=False,
                interactive=True,
            )
        self.assertTrue(value)
        self.assertIn("selected", message)

    def test_sample_scene_present_requires_common_tiles_and_meshes(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            scene = Path(tmp) / "scene"
            (scene / "common").mkdir(parents=True)
            (scene / "tiles").mkdir()
            (scene / "meshes").mkdir()
            (scene / "common" / "scene_common.xml").write_text("<scene />", encoding="utf-8")
            for tile in self.installer.SAMPLE_SCENE_TILES:
                (scene / "tiles" / f"{tile}.xml").write_text("<scene />", encoding="utf-8")
                (scene / "meshes" / tile).mkdir()
            self.assertFalse(self.installer.sample_scene_present(scene))
            for tile in self.installer.SAMPLE_SCENE_TILES:
                (scene / "meshes" / tile / "mesh.ply").write_text("ply", encoding="utf-8")
            self.assertTrue(self.installer.sample_scene_present(scene))
            (scene / "tiles" / "11_SW_7D.xml").unlink()
            self.assertFalse(self.installer.sample_scene_present(scene))

    def test_extract_sample_scene_zip_writes_only_scene_entries(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            archive = root / "sample.zip"
            with ZipFile(archive, "w") as zf:
                zf.writestr("THIRD_PARTY_DATA.md", "metadata")
                zf.writestr("scene/common/scene_common.xml", "<scene />")
                zf.writestr("scene/tiles/11_SW_7A.xml", "<scene />")
                zf.writestr("scene/meshes/11_SW_7A/mesh.ply", "ply")
            extracted, skipped = self.installer.extract_sample_scene_zip(archive, project_root=root)
            self.assertEqual((extracted, skipped), (3, 0))
            self.assertTrue((root / "scene" / "common" / "scene_common.xml").exists())
            self.assertTrue((root / "scene" / "meshes" / "11_SW_7A" / "mesh.ply").exists())
            self.assertFalse((root / "THIRD_PARTY_DATA.md").exists())

            extracted, skipped = self.installer.extract_sample_scene_zip(archive, project_root=root)
            self.assertEqual(extracted, 0)
            self.assertEqual(skipped, 3)

    def test_extract_sample_scene_zip_rejects_path_traversal(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            archive = root / "sample.zip"
            with ZipFile(archive, "w") as zf:
                zf.writestr("scene/../evil.txt", "bad")
            with self.assertRaises(ValueError):
                self.installer.extract_sample_scene_zip(archive, project_root=root)
            self.assertFalse((root / "evil.txt").exists())

    def test_install_sample_scene_rejects_sha_mismatch(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            archive = root / "sample.zip"
            with ZipFile(archive, "w") as zf:
                zf.writestr("scene/common/scene_common.xml", "<scene />")

            def fake_download(_url, destination):
                destination.write_bytes(archive.read_bytes())

            with patch.object(self.installer, "download_file", side_effect=fake_download):
                with self.assertRaises(RuntimeError):
                    self.installer.install_sample_scene(
                        url="https://example.test/sample.zip",
                        expected_sha256="0" * 64,
                        project_root=root,
                    )
            self.assertFalse((root / "scene").exists())


if __name__ == "__main__":
    unittest.main()
