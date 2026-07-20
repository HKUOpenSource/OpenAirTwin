from __future__ import annotations

import json
import math
import os
from pathlib import Path
import shutil
import tempfile
import time
import unittest
from unittest.mock import patch
import xml.etree.ElementTree as ET
import zipfile


RUN_REAL_RUNTIME_TESTS = os.environ.get("OAT_RUN_REAL_RUNTIME_TESTS", "").strip().lower() in {
    "1",
    "true",
    "yes",
    "on",
}


@unittest.skipUnless(
    RUN_REAL_RUNTIME_TESTS,
    "set OAT_RUN_REAL_RUNTIME_TESTS=1 to run tests against the full runtime",
)
class RealRuntimeSmokeTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        from backend.scene.tile_scene_xml import ensure_scene_layout
        from sionna.rt import scene as bundled_scenes

        cls._temp_dir = tempfile.TemporaryDirectory()
        cls.addClassCleanup(cls._temp_dir.cleanup)
        cls.root = Path(cls._temp_dir.name)
        cls.scene_root = cls.root / "scene"
        ensure_scene_layout(cls.scene_root)

        bundled_scene = Path(bundled_scenes.floor_wall)
        bundled_floor = bundled_scene.parent / "meshes" / "floor.ply"
        if not bundled_floor.is_file():
            raise AssertionError(f"missing bundled Sionna floor mesh: {bundled_floor}")

        floor_mesh = cls.scene_root / "meshes" / "SMOKE" / "TERRAIN" / "floor.ply"
        floor_mesh.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(bundled_floor, floor_mesh)

        tile_root = ET.Element("scene", {"version": "3.0.0"})
        floor_shape = ET.SubElement(
            tile_root,
            "shape",
            {"type": "ply", "id": "smoke_terrain"},
        )
        ET.SubElement(
            floor_shape,
            "string",
            {"name": "filename", "value": "meshes/SMOKE/TERRAIN/floor.ply"},
        )
        ET.SubElement(
            floor_shape,
            "boolean",
            {"name": "face_normals", "value": "true"},
        )
        ET.SubElement(
            floor_shape,
            "ref",
            {"name": "bsdf", "id": "itu_medium_dry_ground"},
        )
        ET.ElementTree(tile_root).write(
            cls.scene_root / "tiles" / "SMOKE.xml",
            encoding="utf-8",
            xml_declaration=True,
        )

    def ready_runtime(self):
        from backend.rt.runtime import RTRuntime
        from backend.scene.tile_scene_xml import TileSceneXmlBuilder

        builder = TileSceneXmlBuilder(self.scene_root, self.root / "runtime_scene_xml")
        runtime = RTRuntime(3.5e9, builder)
        runtime.request_scene_selection(["SMOKE"])
        deadline = time.monotonic() + 15.0
        while time.monotonic() < deadline:
            status = runtime.status_dict()
            if status["status"] == "ready":
                self.addCleanup(self.release_runtime, runtime)
                return runtime
            if status["status"] == "failed":
                self.fail(f"real Sionna RT scene failed to load: {status['message']}")
            time.sleep(0.01)
        self.fail(f"timed out loading real Sionna RT scene: {runtime.status_dict()}")

    @staticmethod
    def release_runtime(runtime) -> None:
        with runtime.lock:
            runtime.scene = None
            runtime.status = "empty"
        runtime._flush_runtime_memory()

    def test_real_link_solver_and_channel_taps(self) -> None:
        from backend.rt.solve_link import solve_link

        runtime = self.ready_runtime()
        result = solve_link(
            runtime,
            {
                "tx": {"position": [-1.0, -1.0, 1.0]},
                "rx": {"position": [-1.0, 1.0, 1.0]},
                "solver": {
                    "max_depth": 1,
                    "samples_per_src": 16,
                    "max_num_paths_per_src": 8,
                    "specular_reflection": False,
                    "refraction": False,
                },
                "channel": {
                    "compute_taps": True,
                    "l_min": -1,
                    "l_max": 2,
                    "fft_size": 64,
                    "subcarrier_spacing_hz": 15_000,
                },
            },
        )

        self.assertTrue(result["ok"])
        self.assertGreaterEqual(result["summary"]["valid_paths"], 1)
        self.assertGreaterEqual(result["summary"]["los_paths"], 1)
        self.assertTrue(math.isfinite(result["summary"]["received_power_db"]))
        self.assertEqual(result["channel"]["tap_indices"], [-1, 0, 1, 2])
        self.assertGreaterEqual(result["channel"]["cir_summary"]["coefficient_count"], 1)
        self.assertEqual(list(runtime.scene.transmitters), [])
        self.assertEqual(list(runtime.scene.receivers), [])

    def test_real_radiomap_solver(self) -> None:
        from backend.rt.solve_radiomap import solve_terrain_radiomap

        runtime = self.ready_runtime()
        result = solve_terrain_radiomap(
            runtime,
            {
                "tx": {"position": [-1.0, -1.0, 1.0]},
                "surface": {
                    "size": [1.0, 1.0],
                    "height_offset": 1.0,
                    "cell_size": 1.0,
                },
                "solver": {
                    "max_depth": 1,
                    "samples_per_tx": 16,
                    "specular_reflection": False,
                    "refraction": False,
                },
            },
        )

        self.assertEqual(result["surface"]["cell_count"], 2)
        self.assertEqual(result["values"]["count"], 2)
        self.assertEqual(len(result["values"]["data"]), 2)
        self.assertTrue(
            all(value is None or math.isfinite(value) for value in result["values"]["data"])
        )
        self.assertEqual(list(runtime.scene.transmitters), [])
        self.assertEqual(list(runtime.scene.receivers), [])

    def test_real_deepmimo_export_worker(self) -> None:
        from backend import config
        from backend.rt.deepmimo_export_worker import run

        job_dir = self.root / "deepmimo_job"
        job_dir.mkdir()
        payload = {
            "roi": {"min": [-1.25, -1.25], "max": [-0.75, -0.75]},
            "tx": {"position": [-1.0, 1.0, 1.0]},
            "rx_grid": {
                "spacing": 1.0,
                "height": 1.0,
                "max_receivers": 1,
                "chunk_size": 1,
                "filter_buildings": False,
            },
            "scene": {"tile_ids": ["SMOKE"]},
            "solver": {
                "max_depth": 1,
                "samples_per_src": 16,
                "max_num_paths_per_src": 8,
                "specular_reflection": False,
                "refraction": False,
                "diffraction_lit_region": False,
            },
            "export": {"scenario_name": "runtime_smoke"},
        }
        (job_dir / "payload.json").write_text(json.dumps(payload), encoding="utf-8")

        with (
            patch.object(config, "SCENE_ROOT", self.scene_root),
            patch.object(config, "DEEPMIMO_CONVERT_SCENE_GEOMETRY", False),
        ):
            run(job_dir)

        progress = json.loads((job_dir / "progress.json").read_text(encoding="utf-8"))
        result = json.loads((job_dir / "result.json").read_text(encoding="utf-8"))
        archive_path = job_dir / "dataset.zip"
        self.assertEqual(progress["status"], "succeeded")
        self.assertEqual(result["receiver_count"], 1)
        self.assertEqual(result["scene_scope"]["tile_ids"], ["SMOKE"])
        self.assertEqual(result["scene_scope"]["shape_count"], 1)
        self.assertTrue(archive_path.is_file())
        self.assertGreater(archive_path.stat().st_size, 0)
        with zipfile.ZipFile(archive_path) as archive:
            names = set(archive.namelist())
        self.assertIn("params.json", names)
        self.assertTrue(any(name.startswith("power_") and name.endswith(".npz") for name in names))


if __name__ == "__main__":
    unittest.main()
