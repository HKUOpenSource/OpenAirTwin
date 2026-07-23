from __future__ import annotations

from copy import deepcopy
from dataclasses import dataclass, field
from datetime import datetime, timezone
from queue import Empty, Full, Queue
import sys
from threading import Event, Lock, Thread, current_thread
import time
import traceback
from typing import Callable
from uuid import uuid4

from backend import config
from backend.features.core import FeatureQueueFull
from backend.rt.process_radar import solve_radar_sensing
from backend.rt.radar_payload import parse_radar_payload, validate_radar_job_status
from backend.rt.runtime import SceneNotReady, require_scene_generation


_ACTIVE_STATUSES = frozenset({"queued", "running"})
_TERMINAL_STATUSES = frozenset({"succeeded", "failed", "cancelled"})
_MAX_PUBLIC_MESSAGE_LENGTH = 512


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _bounded_message(value: object, fallback: str) -> str:
    message = str(value).strip() or fallback
    return message[:_MAX_PUBLIC_MESSAGE_LENGTH]


class RadarJobCancelled(RuntimeError):
    """Internal cooperative-cancellation signal; never exposed as a failed job."""


class RadarQueueFull(FeatureQueueFull):
    def __init__(self, max_pending_jobs: int) -> None:
        super().__init__("Radar job queue is full", max_pending_jobs)


@dataclass
class RadarJob:
    job_id: str
    status: str
    progress: float
    message: str
    scene_generation: int
    created_at: str = field(default_factory=_utc_now)
    started_at: str | None = None
    finished_at: str | None = None
    result: dict | None = field(default=None, repr=False)
    error: str | None = None
    request_snapshot: dict | None = field(default=None, repr=False)
    cancellation_requested: bool = field(default=False, repr=False)
    cancel_event: Event = field(default_factory=Event, repr=False)
    created_at_epoch: float = field(default_factory=time.time, repr=False)
    finished_at_epoch: float | None = field(default=None, repr=False)

    def to_status_dict(self) -> dict:
        payload = {
            "job_id": self.job_id,
            "status": self.status,
            "progress": self.progress,
            "message": self.message,
            "created_at": self.created_at,
            "started_at": self.started_at,
            "finished_at": self.finished_at,
            "scene_generation": self.scene_generation,
        }
        if self.status == "failed":
            payload["error"] = self.error
        return validate_radar_job_status(payload)


class RadarJobManager:
    """Bounded, memory-only Radar queue with cooperative cancellation."""

    def __init__(
        self,
        rt_runtime,
        *,
        solver: Callable = solve_radar_sensing,
        max_pending_jobs: int = config.RADAR_MAX_PENDING_JOBS,
        max_stored_jobs: int = config.RADAR_MAX_STORED_JOBS,
        job_ttl_seconds: float = config.RADAR_JOB_TTL_SECONDS,
        shutdown_timeout_seconds: float = config.RADAR_JOB_SHUTDOWN_TIMEOUT_SECONDS,
        start_worker: bool = True,
    ) -> None:
        if int(max_pending_jobs) <= 0:
            raise ValueError("max_pending_jobs must be positive")
        if int(max_stored_jobs) < int(max_pending_jobs):
            raise ValueError("max_stored_jobs must be at least max_pending_jobs")
        if float(job_ttl_seconds) < 0.0:
            raise ValueError("job_ttl_seconds must be non-negative")
        if float(shutdown_timeout_seconds) < 0.0:
            raise ValueError("shutdown_timeout_seconds must be non-negative")

        self._rt_runtime = rt_runtime
        self._solver = solver
        self.max_pending_jobs = int(max_pending_jobs)
        self.max_stored_jobs = int(max_stored_jobs)
        self.job_ttl_seconds = float(job_ttl_seconds)
        self.shutdown_timeout_seconds = float(shutdown_timeout_seconds)
        self._jobs: dict[str, RadarJob] = {}
        self._lock = Lock()
        self._queue: Queue[str] = Queue(maxsize=self.max_pending_jobs)
        self._shutdown_event = Event()
        self._worker: Thread | None = None
        if start_worker:
            self._worker = Thread(
                target=self._worker_loop,
                name="RadarJobWorker",
                daemon=True,
            )
            self._worker.start()

    def create_job(self, payload: dict, *, scene_generation: int) -> RadarJob:
        if self._shutdown_event.is_set():
            raise RuntimeError("Radar job manager is shut down")
        parse_radar_payload(payload)
        if isinstance(scene_generation, bool) or not isinstance(scene_generation, int) or scene_generation < 0:
            raise ValueError("scene_generation must be a non-negative integer")
        request_snapshot = deepcopy(payload)
        job = RadarJob(
            job_id=f"radar_{uuid4().hex[:12]}",
            status="queued",
            progress=0.0,
            message="Queued",
            scene_generation=scene_generation,
            request_snapshot=request_snapshot,
        )
        with self._lock:
            if self._shutdown_event.is_set():
                self._release_job_locked(job)
                raise RuntimeError("Radar job manager is shut down")
            self._cleanup_locked(time.time())
            active_count = sum(1 for existing in self._jobs.values() if existing.status in _ACTIVE_STATUSES)
            if active_count >= self.max_pending_jobs:
                raise RadarQueueFull(self.max_pending_jobs)
            self._jobs[job.job_id] = job
            try:
                self._queue.put_nowait(job.job_id)
            except Full:
                self._release_job_locked(job)
                self._jobs.pop(job.job_id, None)
                raise RadarQueueFull(self.max_pending_jobs) from None
            self._cleanup_locked(time.time())
        return job

    def get_job(self, job_id: str) -> RadarJob | None:
        with self._lock:
            self._cleanup_locked(time.time())
            return self._jobs.get(job_id)

    def get_result(self, job_id: str) -> dict | None:
        with self._lock:
            self._cleanup_locked(time.time())
            job = self._jobs.get(job_id)
            return None if job is None else job.result

    def cancel_job(self, job_id: str) -> RadarJob | None:
        with self._lock:
            self._cleanup_locked(time.time())
            job = self._jobs.get(job_id)
            if job is None or job.status in _TERMINAL_STATUSES:
                return job
            job.cancellation_requested = True
            job.cancel_event.set()
            if job.status == "queued":
                self._finish_locked(job, status="cancelled", message="Cancelled")
            else:
                job.message = "Cancellation requested; waiting for current Radar stage"
            return job

    def stored_job_count(self) -> int:
        with self._lock:
            self._cleanup_locked(time.time())
            return len(self._jobs)

    def shutdown(self) -> None:
        if self._shutdown_event.is_set():
            return
        self._shutdown_event.set()
        with self._lock:
            for job in self._jobs.values():
                if job.status not in _ACTIVE_STATUSES:
                    continue
                job.cancellation_requested = True
                job.cancel_event.set()
                if job.status == "queued":
                    self._finish_locked(job, status="cancelled", message="Cancelled during shutdown")
                else:
                    job.message = "Cancellation requested; waiting for current Radar stage"
        worker = self._worker
        if worker is not None and worker is not current_thread():
            worker.join(timeout=self.shutdown_timeout_seconds)

    def _worker_loop(self) -> None:
        while True:
            if self._shutdown_event.is_set() and self._queue.empty():
                return
            try:
                job_id = self._queue.get(timeout=0.1)
            except Empty:
                continue
            try:
                self._run_job(job_id)
            finally:
                self._queue.task_done()

    def _run_job(self, job_id: str) -> None:
        with self._lock:
            job = self._jobs.get(job_id)
            if job is None or job.status == "cancelled":
                return
            job.status = "running"
            job.progress = 0.01
            job.message = "Starting Radar solve"
            job.started_at = _utc_now()
            payload = job.request_snapshot
            scene_generation = job.scene_generation

        try:
            self._cancel_check(job_id)
            if payload is None:
                raise RuntimeError("Radar request snapshot was released before execution")
            result = self._solver(
                self._rt_runtime,
                payload,
                expected_scene_generation=scene_generation,
                progress_cb=lambda progress, message: self._update_progress(job_id, progress, message),
                cancel_check=lambda: self._cancel_check(job_id),
            )
            self._cancel_check(job_id)
            if int(result.get("scene_generation", -1)) != scene_generation:
                raise SceneNotReady(
                    "stale",
                    "Radar result scene generation does not match the queued scene",
                )
            self._store_success_if_current(job_id, scene_generation, result)
        except RadarJobCancelled:
            with self._lock:
                current = self._jobs.get(job_id)
                if current is not None and current.status not in _TERMINAL_STATUSES:
                    self._finish_locked(current, status="cancelled", message="Cancelled")
        except Exception as exc:
            traceback.print_exception(type(exc), exc, exc.__traceback__, file=sys.stderr)
            with self._lock:
                current = self._jobs.get(job_id)
                if current is None or current.status in _TERMINAL_STATUSES:
                    return
                if current.cancel_event.is_set():
                    self._finish_locked(current, status="cancelled", message="Cancelled")
                else:
                    error = _bounded_message(exc, "Radar solve failed")
                    self._finish_locked(
                        current,
                        status="failed",
                        message="Radar solve failed",
                        error=error,
                    )

    def _cancel_check(self, job_id: str) -> None:
        with self._lock:
            job = self._jobs.get(job_id)
            if job is None or job.cancel_event.is_set():
                raise RadarJobCancelled("Radar job cancelled")

    def _update_progress(self, job_id: str, progress: float, message: str) -> None:
        with self._lock:
            job = self._jobs.get(job_id)
            if job is None or job.status != "running" or job.cancel_event.is_set():
                return
            job.progress = max(job.progress, min(0.99, max(0.0, float(progress))))
            job.message = _bounded_message(message, job.message)

    def _store_success_if_current(self, job_id: str, scene_generation: int, result: dict) -> None:
        runtime_lock = getattr(self._rt_runtime, "lock", None)
        if runtime_lock is None:
            require_scene_generation(self._rt_runtime, scene_generation)
            self._store_success_locked(job_id, result)
            return
        with runtime_lock:
            require_scene_generation(self._rt_runtime, scene_generation)
            self._store_success_locked(job_id, result)

    def _store_success_locked(self, job_id: str, result: dict) -> None:
        with self._lock:
            current = self._jobs.get(job_id)
            if current is None:
                return
            if current.cancel_event.is_set():
                self._finish_locked(current, status="cancelled", message="Cancelled")
            else:
                self._finish_locked(
                    current,
                    status="succeeded",
                    message="Radar result ready",
                    result=result,
                )

    def _finish_locked(
        self,
        job: RadarJob,
        *,
        status: str,
        message: str,
        result: dict | None = None,
        error: str | None = None,
    ) -> None:
        job.status = status
        job.progress = 1.0
        job.message = _bounded_message(message, status.title())
        job.finished_at = _utc_now()
        job.finished_at_epoch = time.time()
        job.result = result if status == "succeeded" else None
        job.error = error if status == "failed" else None
        job.request_snapshot = None

    @staticmethod
    def _release_job_locked(job: RadarJob) -> None:
        job.result = None
        job.request_snapshot = None

    def _cleanup_locked(self, now: float) -> None:
        expired_ids = [
            job_id
            for job_id, job in self._jobs.items()
            if job.status in _TERMINAL_STATUSES
            and job.finished_at_epoch is not None
            and now - job.finished_at_epoch >= self.job_ttl_seconds
        ]
        for job_id in expired_ids:
            job = self._jobs.pop(job_id)
            self._release_job_locked(job)

        overflow = len(self._jobs) - self.max_stored_jobs
        if overflow <= 0:
            return
        removable = sorted(
            (job for job in self._jobs.values() if job.status in _TERMINAL_STATUSES),
            key=lambda job: job.finished_at_epoch or job.created_at_epoch,
        )
        for job in removable[:overflow]:
            self._jobs.pop(job.job_id, None)
            self._release_job_locked(job)
