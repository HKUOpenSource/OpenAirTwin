from __future__ import annotations

from pathlib import Path
import re
import unittest


PROJECT_ROOT = Path(__file__).resolve().parents[1]
STATIC_JS_ROOT = PROJECT_ROOT / "backend" / "static" / "js"
STATIC_HTML = PROJECT_ROOT / "backend" / "static" / "index.html"
STATIC_CSS_ROOT = PROJECT_ROOT / "backend" / "static" / "css"
APP_CSS_FILES = (
    "tokens.css",
    "base.css",
    "components.css",
    "shell.css",
    "entry-map.css",
    "results.css",
    "radar.css",
)


def read_static_js(name: str) -> str:
    return (STATIC_JS_ROOT / name).read_text(encoding="utf-8")


def read_frontend_js_modules() -> str:
    modules: list[str] = []
    for path in sorted(STATIC_JS_ROOT.rglob("*.js")):
        if "lib" in path.relative_to(STATIC_JS_ROOT).parts:
            continue
        relative = path.relative_to(PROJECT_ROOT).as_posix()
        modules.append(f"\n/* {relative} */\n{path.read_text(encoding='utf-8')}")
    return "\n".join(modules)


def read_static_css(name: str) -> str:
    return (STATIC_CSS_ROOT / name).read_text(encoding="utf-8")


def read_app_css() -> str:
    return "\n".join(read_static_css(name) for name in APP_CSS_FILES)


def css_rule_body(source: str, selector: str) -> str:
    match = re.search(rf"(?:^|\n)\s*{re.escape(selector)}\s*\{{([^{{}}]*)\}}", source)
    if match is None:
        raise AssertionError(f"Missing CSS selector: {selector}")
    return match.group(1)


def read_static_html() -> str:
    return STATIC_HTML.read_text(encoding="utf-8")


def exported_controller_methods(source: str, factory_name: str) -> set[str]:
    factory_start = source.index(f"export function {factory_name}")
    body_start = source.index("{", factory_start)
    body_end = find_matching_brace(source, body_start)
    body = source[body_start + 1:body_end]

    depth = 0
    return_object_start = -1
    index = 0
    while index < len(body):
        char = body[index]
        if char in ("'", '"', "`"):
            index = skip_js_string(body, index)
            continue
        if body.startswith("//", index):
            newline = body.find("\n", index)
            index = len(body) if newline == -1 else newline + 1
            continue
        if body.startswith("/*", index):
            end = body.find("*/", index + 2)
            index = len(body) if end == -1 else end + 2
            continue
        if char == "{":
            depth += 1
        elif char == "}":
            depth -= 1
        elif depth == 0 and body.startswith("return", index):
            before = body[index - 1] if index > 0 else " "
            after = body[index + len("return")] if index + len("return") < len(body) else " "
            if not (before.isidentifier() or before == "_") and not (after.isidentifier() or after == "_"):
                candidate = index + len("return")
                while candidate < len(body) and body[candidate].isspace():
                    candidate += 1
                if candidate < len(body) and body[candidate] == "{":
                    return_object_start = candidate
        index += 1

    if return_object_start == -1:
        raise AssertionError(f"{factory_name} has no top-level return object")
    return_object_end = find_matching_brace(body, return_object_start)
    return_object = body[return_object_start + 1:return_object_end]
    return {
        match.group(1)
        for match in re.finditer(r"^\s*([A-Za-z_$][\w$]*)\s*(?::|,)\s*$", return_object, re.MULTILINE)
    }


def find_matching_brace(source: str, open_index: int) -> int:
    depth = 0
    index = open_index
    while index < len(source):
        char = source[index]
        if char in ("'", '"', "`"):
            index = skip_js_string(source, index)
            continue
        if source.startswith("//", index):
            newline = source.find("\n", index)
            index = len(source) if newline == -1 else newline + 1
            continue
        if source.startswith("/*", index):
            end = source.find("*/", index + 2)
            index = len(source) if end == -1 else end + 2
            continue
        if char == "{":
            depth += 1
        elif char == "}":
            depth -= 1
            if depth == 0:
                return index
        index += 1
    raise AssertionError("No matching brace found")


def skip_js_string(source: str, quote_index: int) -> int:
    quote = source[quote_index]
    index = quote_index + 1
    while index < len(source):
        char = source[index]
        if char == "\\":
            index += 2
            continue
        if char == quote:
            return index + 1
        index += 1
    return len(source)


class FrontendRegressionTests(unittest.TestCase):
    def test_core_css_architecture_uses_ordered_layers_and_tokens(self) -> None:
        html = read_static_html()
        loaded_css = re.findall(r'href="/css/([^?\"]+)', html)

        self.assertEqual(loaded_css, list(APP_CSS_FILES))
        self.assertFalse((STATIC_CSS_ROOT / "app.css").exists())
        self.assertIn(
            "@layer reset, tokens, base, components, layout, features, utilities;",
            read_static_css("tokens.css"),
        )
        for name in APP_CSS_FILES:
            self.assertIn("@layer", read_static_css(name), name)
        for name in APP_CSS_FILES[1:]:
            source = read_static_css(name)
            self.assertIsNone(re.search(r"#[0-9a-fA-F]{3,8}\b|rgba?\(", source), name)
            self.assertNotIn("max-width:720px", source, name)
            self.assertNotIn("max-width: 720px", source, name)
            self.assertNotIn("-var(", source, name)
        important_uses = re.findall(r"[^{}]+\{[^{}]*!important[^{}]*\}", read_app_css())
        self.assertEqual(len(important_uses), 1)
        self.assertTrue(important_uses[0].lstrip().startswith(".hidden"))
        components = read_static_css("components.css")
        for selector in (
            ".oat-panel", ":where(.oat-button:not(.oat-button--compact),.btn)", ".oat-field", ".oat-input", ".oat-check",
            ".oat-badge", ".oat-metric-grid", ".oat-list-card", ".oat-scroll-region",
        ):
            css_rule_body(components, selector)

        theme_source = read_static_js("ui/theme_tokens.js")
        radar_charts = read_static_js("features/radar/charts.js")
        entry_map = read_static_js("entry_map.js")
        self.assertIn("export function readUiToken(tokenName)", theme_source)
        self.assertIn('readUiToken("--oat-canvas-background")', radar_charts)
        self.assertIn('readUiToken("--oat-canvas-grid")', radar_charts)
        self.assertNotIn('context.fillStyle = "#f7f9fc"', radar_charts)
        self.assertNotIn("entrySearchHint.style.color", entry_map)
        self.assertIn('entrySearchHint.classList.toggle("is-error", isError)', entry_map)

    def test_controller_factory_public_facades_remain_stable(self) -> None:
        solver_methods = exported_controller_methods(
            read_static_js("solver_controls.js"),
            "createSolverControlsController",
        )
        scene_methods = exported_controller_methods(
            read_static_js("scene_render_state.js"),
            "createSceneRenderStateController",
        )

        self.assertEqual(
            solver_methods,
            {
                "applyRtCapabilities",
                "commonSolverConfig",
                "linkSolverConfig",
                "linkChannelConfig",
                "syncNumericInputs",
                "syncViewerMarkers",
                "syncModeVisuals",
                "markerRadiusForPickTarget",
                "readAntennaArrayInputs",
                "readLinkInputs",
                "readSurfaceClearanceInput",
                "readLivePreviewInputs",
                "readMobilityInputs",
                "readRadiomapInputs",
                "invalidateLinkResult",
                "invalidateRadarResult",
                "invalidateRadiomapResult",
                "invalidateMobilityResult",
                "invalidateDeepMimoResult",
                "readDeepMimoInputs",
                "rerenderRadiomapOverlay",
                "renderMobilityTrajectoryPreview",
                "renderDeepMimoState",
                "runLinkSolve",
                "runMobility",
                "runRadiomap",
                "runDeepMimo",
                "setDeepMimoRoiCorner",
                "startDeepMimoRoiDrag",
                "updateDeepMimoRoiDrag",
                "finishDeepMimoRoiDrag",
                "clearDeepMimoRoi",
                "addCurrentRxWaypoint",
                "deleteMobilityWaypoint",
                "resetMobilityTrajectoryFromRx",
                "cancelLivePreview",
                "handleLivePreviewDeviceUpdate",
                "applyPick",
            },
        )
        self.assertEqual(
            scene_methods,
            {
                "setProgress",
                "showOverlay",
                "hideOverlay",
                "ensureViewer",
                "syncControlSidebarUi",
                "syncResultDockUi",
                "syncModeUi",
                "renderAll",
                "tileSelections",
                "tileDiff",
                "syncTileListUi",
                "populateTileList",
                "setTileSelection",
                "resetSelectionToLoadedTiles",
                "setTileChecked",
                "toggleTileChecked",
                "enterScene",
                "loadScene",
            },
        )

    def test_dom_refs_get_element_by_id_targets_exist_in_index_html(self) -> None:
        dom_source = read_static_js("dom_refs.js")
        html = read_static_html()

        referenced_ids = set(re.findall(r'document\.getElementById\(["\']([^"\']+)["\']\)', dom_source))
        html_ids = set(re.findall(r'\bid=["\']([^"\']+)["\']', html))

        self.assertTrue(referenced_ids)
        self.assertFalse(
            sorted(referenced_ids - html_ids),
            "dom_refs.js references DOM ids missing from backend/static/index.html",
        )

    def test_app_dialog_controller_replaces_native_browser_popups(self) -> None:
        frontend_source = read_frontend_js_modules()
        app_source = read_static_js("app.js")
        entry_source = read_static_js("entry_map.js")
        dialog_source = read_static_js("controllers/app_dialog_controller.js")
        dom_source = read_static_js("dom_refs.js")
        html = read_static_html()

        for native_call in ["window.alert(", "window.confirm(", "window.prompt("]:
            self.assertNotIn(native_call, frontend_source)

        for element_id in [
            "appDialog",
            "appDialogCard",
            "appDialogTitle",
            "appDialogMessage",
            "appDialogDetail",
            "appDialogPrimary",
            "appDialogSecondary",
            "appDialogClose",
        ]:
            self.assertIn(f'id="{element_id}"', html)
            self.assertIn(f'document.getElementById("{element_id}")', dom_source)

        self.assertIn("createAppDialogController(context)", app_source)
        self.assertIn("context.controllers.dialogs = dialogController;", app_source)
        self.assertIn("dialogController.alert({", app_source)
        for title in [
            '"Startup Failed"',
            '"Enter Scene Failed"',
            '"Link Solve Failed"',
            '"Radiomap Failed"',
            '"Mobility Failed"',
            '"DeepMIMO Export Failed"',
        ]:
            self.assertIn(title, frontend_source)
        self.assertIn("context.utilities.showErrorDialog", frontend_source)

        self.assertIn("const confirmed = await dialogs().confirm({", entry_source)
        self.assertIn('title: "Download Tile"', entry_source)
        self.assertIn('confirmLabel: "Download"', entry_source)
        self.assertIn("await dialogs().alert({", entry_source)
        self.assertIn('title: "Tile Download Failed"', entry_source)

        self.assertIn("const queue = [];", dialog_source)
        self.assertIn("document.addEventListener(\"keydown\", handleGlobalKeydown, true);", dialog_source)
        self.assertIn("restoreFocus();", dialog_source)
        self.assertIn('class="appDialogBackdrop"', html)

    def test_viewer_ref_stub_exposes_controller_viewer_contract(self) -> None:
        source = read_static_js("app_state.js")
        stub_source = source[
            source.index("function createViewerStub()"):
            source.index("export const DEFAULT_PERFORMANCE_MODE")
        ]

        for property_name in ["__ready", "loadedTileIds", "meshesLoaded", "txMarkerRadius", "rxMarkerRadius"]:
            self.assertRegex(stub_source, rf"\b{property_name}\s*:")
        for method_name in [
            "setTx",
            "setRx",
            "renderRadiomap",
            "renderDeepMimoRoi",
            "clearDeepMimoRoi",
            "renderPaths",
            "clearOverlay",
            "clearPaths",
            "clearMobility",
            "startTxOrbit",
            "stopTxOrbit",
            "isTxOrbiting",
            "subscribeFrame",
            "clearRadiomap",
            "clearSurfacePreview",
            "renderMobilityTrajectory",
            "focusOnTiles",
            "getLoadedCategoryStats",
            "getPerformanceStats",
            "setCategoryVisible",
            "setLightweightMaterials",
            "setPerformanceMode",
            "syncBundles",
            "resetView",
            "pickOnSurface",
        ]:
            self.assertRegex(stub_source, rf"\b(?:async\s+)?{method_name}\s*\(")

    def test_entry_search_focus_does_not_reset_selection_badge(self) -> None:
        source = read_static_js("entry_map.js")

        self.assertNotIn("updateEntryMapBadge(tileId)", source)
        self.assertIn("syncEntryOverviewUi();", source)
        self.assertIn("Click the tile on the map to select it.", source)
        self.assertIn("Click the tile on the map to download it.", source)

    def test_loaded_tile_status_requires_all_tile_bundles(self) -> None:
        source = read_static_js("viewer.js")

        self.assertIn("this.tileBundleCounts = new Map();", source)
        self.assertIn("this.tileExpectedBundleCounts = new Map();", source)
        self.assertIn("loadedCount === expectedCount", source)
        self.assertNotIn("loadedTileIds.add(bundle.tile)", source)

    def test_city_model_uses_category_palette_for_natural_materials(self) -> None:
        source = read_static_js("viewer.js")
        expected_category_colors = {
            "BUILDING": "#d8d2c4",
            "INFRASTRUCTURE": "#50565c",
            "INFRASTRUCTURE_TB": "#50565c",
            "GENERIC": "#8c8981",
            "TERRAIN_TB": "#8c8981",
            "VEGETATION_TB": "#557b5c",
            "WATERBODY": "#245766",
        }

        self.assertIn("const CATEGORY_MATERIAL_STYLES = {", source)
        for category, color in expected_category_colors.items():
            self.assertIn(f"{category}: {{", source)
            self.assertIn(f'color: "{color}"', source)
        self.assertIn("CATEGORY_MATERIAL_STYLES[bundle.category]", source)
        self.assertIn("const MATERIAL_FALLBACK_COLORS = {", source)
        self.assertIn("function colorForBundle(bundle)", source)
        self.assertIn("hashString(bundle.bundle_id", source)
        self.assertIn("lightnessVariation", source)
        self.assertIn("saturationVariation", source)
        generic_style = source.split("GENERIC: {", 1)[1].split("TERRAIN_TB:", 1)[0]
        terrain_style = source.split("TERRAIN_TB: {", 1)[1].split("VEGETATION_TB:", 1)[0]
        self.assertNotIn("lightnessVariation", generic_style)
        self.assertNotIn("saturationVariation", generic_style)
        self.assertNotIn("lightnessVariation", terrain_style)
        self.assertNotIn("saturationVariation", terrain_style)
        self.assertIn('transparent: true', source)
        self.assertIn('opacity: 0.84', source)
        self.assertIn('Boolean(style.transparent) || bundle.bsdf_id === "itu_wet_ground"', source)
        self.assertIn("new THREE.HemisphereLight", source)
        self.assertIn("new THREE.DirectionalLight(0xdbe5f7, 0.42)", source)
        self.assertIn("toneMappingExposure = 1.08", source)
        self.assertIn("roughness: style.roughness ?? 0.88", source)
        self.assertIn("metalness: style.metalness ?? 0.0", source)
        self.assertNotIn("MATERIAL_COLORS[mesh.bsdf_id]", source)

    def test_viewer_clamps_camera_and_target_above_ground(self) -> None:
        source = read_static_js("viewer.js")
        orbit_source = (PROJECT_ROOT / "backend" / "static" / "lib" / "OrbitControls.js").read_text(encoding="utf-8")

        self.assertIn("const VIEW_GROUND_Z = 0;", source)
        self.assertIn("const VIEW_CAMERA_MIN_CLEARANCE_M = 2.0;", source)
        self.assertIn("const VIEW_TARGET_MIN_Z = 0;", source)
        self.assertIn("#clampViewAboveGround({preserveOffset = false} = {})", source)
        self.assertIn("const minCameraZ = VIEW_GROUND_Z + VIEW_CAMERA_MIN_CLEARANCE_M;", source)
        self.assertIn("this.controls.target.z = VIEW_TARGET_MIN_Z;", source)
        self.assertIn("this.camera.position.z = minCameraZ;", source)
        self.assertIn("this.#clampViewAboveGround({preserveOffset: true});", source)
        self.assertGreaterEqual(source.count("this.#clampViewAboveGround();"), 6)
        self.assertNotIn("#clampViewAboveGround", orbit_source)
        self.assertNotIn("VIEW_CAMERA_MIN_CLEARANCE_M", orbit_source)

    def test_viewer_uses_tighter_depth_range_and_layer_bias(self) -> None:
        source = read_frontend_js_modules()

        self.assertIn("const CAMERA_NEAR_MIN = 0.3;", source)
        self.assertIn("const CAMERA_NEAR_MAX = 20;", source)
        self.assertIn("const CAMERA_FAR_MIN = 2500;", source)
        self.assertIn("const CAMERA_FAR_SCENE_PADDING = 3.5;", source)
        self.assertIn("const CAMERA_FAR_EXTRA_MARGIN = 500;", source)
        self.assertNotIn("CAMERA_FAR_MULTIPLIER", source)
        self.assertIn("this.modelBounds = new THREE.Box3();", source)
        self.assertIn("this.modelBoundsDirty = true;", source)
        self.assertIn("#currentModelBounds()", source)
        self.assertIn("modelBounds.getBoundingSphere(new THREE.Sphere())", source)
        self.assertIn("this.#markModelBoundsDirty();", source)
        self.assertIn("const targetNear = THREE.MathUtils.clamp(orbitDistance / 1000", source)
        self.assertIn("polygonOffsetFactor: 8", source)
        self.assertGreaterEqual(source.count("polygonOffsetFactor: -2"), 4)
        self.assertGreaterEqual(source.count("polygonOffsetFactor: -1"), 3)

    def test_viewer_can_render_terrain_as_background_depth_layer(self) -> None:
        source = read_static_js("viewer.js")

        self.assertIn("TERRAIN_TB: {\n    renderOrder: 0,\n    polygonOffsetFactor: 8,\n    polygonOffsetUnits: 8,\n    depthWrite: false,\n    depthTest: true,", source)
        self.assertIn("const layer = displayLayerForBundle(bundle);", source)
        self.assertIn("depthWrite: layer.depthWrite", source)
        self.assertIn("depthTest: layer.depthTest ?? true", source)
        self.assertNotIn("depthWrite: transparent ? layer.depthWrite : true", source)
        self.assertNotIn("readViewerRenderOptions", source)
        self.assertNotIn("terrainDepthWrite", source)
        self.assertNotIn("terrainDepthTest", source)
        self.assertNotIn("terrainOffsetFactor", source)
        self.assertNotIn("logarithmicDepthBuffer", source)

    def test_bundle_progress_totals_are_updated_from_runtime_headers(self) -> None:
        source = read_static_js("viewer.js")

        self.assertIn("const bundleTransferSizeById = new Map();", source)
        self.assertIn("const unresolvedBundleIds = new Set();", source)
        self.assertIn("const updateBundleSizeHints = (bundle, event = {}, fallbackLoadedBytes = null) => {", source)
        self.assertIn("positiveSizeBytes(event.totalBytes) || positiveSizeBytes(fallbackLoadedBytes)", source)
        self.assertIn("totalBytes: totalTransferBytes(),", source)
        self.assertIn("hasUnknownBytes: unresolvedBundleIds.size > 0", source)
        self.assertNotIn("const knownTotalBytes", source)

    def test_loading_progress_message_avoids_unknown_size_copy(self) -> None:
        source = read_frontend_js_modules()

        self.assertIn("function resolvingSizeSummary(event)", source)
        self.assertIn('" · resolving sizes"', source)
        self.assertIn("`${formatBytes(event.downloadedBytes)} downloaded${resolvingSizeSummary(event)}`", source)
        self.assertNotIn(" / unknown", source)
        self.assertNotIn("+ unknown", source)

    def test_tile_downloads_are_globally_gated_during_active_download(self) -> None:
        source = read_static_js("entry_map.js")

        self.assertIn("function selectEntryMapTile(tileId)", source)
        self.assertIn("async function downloadEntryMapTile(tileId)", source)
        self.assertGreaterEqual(source.count("state.entry.downloadingTileIds.size > 0"), 2)
        self.assertIn(
            'setEntrySearchHint("Finish or cancel the current tile download before starting another.", true);',
            source,
        )

    def test_entry_map_opens_for_empty_manifest_to_download_first_tile(self) -> None:
        source = read_static_js("entry_map.js")
        app_source = read_static_js("app.js")

        self.assertNotIn("if (!availableTileIds.length) {\n    return null;\n  }", source)
        self.assertIn("primaryRegion: regions[0] || null", source)
        self.assertIn("Click the tile on the map to download it.", source)
        self.assertIn("if (state.entry.overview) {\n    entryMapController.showEntryScreen();", app_source)

    def test_entry_map_uses_open3dhk_coverage_for_clickable_download_tiles(self) -> None:
        source = read_static_js("entry_map.js")
        api_source = read_static_js("api.js")
        app_source = read_static_js("app.js")
        html = (PROJECT_ROOT / "backend" / "static" / "index.html").read_text(encoding="utf-8")

        self.assertIn('requestJson("/assets/open3dhk_tile_coverage.json")', api_source)
        self.assertIn("state.entry.coverage = await getOpen3dHkTileCoverage();", app_source)
        self.assertIn("buildEntryOverview(state.manifest, state.entry.coverage)", app_source)
        self.assertIn("const coverageById = new Map();", source)
        self.assertIn("...overview.coverageById.keys()", source)
        self.assertIn("...overview.tileById.keys()", source)
        self.assertNotIn("allEntryTileIds()", source)
        self.assertNotIn("createEntryGridCanvasLayer", source)
        self.assertNotIn("entryGridPane", source)
        self.assertIn("Open3DHK has no downloadable tile at that point.", source)
        self.assertIn("outside the Open3DHK downloadable coverage", source)
        self.assertIn("Downloadable from Open3DHK", source)
        self.assertIn("Available", html)
        self.assertIn("Downloadable", html)

    def test_rt_capabilities_are_loaded_for_antenna_arrays(self) -> None:
        api_source = read_static_js("api.js")
        app_source = read_static_js("app.js")
        state_source = read_frontend_js_modules()

        self.assertIn('requestJson("/api/rt/capabilities")', api_source)
        self.assertIn("state.rtCapabilities = await getRtCapabilities();", app_source)
        self.assertIn("solverControls.applyRtCapabilities(state.rtCapabilities);", app_source)
        self.assertIn("txArray: createDefaultAntennaArray()", state_source)
        self.assertIn("rxArray: createDefaultAntennaArray()", state_source)

    def test_rt_scene_selection_is_synced_after_tile_load(self) -> None:
        api_source = read_static_js("api.js")
        source = read_frontend_js_modules()

        self.assertIn('requestJson("/api/rt/scene-selection")', api_source)
        self.assertIn('requestJson("/api/rt/scene-selection", {', api_source)
        self.assertIn("getRtSceneSelection,", source)
        self.assertIn("setRtSceneSelection,", source)
        self.assertIn("async function waitForRtSceneSelection(generation, tileIds)", source)
        self.assertIn("async function syncRtSceneSelection(selectedTileIds)", source)
        self.assertIn('message: "Load scene..."', source)
        self.assertIn("const status = await api.setRtSceneSelection(tileIds);", source)
        self.assertIn("return waitForRtSceneSelection(status.generation, tileIds);", source)
        self.assertIn("await syncRtSceneSelection(selectedTiles);", source)
        self.assertIn("state.tileLoadBusy = true;", source)
        self.assertRegex(source, r"if \(state\.tileLoadBusy\) \{\s+return;\s+\}")
        self.assertRegex(source, r"const selectedTileIds = .*tileSelections\(\);")
        self.assertIn("solver().invalidateMobilityResult({clearOverlay: false, clearPaths: false});", source)
        self.assertIn("rtSceneReadyForSelection(status, tileIds)", source)

    def test_scene_mode_selector_replaces_low_value_stats(self) -> None:
        html = (PROJECT_ROOT / "backend" / "static" / "index.html").read_text(encoding="utf-8")
        css_source = read_app_css()
        app_source = read_frontend_js_modules()
        dom_source = read_static_js("dom_refs.js")
        scene_source = read_frontend_js_modules()

        self.assertNotIn('id="stSceneMeshes"', html)
        self.assertNotIn('id="stLoadedMeshes"', html)
        self.assertNotIn('id="stLoadedTiles"', html)
        self.assertNotIn('id="stMode"', html)
        self.assertIn('<details class="paramGroup modeSelector" id="modeSelector">', html)
        self.assertIn('id="modeSelectButton" aria-haspopup="listbox" aria-expanded="false" aria-controls="modeMenu"', html)
        self.assertIn('id="modeMenu" role="listbox" aria-label="Analysis mode"', html)
        self.assertIn('id="modeSelectTitle">Mode (Link Analysis)</span>', html)
        self.assertNotIn('id="modeSelectDescription"', html)
        self.assertNotIn("modeSelectEyebrow", html)
        self.assertNotIn("modeMenuDescription", html)
        self.assertIn('id="tabLink" type="button" role="option" aria-selected="true"', html)
        self.assertIn('id="tabMobility" type="button" role="option" aria-selected="false"', html)
        self.assertIn('id="tabRadiomap" type="button" role="option" aria-selected="false"', html)
        self.assertIn('id="tabDeepMimo" type="button" role="option" aria-selected="false"', html)
        self.assertIn('<span class="modeMenuTitle">Link Analysis</span>', html)
        self.assertIn('<span class="modeMenuTitle">Mobility Analysis</span>', html)
        self.assertIn(".modeSelector", css_source)
        self.assertIn("margin:", css_rule_body(css_source, ".modeSelector"))
        self.assertIn("width:100%", css_rule_body(css_source, ".modeSelectButton"))
        self.assertIn(".modeMenuDot", css_source)
        self.assertIn(".modeMenuItem.active", css_source)
        self.assertIn('modeSelector: document.getElementById("modeSelector")', dom_source)
        self.assertIn('modeSelectButton: document.getElementById("modeSelectButton")', dom_source)
        self.assertIn('modeMenu: document.getElementById("modeMenu")', dom_source)
        self.assertNotIn("modeSelectDescription", dom_source)
        self.assertNotIn("stSceneMeshes", dom_source)
        self.assertNotIn("syncSceneStats", scene_source)
        self.assertIn('ui.modeSelectTitle.textContent = `Mode (${activeFeature.title})`;', scene_source)
        self.assertIn("const activeFeature = features.get(state.mode) || definitions[0];", scene_source)
        self.assertNotIn("activeFeature.description", scene_source)
        self.assertIn('ui.modeSelector.addEventListener("toggle"', app_source)
        self.assertIn("ui.modeSelector.open = open;", app_source)
        self.assertIn('event.key === "Escape"', app_source)

    def test_research_parameters_are_collapsible_without_outer_card(self) -> None:
        html = (PROJECT_ROOT / "backend" / "static" / "index.html").read_text(encoding="utf-8")
        css_source = read_app_css()

        self.assertNotIn("Research Parameters", html)
        self.assertNotIn("paramGroupTitle", html)
        self.assertIn('<details class="paramGroup" open>', html)
        self.assertIn('<summary class="paramGroupSummary">Physical Layer</summary>', html)
        self.assertIn('<summary class="paramGroupSummary">Antenna Arrays</summary>', html)
        self.assertNotIn('<summary class="paramGroupSummary">Propagation</summary>', html)
        self.assertNotIn('<summary class="paramGroupSummary">Solver Budget</summary>', html)
        self.assertEqual(
            html.count('<summary class="paramGroupSummary" tabindex="0">Propagation Solver</summary>'),
            1,
        )
        self.assertIn('<details class="paramGroup propagationSolverGroup">', html)
        propagation_solver = html.split(
            '<details class="paramGroup propagationSolverGroup">',
            1,
        )[1].split("</details>", 1)[0]
        self.assertLess(
            propagation_solver.index('id="linkSamplesPerSrc"'),
            propagation_solver.index('id="cfgLos"'),
        )
        self.assertLess(
            propagation_solver.index('id="cfgSeed"'),
            propagation_solver.index('id="cfgLos"'),
        )
        self.assertIn('<details class="paramGroup linkOnlyParam">', html)
        self.assertIn('<details class="paramGroup radiomapOnlyParam hidden">', html)
        self.assertIn('<details class="paramGroup deepmimoOnlyParam hidden">', html)
        self.assertIn('id="cfgFrequency"', html)
        self.assertIn('id="txArrayPattern"', html)
        self.assertIn('id="linkMaxNumPaths"', html)
        self.assertNotIn("Compute CIR / Taps", html)
        self.assertIn("Compute Channel Impulse Response (CIR)", html)
        self.assertIn('aria-label="Compute CIR details"', html)
        self.assertIn("Requests compact channel-tap summaries after path solving.", html)
        self.assertIn("right-side Power Delay Profile section.", html)
        solver_css = css_rule_body(css_source, ".solverCfg")
        for property_name in ("margin-top:", "padding:", "border:", "border-radius:", "background:"):
            self.assertIn(property_name, solver_css)
        self.assertIn(".paramGroupSummary::after", css_source)
        self.assertIn(".paramGroup[open] > .paramGroupBody", css_source)
        self.assertEqual(
            re.findall(r'href="/css/([^?\"]+)', html),
            list(APP_CSS_FILES),
        )
        self.assertIn("margin-top:", css_rule_body(css_source, ".propagationSolverGroup .paramGrid + .paramCheckGrid"))
        ui_body_css = css_rule_body(css_source, "#uiBody")
        for property_name in ("min-height:", "overflow-y:", "overflow-x:", "padding-right:", "margin-right:", "scrollbar-gutter:"):
            self.assertIn(property_name, ui_body_css)
        self.assertIn("width:", css_rule_body(css_source, "#uiBody::-webkit-scrollbar"))
        self.assertIn("background-clip:content-box", css_source)
        self.assertIn('src="/js/app.js"', html)

    def test_radar_derived_metric_labels_use_consistent_two_line_titles(self) -> None:
        radar_source = read_static_html()
        self.assertIn("<span>Range<br/>Resolution</span>", radar_source)
        self.assertIn("<span>Doppler<br/>Resolution</span>", radar_source)
        self.assertIn("<span>Velocity<br/>Resolution</span>", radar_source)

    def test_radar_checkboxes_use_the_shared_card_geometry(self) -> None:
        radar_source = read_static_html()
        css_source = read_app_css()
        radar_check_css = css_rule_body(css_source, ".radarCheck")
        radar_input_css = css_rule_body(css_source, ".radarCheck>input")

        self.assertEqual(len(re.findall(r'class="radarCheck(?:\s[^\"]*)?"', radar_source)), 8)
        self.assertIn('id="radarDirectPathCancellation" type="checkbox"', radar_source)
        self.assertIn('id="radarCfarEnabled" type="checkbox"', radar_source)
        for declaration in ("width:", "min-height:", "align-items:", "padding:", "border:", "border-radius:", "background:", "font-size:"):
            self.assertIn(declaration, radar_check_css)
        self.assertIn("width:14px", radar_input_css)
        self.assertIn("height:14px", radar_input_css)
        self.assertIn("margin:0", radar_input_css)
        self.assertIn("margin-top:", css_rule_body(css_source, ".radarCheck + .radarFieldGrid"))

    def test_radar_groups_start_collapsed_and_share_the_standard_chevron(self) -> None:
        radar_source = read_static_html()
        radar_source = radar_source[
            radar_source.index('<section id="radarPanel"'):
            radar_source.index('<div id="deviceDock"')
        ]
        css_source = read_app_css()
        self.assertEqual(radar_source.count('class="paramGroup radarGroup"'), 5)
        self.assertEqual(radar_source.count('class="paramGroupSummary"'), 5)
        self.assertEqual(radar_source.count('class="paramGroupBody radarGroupBody"'), 5)
        self.assertNotIn('class="paramGroup radarGroup" open', radar_source)
        self.assertIn('<summary class="paramGroupSummary">OFDM Waveform</summary>', radar_source)
        self.assertNotIn("OFDM Waveform &amp; Signal", radar_source)
        self.assertNotIn(".radarGroup>summary", css_source)
        self.assertNotIn(".radarGroup:not([open])", css_source)
        shared_chevron = css_rule_body(css_source, ".paramGroupSummary::after")
        self.assertNotIn('content:"⌄"', shared_chevron)

    def test_radar_asset_picker_uses_neutral_flat_styling(self) -> None:
        css_source = read_app_css()
        picker_css = css_rule_body(css_source, ".radarAssetPicker")
        viewport_css = css_rule_body(css_source, ".radarAssetPreviewViewport")
        nav_css = css_rule_body(css_source, ".radarAssetNav")
        count_css = css_rule_body(css_source, ".radarAssetPreviewCount")
        add_button_css = css_rule_body(css_source, ".oat-button--compact.oat-button--primary.oat-button--block")

        self.assertIn("padding:0", picker_css)
        self.assertIn("border:0", picker_css)
        self.assertIn("background:transparent", picker_css)
        self.assertIn("box-shadow:none", picker_css)
        self.assertNotIn("gradient", picker_css)
        self.assertIn("background:var(--oat-", viewport_css)
        self.assertNotIn("gradient", viewport_css)
        self.assertIn("background:var(--oat-", nav_css)
        self.assertIn("box-shadow:", nav_css)
        self.assertIn("background:var(--oat-", count_css)
        self.assertIn("box-shadow:", add_button_css)
        self.assertIn("display:none", css_rule_body(css_source, '.radarAssetPicker[data-state="ready"] .radarAssetPickerHint'))
        self.assertIn("display:block", css_rule_body(css_source, '.radarAssetPicker[data-state="ready"] #btnAddRadarTarget[title]~.radarAssetPickerHint'))

    def test_radar_starts_without_devices_or_targets(self) -> None:
        state_source = read_static_js("features/radar/state.js")
        controls_source = read_static_js("features/radar/controls.js")
        panel_source = read_static_html()
        runtime_source = read_static_js("features/radar/runtime.js")

        self.assertIn("tx: null", state_source)
        self.assertIn("txVisual: null", state_source)
        self.assertIn("rx: null", state_source)
        self.assertIn("rxVisual: null", state_source)
        self.assertIn("targets: []", state_source)
        self.assertIn("nextTargetNumber: 1", state_source)
        self.assertIn("selectedTargetId: null", state_source)
        self.assertNotIn("DEFAULT_TARGETS", state_source)
        self.assertIn('<span id="radarTargetCount" class="radarSummaryBadge oat-badge">0 / 16</span>', panel_source)
        self.assertIn("const INITIAL_SPEED_MIN_MPS = 5", controls_source)
        self.assertIn("const INITIAL_SPEED_MAX_MPS = 15", controls_source)
        self.assertIn("const INITIAL_DIRECTION_MIN_DEG = -180", controls_source)
        self.assertIn("const INITIAL_DIRECTION_MAX_DEG = 180", controls_source)
        self.assertIn("const INITIAL_CLIMB_MIN_DEG = -10", controls_source)
        self.assertIn("const INITIAL_CLIMB_MAX_DEG = 10", controls_source)
        self.assertIn("const motion = randomInitialMotion();", controls_source)
        self.assertIn("velocity: motion.velocity", controls_source)
        self.assertIn('return "Place Radar Tx and Rx before running sensing."', controls_source)
        self.assertIn("!controls.devicesReady()", runtime_source)
        self.assertNotIn("context.ui.btnOrbitTx.disabled", runtime_source)
        self.assertNotIn("context.ui.btnOrbitTx.title", runtime_source)

    def test_other_modes_start_without_devices(self) -> None:
        html = read_static_html()
        solver_source = read_static_js("solver_controls.js")
        payload_source = read_static_js("solvers/solver_payloads.js")
        scene_source = read_static_js("scene_render_state.js")
        state_files = {
            "link": read_static_js("features/link/state.js"),
            "mobility": read_static_js("features/mobility/state.js"),
            "radiomap": read_static_js("features/radiomap/state.js"),
            "deepmimo": read_static_js("features/deepmimo/state.js"),
        }

        for mode, source in state_files.items():
            self.assertIn("tx: null", source, mode)
            self.assertIn("txVisual: null", source, mode)
            self.assertNotIn("tx: [72.0, 37.0, 40.0]", source, mode)
        for mode in ("link", "mobility"):
            self.assertIn("rx: null", state_files[mode], mode)
            self.assertIn("rxVisual: null", state_files[mode], mode)

        for input_id in (
            "linkTxX", "linkTxY", "linkTxZ", "linkRxX", "linkRxY", "linkRxZ",
            "mobilityTxX", "mobilityTxY", "mobilityTxZ",
            "mobilityRxX", "mobilityRxY", "mobilityRxZ",
            "rmTxX", "rmTxY", "rmTxZ",
            "deepMimoTxX", "deepMimoTxY", "deepMimoTxZ",
        ):
            self.assertRegex(
                html,
                rf'id="{input_id}"[^>]*placeholder="—"',
                input_id,
            )

        self.assertIn("function readDeviceVector(inputRefs)", solver_source)
        self.assertIn("function syncDeviceVectorInputs(inputRefs, values, targetId)", solver_source)
        self.assertIn('setLogicalAndVisual(state.link, "tx"', solver_source)
        self.assertRegex(solver_source, r'setLogicalAndVisual\(\s*state\.mobility,\s*"rx"')
        self.assertIn('setLogicalAndVisual(state.radiomap, "tx"', solver_source)
        self.assertIn("const requirement = features.instance(definition.id)?.runRequirementMessage?.() || \"\";", scene_source)
        self.assertIn("ui.btnOrbitTx.disabled = !txReady;", scene_source)
        self.assertIn("Place Link Tx before solving the link.", payload_source)
        self.assertIn("Place Radio Map Tx before running the radio map.", payload_source)
        self.assertIn("Place Mobility Tx before running mobility.", payload_source)
        self.assertIn("Place DeepMIMO Tx before exporting data.", payload_source)

    def test_radar_target_actions_are_full_width_and_stateful(self) -> None:
        radar_source = read_static_html()
        controls_source = (PROJECT_ROOT / "workbench" / "src" / "features" / "controls" / "ControlCollections.tsx").read_text(encoding="utf-8")
        css_source = read_app_css()
        action_layout_css = css_rule_body(css_source, ".radarEditorActions")
        action_button_css = css_rule_body(css_source, ".oat-button--toolbar")
        picking_css = css_rule_body(css_source, ".radarEditorActions #btnPickRadarTarget.picking")

        self.assertIn("display:grid", action_layout_css)
        self.assertIn("grid-template-columns:repeat(3,minmax(0,1fr))", action_layout_css)
        self.assertIn("width:100%", action_layout_css)
        self.assertIn("min-height:36px", action_button_css)
        self.assertIn("justify-content:center", action_button_css)
        self.assertIn("background:var(--oat-", picking_css)
        self.assertIn("color:var(--oat-", picking_css)
        self.assertIn('content:"Picking in 3D"', css_rule_body(css_source, ".radarEditorActions #btnPickRadarTarget.picking::after"))
        danger_css = css_rule_body(css_source, ".oat-button--toolbar.oat-button--danger")
        self.assertIn("border-color:var(--oat-", danger_css)
        self.assertIn("background:var(--oat-", danger_css)
        add_button_position = radar_source.index('id="btnAddRadarTarget"')
        actions_position = radar_source.index('class="radarEditorActions"')
        target_list_position = radar_source.index('id="radarTargetList"')
        self.assertLess(add_button_position, actions_position)
        self.assertLess(actions_position, target_list_position)
        self.assertIn('role="group" aria-label="Selected target actions"', radar_source)
        self.assertEqual(radar_source.count("oat-button--toolbar"), 3)
        self.assertIn("oat-button--block radarAssetAddButton", radar_source)
        self.assertIn(
            "No targets added. Choose a drone model above, then select Add Target.",
            controls_source,
        )

    def test_antenna_array_payloads_are_sent_to_solvers(self) -> None:
        source = read_frontend_js_modules()
        html = (PROJECT_ROOT / "backend" / "static" / "index.html").read_text(encoding="utf-8")

        self.assertIn("solverConfig.tx_array = antennaArrayPayload(state.antenna.txArray)", source)
        self.assertIn("rx_array: antennaArrayPayload(state.antenna.rxArray)", source)
        self.assertRegex(source, r"\.\.\.commonSolverConfig\([^)]*\),\n\s+samples_per_tx")
        self.assertIn("samples_per_tx: state.radiomap.solver.samplesPerTx", source)
        self.assertIn('id="txArrayPattern"', html)
        self.assertIn('id="rxArrayPattern"', html)
        self.assertIn('class="paramField linkOnlyParam deepmimoAntennaParam" for="rxArrayPattern"', html)

    def test_radiomap_ui_parameters_are_wired(self) -> None:
        source = read_frontend_js_modules()
        viewer_source = read_frontend_js_modules()
        colormap_source = read_static_js("colormaps.js")
        html = (PROJECT_ROOT / "backend" / "static" / "index.html").read_text(encoding="utf-8")
        state_source = read_frontend_js_modules()
        dom_source = read_static_js("dom_refs.js")
        result_component = (PROJECT_ROOT / "workbench" / "src" / "features" / "results" / "ResultDockContent.tsx").read_text(encoding="utf-8")

        self.assertIn('id="rmSamplesPerTx"', html)
        self.assertIn('id="rmCellSize"', html)
        self.assertIn('id="rmColormap"', html)
        self.assertIn('id="rmColorbarSection"', result_component)
        self.assertIn('id="radiomapResolutionSection"', result_component)
        self.assertIn('valueId: "rmMesh"', source)
        self.assertIn('valueId: "rmArea"', source)
        self.assertIn('valueId: "rmCellSizeSummary"', source)
        self.assertIn("Solver Mesh", source)
        self.assertIn("Resolution &amp; Budget", result_component)
        self.assertIn("Display Scale", result_component)
        self.assertIn('<option value="jet" selected>jet</option>', html)
        self.assertIn("solver: {samplesPerTx: 1000000}", state_source)
        self.assertIn('colormap: "jet"', state_source)
        self.assertIn("rmSamplesPerTx: null", dom_source)
        self.assertIn("inputs[key] = controlSurface.element(key);", dom_source)
        self.assertNotIn('document.getElementById("rmMesh")', dom_source)
        self.assertNotIn('document.getElementById("rmCellSizeSummary")', dom_source)
        self.assertIn("surface.cell_size = state.radiomap.surface.cellSize", source)
        self.assertIn("samples_per_tx: state.radiomap.solver.samplesPerTx", source)
        self.assertNotIn("samples_per_tx: 1000000", source)
        self.assertNotIn("state.livePreview.radiomap", source)
        self.assertNotIn("function scheduleRadiomapPreview", source)
        self.assertNotIn("function runRadiomapLiveJob", source)
        self.assertIn('throw new Error(job.error || job.message || "Radio map job failed");', source)
        self.assertIn("createRadiomapController", source)
        self.assertRegex(source, r"state\.radiomap\.jobId = null;\s+state\.radiomap\.result = null;")
        self.assertRegex(source, r'state\.radiomap\.status = "failed";\s+state\.radiomap\.result = null;')
        self.assertIn('surface.resolution_mode === "cell_size_grid"', source)
        self.assertIn('`${nx} x ${ny} cells (${formatCount(surface.grid_cell_count)})`', source)
        self.assertIn("surface.triangle_count", source)
        self.assertIn("colormapGradient(colormap)", source)
        self.assertIn('Colormap: ${colormap}', source)
        self.assertIn('Display limits: ${minDb.toFixed(0)} .. ${maxDb.toFixed(0)} dB', source)
        self.assertIn('import {colorForColormap} from "/js/colormaps.js";', viewer_source)
        self.assertIn('colorForColormap(primitive.colormap || "jet", clamp01', viewer_source)
        self.assertIn("const invalidColor", viewer_source)
        self.assertIn("Number.isFinite(value)", viewer_source)
        self.assertIn("values[triangle] !== null && Number.isFinite(value)", viewer_source)
        self.assertIn('"N/A"', source)
        self.assertIn('colormap: "jet"', viewer_source)
        self.assertIn('? name : "jet"', colormap_source)

    def test_radiomap_results_live_in_right_side_dock(self) -> None:
        html = (PROJECT_ROOT / "backend" / "static" / "index.html").read_text(encoding="utf-8")
        css_source = read_app_css()
        source = read_frontend_js_modules()
        app_source = read_frontend_js_modules()
        state_source = read_frontend_js_modules()
        dom_source = read_static_js("dom_refs.js")
        scene_source = read_frontend_js_modules()
        entry_source = read_static_js("entry_map.js")
        performance_source = read_static_js("performance_panel.js")
        result_component = (PROJECT_ROOT / "workbench" / "src" / "features" / "results" / "ResultDockContent.tsx").read_text(encoding="utf-8")

        dock_start = html.index('id="linkChannelSection"')
        link_panel_start = html.index('id="linkPanel"')
        radiomap_panel_start = html.index('id="radiomapPanel"')
        dock_html = html[dock_start:link_panel_start]
        left_panel_html = html[link_panel_start:]

        self.assertIn('data-oat-react-owner="result-dock"', dock_html)
        self.assertIn('id="radiomapResult"', result_component)
        self.assertIn('id="btnResultDockToggle"', dock_html)
        self.assertIn('aria-expanded="true"', dock_html)
        self.assertIn('id="channelAnalysisScroll" class="channelAnalysisScroll oat-scroll-region"', dock_html)
        dock_css = css_rule_body(css_source, ".channelAnalysisDock")
        for property_name in ("position:", "backdrop-filter:", "overflow:", "transition:"):
            self.assertIn(property_name, dock_css)
        self.assertIn("--analysis-dock-bottom-reserve:", read_static_css("tokens.css"))
        scroll_css = css_rule_body(css_source, ".channelAnalysisScroll")
        for property_name in ("box-sizing:", "max-height:", "overflow-x:", "overflow-y:", "padding:", "scrollbar-width:"):
            self.assertIn(property_name, scroll_css)
        self.assertIn("pointer-events:none", css_rule_body(css_source, ".channelAnalysisDock.collapsed .channelAnalysisScroll"))
        self.assertIn("transform:rotate(-90deg)", css_rule_body(css_source, ".channelAnalysisDock.collapsed .channelAnalysisChevron"))
        self.assertIn("display:flex", css_rule_body(css_source, ".channelAnalysisHeadActions"))
        self.assertIn("display:inline-grid", css_rule_body(css_source, ".channelAnalysisChevron"))
        self.assertIn("stroke:currentColor", css_rule_body(css_source, ".channelAnalysisChevron svg"))
        self.assertIn('<svg viewBox="0 0 24 24"><path d="m6 9 6 6 6-6"></path></svg>', dock_html)
        self.assertIn("width:", css_rule_body(css_source, ".channelAnalysisScroll::-webkit-scrollbar"))
        self.assertIn(".channelAnalysisScroll::-webkit-scrollbar-thumb:hover", css_source)
        self.assertNotIn(".channelAnalysisDock::-webkit-scrollbar", css_source)
        self.assertIn('class="sidebarToggleIcon sidebarToggleIconCollapse"', html)
        self.assertIn('class="sidebarToggleIcon sidebarToggleIconOpen"', html)
        self.assertIn('<svg viewBox="0 0 24 24"><path d="m15 18-6-6 6-6"></path></svg>', html)
        self.assertIn('<svg viewBox="0 0 24 24"><path d="M5 7h14"></path><path d="M5 12h14"></path><path d="M5 17h14"></path></svg>', html)
        self.assertIn("stroke:currentColor", css_rule_body(css_source, ".sidebarToggleIcon svg"))
        self.assertIn("opacity:1", css_rule_body(css_source, "#entryScreen.sidebarCollapsed .entrySidebarToggle .sidebarToggleIconOpen,#panelToggle.panelCollapsed .sidebarToggleIconOpen"))
        self.assertNotIn("ui.panelToggle.textContent", scene_source)
        self.assertNotIn("ui.panelToggle.textContent", entry_source)
        self.assertNotIn("ui.btnEntrySidebarToggle.textContent", entry_source)
        self.assertIn('class="performanceDockChevron" aria-hidden="true"', html)
        self.assertIn("display:inline-grid", css_rule_body(css_source, ".performanceDockChevron"))
        self.assertIn("stroke:currentColor", css_rule_body(css_source, ".performanceDockChevron svg"))
        self.assertIn('document.documentElement.style.setProperty("--analysis-dock-bottom-reserve"', performance_source)
        self.assertIn("function bottomReserveForElement(element, gapPx = 18)", performance_source)
        self.assertIn("bottomReserveForElement(ui.deviceDock)", performance_source)
        self.assertIn("analysisDockReserveObserver.observe(ui.deviceDock);", performance_source)
        self.assertIn("new ResizeObserver", performance_source)
        self.assertIn("resultDock: {\n    expanded: true,", state_source)
        self.assertIn('btnResultDockToggle: document.getElementById("btnResultDockToggle")', dom_source)
        self.assertIn('channelAnalysisScroll: document.getElementById("channelAnalysisScroll")', dom_source)
        self.assertIn('ui.btnResultDockToggle.addEventListener("click", () => {', app_source)
        self.assertIn("state.resultDock.expanded = !state.resultDock.expanded;", app_source)
        self.assertIn("function syncResultDockUi()", scene_source)
        self.assertIn('ui.linkChannelSection.classList.toggle("collapsed", !expanded);', scene_source)
        self.assertIn("ui.channelAnalysisScroll.inert = !expanded;", scene_source)
        self.assertIn("Radio Map Results", source)
        self.assertIn("Path gain / Terrain grid", source)
        self.assertIn("Path gain (dB)", source)
        self.assertIn("Grid", source)
        self.assertIn("Solver Mesh", source)
        self.assertIn("Area", source)
        self.assertIn("Cell Size", source)
        self.assertIn("Samples / Tx", source)
        self.assertIn("Result Range", source)
        self.assertIn("Display Scale", result_component)
        self.assertNotIn('id="radiomapResult"', left_panel_html[left_panel_html.index('id="radiomapPanel"'):])
        self.assertIn('resultDock.update("radiomap"', source)
        self.assertNotIn("ui.radiomapResult", source)
        self.assertIn('ui.linkChannelSection.classList.remove("hidden");', source)
        self.assertIn('ui.resultDockTitle.textContent = "Radio Map Results";', source)
        self.assertIn('syncModeUi();\n  syncControlSidebarUi();\n  syncViewerMarkers();', scene_source)
        self.assertIn('syncPerformanceUi();\n  syncResultDockUi();', scene_source)
        self.assertIn("controlSurfaceBridge.setActionBusy(actionId, false);", app_source)

    def test_live_preview_controls_and_schedulers_are_wired(self) -> None:
        html = (PROJECT_ROOT / "backend" / "static" / "index.html").read_text(encoding="utf-8")
        app_source = read_frontend_js_modules()
        api_source = read_static_js("api.js")
        dom_source = read_static_js("dom_refs.js")
        scene_source = read_frontend_js_modules()
        solver_source = read_frontend_js_modules()
        state_source = read_frontend_js_modules()
        viewer_source = read_static_js("viewer.js")
        css_source = read_app_css()

        self.assertIn('id="livePreviewStatus"', html)
        self.assertIn('id="livePreviewEnabled" type="checkbox"', html)
        self.assertIn('id="livePreviewLinkSamples"', html)
        self.assertIn('<span class="paramLabel">Preview Samples / Source', html)
        self.assertIn('id="livePreviewPathsDelay"', html)
        self.assertNotIn('id="livePreviewRmSamples"', html)
        self.assertNotIn('id="livePreviewRmDelay"', html)
        self.assertNotIn('id="livePreviewRmCellSize"', html)
        self.assertIn('class="devicePrecisionPanel deviceCompactBar hidden"', html)
        self.assertNotIn("devicePrecisionKicker", html)
        self.assertIn('id="devicePrecisionTitle" class="devicePrecisionTitle">Tx</div>', html)
        self.assertIn("Pick a surface point or fine-tune below.", html)
        self.assertIn('id="linkSurfaceClearance"', html)
        self.assertIn('value="1.5"', html)
        self.assertIn(">Clearance\n", html)
        self.assertIn("Distance from the picked surface for the active mode device.", html)
        device_dock_css = css_rule_body(css_source, ".deviceDock")
        for property_name in ("position:", "left:", "bottom:", "z-index:", "width:", "max-width:", "min-width:"):
            self.assertIn(property_name, device_dock_css)
        self.assertIn("margin-top:", css_rule_body(css_source, ".livePreviewParam .paramCheckGrid + .paramGrid"))
        self.assertIn("max-width:100%", css_rule_body(css_source, ".devicePrecisionPanel"))
        self.assertIn("display:flex", css_rule_body(css_source, ".deviceCompactBar"))
        self.assertIn("clip-path:inset(50%)", css_rule_body(css_source, ".devicePrecisionStatus"))
        self.assertIn("display:flex", css_rule_body(css_source, ".deviceCoordPanels"))
        self.assertIn("flex:0 0 auto", css_rule_body(css_source, ".deviceCoordPanel"))
        self.assertIn("grid-template-columns:repeat(3,104px)", css_rule_body(css_source, ".deviceCoordGrid"))
        self.assertIn("font-variant-numeric:tabular-nums", css_source)
        self.assertIn("padding-right:", css_rule_body(css_source, '.deviceCoordGrid .unitInput input[type="number"],.deviceClearanceField .unitInput input[type="number"]'))
        self.assertIn("font-size:", css_rule_body(css_source, ".deviceCoordGrid .unitSuffix,.deviceClearanceField .unitSuffix"))
        self.assertIn("display:flex", css_rule_body(css_source, ".deviceClearanceField"))
        self.assertIn("@media (min-width:1280px) and (max-width:1359px)", read_static_css("shell.css"))
        self.assertIn("livePreview: {\n    enabled: false", state_source)
        self.assertIn("previewSamplesPerSrc: 1000", state_source)
        self.assertIn("surfaceClearanceM: 1.5", state_source)
        self.assertGreaterEqual(state_source.count("surfaceClearanceM: 1.5"), 2)
        self.assertNotIn("mapDelayS: 3.0", state_source)
        self.assertNotIn("previewSamplesPerTx", state_source)
        self.assertIn("livePreviewEnabled: null", dom_source)
        self.assertIn("linkSurfaceClearance: null", dom_source)
        self.assertIn("livePreviewParams: []", dom_source)
        self.assertIn('livePreviewParams: ".livePreviewParam"', dom_source)
        self.assertIn("inputs[key] = controlSurface.element(key);", dom_source)
        self.assertIn("const activeTargetIds = new Set(picking.targetsFor(activeFeature.id)", scene_source)
        self.assertIn('ui.linkSurfaceClearanceField.classList.toggle("hidden", !activeTargetMeta?.clearance);', scene_source)
        self.assertIn("const hasPrecisionTarget = Boolean(activeTargetMeta?.precision);", scene_source)
        self.assertIn('ui.devicePrecisionTitle.textContent = activeTargetMeta?.precisionTitle || "Tx";', scene_source)
        self.assertIn('export function solveLink(payload, options = {})', api_source)
        self.assertIn("signal: options.signal", api_source)

        self.assertIn("function linkSolvePayload({preview = false} = {})", solver_source)
        self.assertIn("solver.samples_per_src = Math.max(1, Math.floor(Number(state.livePreview.link.previewSamplesPerSrc)));", solver_source)
        self.assertIn("solver.max_num_paths_per_src = Math.min(Number(solver.max_num_paths_per_src), 10000);", solver_source)
        self.assertIn("channel.compute_taps = false;", solver_source)
        self.assertIn("new AbortController()", solver_source)
        self.assertIn("token !== live.generation", solver_source)
        self.assertIn("function radiomapJobPayload()", solver_source)
        self.assertIn("density_level: state.radiomap.surface.densityLevel", solver_source)
        self.assertNotIn("Math.max(Number(state.radiomap.surface.cellSize), previewCellSize)", solver_source)
        self.assertNotIn("live.inFlight = true;", solver_source)
        self.assertNotIn("live.pendingPreview = true;", solver_source)
        self.assertNotIn("live.pendingFinal = true;", solver_source)
        self.assertRegex(solver_source, r"live\.previewController\?\.abort\(\);\s+live\.finalController\?\.abort\(\);")
        self.assertIn('setLivePreviewStatus("link", preview ? "Previewing" : "Finalizing");', solver_source)
        self.assertNotIn('setLivePreviewStatus("radiomap"', solver_source)
        self.assertIn("handleLivePreviewDeviceUpdate(target, phase = \"change\")", solver_source)
        self.assertIn("function linkPickPosition(pick)", solver_source)
        self.assertIn("function radiomapTxPickPosition(pick)", solver_source)
        self.assertIn("pick.surfacePosition", solver_source)
        self.assertIn("pick.surfaceNormal", solver_source)
        self.assertIn("context.features.store.get(scope).surfaceClearanceM", solver_source)
        self.assertIn("const position = shared.pickPositionWithSurfaceClearance(pick, target.scope);", solver_source)
        self.assertIn("applyPick(pick, target)", solver_source)
        self.assertIn('setLogicalAndVisual(state.radiomap, "tx", position);', solver_source)
        self.assertIn("surfacePosition: [hit.point.x, hit.point.y, hit.point.z]", viewer_source)
        self.assertIn("surfaceNormal: surfaceNormal ?", viewer_source)

        self.assertIn("devicePicking.clearActiveDevice({render: false});", app_source)
        self.assertIn("solverControls.cancelLivePreview();", app_source)
        self.assertIn('view.addEventListener("pointerdown", handlePickPointerDown, {capture: true});', app_source)
        self.assertIn("event.currentTarget.setPointerCapture(event.pointerId);", app_source)
        self.assertIn('document.getElementById("view").releasePointerCapture(pointerId);', app_source)
        self.assertIn('solver.handleLivePreviewDeviceUpdate(target, livePhase);', app_source)
        self.assertIn('controller.handleLivePreviewDeviceUpdate(target, "change");', app_source)
        self.assertIn('["linkRxX", "link-rx"]', app_source)
        self.assertNotIn('solverControls.handleLivePreviewDeviceUpdate("rm-tx", "change");', app_source)
        self.assertIn('if (controlId === "linkSurfaceClearance")', app_source)
        self.assertIn("solver().readSurfaceClearanceInput(scope);", app_source)

    def test_path_details_show_array_pair_aggregation(self) -> None:
        source = read_frontend_js_modules()
        result_component = (PROJECT_ROOT / "workbench" / "src" / "features" / "results" / "ResultDockContent.tsx").read_text(encoding="utf-8")

        self.assertIn('detailField("array-pairs", "Array Pairs", String(path.array_pair_count ?? 1))', source)
        self.assertIn('detailField("strongest-pair", "Strongest Pair", formatFixed(path.strongest_pair_power_db, 2, " dB"))', source)
        self.assertIn('detailField("variants", "Variants", `${variants} variants`)', source)
        self.assertIn('detailField("raw-paths", "Raw Paths", formatRawPathIndices(path), true)', source)
        self.assertIn('detailField("representative", "Representative", String(path.representative_path_index ?? path.path_index ?? "N/A"))', source)
        self.assertIn('const PATH_TYPE_LABELS = {', source)
        self.assertIn('LOS: "Line-of-sight"', source)
        self.assertIn('MIXED: "Mixed interactions"', source)
        self.assertIn('function formatPathSelectionMeta(paths, summary = null)', source)
        self.assertIn('return `${solverPaths} solver ${solverPaths === 1 ? "path" : "paths"}${mergedLabel}`;', source)
        self.assertIn('gain = formatPathGainValue(path)', source)
        self.assertIn('delay = formatPathDelayValue(path)', source)
        self.assertIn('className="pathRowBadge pathVariantBadge"', result_component)
        self.assertNotIn('function formatPathButtonLabel(path, index)', source)
        self.assertNotIn('return parts.join(" · ");', source)

    def test_link_results_live_in_right_side_dock(self) -> None:
        html = (PROJECT_ROOT / "backend" / "static" / "index.html").read_text(encoding="utf-8")
        css_source = read_app_css()
        source = read_frontend_js_modules()
        result_component = (PROJECT_ROOT / "workbench" / "src" / "features" / "results" / "ResultDockContent.tsx").read_text(encoding="utf-8")

        dock_start = html.index('id="linkChannelSection"')
        link_panel_start = html.index('id="linkPanel"')
        radiomap_panel_start = html.index('id="radiomapPanel"')
        dock_html = html[dock_start:link_panel_start]
        link_panel_html = html[link_panel_start:radiomap_panel_start]
        selection_index = result_component.index('id="pathSelectionSection"')
        buttons_index = result_component.index('id="pathButtons"')
        detail_index = result_component.index('id="pathDetailSection"')
        tap_index = result_component.index('id="linkTapAnalysisSection"')

        self.assertIn("Link Results", dock_html)
        self.assertIn('data-oat-react-owner="result-dock"', dock_html)
        for element_id in (
            "linkResult", "pathSelectionSection", "pathSelectionCount", "pathSelectionMeta",
            "pathButtons", "pathDetailSection", "pathDetailTitle", "linkTapAnalysisSection",
        ):
            self.assertIn(f'id="{element_id}"', result_component)
        self.assertLess(selection_index, buttons_index)
        self.assertLess(selection_index, detail_index)
        self.assertLess(
            result_component.index("<PathSections"),
            result_component.index("<ChannelSection"),
        )
        self.assertIn("Path Gains &amp; Taps", dock_html)
        for label in ("Selected Path", "Power Delay Profile", "Discrete Channel Taps"):
            self.assertIn(label, result_component)
        for label in (
            "Total Path Gain", "Strongest Path Gain", "Line of Sight", "Total Tap Power",
            "Strongest Tap", "Channel Coefficients", "Largest Coefficient |h|",
        ):
            self.assertIn(label, source)
        path_section_css = css_rule_body(css_source, "#pathSelectionSection")
        self.assertIn("position:relative", path_section_css)
        self.assertNotIn("position:sticky", path_section_css)
        self.assertIn("flex-direction:column", css_rule_body(css_source, ".pathList"))
        self.assertIn("display:flex", css_rule_body(css_source, ".pathAllButton"))
        self.assertIn("display:grid", css_rule_body(css_source, ".pathRow"))
        self.assertIn("grid-template-columns:1fr 1fr", css_rule_body(css_source, ".pathRowMetrics"))
        self.assertNotIn(".pathRow.active::before", css_source)
        self.assertNotIn('id="linkResult"', link_panel_html)
        self.assertNotIn('id="pathSelectionSection"', link_panel_html)
        self.assertNotIn('id="pathButtons"', link_panel_html)
        self.assertNotIn('id="pathDetailSection"', link_panel_html)
        self.assertNotIn("Channel Result", html)
        self.assertIn("function createPathResultsViewModel(paths, selectedIndex", source)
        self.assertIn('name: `${model.featureId}.path.select`', result_component)
        self.assertIn('"pathAllButton oat-list-card oat-list-card--interactive"', result_component)
        self.assertIn('"pathRow oat-list-card oat-list-card--interactive"', result_component)
        self.assertIn('active.scrollIntoView({ block: "nearest" })', result_component)
        self.assertNotIn('All display paths are shown in the viewer.', source)
        self.assertNotIn('function renderAllPathsDetail', source)
        self.assertIn('registerCommandHandler("link", (command) =>', source)
        self.assertIn('command.name !== "link.path.select"', source)
        self.assertIn("getViewer().renderPaths(result.paths, state.link.selectedPath);", source)
        self.assertIn("getViewer().renderPaths(sample.paths || [], state.mobility.selectedPath);", source)

    def test_tap_analysis_no_longer_controls_whole_link_result_dock(self) -> None:
        source = read_static_js("ui/link_result_view.js")
        result_component = (PROJECT_ROOT / "workbench" / "src" / "features" / "results" / "ResultDockContent.tsx").read_text(encoding="utf-8")
        draw_chart = source[source.index("export function drawLinkTapChart"):source.index("export function createLinkResultView")]

        self.assertIn('id="linkTapAnalysisSection"', result_component)
        self.assertIn('!channel.visible && "hidden"', result_component)
        self.assertNotIn("linkChannelSection", draw_chart)

    def test_tap_chart_axes_are_labeled_and_not_clipped(self) -> None:
        source = read_frontend_js_modules()
        html = (PROJECT_ROOT / "backend" / "static" / "index.html").read_text(encoding="utf-8")
        css = read_app_css()

        result_component = (PROJECT_ROOT / "workbench" / "src" / "features" / "results" / "ResultDockContent.tsx").read_text(encoding="utf-8")
        self.assertIn('viewBox="0 0 420 172"', result_component)
        self.assertIn("Power delay profile chart: x-axis Tap Index, y-axis Power in dB", result_component)
        self.assertIn("const left = 68;", source)
        self.assertNotIn("const left = 36;", source)
        self.assertIn('yAxisTitle.textContent = "Power (dB)";', source)
        self.assertIn('xAxisTitle.textContent = "Tap Index";', source)
        self.assertIn("const yTicks = [", source)
        self.assertIn('title.textContent = "Power delay profile chart";', source)
        self.assertIn('desc.textContent = "X-axis shows Tap Index. Y-axis shows tap power in dB.', source)
        self.assertIn("tapGrid", css)

    def test_mobility_mode_controls_and_api_are_wired(self) -> None:
        api_source = read_static_js("api.js")
        app_source = read_frontend_js_modules()
        state_source = read_frontend_js_modules()
        source = read_frontend_js_modules()
        css_source = read_app_css()
        html = (PROJECT_ROOT / "backend" / "static" / "index.html").read_text(encoding="utf-8")
        result_component = (PROJECT_ROOT / "workbench" / "src" / "features" / "results" / "ResultDockContent.tsx").read_text(encoding="utf-8")
        control_collections = (PROJECT_ROOT / "workbench" / "src" / "features" / "controls" / "ControlCollections.tsx").read_text(encoding="utf-8")
        mobility_runtime = read_static_js("features/mobility/runtime.js")

        self.assertIn('id="tabMobility"', html)
        self.assertIn('id="btnRunMobility"', html)
        self.assertIn('id="mobilityWaypointList"', html)
        self.assertIn('id="mobilityMaxSteps" type="number" step="1" min="2" max="10000" value="1000"', html)
        self.assertNotIn('id="mobilityMaxSteps" type="number" step="1" min="2" max="500"', html)
        self.assertIn('id="mobilitySeriesChart"', result_component)
        self.assertIn('Path Gain Range', source)
        self.assertIn('{ value: "received_power_db", label: "Path Gain" }', result_component)
        self.assertIn('{ value: "peak_tap_power_db", label: "Strongest Tap" }', result_component)
        self.assertIn('id="mobilityTxDeviceCard"', html)
        self.assertIn('id="mobilityRxDeviceCard"', html)
        self.assertIn('id="mobilityTxX"', html)
        self.assertIn('id="mobilityRxX"', html)
        self.assertIn('id="btnPickMobilityTx"', html)
        self.assertIn('id="btnPickMobilityRx"', html)
        self.assertIn('requestJson("/api/mobility/jobs"', api_source)
        self.assertIn("getMobilityJob", api_source)
        self.assertIn("getMobilityResult", api_source)
        self.assertIn("featureRegistry.activate(definition.id, context);", app_source)
        self.assertIn('id: "mobility"', app_source)
        self.assertIn("state.link.advanced.computeTaps = true;", app_source)
        self.assertIn("createMobilityJob", app_source)
        self.assertIn("export function createMobilityState()", state_source)
        self.assertIn("tx: null", state_source)
        self.assertIn("rx: null", state_source)
        self.assertIn("txVisual: null", state_source)
        self.assertIn("rxVisual: null", state_source)
        self.assertIn("surfaceClearanceM: 1.5", state_source)
        self.assertIn("points: [],", state_source)
        self.assertIn("selectedWaypointIndex: -1", state_source)
        self.assertNotIn("points: [\n        [90.0, 52.0, 1.5]", state_source)
        self.assertIn("No Rx waypoints yet", control_collections)
        self.assertIn("waypointItem oat-list-card oat-list-card--interactive", control_collections)
        self.assertIn('item.selected && "active"', control_collections)
        self.assertIn('controlActionCommand("mobilityWaypoint.select", item.index)', control_collections)
        self.assertIn('controlActionCommand("mobilityWaypoint.remove", item.index)', control_collections)
        self.assertIn("state.mobility.selectedWaypointIndex = Number(value);", mobility_runtime)
        self.assertIn("function deleteMobilityWaypoint(index = state.mobility.selectedWaypointIndex)", source)
        self.assertNotIn("remove.disabled", source)
        self.assertNotIn("points.length <= 2", source)
        self.assertIn("state.mobility.trajectory.points = [];", source)
        self.assertNotIn("[x + 15, y + 8, z]", source)
        self.assertIn(".waypointItem.active", css_source)
        self.assertIn(".waypointEmpty", css_source)
        self.assertIn('event.key === "Enter"', app_source)
        self.assertIn("solver().addCurrentRxWaypoint();", app_source)
        self.assertIn('event.key === "Delete" && state.mobility.selectedWaypointIndex >= 0', app_source)
        self.assertIn("solver().deleteMobilityWaypoint(state.mobility.selectedWaypointIndex);", app_source)
        self.assertIn("isEditableKeyboardTarget(event.target)", app_source)
        self.assertIn("rx_trajectory: {", source)
        self.assertIn("tx: {position: txPosition, orientation: [0, 0, 0]}", source)
        self.assertIn("points: state.mobility.trajectory.points", source)
        self.assertIn("max_steps: state.mobility.trajectory.maxSteps", source)
        self.assertIn("const point = [...state.mobility.rx];", source)
        self.assertIn('applyMethod: "applyMobilityPick"', source)
        self.assertIn("shared.setLogicalAndVisual(state.mobility, target.role, position)", source)
        self.assertIn("${estimate.steps} / ${estimate.maxSteps} steps", source)
        self.assertNotIn("estimate.steps > 50", source)
        self.assertNotIn("estimate.maxSteps > 500", source)
        self.assertNotIn("between 2 and 500", source)
        self.assertIn("solver: linkDomain?.solverConfig?.() || linkSolverConfig({state, inputs})", source)
        self.assertIn("channel: linkDomain?.channelConfig?.() || linkChannelConfig({state})", source)
        self.assertIn("getViewer().renderPaths(sample?.paths || [], -1);", source)
        self.assertIn("createMobilityController", source)
        self.assertRegex(source, r"state\.mobility\.jobId = null;\s+state\.mobility\.result = null;")
        self.assertRegex(source, r'state\.mobility\.status = "failed";\s+state\.mobility\.result = null;')

    def test_mobility_uses_shared_result_dock_and_viewer_preview(self) -> None:
        source = read_frontend_js_modules()
        viewer_source = read_frontend_js_modules()
        scene_source = read_frontend_js_modules()
        html = (PROJECT_ROOT / "backend" / "static" / "index.html").read_text(encoding="utf-8")
        result_component = (PROJECT_ROOT / "workbench" / "src" / "features" / "results" / "ResultDockContent.tsx").read_text(encoding="utf-8")

        self.assertIn('data-oat-react-owner="result-dock"', html)
        self.assertIn('id="mobilityResult"', result_component)
        self.assertIn('id="mobilityTimelineSection"', result_component)
        self.assertIn('ui.resultDockTitle.textContent = "Mobility Results";', source)
        self.assertIn('ui.resultDockSubtitle.textContent = "Trajectory & Taps";', source)
        self.assertIn('received_power_db: {label: "Total Path Gain", unit: "dB"}', source)
        self.assertIn('peak_tap_power_db: {label: "Strongest Tap", unit: "dB"}', source)
        self.assertIn("function renderMobilityResult()", source)
        self.assertIn("function renderMobilitySeriesChart(result)", source)
        self.assertIn("createPathResultsViewModel(", source)
        self.assertIn('resultDock.registerCommandHandler("mobility"', source)
        self.assertIn("renderMobilityResult();", scene_source)
        self.assertIn("renderMobilityTrajectory(points = [], samples = [], selectedIndex = -1)", viewer_source)
        self.assertIn("if (points.length < 1)", viewer_source)
        self.assertIn("if (points.length >= 2)", viewer_source)
        self.assertIn("this.mobilityGroup = this.mobilityLayer.group;", viewer_source)
        self.assertIn("return {tx: state.mobility.txVisual, rx: sample?.rx_position || state.mobility.rxVisual};", source)
        self.assertIn('renderLayers: ["paths", "trajectory"]', source)
        self.assertIn('if (!activeLayers.has(layer))', source)

    def test_mode_specific_device_visuals_are_isolated(self) -> None:
        app_source = read_frontend_js_modules()
        scene_source = read_frontend_js_modules()
        solver_source = read_frontend_js_modules()
        viewer_source = read_static_js("viewer.js")

        self.assertIn('id: "mobility-tx", role: "tx", scope: "mobility"', app_source)
        self.assertIn('id: "mobility-rx", role: "rx", scope: "mobility"', app_source)
        self.assertIn('prompt: "Click any surface to place Tx"', app_source)
        self.assertIn('prompt: "Click any surface to place Rx"', app_source)
        self.assertIn("const activeTargetIds = new Set(picking.targetsFor(activeFeature.id)", scene_source)
        self.assertIn("for (const target of picking.targetsFor(definition.id))", scene_source)
        self.assertIn('button.classList.toggle("hidden", !isActive);', scene_source)
        self.assertIn("syncViewerMarkers();\n  syncModeVisuals();", scene_source)

        self.assertIn("context.features.instance(state.mode)?.markerPositions?.()", solver_source)
        self.assertIn("return {tx: state.radiomap.txVisual, rx: null};", solver_source)
        self.assertIn("return {tx: state.deepmimo.txVisual, rx: null};", solver_source)
        self.assertIn("function syncModeVisuals()", solver_source)
        self.assertIn("const activeLayers = new Set(context.features.get(state.mode)?.renderLayers || []);", solver_source)
        self.assertIn('["radiomap", () => getViewer().clearRadiomap()]', solver_source)
        self.assertIn('["roi", () => getViewer().clearDeepMimoRoi()]', solver_source)
        self.assertIn('["trajectory", () => getViewer().clearMobility()]', solver_source)
        self.assertIn('["paths", () => getViewer().clearPaths()]', solver_source)
        self.assertIn("if (!activeLayers.has(layer))", solver_source)
        self.assertIn('if (bounds && state.mode === "deepmimo")', solver_source)
        self.assertIn('const shouldShow = state.mode === "radiomap"', solver_source)
        self.assertIn("if (!Array.isArray(position)) {\n      this.stopTxOrbit();\n      this.txMarker.visible = false;", viewer_source)
        self.assertIn("if (!Array.isArray(position)) {\n      this.rxMarker.visible = false;", viewer_source)

    def test_tx_orbit_showcase_button_is_wired(self) -> None:
        html = (PROJECT_ROOT / "backend" / "static" / "index.html").read_text(encoding="utf-8")
        app_source = read_frontend_js_modules()
        state_source = read_static_js("app_state.js")
        dom_source = read_static_js("dom_refs.js")
        scene_source = read_frontend_js_modules()
        viewer_source = read_static_js("viewer.js")

        action_bar_index = html.index('id="deviceActionBar"')
        orbit_index = html.index('id="btnOrbitTx"')
        solve_index = html.index('id="btnSolveLink"')

        self.assertLess(action_bar_index, orbit_index)
        self.assertLess(orbit_index, solve_index)
        self.assertIn('aria-label="Orbit around transmitter"', html)
        self.assertIn("btnOrbitTx: null", dom_source)
        self.assertIn('btnOrbitTx: "btnOrbitTx"', dom_source)
        self.assertIn("startTxOrbit() { return false; }", state_source)
        self.assertIn("stopTxOrbit() {}", state_source)
        self.assertIn("isTxOrbiting() { return false; }", state_source)
        self.assertIn("startTxOrbit(center)", viewer_source)
        self.assertIn("stopTxOrbit()", viewer_source)
        self.assertIn("isTxOrbiting()", viewer_source)
        self.assertIn('window.dispatchEvent(new CustomEvent("hku-tx-orbit-change"', viewer_source)
        self.assertIn("return features.store.get(state.mode).txVisual;", app_source)
        self.assertIn("features.instance(state.mode)?.readInputs?.();", app_source)
        self.assertIn('if (actionId === "btnOrbitTx") {', app_source)
        self.assertIn("devicePicking.toggleTxOrbit();", app_source)
        self.assertIn("window.addEventListener(\"hku-tx-orbit-change\"", app_source)
        self.assertIn("for (const definition of featureRegistry.definitions())", app_source)
        self.assertIn("devicePicking.stopTxOrbit();", app_source)
        self.assertIn("featureRegistry.activate(definition.id, context);", app_source)
        self.assertNotIn('id="btnResetView"', html)
        self.assertNotIn('id="btnClearOverlay"', html)
        self.assertNotIn('class="actions"', html)
        self.assertNotIn("btnResetView", dom_source)
        self.assertNotIn("btnClearOverlay", dom_source)
        self.assertNotIn("btnResetView.addEventListener", app_source)
        self.assertNotIn("btnClearOverlay.addEventListener", app_source)
        self.assertIn("ui.btnOrbitTx.classList.toggle(\"active\", orbitingTx);", scene_source)
        self.assertIn('ui.btnOrbitTx.querySelector(".deviceActionText").textContent = orbitingTx ? "Stop" : "Orbit";', scene_source)

    def test_deepmimo_roi_export_controls_are_wired(self) -> None:
        html = (PROJECT_ROOT / "backend" / "static" / "index.html").read_text(encoding="utf-8")
        app_source = read_frontend_js_modules()
        api_source = read_static_js("api.js")
        dom_source = read_static_js("dom_refs.js")
        state_source = read_frontend_js_modules()
        scene_source = read_frontend_js_modules()
        solver_source = read_frontend_js_modules()
        viewer_source = read_static_js("viewer.js")
        css_source = read_app_css()
        dataset_view_source = read_static_js("ui/deepmimo_dataset_view.js")
        dataset_component = (PROJECT_ROOT / "workbench" / "src" / "features" / "deepmimo" / "DeepMimoDatasetTray.tsx").read_text(encoding="utf-8")
        deepmimo_payload_source = solver_source.split("export function deepMimoPayload(", 1)[1].split(
            "export function",
            1,
        )[0]

        self.assertIn('id="tabDeepMimo"', html)
        self.assertIn('id="btnDeepMimoPickTx"', html)
        self.assertIn('id="btnDeepMimoPickRoi"', html)
        self.assertIn('id="btnDeepMimoClearRoi"', html)
        self.assertIn('id="deepMimoTxDeviceCard"', html)
        self.assertIn('id="deepMimoTxX"', html)
        self.assertIn('<span class="deviceActionText">Draw ROI</span>', html)
        self.assertIn('<span class="deviceActionText">Clear ROI</span>', html)
        self.assertIn('id="deepMimoRoiCenterX"', html)
        self.assertIn('id="deepMimoRoiWidth"', html)
        self.assertIn('id="deepMimoGridSpacing"', html)
        self.assertIn('id="deepMimoMaxReceivers" type="number" step="1000" min="1" max="200000" value="30000"', html)
        self.assertNotIn('id="deepMimoRoiSummary"', html)
        self.assertIn('id="deepMimoRxCandidates" type="text" value="--" readonly', html)
        self.assertNotIn('id="deepMimoSceneBuffer"', html)
        self.assertIn('<summary class="paramGroupSummary">DeepMIMO ROI</summary>', html)
        self.assertNotIn("DeepMIMO ROI Export · Selected Tiles", html)
        self.assertNotIn('id="deepMimoJobStatus"', html)
        self.assertNotIn('id="deepMimoProgress"', html)
        self.assertNotIn('id="deepMimoProgressFill"', html)
        self.assertNotIn('id="deepMimoProgressPercent"', html)
        self.assertNotIn('id="deepMimoDownloadLink"', html)
        self.assertNotIn("Download Dataset", html)
        self.assertIn('data-oat-react-owner="deepmimo-datasets"', html)
        for element_id in (
            "deepMimoDatasetTray", "deepMimoDatasetToggle", "deepMimoDatasetCount",
            "deepMimoDatasetPanel", "deepMimoDatasetList",
        ):
            self.assertIn(f'id="{element_id}"', dataset_component)
        self.assertIn('requestJson("/api/deepmimo/jobs"', api_source)
        self.assertIn('cancelDeepMimoJob(jobId)', api_source)
        self.assertIn('`/api/deepmimo/jobs/${encodeURIComponent(jobId)}/cancel`', api_source)
        self.assertIn('`/api/deepmimo/jobs/${encodeURIComponent(jobId)}/download`', api_source)
        self.assertIn("deepMimoTxX: null", dom_source)
        self.assertIn("deepMimoRoiCenterX: null", dom_source)
        self.assertNotIn("deepMimoRoiSummary", dom_source)
        self.assertIn("deepMimoRxCandidates: null", dom_source)
        self.assertIn('deepMimoRxCandidates: "deepMimoRxCandidates"', dom_source)
        self.assertIn('deepMimoDatasetMount: document.querySelector(\'[data-oat-react-owner="deepmimo-datasets"]\')', dom_source)
        self.assertNotIn('document.getElementById("deepMimoDatasetTray")', dom_source)
        self.assertNotIn('document.getElementById("deepMimoDatasetToggle")', dom_source)
        self.assertNotIn('document.getElementById("deepMimoDatasetList")', dom_source)
        self.assertIn("deepmimoAntennaParams: []", dom_source)
        self.assertIn('deepmimoAntennaParams: ".deepmimoAntennaParam"', dom_source)
        self.assertNotIn("deepMimoDownloadLink", dom_source)
        self.assertNotIn("deepMimoSceneBuffer", dom_source)
        self.assertIn("deepMimoGridSpacing: null", dom_source)
        self.assertNotIn("deepMimoJobStatus", dom_source)
        self.assertNotIn("deepMimoProgress", dom_source)
        self.assertIn("deepMimoTxDeviceCard: null", dom_source)
        self.assertIn('deepMimoTxDeviceCard: "deepMimoTxDeviceCard"', dom_source)
        self.assertIn('btnDeepMimoPickRoi: "btnDeepMimoPickRoi"', dom_source)
        self.assertIn('btnDeepMimoClearRoi: "btnDeepMimoClearRoi"', dom_source)
        self.assertIn("inputs[key] = controlSurface.element(key);", dom_source)
        self.assertIn("export function createDeepMimoState()", state_source)
        self.assertIn("tx: null", state_source)
        self.assertIn("maxReceivers: 30000", state_source)
        self.assertIn("visualZ: null", state_source)
        self.assertIn("datasets: []", state_source)
        self.assertIn("datasetTrayOpen: false", state_source)
        self.assertIn('/js/app_state.js?v=20260723-radar-shared-groups', app_source)
        self.assertIn('/js/dom_refs.js?v=20260519-mode-isolation', app_source)
        self.assertIn('/js/solver_controls.js?v=20260723-empty-devices', app_source)
        self.assertIn('/js/scene_render_state.js?v=20260723-empty-devices', app_source)
        self.assertNotIn('ui.deepMimoDatasetToggle.addEventListener("click"', app_source)
        self.assertIn('name: "deepmimo.datasets.toggle"', dataset_component)
        self.assertIn("featureRegistry.instance(definition.id)?.closeTransientUi?.();", app_source)
        self.assertIn("featureRegistry.activate(definition.id, context);", app_source)
        self.assertIn('id: "deepmimo"', app_source)
        self.assertIn('openDevicePrecision("deepmimo-tx")', app_source)
        self.assertIn("context.featureServices.picking.toggleTarget(\"deepmimo-roi\")", app_source)
        self.assertIn("if (state.pickTarget === targetId || state.deviceControl.activeTarget === targetId)", app_source)
        self.assertIn("feature.cancelPicking?.(definition);", app_source)
        self.assertIn("state.pickTarget = targetId;", app_source)
        self.assertIn("feature.startPickDrag(position, definition);", app_source)
        self.assertIn("feature?.updatePickDrag?.(position, definition);", app_source)
        self.assertIn("feature?.finishPickDrag?.(position, definition);", app_source)
        self.assertIn('if (target.role === "roi")', app_source)
        self.assertIn("const activeTargetMeta = picking.get(nextActiveTarget);", scene_source)
        self.assertIn("const hasPrecisionTarget = Boolean(activeTargetMeta?.precision);", scene_source)
        self.assertIn('!sceneControlsVisible || !hasPrecisionTarget', scene_source)
        self.assertIn('import("/js/viewer.js?v=20260722-radar-screen-labels")', scene_source)
        self.assertIn("for (const target of picking.targetsFor(definition.id))", scene_source)
        self.assertIn("for (const ref of definition.ui.extraActionButtonRefs || [])", scene_source)
        self.assertIn("for (const filtered of activeUi.filteredParameterGroups || [])", scene_source)
        self.assertIn("features.render(context);", scene_source)
        self.assertIn("const DEEPMIMO_FIXED_ANTENNA_ARRAY = Object.freeze({", solver_source)
        self.assertIn("numRows: 1", solver_source)
        self.assertIn("numCols: 1", solver_source)
        self.assertIn("verticalSpacing: 0.5", solver_source)
        self.assertIn("horizontalSpacing: 0.5", solver_source)
        self.assertIn('pattern: "iso"', solver_source)
        self.assertIn('polarization: "V"', solver_source)
        self.assertIn("setAntennaInputsDisabled(refs, fixedForDeepMimo);", solver_source)
        self.assertIn('context.features.get(state.mode)?.sharedControlPolicy?.antenna === "fixed"', solver_source)
        self.assertIn("function readDeepMimoRoiInputs()", solver_source)
        self.assertIn("function setDeepMimoRoiFromCenter", solver_source)
        self.assertNotIn("z: Math.max(Number(cornerA[2] || 0), Number(cornerB[2] || 0))", solver_source)
        self.assertIn("state.deepmimo.roi.visualZ = visualZ;", solver_source)
        self.assertIn("state.deepmimo.roi.cornerB = [Number(position[0]), Number(position[1]), visualZ];", solver_source)
        self.assertIn("state.deepmimo.roi.visualZ = null;", solver_source)
        self.assertIn("function deepMimoPayload(", solver_source)
        self.assertIn("function deepMimoReceiverAxisCount(size, spacing)", solver_source)
        # Frontend mirrors backend receiver_grid_axis_count (inclusive floor +
        # 1, with the same 1e-9 epsilon).
        self.assertIn("Math.floor((numericSize / numericSpacing) + 1e-9) + 1", solver_source)
        self.assertIn("const nx = deepMimoReceiverAxisCount(bounds.size[0], spacing);", solver_source)
        self.assertNotIn("Math.ceil(Number(size) / spacing + 0.5)", solver_source)
        self.assertIn('ui.deepMimoRxCandidates.value = bounds && Number.isFinite(estimate)', solver_source)
        self.assertIn("tx: {position: txPosition, orientation: [0, 0, 0]}", solver_source)
        self.assertIn('setLogicalAndVisual(state.deepmimo, "tx"', solver_source)
        self.assertNotIn("buffer_m", solver_source)
        self.assertNotIn("crop_to_roi", solver_source)
        self.assertNotIn("ui.deepMimoJobStatus", solver_source)
        self.assertIn("Load at least one selected tile before exporting DeepMIMO", solver_source)
        self.assertIn("getViewer().loadedTileIds.size", solver_source)
        self.assertIn("synthetic_array: true", solver_source)
        self.assertIn("includeTxArray: false", deepmimo_payload_source)
        self.assertNotIn("tx_array", deepmimo_payload_source)
        self.assertNotIn("rx_array", deepmimo_payload_source)
        self.assertIn("createDeepMimoController", solver_source)
        self.assertIn("createDeepMimoJob(payload)", solver_source)
        self.assertRegex(solver_source, r"state\.deepmimo\.jobId = null;\s+state\.deepmimo\.result = null;")
        self.assertRegex(solver_source, r'state\.deepmimo\.jobId = null;\s+state\.deepmimo\.status = "failed";')
        self.assertNotIn("ui.deepMimoProgress", solver_source)
        self.assertIn("function renderDeepMimoDatasetTray()", solver_source)
        self.assertIn("addDeepMimoDataset(job);", solver_source)
        self.assertIn("cancelDeepMimoExport(jobId);", solver_source)
        self.assertIn('cancelLabel: "Cancel Export"', solver_source)
        self.assertIn('if (job.status === "cancelled")', solver_source)
        self.assertIn('if (job.status === "succeeded")', solver_source)
        self.assertIn('state.deepmimo.status = "succeeded";', solver_source)
        self.assertIn("state.deepmimo.datasets = [", solver_source)
        self.assertIn("deepMimoDownloadUrl(jobId)", solver_source)
        self.assertIn('const visible = state.mode === "deepmimo" && datasets.length > 0;', dataset_view_source)
        self.assertIn("state.deepmimo.datasetTrayOpen = false;", dataset_view_source)
        self.assertIn("bridge.update({", dataset_view_source)
        self.assertNotIn("document.createElement", dataset_view_source)
        self.assertNotIn("ui.deepMimoDownloadLink", solver_source)
        self.assertIn('title: "Exporting DeepMIMO Dataset"', solver_source)
        self.assertIn("await pollDeepMimo(job.job_id);", solver_source)
        self.assertIn('if (bounds && state.mode === "deepmimo")', solver_source)
        self.assertIn("getViewer().renderDeepMimoRoi(bounds, state.deepmimo.roi.visualZ);", solver_source)
        self.assertIn("renderDeepMimoRoi(bounds, visualZ = 0)", viewer_source)
        self.assertIn("const z = Number(visualZ || 0) + 0.18;", viewer_source)
        self.assertIn("depthTest: false", viewer_source)
        self.assertIn("clearDeepMimoRoi()", viewer_source)
        self.assertIn('aria-label="DeepMIMO scenario name details"', html)
        self.assertIn("Dataset folder/name used in the DeepMIMO export.", html)
        self.assertIn('aria-label="DeepMIMO ROI center X details"', html)
        self.assertIn("ROI rectangle center X coordinate in the local scene frame.", html)
        self.assertIn('aria-label="DeepMIMO ROI width details"', html)
        self.assertIn("Rectangle span along local X.", html)
        self.assertIn('aria-label="DeepMIMO Rx spacing details"', html)
        self.assertIn("Smaller spacing creates denser datasets and higher runtime.", html)
        self.assertIn('aria-label="DeepMIMO Rx height details"', html)
        self.assertIn("Receiver height above the sampled terrain surface.", html)
        self.assertIn("The ROI footprint controls XY only.", html)
        self.assertIn('aria-label="DeepMIMO max receivers details"', html)
        self.assertIn("Safety cap for generated receiver candidates.", html)
        self.assertIn('aria-label="DeepMIMO chunk size details"', html)
        self.assertIn("Receivers traced per worker batch.", html)
        self.assertIn('aria-label="DeepMIMO samples per source details"', html)
        self.assertIn("Monte Carlo rays per transmitter for each chunk.", html)
        self.assertIn('aria-label="DeepMIMO max paths per source details"', html)
        self.assertIn("Upper bound on paths retained per solve.", html)
        self.assertIn('aria-label="DeepMIMO Rx candidates details"', html)
        self.assertIn("Read-only estimate of receiver grid points before building filtering.", html)
        self.assertIn('aria-label="DeepMIMO building footprint filter details"', html)
        self.assertIn("Drops receiver candidates inside building footprint boxes before terrain projection.", html)
        self.assertIn(".modeMenuItem.active", css_source)
        self.assertIn(".deepMimoDatasetTray", css_source)
        self.assertIn(".deepMimoDatasetPanel", css_source)
        self.assertIn(".deepMimoDatasetDownload", css_source)
        self.assertNotIn(".deepMimoDownload{", css_source)
        self.assertNotIn(".deepMimoProgressTrack", css_source)


if __name__ == "__main__":
    unittest.main()
