from __future__ import annotations

import json
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[1]
STATIC_ROOT = PROJECT_ROOT / "backend" / "static"
JS_ROOT = STATIC_ROOT / "js"
WORKBENCH_SRC = PROJECT_ROOT / "workbench" / "src"
MANIFEST_PATH = PROJECT_ROOT / "docs" / "ui" / "component-manifest.json"


def read(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def load_manifest() -> dict:
    return json.loads(read(MANIFEST_PATH))


def test_component_manifest_declares_astryx_light_workbench() -> None:
    manifest = load_manifest()
    assert manifest["schemaVersion"] == 7
    assert manifest["designSystem"] == "@astryxdesign/core"
    assert manifest["themePackage"] == "@astryxdesign/theme-neutral"
    assert manifest["themeMode"] == "light"
    assert manifest["cssOwner"] == "workbench/src/styles/workbench.css"
    assert manifest["productionOwner"] == "react"
    assert manifest["reactProductionBoundaries"] == ["app-shell"]
    wrappers = {item["name"]: item for item in manifest["wrappers"]}
    assert set(wrappers) == {
        "ParamFields",
        "WorkbenchChrome",
        "TopWorkspaceBar",
        "LeftInspector",
        "DeviceBar",
        "RightAnalysisDrawer",
        "EntryMapScreen",
        "AppOverlays",
    }
    for wrapper in wrappers.values():
        source_path = PROJECT_ROOT / wrapper["reactSource"]
        assert source_path.is_file(), source_path
        source = read(source_path)
        assert "@astryxdesign/core" in source or "../ui/" in source


def test_app_providers_and_css_layers_enforce_astryx_light_theme() -> None:
    providers = read(WORKBENCH_SRC / "app" / "AppProviders.tsx")
    assert 'from "@astryxdesign/core/theme"' in providers
    assert 'from "@astryxdesign/theme-neutral/built"' in providers
    assert '<Theme theme={neutralTheme} mode="light">' in providers

    css = read(WORKBENCH_SRC / "styles" / "workbench.css")
    assert "@layer reset, astryx-base, astryx-theme, oat-theme, oat-layout, oat-charts;" in css
    assert '@import "@astryxdesign/core/reset.css";' in css
    assert '@import "@astryxdesign/core/astryx.css";' in css
    assert '@import "@astryxdesign/theme-neutral/theme.css";' in css


def test_production_index_and_vite_have_no_legacy_css_or_catalog() -> None:
    html = read(STATIC_ROOT / "index.html")
    vite = read(PROJECT_ROOT / "workbench" / "vite.config.ts")
    server_source = read(PROJECT_ROOT / "backend" / "server.py")

    for legacy_css in (
        "tokens.css",
        "base.css",
        "components.css",
        "shell.css",
        "entry-map.css",
        "results.css",
        "radar.css",
    ):
        assert legacy_css not in html
        assert not (STATIC_ROOT / "css" / legacy_css).exists()

    assert "@oat-catalog" not in html
    assert "developmentCatalogPlugin" not in vite
    assert "ui-catalog" not in server_source
    assert "serve_ui_catalog" not in server_source
    assert not (PROJECT_ROOT / "tools" / "ui-catalog").exists()
    assert not (PROJECT_ROOT / "tools" / "serve_ui_catalog.py").exists()
    assert not (WORKBENCH_SRC / "design-system").exists()
    assert not (WORKBENCH_SRC / "catalog").exists()


def test_unidirectional_app_shell_has_no_dom_refs_or_raw_feature_dom_bindings() -> None:
    assert not (JS_ROOT / "dom_refs.js").exists()
    assert not (JS_ROOT / "param_tooltips.js").exists()

    app_source = read(JS_ROOT / "app.js")
    app_shell = read(WORKBENCH_SRC / "app-shell" / "AppShell.tsx")
    app_shell_runtime = read(WORKBENCH_SRC / "app-shell" / "app-shell-runtime.tsx")
    workbench_store = read(WORKBENCH_SRC / "runtime" / "workbench-store.ts")
    host_registry = read(WORKBENCH_SRC / "runtime" / "host-registry.ts")

    assert "mountAppShell" in app_source
    assert "dom_refs" not in app_source
    assert "param_tooltips" not in app_source
    assert 'id: "app-shell"' in app_shell_runtime
    assert "reactRootRegistry.mount" in app_shell_runtime
    assert "createImperativeHostRegistry" in app_shell_runtime
    assert "createShellStore" in app_shell_runtime
    assert "createControlsStore" in app_shell_runtime
    assert 'data-oat-react-owner="app-shell"' in app_shell
    assert "createPortal" not in app_shell
    assert "ObservableStateAdapter" in workbench_store
    assert "ImperativeHostKey" in host_registry

    for path in sorted(JS_ROOT.rglob("*.js")):
        if path.name == "radar-demo.js":
            continue
        source = read(path)
        assert "dom_refs.js" not in source, path
        assert "param_tooltips.js" not in source, path

    for relative_path in (
        "features/link/runtime.js",
        "features/mobility/runtime.js",
        "features/radiomap/runtime.js",
        "features/deepmimo/runtime.js",
        "features/radar/runtime.js",
    ):
        source = read(JS_ROOT / relative_path)
        assert '.addEventListener("click"' not in source, relative_path
        assert '.addEventListener("change"' not in source, relative_path
