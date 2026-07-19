from __future__ import annotations

from pathlib import Path
from types import SimpleNamespace

from backend.features.catalog import BACKEND_FEATURE_CATALOG, FEATURE_ROUTES
from backend.features.core import BackendFeatureDefinition, FeatureServiceRegistry, RouteRegistry
from backend.jobs.inprocess_jobs import InProcessJobManager
from backend.jobs.mobility_jobs import MobilityJobManager
from backend.jobs.radiomap_jobs import RadiomapJobManager


PROJECT_ROOT = Path(__file__).resolve().parents[1]


def test_backend_catalog_and_existing_routes_are_explicit() -> None:
    assert [feature.id for feature in BACKEND_FEATURE_CATALOG] == ["link", "mobility", "radiomap", "deepmimo"]
    assert {(method, path) for method, path, _name in FEATURE_ROUTES.routes()} == {
        ("POST", "/api/link/solve"),
        ("POST", "/api/mobility/jobs"),
        ("GET", "/api/mobility/jobs/{job_id}"),
        ("GET", "/api/mobility/jobs/{job_id}/result"),
        ("POST", "/api/radiomap/jobs"),
        ("GET", "/api/radiomap/jobs/{job_id}"),
        ("GET", "/api/radiomap/jobs/{job_id}/result"),
        ("POST", "/api/deepmimo/jobs"),
        ("GET", "/api/deepmimo/jobs/{job_id}"),
        ("GET", "/api/deepmimo/jobs/{job_id}/download"),
        ("POST", "/api/deepmimo/jobs/{job_id}/cancel"),
    }


def test_virtual_backend_feature_registers_without_server_changes() -> None:
    calls: list[str] = []

    def register(routes: RouteRegistry) -> None:
        routes.add("GET", "/api/virtual/{item_id}", lambda _request, params: calls.append(params["item_id"]))

    virtual = BackendFeatureDefinition(
        id="virtual",
        create_service=lambda _resources: object(),
        register_routes=register,
    )
    routes = RouteRegistry()
    virtual.register_routes(routes)
    services = FeatureServiceRegistry({})
    services.register(virtual)
    assert services.get("virtual") is not None
    assert routes.dispatch("GET", "/api/virtual/a%20b", SimpleNamespace())
    assert calls == ["a b"]
    server_source = (PROJECT_ROOT / "backend" / "server.py").read_text(encoding="utf-8")
    assert "virtual" not in server_source


def test_rt_job_features_share_generic_manager() -> None:
    assert issubclass(RadiomapJobManager, InProcessJobManager)
    assert issubclass(MobilityJobManager, InProcessJobManager)


def test_frontend_core_entry_is_catalog_driven() -> None:
    app_source = (PROJECT_ROOT / "backend" / "static" / "js" / "app.js").read_text(encoding="utf-8")
    scene_source = (PROJECT_ROOT / "backend" / "static" / "js" / "scene_render_state.js").read_text(encoding="utf-8")
    catalog_source = (PROJECT_ROOT / "backend" / "static" / "js" / "features" / "feature_catalog.js").read_text(encoding="utf-8")
    assert "featureRegistry.definitions()" in app_source
    assert "featureRegistry.mountTemplates(document)" in app_source
    assert "features.definitions()" in scene_source
    for feature_id in ("link", "mobility", "radiomap", "deepmimo"):
        assert f'"{feature_id}"' not in app_source
        assert f'"{feature_id}"' not in scene_source
        assert feature_id in catalog_source.lower()
    for feature_api in (
        "solveLink",
        "createMobilityJob",
        "createRadiomapJob",
        "createDeepMimoJob",
        "getMobilityResult",
        "getRadiomapResult",
        "getDeepMimoJob",
    ):
        assert feature_api not in app_source


def test_frontend_features_own_state_transport_controller_view_and_lifecycle() -> None:
    feature_root = PROJECT_ROOT / "backend" / "static" / "js" / "features"
    solver_source = (PROJECT_ROOT / "backend" / "static" / "js" / "solver_controls.js").read_text(encoding="utf-8")
    assert "/js/controllers/link_controller.js" not in solver_source
    assert "/js/controllers/mobility_controller.js" not in solver_source
    assert "/js/controllers/radiomap_controller.js" not in solver_source
    assert "/js/controllers/deepmimo_controller.js" not in solver_source

    feature_ids = ("link", "mobility", "radiomap", "deepmimo")
    for feature_id in feature_ids:
        directory = feature_root / feature_id
        assert {"index.js", "runtime.js", "state.js", "transport.js", "renderer.js"} <= {path.name for path in directory.iterdir()}
        index_source = (directory / "index.js").read_text(encoding="utf-8")
        runtime_source = (directory / "runtime.js").read_text(encoding="utf-8")
        for factory in ("createState", "createTransport", "createController", "createResultView", "createRenderer", "createFeature"):
            assert factory in index_source
        for sibling_id in feature_ids:
            if sibling_id != feature_id:
                assert f"state.{sibling_id}" not in runtime_source


def test_backend_server_dispatches_feature_routes_without_feature_url_branches() -> None:
    server_source = (PROJECT_ROOT / "backend" / "server.py").read_text(encoding="utf-8")
    assert "FEATURE_ROUTES.dispatch" in server_source
    for route_prefix in ("/api/link/", "/api/mobility/", "/api/radiomap/", "/api/deepmimo/"):
        assert route_prefix not in server_source
