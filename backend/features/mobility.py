from __future__ import annotations

from backend.features.core import BackendFeatureDefinition
from backend.features.inprocess_routes import InProcessFeatureService, register_inprocess_job_routes
from backend.jobs.mobility_jobs import MobilityJobManager


def create_service(resources):
    return InProcessFeatureService(MobilityJobManager(resources["rt_runtime"]))


def register_routes(routes) -> None:
    register_inprocess_job_routes(
        routes,
        feature_id="mobility",
        path_prefix="/api/mobility/jobs",
        legacy_attribute="mobility_job_manager",
    )


MOBILITY_FEATURE = BackendFeatureDefinition(
    id="mobility",
    create_service=create_service,
    register_routes=register_routes,
    resources=("rt_runtime",),
)
