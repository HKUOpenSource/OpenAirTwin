from __future__ import annotations

import argparse
import statistics

from backend.rt.radar_payload import RADAR_TARGET_ASSET_IDS
from backend.rt.radar_small_target import (
    RADAR_SMALL_TARGET_DISTANCES_M,
    RADAR_SMALL_TARGET_SAMPLE_TIERS,
    RADAR_SMALL_TARGET_SEEDS,
    build_ordinary_sbr_validation_scene,
    build_unobstructed_validation_scene,
    probe_ordinary_sbr,
    solve_target_directed_scatter,
)


def _number(value: float | None, digits: int = 3) -> str:
    return "—" if value is None else f"{value:.{digits}f}"


def run_validation(*, include_ordinary_sbr: bool = True) -> tuple[list[dict], list[dict]]:
    ordinary_records: list[dict] = []
    directed_records: list[dict] = []
    for asset_id in sorted(RADAR_TARGET_ASSET_IDS):
        for mode in ("monostatic", "bistatic"):
            for distance_m in RADAR_SMALL_TARGET_DISTANCES_M:
                directed_scene = build_unobstructed_validation_scene(asset_id, distance_m, mode)
                for index, seed in enumerate(RADAR_SMALL_TARGET_SEEDS):
                    result = solve_target_directed_scatter(
                        directed_scene,
                        seed=seed,
                        sample_budget=RADAR_SMALL_TARGET_SAMPLE_TIERS[index],
                    )
                    if result is not None:
                        directed_records.append(result)

                if not include_ordinary_sbr:
                    continue
                ordinary_scene = build_ordinary_sbr_validation_scene(asset_id, distance_m, mode)
                for samples_per_src in RADAR_SMALL_TARGET_SAMPLE_TIERS:
                    for seed in RADAR_SMALL_TARGET_SEEDS:
                        ordinary_records.append(
                            probe_ordinary_sbr(
                                ordinary_scene,
                                samples_per_src=samples_per_src,
                                seed=seed,
                            )
                        )
    return ordinary_records, directed_records


def render_markdown(ordinary_records: list[dict], directed_records: list[dict]) -> str:
    lines = [
        "# RS-03 small-target validation",
        "",
        "| Asset | Mode | Distance (m) | SBR valid paths | SBR target hits | Directed hits | Delay (µs) | Doppler (Hz) | Gain (dB) | Directed mean (ms) |",
        "| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
    ]
    for asset_id in sorted(RADAR_TARGET_ASSET_IDS):
        for mode in ("monostatic", "bistatic"):
            for distance_m in RADAR_SMALL_TARGET_DISTANCES_M:
                ordinary = [
                    record
                    for record in ordinary_records
                    if record["asset_id"] == asset_id
                    and record["mode"] == mode
                    and record["target_distance_m"] == distance_m
                ]
                directed = [
                    record
                    for record in directed_records
                    if record["asset_id"] == asset_id
                    and record["mode"] == mode
                    and record["target_distance_m"] == distance_m
                ]
                reference = directed[0] if directed else None
                ordinary_hits = sum(1 for record in ordinary if record["hit"])
                ordinary_valid_paths = sum(record["valid_path_count"] for record in ordinary)
                lines.append(
                    "| "
                    + " | ".join(
                        (
                            asset_id,
                            mode,
                            f"{distance_m:.0f}",
                            str(ordinary_valid_paths) if ordinary else "not run",
                            f"{ordinary_hits}/{len(ordinary)}" if ordinary else "not run",
                            f"{len(directed)}/3",
                            _number(None if reference is None else reference["delay_s"] * 1e6, 4),
                            _number(None if reference is None else reference["doppler_hz"], 3),
                            _number(None if reference is None else reference["power_gain_db"], 3),
                            _number(
                                None
                                if not directed
                                else statistics.fmean(record["runtime_ms"] for record in directed),
                                3,
                            ),
                        )
                    )
                    + " |"
                )
    if directed_records:
        runtimes = [record["runtime_ms"] for record in directed_records]
        lines.extend(
            (
                "",
                f"Directed paths: {len(directed_records)}/{len(RADAR_TARGET_ASSET_IDS) * 2 * len(RADAR_SMALL_TARGET_DISTANCES_M) * len(RADAR_SMALL_TARGET_SEEDS)} hits; mean {statistics.fmean(runtimes):.3f} ms; max {max(runtimes):.3f} ms.",
            )
        )
    if ordinary_records:
        runtimes = [record["runtime_ms"] for record in ordinary_records]
        hits = sum(1 for record in ordinary_records if record["hit"])
        lines.append(
            f"Ordinary SBR: {hits}/{len(ordinary_records)} hits; mean {statistics.fmean(runtimes):.3f} ms; max {max(runtimes):.3f} ms."
        )
    return "\n".join(lines)


def main() -> int:
    parser = argparse.ArgumentParser(description="Run the bounded RS-03 Radar small-target verification")
    parser.add_argument(
        "--directed-only",
        action="store_true",
        help="Skip ordinary SBR probes and run only the deterministic directed path checks",
    )
    args = parser.parse_args()
    ordinary, directed = run_validation(include_ordinary_sbr=not args.directed_only)
    print(render_markdown(ordinary, directed))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
