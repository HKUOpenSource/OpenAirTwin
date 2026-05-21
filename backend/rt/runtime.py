from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass, field
import gc
from pathlib import Path
import sys
from threading import Lock, Thread
from time import perf_counter
import traceback

from backend.rt.common import build_scene, create_planar_array
from backend.scene.tile_scene_xml import TileSceneXmlBuilder, TileSceneXmlResult


def log_timing(label: str, started_at: float, **fields: object) -> None:
    elapsed = perf_counter() - started_at
    details = " ".join(f"{key}={value}" for key, value in fields.items())
    suffix = f" {details}" if details else ""
    print(f"[rt] {label} elapsed={elapsed:.3f}s{suffix}", flush=True)


class SceneNotReady(RuntimeError):
    def __init__(self, status: str, message: str) -> None:
        super().__init__(message)
        self.status = status
        self.message = message


STALE_SCENE_MESSAGE = "Sionna RT scene changed since this job was queued; create a new job"


def current_scene_generation(rt_runtime) -> int | None:
    generation = getattr(rt_runtime, "generation", None)
    if generation is None and hasattr(rt_runtime, "status_dict"):
        generation = rt_runtime.status_dict().get("generation")
    if generation is None:
        return None
    return int(generation)


def require_scene_generation(rt_runtime, expected_generation: int | None) -> None:
    if expected_generation is None:
        return
    current_generation = current_scene_generation(rt_runtime)
    if current_generation is None:
        return
    if current_generation != int(expected_generation):
        raise SceneNotReady("stale", STALE_SCENE_MESSAGE)


@dataclass
class RTRuntime:
    default_frequency_hz: float
    scene_builder: TileSceneXmlBuilder
    scene_loader: Callable[[Path, float], object] = build_scene
    lock: Lock = field(default_factory=Lock, init=False)
    load_lock: Lock = field(default_factory=Lock, init=False)
    scene: object | None = field(default=None, init=False)
    status: str = field(default="empty", init=False)
    message: str = field(default="No Sionna RT tiles selected", init=False)
    generation: int = field(default=0, init=False)
    active_tile_ids: tuple[str, ...] = field(default_factory=tuple, init=False)
    requested_tile_ids: tuple[str, ...] = field(default_factory=tuple, init=False)
    active_scene_xml: Path | None = field(default=None, init=False)
    active_shape_count: int = field(default=0, init=False)
    requested_shape_count: int = field(default=0, init=False)
    preload_seconds: float | None = field(default=None, init=False)

    def __post_init__(self) -> None:
        print(
            "[rt] scene_preload skipped lazy=true",
            flush=True,
        )

    def _status_dict_unlocked(self) -> dict:
        return {
            "ok": self.status != "failed",
            "status": self.status,
            "active_tile_ids": list(self.active_tile_ids),
            "requested_tile_ids": list(self.requested_tile_ids),
            "generation": int(self.generation),
            "message": self.message,
            "preload_seconds": self.preload_seconds,
            "scene_xml": None if self.active_scene_xml is None else str(self.active_scene_xml),
            "shape_count": int(self.active_shape_count),
            "requested_shape_count": int(self.requested_shape_count),
        }

    def status_dict(self) -> dict:
        with self.lock:
            return self._status_dict_unlocked()

    def request_scene_selection(self, tile_ids: object) -> dict:
        with self.lock:
            normalized_tile_ids = self.scene_builder.normalize_tile_ids(tile_ids)
            normalized_tile_ids = tuple(normalized_tile_ids)
            if self.status == "ready" and normalized_tile_ids == self.active_tile_ids:
                self.requested_tile_ids = self.active_tile_ids
                return self._status_dict_unlocked()
            if self.status == "loading" and normalized_tile_ids == self.requested_tile_ids:
                return self._status_dict_unlocked()

            self.generation += 1
            generation = self.generation
            self.requested_tile_ids = normalized_tile_ids
            self.requested_shape_count = self.scene_builder.shape_count_for_tiles(normalized_tile_ids)
            self.preload_seconds = None
            self.active_scene_xml = None
            self.active_shape_count = 0
            self.scene = None
            self.active_tile_ids = ()

            if not normalized_tile_ids:
                self.status = "empty"
                self.message = "No Sionna RT tiles selected"
                status = self._status_dict_unlocked()
            else:
                self.status = "loading"
                self.message = f"Load scene for {len(normalized_tile_ids)} tile(s)"
                status = self._status_dict_unlocked()

        self._flush_runtime_memory()

        if normalized_tile_ids:
            worker = Thread(
                target=self._load_selection,
                args=(generation, tuple(normalized_tile_ids)),
                daemon=True,
            )
            worker.start()

        return status

    def require_ready(self):
        if self.scene is None or self.status != "ready":
            message = (
                "Sionna scene is still loading"
                if self.status == "loading"
                else "No Sionna RT scene is ready; select at least one tile"
            )
            if self.status == "failed":
                message = self.message or "Sionna RT scene failed to load"
            raise SceneNotReady(self.status, message)
        return self.scene

    def set_frequency(self, frequency_hz: float) -> None:
        self.require_ready().frequency = float(frequency_hz)

    def set_tx_array(self, array_config: dict) -> None:
        self.require_ready().tx_array = create_planar_array(array_config)

    def set_rx_array(self, array_config: dict) -> None:
        self.require_ready().rx_array = create_planar_array(array_config)

    def set_arrays(self, *, tx_array: dict | None = None, rx_array: dict | None = None) -> None:
        if tx_array is not None:
            self.set_tx_array(tx_array)
        if rx_array is not None:
            self.set_rx_array(rx_array)

    def _load_selection(self, generation: int, tile_ids: tuple[str, ...]) -> None:
        with self.load_lock:
            if generation != self.generation:
                return

            xml_result: TileSceneXmlResult | None = None
            loaded_scene = None
            started_at = perf_counter()
            try:
                xml_result = self.scene_builder.write_selection(tile_ids)
                loaded_scene = self.scene_loader(xml_result.path, self.default_frequency_hz)
                elapsed = perf_counter() - started_at
            except Exception as exc:
                traceback.print_exception(type(exc), exc, exc.__traceback__, file=sys.stderr)
                if generation == self.generation:
                    with self.lock:
                        if generation == self.generation:
                            self.scene = None
                            self.active_tile_ids = ()
                            self.active_scene_xml = None
                            self.active_shape_count = 0
                            self.preload_seconds = None
                            self.status = "failed"
                            self.message = str(exc) or "Sionna RT scene failed to load"
                    self._flush_runtime_memory()
                return

            if generation != self.generation:
                loaded_scene = None
                self._flush_runtime_memory()
                return

            with self.lock:
                if generation != self.generation:
                    loaded_scene = None
                    self._flush_runtime_memory()
                    return
                self.scene = loaded_scene
                self.status = "ready"
                self.message = f"Sionna RT scene ready for {len(tile_ids)} tile(s)"
                self.active_tile_ids = tile_ids
                self.active_scene_xml = xml_result.path
                self.active_shape_count = xml_result.shape_count
                self.preload_seconds = elapsed

            print(
                f"[rt] scene_preload elapsed={elapsed:.3f}s "
                f"tiles={','.join(tile_ids)} shapes={xml_result.shape_count} scene_xml={xml_result.path}",
                flush=True,
            )

    def _flush_runtime_memory(self) -> None:
        gc.collect()
        try:
            import drjit as dr

            dr.flush_malloc_cache()
            dr.flush_kernel_cache()
        except Exception:
            return
