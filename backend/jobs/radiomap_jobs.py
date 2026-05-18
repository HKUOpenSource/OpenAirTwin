from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from queue import Full, Queue
import sys
from threading import Lock, Thread
import time
import traceback
from uuid import uuid4

from backend import config
from backend.rt.common import parse_radiomap_payload
from backend.rt.solve_radiomap import solve_terrain_radiomap


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


@dataclass
class RadiomapJob:
    job_id: str
    status: str
    progress: float
    message: str
    created_at: str = field(default_factory=_utc_now)
    updated_at: str = field(default_factory=_utc_now)
    created_at_epoch: float = field(default_factory=time.time, repr=False)
    updated_at_epoch: float = field(default_factory=time.time, repr=False)
    result: dict | None = None
    error: str | None = None
    scene_generation: int | None = None

    def to_status_dict(self) -> dict:
        return {
            "job_id": self.job_id,
            "status": self.status,
            "progress": self.progress,
            "message": self.message,
            "created_at": self.created_at,
            "updated_at": self.updated_at,
        }


class RadiomapQueueFull(RuntimeError):
    def __init__(self, max_pending_jobs: int) -> None:
        super().__init__(f"Radio map job queue is full; try again later")
        self.max_pending_jobs = max_pending_jobs


class RadiomapJobManager:
    def __init__(
        self,
        rt_runtime,
        *,
        solver=solve_terrain_radiomap,
        validate_payload=parse_radiomap_payload,
        max_pending_jobs: int = config.RADIOMAP_MAX_PENDING_JOBS,
        max_stored_jobs: int = config.RADIOMAP_MAX_STORED_JOBS,
        job_ttl_seconds: float = config.RADIOMAP_JOB_TTL_SECONDS,
        start_worker: bool = True,
    ) -> None:
        self._rt_runtime = rt_runtime
        self._solver = solver
        self._validate_payload = validate_payload
        self.max_pending_jobs = int(max_pending_jobs)
        self.max_stored_jobs = int(max_stored_jobs)
        self.job_ttl_seconds = float(job_ttl_seconds)
        self._jobs: dict[str, RadiomapJob] = {}
        self._lock = Lock()
        self._queue: Queue[tuple[str, dict]] = Queue(maxsize=self.max_pending_jobs)
        self._worker: Thread | None = None
        if start_worker:
            self._worker = Thread(target=self._worker_loop, daemon=True)
            self._worker.start()

    def create_job(self, payload: dict, *, scene_generation: int | None = None) -> RadiomapJob:
        self._validate_payload(payload)
        job = RadiomapJob(
            job_id=f"rm_{uuid4().hex[:12]}",
            status="queued",
            progress=0.0,
            message="Queued",
            scene_generation=scene_generation,
        )
        with self._lock:
            self._cleanup_locked(time.time())
            self._jobs[job.job_id] = job
            try:
                self._queue.put_nowait((job.job_id, payload))
            except Full:
                self._jobs.pop(job.job_id, None)
                raise RadiomapQueueFull(self.max_pending_jobs) from None
        return job

    def get_job(self, job_id: str) -> RadiomapJob | None:
        with self._lock:
            self._cleanup_locked(time.time())
            return self._jobs.get(job_id)

    def get_result(self, job_id: str) -> dict | None:
        with self._lock:
            self._cleanup_locked(time.time())
            job = self._jobs.get(job_id)
            return None if job is None else job.result

    def _update_job(self, job_id: str, **updates) -> None:
        with self._lock:
            job = self._jobs[job_id]
            for key, value in updates.items():
                setattr(job, key, value)
            job.updated_at = _utc_now()
            job.updated_at_epoch = time.time()

    def _scene_generation_for_job(self, job_id: str) -> int | None:
        with self._lock:
            return self._jobs[job_id].scene_generation

    def _cleanup_locked(self, now: float) -> None:
        terminal_statuses = {"succeeded", "failed"}
        expired_job_ids = [
            job_id
            for job_id, job in self._jobs.items()
            if job.status in terminal_statuses and now - job.updated_at_epoch >= self.job_ttl_seconds
        ]
        for job_id in expired_job_ids:
            self._jobs.pop(job_id, None)

        overflow = len(self._jobs) - self.max_stored_jobs
        if overflow <= 0:
            return

        removable = sorted(
            (
                job
                for job in self._jobs.values()
                if job.status in terminal_statuses
            ),
            key=lambda job: job.updated_at_epoch,
        )
        for job in removable[:overflow]:
            self._jobs.pop(job.job_id, None)

    def _worker_loop(self) -> None:
        while True:
            job_id, payload = self._queue.get()
            try:
                self._run_job(job_id, payload)
            finally:
                self._queue.task_done()

    def _run_job(self, job_id: str, payload: dict) -> None:
        self._update_job(job_id, status="running", progress=0.02, message="Starting")
        scene_generation = self._scene_generation_for_job(job_id)
        try:
            solver_kwargs = {
                "progress_cb": lambda progress, message: self._update_job(
                    job_id,
                    status="running",
                    progress=progress,
                    message=message,
                )
            }
            if scene_generation is not None:
                solver_kwargs["expected_scene_generation"] = scene_generation
            result = self._solver(
                self._rt_runtime,
                payload,
                **solver_kwargs,
            )
            self._update_job(
                job_id,
                status="succeeded",
                progress=1.0,
                message="Radio map ready",
                result=result,
            )
        except Exception as exc:
            traceback.print_exception(type(exc), exc, exc.__traceback__, file=sys.stderr)
            self._update_job(
                job_id,
                status="failed",
                progress=1.0,
                message="Radio map job failed",
                error=str(exc) or "Radio map job failed",
            )
