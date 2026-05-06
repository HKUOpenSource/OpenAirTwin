from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from threading import Lock
from time import perf_counter

from backend.rt.common import build_scene, create_planar_array


def log_timing(label: str, started_at: float, **fields: object) -> None:
    elapsed = perf_counter() - started_at
    details = " ".join(f"{key}={value}" for key, value in fields.items())
    suffix = f" {details}" if details else ""
    print(f"[rt] {label} elapsed={elapsed:.3f}s{suffix}", flush=True)


@dataclass
class RTRuntime:
    scene_xml: Path
    default_frequency_hz: float
    lock: Lock = field(default_factory=Lock, init=False)
    scene: object = field(init=False)
    preload_seconds: float = field(init=False)

    def __post_init__(self) -> None:
        started_at = perf_counter()
        self.scene = build_scene(self.scene_xml, self.default_frequency_hz)
        self.preload_seconds = perf_counter() - started_at
        print(
            f"[rt] scene_preload elapsed={self.preload_seconds:.3f}s scene_xml={self.scene_xml}",
            flush=True,
        )

    def set_frequency(self, frequency_hz: float) -> None:
        self.scene.frequency = float(frequency_hz)

    def set_tx_array(self, array_config: dict) -> None:
        self.scene.tx_array = create_planar_array(array_config)

    def set_rx_array(self, array_config: dict) -> None:
        self.scene.rx_array = create_planar_array(array_config)

    def set_arrays(self, *, tx_array: dict | None = None, rx_array: dict | None = None) -> None:
        if tx_array is not None:
            self.set_tx_array(tx_array)
        if rx_array is not None:
            self.set_rx_array(rx_array)
