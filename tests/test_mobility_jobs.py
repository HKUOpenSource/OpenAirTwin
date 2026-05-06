from __future__ import annotations

from contextlib import redirect_stderr
import io
import time
import unittest

from backend.jobs.mobility_jobs import MobilityJob, MobilityJobManager, MobilityQueueFull


def successful_solver(_runtime, _payload, progress_cb=None):
    if progress_cb is not None:
        progress_cb(0.5, "Halfway")
    return {
        "ok": True,
        "summary": {"step_count": 1},
        "series": {"time_s": [0.0], "received_power_db": [-90.0]},
        "samples": [{"step_index": 0, "paths": []}],
    }


def failing_solver(_runtime, _payload, progress_cb=None):
    raise RuntimeError("mobility exploded")


def validate_payload(payload):
    if payload.get("invalid"):
        raise ValueError("invalid payload")


class MobilityJobManagerTests(unittest.TestCase):
    def wait_for_status(self, manager: MobilityJobManager, job_id: str, status: str) -> MobilityJob:
        deadline = time.time() + 2.0
        while time.time() < deadline:
            job = manager.get_job(job_id)
            if job is not None and job.status == status:
                return job
            time.sleep(0.01)
        self.fail(f"Timed out waiting for {job_id} to reach {status}")

    def test_job_runs_on_background_worker(self) -> None:
        manager = MobilityJobManager(
            object(),
            solver=successful_solver,
            validate_payload=validate_payload,
            max_pending_jobs=2,
        )

        job = manager.create_job({})
        completed = self.wait_for_status(manager, job.job_id, "succeeded")

        self.assertEqual(completed.progress, 1.0)
        self.assertEqual(completed.message, "Mobility result ready")
        self.assertEqual(manager.get_result(job.job_id)["summary"]["step_count"], 1)

    def test_queue_full_rejects_new_jobs(self) -> None:
        manager = MobilityJobManager(
            object(),
            solver=successful_solver,
            validate_payload=validate_payload,
            max_pending_jobs=1,
            start_worker=False,
        )

        manager.create_job({})
        with self.assertRaises(MobilityQueueFull) as error:
            manager.create_job({})

        self.assertEqual(error.exception.max_pending_jobs, 1)

    def test_invalid_payload_is_rejected_before_enqueue(self) -> None:
        manager = MobilityJobManager(
            object(),
            solver=successful_solver,
            validate_payload=validate_payload,
            max_pending_jobs=1,
            start_worker=False,
        )

        with self.assertRaises(ValueError):
            manager.create_job({"invalid": True})

    def test_failure_error_is_sanitized(self) -> None:
        manager = MobilityJobManager(
            object(),
            solver=failing_solver,
            validate_payload=validate_payload,
            max_pending_jobs=1,
        )

        stderr = io.StringIO()
        with redirect_stderr(stderr):
            job = manager.create_job({})
            failed = self.wait_for_status(manager, job.job_id, "failed")

        self.assertEqual(failed.message, "Mobility job failed")
        self.assertEqual(failed.error, "mobility exploded")
        self.assertNotIn("Traceback", failed.error)
        self.assertIn("Traceback", stderr.getvalue())

    def test_max_stored_cleanup_removes_oldest_terminal_jobs(self) -> None:
        manager = MobilityJobManager(
            object(),
            solver=successful_solver,
            validate_payload=validate_payload,
            max_pending_jobs=1,
            max_stored_jobs=2,
            start_worker=False,
        )
        now = time.time()
        with manager._lock:
            for index in range(3):
                job = MobilityJob(
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
