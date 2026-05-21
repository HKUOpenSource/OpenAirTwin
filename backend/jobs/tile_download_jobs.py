from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
import threading
import traceback
from uuid import uuid4

from backend.scene.incremental_tiles import TileDownloadCancelled


ACTIVE_TILE_DOWNLOAD_STATUSES = {"queued", "running", "cancelling"}


class TileDownloadBusy(RuntimeError):
    def __init__(self, active_job_id: str, active_tile_id: str) -> None:
        super().__init__(f"Tile download already running for {active_tile_id}")
        self.active_job_id = active_job_id
        self.active_tile_id = active_tile_id


@dataclass
class TileDownloadJob:
    job_id: str
    tile_id: str
    status: str = "queued"
    progress: float = 0.0
    message: str = "Queued"
    result: dict | None = None
    error: str | None = None
    cancel_event: threading.Event = field(default_factory=threading.Event, repr=False)
    created_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))

    def to_status_dict(self) -> dict:
        payload = {
            "job_id": self.job_id,
            "tile_id": self.tile_id,
            "status": self.status,
            "progress": self.progress,
            "message": self.message,
            "created_at": self.created_at.isoformat(),
            "updated_at": self.updated_at.isoformat(),
        }
        if self.result is not None:
            payload["result"] = self.result
        if self.error:
            payload["error"] = self.error
        return payload


class TileDownloadJobManager:
    def __init__(self, runner, *, max_jobs: int = 64) -> None:
        self._runner = runner
        self._max_jobs = max_jobs
        self._jobs: dict[str, TileDownloadJob] = {}
        self._active_by_tile: dict[str, str] = {}
        self._active_job_id: str | None = None
        self._lock = threading.Lock()

    def create_job(self, tile_id: str) -> TileDownloadJob:
        with self._lock:
            active_job_id = self._active_by_tile.get(tile_id)
            if active_job_id:
                active_job = self._jobs.get(active_job_id)
                if active_job and active_job.status in ACTIVE_TILE_DOWNLOAD_STATUSES:
                    return active_job

            if self._active_job_id:
                active_job = self._jobs.get(self._active_job_id)
                if active_job and active_job.status in ACTIVE_TILE_DOWNLOAD_STATUSES:
                    raise TileDownloadBusy(active_job.job_id, active_job.tile_id)
                self._active_job_id = None

            while len(self._jobs) >= self._max_jobs:
                oldest_id = min(self._jobs.values(), key=lambda job: job.created_at).job_id
                self._jobs.pop(oldest_id, None)

            job = TileDownloadJob(job_id=f"tile_{uuid4().hex[:12]}", tile_id=tile_id)
            self._jobs[job.job_id] = job
            self._active_by_tile[tile_id] = job.job_id
            self._active_job_id = job.job_id

        thread = threading.Thread(target=self._run_job, args=(job.job_id,), daemon=True)
        thread.start()
        return job

    def get_job(self, job_id: str) -> TileDownloadJob | None:
        with self._lock:
            return self._jobs.get(job_id)

    def cancel_job(self, job_id: str) -> TileDownloadJob | None:
        with self._lock:
            job = self._jobs.get(job_id)
            if job is None:
                return None
            if job.status in {"queued", "running"}:
                job.cancel_event.set()
                job.status = "cancelling"
                job.message = "Cancelling tile download and cleaning partial files"
                job.updated_at = datetime.now(timezone.utc)
            return job

    def _update(self, job_id: str, **fields) -> TileDownloadJob | None:
        with self._lock:
            job = self._jobs.get(job_id)
            if job is None:
                return None
            for key, value in fields.items():
                setattr(job, key, value)
            job.updated_at = datetime.now(timezone.utc)
            return job

    def _run_job(self, job_id: str) -> None:
        job = self._update(job_id, status="running", progress=0.05, message="Downloading tile archive")
        if job is None:
            return

        def progress_callback(progress: float, message: str) -> None:
            current_job = self.get_job(job_id)
            if current_job is not None and current_job.cancel_event.is_set():
                return
            bounded_progress = min(0.99, max(0.0, float(progress)))
            self._update(job_id, status="running", progress=bounded_progress, message=message)

        try:
            if job.cancel_event.is_set():
                raise TileDownloadCancelled("Tile download cancelled")
            result = self._runner(
                job.tile_id,
                progress_cb=progress_callback,
                cancel_check=job.cancel_event.is_set,
            )
            self._update(
                job_id,
                status="succeeded",
                progress=1.0,
                message="Tile integrated into scene XML",
                result=result,
                error=None,
            )
        except TileDownloadCancelled:
            self._update(
                job_id,
                status="cancelled",
                progress=1.0,
                message="Tile download cancelled; partial files removed",
                result=None,
                error=None,
            )
        except Exception as exc:  # noqa: BLE001
            traceback.print_exception(type(exc), exc, exc.__traceback__)
            self._update(
                job_id,
                status="failed",
                progress=1.0,
                message="Tile download or conversion failed",
                error=str(exc),
            )
        finally:
            with self._lock:
                final_job = self._jobs.get(job_id)
                if final_job is not None and self._active_by_tile.get(final_job.tile_id) == job_id:
                    self._active_by_tile.pop(final_job.tile_id, None)
                if self._active_job_id == job_id:
                    self._active_job_id = None
