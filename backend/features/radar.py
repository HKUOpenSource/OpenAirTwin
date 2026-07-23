from __future__ import annotations

from dataclasses import dataclass

from backend.features.core import (
    BackendFeatureDefinition,
    RequestBodyTooLarge,
    capture_ready_scene_generation,
    resolve_feature_service,
)
from backend.jobs.radar_jobs import RadarJobManager, RadarQueueFull
from backend.rt.process_radar import solve_radar_sensing
from backend.rt.radar_payload import (
    RADAR_HTTP_ERROR_CONTRACT,
    RADAR_HTTP_ERROR_MESSAGES,
    parse_radar_payload,
)
from backend.rt.runtime import SceneNotReady


@dataclass
class RadarFeatureService:
    rt_runtime: object
    manager: RadarJobManager

    def solve(self, payload: dict) -> dict:
        return solve_radar_sensing(self.rt_runtime, payload)


def create_service(resources):
    rt_runtime = resources["rt_runtime"]
    return RadarFeatureService(rt_runtime, RadarJobManager(rt_runtime))


def _radar_manager(request) -> RadarJobManager:
    service_or_manager = resolve_feature_service(request, "radar", "radar_job_manager")
    return getattr(service_or_manager, "manager", service_or_manager)


def _send_error(request, error: str) -> None:
    request.send_json(
        {
            "ok": False,
            "error": error,
            "message": RADAR_HTTP_ERROR_MESSAGES[error],
        },
        code=RADAR_HTTP_ERROR_CONTRACT[error],
    )


def register_routes(routes) -> None:
    def create_job(request, _params) -> None:
        try:
            payload = request.read_json_body()
        except RequestBodyTooLarge:
            _send_error(request, "request_too_large")
            return
        except ValueError:
            _send_error(request, "invalid_payload")
            return
        try:
            parse_radar_payload(payload)
        except ValueError:
            _send_error(request, "invalid_payload")
            return
        try:
            scene_generation = capture_ready_scene_generation(request.app_state.rt_runtime)
        except SceneNotReady:
            _send_error(request, "scene_not_ready")
            return
        if scene_generation is None:
            _send_error(request, "scene_not_ready")
            return
        try:
            job = _radar_manager(request).create_job(
                payload,
                scene_generation=scene_generation,
            )
        except RadarQueueFull:
            _send_error(request, "queue_full")
            return
        request.send_json(
            {
                "ok": True,
                "job_id": job.job_id,
                "status": job.status,
                "scene_generation": job.scene_generation,
            },
            code=202,
        )

    def get_status(request, params) -> None:
        job = _radar_manager(request).get_job(params["job_id"])
        if job is None:
            _send_error(request, "unknown_job")
            return
        request.send_json(job.to_status_dict())

    def get_result(request, params) -> None:
        manager = _radar_manager(request)
        job = manager.get_job(params["job_id"])
        if job is None:
            _send_error(request, "unknown_job")
            return
        if job.status != "succeeded":
            _send_error(request, "result_not_ready")
            return
        result = manager.get_result(job.job_id)
        if result is None:
            _send_error(request, "result_not_ready")
            return
        request.send_json(result)

    def cancel_job(request, params) -> None:
        job = _radar_manager(request).cancel_job(params["job_id"])
        if job is None:
            _send_error(request, "unknown_job")
            return
        request.send_json(job.to_status_dict())

    def solve(request, _params) -> None:
        payload = request.read_json_body()
        registry = getattr(request.app_state, "feature_services", None)
        if registry is None:
            result = solve_radar_sensing(request.app_state.rt_runtime, payload)
        else:
            result = resolve_feature_service(request, "radar").solve(payload)
        request.send_json(result)

    routes.add("POST", "/api/radar/jobs", create_job, name="radar.create")
    routes.add("GET", "/api/radar/jobs/{job_id}", get_status, name="radar.status")
    routes.add("GET", "/api/radar/jobs/{job_id}/result", get_result, name="radar.result")
    routes.add("POST", "/api/radar/jobs/{job_id}/cancel", cancel_job, name="radar.cancel")
    # Temporary compatibility endpoint for /radar-demo. The publishable Radar UI
    # will use only the bounded asynchronous job contract above.
    routes.add("POST", "/api/radar/solve", solve, name="radar.solve")


RADAR_FEATURE = BackendFeatureDefinition(
    id="radar",
    create_service=create_service,
    register_routes=register_routes,
    resources=("rt_runtime",),
)
