from __future__ import annotations

from dataclasses import dataclass

from backend.features.core import BackendFeatureDefinition, resolve_feature_service
from backend.rt.solve_link import solve_link


@dataclass
class LinkFeatureService:
    rt_runtime: object

    def solve(self, payload: dict) -> dict:
        return solve_link(self.rt_runtime, payload)


def create_service(resources):
    return LinkFeatureService(resources["rt_runtime"])


def register_routes(routes) -> None:
    def solve(request, _params) -> None:
        payload = request.read_json_body()
        registry = getattr(request.app_state, "feature_services", None)
        if registry is None:
            result = solve_link(request.app_state.rt_runtime, payload)
        else:
            result = resolve_feature_service(request, "link").solve(payload)
        request.send_json(result)

    routes.add("POST", "/api/link/solve", solve, name="link.solve")


LINK_FEATURE = BackendFeatureDefinition(
    id="link",
    create_service=create_service,
    register_routes=register_routes,
    resources=("rt_runtime",),
)
