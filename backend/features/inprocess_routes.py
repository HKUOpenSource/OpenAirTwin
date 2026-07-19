from __future__ import annotations

from dataclasses import dataclass

from backend.features.core import capture_ready_scene_generation, resolve_feature_service


@dataclass
class InProcessFeatureService:
    manager: object


def _manager(request_handler, feature_id: str, legacy_attribute: str):
    service = resolve_feature_service(request_handler, feature_id, legacy_attribute)
    return getattr(service, "manager", service)


def register_inprocess_job_routes(route_registry, *, feature_id: str, path_prefix: str, legacy_attribute: str) -> None:
    def create_job(request, _params) -> None:
        payload = request.read_json_body()
        scene_generation = capture_ready_scene_generation(request.app_state.rt_runtime)
        job = _manager(request, feature_id, legacy_attribute).create_job(
            payload,
            scene_generation=scene_generation,
        )
        request.send_json({"ok": True, "job_id": job.job_id, "status": job.status})

    def get_job(request, params) -> None:
        job = _manager(request, feature_id, legacy_attribute).get_job(params["job_id"])
        if job is None:
            request.send_text("Unknown job id", code=404)
            return
        payload = job.to_status_dict()
        if job.status == "failed":
            payload["error"] = job.error
        request.send_json(payload)

    def get_result(request, params) -> None:
        job_id = params["job_id"]
        job = _manager(request, feature_id, legacy_attribute).get_job(job_id)
        if job is None:
            request.send_text("Unknown job id", code=404)
            return
        if job.status != "succeeded" or job.result is None:
            request.send_json(
                {"job_id": job_id, "status": job.status, "message": job.message},
                code=409,
            )
            return
        request.send_json({"job_id": job_id, "status": job.status, **job.result})

    route_registry.add("POST", path_prefix, create_job, name=f"{feature_id}.create")
    route_registry.add("GET", f"{path_prefix}/{{job_id}}/result", get_result, name=f"{feature_id}.result")
    route_registry.add("GET", f"{path_prefix}/{{job_id}}", get_job, name=f"{feature_id}.status")
