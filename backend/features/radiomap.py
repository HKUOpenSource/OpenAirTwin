from __future__ import annotations

from backend.features.core import BackendFeatureDefinition
from backend.features.inprocess_routes import InProcessFeatureService, register_inprocess_job_routes
from backend.jobs.radiomap_jobs import RadiomapJobManager


def create_service(resources):
    return InProcessFeatureService(RadiomapJobManager(resources["rt_runtime"]))


def register_routes(routes) -> None:
    register_inprocess_job_routes(
        routes,
        feature_id="radiomap",
        path_prefix="/api/radiomap/jobs",
        legacy_attribute="job_manager",
    )


RADIOMAP_FEATURE = BackendFeatureDefinition(
    id="radiomap",
    create_service=create_service,
    register_routes=register_routes,
    resources=("rt_runtime",),
)
