from __future__ import annotations

from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from backend.features.catalog import BACKEND_FEATURE_CATALOG, FEATURE_ROUTES
from backend.features.core import BackendFeatureDefinition, FeatureServiceRegistry, RouteRegistry
from backend.features.radar import RADAR_FEATURE
from backend.jobs.inprocess_jobs import InProcessJobManager
from backend.jobs.mobility_jobs import MobilityJobManager
from backend.jobs.radiomap_jobs import RadiomapJobManager
from backend.rt.radar_payload import RADAR_JOB_ROUTE_CONTRACT


PROJECT_ROOT = Path(__file__).resolve().parents[1]
APP_CSS_FILES = (
    "tokens.css", "base.css", "components.css", "shell.css",
    "entry-map.css", "results.css", "radar.css",
)


def read_app_css() -> str:
    css_root = PROJECT_ROOT / "backend" / "static" / "css"
    return "\n".join((css_root / name).read_text(encoding="utf-8") for name in APP_CSS_FILES)


def test_backend_catalog_and_existing_routes_are_explicit() -> None:
    assert [feature.id for feature in BACKEND_FEATURE_CATALOG] == ["link", "mobility", "radiomap", "deepmimo", "radar"]
    assert {(method, path) for method, path, _name in FEATURE_ROUTES.routes()} == {
        ("POST", "/api/link/solve"),
        ("POST", "/api/radar/solve"),
        ("POST", "/api/radar/jobs"),
        ("GET", "/api/radar/jobs/{job_id}"),
        ("GET", "/api/radar/jobs/{job_id}/result"),
        ("POST", "/api/radar/jobs/{job_id}/cancel"),
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
    radar_job_routes = tuple(
        route for route in FEATURE_ROUTES.routes() if route[1].startswith("/api/radar/jobs")
    )
    assert radar_job_routes == RADAR_JOB_ROUTE_CONTRACT
    assert all("download" not in path for _method, path, _name in radar_job_routes)


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


def test_radar_route_has_independent_service_and_solver() -> None:
    runtime = object()
    services = FeatureServiceRegistry({"rt_runtime": runtime})
    services.register(RADAR_FEATURE)
    responses: list[dict] = []
    request = SimpleNamespace(
        app_state=SimpleNamespace(feature_services=services),
        read_json_body=lambda: {"tx": {"position": [1, 2, 3]}},
        send_json=responses.append,
    )
    expected = {"ok": True, "summary": {"valid_paths": 0}, "paths": []}

    with patch("backend.features.radar.solve_radar_sensing", return_value=expected) as solve:
        assert FEATURE_ROUTES.dispatch("POST", "/api/radar/solve", request)

    solve.assert_called_once_with(runtime, {"tx": {"position": [1, 2, 3]}})
    assert responses == [expected]

    radar_source = (PROJECT_ROOT / "backend" / "features" / "radar.py").read_text(encoding="utf-8")
    solver_source = (PROJECT_ROOT / "backend" / "rt" / "solve_radar.py").read_text(encoding="utf-8")
    processor_source = (PROJECT_ROOT / "backend" / "rt" / "process_radar.py").read_text(encoding="utf-8")
    assert "solve_link" not in radar_source
    assert "solve_link" not in solver_source
    assert "solve_link" not in processor_source
    assert "solve_radar_propagation" in processor_source


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
    for feature_id in ("link", "mobility", "radiomap", "deepmimo", "radar"):
        assert f'"{feature_id}"' not in app_source
        assert f'"{feature_id}"' not in scene_source
        assert feature_id in catalog_source.lower()
    for feature_api in (
        "solveLink",
        "solveRadar",
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
    assert "/js/controllers/radar_controller.js" not in solver_source

    feature_ids = ("link", "mobility", "radiomap", "deepmimo", "radar")
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


def test_radar_rs08_frontend_uses_job_api_and_owns_its_complete_workflow() -> None:
    radar_root = PROJECT_ROOT / "backend" / "static" / "js" / "features" / "radar"
    index_source = (radar_root / "index.js").read_text(encoding="utf-8")
    runtime_source = (radar_root / "runtime.js").read_text(encoding="utf-8")
    controls_source = (radar_root / "controls.js").read_text(encoding="utf-8")
    transport_source = (radar_root / "transport.js").read_text(encoding="utf-8")
    controller_source = (PROJECT_ROOT / "backend" / "static" / "js" / "controllers" / "radar_controller.js").read_text(encoding="utf-8")
    result_source = (PROJECT_ROOT / "backend" / "static" / "js" / "ui" / "radar_result_view.js").read_text(encoding="utf-8")
    renderer_source = (radar_root / "renderer.js").read_text(encoding="utf-8")
    charts_source = (radar_root / "charts.js").read_text(encoding="utf-8")
    colors_source = (radar_root / "colors.js").read_text(encoding="utf-8")
    viewer_source = (PROJECT_ROOT / "backend" / "static" / "js" / "viewer.js").read_text(encoding="utf-8")
    css_source = read_app_css()

    assert "createLinkResultView" not in index_source
    assert "renderLinkResult" not in index_source + runtime_source
    assert "solveRadar" not in transport_source + controller_source + runtime_source
    for method in ("createRadarJob", "getRadarJob", "getRadarResult", "cancelRadarJob"):
        assert method in transport_source
        assert method in controller_source
    for capability in (
        "radarModeMonostatic", "btnAddRadarTarget", "btnRemoveRadarTarget", "btnPickRadarTarget",
        "radarNumSubcarriers", "radarNumSymbols", "radarCfarEnabled", "radarRangeDopplerCanvas",
        "radarDetectionList", "radarTruthList", "radarPathList",
    ):
        assert capability in index_source
    assert "1048576" in controls_source
    assert "scene_generation" in controller_source
    assert "RadarTargetScene" in renderer_source
    assert "radarTargetLabelLayer" in renderer_source
    assert 'document.querySelector(".shell")' in renderer_source
    assert "shell.prepend(targetLabelLayer)" in renderer_source
    assert "TARGET_LABEL_REFERENCE_DEPTH_M" in renderer_source
    assert "TARGET_LABEL_MIN_SCALE" in renderer_source
    assert "placeTargetLabels" in renderer_source
    assert "radarTargetConnectorLayer" in renderer_source
    assert "radarTargetColor" in renderer_source
    assert "radarTargetColor" in charts_source
    assert "radarTargetColor" in result_source
    assert "RADAR_TARGET_COLORS" in colors_source
    assert 'selected ? "#1f6fff"' not in charts_source
    assert 'id="radarPlotLegend"' in index_source
    assert "Color matches scene target" not in index_source
    assert ".radarPlotLegend .clutter:before" in css_source
    assert "border:1.5px solid var(--radar-legend-clutter-color)" in css_source
    assert 'style.setProperty("--radar-legend-clutter-color", RADAR_CLUTTER_COLOR)' in result_source
    assert "decluttered" not in renderer_source
    assert "flipped" not in renderer_source
    assert "subscribeFrame(updateTargetLabelPositions)" in renderer_source
    assert "radarDirectionArrowLengthM" in renderer_source
    assert "speed *" not in renderer_source
    assert "targetInfoSprite" not in renderer_source
    assert "CanvasTexture" not in renderer_source
    assert "subscribeFrame(listener)" in viewer_source
    assert viewer_source.index("listener(frame)") < viewer_source.index("this.renderer.render(this.scene, this.camera)")
    assert ".radarTargetLabelLayer" in css_source
    assert ".radarTargetConnectorLayer" in css_source
    assert "--radar-target-label-scale" in css_source
    assert "pointer-events:none" in css_source
    assert "selectedDetectionId" in result_source
    assert "Live Preview" not in index_source
    assert "radarRdExpand" not in index_source + result_source
    assert "radarPowerScale" in result_source
    forbidden = ("/download", "btnDownload", "saveAs", "new Blob(")
    formal_sources = index_source + runtime_source + controls_source + controller_source + result_source
    for token in forbidden:
        assert token.lower() not in formal_sources.lower()


def test_backend_server_dispatches_feature_routes_without_feature_url_branches() -> None:
    server_source = (PROJECT_ROOT / "backend" / "server.py").read_text(encoding="utf-8")
    assert "FEATURE_ROUTES.dispatch" in server_source
    for route_prefix in ("/api/link/", "/api/mobility/", "/api/radiomap/", "/api/deepmimo/", "/api/radar/"):
        assert route_prefix not in server_source
