from __future__ import annotations

import math
from time import perf_counter
from typing import Callable, Iterable

import numpy as np

from backend import config
from backend.rt.radar_payload import (
    RADAR_ANGLE_ESTIMATION_APPLICABILITY,
    RADAR_ANGLE_ESTIMATION_METHOD,
    RADAR_AZIMUTH_DEFINITION,
    RADAR_CFAR_METHOD,
    RADAR_CONTRACT_VERSION,
    RADAR_DIRECT_PATH_CANCELLATION_METHOD,
    RADAR_DOPPLER_WINDOW,
    RADAR_RADIAL_VELOCITY_DEFINITION,
    RADAR_RANGE_WINDOW,
    RADAR_RANGE_DEFINITION,
    RADAR_ZENITH_DEFINITION,
    SPEED_OF_LIGHT_MPS,
    parse_radar_payload,
    validate_radar_result,
)
from backend.rt.solve_radar import solve_radar_propagation


BOLTZMANN_J_PER_K = 1.380_649e-23
RADAR_PROCESSING_SCHEMA_VERSION = RADAR_CONTRACT_VERSION

# Keep exact CFR construction bounded even when the propagation solver returns
# the largest contract-legal path set and waveform. The selection is explicit in
# result statistics and always reserves representatives for every target and
# non-target class before filling the remaining budget by path power.
MAX_RADAR_CFR_PATH_CELL_PRODUCTS = 512_000_000
RADAR_DISPLAY_MAX_PATHS = 96
RADAR_DISPLAY_MAX_CLUTTER_PATHS = 64
RADAR_CLUTTER_SPATIAL_BIN_M = 5.0
RADAR_CLUTTER_AZIMUTH_BIN_DEG = 15.0
RADAR_CLUTTER_RANGE_BIN_M = 10.0


def _dbm_to_watts(value_dbm: float) -> float:
    return 10.0 ** ((float(value_dbm) - 30.0) / 10.0)


def _watts_to_dbm(values: np.ndarray | float) -> np.ndarray:
    array = np.asarray(values, dtype=np.float64)
    return 10.0 * np.log10(np.maximum(array, 1e-30)) + 30.0


def _normalized_hann(length: int) -> np.ndarray:
    window = np.hanning(length).astype(np.float64)
    rms = math.sqrt(float(np.mean(window * window)))
    if not math.isfinite(rms) or rms <= 0.0:
        raise ValueError("Radar processing window has zero energy")
    return window / rms


def _path_sort_key(path: dict) -> tuple[float, str]:
    return (-float(path.get("path_gain_linear", 0.0)), str(path.get("path_id", "")))


def _select_signal_paths(paths: list[dict], waveform_cells: int) -> tuple[list[dict], bool]:
    max_paths = max(1, MAX_RADAR_CFR_PATH_CELL_PRODUCTS // max(1, waveform_cells))
    if len(paths) <= max_paths:
        return list(paths), False

    selected: list[dict] = []
    selected_ids: set[str] = set()

    def reserve(candidates: Iterable[dict]) -> None:
        if len(selected) >= max_paths:
            return
        strongest = min(candidates, key=_path_sort_key, default=None)
        if strongest is None:
            return
        identity = str(strongest.get("path_id", ""))
        if identity not in selected_ids:
            selected.append(strongest)
            selected_ids.add(identity)

    target_ids = sorted(
        {
            str(target_id)
            for path in paths
            if path.get("classification") == "target"
            for target_id in path.get("target_ids", [])
        }
    )
    for target_id in target_ids:
        reserve(path for path in paths if target_id in path.get("target_ids", []))
    for classification in ("clutter", "direct"):
        reserve(path for path in paths if path.get("classification") == classification)

    for path in sorted(paths, key=_path_sort_key):
        if len(selected) >= max_paths:
            break
        identity = str(path.get("path_id", ""))
        if identity in selected_ids:
            continue
        selected.append(path)
        selected_ids.add(identity)
    return selected, True


def _path_geometry_signature(path: dict) -> tuple:
    return (
        str(path.get("classification", "")),
        tuple(str(value) for value in path.get("target_ids", [])),
        tuple(
            tuple(round(float(component), 3) for component in vertex)
            for vertex in path.get("polyline", [])
        ),
    )


def _first_environment_vertex(path: dict) -> tuple[float, float, float] | None:
    for interaction in path.get("object_chain", []):
        if interaction.get("target_id") is None:
            vertex = interaction.get("vertex_m")
            if isinstance(vertex, (list, tuple)) and len(vertex) == 3:
                return tuple(float(component) for component in vertex)
    polyline = path.get("polyline", [])
    if len(polyline) > 2:
        return tuple(float(component) for component in polyline[1])
    return None


def _select_public_paths(
    paths: list[dict],
    *,
    max_paths: int = RADAR_DISPLAY_MAX_PATHS,
) -> tuple[list[dict], dict]:
    """Select spatially useful display paths without changing signal synthesis."""

    source_clutter = [path for path in paths if path.get("classification") == "clutter"]
    strongest_by_geometry: dict[tuple, dict] = {}
    for path in sorted(paths, key=_path_sort_key):
        strongest_by_geometry.setdefault(_path_geometry_signature(path), path)
    unique_paths = list(strongest_by_geometry.values())

    selected: list[dict] = []
    selected_ids: set[str] = set()

    def add(path: dict | None) -> None:
        if path is None or len(selected) >= max_paths:
            return
        identity = str(path.get("path_id", ""))
        if identity in selected_ids:
            return
        selected.append(path)
        selected_ids.add(identity)

    target_ids = sorted(
        {
            str(target_id)
            for path in unique_paths
            if path.get("classification") == "target"
            for target_id in path.get("target_ids", [])
        }
    )
    for target_id in target_ids:
        add(
            min(
                (path for path in unique_paths if target_id in path.get("target_ids", [])),
                key=_path_sort_key,
                default=None,
            )
        )
    add(
        min(
            (path for path in unique_paths if path.get("classification") == "direct"),
            key=_path_sort_key,
            default=None,
        )
    )

    strongest_clutter_by_bucket: dict[tuple, dict] = {}
    for path in sorted(
        (item for item in unique_paths if item.get("classification") == "clutter"),
        key=_path_sort_key,
    ):
        vertex = _first_environment_vertex(path)
        voxel: tuple[int, int, int] | tuple[str, str]
        if vertex is None:
            voxel = ("path", str(path.get("path_id", "")))
        else:
            voxel = tuple(math.floor(component / RADAR_CLUTTER_SPATIAL_BIN_M) for component in vertex)
        azimuth_bin = math.floor(
            (float(path.get("departure_azimuth_deg", 0.0)) + 180.0)
            / RADAR_CLUTTER_AZIMUTH_BIN_DEG
        )
        range_bin = math.floor(float(path.get("equivalent_range_m", 0.0)) / RADAR_CLUTTER_RANGE_BIN_M)
        strongest_clutter_by_bucket.setdefault((voxel, azimuth_bin, range_bin), path)
    clutter_by_range: dict[int, list[dict]] = {}
    for bucket, path in strongest_clutter_by_bucket.items():
        clutter_by_range.setdefault(int(bucket[2]), []).append(path)
    for candidates in clutter_by_range.values():
        candidates.sort(key=_path_sort_key)
    returned_clutter = 0
    while clutter_by_range and returned_clutter < RADAR_DISPLAY_MAX_CLUTTER_PATHS and len(selected) < max_paths:
        emptied: list[int] = []
        for range_bin in sorted(clutter_by_range):
            candidates = clutter_by_range[range_bin]
            if candidates and returned_clutter < RADAR_DISPLAY_MAX_CLUTTER_PATHS:
                before = len(selected)
                add(candidates.pop(0))
                returned_clutter += len(selected) - before
            if not candidates:
                emptied.append(range_bin)
        for range_bin in emptied:
            clutter_by_range.pop(range_bin, None)

    for path in sorted(unique_paths, key=_path_sort_key):
        if path.get("classification") == "target":
            add(path)

    returned_clutter_count = sum(
        1 for path in selected if path.get("classification") == "clutter"
    )
    metadata = {
        "source_path_count": len(paths),
        "unique_geometry_path_count": len(unique_paths),
        "returned_path_count": len(selected),
        "source_clutter_path_count": len(source_clutter),
        "spatial_clutter_bin_count": len(strongest_clutter_by_bucket),
        "returned_clutter_path_count": returned_clutter_count,
        "spatial_bin_m": RADAR_CLUTTER_SPATIAL_BIN_M,
        "azimuth_bin_deg": RADAR_CLUTTER_AZIMUTH_BIN_DEG,
        "range_bin_m": RADAR_CLUTTER_RANGE_BIN_M,
        "reduced": len(selected) < len(paths),
    }
    return [_public_path(path) for path in selected], metadata


def _synthesize_cfr(paths: Iterable[dict], params: dict) -> np.ndarray:
    waveform = params["waveform"]
    signal = params["signal"]
    num_subcarriers = int(waveform["num_subcarriers"])
    num_symbols = int(waveform["num_symbols"])
    subcarrier_spacing_hz = float(waveform["subcarrier_spacing_hz"])
    symbol_duration_s = float(waveform["symbol_duration_s"])
    subcarrier_frequencies_hz = np.arange(num_subcarriers, dtype=np.float64) * subcarrier_spacing_hz
    symbol_times_s = np.arange(num_symbols, dtype=np.float64) * symbol_duration_s
    cfr = np.zeros((num_symbols, num_subcarriers), dtype=np.complex128)

    signal_amplitude_scale = math.sqrt(
        _dbm_to_watts(signal["tx_power_dbm"]) / (10.0 ** (float(signal["system_loss_db"]) / 10.0))
    )
    for path in paths:
        coefficient = complex(float(path["coefficient_real"]), float(path["coefficient_imag"]))
        delay_s = float(path["delay_s"])
        doppler_hz = float(path["doppler_hz"])
        range_phase = np.exp(-2j * np.pi * subcarrier_frequencies_hz * delay_s)
        doppler_phase = np.exp(2j * np.pi * symbol_times_s * doppler_hz)
        cfr += signal_amplitude_scale * coefficient * doppler_phase[:, None] * range_phase[None, :]
    return cfr


def _thermal_noise_power_w(params: dict) -> float:
    signal = params["signal"]
    subcarrier_spacing_hz = float(params["waveform"]["subcarrier_spacing_hz"])
    receiver_noise_factor = 10.0 ** (float(signal["noise_figure_db"]) / 10.0)
    return (
        BOLTZMANN_J_PER_K
        * float(signal["noise_temperature_k"])
        * subcarrier_spacing_hz
        * receiver_noise_factor
    )


def _add_reproducible_noise(cfr: np.ndarray, params: dict, noise_power_w: float) -> np.ndarray:
    seed = int(params["solver"]["seed"]) ^ 0x5241_4441
    generator = np.random.default_rng(seed)
    scale = math.sqrt(noise_power_w / 2.0)
    noise = scale * (
        generator.standard_normal(cfr.shape) + 1j * generator.standard_normal(cfr.shape)
    )
    return cfr + noise


def _range_doppler(cfr: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    doppler_window = _normalized_hann(cfr.shape[0])
    range_window = _normalized_hann(cfr.shape[1])
    windowed = cfr * doppler_window[:, None] * range_window[None, :]
    range_response = np.fft.ifft(windowed, axis=1, norm="ortho")
    response = np.fft.fftshift(
        np.fft.fft(range_response, axis=0, norm="ortho"),
        axes=0,
    )
    return range_response, np.abs(response) ** 2


def _rectangle_sums(
    integral: np.ndarray,
    row_starts: np.ndarray,
    row_ends: np.ndarray,
    column_starts: np.ndarray,
    column_ends: np.ndarray,
) -> np.ndarray:
    return (
        integral[row_ends[:, None], column_ends[None, :]]
        - integral[row_starts[:, None], column_ends[None, :]]
        - integral[row_ends[:, None], column_starts[None, :]]
        + integral[row_starts[:, None], column_starts[None, :]]
    )


def _local_maximum_mask(power: np.ndarray) -> np.ndarray:
    rows, columns = power.shape
    local_maximum = np.full_like(power, -np.inf)
    for doppler_offset in (-1, 0, 1):
        rolled = np.roll(power, doppler_offset, axis=0)
        local_maximum = np.maximum(local_maximum, rolled)
        if columns > 1:
            local_maximum[:, 1:] = np.maximum(local_maximum[:, 1:], rolled[:, :-1])
            local_maximum[:, :-1] = np.maximum(local_maximum[:, :-1], rolled[:, 1:])
    return power >= local_maximum


def _ca_cfar_mask(power: np.ndarray, cfar: dict) -> np.ndarray:
    detections = np.zeros(power.shape, dtype=bool)
    if not bool(cfar["enabled"]):
        return detections

    guard_range = int(cfar["guard_cells_range"])
    guard_doppler = int(cfar["guard_cells_doppler"])
    training_range = int(cfar["training_cells_range"])
    training_doppler = int(cfar["training_cells_doppler"])
    outer_range = guard_range + training_range
    outer_doppler = guard_doppler + training_doppler
    rows, columns = power.shape
    valid_columns = np.arange(outer_range, columns - outer_range, dtype=np.int64)
    if valid_columns.size == 0:
        return detections

    padded = np.concatenate((power[-outer_doppler:], power, power[:outer_doppler]), axis=0)
    integral = np.pad(padded, ((1, 0), (1, 0))).cumsum(axis=0).cumsum(axis=1)
    row_starts = np.arange(rows, dtype=np.int64)
    row_ends = row_starts + 2 * outer_doppler + 1
    column_starts = valid_columns - outer_range
    column_ends = valid_columns + outer_range + 1
    outer_sum = _rectangle_sums(integral, row_starts, row_ends, column_starts, column_ends)

    guard_row_starts = row_starts + outer_doppler - guard_doppler
    guard_row_ends = guard_row_starts + 2 * guard_doppler + 1
    guard_column_starts = valid_columns - guard_range
    guard_column_ends = valid_columns + guard_range + 1
    guard_sum = _rectangle_sums(
        integral,
        guard_row_starts,
        guard_row_ends,
        guard_column_starts,
        guard_column_ends,
    )
    training_cell_count = (
        (2 * outer_doppler + 1) * (2 * outer_range + 1)
        - (2 * guard_doppler + 1) * (2 * guard_range + 1)
    )
    alpha = training_cell_count * (
        float(cfar["false_alarm_probability"]) ** (-1.0 / training_cell_count) - 1.0
    )
    threshold = alpha * np.maximum((outer_sum - guard_sum) / training_cell_count, 0.0)
    detections[:, valid_columns] = power[:, valid_columns] > threshold
    detections &= _local_maximum_mask(power)
    return detections


def _aliased_doppler(doppler_hz: float, sampling_rate_hz: float) -> float:
    return (float(doppler_hz) + sampling_rate_hz / 2.0) % sampling_rate_hz - sampling_rate_hz / 2.0


def _associated_paths(
    row: int,
    column: int,
    paths: Iterable[dict],
    *,
    range_resolution_m: float,
    doppler_resolution_hz: float,
    unambiguous_range_m: float,
    doppler_sampling_rate_hz: float,
    range_axis_m: np.ndarray,
    doppler_axis_hz: np.ndarray,
) -> list[dict]:
    candidates: list[tuple[float, float, str, dict]] = []
    for path in paths:
        path_range = float(path["equivalent_range_m"]) % unambiguous_range_m
        path_doppler = _aliased_doppler(float(path["doppler_hz"]), doppler_sampling_rate_hz)
        range_distance = abs(path_range - float(range_axis_m[column])) / range_resolution_m
        raw_doppler_distance = abs(path_doppler - float(doppler_axis_hz[row]))
        doppler_distance = min(
            raw_doppler_distance,
            doppler_sampling_rate_hz - raw_doppler_distance,
        ) / doppler_resolution_hz
        if range_distance <= 1.5 and doppler_distance <= 1.5:
            candidates.append(
                (
                    range_distance * range_distance + doppler_distance * doppler_distance,
                    -float(path.get("path_gain_linear", 0.0)),
                    str(path.get("path_id", "")),
                    path,
                )
            )
    candidates.sort(key=lambda item: item[:3])
    return [item[3] for item in candidates]


def _planar_array_response(path: dict, array: dict) -> np.ndarray:
    rows = int(array["num_rows"])
    columns = int(array["num_cols"])
    vertical_spacing = float(array["vertical_spacing"])
    horizontal_spacing = float(array["horizontal_spacing"])
    zenith_rad = math.radians(float(path["arrival_zenith_deg"]))
    azimuth_rad = math.radians(float(path["arrival_azimuth_deg"]))
    direction_y = math.sin(zenith_rad) * math.sin(azimuth_rad)
    direction_z = math.cos(zenith_rad)
    row_coordinates = (np.arange(rows, dtype=np.float64) - (rows - 1.0) / 2.0) * vertical_spacing
    column_coordinates = (
        np.arange(columns, dtype=np.float64) - (columns - 1.0) / 2.0
    ) * horizontal_spacing
    phase = 2.0 * np.pi * (
        row_coordinates[:, None] * direction_z
        + column_coordinates[None, :] * direction_y
    )
    return np.exp(1j * phase).reshape(-1)


def _array_matched_path(paths: list[dict], array: dict) -> dict | None:
    if not paths:
        return None
    responses = [_planar_array_response(path, array) for path in paths]
    snapshot = np.zeros_like(responses[0])
    for path, response in zip(paths, responses, strict=True):
        coefficient = complex(float(path["coefficient_real"]), float(path["coefficient_imag"]))
        snapshot += coefficient * response
    scored = []
    for path, response in zip(paths, responses, strict=True):
        score = float(abs(np.vdot(response, snapshot)) ** 2 / max(1, response.size * response.size))
        scored.append(
            (
                -score,
                -float(path.get("path_gain_linear", 0.0)),
                str(path.get("path_id", "")),
                path,
            )
        )
    return min(scored)[3]


def _detections(
    power: np.ndarray,
    detection_mask: np.ndarray,
    paths: list[dict],
    params: dict,
    *,
    noise_power_w: float,
    range_axis_m: np.ndarray,
    doppler_axis_hz: np.ndarray,
) -> list[dict]:
    waveform = params["waveform"]
    carrier_frequency_hz = float(waveform["carrier_frequency_hz"])
    bandwidth_hz = float(waveform["bandwidth_hz"])
    subcarrier_spacing_hz = float(waveform["subcarrier_spacing_hz"])
    num_symbols = int(waveform["num_symbols"])
    wavelength_m = SPEED_OF_LIGHT_MPS / carrier_frequency_hz
    range_resolution_m = SPEED_OF_LIGHT_MPS / (2.0 * bandwidth_hz)
    doppler_resolution_hz = subcarrier_spacing_hz / num_symbols
    unambiguous_range_m = SPEED_OF_LIGHT_MPS / (2.0 * subcarrier_spacing_hz)
    records: list[dict] = []
    for row, column in np.argwhere(detection_mask):
        row = int(row)
        column = int(column)
        associated_paths = _associated_paths(
            row,
            column,
            paths,
            range_resolution_m=range_resolution_m,
            doppler_resolution_hz=doppler_resolution_hz,
            unambiguous_range_m=unambiguous_range_m,
            doppler_sampling_rate_hz=subcarrier_spacing_hz,
            range_axis_m=range_axis_m,
            doppler_axis_hz=doppler_axis_hz,
        )
        path = _array_matched_path(associated_paths, params["solver"]["rx_array"])
        target_id = None
        classification = "unassociated"
        arrival_azimuth_deg = 0.0
        arrival_zenith_deg = 90.0
        position_m = None
        position_source = "unavailable"
        if path is not None:
            target_ids = list(path.get("target_ids", []))
            if path.get("classification") == "target" and len(target_ids) == 1:
                target_id = target_ids[0]
                classification = "target"
            elif path.get("classification") in {"clutter", "direct"}:
                classification = "clutter"
            arrival_azimuth_deg = float(path["arrival_azimuth_deg"])
            arrival_zenith_deg = float(path["arrival_zenith_deg"])
            interactions = list(path.get("object_chain", []))
            if classification == "target":
                candidates = [item for item in interactions if item.get("target_id") == target_id]
            else:
                candidates = [item for item in reversed(interactions) if item.get("target_id") is None]
            vertex = candidates[0].get("vertex_m") if candidates else None
            if isinstance(vertex, (list, tuple)) and len(vertex) == 3:
                position_m = [float(value) for value in vertex]
                position_source = "path_interaction"
        doppler_hz = float(doppler_axis_hz[row])
        cell_power_w = float(power[row, column])
        records.append(
            {
                "detection_id": f"detection-{row:04d}-{column:04d}",
                "equivalent_range_m": float(range_axis_m[column]),
                "equivalent_radial_velocity_mps": -wavelength_m * doppler_hz / 2.0,
                "doppler_hz": doppler_hz,
                "power_dbm": float(_watts_to_dbm(cell_power_w)),
                "snr_db": 10.0 * math.log10(max(cell_power_w / noise_power_w, 1e-30)),
                "arrival_azimuth_deg": arrival_azimuth_deg,
                "arrival_zenith_deg": arrival_zenith_deg,
                "target_id": target_id,
                "classification": classification,
                "position_m": position_m,
                "position_source": position_source,
            }
        )
    records.sort(
        key=lambda item: (
            -float(item["snr_db"]),
            float(item["equivalent_range_m"]),
            float(item["doppler_hz"]),
        )
    )
    return records


def _downsample_range_doppler(
    power: np.ndarray,
    range_axis_m: np.ndarray,
    doppler_axis_hz: np.ndarray,
    velocity_axis_mps: np.ndarray,
) -> dict:
    source_doppler_bins, source_range_bins = power.shape
    range_factor = max(1, math.ceil(source_range_bins / config.MAX_RADAR_RESULT_RANGE_BINS))
    doppler_factor = max(1, math.ceil(source_doppler_bins / config.MAX_RADAR_RESULT_DOPPLER_BINS))
    while math.ceil(source_range_bins / range_factor) * math.ceil(
        source_doppler_bins / doppler_factor
    ) > config.MAX_RADAR_RESULT_CELLS:
        if math.ceil(source_range_bins / range_factor) >= math.ceil(source_doppler_bins / doppler_factor):
            range_factor += 1
        else:
            doppler_factor += 1

    pooled_rows: list[list[float]] = []
    returned_doppler: list[float] = []
    returned_velocity: list[float] = []
    for row_start in range(0, source_doppler_bins, doppler_factor):
        row_stop = min(source_doppler_bins, row_start + doppler_factor)
        returned_doppler.append(float(np.mean(doppler_axis_hz[row_start:row_stop])))
        returned_velocity.append(float(np.mean(velocity_axis_mps[row_start:row_stop])))
        row: list[float] = []
        for column_start in range(0, source_range_bins, range_factor):
            column_stop = min(source_range_bins, column_start + range_factor)
            row.append(float(_watts_to_dbm(np.max(power[row_start:row_stop, column_start:column_stop]))))
        pooled_rows.append(row)

    returned_range = [
        float(np.mean(range_axis_m[start : min(source_range_bins, start + range_factor)]))
        for start in range(0, source_range_bins, range_factor)
    ]
    truncated = len(returned_range) < source_range_bins or len(returned_doppler) < source_doppler_bins
    return {
        "equivalent_range_axis_m": returned_range,
        "doppler_axis_hz": returned_doppler,
        "equivalent_radial_velocity_axis_mps": returned_velocity,
        "power_dbm": pooled_rows,
        "source_shape": {
            "doppler_bins": source_doppler_bins,
            "range_bins": source_range_bins,
        },
        "downsample_factor": {
            "doppler": doppler_factor,
            "range": range_factor,
        },
        "truncated": truncated,
    }


def _focus_range_doppler(
    power: np.ndarray,
    range_axis_m: np.ndarray,
    doppler_axis_hz: np.ndarray,
    velocity_axis_mps: np.ndarray,
    *,
    paths: list[dict],
    detections: list[dict],
    range_resolution_m: float,
    doppler_resolution_hz: float,
    unambiguous_range_m: float,
    doppler_sampling_rate_hz: float,
) -> dict:
    target_paths = [path for path in paths if path.get("classification") == "target"]
    focus_paths = target_paths
    if not focus_paths:
        strongest_clutter = min(
            (path for path in paths if path.get("classification") == "clutter"),
            key=_path_sort_key,
            default=None,
        )
        focus_paths = [strongest_clutter] if strongest_clutter is not None else []

    interest_ranges = [
        float(path["equivalent_range_m"]) % unambiguous_range_m for path in focus_paths
    ]
    target_detections = [item for item in detections if item.get("classification") == "target"]
    interest_ranges.extend(float(item["equivalent_range_m"]) for item in target_detections)
    furthest_interest_m = max(interest_ranges, default=0.0)
    range_margin_m = max(10.0, 8.0 * range_resolution_m, 0.2 * furthest_interest_m)
    focus_range_max_m = min(
        float(range_axis_m[-1]),
        max(50.0, furthest_interest_m + range_margin_m),
    )

    interest_doppler = [
        _aliased_doppler(float(path["doppler_hz"]), doppler_sampling_rate_hz)
        for path in focus_paths
    ]
    interest_doppler.extend(float(item["doppler_hz"]) for item in target_detections)
    largest_interest_hz = max((abs(value) for value in interest_doppler), default=0.0)
    focus_doppler_half_span_hz = min(
        doppler_sampling_rate_hz / 2.0,
        max(
            500.0,
            4.0 * doppler_resolution_hz,
            1.25 * largest_interest_hz + 2.0 * doppler_resolution_hz,
        ),
    )

    range_indices = np.flatnonzero(range_axis_m <= focus_range_max_m + range_resolution_m * 0.5)
    doppler_indices = np.flatnonzero(
        np.abs(doppler_axis_hz) <= focus_doppler_half_span_hz + doppler_resolution_hz * 0.5
    )
    if range_indices.size == 0:
        range_indices = np.asarray([0], dtype=np.int64)
    if doppler_indices.size == 0:
        doppler_indices = np.asarray([int(np.argmin(np.abs(doppler_axis_hz)))], dtype=np.int64)
    range_start, range_stop = int(range_indices[0]), int(range_indices[-1]) + 1
    doppler_start, doppler_stop = int(doppler_indices[0]), int(doppler_indices[-1]) + 1
    focused = _downsample_range_doppler(
        power[doppler_start:doppler_stop, range_start:range_stop],
        range_axis_m[range_start:range_stop],
        doppler_axis_hz[doppler_start:doppler_stop],
        velocity_axis_mps[doppler_start:doppler_stop],
    )
    focused["source_offset"] = {
        "doppler_bin": doppler_start,
        "range_bin": range_start,
    }
    focused["window"] = {
        "equivalent_range_min_m": float(range_axis_m[range_start]),
        "equivalent_range_max_m": float(range_axis_m[range_stop - 1]),
        "doppler_min_hz": float(doppler_axis_hz[doppler_start]),
        "doppler_max_hz": float(doppler_axis_hz[doppler_stop - 1]),
        "auto_focus": True,
    }
    return focused


def _build_processing_view(
    *,
    method: str,
    range_response: np.ndarray,
    range_doppler_power: np.ndarray,
    association_paths: list[dict],
    focus_paths: list[dict] | None,
    params: dict,
    noise_power_w: float,
    range_axis_m: np.ndarray,
    doppler_axis_hz: np.ndarray,
    velocity_axis_mps: np.ndarray,
    range_resolution_m: float,
    doppler_resolution_hz: float,
    unambiguous_range_m: float,
    doppler_sampling_rate_hz: float,
) -> tuple[dict, list[dict]]:
    detection_mask = _ca_cfar_mask(range_doppler_power, params["cfar"])
    all_detections = _detections(
        range_doppler_power,
        detection_mask,
        association_paths,
        params,
        noise_power_w=noise_power_w,
        range_axis_m=range_axis_m,
        doppler_axis_hz=doppler_axis_hz,
    )
    returned_detections = all_detections[: config.MAX_RADAR_RESULT_DETECTIONS]
    classification_counts = {
        name: sum(1 for detection in all_detections if detection.get("classification") == name)
        for name in ("target", "clutter", "unassociated")
    }
    range_profile_power = np.mean(np.abs(range_response) ** 2, axis=0)
    peak_power_w = float(np.max(range_doppler_power))
    view = {
        "method": method,
        "detections": returned_detections,
        "detection_summary": {
            "total_detection_count": len(all_detections),
            "returned_detection_count": len(returned_detections),
            "detections_truncated": len(all_detections) > len(returned_detections),
            "target_detection_count": classification_counts["target"],
            "clutter_detection_count": classification_counts["clutter"],
            "unassociated_detection_count": classification_counts["unassociated"],
        },
        "range_profile": {
            "equivalent_range_axis_m": range_axis_m.tolist(),
            "power_dbm": _watts_to_dbm(range_profile_power).tolist(),
        },
        "range_doppler": _downsample_range_doppler(
            range_doppler_power,
            range_axis_m,
            doppler_axis_hz,
            velocity_axis_mps,
        ),
        "range_doppler_focus": _focus_range_doppler(
            range_doppler_power,
            range_axis_m,
            doppler_axis_hz,
            velocity_axis_mps,
            paths=association_paths if focus_paths is None else focus_paths,
            detections=returned_detections,
            range_resolution_m=range_resolution_m,
            doppler_resolution_hz=doppler_resolution_hz,
            unambiguous_range_m=unambiguous_range_m,
            doppler_sampling_rate_hz=doppler_sampling_rate_hz,
        ),
        "peak_snr_db": 10.0 * math.log10(max(peak_power_w / noise_power_w, 1e-30)),
    }
    return view, all_detections


def _public_target(target: dict) -> dict:
    result = {
        "id": str(target["id"]),
        "asset_id": str(target["asset_id"]),
        "position_m": [float(value) for value in target["position"]],
        "orientation_rad": [float(value) for value in target["orientation"]],
        "velocity_mps": [float(value) for value in target["velocity"]],
        "rcs_m2": float(target["rcs_m2"]),
    }
    if "observability" in target:
        result["observability"] = target["observability"]
    return result


def _public_path(path: dict) -> dict:
    return {
        "path_id": str(path["path_id"]),
        "classification": str(path["classification"]),
        "target_ids": [str(value) for value in path.get("target_ids", [])],
        "delay_s": float(path["delay_s"]),
        "doppler_hz": float(path["doppler_hz"]),
        "path_gain_db": float(path["path_gain_db"]),
        "path_length_m": float(path["path_length_m"]),
        "equivalent_range_m": float(path["equivalent_range_m"]),
        "departure_azimuth_deg": float(path["departure_azimuth_deg"]),
        "departure_zenith_deg": float(path["departure_zenith_deg"]),
        "arrival_azimuth_deg": float(path["arrival_azimuth_deg"]),
        "arrival_zenith_deg": float(path["arrival_zenith_deg"]),
        "polyline": [[float(value) for value in vertex] for vertex in path["polyline"]],
        "signal_included": bool(path.get("signal_included", True)),
        "coefficient_source": str(path.get("coefficient_source", "unknown")),
    }


def process_radar_propagation(
    payload: dict,
    propagation: dict,
    *,
    progress_cb: Callable[[float, str], None] | None = None,
    cancel_check: Callable[[], None] | None = None,
) -> dict:
    """Convert independent propagation paths into a bounded version-one OFDM Radar result."""

    if cancel_check is not None:
        cancel_check()
    if progress_cb is not None:
        progress_cb(0.66, "Preparing OFDM sensing paths")
    processing_started_at = perf_counter()
    params = parse_radar_payload(payload)
    paths = list(propagation.get("paths", []))
    direct_path_cancellation_enabled = bool(params["signal"]["direct_path_cancellation"])
    # With exact solver coefficients, synthesizing the residual without direct
    # paths is algebraically identical to coherent CFR subtraction. Keep the
    # original paths untouched for result auditing and 3D visualization.
    cancelled_direct_paths = (
        [path for path in paths if path.get("classification") == "direct"]
        if direct_path_cancellation_enabled
        else []
    )
    processing_paths = (
        [path for path in paths if path.get("classification") != "direct"]
        if direct_path_cancellation_enabled
        else paths
    )
    excluded_non_signal_path_count = sum(
        1 for path in processing_paths if not path.get("signal_included", True)
    )
    processing_paths = [path for path in processing_paths if path.get("signal_included", True)]
    selected_signal_paths, budget_truncated = _select_signal_paths(
        processing_paths,
        int(params["waveform"]["cell_count"]),
    )
    signal_paths_truncated = budget_truncated or excluded_non_signal_path_count > 0
    cfr = _synthesize_cfr(selected_signal_paths, params)
    if cancel_check is not None:
        cancel_check()
    if progress_cb is not None:
        progress_cb(0.76, "Synthesizing noisy OFDM response")
    noise_power_w = _thermal_noise_power_w(params)
    noisy_cfr = _add_reproducible_noise(cfr, params, noise_power_w)
    range_response, range_doppler_power = _range_doppler(noisy_cfr)
    if cancel_check is not None:
        cancel_check()
    if progress_cb is not None:
        progress_cb(0.86, "Computing Range-Doppler and CFAR")

    waveform = params["waveform"]
    num_subcarriers = int(waveform["num_subcarriers"])
    num_symbols = int(waveform["num_symbols"])
    bandwidth_hz = float(waveform["bandwidth_hz"])
    subcarrier_spacing_hz = float(waveform["subcarrier_spacing_hz"])
    carrier_frequency_hz = float(waveform["carrier_frequency_hz"])
    symbol_duration_s = float(waveform["symbol_duration_s"])
    wavelength_m = SPEED_OF_LIGHT_MPS / carrier_frequency_hz
    range_resolution_m = SPEED_OF_LIGHT_MPS / (2.0 * bandwidth_hz)
    doppler_resolution_hz = 1.0 / (num_symbols * symbol_duration_s)
    velocity_resolution_mps = wavelength_m * doppler_resolution_hz / 2.0
    unambiguous_range_m = SPEED_OF_LIGHT_MPS / (2.0 * subcarrier_spacing_hz)
    max_unambiguous_doppler_hz = subcarrier_spacing_hz / 2.0
    max_unambiguous_velocity_mps = wavelength_m * max_unambiguous_doppler_hz / 2.0
    range_axis_m = np.arange(num_subcarriers, dtype=np.float64) * range_resolution_m
    doppler_axis_hz = np.fft.fftshift(np.fft.fftfreq(num_symbols, d=symbol_duration_s))
    velocity_axis_mps = -wavelength_m * doppler_axis_hz / 2.0

    raw_view, all_detections = _build_processing_view(
        method="raw",
        range_response=range_response,
        range_doppler_power=range_doppler_power,
        association_paths=selected_signal_paths,
        focus_paths=processing_paths,
        params=params,
        noise_power_w=noise_power_w,
        range_axis_m=range_axis_m,
        doppler_axis_hz=doppler_axis_hz,
        velocity_axis_mps=velocity_axis_mps,
        range_resolution_m=range_resolution_m,
        doppler_resolution_hz=doppler_resolution_hz,
        unambiguous_range_m=unambiguous_range_m,
        doppler_sampling_rate_hz=subcarrier_spacing_hz,
    )
    returned_detections = raw_view["detections"]

    mean_subtracted_cfr = noisy_cfr - np.mean(noisy_cfr, axis=0, keepdims=True)
    mean_range_response, mean_range_doppler_power = _range_doppler(mean_subtracted_cfr)
    mean_subtracted_view, _ = _build_processing_view(
        method="slow_time_complex_mean_subtraction",
        range_response=mean_range_response,
        range_doppler_power=mean_range_doppler_power,
        association_paths=selected_signal_paths,
        focus_paths=processing_paths,
        params=params,
        noise_power_w=noise_power_w,
        range_axis_m=range_axis_m,
        doppler_axis_hz=doppler_axis_hz,
        velocity_axis_mps=velocity_axis_mps,
        range_resolution_m=range_resolution_m,
        doppler_resolution_hz=doppler_resolution_hz,
        unambiguous_range_m=unambiguous_range_m,
        doppler_sampling_rate_hz=subcarrier_spacing_hz,
    )
    del mean_subtracted_cfr, mean_range_response, mean_range_doppler_power

    shared_noise_cfr = noisy_cfr - cfr
    ideal_signal_paths = [
        path for path in selected_signal_paths if path.get("classification") != "clutter"
    ]
    ideal_focus_paths = [
        path for path in processing_paths if path.get("classification") != "clutter"
    ]
    ideal_cfr = _synthesize_cfr(ideal_signal_paths, params) + shared_noise_cfr
    ideal_range_response, ideal_range_doppler_power = _range_doppler(ideal_cfr)
    ideal_clutter_cancelled_view, _ = _build_processing_view(
        method="ideal_coherent_known_clutter_subtraction",
        range_response=ideal_range_response,
        range_doppler_power=ideal_range_doppler_power,
        association_paths=ideal_signal_paths,
        focus_paths=ideal_focus_paths,
        params=params,
        noise_power_w=noise_power_w,
        range_axis_m=range_axis_m,
        doppler_axis_hz=doppler_axis_hz,
        velocity_axis_mps=velocity_axis_mps,
        range_resolution_m=range_resolution_m,
        doppler_resolution_hz=doppler_resolution_hz,
        unambiguous_range_m=unambiguous_range_m,
        doppler_sampling_rate_hz=subcarrier_spacing_hz,
    )
    del shared_noise_cfr, ideal_cfr, ideal_range_response, ideal_range_doppler_power
    if cancel_check is not None:
        cancel_check()
    if progress_cb is not None:
        progress_cb(0.94, "Building bounded Radar result")

    classification_counts = {
        classification: sum(1 for path in paths if path.get("classification") == classification)
        for classification in ("target", "clutter", "direct")
    }
    detection_classification_counts = raw_view["detection_summary"]
    returned_paths, display_path_reduction = _select_public_paths(paths)
    total_path_count = len(paths)
    solver_seconds = max(0.0, float(propagation.get("timing", {}).get("total_runtime_ms", 0.0)) / 1_000.0)
    processing_seconds = max(0.0, perf_counter() - processing_started_at)

    result = {
        "schema_version": RADAR_PROCESSING_SCHEMA_VERSION,
        "scene_generation": int(propagation["scene_generation"]),
        "summary": {
            "mode": params["mode"],
            "target_count": len(propagation.get("targets", [])),
            "total_detection_count": len(all_detections),
            "returned_detection_count": len(returned_detections),
            "detections_truncated": len(all_detections) > len(returned_detections),
            "target_detection_count": detection_classification_counts["target_detection_count"],
            "clutter_detection_count": detection_classification_counts["clutter_detection_count"],
            "unassociated_detection_count": detection_classification_counts["unassociated_detection_count"],
            "total_target_path_count": classification_counts["target"],
            "total_clutter_path_count": classification_counts["clutter"],
            "total_direct_path_count": classification_counts["direct"],
            "returned_path_count": len(returned_paths),
            "paths_truncated": total_path_count > len(returned_paths),
        },
        "radar": {
            "mode": params["mode"],
            "tx_position_m": list(params["tx"]["position"]),
            "rx_position_m": list(params["rx"]["position"]),
            "carrier_frequency_hz": carrier_frequency_hz,
            "bandwidth_hz": bandwidth_hz,
            "subcarrier_spacing_hz": subcarrier_spacing_hz,
            "num_subcarriers": num_subcarriers,
            "num_symbols": num_symbols,
            "tx_power_dbm": float(params["signal"]["tx_power_dbm"]),
            "noise_figure_db": float(params["signal"]["noise_figure_db"]),
            "system_loss_db": float(params["signal"]["system_loss_db"]),
            "noise_temperature_k": float(params["signal"]["noise_temperature_k"]),
            "range_definition": RADAR_RANGE_DEFINITION,
            "radial_velocity_definition": RADAR_RADIAL_VELOCITY_DEFINITION,
            "azimuth_definition": RADAR_AZIMUTH_DEFINITION,
            "zenith_definition": RADAR_ZENITH_DEFINITION,
            "angle_estimation_method": RADAR_ANGLE_ESTIMATION_METHOD,
            "angle_estimation_applicability": RADAR_ANGLE_ESTIMATION_APPLICABILITY,
            "clutter_model": dict(
                propagation.get("radar", {}).get(
                    "clutter_model",
                    {
                        "method": "sionna_diffuse_reflection",
                        "preset": "urban-heuristic-v2",
                        "enabled": bool(params["solver"]["diffuse_reflection"]),
                        "calibrated": False,
                        "scattering_coefficient": 0.30,
                        "scattering_pattern": "directive",
                        "directive_alpha_r": 10.0,
                        "environment_material_count": 0,
                        "material_profile_counts": {},
                    },
                )
            ),
        },
        "targets": [_public_target(target) for target in propagation.get("targets", [])],
        "detections": returned_detections,
        "paths": returned_paths,
        "range_profile": raw_view["range_profile"],
        "range_doppler": raw_view["range_doppler"],
        "range_doppler_focus": raw_view["range_doppler_focus"],
        "processing_views": {
            "mean_subtracted": mean_subtracted_view,
            "ideal_clutter_cancelled": ideal_clutter_cancelled_view,
        },
        "resolution": {
            "equivalent_range_m": range_resolution_m,
            "doppler_hz": doppler_resolution_hz,
            "equivalent_radial_velocity_mps": velocity_resolution_mps,
            "max_unambiguous_equivalent_range_m": unambiguous_range_m,
            "max_unambiguous_doppler_hz": max_unambiguous_doppler_hz,
            "max_unambiguous_equivalent_radial_velocity_mps": max_unambiguous_velocity_mps,
        },
        "statistics": {
            "solver_seconds": solver_seconds,
            "processing_seconds": processing_seconds,
            "total_seconds": solver_seconds + processing_seconds,
            "noise_power_dbm": float(_watts_to_dbm(noise_power_w)),
            "peak_snr_db": raw_view["peak_snr_db"],
            "raw_path_count": total_path_count,
            "returned_path_count": len(returned_paths),
            "processed_signal_path_count": len(selected_signal_paths),
            "signal_paths_truncated": signal_paths_truncated,
            "direct_path_cancellation_enabled": direct_path_cancellation_enabled,
            "direct_path_cancellation_method": (
                RADAR_DIRECT_PATH_CANCELLATION_METHOD if direct_path_cancellation_enabled else "disabled"
            ),
            "cancelled_direct_path_count": len(cancelled_direct_paths),
            "ideal_cancelled_clutter_path_count": len(selected_signal_paths) - len(ideal_signal_paths),
            "range_window": RADAR_RANGE_WINDOW,
            "doppler_window": RADAR_DOPPLER_WINDOW,
            "cfar_method": RADAR_CFAR_METHOD,
            "display_path_reduction": display_path_reduction,
            "target_echo_normalization": "effective_rcs",
        },
        "scene_health": {
            "build_id": config.RADAR_BUILD_ID,
            "request_fingerprint": str(
                propagation.get("scene_fingerprint")
                or propagation.get("scene_health", {}).get("request_fingerprint")
                or "unknown"
            ),
            "direct_path_available": classification_counts["direct"] > 0,
            "near_platform_clutter_path_count": 0,
            "warnings": [],
            **dict(propagation.get("scene_health", {})),
        },
    }
    validated = validate_radar_result(result)
    if cancel_check is not None:
        cancel_check()
    if progress_cb is not None:
        progress_cb(0.99, "Radar processing complete")
    return validated


def solve_radar_sensing(
    rt_runtime,
    payload: dict,
    *,
    expected_scene_generation: int | None = None,
    progress_cb: Callable[[float, str], None] | None = None,
    cancel_check: Callable[[], None] | None = None,
) -> dict:
    """Run Radar propagation followed by bounded OFDM sensing processing."""

    from backend.rt.runtime import require_scene_generation

    if cancel_check is not None:
        cancel_check()
    propagation = solve_radar_propagation(
        rt_runtime,
        payload,
        expected_scene_generation=expected_scene_generation,
        progress_cb=progress_cb,
        cancel_check=cancel_check,
    )
    require_scene_generation(rt_runtime, expected_scene_generation)
    if cancel_check is not None:
        cancel_check()
    result = process_radar_propagation(
        payload,
        propagation,
        progress_cb=progress_cb,
        cancel_check=cancel_check,
    )
    require_scene_generation(rt_runtime, expected_scene_generation)
    if cancel_check is not None:
        cancel_check()
    return result
