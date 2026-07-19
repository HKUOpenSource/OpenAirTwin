from __future__ import annotations

from dataclasses import dataclass

from backend import config
from backend.jobs.inprocess_jobs import InProcessJob, InProcessJobManager, InProcessQueueFull
from backend.rt.common import parse_radiomap_payload
from backend.rt.solve_radiomap import solve_terrain_radiomap


@dataclass
class RadiomapJob(InProcessJob):
    pass


class RadiomapQueueFull(InProcessQueueFull):
    def __init__(self, max_pending_jobs: int) -> None:
        super().__init__("Radio map job queue is full; try again later", max_pending_jobs)


class RadiomapJobManager(InProcessJobManager):
    def __init__(
        self,
        rt_runtime,
        *,
        solver=solve_terrain_radiomap,
        validate_payload=parse_radiomap_payload,
        max_pending_jobs: int = config.RADIOMAP_MAX_PENDING_JOBS,
        max_stored_jobs: int = config.RADIOMAP_MAX_STORED_JOBS,
        job_ttl_seconds: float = config.RADIOMAP_JOB_TTL_SECONDS,
        start_worker: bool = True,
    ) -> None:
        super().__init__(
            rt_runtime,
            solver=solver,
            validate_payload=validate_payload,
            job_type=RadiomapJob,
            queue_full_type=RadiomapQueueFull,
            id_prefix="rm",
            success_message="Radio map ready",
            failure_message="Radio map job failed",
            max_pending_jobs=max_pending_jobs,
            max_stored_jobs=max_stored_jobs,
            job_ttl_seconds=job_ttl_seconds,
            start_worker=start_worker,
        )
