from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
import json
from pathlib import Path
import subprocess
from threading import Lock
import time
from uuid import uuid4

from backend import config
from backend.rt.deepmimo_payload import parse_deepmimo_payload


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _read_json(path: Path) -> dict | None:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (FileNotFoundError, json.JSONDecodeError, OSError):
        return None


@dataclass
class DeepMIMOJob:
    job_id: str
    status: str
    progress: float
    message: str
    job_dir: Path
    created_at: str = field(default_factory=_utc_now)
    updated_at: str = field(default_factory=_utc_now)
    created_at_epoch: float = field(default_factory=time.time, repr=False)
    updated_at_epoch: float = field(default_factory=time.time, repr=False)
    process: subprocess.Popen | None = field(default=None, repr=False)
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
            **({"result": self.result} if self.result is not None and self.status == "succeeded" else {}),
        }


class DeepMIMOQueueFull(RuntimeError):
    def __init__(self, max_pending_jobs: int) -> None:
        super().__init__("DeepMIMO export job queue is full; try again later")
        self.max_pending_jobs = max_pending_jobs


class DeepMIMOJobManager:
    def __init__(
        self,
        *,
        job_root: Path = config.DEEPMIMO_JOB_ROOT,
        python_executable: str = config.DEEPMIMO_ENV_PYTHON,
        max_pending_jobs: int = config.DEEPMIMO_MAX_PENDING_JOBS,
        max_stored_jobs: int = config.DEEPMIMO_MAX_STORED_JOBS,
        job_ttl_seconds: float = config.DEEPMIMO_JOB_TTL_SECONDS,
    ) -> None:
        self.job_root = Path(job_root)
        self.python_executable = str(python_executable)
        self.max_pending_jobs = int(max_pending_jobs)
        self.max_stored_jobs = int(max_stored_jobs)
        self.job_ttl_seconds = float(job_ttl_seconds)
        self._jobs: dict[str, DeepMIMOJob] = {}
        self._lock = Lock()
        self.job_root.mkdir(parents=True, exist_ok=True)

    def create_job(self, payload: dict) -> DeepMIMOJob:
        parsed = parse_deepmimo_payload(payload)
        with self._lock:
            self._refresh_locked()
            active_count = sum(1 for job in self._jobs.values() if job.status in {"queued", "running"})
            if active_count >= self.max_pending_jobs:
                raise DeepMIMOQueueFull(self.max_pending_jobs)

            job_id = f"dm_{uuid4().hex[:12]}"
            job_dir = self.job_root / job_id
            job_dir.mkdir(parents=True, exist_ok=False)
            (job_dir / "payload.json").write_text(json.dumps(parsed, allow_nan=False, indent=2), encoding="utf-8")
            job = DeepMIMOJob(
                job_id=job_id,
                status="queued",
                progress=0.0,
                message="Queued",
                job_dir=job_dir,
            )
            self._jobs[job_id] = job
            self._start_job_locked(job)
            return job

    def get_job(self, job_id: str) -> DeepMIMOJob | None:
        with self._lock:
            self._refresh_locked()
            return self._jobs.get(job_id)

    def get_download_path(self, job_id: str) -> Path | None:
        job = self.get_job(job_id)
        if job is None or job.status != "succeeded":
            return None
        archive = job.job_dir / "dataset.zip"
        return archive if archive.exists() else None

    def _start_job_locked(self, job: DeepMIMOJob) -> None:
        progress_path = job.job_dir / "progress.json"
        log_path = job.job_dir / "worker.log"
        progress_path.write_text(
            json.dumps({"status": "queued", "progress": 0.0, "message": "Queued"}, allow_nan=False),
            encoding="utf-8",
        )
        log_handle = open(log_path, "ab")
        process = subprocess.Popen(
            [
                self.python_executable,
                "-m",
                "backend.rt.deepmimo_export_worker",
                "--job-dir",
                str(job.job_dir),
            ],
            cwd=str(config.PROJECT_ROOT),
            env={
                **dict(__import__("os").environ),
                "HKU_RT_SCENE_ROOT": str(config.SCENE_ROOT),
            },
            stdout=log_handle,
            stderr=subprocess.STDOUT,
            start_new_session=True,
        )
        log_handle.close()
        job.process = process
        job.status = "running"
        job.progress = 0.01
        job.message = "Worker started"
        job.updated_at = _utc_now()
        job.updated_at_epoch = time.time()

    def _refresh_locked(self) -> None:
        now = time.time()
        for job in list(self._jobs.values()):
            progress = _read_json(job.job_dir / "progress.json")
            if progress:
                job.status = str(progress.get("status", job.status))
                job.progress = float(progress.get("progress", job.progress))
                job.message = str(progress.get("message", job.message))
                job.result = progress.get("result", job.result)
                job.error = progress.get("error", job.error)
                job.updated_at = str(progress.get("updated_at", job.updated_at))
                job.updated_at_epoch = float(progress.get("updated_at_epoch", job.updated_at_epoch))
            if job.process is not None and job.status in {"queued", "running"}:
                return_code = job.process.poll()
                if return_code is not None and return_code != 0:
                    job.status = "failed"
                    job.progress = 1.0
                    job.message = "DeepMIMO worker failed"
                    job.error = job.error or f"Worker exited with code {return_code}"
                    job.updated_at = _utc_now()
                    job.updated_at_epoch = now

        terminal_statuses = {"succeeded", "failed", "cancelled"}
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
            (job for job in self._jobs.values() if job.status in terminal_statuses),
            key=lambda job: job.updated_at_epoch,
        )
        for job in removable[:overflow]:
            self._jobs.pop(job.job_id, None)
