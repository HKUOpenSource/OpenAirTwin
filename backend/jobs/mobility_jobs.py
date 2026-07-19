from __future__ import annotations

from dataclasses import dataclass

from backend import config
from backend.jobs.inprocess_jobs import InProcessJob, InProcessJobManager, InProcessQueueFull
from backend.rt.common import parse_mobility_payload
from backend.rt.solve_mobility import solve_mobility


@dataclass
class MobilityJob(InProcessJob):
    pass


class MobilityQueueFull(InProcessQueueFull):
    def __init__(self, max_pending_jobs: int) -> None:
        super().__init__("Mobility job queue is full; try again later", max_pending_jobs)


class MobilityJobManager(InProcessJobManager):
    def __init__(
        self,
        rt_runtime,
        *,
        solver=solve_mobility,
        validate_payload=parse_mobility_payload,
        max_pending_jobs: int = config.MOBILITY_MAX_PENDING_JOBS,
        max_stored_jobs: int = config.MOBILITY_MAX_STORED_JOBS,
        job_ttl_seconds: float = config.MOBILITY_JOB_TTL_SECONDS,
        start_worker: bool = True,
    ) -> None:
        super().__init__(
            rt_runtime,
            solver=solver,
            validate_payload=validate_payload,
            job_type=MobilityJob,
            queue_full_type=MobilityQueueFull,
            id_prefix="mob",
            success_message="Mobility result ready",
            failure_message="Mobility job failed",
            max_pending_jobs=max_pending_jobs,
            max_stored_jobs=max_stored_jobs,
            job_ttl_seconds=job_ttl_seconds,
            start_worker=start_worker,
        )
