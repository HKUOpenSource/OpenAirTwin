from __future__ import annotations

import json
from pathlib import Path
import re


PROJECT_ROOT = Path(__file__).resolve().parents[1]
PHASE0_DOM = PROJECT_ROOT / "tests" / "browser" / "baselines" / "phase-0-dom-contract.json"
PHASE1_DOM = PROJECT_ROOT / "docs" / "ui" / "dom-compatibility-contract.json"
UI_DOC_ROOT = PROJECT_ROOT / "docs" / "ui"
JS_ROOT = PROJECT_ROOT / "backend" / "static" / "js"
PHASE8_RETIRED_ELEMENT_IDS = {
    "featureModeMenuAnchor",
    "featureParameterAnchor",
    "featurePanelAnchor",
    "featureDeviceCardAnchor",
    "featureDeviceActionAnchor",
}
PHASE8_RETIRED_CLASSES = {
    "btn",
    "danger",
    "miniBtn",
    "miniSelect",
    "oat-button--legacy-native-font",
    "primary",
}


def load_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def test_phase1_dom_contract_is_a_complete_enrichment_of_phase0() -> None:
    phase0 = load_json(PHASE0_DOM)
    phase1 = load_json(PHASE1_DOM)
    assert phase1["schemaVersion"] == 2
    assert phase1["generatedBy"] == "tests/browser/feature_modes.spec.js"
    assert phase1["baseline"] == "tests/browser/baselines/phase-0-dom-contract.json"
    assert phase1["document"] == phase0["document"]

    assert set(phase1["baselineTransform"]["retiredElementIds"]) == PHASE8_RETIRED_ELEMENT_IDS
    assert set(phase1["baselineTransform"]["retiredClasses"]) == PHASE8_RETIRED_CLASSES

    phase0_elements = []
    for baseline in phase0["elements"]:
        if baseline["id"] in PHASE8_RETIRED_ELEMENT_IDS:
            continue
        normalized = dict(baseline)
        normalized["order"] = len(phase0_elements)
        normalized["classes"] = [
            name for name in baseline["classes"] if name not in PHASE8_RETIRED_CLASSES
        ]
        phase0_elements.append(normalized)

    phase0_by_id = {element["id"]: element for element in phase0_elements}
    phase1_by_id = {element["id"]: element for element in phase1["elements"]}
    assert len(phase0_by_id) == len(phase0_elements)
    assert len(phase1_by_id) == len(phase1["elements"])
    assert phase1_by_id.keys() == phase0_by_id.keys()

    for element_id, baseline in phase0_by_id.items():
        contracted = phase1_by_id[element_id]
        for key, value in baseline.items():
            if key != "classes":
                assert contracted[key] == value
        baseline_classes = baseline["classes"]
        contracted_classes = contracted["classes"]
        assert [name for name in contracted_classes if name in baseline_classes] == baseline_classes
        assert all(name.startswith("oat-") for name in contracted_classes if name not in baseline_classes)
        assert contracted["owner"] in phase1["owners"]
        assert contracted["compatibility"] == "required"

    assert all(
        name not in PHASE8_RETIRED_CLASSES
        for element in phase1["elements"]
        for name in element["classes"]
    )


def test_every_initial_user_control_has_a_named_command() -> None:
    contract = load_json(PHASE1_DOM)
    interactive_tags = {"button", "details", "input", "select", "summary", "textarea"}
    controls = [element for element in contract["elements"] if element["tag"] in interactive_tags]
    assert len(controls) == 197
    assert all(re.fullmatch(r"[a-z][A-Za-z0-9]*(?:\.[a-z][A-Za-z0-9]*)+", item["interaction"]["command"])
               for item in controls)
    assert all(item["interaction"]["events"] for item in controls)

    dynamic = contract["dynamicInteractions"]
    assert len(dynamic) >= 19
    assert all(item["owner"] in contract["owners"] for item in dynamic)
    assert all(item["command"] and item["events"] and item["selector"] for item in dynamic)


def test_component_contract_covers_every_repeated_production_pattern() -> None:
    source = (UI_DOC_ROOT / "component-contracts.md").read_text(encoding="utf-8")
    required_components = {
        "Button", "IconButton", "ButtonGroup", "Field", "NumberField", "TextField",
        "SelectField", "UnitInput", "Checkbox", "RadioGroup", "RangeInput", "Panel",
        "PanelHeader", "CollapsibleGroup", "ScrollRegion", "Badge", "StatusBadge",
        "Progress", "MetricGrid", "Metric", "ListCard", "EmptyState", "Dialog",
        "Tooltip", "LoadingOverlay", "ChartFrame", "DeviceDock", "ResultDock",
        "PerformanceDock", "ModeSelector",
    }
    assert all(f"`{component}`" in source for component in required_components)
    for feature in ("Link", "Mobility", "Radio Map", "DeepMIMO", "Radar"):
        assert feature in source
    for state in ("hover", "focus-visible", "disabled", "busy", "invalid", "selected", "empty"):
        assert state in source


def test_typed_feature_and_ui_contract_surface_is_present() -> None:
    source = (JS_ROOT / "core" / "ui_contracts.d.ts").read_text(encoding="utf-8")
    for declaration in (
        "FeatureDefinition", "FeatureInstance", "UiRef", "UiViewModel", "UiCommand",
        "FeatureLifecycle", "FeatureFactoryContext", "FeatureRefContext",
        "FeatureUiContract", "PickingTargetDefinition",
    ):
        assert re.search(rf"\b(?:interface|type)\s+{declaration}\b", source)
    for lifecycle in ("attachEvents", "activate", "deactivate", "render", "onSettingsChanged", "dispose"):
        assert lifecycle in source
    for factory in (
        "createState", "createRefs", "queryDom", "createTransport", "createResultView",
        "createController", "createRenderer", "createFeature",
    ):
        assert factory in source


def _matching_js_files(pattern: re.Pattern[str]) -> list[str]:
    matches = []
    for path in sorted(JS_ROOT.rglob("*.js")):
        if path.name == "radar-demo.js":
            continue
        if pattern.search(path.read_text(encoding="utf-8")):
            matches.append(path.relative_to(PROJECT_ROOT).as_posix())
    return matches


def test_imperative_dom_and_inline_styles_are_closed_allowlists() -> None:
    exceptions = load_json(UI_DOC_ROOT / "imperative-ui-exceptions.json")
    imperative_pattern = re.compile(
        r"\b(?:document\.(?:createElement|getElementById|querySelector|querySelectorAll)"
        r"|\.innerHTML\b|insertAdjacentHTML|replaceChildren\b)"
    )
    inline_style_pattern = re.compile(r"\.style\.(?:setProperty|removeProperty|[A-Za-z]+\s*=)|setAttribute\(\"style\"")
    assert _matching_js_files(imperative_pattern) == exceptions["imperativeDomFiles"]
    assert _matching_js_files(inline_style_pattern) == exceptions["inlineRuntimeStyleFiles"]

    runtime_properties: set[str] = set()
    property_pattern = re.compile(r'style\.setProperty\("(--[a-z0-9-]+)"')
    for path in JS_ROOT.rglob("*.js"):
        if path.name != "radar-demo.js":
            runtime_properties.update(property_pattern.findall(path.read_text(encoding="utf-8")))
    assert sorted(runtime_properties) == exceptions["runtimeCustomProperties"]


def test_phase1_adrs_are_accepted_and_development_guide_links_contracts() -> None:
    for name in (
        "0001-react-typescript-vite-workbench.md",
        "0002-internal-ui-components-without-styled-framework.md",
    ):
        source = (PROJECT_ROOT / "docs" / "adr" / name).read_text(encoding="utf-8")
        assert "- 状态：已接受" in source
        assert "## 决策" in source
        assert "## 后果" in source

    development = (PROJECT_ROOT / "docs" / "development.md").read_text(encoding="utf-8")
    for target in (
        "ui/component-contracts.md",
        "ui/interaction-contracts.md",
        "ui/dom-compatibility-contract.json",
        "ui/imperative-ui-exceptions.md",
    ):
        assert target in development
