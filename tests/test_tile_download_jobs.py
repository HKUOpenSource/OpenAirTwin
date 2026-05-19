from __future__ import annotations

from contextlib import redirect_stderr
import io
import threading
import time
import unittest

from backend.jobs.tile_download_jobs import TileDownloadBusy, TileDownloadJobManager
from backend.scene.incremental_tiles import TileDownloadCancelled


def wait_for_status(job, statuses: set[str], timeout: float = 2.0) -> None:
    deadline = time.time() + timeout
    while time.time() < deadline:
        if job.status in statuses:
            return
        time.sleep(0.01)
    raise AssertionError(f"Job {job.job_id} stayed in status {job.status!r}")


class TileDownloadJobManagerTests(unittest.TestCase):
    def test_same_tile_duplicate_returns_active_job(self) -> None:
        release = threading.Event()

        def runner(tile_id, **_kwargs):
            release.wait(timeout=1.0)
            return {"tile": tile_id}

        manager = TileDownloadJobManager(runner)
        first = manager.create_job("11_SW_7A")
        second = manager.create_job("11_SW_7A")
        release.set()
        wait_for_status(first, {"succeeded"})

        self.assertIs(first, second)

    def test_different_tile_is_rejected_while_active_job_exists(self) -> None:
        release = threading.Event()

        def runner(tile_id, **_kwargs):
            release.wait(timeout=1.0)
            return {"tile": tile_id}

        manager = TileDownloadJobManager(runner)
        first = manager.create_job("11_SW_7A")
        try:
            with self.assertRaises(TileDownloadBusy) as error:
                manager.create_job("11_SW_7B")
            self.assertEqual(error.exception.active_job_id, first.job_id)
            self.assertEqual(error.exception.active_tile_id, "11_SW_7A")
        finally:
            release.set()
            wait_for_status(first, {"succeeded"})

    def test_new_tile_is_allowed_after_terminal_statuses(self) -> None:
        def succeeded_runner(tile_id, **_kwargs):
            return {"tile": tile_id}

        success_manager = TileDownloadJobManager(succeeded_runner)
        success_job = success_manager.create_job("11_SW_7A")
        wait_for_status(success_job, {"succeeded"})
        next_success_job = success_manager.create_job("11_SW_7B")
        wait_for_status(next_success_job, {"succeeded"})
        self.assertNotEqual(success_job.job_id, next_success_job.job_id)

        def failed_runner(_tile_id, **_kwargs):
            raise RuntimeError("download failed")

        failed_manager = TileDownloadJobManager(failed_runner)
        with redirect_stderr(io.StringIO()):
            failed_job = failed_manager.create_job("11_SW_7A")
            wait_for_status(failed_job, {"failed"})
            next_failed_job = failed_manager.create_job("11_SW_7B")
            wait_for_status(next_failed_job, {"failed"})
        self.assertNotEqual(failed_job.job_id, next_failed_job.job_id)

        release = threading.Event()

        def cancelled_runner(_tile_id, *, cancel_check, **_kwargs):
            while not cancel_check():
                release.wait(timeout=0.01)
            raise TileDownloadCancelled("Tile download cancelled")

        cancelled_manager = TileDownloadJobManager(cancelled_runner)
        cancelled_job = cancelled_manager.create_job("11_SW_7A")
        cancelled_manager.cancel_job(cancelled_job.job_id)
        release.set()
        wait_for_status(cancelled_job, {"canceled"})
        next_cancelled_job = cancelled_manager.create_job("11_SW_7B")
        cancelled_manager.cancel_job(next_cancelled_job.job_id)
        wait_for_status(next_cancelled_job, {"canceled"})
        self.assertNotEqual(cancelled_job.job_id, next_cancelled_job.job_id)


if __name__ == "__main__":
    unittest.main()
