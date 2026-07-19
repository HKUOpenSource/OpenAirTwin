from __future__ import annotations

from dataclasses import dataclass

from backend.features.core import BackendFeatureDefinition, resolve_feature_service
from backend.jobs.deepmimo_jobs import DeepMIMOJobManager
from backend.rt.runtime import SceneNotReady


@dataclass
class DeepMIMOFeatureService:
    manager: object


def create_service(_resources):
    return DeepMIMOFeatureService(DeepMIMOJobManager())


def _manager(request):
    service = resolve_feature_service(request, "deepmimo", "deepmimo_job_manager")
    return getattr(service, "manager", service)


def _active_tile_ids(rt_runtime) -> tuple[str, ...]:
    rt_lock = getattr(rt_runtime, "lock", None)
    if rt_lock is None:
        rt_runtime.require_ready()
        return tuple(
            getattr(rt_runtime, "active_tile_ids", ())
            or rt_runtime.status_dict().get("active_tile_ids", ())
        )
    with rt_lock:
        rt_runtime.require_ready()
        active = tuple(getattr(rt_runtime, "active_tile_ids", ()))
        if not active and hasattr(rt_runtime, "_status_dict_unlocked"):
            active = tuple(rt_runtime._status_dict_unlocked().get("active_tile_ids", ()))
        return active


def register_routes(routes) -> None:
    def create_job(request, _params) -> None:
        payload = request.read_json_body()
        active_tile_ids = _active_tile_ids(request.app_state.rt_runtime)
        if not active_tile_ids:
            raise SceneNotReady("empty", "No Sionna RT scene is ready; select at least one tile")
        payload = dict(payload)
        payload["scene"] = {"tile_ids": list(active_tile_ids)}
        job = _manager(request).create_job(payload)
        request.send_json({"ok": True, "job_id": job.job_id, "status": job.status})

    def get_job(request, params) -> None:
        job = _manager(request).get_job(params["job_id"])
        if job is None:
            request.send_text("Unknown job id", code=404)
            return
        payload = job.to_status_dict()
        if job.status == "failed":
            payload["error"] = job.error
        request.send_json(payload)

    def cancel_job(request, params) -> None:
        manager = _manager(request)
        cancel = getattr(manager, "cancel_job", None)
        if cancel is None:
            request.send_text("DeepMIMO cancellation not supported on this build", code=501)
            return
        job = cancel(params["job_id"])
        if job is None:
            request.send_text("Unknown job id", code=404)
            return
        request.send_json(job.to_status_dict())

    def download(request, params) -> None:
        job_id = params["job_id"]
        manager = _manager(request)
        lease_factory = getattr(manager, "open_download_file", None)
        if lease_factory is not None:
            lease = lease_factory(job_id)
            if lease is None:
                request.send_text("DeepMIMO dataset is not ready", code=404)
                return
            with lease as handle:
                request.send_download_handle(
                    handle,
                    content_type="application/zip",
                    filename=f"deepmimo_{job_id}.zip",
                )
            return
        archive = manager.get_download_path(job_id)
        if archive is None:
            request.send_text("DeepMIMO dataset is not ready", code=404)
            return
        request.send_download_file(
            archive,
            content_type="application/zip",
            filename=f"deepmimo_{job_id}.zip",
        )

    routes.add("POST", "/api/deepmimo/jobs", create_job, name="deepmimo.create")
    routes.add("POST", "/api/deepmimo/jobs/{job_id}/cancel", cancel_job, name="deepmimo.cancel")
    routes.add("GET", "/api/deepmimo/jobs/{job_id}/download", download, name="deepmimo.download")
    routes.add("GET", "/api/deepmimo/jobs/{job_id}", get_job, name="deepmimo.status")


DEEPMIMO_FEATURE = BackendFeatureDefinition(
    id="deepmimo",
    create_service=create_service,
    register_routes=register_routes,
)
