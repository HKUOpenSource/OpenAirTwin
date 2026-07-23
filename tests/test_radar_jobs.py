from __future__ import annotations

from threading import Event
import time

import pytest

from backend.jobs.radar_jobs import RadarJobManager, RadarQueueFull
from backend.rt.radar_payload import validate_radar_job_status
from backend.rt.runtime import SceneNotReady


def _wait_for_status(manager: RadarJobManager, job_id: str, expected: str, timeout: float = 2.0):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        job = manager.get_job(job_id)
        if job is not None and job.status == expected:
            return job
        time.sleep(0.005)
    job = manager.get_job(job_id)
    raise AssertionError(f"Radar job did not reach {expected}; current={None if job is None else job.status}")


def _result_for_generation(generation: int) -> dict:
    return {"scene_generation": generation, "bounded": [1, 2, 3]}


def test_background_job_uses_immutable_request_snapshot_and_contract_status() -> None:
    started = Event()
    release = Event()
    observed: list[dict] = []

    def solver(_runtime, payload, *, expected_scene_generation, progress_cb, cancel_check):
        observed.append(payload)
        started.set()
        assert release.wait(timeout=2)
        cancel_check()
        progress_cb(0.75, "Processing")
        return _result_for_generation(expected_scene_generation)

    manager = RadarJobManager(object(), solver=solver, max_pending_jobs=2, max_stored_jobs=4)
    payload = {"tx": {"position": [1.0, 2.0, 3.0]}}
    try:
        job = manager.create_job(payload, scene_generation=7)
        payload["tx"]["position"][0] = 999.0
        assert started.wait(timeout=2)
        release.set()
        completed = _wait_for_status(manager, job.job_id, "succeeded")

        assert observed[0]["tx"]["position"] == [1.0, 2.0, 3.0]
        assert completed.request_snapshot is None
        assert completed.started_at is not None
        assert completed.finished_at is not None
        assert completed.progress == 1.0
        assert validate_radar_job_status(completed.to_status_dict()) == completed.to_status_dict()
        assert manager.get_result(job.job_id) == _result_for_generation(7)
    finally:
        release.set()
        manager.shutdown()


def test_queue_limit_and_queued_cancellation_release_request() -> None:
    manager = RadarJobManager(
        object(),
        solver=lambda *_args, **_kwargs: _result_for_generation(1),
        max_pending_jobs=1,
        max_stored_jobs=1,
        start_worker=False,
    )
    first = manager.create_job({}, scene_generation=1)
    with pytest.raises(RadarQueueFull) as error:
        manager.create_job({}, scene_generation=1)
    assert error.value.max_pending_jobs == 1

    cancelled = manager.cancel_job(first.job_id)
    assert cancelled is first
    assert cancelled.status == "cancelled"
    assert cancelled.started_at is None
    assert cancelled.finished_at is not None
    assert cancelled.request_snapshot is None
    assert cancelled.result is None
    validate_radar_job_status(cancelled.to_status_dict())
    manager.shutdown()


def test_running_noninterruptible_stage_reports_wait_then_discards_late_result() -> None:
    started = Event()
    release = Event()

    def solver(_runtime, _payload, *, expected_scene_generation, progress_cb, cancel_check):
        progress_cb(0.4, "Inside non-interruptible RT solve")
        started.set()
        assert release.wait(timeout=2)
        return _result_for_generation(expected_scene_generation)

    manager = RadarJobManager(object(), solver=solver, max_pending_jobs=1, max_stored_jobs=2)
    try:
        job = manager.create_job({}, scene_generation=3)
        assert started.wait(timeout=2)
        cancelling = manager.cancel_job(job.job_id)
        assert cancelling is not None
        assert cancelling.status == "running"
        assert "waiting" in cancelling.message.lower()
        assert cancelling.finished_at is None

        release.set()
        cancelled = _wait_for_status(manager, job.job_id, "cancelled")
        assert cancelled.result is None
        assert cancelled.request_snapshot is None
        validate_radar_job_status(cancelled.to_status_dict())
    finally:
        release.set()
        manager.shutdown()


@pytest.mark.parametrize(
    ("solver", "error_text"),
    [
        (
            lambda _runtime, _payload, **_kwargs: (_ for _ in ()).throw(RuntimeError("solver exploded")),
            "solver exploded",
        ),
        (
            lambda _runtime, _payload, **_kwargs: (_ for _ in ()).throw(
                SceneNotReady("stale", "scene generation changed")
            ),
            "scene generation changed",
        ),
    ],
)
def test_solver_failure_and_stale_scene_become_bounded_failed_jobs(solver, error_text) -> None:
    manager = RadarJobManager(object(), solver=solver, max_pending_jobs=1, max_stored_jobs=2)
    try:
        job = manager.create_job({}, scene_generation=5)
        failed = _wait_for_status(manager, job.job_id, "failed")
        assert failed.error == error_text
        assert failed.result is None
        assert failed.request_snapshot is None
        validate_radar_job_status(failed.to_status_dict())
    finally:
        manager.shutdown()


def test_mismatched_result_generation_is_rejected_as_stale() -> None:
    def solver(_runtime, _payload, **_kwargs):
        return _result_for_generation(99)

    manager = RadarJobManager(object(), solver=solver, max_pending_jobs=1, max_stored_jobs=2)
    try:
        job = manager.create_job({}, scene_generation=4)
        failed = _wait_for_status(manager, job.job_id, "failed")
        assert "generation" in (failed.error or "")
        assert failed.result is None
    finally:
        manager.shutdown()


def test_failed_job_does_not_stop_worker_or_block_recovery() -> None:
    call_count = 0

    def solver(_runtime, _payload, *, expected_scene_generation, **_kwargs):
        nonlocal call_count
        call_count += 1
        if call_count == 1:
            raise RuntimeError("first solve failed")
        return _result_for_generation(expected_scene_generation)

    manager = RadarJobManager(object(), solver=solver, max_pending_jobs=1, max_stored_jobs=2)
    try:
        failed = manager.create_job({}, scene_generation=2)
        _wait_for_status(manager, failed.job_id, "failed")
        recovered = manager.create_job({}, scene_generation=2)
        _wait_for_status(manager, recovered.job_id, "succeeded")
        assert call_count == 2
    finally:
        manager.shutdown()


def test_storage_eviction_releases_old_result_arrays() -> None:
    def solver(_runtime, _payload, *, expected_scene_generation, **_kwargs):
        return _result_for_generation(expected_scene_generation)

    manager = RadarJobManager(
        object(),
        solver=solver,
        max_pending_jobs=1,
        max_stored_jobs=2,
        job_ttl_seconds=3600,
    )
    try:
        first = manager.create_job({}, scene_generation=1)
        _wait_for_status(manager, first.job_id, "succeeded")
        second = manager.create_job({}, scene_generation=1)
        _wait_for_status(manager, second.job_id, "succeeded")
        third = manager.create_job({}, scene_generation=1)
        _wait_for_status(manager, third.job_id, "succeeded")

        assert manager.stored_job_count() == 2
        assert manager.get_job(first.job_id) is None
        assert first.result is None
        assert first.request_snapshot is None
        assert manager.get_job(second.job_id) is not None
        assert manager.get_job(third.job_id) is not None
    finally:
        manager.shutdown()


def test_ttl_expiry_releases_result_and_request_references() -> None:
    completed = Event()

    def solver(_runtime, _payload, *, expected_scene_generation, **_kwargs):
        completed.set()
        return _result_for_generation(expected_scene_generation)

    manager = RadarJobManager(
        object(),
        solver=solver,
        max_pending_jobs=1,
        max_stored_jobs=1,
        job_ttl_seconds=0,
    )
    try:
        job = manager.create_job({}, scene_generation=1)
        assert completed.wait(timeout=2)
        deadline = time.monotonic() + 2
        while job.status != "succeeded" and time.monotonic() < deadline:
            time.sleep(0.005)
        assert job.status == "succeeded"

        assert manager.get_job(job.job_id) is None
        assert job.result is None
        assert job.request_snapshot is None
    finally:
        manager.shutdown()


def test_shutdown_cooperatively_cancels_running_and_queued_jobs() -> None:
    started = Event()

    def solver(_runtime, _payload, *, cancel_check, **_kwargs):
        started.set()
        while True:
            cancel_check()
            time.sleep(0.001)

    manager = RadarJobManager(
        object(),
        solver=solver,
        max_pending_jobs=2,
        max_stored_jobs=2,
        shutdown_timeout_seconds=1,
    )
    running = manager.create_job({}, scene_generation=1)
    queued = manager.create_job({}, scene_generation=1)
    assert started.wait(timeout=2)

    manager.shutdown()

    assert manager.get_job(running.job_id).status == "cancelled"
    assert manager.get_job(queued.job_id).status == "cancelled"
    assert manager._worker is not None and not manager._worker.is_alive()
