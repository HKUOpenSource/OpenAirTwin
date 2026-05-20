from __future__ import annotations

import argparse
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import shutil
import traceback

import numpy as np

from backend import config
from backend.rt.common import build_scene
from backend.rt.deepmimo_payload import parse_deepmimo_payload, validate_receiver_grid_limit
from backend.rt.terrain_patch import sample_points_on_terrain
from backend.scene.tile_scene_xml import TileSceneXmlBuilder, TileSceneXmlResult
from backend.scene.xml_catalog import load_scene_manifest
from backend.scene.tile_bundles import _read_source_mesh, _read_source_ply_header


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _write_progress(job_dir: Path, status: str, progress: float, message: str, **extra) -> None:
    payload = {
        "status": status,
        "progress": float(max(0.0, min(1.0, progress))),
        "message": message,
        "updated_at": _utc_now(),
        "updated_at_epoch": __import__("time").time(),
        **extra,
    }
    temp_path = job_dir / "progress.json.tmp"
    temp_path.write_text(json.dumps(payload, allow_nan=False, indent=2), encoding="utf-8")
    temp_path.replace(job_dir / "progress.json")


def _load_payload(job_dir: Path) -> dict:
    return parse_deepmimo_payload(json.loads((job_dir / "payload.json").read_text(encoding="utf-8")))


def _receiver_grid(
    min_xy: tuple[float, float],
    max_xy: tuple[float, float],
    spacing: float,
    *,
    max_receivers: int,
) -> np.ndarray:
    validate_receiver_grid_limit(min_xy, max_xy, spacing, max_receivers)
    xs = np.arange(float(min_xy[0]), float(max_xy[0]) + (spacing * 0.5), spacing, dtype=np.float32)
    ys = np.arange(float(min_xy[1]), float(max_xy[1]) + (spacing * 0.5), spacing, dtype=np.float32)
    xx, yy = np.meshgrid(xs, ys)
    return np.column_stack([xx.reshape(-1), yy.reshape(-1)]).astype(np.float32, copy=False)


def _building_aabbs(
    scene_root: Path,
    tile_ids: tuple[str, ...],
    roi_min: tuple[float, float],
    roi_max: tuple[float, float],
) -> np.ndarray:
    manifest = load_scene_manifest(scene_root)
    selected_tile_ids = set(tile_ids)
    boxes: list[tuple[float, float, float, float]] = []
    roi_min_x, roi_min_y = roi_min
    roi_max_x, roi_max_y = roi_max
    for mesh in manifest.meshes:
        if mesh.tile not in selected_tile_ids or mesh.category != "BUILDING":
            continue
        path = scene_root / mesh.relative_path
        if not path.exists():
            continue
        try:
            header = _read_source_ply_header(path)
            vertices, _ = _read_source_mesh(path, header)
        except Exception:
            continue
        if vertices.size == 0:
            continue
        min_x = float(np.min(vertices[:, 0]))
        max_x = float(np.max(vertices[:, 0]))
        min_y = float(np.min(vertices[:, 1]))
        max_y = float(np.max(vertices[:, 1]))
        if max_x < roi_min_x or min_x > roi_max_x or max_y < roi_min_y or min_y > roi_max_y:
            continue
        boxes.append((min_x, min_y, max_x, max_y))
    return np.asarray(boxes, dtype=np.float32)


def _write_selected_tile_scene_xml(job_dir: Path, tile_ids: tuple[str, ...]) -> tuple[TileSceneXmlResult, str]:
    builder = TileSceneXmlBuilder(
        config.SCENE_ROOT,
        job_dir / "scene_xml",
    )
    result = builder.write_selection(tile_ids)
    return result, builder.source_mode


def _deepmimo_output_dir(job_dir: Path, rt_export_dir: Path, converted_name: object, scenario_name: str) -> Path:
    candidates = [
        job_dir / "deepmimo_scenarios" / str(converted_name or scenario_name),
        rt_export_dir / str(converted_name or scenario_name),
        rt_export_dir / f"{scenario_name}_deepmimo",
    ]
    for candidate in candidates:
        if candidate.exists() and candidate.is_dir():
            return candidate
    for root in [job_dir / "deepmimo_scenarios", rt_export_dir]:
        if root.exists():
            fallback = next((path for path in root.iterdir() if path.is_dir() and path.name.endswith("_deepmimo")), None)
            if fallback is not None:
                return fallback
            fallback = next((path for path in root.iterdir() if path.is_dir()), None)
            if fallback is not None:
                return fallback
    raise FileNotFoundError("DeepMIMO converter did not create a scenario directory")


def _convert_to_deepmimo(rt_export_dir: Path, scenario_name: str, *, convert_scene_geometry: bool) -> object:
    from deepmimo.converters.sionna_rt import sionna_converter

    original_read_scene = sionna_converter.read_scene
    if not convert_scene_geometry:
        sionna_converter.read_scene = lambda *args, **kwargs: None
    try:
        return sionna_converter.sionna_rt_converter(
            str(rt_export_dir),
            scenario_name=scenario_name,
            overwrite=True,
            vis_scene=False,
            print_params=False,
        )
    finally:
        sionna_converter.read_scene = original_read_scene


def _filter_building_aabbs(points_xy: np.ndarray, boxes: np.ndarray) -> np.ndarray:
    if boxes.size == 0 or points_xy.size == 0:
        return np.ones(points_xy.shape[0], dtype=bool)
    keep = np.ones(points_xy.shape[0], dtype=bool)
    chunk_size = 2048
    for start in range(0, points_xy.shape[0], chunk_size):
        stop = min(start + chunk_size, points_xy.shape[0])
        chunk = points_xy[start:stop]
        inside = (
            (chunk[:, None, 0] >= boxes[None, :, 0])
            & (chunk[:, None, 0] <= boxes[None, :, 2])
            & (chunk[:, None, 1] >= boxes[None, :, 1])
            & (chunk[:, None, 1] <= boxes[None, :, 3])
        )
        keep[start:stop] = ~inside.any(axis=1)
    return keep


def _configure_single_element_arrays(scene) -> None:
    from sionna.rt import PlanarArray

    array = PlanarArray(
        num_rows=1,
        num_cols=1,
        vertical_spacing=0.5,
        horizontal_spacing=0.5,
        pattern="iso",
        polarization="V",
    )
    scene.tx_array = array
    scene.rx_array = array


def _remove_devices(scene, names: list[str]) -> None:
    for name in names:
        try:
            scene.remove(name)
        except Exception:
            pass


def _solve_chunk(scene, tx_position: tuple[float, float, float], tx_orientation: tuple[float, float, float], rx_positions: np.ndarray, solver: dict):
    from sionna.rt import PathSolver, Receiver, Transmitter

    device_names = ["tx_deepmimo"]
    try:
        scene.add(Transmitter(name="tx_deepmimo", position=tx_position, orientation=tx_orientation))
        for index, position in enumerate(rx_positions):
            name = f"rx_deepmimo_{index:05d}"
            device_names.append(name)
            scene.add(Receiver(name=name, position=tuple(float(value) for value in position), orientation=(0.0, 0.0, 0.0)))
        params = {
            "max_depth": solver["max_depth"],
            "max_num_paths_per_src": solver["max_num_paths_per_src"],
            "samples_per_src": solver["samples_per_src"],
            "synthetic_array": True,
            "los": solver["los"],
            "specular_reflection": solver["specular_reflection"],
            "diffuse_reflection": solver["diffuse_reflection"],
            "refraction": solver["refraction"],
            "diffraction": solver["diffraction"],
            "edge_diffraction": solver["edge_diffraction"],
            "diffraction_lit_region": solver["diffraction_lit_region"],
            "seed": solver["seed"],
        }
        return PathSolver()(scene, **params), params
    finally:
        _remove_devices(scene, device_names)


def _zip_directory(source_dir: Path, archive_path: Path) -> None:
    if archive_path.exists():
        archive_path.unlink()
    base_name = archive_path.with_suffix("")
    result = shutil.make_archive(str(base_name), "zip", root_dir=str(source_dir))
    Path(result).replace(archive_path)


def run(job_dir: Path) -> None:
    payload = _load_payload(job_dir)
    _write_progress(job_dir, "running", 0.02, "Preparing receiver grid")
    roi = payload["roi"]
    rx_grid = payload["rx_grid"]
    tile_ids = tuple(payload["scene"]["tile_ids"])
    candidates_xy = _receiver_grid(
        roi["min"],
        roi["max"],
        rx_grid["spacing"],
        max_receivers=rx_grid["max_receivers"],
    )

    _write_progress(job_dir, "running", 0.06, f"Filtering {candidates_xy.shape[0]} receiver candidates")
    if rx_grid["filter_buildings"]:
        boxes = _building_aabbs(config.SCENE_ROOT, tile_ids, roi["min"], roi["max"])
        keep = _filter_building_aabbs(candidates_xy, boxes)
        filtered_xy = candidates_xy[keep]
    else:
        boxes = np.empty((0, 4), dtype=np.float32)
        filtered_xy = candidates_xy
    if filtered_xy.shape[0] == 0:
        raise ValueError("No receiver locations remain after building filtering")

    _write_progress(job_dir, "running", 0.1, f"Generating scene for {len(tile_ids)} selected tile(s)")
    xml_result, source_mode = _write_selected_tile_scene_xml(job_dir, tile_ids)

    _write_progress(job_dir, "running", 0.12, "Loading selected-tile Sionna RT scene")
    scene = build_scene(xml_result.path, payload["solver"]["frequency_hz"])
    _configure_single_element_arrays(scene)
    scene.frequency = float(payload["solver"]["frequency_hz"])

    _write_progress(job_dir, "running", 0.2, "Projecting receivers to terrain")
    rx_positions, _ = sample_points_on_terrain(
        scene,
        filtered_xy,
        center_xy=roi["center"],
        size_xy=roi["size"],
        height_offset=rx_grid["height"],
    )

    np.save(job_dir / "rx_positions.npy", rx_positions)
    rt_export_dir = job_dir / "sionna_rt_export"
    rt_export_dir.mkdir(parents=True, exist_ok=True)
    chunk_size = int(rx_grid["chunk_size"])
    chunks = [rx_positions[start:start + chunk_size] for start in range(0, rx_positions.shape[0], chunk_size)]
    paths_dicts = []
    compute_params = None
    from deepmimo.exporters.sionna_exporter import export_paths, sionna_exporter

    for index, chunk in enumerate(chunks):
        chunk_progress = 0.22 + (0.58 * index / max(len(chunks), 1))
        _write_progress(
            job_dir,
            "running",
            chunk_progress,
            f"Tracing chunk {index + 1}/{len(chunks)} ({chunk.shape[0]} receivers)",
        )
        paths, compute_params = _solve_chunk(
            scene,
            payload["tx"]["position"],
            payload["tx"]["orientation"],
            chunk,
            payload["solver"],
        )
        paths_dicts.extend(export_paths(paths))

    _write_progress(job_dir, "running", 0.82, "Exporting Sionna RT paths")
    assert compute_params is not None
    sionna_exporter(scene, paths_dicts, compute_params, str(rt_export_dir))

    convert_scene_geometry = bool(config.DEEPMIMO_CONVERT_SCENE_GEOMETRY)
    convert_message = "Converting to DeepMIMO"
    if not convert_scene_geometry:
        convert_message = "Converting to DeepMIMO without scene geometry"
    _write_progress(job_dir, "running", 0.9, convert_message)

    scenario_name = payload["export"]["scenario_name"]
    previous_cwd = os.getcwd()
    try:
        os.chdir(job_dir)
        converted_name = _convert_to_deepmimo(
            rt_export_dir,
            scenario_name,
            convert_scene_geometry=convert_scene_geometry,
        )
    finally:
        os.chdir(previous_cwd)
    scenario_dir = _deepmimo_output_dir(job_dir, rt_export_dir, converted_name, scenario_name)
    archive_path = job_dir / "dataset.zip"
    _write_progress(job_dir, "running", 0.96, "Packaging dataset")
    _zip_directory(scenario_dir, archive_path)
    result = {
        "scenario_name": scenario_dir.name,
        "candidate_receivers": int(candidates_xy.shape[0]),
        "receiver_count": int(rx_positions.shape[0]),
        "filtered_building_receivers": int(candidates_xy.shape[0] - filtered_xy.shape[0]),
        "building_aabb_count": int(boxes.shape[0]),
        "scene_scope": {
            "mode": "selected_tiles",
            "tile_ids": list(xml_result.tile_ids),
            "shape_count": int(xml_result.shape_count),
            "source_mode": source_mode,
            "scene_xml": str(xml_result.path),
        },
        "deepmimo_scene_geometry_converted": convert_scene_geometry,
        "chunk_count": int(len(chunks)),
        "archive_name": archive_path.name,
        "archive_size_bytes": int(archive_path.stat().st_size),
    }
    (job_dir / "result.json").write_text(json.dumps(result, allow_nan=False, indent=2), encoding="utf-8")
    _write_progress(job_dir, "succeeded", 1.0, "DeepMIMO dataset ready", result=result)


def main() -> int:
    parser = argparse.ArgumentParser(description="Run a DeepMIMO export job.")
    parser.add_argument("--job-dir", required=True)
    args = parser.parse_args()
    job_dir = Path(args.job_dir).resolve()
    try:
        run(job_dir)
    except Exception as exc:
        traceback.print_exception(type(exc), exc, exc.__traceback__)
        _write_progress(
            job_dir,
            "failed",
            1.0,
            "DeepMIMO export failed",
            error=str(exc) or "DeepMIMO export failed",
        )
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
