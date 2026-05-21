from __future__ import annotations

import json
from pathlib import Path
import tempfile
import unittest

from backend.jobs.deepmimo_jobs import DeepMIMOJob, DeepMIMOJobManager


class DeepMIMOJobManagerTests(unittest.TestCase):
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
