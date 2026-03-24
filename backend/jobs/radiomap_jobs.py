from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from threading import Lock, Thread
import traceback
from uuid import uuid4

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
    result: dict | None = None
    error: str | None = None

    def to_status_dict(self) -> dict:
        return {
            "job_id": self.job_id,
            "status": self.status,
            "progress": self.progress,
            "message": self.message,
            "created_at": self.created_at,
            "updated_at": self.updated_at,
        }


class RadiomapJobManager:
    def __init__(self, scene_xml) -> None:
        self._scene_xml = scene_xml
        self._jobs: dict[str, RadiomapJob] = {}
        self._lock = Lock()

    def create_job(self, payload: dict) -> RadiomapJob:
        job = RadiomapJob(
            job_id=f"rm_{uuid4().hex[:12]}",
            status="queued",
            progress=0.0,
            message="Queued",
        )
        with self._lock:
            self._jobs[job.job_id] = job

        worker = Thread(target=self._run_job, args=(job.job_id, payload), daemon=True)
        worker.start()
        return job

    def get_job(self, job_id: str) -> RadiomapJob | None:
        with self._lock:
            return self._jobs.get(job_id)

    def get_result(self, job_id: str) -> dict | None:
        with self._lock:
            job = self._jobs.get(job_id)
            return None if job is None else job.result

    def _update_job(self, job_id: str, **updates) -> None:
        with self._lock:
            job = self._jobs[job_id]
            for key, value in updates.items():
                setattr(job, key, value)
            job.updated_at = _utc_now()

    def _run_job(self, job_id: str, payload: dict) -> None:
        self._update_job(job_id, status="running", progress=0.02, message="Starting")
        try:
            result = solve_terrain_radiomap(
                self._scene_xml,
                payload,
                progress_cb=lambda progress, message: self._update_job(
                    job_id,
                    status="running",
                    progress=progress,
                    message=message,
                ),
            )
            self._update_job(
                job_id,
                status="succeeded",
                progress=1.0,
                message="Radio map ready",
                result=result,
            )
        except Exception as exc:
            self._update_job(
                job_id,
                status="failed",
                progress=1.0,
                message=str(exc),
                error="".join(traceback.format_exception(exc)),
            )
