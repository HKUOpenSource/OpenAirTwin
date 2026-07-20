from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
import json
import math
import os
from pathlib import Path
import re
import signal
import shutil
import subprocess
import threading
from threading import Lock
import time
from uuid import uuid4

from backend import config
from backend.features.core import FeatureQueueFull
from backend.rt.deepmimo_payload import parse_deepmimo_payload


_TERMINAL_STATUSES = frozenset({"succeeded", "failed", "cancelled"})
_ACTIVE_STATUSES = frozenset({"queued", "running", "cancelling"})
_REAPER_INTERVAL_SECONDS = 5.0
_PROCESS_TERMINATE_TIMEOUT_SECONDS = 5.0
_PROCESS_KILL_TIMEOUT_SECONDS = 5.0
_JOB_DIRECTORY_PATTERN = re.compile(r"^dm_[0-9a-f]{12}$")
_JOB_METADATA_FILENAME = "job.json"


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _read_json(path: Path) -> dict | None:
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (FileNotFoundError, json.JSONDecodeError, OSError):
        return None
    return payload if isinstance(payload, dict) else None


def _write_json(path: Path, payload: dict) -> None:
    temp_path = path.with_name(f"{path.name}.{uuid4().hex}.tmp")
    temp_path.write_text(json.dumps(payload, allow_nan=False, indent=2), encoding="utf-8")
    temp_path.replace(path)


def _timestamp(value: object, fallback: float) -> float:
    try:
        parsed = float(value)
    except (TypeError, ValueError):
        return fallback
    return parsed if math.isfinite(parsed) and parsed >= 0.0 else fallback


def _utc_from_epoch(epoch: float) -> str:
    return datetime.fromtimestamp(epoch, timezone.utc).isoformat()


def _request_process_stop(process: subprocess.Popen, *, force: bool = False) -> None:
    try:
        if process.poll() is not None:
            return
    except (AttributeError, OSError):
        return

    group_signal = getattr(signal, "SIGKILL", signal.SIGTERM) if force else signal.SIGTERM
    try:
        os.killpg(os.getpgid(process.pid), group_signal)
        return
    except (AttributeError, ProcessLookupError, PermissionError, OSError):
        pass

    operation = process.kill if force else process.terminate
    try:
        operation()
    except (AttributeError, ProcessLookupError, PermissionError, OSError):
        pass


def _wait_for_process(process: subprocess.Popen, timeout: float) -> int | None:
    try:
        return process.wait(timeout=timeout)
    except subprocess.TimeoutExpired:
        return None
    except (AttributeError, ProcessLookupError, OSError):
        try:
            return process.poll()
        except (AttributeError, OSError):
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


class DeepMIMOQueueFull(FeatureQueueFull):
    def __init__(self, max_pending_jobs: int) -> None:
        super().__init__("DeepMIMO export job queue is full; try again later", max_pending_jobs)


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
        self._download_leases: dict[str, int] = {}
        self._lock = Lock()
        self.job_root.mkdir(parents=True, exist_ok=True)
        self._stop_event = threading.Event()
        with self._lock:
            self._restore_jobs_locked()
            self._refresh_locked()
        self._reaper = threading.Thread(target=self._reaper_loop, daemon=True, name="DeepMIMOReaper")
        self._reaper.start()

    def create_job(self, payload: dict) -> DeepMIMOJob:
        parsed = parse_deepmimo_payload(payload)
        with self._lock:
            self._refresh_locked()
            active_count = sum(1 for job in self._jobs.values() if job.status in _ACTIVE_STATUSES)
            if active_count >= self.max_pending_jobs:
                raise DeepMIMOQueueFull(self.max_pending_jobs)

            job_id = f"dm_{uuid4().hex[:12]}"
            job_dir = self.job_root / job_id
            job_dir.mkdir(parents=True, exist_ok=False)
            try:
                created_at_epoch = time.time()
                created_at = _utc_from_epoch(created_at_epoch)
                _write_json(
                    job_dir / _JOB_METADATA_FILENAME,
                    {
                        "job_id": job_id,
                        "created_at": created_at,
                        "created_at_epoch": created_at_epoch,
                    },
                )
                _write_json(job_dir / "payload.json", parsed)
                job = DeepMIMOJob(
                    job_id=job_id,
                    status="queued",
                    progress=0.0,
                    message="Queued",
                    job_dir=job_dir,
                    created_at=created_at,
                    updated_at=created_at,
                    created_at_epoch=created_at_epoch,
                    updated_at_epoch=created_at_epoch,
                )
                self._jobs[job_id] = job
                self._start_job_locked(job)
            except Exception:
                self._jobs.pop(job_id, None)
                shutil.rmtree(job_dir, ignore_errors=True)
                raise
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

    def open_download_file(self, job_id: str):
        with self._lock:
            self._refresh_locked()
            job = self._jobs.get(job_id)
            if job is None or job.status != "succeeded":
                return None
            archive = job.job_dir / "dataset.zip"
            try:
                handle = open(archive, "rb")
            except FileNotFoundError:
                return None
            self._download_leases[job_id] = self._download_leases.get(job_id, 0) + 1
            return _DeepMIMODownloadLease(self, job_id, handle)

    def cancel_job(self, job_id: str) -> DeepMIMOJob | None:
        with self._lock:
            self._refresh_locked()
            job = self._jobs.get(job_id)
            if job is None:
                return None
            if job.status in _TERMINAL_STATUSES:
                return job
            process = job.process
            if process is not None:
                return_code = process.poll()
                if return_code is not None:
                    self._finalize_exited_process_locked(job, return_code, cancelled=False)
                    return job
                else:
                    _request_process_stop(process)
                    job.status = "cancelling"
                    job.message = "Cancelling DeepMIMO export"
                    job.updated_at = _utc_now()
                    job.updated_at_epoch = time.time()
                    self._write_job_progress_locked(job)
                    return job
            if process is None:
                try:
                    self._apply_job_progress_locked(job)
                except Exception:
                    pass
                if job.status in _TERMINAL_STATUSES:
                    return job
            job.status = "cancelled"
            job.progress = 1.0
            job.message = "Cancelled by user"
            job.updated_at = _utc_now()
            job.updated_at_epoch = time.time()
            self._write_job_progress_locked(job)
            return job

    def shutdown(self) -> None:
        self._stop_event.set()
        reaper = getattr(self, "_reaper", None)
        if (
            reaper is not None
            and reaper.is_alive()
            and reaper is not threading.current_thread()
        ):
            reaper.join(timeout=_REAPER_INTERVAL_SECONDS)

        active_processes: list[tuple[DeepMIMOJob, subprocess.Popen]] = []
        with self._lock:
            for job in list(self._jobs.values()):
                process = job.process
                if process is None:
                    continue
                return_code = process.poll()
                if return_code is not None:
                    try:
                        self._finalize_exited_process_locked(
                            job,
                            return_code,
                            cancelled=job.status in {"queued", "running", "cancelling"},
                        )
                    except (OSError, TypeError, ValueError):
                        # Cleanup must continue even when terminal progress cannot be persisted.
                        job.process = None
                        if job.status not in _TERMINAL_STATUSES:
                            job.status = "cancelled"
                            job.progress = 1.0
                            job.message = "Cancelled during server shutdown"
                    continue
                job.status = "cancelling"
                job.message = "Stopping DeepMIMO export during server shutdown"
                job.updated_at = _utc_now()
                job.updated_at_epoch = time.time()
                active_processes.append((job, process))
                try:
                    self._write_job_progress_locked(job)
                except (OSError, TypeError, ValueError):
                    # A full or read-only job volume must not prevent process termination.
                    pass

        for _job, process in active_processes:
            _request_process_stop(process)

        process_results: list[tuple[DeepMIMOJob, subprocess.Popen, int | None]] = []
        for job, process in active_processes:
            return_code = _wait_for_process(process, _PROCESS_TERMINATE_TIMEOUT_SECONDS)
            if return_code is None:
                _request_process_stop(process, force=True)
                return_code = _wait_for_process(process, _PROCESS_KILL_TIMEOUT_SECONDS)
            process_results.append((job, process, return_code))

        with self._lock:
            for job, process, return_code in process_results:
                if job.process is not process:
                    continue
                if return_code is None:
                    job.status = "failed"
                    job.progress = 1.0
                    job.message = "DeepMIMO worker did not stop during server shutdown"
                    job.error = job.message
                    job.updated_at = _utc_now()
                    job.updated_at_epoch = time.time()
                    try:
                        self._write_job_progress_locked(job)
                    except (OSError, TypeError, ValueError):
                        pass
                    continue
                try:
                    self._finalize_exited_process_locked(job, return_code, cancelled=True)
                except (OSError, TypeError, ValueError):
                    # The worker is already reaped; preserve the in-memory terminal state.
                    job.process = None
                    if job.status not in _TERMINAL_STATUSES:
                        job.status = "cancelled"
                        job.progress = 1.0
                        job.message = "Cancelled during server shutdown"

    def _reaper_loop(self) -> None:
        while not self._stop_event.wait(_REAPER_INTERVAL_SECONDS):
            try:
                with self._lock:
                    self._refresh_locked()
            except Exception:  # noqa: BLE001
                # Never let an unexpected refresh failure kill the reaper.
                pass

    def _start_job_locked(self, job: DeepMIMOJob) -> None:
        progress_path = job.job_dir / "progress.json"
        log_path = job.job_dir / "worker.log"
        _write_json(progress_path, {"status": "queued", "progress": 0.0, "message": "Queued"})
        log_handle = open(log_path, "ab")
        try:
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
                    "OAT_SCENE_ROOT": str(config.SCENE_ROOT),
                },
                stdout=log_handle,
                stderr=subprocess.STDOUT,
                start_new_session=True,
            )
        finally:
            log_handle.close()
        job.process = process
        job.status = "running"
        job.progress = 0.01
        job.message = "Worker started"
        job.updated_at = _utc_now()
        job.updated_at_epoch = time.time()

    def _restore_jobs_locked(self) -> None:
        for job_dir in sorted(self.job_root.iterdir()):
            if (
                not _JOB_DIRECTORY_PATTERN.fullmatch(job_dir.name)
                or job_dir.is_symlink()
                or not job_dir.is_dir()
            ):
                continue
            progress_path = job_dir / "progress.json"
            progress = _read_json(progress_path)
            if progress is None:
                continue
            status = str(progress.get("status", "")).strip()
            if status not in _ACTIVE_STATUSES and status not in _TERMINAL_STATUSES:
                continue

            try:
                fallback_epoch = progress_path.stat().st_mtime
            except OSError:
                continue
            metadata = _read_json(job_dir / _JOB_METADATA_FILENAME) or {}
            created_at_epoch = _timestamp(metadata.get("created_at_epoch"), fallback_epoch)
            updated_at_epoch = _timestamp(progress.get("updated_at_epoch"), fallback_epoch)
            created_at = str(metadata.get("created_at") or _utc_from_epoch(created_at_epoch))
            updated_at = str(progress.get("updated_at") or _utc_from_epoch(updated_at_epoch))
            progress_value = progress.get("progress", 0.0)
            try:
                job_progress = float(progress_value)
            except (TypeError, ValueError):
                job_progress = 0.0
            if not math.isfinite(job_progress):
                job_progress = 0.0
            job_progress = max(0.0, min(1.0, job_progress))

            result = progress.get("result")
            if result is None and status == "succeeded":
                result = _read_json(job_dir / "result.json")
            job = DeepMIMOJob(
                job_id=job_dir.name,
                status=status,
                progress=job_progress,
                message=str(progress.get("message", status.title())),
                job_dir=job_dir,
                created_at=created_at,
                updated_at=updated_at,
                created_at_epoch=created_at_epoch,
                updated_at_epoch=updated_at_epoch,
                result=result if isinstance(result, dict) else None,
                error=str(progress["error"]) if progress.get("error") is not None else None,
            )
            if status in _ACTIVE_STATUSES:
                job.status = "failed"
                job.progress = 1.0
                job.message = "DeepMIMO job interrupted by server restart"
                job.error = job.message
                job.updated_at = _utc_now()
                job.updated_at_epoch = time.time()
                self._write_job_progress_locked(job)
            self._jobs[job.job_id] = job

    def _write_job_progress_locked(self, job: DeepMIMOJob) -> None:
        payload = {
            "status": job.status,
            "progress": job.progress,
            "message": job.message,
            "updated_at": job.updated_at,
            "updated_at_epoch": job.updated_at_epoch,
        }
        if job.result is not None:
            payload["result"] = job.result
        if job.error is not None:
            payload["error"] = job.error
        _write_json(job.job_dir / "progress.json", payload)

    def _apply_job_progress_locked(self, job: DeepMIMOJob) -> bool:
        progress = _read_json(job.job_dir / "progress.json")
        if not progress:
            return False
        progress_status = str(progress.get("status", job.status))
        if job.status == "cancelling" and progress_status != "succeeded":
            progress_status = "cancelling"
        job.status = progress_status
        job.progress = float(progress.get("progress", job.progress))
        job.message = str(progress.get("message", job.message))
        job.result = progress.get("result", job.result)
        job.error = progress.get("error", job.error)
        job.updated_at = str(progress.get("updated_at", job.updated_at))
        job.updated_at_epoch = float(progress.get("updated_at_epoch", job.updated_at_epoch))
        return True

    def _finalize_exited_process_locked(self, job: DeepMIMOJob, return_code: int | None, *, cancelled: bool) -> None:
        self._apply_job_progress_locked(job)
        if job.status == "succeeded":
            job.process = None
            return
        if return_code == 0 and (job.job_dir / "dataset.zip").exists():
            job.status = "succeeded"
            job.progress = 1.0
            job.message = "DeepMIMO dataset ready"
            result = _read_json(job.job_dir / "result.json")
            if result is not None:
                job.result = result
        elif cancelled or job.status == "cancelling":
            job.status = "cancelled"
            job.progress = 1.0
            job.message = "Cancelled by user"
        elif return_code not in (None, 0):
            job.status = "failed"
            job.progress = 1.0
            job.message = "DeepMIMO worker failed"
            job.error = job.error or f"Worker exited with code {return_code}"
        elif job.status not in _TERMINAL_STATUSES:
            job.status = "failed"
            job.progress = 1.0
            job.message = "DeepMIMO worker exited before reporting success"
            job.error = job.error or "Worker exited before reporting success"
        job.process = None
        job.updated_at = _utc_now()
        job.updated_at_epoch = time.time()
        self._write_job_progress_locked(job)

    def _refresh_locked(self) -> None:
        now = time.time()
        for job in list(self._jobs.values()):
            if job.process is not None and job.status in _TERMINAL_STATUSES:
                if job.process.poll() is not None:
                    job.process = None
            if job.status not in _TERMINAL_STATUSES:
                self._apply_job_progress_locked(job)
            if job.process is not None and job.status in _ACTIVE_STATUSES:
                return_code = job.process.poll()
                if return_code is not None:
                    self._finalize_exited_process_locked(job, return_code, cancelled=job.status == "cancelling")

        terminal_statuses = {"succeeded", "failed", "cancelled"}
        expired_job_ids = [
            job_id
            for job_id, job in self._jobs.items()
            if (
                job.status in terminal_statuses
                and self._download_leases.get(job_id, 0) <= 0
                and (job.process is None or job.process.poll() is not None)
                and now - job.updated_at_epoch >= self.job_ttl_seconds
            )
        ]
        for job_id in expired_job_ids:
            job = self._jobs.pop(job_id, None)
            if job is not None:
                self._download_leases.pop(job_id, None)
                shutil.rmtree(job.job_dir, ignore_errors=True)

        overflow = len(self._jobs) - self.max_stored_jobs
        if overflow <= 0:
            return
        removable = sorted(
            (
                job
                for job in self._jobs.values()
                if (
                    job.status in terminal_statuses
                    and self._download_leases.get(job.job_id, 0) <= 0
                    and (job.process is None or job.process.poll() is not None)
                )
            ),
            key=lambda job: job.updated_at_epoch,
        )
        for job in removable[:overflow]:
            self._jobs.pop(job.job_id, None)
            self._download_leases.pop(job.job_id, None)
            shutil.rmtree(job.job_dir, ignore_errors=True)

    def _release_download_lease(self, job_id: str) -> None:
        with self._lock:
            count = self._download_leases.get(job_id, 0) - 1
            if count > 0:
                self._download_leases[job_id] = count
            else:
                self._download_leases.pop(job_id, None)


class _DeepMIMODownloadLease:
    def __init__(self, manager: DeepMIMOJobManager, job_id: str, handle) -> None:
        self._manager = manager
        self._job_id = job_id
        self._handle = handle

    def __enter__(self):
        return self._handle

    def __exit__(self, exc_type, exc, traceback) -> None:
        try:
            self._handle.close()
        finally:
            self._manager._release_download_lease(self._job_id)
