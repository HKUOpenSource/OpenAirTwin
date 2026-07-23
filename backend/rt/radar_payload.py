from __future__ import annotations

from datetime import datetime
import math
import re
from typing import Iterable

from backend import config
from backend.rt.common import (
    parse_antenna_array_payload,
    parse_bool,
    parse_bounded_float,
    parse_bounded_int,
    parse_object,
    parse_vector,
    solver_bool,
    vector_length,
)


RADAR_CONTRACT_VERSION = 1
RADAR_MODES = frozenset({"monostatic", "bistatic"})
RADAR_TARGET_ASSET_IDS = frozenset(
    {
        "dji-air-2s",
        "dji-mavic-3-cine",
        "dji-mini-3",
        "dji-mini-3-pro",
    }
)
RADAR_JOB_STATUSES = frozenset({"queued", "running", "succeeded", "failed", "cancelled"})
RADAR_TERMINAL_JOB_STATUSES = frozenset({"succeeded", "failed", "cancelled"})
RADAR_JOB_ROUTE_CONTRACT = (
    ("POST", "/api/radar/jobs", "radar.create"),
    ("GET", "/api/radar/jobs/{job_id}", "radar.status"),
    ("GET", "/api/radar/jobs/{job_id}/result", "radar.result"),
    ("POST", "/api/radar/jobs/{job_id}/cancel", "radar.cancel"),
)
RADAR_HTTP_SUCCESS_CONTRACT = {
    "create_job": 202,
    "get_status": 200,
    "get_result": 200,
    "cancel_job": 200,
}
RADAR_HTTP_ERROR_CONTRACT = {
    "invalid_payload": 400,
    "unknown_job": 404,
    "result_not_ready": 409,
    "scene_not_ready": 409,
    "scene_stale": 409,
    "request_too_large": 413,
    "queue_full": 429,
    "internal_error": 500,
}
RADAR_HTTP_ERROR_MESSAGES = {
    "invalid_payload": "Invalid Radar request",
    "unknown_job": "Radar job not found",
    "result_not_ready": "Radar result is not ready",
    "scene_not_ready": "Ray-tracing scene is not ready",
    "scene_stale": "Radar job scene generation is stale",
    "request_too_large": "Radar request body is too large",
    "queue_full": "Radar job queue is full",
    "internal_error": "Internal Radar error",
}
RADAR_ERROR_RESPONSE_KEYS = frozenset({"ok", "error", "message"})
RADAR_PATH_CLASSIFICATIONS = frozenset({"target", "clutter", "direct"})
SPEED_OF_LIGHT_MPS = 299_792_458.0
RADAR_RANGE_DEFINITION = "equivalent one-way range: speed_of_light_mps * delay_s / 2"
RADAR_RADIAL_VELOCITY_DEFINITION = (
    "equivalent monostatic range rate: -wavelength_m * doppler_hz / 2; positive is receding"
)
RADAR_AZIMUTH_DEFINITION = (
    "degrees in the global x-y plane from +x toward +y, normalized to [-180, 180]"
)
RADAR_ZENITH_DEFINITION = "degrees from global +z, bounded to [0, 180]"
RADAR_ANGLE_ESTIMATION_METHOD = "matched configured planar-array response over associated path AoA candidates"
RADAR_ANGLE_ESTIMATION_APPLICABILITY = (
    "monostatic and bistatic planar arrays; requires propagation paths associated with the detection cell"
)
RADAR_RANGE_WINDOW = "hann_rms_normalized"
RADAR_DOPPLER_WINDOW = "hann_rms_normalized"
RADAR_CFAR_METHOD = "two-dimensional cell-averaging CFAR"
RADAR_DIRECT_PATH_CANCELLATION_METHOD = "ideal coherent known-path subtraction"
RADAR_PROCESSING_VIEW_METHODS = {
    "mean_subtracted": "slow_time_complex_mean_subtraction",
    "ideal_clutter_cancelled": "ideal_coherent_known_clutter_subtraction",
}
RADAR_RESULT_REQUIRED_KEYS = frozenset(
    {
        "schema_version",
        "scene_generation",
        "summary",
        "radar",
        "targets",
        "detections",
        "paths",
        "range_profile",
        "range_doppler",
        "resolution",
        "statistics",
    }
)
RADAR_RESULT_OPTIONAL_KEYS = frozenset({"range_doppler_focus", "processing_views", "scene_health"})
RADAR_JOB_STATUS_REQUIRED_KEYS = frozenset(
    {
        "job_id",
        "status",
        "progress",
        "message",
        "created_at",
        "started_at",
        "finished_at",
        "scene_generation",
    }
)

_TARGET_ID_RE = re.compile(r"^[A-Za-z][A-Za-z0-9_-]*$")
_MAX_CONTRACT_ID_LENGTH = 128
_MAX_STATUS_MESSAGE_LENGTH = 512
_ANTENNA_ARRAY_KEYS = frozenset(
    {
        "num_rows",
        "num_cols",
        "vertical_spacing",
        "horizontal_spacing",
        "pattern",
        "polarization",
    }
)
_FORBIDDEN_RESULT_KEYS = frozenset(
    {
        "archive_path",
        "artifact_path",
        "download_url",
        "export",
        "file_path",
        "result_file",
    }
)


def _reject_unknown_keys(payload: dict, allowed: Iterable[str], *, name: str) -> None:
    unknown = sorted(set(payload) - set(allowed))
    if unknown:
        raise ValueError(f"{name} contains unsupported fields: {', '.join(unknown)}")


def _parse_choice(value: object, choices: Iterable[str], *, name: str) -> str:
    if not isinstance(value, str):
        raise ValueError(f"{name} must be a string")
    parsed = value.strip().lower()
    allowed = sorted(set(choices))
    if parsed not in allowed:
        raise ValueError(f"{name} must be one of: {', '.join(allowed)}")
    return parsed


def _validate_exact_choice(value: object, choices: Iterable[str], *, name: str) -> str:
    allowed = sorted(set(choices))
    if not isinstance(value, str) or value not in allowed:
        raise ValueError(f"{name} must be one of: {', '.join(allowed)}")
    return value


def _validate_iso8601(value: object, *, name: str, nullable: bool) -> datetime | None:
    if value is None and nullable:
        return None
    if not isinstance(value, str) or not value:
        suffix = " or null" if nullable else ""
        raise ValueError(f"{name} must be a non-empty ISO-8601 string{suffix}")
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        raise ValueError(f"{name} must be an ISO-8601 timestamp") from None
    if parsed.tzinfo is None or parsed.utcoffset() is None:
        raise ValueError(f"{name} must include a UTC offset")
    return parsed


def _parse_bounded_vector(
    value: object,
    *,
    name: str,
    max_abs: float | None = None,
    max_length: float | None = None,
) -> tuple[float, float, float]:
    parsed = parse_vector(value, size=3, name=name)
    if max_abs is not None and any(abs(component) > max_abs for component in parsed):
        raise ValueError(f"{name} components must have absolute value at most {max_abs}")
    if max_length is not None and vector_length(parsed) > max_length:
        raise ValueError(f"{name} magnitude must be at most {max_length}")
    return parsed


def _parse_device(value: object, *, name: str, default_position: tuple[float, float, float]) -> dict:
    payload = parse_object(value, name=name)
    _reject_unknown_keys(payload, {"position", "orientation", "velocity"}, name=name)
    return {
        "position": _parse_bounded_vector(
            payload.get("position", default_position),
            name=f"{name}.position",
            max_abs=config.MAX_RADAR_COORDINATE_ABS_M,
        ),
        "orientation": _parse_bounded_vector(
            payload.get("orientation", (0.0, 0.0, 0.0)),
            name=f"{name}.orientation",
            max_abs=2.0 * math.pi,
        ),
        "velocity": _parse_bounded_vector(
            payload.get("velocity", (0.0, 0.0, 0.0)),
            name=f"{name}.velocity",
            max_length=config.MAX_RADAR_SPEED_MPS,
        ),
    }


def _parse_array(value: object, *, name: str) -> dict:
    if value is not None:
        payload = parse_object(value, name=name)
        _reject_unknown_keys(payload, _ANTENNA_ARRAY_KEYS, name=name)
    return parse_antenna_array_payload(value, name=name)


def _parse_target(value: object, *, index: int) -> dict:
    name = f"targets[{index}]"
    payload = parse_object(value, name=name)
    _reject_unknown_keys(
        payload,
        {"id", "asset_id", "position", "orientation", "velocity", "rcs_m2"},
        name=name,
    )

    target_id = payload.get("id")
    if not isinstance(target_id, str):
        raise ValueError(f"{name}.id must be a string")
    target_id = target_id.strip()
    if not target_id or len(target_id) > config.MAX_RADAR_TARGET_ID_LENGTH or not _TARGET_ID_RE.fullmatch(target_id):
        raise ValueError(
            f"{name}.id must start with a letter, contain only letters, digits, '_' or '-', "
            f"and be at most {config.MAX_RADAR_TARGET_ID_LENGTH} characters"
        )

    asset_id = payload.get("asset_id")
    if not isinstance(asset_id, str):
        raise ValueError(f"{name}.asset_id must be a string")
    asset_id = asset_id.strip().lower()
    if asset_id not in RADAR_TARGET_ASSET_IDS:
        raise ValueError(f"{name}.asset_id must be one of: {', '.join(sorted(RADAR_TARGET_ASSET_IDS))}")

    return {
        "id": target_id,
        "asset_id": asset_id,
        "position": _parse_bounded_vector(
            payload.get("position", (0.0, 0.0, 0.0)),
            name=f"{name}.position",
            max_abs=config.MAX_RADAR_COORDINATE_ABS_M,
        ),
        "orientation": _parse_bounded_vector(
            payload.get("orientation", (0.0, 0.0, 0.0)),
            name=f"{name}.orientation",
            max_abs=2.0 * math.pi,
        ),
        "velocity": _parse_bounded_vector(
            payload.get("velocity", (0.0, 0.0, 0.0)),
            name=f"{name}.velocity",
            max_length=config.MAX_RADAR_SPEED_MPS,
        ),
        "rcs_m2": parse_bounded_float(
            payload.get("rcs_m2", config.DEFAULT_RADAR_TARGET_RCS_M2),
            name=f"{name}.rcs_m2",
            min_value=config.MIN_RADAR_RCS_M2,
            max_value=config.MAX_RADAR_RCS_M2,
        ),
    }


def _parse_targets(value: object) -> tuple[dict, ...]:
    if not isinstance(value, (list, tuple)):
        raise ValueError("targets must be a list")
    if len(value) > config.MAX_RADAR_TARGETS:
        raise ValueError(f"targets must contain at most {config.MAX_RADAR_TARGETS} items")
    targets = tuple(_parse_target(item, index=index) for index, item in enumerate(value))
    ids = [target["id"] for target in targets]
    if len(set(ids)) != len(ids):
        raise ValueError("targets must have unique ids")
    return targets


def _require_power_of_two(value: int, *, name: str) -> int:
    if value <= 0 or value & (value - 1):
        raise ValueError(f"{name} must be a power of two")
    return value


def parse_radar_payload(payload: dict) -> dict:
    """Parse and canonicalize the version-one Radar Sensing request contract."""

    payload = parse_object(payload, name="payload")
    _reject_unknown_keys(
        payload,
        {"schema_version", "mode", "tx", "rx", "targets", "waveform", "solver", "signal", "cfar"},
        name="payload",
    )
    schema_version = parse_bounded_int(
        payload.get("schema_version", RADAR_CONTRACT_VERSION),
        name="schema_version",
        min_value=RADAR_CONTRACT_VERSION,
        max_value=RADAR_CONTRACT_VERSION,
    )
    mode = _parse_choice(payload.get("mode", config.DEFAULT_RADAR_MODE), RADAR_MODES, name="mode")

    tx = _parse_device(payload.get("tx", {}), name="tx", default_position=config.DEFAULT_TX_POSITION)
    rx_was_submitted = "rx" in payload
    submitted_rx = _parse_device(payload.get("rx", {}), name="rx", default_position=config.DEFAULT_RX_POSITION)
    if mode == "monostatic" and rx_was_submitted and submitted_rx != tx:
        raise ValueError("rx must match tx in monostatic mode")
    rx = dict(tx) if mode == "monostatic" else submitted_rx

    targets = _parse_targets(payload.get("targets", []))

    waveform = parse_object(payload.get("waveform", {}), name="waveform")
    _reject_unknown_keys(
        waveform,
        {"carrier_frequency_hz", "bandwidth_hz", "num_subcarriers", "num_symbols"},
        name="waveform",
    )
    carrier_frequency_hz = parse_bounded_float(
        waveform.get("carrier_frequency_hz", config.DEFAULT_FREQUENCY_HZ),
        name="waveform.carrier_frequency_hz",
        min_value=config.MIN_FREQUENCY_HZ,
        max_value=config.MAX_FREQUENCY_HZ,
    )
    bandwidth_hz = parse_bounded_float(
        waveform.get("bandwidth_hz", config.DEFAULT_RADAR_BANDWIDTH_HZ),
        name="waveform.bandwidth_hz",
        min_value=config.MIN_RADAR_BANDWIDTH_HZ,
        max_value=config.MAX_RADAR_BANDWIDTH_HZ,
    )
    if bandwidth_hz >= 2.0 * carrier_frequency_hz:
        raise ValueError("waveform.bandwidth_hz must keep the occupied RF band above zero Hz")
    num_subcarriers = _require_power_of_two(
        parse_bounded_int(
            waveform.get("num_subcarriers", config.DEFAULT_RADAR_NUM_SUBCARRIERS),
            name="waveform.num_subcarriers",
            min_value=config.MIN_RADAR_NUM_SUBCARRIERS,
            max_value=config.MAX_RADAR_NUM_SUBCARRIERS,
        ),
        name="waveform.num_subcarriers",
    )
    num_symbols = _require_power_of_two(
        parse_bounded_int(
            waveform.get("num_symbols", config.DEFAULT_RADAR_NUM_SYMBOLS),
            name="waveform.num_symbols",
            min_value=config.MIN_RADAR_NUM_SYMBOLS,
            max_value=config.MAX_RADAR_NUM_SYMBOLS,
        ),
        name="waveform.num_symbols",
    )
    waveform_cells = num_subcarriers * num_symbols
    if waveform_cells > config.MAX_RADAR_WAVEFORM_CELLS:
        raise ValueError(f"waveform cell count must be at most {config.MAX_RADAR_WAVEFORM_CELLS}")
    subcarrier_spacing_hz = bandwidth_hz / num_subcarriers
    if not config.MIN_RADAR_SUBCARRIER_SPACING_HZ <= subcarrier_spacing_hz <= config.MAX_RADAR_SUBCARRIER_SPACING_HZ:
        raise ValueError(
            "derived waveform.subcarrier_spacing_hz must be between "
            f"{config.MIN_RADAR_SUBCARRIER_SPACING_HZ} and {config.MAX_RADAR_SUBCARRIER_SPACING_HZ}"
        )

    solver = parse_object(payload.get("solver", {}), name="solver")
    _reject_unknown_keys(
        solver,
        {
            "max_depth",
            "samples_per_src",
            "max_num_paths_per_src",
            "synthetic_array",
            "los",
            "specular_reflection",
            "diffuse_reflection",
            "refraction",
            "diffraction",
            "edge_diffraction",
            "diffraction_lit_region",
            "seed",
            "tx_array",
            "rx_array",
        },
        name="solver",
    )
    tx_array = _parse_array(solver.get("tx_array"), name="solver.tx_array")
    rx_array_was_submitted = "rx_array" in solver
    submitted_rx_array = _parse_array(solver.get("rx_array"), name="solver.rx_array")
    if mode == "monostatic" and rx_array_was_submitted and submitted_rx_array != tx_array:
        raise ValueError("solver.rx_array must match solver.tx_array in monostatic mode")
    rx_array = dict(tx_array) if mode == "monostatic" else submitted_rx_array

    signal = parse_object(payload.get("signal", {}), name="signal")
    _reject_unknown_keys(
        signal,
        {
            "tx_power_dbm",
            "noise_figure_db",
            "system_loss_db",
            "noise_temperature_k",
            "direct_path_cancellation",
        },
        name="signal",
    )

    cfar = parse_object(payload.get("cfar", {}), name="cfar")
    _reject_unknown_keys(
        cfar,
        {
            "enabled",
            "guard_cells_range",
            "guard_cells_doppler",
            "training_cells_range",
            "training_cells_doppler",
            "false_alarm_probability",
        },
        name="cfar",
    )
    guard_cells_range = parse_bounded_int(
        cfar.get("guard_cells_range", config.DEFAULT_RADAR_CFAR_GUARD_RANGE),
        name="cfar.guard_cells_range",
        min_value=0,
        max_value=config.MAX_RADAR_CFAR_GUARD_CELLS,
    )
    guard_cells_doppler = parse_bounded_int(
        cfar.get("guard_cells_doppler", config.DEFAULT_RADAR_CFAR_GUARD_DOPPLER),
        name="cfar.guard_cells_doppler",
        min_value=0,
        max_value=config.MAX_RADAR_CFAR_GUARD_CELLS,
    )
    training_cells_range = parse_bounded_int(
        cfar.get("training_cells_range", config.DEFAULT_RADAR_CFAR_TRAINING_RANGE),
        name="cfar.training_cells_range",
        min_value=1,
        max_value=config.MAX_RADAR_CFAR_TRAINING_CELLS,
    )
    training_cells_doppler = parse_bounded_int(
        cfar.get("training_cells_doppler", config.DEFAULT_RADAR_CFAR_TRAINING_DOPPLER),
        name="cfar.training_cells_doppler",
        min_value=1,
        max_value=config.MAX_RADAR_CFAR_TRAINING_CELLS,
    )
    if 2 * (guard_cells_range + training_cells_range) + 1 > num_subcarriers:
        raise ValueError("cfar range window must fit within waveform.num_subcarriers")
    if 2 * (guard_cells_doppler + training_cells_doppler) + 1 > num_symbols:
        raise ValueError("cfar Doppler window must fit within waveform.num_symbols")

    return {
        "schema_version": schema_version,
        "mode": mode,
        "tx": tx,
        "rx": rx,
        "targets": targets,
        "waveform": {
            "carrier_frequency_hz": carrier_frequency_hz,
            "bandwidth_hz": bandwidth_hz,
            "num_subcarriers": num_subcarriers,
            "num_symbols": num_symbols,
            "subcarrier_spacing_hz": subcarrier_spacing_hz,
            "symbol_duration_s": 1.0 / subcarrier_spacing_hz,
            "cell_count": waveform_cells,
        },
        "solver": {
            "max_depth": parse_bounded_int(
                solver.get("max_depth", config.DEFAULT_MAX_DEPTH),
                name="solver.max_depth",
                min_value=config.MIN_SOLVER_DEPTH,
                max_value=config.MAX_SOLVER_DEPTH,
            ),
            "samples_per_src": parse_bounded_int(
                solver.get("samples_per_src", config.DEFAULT_RADAR_SAMPLES),
                name="solver.samples_per_src",
                min_value=config.MIN_LINK_SAMPLES,
                max_value=config.MAX_LINK_SAMPLES,
            ),
            "max_num_paths_per_src": parse_bounded_int(
                solver.get("max_num_paths_per_src", config.DEFAULT_RADAR_MAX_NUM_PATHS_PER_SRC),
                name="solver.max_num_paths_per_src",
                min_value=config.MIN_LINK_MAX_NUM_PATHS_PER_SRC,
                max_value=config.MAX_LINK_MAX_NUM_PATHS_PER_SRC,
            ),
            "synthetic_array": solver_bool(solver, "synthetic_array", False),
            "los": solver_bool(solver, "los", True),
            "specular_reflection": solver_bool(solver, "specular_reflection", True),
            "diffuse_reflection": solver_bool(solver, "diffuse_reflection", True),
            "refraction": solver_bool(solver, "refraction", True),
            "diffraction": solver_bool(solver, "diffraction", False),
            "edge_diffraction": solver_bool(solver, "edge_diffraction", False),
            "diffraction_lit_region": solver_bool(solver, "diffraction_lit_region", False),
            "seed": parse_bounded_int(
                solver.get("seed", 42),
                name="solver.seed",
                min_value=config.MIN_SOLVER_SEED,
                max_value=config.MAX_SOLVER_SEED,
            ),
            "tx_array": tx_array,
            "rx_array": rx_array,
        },
        "signal": {
            "tx_power_dbm": parse_bounded_float(
                signal.get("tx_power_dbm", config.DEFAULT_RADAR_TX_POWER_DBM),
                name="signal.tx_power_dbm",
                min_value=config.MIN_RADAR_TX_POWER_DBM,
                max_value=config.MAX_RADAR_TX_POWER_DBM,
            ),
            "noise_figure_db": parse_bounded_float(
                signal.get("noise_figure_db", config.DEFAULT_RADAR_NOISE_FIGURE_DB),
                name="signal.noise_figure_db",
                min_value=config.MIN_RADAR_NOISE_FIGURE_DB,
                max_value=config.MAX_RADAR_NOISE_FIGURE_DB,
            ),
            "system_loss_db": parse_bounded_float(
                signal.get("system_loss_db", config.DEFAULT_RADAR_SYSTEM_LOSS_DB),
                name="signal.system_loss_db",
                min_value=config.MIN_RADAR_SYSTEM_LOSS_DB,
                max_value=config.MAX_RADAR_SYSTEM_LOSS_DB,
            ),
            "noise_temperature_k": parse_bounded_float(
                signal.get("noise_temperature_k", config.DEFAULT_RADAR_NOISE_TEMPERATURE_K),
                name="signal.noise_temperature_k",
                min_value=config.MIN_RADAR_NOISE_TEMPERATURE_K,
                max_value=config.MAX_RADAR_NOISE_TEMPERATURE_K,
            ),
            "direct_path_cancellation": parse_bool(
                signal,
                "direct_path_cancellation",
                True,
                name="signal",
            ),
        },
        "cfar": {
            "enabled": parse_bool(cfar, "enabled", True, name="cfar"),
            "guard_cells_range": guard_cells_range,
            "guard_cells_doppler": guard_cells_doppler,
            "training_cells_range": training_cells_range,
            "training_cells_doppler": training_cells_doppler,
            "false_alarm_probability": parse_bounded_float(
                cfar.get("false_alarm_probability", config.DEFAULT_RADAR_CFAR_PFA),
                name="cfar.false_alarm_probability",
                min_value=config.MIN_RADAR_CFAR_PFA,
                max_value=config.MAX_RADAR_CFAR_PFA,
            ),
        },
    }


def _finite_sequence(value: object, *, name: str, max_length: int) -> tuple[float, ...]:
    if not isinstance(value, (list, tuple)):
        raise ValueError(f"{name} must be a list")
    if len(value) > max_length:
        raise ValueError(f"{name} must contain at most {max_length} items")
    return tuple(parse_bounded_float(item, name=f"{name}[{index}]") for index, item in enumerate(value))


def _reject_result_artifacts(value: object, *, name: str = "result") -> None:
    if isinstance(value, dict):
        forbidden = sorted(set(value) & _FORBIDDEN_RESULT_KEYS)
        if forbidden:
            raise ValueError(f"{name} contains forbidden artifact fields: {', '.join(forbidden)}")
        for key, child in value.items():
            _reject_result_artifacts(child, name=f"{name}.{key}")
    elif isinstance(value, (list, tuple)):
        for index, child in enumerate(value):
            _reject_result_artifacts(child, name=f"{name}[{index}]")


def validate_radar_job_status(payload: dict) -> dict:
    payload = parse_object(payload, name="job status")
    missing = sorted(RADAR_JOB_STATUS_REQUIRED_KEYS - set(payload))
    if missing:
        raise ValueError(f"job status is missing required fields: {', '.join(missing)}")
    _reject_unknown_keys(payload, RADAR_JOB_STATUS_REQUIRED_KEYS | {"error"}, name="job status")
    if (
        not isinstance(payload["job_id"], str)
        or not payload["job_id"].strip()
        or len(payload["job_id"]) > _MAX_CONTRACT_ID_LENGTH
    ):
        raise ValueError(
            f"job status.job_id must be a non-empty string of at most {_MAX_CONTRACT_ID_LENGTH} characters"
        )
    status = _validate_exact_choice(payload["status"], RADAR_JOB_STATUSES, name="job status.status")
    progress = parse_bounded_float(
        payload["progress"],
        name="job status.progress",
        min_value=0.0,
        max_value=1.0,
    )
    if not isinstance(payload["message"], str) or len(payload["message"]) > _MAX_STATUS_MESSAGE_LENGTH:
        raise ValueError(f"job status.message must be a string of at most {_MAX_STATUS_MESSAGE_LENGTH} characters")
    created_at = _validate_iso8601(payload["created_at"], name="job status.created_at", nullable=False)
    started_at = _validate_iso8601(payload["started_at"], name="job status.started_at", nullable=True)
    finished_at = _validate_iso8601(payload["finished_at"], name="job status.finished_at", nullable=True)
    parse_bounded_int(payload["scene_generation"], name="job status.scene_generation", min_value=0)
    error = payload.get("error")
    if error is not None and (not isinstance(error, str) or len(error) > _MAX_STATUS_MESSAGE_LENGTH):
        raise ValueError(
            f"job status.error must be null or a string of at most {_MAX_STATUS_MESSAGE_LENGTH} characters"
        )
    if started_at is not None and started_at < created_at:
        raise ValueError("job status.started_at must not be earlier than created_at")
    if finished_at is not None and finished_at < (started_at or created_at):
        raise ValueError("job status.finished_at must not be earlier than the preceding timestamp")
    if status == "queued" and (progress != 0.0 or started_at is not None or finished_at is not None):
        raise ValueError("queued job status requires progress=0 and null start/finish timestamps")
    if status == "running" and (started_at is None or finished_at is not None or progress >= 1.0):
        raise ValueError("running job status requires a start timestamp, no finish timestamp, and progress below 1")
    if status in RADAR_TERMINAL_JOB_STATUSES and (finished_at is None or progress != 1.0):
        raise ValueError("terminal job status requires progress=1 and a finish timestamp")
    if status in {"succeeded", "failed"} and started_at is None:
        raise ValueError("succeeded and failed job statuses require a start timestamp")
    if status == "failed" and (not isinstance(error, str) or not error):
        raise ValueError("failed job status requires a non-empty error")
    if status != "failed" and error is not None:
        raise ValueError("only failed job status may include an error")
    return payload


def _validate_range_doppler_result(
    value: object,
    *,
    name: str,
    wavelength_m: float,
    num_symbols: int,
    num_subcarriers: int,
    focused: bool,
) -> None:
    range_doppler = parse_object(value, name=name)
    required_keys = {
        "equivalent_range_axis_m",
        "doppler_axis_hz",
        "equivalent_radial_velocity_axis_mps",
        "power_dbm",
        "source_shape",
        "downsample_factor",
        "truncated",
    }
    focus_keys = {"source_offset", "window"} if focused else set()
    _reject_unknown_keys(range_doppler, required_keys | focus_keys, name=name)
    if (required_keys | focus_keys) - set(range_doppler):
        raise ValueError(f"{name} is missing required fields")
    rd_range_axis = _finite_sequence(
        range_doppler["equivalent_range_axis_m"],
        name=f"{name}.equivalent_range_axis_m",
        max_length=config.MAX_RADAR_RESULT_RANGE_BINS,
    )
    doppler_axis = _finite_sequence(
        range_doppler["doppler_axis_hz"],
        name=f"{name}.doppler_axis_hz",
        max_length=config.MAX_RADAR_RESULT_DOPPLER_BINS,
    )
    velocity_axis = _finite_sequence(
        range_doppler["equivalent_radial_velocity_axis_mps"],
        name=f"{name}.equivalent_radial_velocity_axis_mps",
        max_length=config.MAX_RADAR_RESULT_DOPPLER_BINS,
    )
    matrix = range_doppler["power_dbm"]
    if not rd_range_axis or not doppler_axis or len(velocity_axis) != len(doppler_axis):
        raise ValueError(f"{name} axes must be non-empty and Doppler axes must have equal lengths")
    if any(value < 0.0 for value in rd_range_axis) or any(
        rd_range_axis[index] >= rd_range_axis[index + 1]
        for index in range(len(rd_range_axis) - 1)
    ):
        raise ValueError(f"{name}.equivalent_range_axis_m must be non-negative and strictly increasing")
    if any(doppler_axis[index] >= doppler_axis[index + 1] for index in range(len(doppler_axis) - 1)):
        raise ValueError(f"{name}.doppler_axis_hz must be strictly increasing")
    for index, (doppler_hz, equivalent_velocity) in enumerate(zip(doppler_axis, velocity_axis)):
        expected_velocity = -wavelength_m * doppler_hz / 2.0
        if not math.isclose(equivalent_velocity, expected_velocity, rel_tol=1e-6, abs_tol=1e-9):
            raise ValueError(
                f"{name}.equivalent_radial_velocity_axis_mps does not match doppler_axis_hz "
                f"at index {index}"
            )
    if len(rd_range_axis) * len(doppler_axis) > config.MAX_RADAR_RESULT_CELLS:
        raise ValueError(f"{name} cell count must be at most {config.MAX_RADAR_RESULT_CELLS}")
    if not isinstance(matrix, list) or len(matrix) != len(doppler_axis):
        raise ValueError(f"{name}.power_dbm rows must match doppler_axis_hz")
    for row_index, row in enumerate(matrix):
        parsed_row = _finite_sequence(
            row,
            name=f"{name}.power_dbm[{row_index}]",
            max_length=config.MAX_RADAR_RESULT_RANGE_BINS,
        )
        if len(parsed_row) != len(rd_range_axis):
            raise ValueError(f"{name}.power_dbm columns must match equivalent_range_axis_m")

    source_shape = parse_object(range_doppler["source_shape"], name=f"{name}.source_shape")
    source_shape_keys = {"doppler_bins", "range_bins"}
    _reject_unknown_keys(source_shape, source_shape_keys, name=f"{name}.source_shape")
    if source_shape_keys - set(source_shape):
        raise ValueError(f"{name}.source_shape is missing required fields")
    source_doppler_bins = parse_bounded_int(
        source_shape["doppler_bins"],
        name=f"{name}.source_shape.doppler_bins",
        min_value=len(doppler_axis),
        max_value=num_symbols,
    )
    source_range_bins = parse_bounded_int(
        source_shape["range_bins"],
        name=f"{name}.source_shape.range_bins",
        min_value=len(rd_range_axis),
        max_value=num_subcarriers,
    )
    if not focused and (source_doppler_bins != num_symbols or source_range_bins != num_subcarriers):
        raise ValueError(f"{name}.source_shape must match the Radar OFDM dimensions")

    downsample_factor = parse_object(
        range_doppler["downsample_factor"], name=f"{name}.downsample_factor"
    )
    downsample_keys = {"doppler", "range"}
    _reject_unknown_keys(downsample_factor, downsample_keys, name=f"{name}.downsample_factor")
    if downsample_keys - set(downsample_factor):
        raise ValueError(f"{name}.downsample_factor is missing required fields")
    doppler_factor = parse_bounded_int(
        downsample_factor["doppler"],
        name=f"{name}.downsample_factor.doppler",
        min_value=1,
        max_value=source_doppler_bins,
    )
    range_factor = parse_bounded_int(
        downsample_factor["range"],
        name=f"{name}.downsample_factor.range",
        min_value=1,
        max_value=source_range_bins,
    )
    is_downsampled = source_doppler_bins > len(doppler_axis) or source_range_bins > len(rd_range_axis)
    if not isinstance(range_doppler["truncated"], bool) or range_doppler["truncated"] != is_downsampled:
        raise ValueError(f"{name}.truncated must reflect source_shape")
    if not is_downsampled and (doppler_factor != 1 or range_factor != 1):
        raise ValueError(f"{name}.downsample_factor must be one when data is not truncated")
    if is_downsampled and doppler_factor == 1 and range_factor == 1:
        raise ValueError(f"{name}.downsample_factor must describe truncated data")

    if focused:
        source_offset = parse_object(range_doppler["source_offset"], name=f"{name}.source_offset")
        offset_keys = {"doppler_bin", "range_bin"}
        _reject_unknown_keys(source_offset, offset_keys, name=f"{name}.source_offset")
        if offset_keys - set(source_offset):
            raise ValueError(f"{name}.source_offset is missing required fields")
        doppler_offset = parse_bounded_int(
            source_offset["doppler_bin"],
            name=f"{name}.source_offset.doppler_bin",
            min_value=0,
            max_value=num_symbols - source_doppler_bins,
        )
        range_offset = parse_bounded_int(
            source_offset["range_bin"],
            name=f"{name}.source_offset.range_bin",
            min_value=0,
            max_value=num_subcarriers - source_range_bins,
        )
        if doppler_offset + source_doppler_bins > num_symbols or range_offset + source_range_bins > num_subcarriers:
            raise ValueError(f"{name}.source_offset and source_shape exceed the OFDM dimensions")
        window = parse_object(range_doppler["window"], name=f"{name}.window")
        window_keys = {
            "equivalent_range_min_m",
            "equivalent_range_max_m",
            "doppler_min_hz",
            "doppler_max_hz",
            "auto_focus",
        }
        _reject_unknown_keys(window, window_keys, name=f"{name}.window")
        if window_keys - set(window):
            raise ValueError(f"{name}.window is missing required fields")
        range_min = parse_bounded_float(
            window["equivalent_range_min_m"], name=f"{name}.window.equivalent_range_min_m", min_value=0.0
        )
        range_max = parse_bounded_float(
            window["equivalent_range_max_m"], name=f"{name}.window.equivalent_range_max_m", min_value=range_min
        )
        doppler_min = parse_bounded_float(window["doppler_min_hz"], name=f"{name}.window.doppler_min_hz")
        doppler_max = parse_bounded_float(
            window["doppler_max_hz"], name=f"{name}.window.doppler_max_hz", min_value=doppler_min
        )
        if window["auto_focus"] is not True:
            raise ValueError(f"{name}.window.auto_focus must be true")
        if rd_range_axis[0] < range_min - 1e-9 or rd_range_axis[-1] > range_max + 1e-9:
            raise ValueError(f"{name} range axis must remain inside its window")
        if doppler_axis[0] < doppler_min - 1e-9 or doppler_axis[-1] > doppler_max + 1e-9:
            raise ValueError(f"{name} Doppler axis must remain inside its window")


def _validate_range_profile_result(value: object, *, name: str) -> None:
    profile = parse_object(value, name=name)
    keys = {"equivalent_range_axis_m", "power_dbm"}
    _reject_unknown_keys(profile, keys, name=name)
    if keys - set(profile):
        raise ValueError(f"{name} is missing required fields")
    range_axis = _finite_sequence(
        profile["equivalent_range_axis_m"],
        name=f"{name}.equivalent_range_axis_m",
        max_length=config.MAX_RADAR_RANGE_PROFILE_BINS,
    )
    power = _finite_sequence(
        profile["power_dbm"],
        name=f"{name}.power_dbm",
        max_length=config.MAX_RADAR_RANGE_PROFILE_BINS,
    )
    if not range_axis or len(range_axis) != len(power):
        raise ValueError(f"{name} axes must be non-empty and have equal lengths")
    if any(value < 0.0 for value in range_axis) or any(
        range_axis[index] >= range_axis[index + 1] for index in range(len(range_axis) - 1)
    ):
        raise ValueError(f"{name}.equivalent_range_axis_m must be non-negative and strictly increasing")


def _validate_processing_view_detections(
    value: object,
    *,
    name: str,
    wavelength_m: float,
    target_ids: set[str],
) -> dict[str, int]:
    if not isinstance(value, list) or len(value) > config.MAX_RADAR_RESULT_DETECTIONS:
        raise ValueError(
            f"{name} must be a list with at most {config.MAX_RADAR_RESULT_DETECTIONS} items"
        )
    keys = {
        "detection_id",
        "equivalent_range_m",
        "equivalent_radial_velocity_mps",
        "doppler_hz",
        "power_dbm",
        "snr_db",
        "arrival_azimuth_deg",
        "arrival_zenith_deg",
        "target_id",
        "classification",
        "position_m",
        "position_source",
    }
    required = keys - {"position_m", "position_source"}
    detection_ids: set[str] = set()
    counts = {classification: 0 for classification in ("target", "clutter", "unassociated")}
    for index, raw_detection in enumerate(value):
        detection_name = f"{name}[{index}]"
        detection = parse_object(raw_detection, name=detection_name)
        _reject_unknown_keys(detection, keys, name=detection_name)
        if required - set(detection):
            raise ValueError(f"{detection_name} is missing required fields")
        detection_id = detection["detection_id"]
        if (
            not isinstance(detection_id, str)
            or not detection_id
            or len(detection_id) > _MAX_CONTRACT_ID_LENGTH
            or detection_id in detection_ids
        ):
            raise ValueError(f"{detection_name}.detection_id must be a unique bounded string")
        detection_ids.add(detection_id)
        parse_bounded_float(
            detection["equivalent_range_m"], name=f"{detection_name}.equivalent_range_m", min_value=0.0
        )
        doppler_hz = parse_bounded_float(detection["doppler_hz"], name=f"{detection_name}.doppler_hz")
        equivalent_velocity = parse_bounded_float(
            detection["equivalent_radial_velocity_mps"],
            name=f"{detection_name}.equivalent_radial_velocity_mps",
        )
        if not math.isclose(
            equivalent_velocity,
            -wavelength_m * doppler_hz / 2.0,
            rel_tol=1e-6,
            abs_tol=1e-9,
        ):
            raise ValueError(f"{detection_name}.equivalent_radial_velocity_mps does not match doppler_hz")
        parse_bounded_float(detection["power_dbm"], name=f"{detection_name}.power_dbm")
        parse_bounded_float(detection["snr_db"], name=f"{detection_name}.snr_db")
        parse_bounded_float(
            detection["arrival_azimuth_deg"],
            name=f"{detection_name}.arrival_azimuth_deg",
            min_value=-180.0,
            max_value=180.0,
        )
        parse_bounded_float(
            detection["arrival_zenith_deg"],
            name=f"{detection_name}.arrival_zenith_deg",
            min_value=0.0,
            max_value=180.0,
        )
        target_id = detection["target_id"]
        if target_id is not None and (not isinstance(target_id, str) or target_id not in target_ids):
            raise ValueError(f"{detection_name}.target_id must reference a result target or be null")
        classification = _validate_exact_choice(
            detection["classification"],
            {"target", "clutter", "unassociated"},
            name=f"{detection_name}.classification",
        )
        if (classification == "target") != (target_id is not None):
            raise ValueError(f"{detection_name}.classification must agree with target_id")
        counts[classification] += 1
        if detection.get("position_m") is not None:
            _parse_bounded_vector(
                detection["position_m"],
                name=f"{detection_name}.position_m",
                max_abs=config.MAX_RADAR_COORDINATE_ABS_M,
            )
        if "position_source" in detection and detection["position_source"] not in {"path_interaction", "unavailable"}:
            raise ValueError(f"{detection_name}.position_source is unsupported")
    return counts


def _validate_processing_detection_summary(
    value: object,
    *,
    name: str,
    returned_count: int,
    returned_classification_counts: dict[str, int],
) -> None:
    summary = parse_object(value, name=name)
    keys = {
        "total_detection_count",
        "returned_detection_count",
        "detections_truncated",
        "target_detection_count",
        "clutter_detection_count",
        "unassociated_detection_count",
    }
    _reject_unknown_keys(summary, keys, name=name)
    if keys - set(summary):
        raise ValueError(f"{name} is missing required fields")
    total = parse_bounded_int(summary["total_detection_count"], name=f"{name}.total_detection_count", min_value=0)
    returned = parse_bounded_int(
        summary["returned_detection_count"],
        name=f"{name}.returned_detection_count",
        min_value=0,
        max_value=config.MAX_RADAR_RESULT_DETECTIONS,
    )
    if returned != returned_count or total < returned:
        raise ValueError(f"{name} detection counts are inconsistent")
    if not isinstance(summary["detections_truncated"], bool) or summary["detections_truncated"] != (total > returned):
        raise ValueError(f"{name}.detections_truncated must reflect omitted detections")
    total_classified = 0
    for classification in ("target", "clutter", "unassociated"):
        key = f"{classification}_detection_count"
        count = parse_bounded_int(summary[key], name=f"{name}.{key}", min_value=0)
        if count < returned_classification_counts[classification]:
            raise ValueError(f"{name}.{key} cannot be smaller than returned detections")
        total_classified += count
    if total_classified != total:
        raise ValueError(f"{name} classification counts must equal total detections")


def validate_radar_result(payload: dict) -> dict:
    """Validate the bounded, UI-only version-one Radar result contract."""

    payload = parse_object(payload, name="result")
    missing = sorted(RADAR_RESULT_REQUIRED_KEYS - set(payload))
    if missing:
        raise ValueError(f"result is missing required fields: {', '.join(missing)}")
    _reject_unknown_keys(payload, RADAR_RESULT_REQUIRED_KEYS | RADAR_RESULT_OPTIONAL_KEYS, name="result")
    _reject_result_artifacts(payload)
    parse_bounded_int(
        payload["schema_version"],
        name="result.schema_version",
        min_value=RADAR_CONTRACT_VERSION,
        max_value=RADAR_CONTRACT_VERSION,
    )
    parse_bounded_int(payload["scene_generation"], name="result.scene_generation", min_value=0)

    summary = parse_object(payload["summary"], name="result.summary")
    summary_keys = {
        "mode",
        "target_count",
        "total_detection_count",
        "returned_detection_count",
        "detections_truncated",
        "total_target_path_count",
        "total_clutter_path_count",
        "total_direct_path_count",
        "returned_path_count",
        "paths_truncated",
    }
    optional_summary_keys = {
        "target_detection_count",
        "clutter_detection_count",
        "unassociated_detection_count",
    }
    _reject_unknown_keys(summary, summary_keys | optional_summary_keys, name="result.summary")
    missing_summary = sorted(summary_keys - set(summary))
    if missing_summary:
        raise ValueError(f"result.summary is missing required fields: {', '.join(missing_summary)}")
    summary_mode = _validate_exact_choice(summary["mode"], RADAR_MODES, name="result.summary.mode")

    targets = payload["targets"]
    detections = payload["detections"]
    paths = payload["paths"]
    if not isinstance(targets, list) or len(targets) > config.MAX_RADAR_TARGETS:
        raise ValueError(f"result.targets must be a list with at most {config.MAX_RADAR_TARGETS} items")
    if not isinstance(detections, list) or len(detections) > config.MAX_RADAR_RESULT_DETECTIONS:
        raise ValueError(
            f"result.detections must be a list with at most {config.MAX_RADAR_RESULT_DETECTIONS} items"
        )
    if not isinstance(paths, list) or len(paths) > config.MAX_RADAR_RESULT_PATHS:
        raise ValueError(f"result.paths must be a list with at most {config.MAX_RADAR_RESULT_PATHS} items")

    radar = parse_object(payload["radar"], name="result.radar")
    required_radar_keys = {
        "mode",
        "tx_position_m",
        "rx_position_m",
        "carrier_frequency_hz",
        "bandwidth_hz",
        "subcarrier_spacing_hz",
        "num_subcarriers",
        "num_symbols",
        "tx_power_dbm",
        "noise_figure_db",
        "system_loss_db",
        "noise_temperature_k",
        "range_definition",
        "radial_velocity_definition",
        "azimuth_definition",
        "zenith_definition",
    }
    optional_radar_keys = {
        "angle_estimation_method",
        "angle_estimation_applicability",
        "clutter_model",
    }
    _reject_unknown_keys(radar, required_radar_keys | optional_radar_keys, name="result.radar")
    if required_radar_keys - set(radar):
        raise ValueError("result.radar is missing required fields")
    radar_mode = _validate_exact_choice(radar["mode"], RADAR_MODES, name="result.radar.mode")
    if radar_mode != summary_mode:
        raise ValueError("result.radar.mode must match result.summary.mode")
    tx_position = _parse_bounded_vector(
        radar["tx_position_m"], name="result.radar.tx_position_m", max_abs=config.MAX_RADAR_COORDINATE_ABS_M
    )
    rx_position = _parse_bounded_vector(
        radar["rx_position_m"], name="result.radar.rx_position_m", max_abs=config.MAX_RADAR_COORDINATE_ABS_M
    )
    if radar_mode == "monostatic" and rx_position != tx_position:
        raise ValueError("result.radar.rx_position_m must match tx_position_m in monostatic mode")
    carrier_frequency_hz = parse_bounded_float(
        radar["carrier_frequency_hz"],
        name="result.radar.carrier_frequency_hz",
        min_value=config.MIN_FREQUENCY_HZ,
        max_value=config.MAX_FREQUENCY_HZ,
    )
    bandwidth_hz = parse_bounded_float(
        radar["bandwidth_hz"],
        name="result.radar.bandwidth_hz",
        min_value=config.MIN_RADAR_BANDWIDTH_HZ,
        max_value=config.MAX_RADAR_BANDWIDTH_HZ,
    )
    if bandwidth_hz >= 2.0 * carrier_frequency_hz:
        raise ValueError("result.radar.bandwidth_hz must keep the occupied RF band above zero Hz")
    num_subcarriers = _require_power_of_two(
        parse_bounded_int(
            radar["num_subcarriers"],
            name="result.radar.num_subcarriers",
            min_value=config.MIN_RADAR_NUM_SUBCARRIERS,
            max_value=config.MAX_RADAR_NUM_SUBCARRIERS,
        ),
        name="result.radar.num_subcarriers",
    )
    num_symbols = _require_power_of_two(
        parse_bounded_int(
            radar["num_symbols"],
            name="result.radar.num_symbols",
            min_value=config.MIN_RADAR_NUM_SYMBOLS,
            max_value=config.MAX_RADAR_NUM_SYMBOLS,
        ),
        name="result.radar.num_symbols",
    )
    if num_subcarriers * num_symbols > config.MAX_RADAR_WAVEFORM_CELLS:
        raise ValueError(f"result.radar waveform cell count must be at most {config.MAX_RADAR_WAVEFORM_CELLS}")
    subcarrier_spacing_hz = parse_bounded_float(
        radar["subcarrier_spacing_hz"],
        name="result.radar.subcarrier_spacing_hz",
        min_value=config.MIN_RADAR_SUBCARRIER_SPACING_HZ,
        max_value=config.MAX_RADAR_SUBCARRIER_SPACING_HZ,
    )
    if not math.isclose(subcarrier_spacing_hz, bandwidth_hz / num_subcarriers, rel_tol=1e-12):
        raise ValueError("result.radar.subcarrier_spacing_hz must equal bandwidth_hz / num_subcarriers")
    parse_bounded_float(
        radar["tx_power_dbm"],
        name="result.radar.tx_power_dbm",
        min_value=config.MIN_RADAR_TX_POWER_DBM,
        max_value=config.MAX_RADAR_TX_POWER_DBM,
    )
    parse_bounded_float(
        radar["noise_figure_db"],
        name="result.radar.noise_figure_db",
        min_value=config.MIN_RADAR_NOISE_FIGURE_DB,
        max_value=config.MAX_RADAR_NOISE_FIGURE_DB,
    )
    parse_bounded_float(
        radar["system_loss_db"],
        name="result.radar.system_loss_db",
        min_value=config.MIN_RADAR_SYSTEM_LOSS_DB,
        max_value=config.MAX_RADAR_SYSTEM_LOSS_DB,
    )
    parse_bounded_float(
        radar["noise_temperature_k"],
        name="result.radar.noise_temperature_k",
        min_value=config.MIN_RADAR_NOISE_TEMPERATURE_K,
        max_value=config.MAX_RADAR_NOISE_TEMPERATURE_K,
    )
    definitions = {
        "range_definition": RADAR_RANGE_DEFINITION,
        "radial_velocity_definition": RADAR_RADIAL_VELOCITY_DEFINITION,
        "azimuth_definition": RADAR_AZIMUTH_DEFINITION,
        "zenith_definition": RADAR_ZENITH_DEFINITION,
    }
    for key, expected in definitions.items():
        if radar[key] != expected:
            raise ValueError(f"result.radar.{key} does not match the version-one convention")
    optional_definitions = {
        "angle_estimation_method": RADAR_ANGLE_ESTIMATION_METHOD,
        "angle_estimation_applicability": RADAR_ANGLE_ESTIMATION_APPLICABILITY,
    }
    for key, expected in optional_definitions.items():
        if key in radar and radar[key] != expected:
            raise ValueError(f"result.radar.{key} does not match the version-one convention")
    if "clutter_model" in radar:
        clutter_model = parse_object(radar["clutter_model"], name="result.radar.clutter_model")
        clutter_model_keys = {
            "method",
            "preset",
            "enabled",
            "calibrated",
            "scattering_coefficient",
            "scattering_pattern",
            "directive_alpha_r",
            "environment_material_count",
            "material_profile_counts",
        }
        required_clutter_model_keys = clutter_model_keys - {"material_profile_counts"}
        _reject_unknown_keys(clutter_model, clutter_model_keys, name="result.radar.clutter_model")
        if required_clutter_model_keys - set(clutter_model):
            raise ValueError("result.radar.clutter_model is missing required fields")
        if clutter_model["method"] != "sionna_diffuse_reflection":
            raise ValueError("result.radar.clutter_model.method is unsupported")
        if clutter_model["preset"] not in {"urban-basic-v1", "urban-heuristic-v2"}:
            raise ValueError("result.radar.clutter_model.preset is unsupported")
        if not isinstance(clutter_model["enabled"], bool):
            raise ValueError("result.radar.clutter_model.enabled must be a boolean")
        if clutter_model["calibrated"] is not False:
            raise ValueError("result.radar.clutter_model.calibrated must be false")
        coefficient = parse_bounded_float(
            clutter_model["scattering_coefficient"],
            name="result.radar.clutter_model.scattering_coefficient",
            min_value=0.0,
            max_value=1.0,
        )
        expected_coefficient = 0.30 if clutter_model["preset"] == "urban-heuristic-v2" else 1.0 / math.sqrt(3.0)
        if not math.isclose(coefficient, expected_coefficient, rel_tol=1e-12):
            raise ValueError("result.radar.clutter_model.scattering_coefficient does not match its preset")
        if clutter_model["scattering_pattern"] != "directive":
            raise ValueError("result.radar.clutter_model.scattering_pattern is unsupported")
        alpha_r = parse_bounded_float(
            clutter_model["directive_alpha_r"],
            name="result.radar.clutter_model.directive_alpha_r",
            min_value=0.0,
        )
        if not math.isclose(alpha_r, 10.0, rel_tol=1e-12):
            raise ValueError("result.radar.clutter_model.directive_alpha_r does not match its preset")
        parse_bounded_int(
            clutter_model["environment_material_count"],
            name="result.radar.clutter_model.environment_material_count",
            min_value=0,
        )
        if "material_profile_counts" in clutter_model:
            profiles = parse_object(
                clutter_model["material_profile_counts"],
                name="result.radar.clutter_model.material_profile_counts",
            )
            for profile_name, count in profiles.items():
                if not isinstance(profile_name, str) or not profile_name:
                    raise ValueError("result.radar.clutter_model material profile names must be non-empty")
                parse_bounded_int(
                    count,
                    name=f"result.radar.clutter_model.material_profile_counts.{profile_name}",
                    min_value=0,
                )
    wavelength_m = SPEED_OF_LIGHT_MPS / carrier_frequency_hz

    target_ids: set[str] = set()
    for index, target in enumerate(targets):
        target_name = f"result.targets[{index}]"
        target = parse_object(target, name=target_name)
        required = {"id", "asset_id", "position_m", "orientation_rad", "velocity_mps", "rcs_m2"}
        _reject_unknown_keys(target, required | {"observability"}, name=target_name)
        if required - set(target):
            raise ValueError(f"{target_name} is missing required fields")
        target_id = target["id"]
        if (
            not isinstance(target_id, str)
            or not _TARGET_ID_RE.fullmatch(target_id)
            or len(target_id) > config.MAX_RADAR_TARGET_ID_LENGTH
            or target_id in target_ids
        ):
            raise ValueError("result.targets must have unique valid ids")
        target_ids.add(target_id)
        if not isinstance(target["asset_id"], str) or target["asset_id"] not in RADAR_TARGET_ASSET_IDS:
            raise ValueError(f"{target_name}.asset_id is unknown")
        _parse_bounded_vector(
            target["position_m"], name=f"{target_name}.position_m", max_abs=config.MAX_RADAR_COORDINATE_ABS_M
        )
        _parse_bounded_vector(target["orientation_rad"], name=f"{target_name}.orientation_rad", max_abs=2.0 * math.pi)
        _parse_bounded_vector(
            target["velocity_mps"], name=f"{target_name}.velocity_mps", max_length=config.MAX_RADAR_SPEED_MPS
        )
        parse_bounded_float(
            target["rcs_m2"],
            name=f"{target_name}.rcs_m2",
            min_value=config.MIN_RADAR_RCS_M2,
            max_value=config.MAX_RADAR_RCS_M2,
        )
        if "observability" in target:
            observability = parse_object(target["observability"], name=f"{target_name}.observability")
            observability_keys = {"status", "tx_leg", "rx_leg"}
            _reject_unknown_keys(observability, observability_keys, name=f"{target_name}.observability")
            if observability_keys - set(observability):
                raise ValueError(f"{target_name}.observability is missing required fields")
            _validate_exact_choice(
                observability["status"],
                {"direct", "multipath", "blocked"},
                name=f"{target_name}.observability.status",
            )
            for leg_name in ("tx_leg", "rx_leg"):
                leg = parse_object(observability[leg_name], name=f"{target_name}.observability.{leg_name}")
                leg_keys = {"status", "object_id", "object_name", "surface_point_m"}
                _reject_unknown_keys(leg, leg_keys, name=f"{target_name}.observability.{leg_name}")
                if "status" not in leg:
                    raise ValueError(f"{target_name}.observability.{leg_name}.status is required")

    detection_keys = {
        "detection_id",
        "equivalent_range_m",
        "equivalent_radial_velocity_mps",
        "doppler_hz",
        "power_dbm",
        "snr_db",
        "arrival_azimuth_deg",
        "arrival_zenith_deg",
        "target_id",
        "classification",
        "position_m",
        "position_source",
    }
    required_detection_keys = detection_keys - {"classification", "position_m", "position_source"}
    detection_ids: set[str] = set()
    for index, detection in enumerate(detections):
        detection_name = f"result.detections[{index}]"
        detection = parse_object(detection, name=detection_name)
        _reject_unknown_keys(detection, detection_keys, name=detection_name)
        if required_detection_keys - set(detection):
            raise ValueError(f"{detection_name} is missing required fields")
        detection_id = detection["detection_id"]
        if (
            not isinstance(detection_id, str)
            or not detection_id
            or len(detection_id) > _MAX_CONTRACT_ID_LENGTH
            or detection_id in detection_ids
        ):
            raise ValueError(f"{detection_name}.detection_id must be a unique bounded string")
        detection_ids.add(detection_id)
        parse_bounded_float(
            detection["equivalent_range_m"], name=f"{detection_name}.equivalent_range_m", min_value=0.0
        )
        doppler_hz = parse_bounded_float(detection["doppler_hz"], name=f"{detection_name}.doppler_hz")
        equivalent_velocity = parse_bounded_float(
            detection["equivalent_radial_velocity_mps"],
            name=f"{detection_name}.equivalent_radial_velocity_mps",
        )
        expected_velocity = -wavelength_m * doppler_hz / 2.0
        if not math.isclose(equivalent_velocity, expected_velocity, rel_tol=1e-6, abs_tol=1e-9):
            raise ValueError(f"{detection_name}.equivalent_radial_velocity_mps does not match doppler_hz")
        parse_bounded_float(detection["power_dbm"], name=f"{detection_name}.power_dbm")
        parse_bounded_float(detection["snr_db"], name=f"{detection_name}.snr_db")
        parse_bounded_float(
            detection["arrival_azimuth_deg"],
            name=f"{detection_name}.arrival_azimuth_deg",
            min_value=-180.0,
            max_value=180.0,
        )
        parse_bounded_float(
            detection["arrival_zenith_deg"],
            name=f"{detection_name}.arrival_zenith_deg",
            min_value=0.0,
            max_value=180.0,
        )
        target_id = detection["target_id"]
        if target_id is not None and (not isinstance(target_id, str) or target_id not in target_ids):
            raise ValueError(f"{detection_name}.target_id must reference a result target or be null")
        if "classification" in detection:
            classification = _validate_exact_choice(
                detection["classification"],
                {"target", "clutter", "unassociated"},
                name=f"{detection_name}.classification",
            )
            if (classification == "target") != (target_id is not None):
                raise ValueError(f"{detection_name}.classification must agree with target_id")
        if "position_m" in detection and detection["position_m"] is not None:
            _parse_bounded_vector(
                detection["position_m"],
                name=f"{detection_name}.position_m",
                max_abs=config.MAX_RADAR_COORDINATE_ABS_M,
            )
        if "position_source" in detection and detection["position_source"] not in {"path_interaction", "unavailable"}:
            raise ValueError(f"{detection_name}.position_source is unsupported")

    returned_path_counts = {classification: 0 for classification in RADAR_PATH_CLASSIFICATIONS}
    path_keys = {
        "path_id",
        "classification",
        "target_ids",
        "delay_s",
        "doppler_hz",
        "path_gain_db",
        "path_length_m",
        "equivalent_range_m",
        "departure_azimuth_deg",
        "departure_zenith_deg",
        "arrival_azimuth_deg",
        "arrival_zenith_deg",
        "polyline",
        "signal_included",
        "coefficient_source",
    }
    required_path_keys = path_keys - {"signal_included", "coefficient_source"}
    path_ids: set[str] = set()
    for index, path in enumerate(paths):
        path_name = f"result.paths[{index}]"
        path = parse_object(path, name=path_name)
        _reject_unknown_keys(path, path_keys, name=path_name)
        if required_path_keys - set(path):
            raise ValueError(f"{path_name} is missing required fields")
        path_id = path["path_id"]
        if (
            not isinstance(path_id, str)
            or not path_id
            or len(path_id) > _MAX_CONTRACT_ID_LENGTH
            or path_id in path_ids
        ):
            raise ValueError(f"{path_name}.path_id must be a unique bounded string")
        path_ids.add(path_id)
        classification = _validate_exact_choice(
            path["classification"], RADAR_PATH_CLASSIFICATIONS, name=f"{path_name}.classification"
        )
        returned_path_counts[classification] += 1
        references = path["target_ids"]
        if (
            not isinstance(references, list)
            or len(references) > config.MAX_RADAR_TARGETS
            or len(references) != len(set(references))
            or any(not isinstance(item, str) or item not in target_ids for item in references)
        ):
            raise ValueError(f"{path_name}.target_ids must be unique references to result targets")
        if classification == "target" and not references:
            raise ValueError(f"{path_name} target paths must reference at least one target")
        if classification != "target" and references:
            raise ValueError(f"{path_name} non-target paths must not reference targets")
        delay_s = parse_bounded_float(path["delay_s"], name=f"{path_name}.delay_s", min_value=0.0)
        parse_bounded_float(path["doppler_hz"], name=f"{path_name}.doppler_hz")
        parse_bounded_float(path["path_gain_db"], name=f"{path_name}.path_gain_db")
        path_length_m = parse_bounded_float(path["path_length_m"], name=f"{path_name}.path_length_m", min_value=0.0)
        equivalent_range_m = parse_bounded_float(
            path["equivalent_range_m"], name=f"{path_name}.equivalent_range_m", min_value=0.0
        )
        if not math.isclose(path_length_m, SPEED_OF_LIGHT_MPS * delay_s, rel_tol=1e-6, abs_tol=1e-9):
            raise ValueError(f"{path_name}.path_length_m does not match delay_s")
        if not math.isclose(equivalent_range_m, path_length_m / 2.0, rel_tol=1e-6, abs_tol=1e-9):
            raise ValueError(f"{path_name}.equivalent_range_m must equal path_length_m / 2")
        for key in ("departure_azimuth_deg", "arrival_azimuth_deg"):
            parse_bounded_float(path[key], name=f"{path_name}.{key}", min_value=-180.0, max_value=180.0)
        for key in ("departure_zenith_deg", "arrival_zenith_deg"):
            parse_bounded_float(path[key], name=f"{path_name}.{key}", min_value=0.0, max_value=180.0)
        if (
            not isinstance(path["polyline"], list)
            or len(path["polyline"]) < 2
            or len(path["polyline"]) > config.MAX_SOLVER_DEPTH + 2
        ):
            raise ValueError(f"{path_name}.polyline must contain 2 to {config.MAX_SOLVER_DEPTH + 2} vertices")
        for vertex_index, vertex in enumerate(path["polyline"]):
            _parse_bounded_vector(
                vertex,
                name=f"{path_name}.polyline[{vertex_index}]",
                max_abs=config.MAX_RADAR_COORDINATE_ABS_M,
            )
        if "signal_included" in path and not isinstance(path["signal_included"], bool):
            raise ValueError(f"{path_name}.signal_included must be a boolean")
        if "coefficient_source" in path and (
            not isinstance(path["coefficient_source"], str) or not path["coefficient_source"]
        ):
            raise ValueError(f"{path_name}.coefficient_source must be a non-empty string")

    target_count = parse_bounded_int(summary["target_count"], name="result.summary.target_count", min_value=0)
    if target_count != len(targets):
        raise ValueError(f"result.summary.target_count must equal {len(targets)}")
    returned_detection_count = parse_bounded_int(
        summary["returned_detection_count"],
        name="result.summary.returned_detection_count",
        min_value=0,
        max_value=config.MAX_RADAR_RESULT_DETECTIONS,
    )
    total_detection_count = parse_bounded_int(
        summary["total_detection_count"], name="result.summary.total_detection_count", min_value=0
    )
    if returned_detection_count != len(detections) or total_detection_count < returned_detection_count:
        raise ValueError("result.summary detection counts are inconsistent with result.detections")
    if not isinstance(summary["detections_truncated"], bool) or summary["detections_truncated"] != (
        total_detection_count > returned_detection_count
    ):
        raise ValueError("result.summary.detections_truncated must reflect omitted detections")
    present_detection_counts = optional_summary_keys & set(summary)
    if present_detection_counts:
        if present_detection_counts != optional_summary_keys:
            raise ValueError("result.summary detection classification counts must be provided together")
        classified_total = sum(
            parse_bounded_int(summary[key], name=f"result.summary.{key}", min_value=0)
            for key in sorted(optional_summary_keys)
        )
        if classified_total != total_detection_count:
            raise ValueError("result.summary detection classification counts must equal total detections")
    total_path_counts = {}
    for classification in RADAR_PATH_CLASSIFICATIONS:
        key = f"total_{classification}_path_count"
        total_path_counts[classification] = parse_bounded_int(summary[key], name=f"result.summary.{key}", min_value=0)
        if total_path_counts[classification] < returned_path_counts[classification]:
            raise ValueError(f"result.summary.{key} cannot be smaller than returned paths")
    total_path_count = sum(total_path_counts.values())
    returned_path_count = parse_bounded_int(
        summary["returned_path_count"],
        name="result.summary.returned_path_count",
        min_value=0,
        max_value=config.MAX_RADAR_RESULT_PATHS,
    )
    if returned_path_count != len(paths):
        raise ValueError(f"result.summary.returned_path_count must equal {len(paths)}")
    if not isinstance(summary["paths_truncated"], bool) or summary["paths_truncated"] != (
        total_path_count > returned_path_count
    ):
        raise ValueError("result.summary.paths_truncated must reflect omitted paths")

    range_profile = parse_object(payload["range_profile"], name="result.range_profile")
    range_profile_keys = {"equivalent_range_axis_m", "power_dbm"}
    _reject_unknown_keys(range_profile, range_profile_keys, name="result.range_profile")
    if range_profile_keys - set(range_profile):
        raise ValueError("result.range_profile is missing required fields")
    range_axis = _finite_sequence(
        range_profile["equivalent_range_axis_m"],
        name="result.range_profile.equivalent_range_axis_m",
        max_length=config.MAX_RADAR_RANGE_PROFILE_BINS,
    )
    range_power = _finite_sequence(
        range_profile["power_dbm"],
        name="result.range_profile.power_dbm",
        max_length=config.MAX_RADAR_RANGE_PROFILE_BINS,
    )
    if not range_axis or len(range_axis) != len(range_power):
        raise ValueError("result.range_profile axes must be non-empty and have equal lengths")
    if any(value < 0.0 for value in range_axis) or any(
        range_axis[index] >= range_axis[index + 1] for index in range(len(range_axis) - 1)
    ):
        raise ValueError("result.range_profile.equivalent_range_axis_m must be non-negative and strictly increasing")

    range_doppler = parse_object(payload["range_doppler"], name="result.range_doppler")
    rd_keys = {
        "equivalent_range_axis_m",
        "doppler_axis_hz",
        "equivalent_radial_velocity_axis_mps",
        "power_dbm",
        "source_shape",
        "downsample_factor",
        "truncated",
    }
    _reject_unknown_keys(range_doppler, rd_keys, name="result.range_doppler")
    if rd_keys - set(range_doppler):
        raise ValueError("result.range_doppler is missing required fields")
    rd_range_axis = _finite_sequence(
        range_doppler["equivalent_range_axis_m"],
        name="result.range_doppler.equivalent_range_axis_m",
        max_length=config.MAX_RADAR_RESULT_RANGE_BINS,
    )
    doppler_axis = _finite_sequence(
        range_doppler["doppler_axis_hz"],
        name="result.range_doppler.doppler_axis_hz",
        max_length=config.MAX_RADAR_RESULT_DOPPLER_BINS,
    )
    velocity_axis = _finite_sequence(
        range_doppler["equivalent_radial_velocity_axis_mps"],
        name="result.range_doppler.equivalent_radial_velocity_axis_mps",
        max_length=config.MAX_RADAR_RESULT_DOPPLER_BINS,
    )
    matrix = range_doppler["power_dbm"]
    if not rd_range_axis or not doppler_axis or len(velocity_axis) != len(doppler_axis):
        raise ValueError("result.range_doppler axes must be non-empty and Doppler axes must have equal lengths")
    if any(value < 0.0 for value in rd_range_axis) or any(
        rd_range_axis[index] >= rd_range_axis[index + 1] for index in range(len(rd_range_axis) - 1)
    ):
        raise ValueError(
            "result.range_doppler.equivalent_range_axis_m must be non-negative and strictly increasing"
        )
    if any(doppler_axis[index] >= doppler_axis[index + 1] for index in range(len(doppler_axis) - 1)):
        raise ValueError("result.range_doppler.doppler_axis_hz must be strictly increasing")
    for index, (doppler_hz, equivalent_velocity) in enumerate(zip(doppler_axis, velocity_axis)):
        expected_velocity = -wavelength_m * doppler_hz / 2.0
        if not math.isclose(equivalent_velocity, expected_velocity, rel_tol=1e-6, abs_tol=1e-9):
            raise ValueError(
                "result.range_doppler.equivalent_radial_velocity_axis_mps "
                f"does not match doppler_axis_hz at index {index}"
            )
    if len(rd_range_axis) * len(doppler_axis) > config.MAX_RADAR_RESULT_CELLS:
        raise ValueError(f"result.range_doppler cell count must be at most {config.MAX_RADAR_RESULT_CELLS}")
    if not isinstance(matrix, list) or len(matrix) != len(doppler_axis):
        raise ValueError("result.range_doppler.power_dbm rows must match doppler_axis_hz")
    for row_index, row in enumerate(matrix):
        parsed_row = _finite_sequence(
            row,
            name=f"result.range_doppler.power_dbm[{row_index}]",
            max_length=config.MAX_RADAR_RESULT_RANGE_BINS,
        )
        if len(parsed_row) != len(rd_range_axis):
            raise ValueError("result.range_doppler.power_dbm columns must match equivalent_range_axis_m")
    source_shape = parse_object(range_doppler["source_shape"], name="result.range_doppler.source_shape")
    source_shape_keys = {"doppler_bins", "range_bins"}
    _reject_unknown_keys(source_shape, source_shape_keys, name="result.range_doppler.source_shape")
    if source_shape_keys - set(source_shape):
        raise ValueError("result.range_doppler.source_shape is missing required fields")
    source_doppler_bins = parse_bounded_int(
        source_shape["doppler_bins"],
        name="result.range_doppler.source_shape.doppler_bins",
        min_value=len(doppler_axis),
        max_value=config.MAX_RADAR_NUM_SYMBOLS,
    )
    source_range_bins = parse_bounded_int(
        source_shape["range_bins"],
        name="result.range_doppler.source_shape.range_bins",
        min_value=len(rd_range_axis),
        max_value=config.MAX_RADAR_NUM_SUBCARRIERS,
    )
    if source_doppler_bins != num_symbols or source_range_bins != num_subcarriers:
        raise ValueError("result.range_doppler.source_shape must match the Radar OFDM dimensions")
    downsample_factor = parse_object(
        range_doppler["downsample_factor"], name="result.range_doppler.downsample_factor"
    )
    downsample_keys = {"doppler", "range"}
    _reject_unknown_keys(downsample_factor, downsample_keys, name="result.range_doppler.downsample_factor")
    if downsample_keys - set(downsample_factor):
        raise ValueError("result.range_doppler.downsample_factor is missing required fields")
    doppler_factor = parse_bounded_int(
        downsample_factor["doppler"],
        name="result.range_doppler.downsample_factor.doppler",
        min_value=1,
        max_value=source_doppler_bins,
    )
    range_factor = parse_bounded_int(
        downsample_factor["range"],
        name="result.range_doppler.downsample_factor.range",
        min_value=1,
        max_value=source_range_bins,
    )
    is_downsampled = source_doppler_bins > len(doppler_axis) or source_range_bins > len(rd_range_axis)
    if not isinstance(range_doppler["truncated"], bool) or range_doppler["truncated"] != is_downsampled:
        raise ValueError("result.range_doppler.truncated must reflect source_shape")
    if not is_downsampled and (doppler_factor != 1 or range_factor != 1):
        raise ValueError("result.range_doppler.downsample_factor must be one when data is not truncated")
    if is_downsampled and doppler_factor == 1 and range_factor == 1:
        raise ValueError("result.range_doppler.downsample_factor must describe truncated data")

    if "range_doppler_focus" in payload:
        _validate_range_doppler_result(
            payload["range_doppler_focus"],
            name="result.range_doppler_focus",
            wavelength_m=wavelength_m,
            num_symbols=num_symbols,
            num_subcarriers=num_subcarriers,
            focused=True,
        )

    if "processing_views" in payload:
        processing_views = parse_object(payload["processing_views"], name="result.processing_views")
        view_names = set(RADAR_PROCESSING_VIEW_METHODS)
        _reject_unknown_keys(processing_views, view_names, name="result.processing_views")
        if view_names - set(processing_views):
            raise ValueError("result.processing_views must provide every supported processing view")
        for view_name, expected_method in RADAR_PROCESSING_VIEW_METHODS.items():
            view_path = f"result.processing_views.{view_name}"
            view = parse_object(processing_views[view_name], name=view_path)
            view_keys = {
                "method",
                "detections",
                "detection_summary",
                "range_profile",
                "range_doppler",
                "range_doppler_focus",
                "peak_snr_db",
            }
            _reject_unknown_keys(view, view_keys, name=view_path)
            if view_keys - set(view):
                raise ValueError(f"{view_path} is missing required fields")
            if view["method"] != expected_method:
                raise ValueError(f"{view_path}.method does not match the supported processing method")
            returned_classification_counts = _validate_processing_view_detections(
                view["detections"],
                name=f"{view_path}.detections",
                wavelength_m=wavelength_m,
                target_ids=target_ids,
            )
            _validate_processing_detection_summary(
                view["detection_summary"],
                name=f"{view_path}.detection_summary",
                returned_count=len(view["detections"]),
                returned_classification_counts=returned_classification_counts,
            )
            _validate_range_profile_result(view["range_profile"], name=f"{view_path}.range_profile")
            _validate_range_doppler_result(
                view["range_doppler"],
                name=f"{view_path}.range_doppler",
                wavelength_m=wavelength_m,
                num_symbols=num_symbols,
                num_subcarriers=num_subcarriers,
                focused=False,
            )
            _validate_range_doppler_result(
                view["range_doppler_focus"],
                name=f"{view_path}.range_doppler_focus",
                wavelength_m=wavelength_m,
                num_symbols=num_symbols,
                num_subcarriers=num_subcarriers,
                focused=True,
            )
            parse_bounded_float(view["peak_snr_db"], name=f"{view_path}.peak_snr_db")

    resolution = parse_object(payload["resolution"], name="result.resolution")
    resolution_keys = {"equivalent_range_m", "doppler_hz", "equivalent_radial_velocity_mps"}
    optional_resolution_keys = {
        "max_unambiguous_equivalent_range_m",
        "max_unambiguous_doppler_hz",
        "max_unambiguous_equivalent_radial_velocity_mps",
    }
    _reject_unknown_keys(resolution, resolution_keys | optional_resolution_keys, name="result.resolution")
    if resolution_keys - set(resolution):
        raise ValueError("result.resolution is missing required fields")
    for key in resolution_keys | (optional_resolution_keys & set(resolution)):
        value = parse_bounded_float(resolution[key], name=f"result.resolution.{key}", min_value=0.0)
        if value <= 0.0:
            raise ValueError(f"result.resolution.{key} must be greater than zero")

    statistics = parse_object(payload["statistics"], name="result.statistics")
    statistics_keys = {
        "solver_seconds",
        "processing_seconds",
        "total_seconds",
        "noise_power_dbm",
        "peak_snr_db",
        "raw_path_count",
        "returned_path_count",
    }
    optional_statistics_keys = {
        "processed_signal_path_count",
        "signal_paths_truncated",
        "range_window",
        "doppler_window",
        "cfar_method",
        "direct_path_cancellation_enabled",
        "direct_path_cancellation_method",
        "cancelled_direct_path_count",
        "ideal_cancelled_clutter_path_count",
        "display_path_reduction",
        "target_echo_normalization",
    }
    _reject_unknown_keys(statistics, statistics_keys | optional_statistics_keys, name="result.statistics")
    if statistics_keys - set(statistics):
        raise ValueError("result.statistics is missing required fields")
    solver_seconds = parse_bounded_float(
        statistics["solver_seconds"], name="result.statistics.solver_seconds", min_value=0.0
    )
    processing_seconds = parse_bounded_float(
        statistics["processing_seconds"], name="result.statistics.processing_seconds", min_value=0.0
    )
    total_seconds = parse_bounded_float(
        statistics["total_seconds"], name="result.statistics.total_seconds", min_value=0.0
    )
    if total_seconds + 1e-12 < solver_seconds + processing_seconds:
        raise ValueError("result.statistics.total_seconds must include solver and processing time")
    parse_bounded_float(statistics["noise_power_dbm"], name="result.statistics.noise_power_dbm")
    parse_bounded_float(statistics["peak_snr_db"], name="result.statistics.peak_snr_db")
    raw_path_count = parse_bounded_int(
        statistics["raw_path_count"], name="result.statistics.raw_path_count", min_value=0
    )
    statistics_returned_path_count = parse_bounded_int(
        statistics["returned_path_count"],
        name="result.statistics.returned_path_count",
        min_value=0,
        max_value=config.MAX_RADAR_RESULT_PATHS,
    )
    if raw_path_count != total_path_count or statistics_returned_path_count != returned_path_count:
        raise ValueError("result.statistics path counts must match result.summary")
    if "display_path_reduction" in statistics:
        reduction = parse_object(
            statistics["display_path_reduction"],
            name="result.statistics.display_path_reduction",
        )
        reduction_keys = {
            "source_path_count",
            "unique_geometry_path_count",
            "returned_path_count",
            "source_clutter_path_count",
            "spatial_clutter_bin_count",
            "returned_clutter_path_count",
            "spatial_bin_m",
            "azimuth_bin_deg",
            "range_bin_m",
            "reduced",
        }
        _reject_unknown_keys(
            reduction,
            reduction_keys,
            name="result.statistics.display_path_reduction",
        )
        if reduction_keys - set(reduction):
            raise ValueError("result.statistics.display_path_reduction is missing required fields")
        source_count = parse_bounded_int(
            reduction["source_path_count"],
            name="result.statistics.display_path_reduction.source_path_count",
            min_value=0,
        )
        unique_count = parse_bounded_int(
            reduction["unique_geometry_path_count"],
            name="result.statistics.display_path_reduction.unique_geometry_path_count",
            min_value=0,
            max_value=source_count,
        )
        reduced_returned_count = parse_bounded_int(
            reduction["returned_path_count"],
            name="result.statistics.display_path_reduction.returned_path_count",
            min_value=0,
            max_value=256,
        )
        source_clutter_count = parse_bounded_int(
            reduction["source_clutter_path_count"],
            name="result.statistics.display_path_reduction.source_clutter_path_count",
            min_value=0,
            max_value=source_count,
        )
        spatial_clutter_bin_count = parse_bounded_int(
            reduction["spatial_clutter_bin_count"],
            name="result.statistics.display_path_reduction.spatial_clutter_bin_count",
            min_value=0,
            max_value=source_clutter_count,
        )
        returned_clutter_count = parse_bounded_int(
            reduction["returned_clutter_path_count"],
            name="result.statistics.display_path_reduction.returned_clutter_path_count",
            min_value=0,
            max_value=source_clutter_count,
        )
        spatial_bin_m = parse_bounded_float(
            reduction["spatial_bin_m"],
            name="result.statistics.display_path_reduction.spatial_bin_m",
            min_value=0.0,
        )
        if spatial_bin_m <= 0.0:
            raise ValueError("result.statistics.display_path_reduction.spatial_bin_m must be positive")
        for key in ("azimuth_bin_deg", "range_bin_m"):
            value = parse_bounded_float(
                reduction[key],
                name=f"result.statistics.display_path_reduction.{key}",
                min_value=0.0,
            )
            if value <= 0.0:
                raise ValueError(f"result.statistics.display_path_reduction.{key} must be positive")
        if (
            source_count != raw_path_count
            or reduced_returned_count != returned_path_count
            or source_clutter_count != total_path_counts["clutter"]
            or returned_clutter_count != returned_path_counts["clutter"]
            or spatial_clutter_bin_count < returned_clutter_count
            or unique_count < returned_path_count
        ):
            raise ValueError("result.statistics.display_path_reduction counts are inconsistent")
        if not isinstance(reduction["reduced"], bool) or reduction["reduced"] != (
            source_count > reduced_returned_count
        ):
            raise ValueError("result.statistics.display_path_reduction.reduced must reflect omitted paths")
    cancellation_keys = {
        "direct_path_cancellation_enabled",
        "direct_path_cancellation_method",
        "cancelled_direct_path_count",
    }
    present_cancellation_keys = cancellation_keys & set(statistics)
    cancelled_direct_path_count = 0
    if present_cancellation_keys:
        if present_cancellation_keys != cancellation_keys:
            raise ValueError("result.statistics direct-path cancellation fields must be provided together")
        cancellation_enabled = statistics["direct_path_cancellation_enabled"]
        if not isinstance(cancellation_enabled, bool):
            raise ValueError("result.statistics.direct_path_cancellation_enabled must be a boolean")
        expected_method = RADAR_DIRECT_PATH_CANCELLATION_METHOD if cancellation_enabled else "disabled"
        if statistics["direct_path_cancellation_method"] != expected_method:
            raise ValueError(
                "result.statistics.direct_path_cancellation_method does not match the cancellation state"
            )
        cancelled_direct_path_count = parse_bounded_int(
            statistics["cancelled_direct_path_count"],
            name="result.statistics.cancelled_direct_path_count",
            min_value=0,
            max_value=total_path_counts["direct"],
        )
        expected_cancelled_count = total_path_counts["direct"] if cancellation_enabled else 0
        if cancelled_direct_path_count != expected_cancelled_count:
            raise ValueError(
                "result.statistics.cancelled_direct_path_count must reflect all classified direct paths"
            )
    if "processed_signal_path_count" in statistics:
        processed_signal_path_count = parse_bounded_int(
            statistics["processed_signal_path_count"],
            name="result.statistics.processed_signal_path_count",
            min_value=0,
            max_value=raw_path_count,
        )
        expected_truncated = processed_signal_path_count + cancelled_direct_path_count < raw_path_count
        if not isinstance(statistics.get("signal_paths_truncated"), bool) or (
            statistics["signal_paths_truncated"] != expected_truncated
        ):
            raise ValueError("result.statistics.signal_paths_truncated must reflect processed paths")
    elif "signal_paths_truncated" in statistics:
        raise ValueError("result.statistics.signal_paths_truncated requires processed_signal_path_count")
    if "ideal_cancelled_clutter_path_count" in statistics:
        parse_bounded_int(
            statistics["ideal_cancelled_clutter_path_count"],
            name="result.statistics.ideal_cancelled_clutter_path_count",
            min_value=0,
            max_value=total_path_counts["clutter"],
        )
    processing_labels = {
        "range_window": RADAR_RANGE_WINDOW,
        "doppler_window": RADAR_DOPPLER_WINDOW,
        "cfar_method": RADAR_CFAR_METHOD,
    }
    for key, expected in processing_labels.items():
        if key in statistics and statistics[key] != expected:
            raise ValueError(f"result.statistics.{key} does not match the version-one implementation")

    if "target_echo_normalization" in statistics and statistics["target_echo_normalization"] != "effective_rcs":
        raise ValueError("result.statistics.target_echo_normalization is unsupported")

    if "scene_health" in payload:
        scene_health = parse_object(payload["scene_health"], name="result.scene_health")
        scene_health_keys = {
            "build_id",
            "request_fingerprint",
            "direct_path_available",
            "near_platform_clutter_path_count",
            "warnings",
        }
        _reject_unknown_keys(scene_health, scene_health_keys, name="result.scene_health")
        if scene_health_keys - set(scene_health):
            raise ValueError("result.scene_health is missing required fields")
        if not isinstance(scene_health["build_id"], str) or not scene_health["build_id"]:
            raise ValueError("result.scene_health.build_id must be a non-empty string")
        if not isinstance(scene_health["request_fingerprint"], str) or not scene_health["request_fingerprint"]:
            raise ValueError("result.scene_health.request_fingerprint must be a non-empty string")
        if not isinstance(scene_health["direct_path_available"], bool):
            raise ValueError("result.scene_health.direct_path_available must be a boolean")
        parse_bounded_int(
            scene_health["near_platform_clutter_path_count"],
            name="result.scene_health.near_platform_clutter_path_count",
            min_value=0,
        )
        if not isinstance(scene_health["warnings"], list) or any(
            not isinstance(item, str) or len(item) > 512 for item in scene_health["warnings"]
        ):
            raise ValueError("result.scene_health.warnings must be bounded strings")

    return payload
