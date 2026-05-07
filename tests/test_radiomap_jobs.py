from __future__ import annotations

from contextlib import redirect_stderr
import io
import time
import unittest

from backend.jobs.radiomap_jobs import RadiomapJob, RadiomapJobManager, RadiomapQueueFull


def successful_solver(_runtime, _payload, progress_cb=None):
    if progress_cb is not None:
        progress_cb(0.5, "Halfway")
    return {
        "metric": "path_gain",
        "unit": "dB",
        "surface": {"cell_count": 1, "density_level": 1},
        "range": {"min": -90.0, "max": -90.0},
        "values": {"count": 1, "data": [-90.0]},
        "geometry": {"triangle_positions": []},
    }


def failing_solver(_runtime, _payload, progress_cb=None):
    raise RuntimeError("solver exploded")


class RadiomapJobManagerTests(unittest.TestCase):
    def wait_for_status(self, manager: RadiomapJobManager, job_id: str, status: str) -> RadiomapJob:
        deadline = time.time() + 2.0
        while time.time() < deadline:
            job = manager.get_job(job_id)
            if job is not None and job.status == status:
                return job
            time.sleep(0.01)
        self.fail(f"Timed out waiting for {job_id} to reach {status}")

    def test_job_runs_on_background_worker(self) -> None:
        manager = RadiomapJobManager(object(), solver=successful_solver, max_pending_jobs=2)

        job = manager.create_job({})
        completed = self.wait_for_status(manager, job.job_id, "succeeded")

        self.assertEqual(completed.progress, 1.0)
        self.assertEqual(completed.message, "Radio map ready")
        self.assertEqual(manager.get_result(job.job_id)["values"]["count"], 1)

    def test_queue_full_rejects_new_jobs(self) -> None:
        manager = RadiomapJobManager(
            object(),
            solver=successful_solver,
            max_pending_jobs=1,
            start_worker=False,
        )

        manager.create_job({})
        with self.assertRaises(RadiomapQueueFull) as error:
            manager.create_job({})

        self.assertEqual(error.exception.max_pending_jobs, 1)

    def test_invalid_payload_is_rejected_before_enqueue(self) -> None:
        manager = RadiomapJobManager(
            object(),
            solver=successful_solver,
            max_pending_jobs=1,
            start_worker=False,
        )

        with self.assertRaises(ValueError):
            manager.create_job({"surface": {"density_level": 99}})

    def test_failure_error_is_sanitized(self) -> None:
        manager = RadiomapJobManager(object(), solver=failing_solver, max_pending_jobs=1)

        stderr = io.StringIO()
        with redirect_stderr(stderr):
            job = manager.create_job({})
            failed = self.wait_for_status(manager, job.job_id, "failed")

        self.assertEqual(failed.message, "Radio map job failed")
        self.assertEqual(failed.error, "solver exploded")
        self.assertNotIn("Traceback", failed.error)
        self.assertIn("Traceback", stderr.getvalue())

    def test_ttl_cleanup_removes_expired_terminal_jobs(self) -> None:
        manager = RadiomapJobManager(
            object(),
            solver=successful_solver,
            max_pending_jobs=1,
            job_ttl_seconds=0,
            start_worker=False,
        )
        job = manager.create_job({})
        job.status = "succeeded"
        job.updated_at_epoch = time.time() - 10

        self.assertIsNone(manager.get_job(job.job_id))

    def test_max_stored_cleanup_removes_oldest_terminal_jobs(self) -> None:
        manager = RadiomapJobManager(
            object(),
            solver=successful_solver,
            max_pending_jobs=1,
            max_stored_jobs=2,
            start_worker=False,
        )
        now = time.time()
        with manager._lock:
            for index in range(3):
                job = RadiomapJob(
                    job_id=f"job_{index}",
                    status="succeeded",
                    progress=1.0,
                    message="done",
                )
                job.updated_at_epoch = now + index
                manager._jobs[job.job_id] = job

        self.assertIsNotNone(manager.get_job("job_2"))
        with manager._lock:
            self.assertNotIn("job_0", manager._jobs)
            self.assertLessEqual(len(manager._jobs), 2)


if __name__ == "__main__":
    unittest.main()
