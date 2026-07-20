from __future__ import annotations

import json
from pathlib import Path
import subprocess
import sys
import tempfile
import time
import unittest
from unittest.mock import patch

from backend.jobs.deepmimo_jobs import DeepMIMOJob, DeepMIMOJobManager


class DeepMIMOJobManagerTests(unittest.TestCase):
    def write_persisted_job(
        self,
        root: Path,
        job_id: str,
        *,
        status: str,
        updated_at_epoch: float,
        result: dict | None = None,
    ) -> Path:
        job_dir = root / job_id
        job_dir.mkdir()
        created_at_epoch = updated_at_epoch - 10.0
        (job_dir / "job.json").write_text(
            json.dumps(
                {
                    "job_id": job_id,
                    "created_at": "2026-01-01T00:00:00+00:00",
                    "created_at_epoch": created_at_epoch,
                }
            ),
            encoding="utf-8",
        )
        progress = {
            "status": status,
            "progress": 1.0 if status in {"succeeded", "failed", "cancelled"} else 0.5,
            "message": "DeepMIMO dataset ready" if status == "succeeded" else "Worker running",
            "updated_at": "2026-01-01T00:00:10+00:00",
            "updated_at_epoch": updated_at_epoch,
        }
        if result is not None:
            progress["result"] = result
        (job_dir / "progress.json").write_text(json.dumps(progress), encoding="utf-8")
        return job_dir

    def test_recent_succeeded_job_is_restored_and_downloadable(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            root = Path(tmp_dir)
            job_id = "dm_aaaaaaaaaaaa"
            result = {"archive_name": "dataset.zip", "receiver_count": 4}
            job_dir = self.write_persisted_job(
                root,
                job_id,
                status="succeeded",
                updated_at_epoch=time.time(),
                result=result,
            )
            (job_dir / "job.json").unlink()  # Legacy jobs predate stable creation metadata.
            archive_bytes = b"persisted-dataset"
            (job_dir / "dataset.zip").write_bytes(archive_bytes)

            manager = DeepMIMOJobManager(
                job_root=root,
                max_pending_jobs=1,
                max_stored_jobs=10,
                job_ttl_seconds=3600,
            )
            try:
                restored = manager.get_job(job_id)

                self.assertIsNotNone(restored)
                self.assertEqual(restored.status, "succeeded")
                self.assertEqual(restored.result, result)
                self.assertEqual(manager.get_download_path(job_id), job_dir / "dataset.zip")
                with manager.open_download_file(job_id) as handle:
                    self.assertEqual(handle.read(), archive_bytes)
            finally:
                manager.shutdown()

    def test_restored_jobs_obey_max_stored_limit(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            root = Path(tmp_dir)
            now = time.time()
            oldest_dir = self.write_persisted_job(
                root,
                "dm_111111111111",
                status="failed",
                updated_at_epoch=now - 20.0,
            )
            newest_dir = self.write_persisted_job(
                root,
                "dm_222222222222",
                status="failed",
                updated_at_epoch=now - 10.0,
            )

            manager = DeepMIMOJobManager(
                job_root=root,
                max_pending_jobs=1,
                max_stored_jobs=1,
                job_ttl_seconds=3600,
            )
            try:
                self.assertFalse(oldest_dir.exists())
                self.assertTrue(newest_dir.exists())
                self.assertIsNone(manager.get_job("dm_111111111111"))
                self.assertIsNotNone(manager.get_job("dm_222222222222"))
            finally:
                manager.shutdown()

    def test_expired_persisted_job_is_reaped_during_startup(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            root = Path(tmp_dir)
            job_id = "dm_bbbbbbbbbbbb"
            job_dir = self.write_persisted_job(
                root,
                job_id,
                status="cancelled",
                updated_at_epoch=time.time() - 120.0,
            )
            (job_dir / "large-output.bin").write_bytes(b"x" * 1024)

            manager = DeepMIMOJobManager(
                job_root=root,
                max_pending_jobs=1,
                max_stored_jobs=10,
                job_ttl_seconds=60,
            )
            try:
                self.assertIsNone(manager.get_job(job_id))
                self.assertFalse(job_dir.exists())
            finally:
                manager.shutdown()

    def test_interrupted_persisted_job_is_marked_failed(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            root = Path(tmp_dir)
            job_id = "dm_cccccccccccc"
            job_dir = self.write_persisted_job(
                root,
                job_id,
                status="running",
                updated_at_epoch=time.time(),
            )

            manager = DeepMIMOJobManager(
                job_root=root,
                max_pending_jobs=1,
                max_stored_jobs=10,
                job_ttl_seconds=3600,
            )
            try:
                restored = manager.get_job(job_id)
                persisted = json.loads((job_dir / "progress.json").read_text(encoding="utf-8"))

                self.assertIsNotNone(restored)
                self.assertEqual(restored.status, "failed")
                self.assertEqual(restored.error, "DeepMIMO job interrupted by server restart")
                self.assertEqual(persisted["status"], "failed")
            finally:
                manager.shutdown()

    def test_unrecognized_and_malformed_directories_are_left_untouched(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            root = Path(tmp_dir)
            unrecognized = root / "manual-backup"
            malformed = root / "dm_dddddddddddd"
            unrecognized.mkdir()
            malformed.mkdir()
            (malformed / "progress.json").write_text("not json", encoding="utf-8")

            manager = DeepMIMOJobManager(
                job_root=root,
                max_pending_jobs=1,
                max_stored_jobs=10,
                job_ttl_seconds=0,
            )
            try:
                self.assertEqual(manager._jobs, {})
                self.assertTrue(unrecognized.is_dir())
                self.assertTrue(malformed.is_dir())
            finally:
                manager.shutdown()

    def test_shutdown_terminates_worker_and_is_idempotent(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            root = Path(tmp_dir)
            manager = DeepMIMOJobManager(
                job_root=root,
                max_pending_jobs=1,
                max_stored_jobs=10,
                job_ttl_seconds=3600,
            )
            job_id = "dm_eeeeeeeeeeee"
            job_dir = root / job_id
            job_dir.mkdir()
            process = subprocess.Popen(
                [sys.executable, "-c", "import time; time.sleep(60)"],
                start_new_session=True,
            )
            job = DeepMIMOJob(
                job_id=job_id,
                status="running",
                progress=0.1,
                message="Worker running",
                job_dir=job_dir,
                process=process,
            )
            manager._jobs[job_id] = job
            try:
                manager.shutdown()
                manager.shutdown()

                persisted = json.loads((job_dir / "progress.json").read_text(encoding="utf-8"))
                self.assertIsNotNone(process.poll())
                self.assertFalse(manager._reaper.is_alive())
                self.assertEqual(job.status, "cancelled")
                self.assertEqual(persisted["status"], "cancelled")
            finally:
                if process.poll() is None:
                    process.kill()
                    process.wait(timeout=5)

    def test_shutdown_stops_worker_when_progress_persistence_fails(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            root = Path(tmp_dir)
            manager = DeepMIMOJobManager(
                job_root=root,
                max_pending_jobs=1,
                max_stored_jobs=10,
                job_ttl_seconds=3600,
            )
            job_id = "dm_ffffffffffff"
            job_dir = root / job_id
            job_dir.mkdir()
            process = subprocess.Popen(
                [sys.executable, "-c", "import time; time.sleep(60)"],
                start_new_session=True,
            )
            job = DeepMIMOJob(
                job_id=job_id,
                status="running",
                progress=0.1,
                message="Worker running",
                job_dir=job_dir,
                process=process,
            )
            manager._jobs[job_id] = job
            try:
                with patch("backend.jobs.deepmimo_jobs._write_json", side_effect=OSError("disk full")):
                    manager.shutdown()

                self.assertIsNotNone(process.poll())
                self.assertEqual(job.status, "cancelled")
                self.assertIsNone(job.process)
            finally:
                if process.poll() is None:
                    process.kill()
                    process.wait(timeout=5)

    def test_cancelled_job_is_not_overwritten_by_stale_worker_progress(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            manager = DeepMIMOJobManager(
                job_root=Path(tmp_dir),
                max_pending_jobs=1,
                max_stored_jobs=10,
                job_ttl_seconds=3600,
            )
            try:
                job_dir = Path(tmp_dir) / "dm_test"
                job_dir.mkdir()
                progress_path = job_dir / "progress.json"
                progress_path.write_text(
                    json.dumps({"status": "running", "progress": 0.5, "message": "old progress"}),
                    encoding="utf-8",
                )
                job = DeepMIMOJob(
                    job_id="dm_test",
                    status="running",
                    progress=0.5,
                    message="Worker running",
                    job_dir=job_dir,
                )
                manager._jobs[job.job_id] = job

                cancelled = manager.cancel_job(job.job_id)
                self.assertIsNotNone(cancelled)
                self.assertEqual(cancelled.status, "cancelled")

                progress_path.write_text(
                    json.dumps({"status": "running", "progress": 0.75, "message": "late worker update"}),
                    encoding="utf-8",
                )
                refreshed = manager.get_job(job.job_id)

                self.assertIsNotNone(refreshed)
                self.assertEqual(refreshed.status, "cancelled")
                self.assertEqual(refreshed.progress, 1.0)
                self.assertEqual(refreshed.message, "Cancelled by user")
            finally:
                manager.shutdown()

    def test_cancel_refreshes_completed_worker_before_marking_cancelled(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            manager = DeepMIMOJobManager(
                job_root=Path(tmp_dir),
                max_pending_jobs=1,
                max_stored_jobs=10,
                job_ttl_seconds=3600,
            )
            try:
                job_dir = Path(tmp_dir) / "dm_done"
                job_dir.mkdir()
                (job_dir / "progress.json").write_text(
                    json.dumps(
                        {
                            "status": "succeeded",
                            "progress": 1.0,
                            "message": "DeepMIMO dataset ready",
                            "result": {"archive_name": "dataset.zip"},
                        }
                    ),
                    encoding="utf-8",
                )
                job = DeepMIMOJob(
                    job_id="dm_done",
                    status="running",
                    progress=0.9,
                    message="Almost done",
                    job_dir=job_dir,
                )
                manager._jobs[job.job_id] = job

                completed = manager.cancel_job(job.job_id)

                self.assertIsNotNone(completed)
                self.assertEqual(completed.status, "succeeded")
                self.assertEqual(completed.result, {"archive_name": "dataset.zip"})
                self.assertEqual(manager.get_job(job.job_id).status, "succeeded")
            finally:
                manager.shutdown()

    def test_worker_start_failure_does_not_leave_queued_job(self) -> None:
        payload = {
            "roi": {"min": [0.0, 0.0], "max": [1.0, 1.0]},
            "scene": {"tile_ids": ["TILE_A"]},
        }
        with tempfile.TemporaryDirectory() as tmp_dir:
            manager = DeepMIMOJobManager(
                job_root=Path(tmp_dir),
                python_executable="/no/such/python",
                max_pending_jobs=1,
                max_stored_jobs=10,
                job_ttl_seconds=3600,
            )
            try:
                with self.assertRaises(FileNotFoundError):
                    manager.create_job(payload)

                self.assertEqual(manager._jobs, {})
                self.assertEqual(list(Path(tmp_dir).iterdir()), [])
            finally:
                manager.shutdown()

    def test_job_persistence_failure_does_not_leave_partial_directory(self) -> None:
        payload = {
            "roi": {"min": [0.0, 0.0], "max": [1.0, 1.0]},
            "scene": {"tile_ids": ["TILE_A"]},
        }
        with tempfile.TemporaryDirectory() as tmp_dir:
            root = Path(tmp_dir)
            manager = DeepMIMOJobManager(
                job_root=root,
                max_pending_jobs=1,
                max_stored_jobs=10,
                job_ttl_seconds=3600,
            )
            try:
                with patch(
                    "backend.jobs.deepmimo_jobs._write_json",
                    side_effect=[None, OSError("disk full")],
                ):
                    with self.assertRaisesRegex(OSError, "disk full"):
                        manager.create_job(payload)

                self.assertEqual(manager._jobs, {})
                self.assertEqual(list(root.iterdir()), [])
            finally:
                manager.shutdown()

    def test_terminal_job_refresh_reaps_finished_process(self) -> None:
        class FinishedProcess:
            def __init__(self) -> None:
                self.poll_calls = 0

            def poll(self) -> int:
                self.poll_calls += 1
                return 0

        with tempfile.TemporaryDirectory() as tmp_dir:
            manager = DeepMIMOJobManager(
                job_root=Path(tmp_dir),
                max_pending_jobs=1,
                max_stored_jobs=10,
                job_ttl_seconds=3600,
            )
            try:
                job_dir = Path(tmp_dir) / "dm_cancelled"
                job_dir.mkdir()
                process = FinishedProcess()
                job = DeepMIMOJob(
                    job_id="dm_cancelled",
                    status="cancelled",
                    progress=1.0,
                    message="Cancelled by user",
                    job_dir=job_dir,
                    process=process,  # type: ignore[arg-type]
                )
                manager._jobs[job.job_id] = job

                refreshed = manager.get_job(job.job_id)

                self.assertIs(refreshed, job)
                self.assertGreaterEqual(process.poll_calls, 1)
            finally:
                manager.shutdown()


if __name__ == "__main__":
    unittest.main()
