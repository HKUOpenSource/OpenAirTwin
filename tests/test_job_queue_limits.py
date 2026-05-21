from __future__ import annotations

import threading
import time
import unittest

from backend.jobs.mobility_jobs import MobilityJobManager, MobilityQueueFull
from backend.jobs.radiomap_jobs import RadiomapJobManager, RadiomapQueueFull


class JobQueueLimitTests(unittest.TestCase):
    def _assert_running_job_counts_against_limit(self, manager_cls, queue_full_cls) -> None:
        release = threading.Event()

        def blocking_solver(*_args, **_kwargs):
            release.wait(2.0)
            return {"ok": True}

        manager = manager_cls(
            object(),
            solver=blocking_solver,
            validate_payload=lambda _payload: None,
            max_pending_jobs=1,
            max_stored_jobs=10,
            job_ttl_seconds=3600,
            start_worker=True,
        )
        try:
            first = manager.create_job({})
            deadline = time.time() + 1.0
            while time.time() < deadline and manager.get_job(first.job_id).status != "running":
                time.sleep(0.01)

            self.assertEqual(manager.get_job(first.job_id).status, "running")
            with self.assertRaises(queue_full_cls):
                manager.create_job({})
        finally:
            release.set()

    def test_radiomap_running_job_counts_against_pending_limit(self) -> None:
        self._assert_running_job_counts_against_limit(RadiomapJobManager, RadiomapQueueFull)

    def test_mobility_running_job_counts_against_pending_limit(self) -> None:
        self._assert_running_job_counts_against_limit(MobilityJobManager, MobilityQueueFull)


if __name__ == "__main__":
    unittest.main()
