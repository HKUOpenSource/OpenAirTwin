from __future__ import annotations

from html.parser import HTMLParser
import json
from pathlib import Path
import re


PROJECT_ROOT = Path(__file__).resolve().parents[1]
STATIC_ROOT = PROJECT_ROOT / "backend" / "static"
CSS_ROOT = STATIC_ROOT / "css"
JS_ROOT = STATIC_ROOT / "js"
MANIFEST_PATH = PROJECT_ROOT / "docs" / "ui" / "component-manifest.json"
CATALOG_PATH = PROJECT_ROOT / "tools" / "ui-catalog" / "index.html"


def read(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def load_manifest() -> dict:
    return json.loads(read(MANIFEST_PATH))


class ClassCollector(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.class_values: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        values = dict(attrs)
        if values.get("class"):
            self.class_values.extend(str(values["class"]).split())


class FeatureClassCollector(ClassCollector):
    def __init__(self) -> None:
        super().__init__()
        self.in_feature = False
        self.section_depth = 0

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        values = dict(attrs)
        if not self.in_feature:
            if tag != "section" or values.get("data-test-feature") != "native":
                return
            self.in_feature = True
            self.section_depth = 1
        elif tag == "section":
            self.section_depth += 1
        super().handle_starttag(tag, attrs)

    def handle_endtag(self, tag: str) -> None:
        if self.in_feature and tag == "section":
            self.section_depth -= 1
            if self.section_depth == 0:
                self.in_feature = False


def test_manifest_and_catalog_cover_every_public_variant_and_state() -> None:
    manifest = load_manifest()
    catalog = read(CATALOG_PATH)
    components = {component["name"]: component for component in manifest["components"]}
    assert manifest["schemaVersion"] == 6
    assert manifest["phase"] == 8
    assert manifest["productionOwner"] == "react"
    assert manifest["reactProductionBoundaries"] == ["app-shell"]
    assert manifest["reactCatalogEntry"] == "workbench/src/catalog/main.tsx"
    assert set(components) == {
        "Panel", "Button", "Field", "Checkbox", "Badge", "MetricGrid",
        "ListCard", "EmptyState", "Filter", "ChartFrame", "ScrollRegion", "Icon",
    }
    assert set(components["Button"]["variants"]) == {
        "default", "primary", "compact", "icon", "danger", "block", "toolbar",
    }
    for state in ("hover", "focus-visible", "active", "pressed", "disabled", "busy"):
        assert state in components["Button"]["states"]
    for state in ("hover", "focus-visible", "disabled", "invalid", "read-only"):
        assert state in components["Field"]["states"]
    for variant in ("success", "warning", "error", "busy"):
        assert f"oat-badge--{variant}" in catalog
    for modifier in ("primary", "compact", "icon", "danger", "block", "toolbar"):
        assert f"oat-button--{modifier}" in catalog
    for component in components.values():
        react_source = PROJECT_ROOT / component["reactSource"]
        assert react_source.is_file(), react_source


def test_react_catalog_is_development_only_and_keeps_native_as_production_owner() -> None:
    catalog = read(CATALOG_PATH)
    vite = read(PROJECT_ROOT / "workbench" / "vite.config.ts")
    production_index = read(STATIC_ROOT / "index.html")
    assert 'data-catalog-implementation="native"' in catalog
    assert 'data-catalog-implementation="react"' in catalog
    assert 'src="/@oat-catalog/main.tsx"' in catalog
    assert 'apply: "serve"' in vite
    assert "developmentCatalogPlugin()" in vite
    assert "@oat-catalog" not in production_index
    assert "reactCatalogRoot" not in production_index


def test_phase8_legacy_aliases_are_absent_from_css_and_react_markup() -> None:
    components = read(CSS_ROOT / "components.css")
    react_markup = "\n".join(
        read(PROJECT_ROOT / "workbench" / "src" / relative)
        for relative in (
            "app-shell/ShellLayout.tsx",
            "features/controls/ControlSurface.tsx",
            "features/results/ResultDockContent.tsx",
        )
    )
    for alias in ("miniBtn", "miniSelect", "oat-button--legacy-native-font"):
        assert alias not in components
        assert alias not in react_markup
    assert not re.search(r"(?m)(?:^|,)\s*\.btn(?:\b|[.:])", components)
    assert not re.search(r"(?m)(?:^|,)\s*\.danger(?:\b|[.:])", components)
    assert not re.search(r"(?m)(?:^|,)\s*\.primary(?:\b|[.:])", components)
    assert '"className":"danger ' not in react_markup
    assert 'className="primary ' not in react_markup
    assert ".oat-button:not(.oat-button--compact)" in components
    assert ".oat-button--compact" in components
    assert ".oat-input--compact" in components


def test_feature_rows_compose_public_components_without_core_button_overrides() -> None:
    expected_patterns = {
        PROJECT_ROOT / "workbench" / "src" / "app-shell" / "ShellCollections.tsx": [
            "entryPlaceResult oat-list-card oat-list-card--interactive",
            "categoryItem oat-check oat-list-card",
            "tileItem oat-check oat-list-card",
        ],
        PROJECT_ROOT / "workbench" / "src" / "features" / "results" / "ResultDockContent.tsx": [
            "pathAllButton oat-list-card oat-list-card--interactive",
            "pathRow oat-list-card oat-list-card--interactive",
            'className="radarEmptyState"',
        ],
        PROJECT_ROOT / "workbench" / "src" / "features" / "controls" / "ControlCollections.tsx": [
            "waypointItem oat-list-card oat-list-card--interactive",
            "waypointEmpty oat-empty-state",
            "radarTargetCard oat-list-card oat-list-card--interactive",
            "radarEmptyState oat-empty-state",
        ],
    }
    for path, patterns in expected_patterns.items():
        source = read(path)
        assert all(pattern in source for pattern in patterns), path

    radar_css = read(CSS_ROOT / "radar.css")
    assert ".radarEditorActions .miniBtn" not in radar_css
    assert not re.search(r"(?m)^\s*\.radarAssetAddButton\s*\{", radar_css)


def test_phase8_react_has_one_app_shell_path_without_legacy_renderers() -> None:
    html = read(STATIC_ROOT / "index.html")
    app = read(JS_ROOT / "app.js")
    dom_refs = read(JS_ROOT / "dom_refs.js")
    solver = read(JS_ROOT / "solver_controls.js")
    radar_controls = read(JS_ROOT / "features" / "radar" / "controls.js")
    model = read(PROJECT_ROOT / "workbench" / "src" / "features" / "controls" / "control-surface-model.ts")
    control_surface = read(PROJECT_ROOT / "workbench" / "src" / "features" / "controls" / "ControlSurface.tsx")
    app_shell = read(PROJECT_ROOT / "workbench" / "src" / "app-shell" / "AppShell.tsx")
    shell_layout = read(PROJECT_ROOT / "workbench" / "src" / "app-shell" / "ShellLayout.tsx")
    app_shell_runtime = read(PROJECT_ROOT / "workbench" / "src" / "app-shell" / "app-shell-runtime.tsx")
    contracts = read(PROJECT_ROOT / "workbench" / "src" / "features" / "controls" / "contracts.ts")
    controlled_field = read(PROJECT_ROOT / "workbench" / "src" / "design-system" / "components" / "ControlledField.tsx")

    assert "data-oat-react-owner" not in html
    assert 'data-oat-react-owner="control-form"' in shell_layout
    assert 'data-oat-react-owner="device-dock"' in shell_layout
    assert "mountAppShell" in app
    assert "bindAppShellRefs(appShellRuntime)" in app
    assert "controlSurfaceModel = appShellRuntime.controls;" in app
    assert "bindControlSurfaceRefs(controlSurfaceModel)" in app
    assert "inputs[key] = controlSurface.element(key);" in dom_refs
    assert "ui[key] = controlSurface.elements(selector);" in dom_refs
    assert "controlCommitCommand" in controlled_field
    assert "workbench.control.action" in contracts
    assert "CommandBus" in app_shell_runtime
    assert 'id: "app-shell"' in app_shell_runtime
    assert "reactRootRegistry.mount" in app_shell_runtime
    assert 'data-oat-react-owner="app-shell"' in app_shell
    assert 'addEventListener("toggle", handleToggle, true)' in app_shell
    assert "createPortal" not in app_shell
    assert "document.createElement" not in solver
    assert "document.createElement" not in radar_controls
    assert "document.createElement" not in control_surface
    assert ".innerHTML" not in control_surface
    assert ".innerHTML" not in app_shell_runtime
    assert "Compatibility" not in app_shell_runtime + control_surface + model
    for removed in (
        "app-shell/CompatibilityAppShellTree.tsx",
        "features/controls/CompatibilityControlTree.tsx",
        "app-shell/app-shell-bridge.tsx",
        "features/controls/control-surface-bridge.tsx",
    ):
        assert not (PROJECT_ROOT / "workbench" / "src" / removed).exists()

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


def test_icon_geometry_uses_tokens_and_accessibility_contract() -> None:
    token_source = read(CSS_ROOT / "tokens.css")
    for token in (
        "--oat-icon-size-xs", "--oat-icon-size-md", "--oat-icon-size-base",
        "--oat-icon-size-2xl", "--oat-icon-stroke-default", "--oat-icon-stroke-chevron",
    ):
        assert token in token_source
    css_source = "\n".join(read(CSS_ROOT / name) for name in ("shell.css", "entry-map.css", "results.css", "radar.css"))
    for selector in (
        ".channelAnalysisChevron svg", ".quickIconBtn svg", ".performanceDockChevron svg",
        ".deviceActionIcon svg", ".appDialogClose svg", ".sidebarToggleIcon svg",
        ".deepMimoDatasetIcon svg", ".radarAssetNav svg",
    ):
        match = re.search(rf"{re.escape(selector)}\s*\{{([^{{}}]+)\}}", css_source)
        assert match is not None, selector
        assert "var(--oat-icon-" in match.group(1), selector
    catalog = read(CATALOG_PATH)
    assert 'class="oat-button oat-button--icon"' in catalog
    assert 'aria-label="Locate transmitter"' in catalog
    assert 'class="oat-icon"' in catalog and 'aria-hidden="true"' in catalog


def test_contract_only_feature_uses_public_component_classes() -> None:
    source = read(CATALOG_PATH)
    collector = FeatureClassCollector()
    collector.feed(source)
    assert collector.class_values
    assert all(name.startswith("oat-") for name in collector.class_values)
    for required in (
        "oat-panel__header", "oat-field", "oat-input", "oat-button-group",
        "oat-button", "oat-metric-grid", "oat-list-card", "oat-scroll-region",
    ):
        assert required in collector.class_values


def test_catalog_is_development_only() -> None:
    server_source = read(PROJECT_ROOT / "backend" / "server.py")
    assert "ui-catalog" not in server_source
    assert "serve_ui_catalog" not in server_source
    assert (PROJECT_ROOT / "tools" / "serve_ui_catalog.py").is_file()
