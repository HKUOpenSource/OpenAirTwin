from __future__ import annotations

from pathlib import Path
import re
import unittest


PROJECT_ROOT = Path(__file__).resolve().parents[1]
STATIC_JS_ROOT = PROJECT_ROOT / "backend" / "static" / "js"
STATIC_HTML = PROJECT_ROOT / "backend" / "static" / "index.html"
WORKBENCH_SRC = PROJECT_ROOT / "workbench" / "src"
WORKBENCH_CSS = WORKBENCH_SRC / "styles" / "workbench.css"


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


def read_workbench_ui_sources() -> str:
    modules: list[str] = []
    for path in sorted(WORKBENCH_SRC.rglob("*.tsx")):
        if "test" in path.relative_to(WORKBENCH_SRC).parts:
            continue
        relative = path.relative_to(PROJECT_ROOT).as_posix()
        modules.append(f"\n/* {relative} */\n{path.read_text(encoding='utf-8')}")
    return "\n".join(modules)


def read_workbench_css() -> str:
    return WORKBENCH_CSS.read_text(encoding="utf-8")


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

    def test_controller_factory_public_facades_remain_stable(self) -> None:
        solver_methods = exported_controller_methods(
            read_static_js("solver_controls.js"),
            "createSolverControlsController",
        )
        scene_methods = exported_controller_methods(
            read_static_js("scene_render_state.js"),
            "createSceneRenderStateController",
        )

        self.assertTrue(
            {
                "applyRtCapabilities",
                "commonSolverConfig",
                "linkSolverConfig",
                "linkChannelConfig",
                "syncViewerMarkers",
                "syncModeVisuals",
                "markerRadiusForPickTarget",
                "invalidateLinkResult",
                "invalidateRadarResult",
                "invalidateRadiomapResult",
                "invalidateMobilityResult",
                "invalidateDeepMimoResult",
                "rerenderRadiomapOverlay",
                "renderMobilityTrajectoryPreview",
                "renderDeepMimoState",
                "publishControls",
                "startDeepMimoRoiDrag",
                "updateDeepMimoRoiDrag",
                "finishDeepMimoRoiDrag",
                "clearDeepMimoRoi",
                "addCurrentRxWaypoint",
                "deleteMobilityWaypoint",
                "resetMobilityTrajectoryFromRx",
                "handleLivePreviewDeviceUpdate",
                "applyPick",
                "updateDeviceCoordinate",
                "setSurfaceClearanceM",
            } <= solver_methods
        )
        self.assertTrue(
            {
                "setProgress",
                "cancelOverlay",
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
            } <= scene_methods
        )

    def test_app_dialog_controller_replaces_native_browser_popups(self) -> None:
        frontend_source = read_frontend_js_modules()
        app_source = read_static_js("app.js")
        entry_source = read_static_js("entry_map.js")
        dialog_source = read_static_js("controllers/app_dialog_controller.js")
        overlays_source = (WORKBENCH_SRC / "app-shell" / "AppOverlays.tsx").read_text(encoding="utf-8")

        for native_call in ["window.alert(", "window.confirm(", "window.prompt("]:
            self.assertNotIn(native_call, frontend_source)

        self.assertIn("@astryxdesign/core/Dialog", overlays_source)
        self.assertIn("dialog.primary", overlays_source)
        self.assertIn("dialog.secondary", overlays_source)
        self.assertIn("dialog.close", overlays_source)

        self.assertIn("createAppDialogController(context)", app_source)
        self.assertIn("dialogs: dialogController,", app_source)
        self.assertIn('command.name === "dialog.primary"', app_source)
        self.assertIn("dialogController.confirmActiveDialog()", app_source)
        self.assertIn("dialogController?.dispose?.();", app_source)
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
        self.assertNotIn("Click the tile on the map", source)

    def test_loaded_tile_status_requires_all_tile_bundles(self) -> None:
        source = read_static_js("viewer.js")

        self.assertIn("this.tileBundleCounts = new Map();", source)
        self.assertIn("this.tileExpectedBundleCounts = new Map();", source)
        self.assertIn("loadedCount === expectedCount", source)
        self.assertNotIn("loadedTileIds.add(bundle.tile)", source)

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

        self.assertIn(
            "TERRAIN_TB: {\n    renderOrder: 0,\n    polygonOffsetFactor: 8,\n    polygonOffsetUnits: 8,\n    depthWrite: false,\n    depthTest: true,",
            source,
        )
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

        self.assertIn(": formatBytes(event.downloadedBytes);", source)
        self.assertIn("return `Loading ${visibleBundleCount}/${bundleTotal} · ${totalSize} · ${rate}`;", source)
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
        self.assertIn("Downloadable from Open3DHK.", source)
        self.assertIn("if (state.entry.overview) {", app_source)
        self.assertIn("entryMapController.showEntryScreen({syncOverview: false});", app_source)

    def test_entry_map_uses_open3dhk_coverage_for_clickable_download_tiles(self) -> None:
        source = read_static_js("entry_map.js")
        api_source = read_static_js("api.js")
        app_source = read_static_js("app.js")
        entry_ui = (WORKBENCH_SRC / "app-shell" / "EntryMapScreen.tsx").read_text(encoding="utf-8")

        self.assertIn("export function getOpen3dHkTileCoverage()", api_source)
        self.assertIn("const [rtCapabilities, manifest, coverage] = await Promise.all([", app_source)
        self.assertIn("getOpen3dHkTileCoverage(),", app_source)
        self.assertIn("state.entry.coverage = coverage;", app_source)
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
        self.assertIn("Available", entry_ui)
        self.assertIn("Downloadable", entry_ui)

    def test_rt_capabilities_are_loaded_for_antenna_arrays(self) -> None:
        api_source = read_static_js("api.js")
        app_source = read_static_js("app.js")
        state_source = read_frontend_js_modules()

        self.assertIn("export function getRtCapabilities()", api_source)
        self.assertIn("const [rtCapabilities, manifest, coverage] = await Promise.all([", app_source)
        self.assertIn("getRtCapabilities(),", app_source)
        self.assertIn("state.rtCapabilities = rtCapabilities;", app_source)
        self.assertIn("solverControls.applyRtCapabilities(state.rtCapabilities);", app_source)
        self.assertIn("txArray: createDefaultAntennaArray()", state_source)
        self.assertIn("rxArray: createDefaultAntennaArray()", state_source)

    def test_rt_scene_selection_is_synced_after_tile_load(self) -> None:
        api_source = read_static_js("api.js")
        source = read_frontend_js_modules()

        self.assertIn("export function getRtSceneSelection()", api_source)
        self.assertIn('requestJson("/api/rt/scene-selection", {', api_source)
        self.assertIn("getRtSceneSelection,", source)
        self.assertIn("setRtSceneSelection,", source)
        self.assertIn("async function waitForRtSceneSelection(generation, tileIds)", source)
        self.assertIn("async function syncRtSceneSelection(selectedTileIds)", source)
        self.assertIn('message: "Loading scene..."', source)
        self.assertIn("const status = await api.setRtSceneSelection(tileIds);", source)
        self.assertIn("return waitForRtSceneSelection(status.generation, tileIds);", source)
        self.assertIn("await syncRtSceneSelection(selectedTiles);", source)
        self.assertIn("state.tileLoadBusy = true;", source)
        self.assertRegex(source, r"if \(state\.tileLoadBusy\) \{\s+return;\s+\}")
        self.assertRegex(source, r"const selectedTileIds = .*tileSelections\(\);")
        self.assertIn("solver().invalidateMobilityResult({clearOverlay: false, clearPaths: false});", source)
        self.assertIn("rtSceneReadyForSelection(status, tileIds)", source)

    def test_top_workspace_bar_owns_mode_switcher_and_utility_popovers(self) -> None:
        top_bar = (WORKBENCH_SRC / "app-shell" / "TopWorkspaceBar.tsx").read_text(encoding="utf-8")
        app_source = read_static_js("app.js")
        css_source = read_workbench_css()

        self.assertIn("SegmentedControl", top_bar)
        self.assertIn("workbench.mode.select", top_bar)
        self.assertIn("entry.scene.open", top_bar)
        self.assertIn("performance.mode.select", top_bar)
        self.assertIn("deepmimo.datasets.toggle", top_bar)
        self.assertIn("workbench.controls.toggle", top_bar)
        self.assertIn("results.dock.toggle", top_bar)
        self.assertIn('command.name === "workbench.mode.select"', app_source)
        self.assertIn(".oat-topbar", css_source)

    def test_left_inspector_organizes_mode_controls_with_astryx_primitives(self) -> None:
        left_inspector = (WORKBENCH_SRC / "features" / "controls" / "LeftInspector.tsx").read_text(encoding="utf-8")
        shared_controls = (WORKBENCH_SRC / "features" / "controls" / "SharedSolverControls.tsx").read_text(encoding="utf-8")
        link_controls = (WORKBENCH_SRC / "features" / "controls" / "LinkControls.tsx").read_text(encoding="utf-8")

        self.assertIn("TabList", left_inspector)
        self.assertIn('value="workflow"', left_inspector)
        self.assertIn('value="solver"', left_inspector)
        self.assertIn("SharedSolverControls", left_inspector)
        self.assertIn("Physical Layer & Ray Tracing", shared_controls)
        self.assertIn("Tx Antenna Array", shared_controls)
        self.assertIn("Compute Discrete Taps", link_controls)

    def test_radar_starts_without_devices_or_targets(self) -> None:
        state_source = read_static_js("features/radar/state.js")
        controls_source = read_static_js("features/radar/controls.js")
        radar_ui = (WORKBENCH_SRC / "features" / "controls" / "RadarControls.tsx").read_text(encoding="utf-8")
        runtime_source = read_static_js("features/radar/runtime.js")

        self.assertIn("tx: null", state_source)
        self.assertIn("txVisual: null", state_source)
        self.assertIn("rx: null", state_source)
        self.assertIn("rxVisual: null", state_source)
        self.assertIn("targets: []", state_source)
        self.assertIn("nextTargetNumber: 1", state_source)
        self.assertIn("selectedTargetId: null", state_source)
        self.assertNotIn("DEFAULT_TARGETS", state_source)
        self.assertIn("radarAssetPreviewCanvas", radar_ui)
        self.assertIn("const INITIAL_SPEED_MIN_MPS = 5", controls_source)
        self.assertIn("const INITIAL_SPEED_MAX_MPS = 15", controls_source)
        self.assertIn("const INITIAL_DIRECTION_MIN_DEG = -180", controls_source)
        self.assertIn("const INITIAL_DIRECTION_MAX_DEG = 180", controls_source)
        self.assertIn("const INITIAL_CLIMB_MIN_DEG = -10", controls_source)
        self.assertIn("const INITIAL_CLIMB_MAX_DEG = 10", controls_source)
        self.assertIn("const motion = randomInitialMotion();", controls_source)
        self.assertIn("velocity: motion.velocity", controls_source)
        self.assertIn('return "Place Radar Tx and Rx before running sensing."', controls_source)
        self.assertIn("controls.deviceRequirementMessage()", runtime_source)

    def test_other_modes_start_without_devices(self) -> None:
        solver_source = read_static_js("solver_controls.js")
        payload_source = read_static_js("solvers/solver_payloads.js")
        device_bar = (WORKBENCH_SRC / "app-shell" / "DeviceBar.tsx").read_text(encoding="utf-8")
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

        self.assertIn("workbench.device.coord", device_bar)
        self.assertIn("surfaceClearanceM", device_bar)
        all_frontend = read_frontend_js_modules()
        self.assertIn("setLogicalAndVisual(state.link, target.role", all_frontend)
        self.assertIn("setLogicalAndVisual(state.mobility, target.role", all_frontend)
        self.assertIn('setLogicalAndVisual(state.radiomap, "tx"', all_frontend)
        self.assertIn("runRequirementMessage", solver_source)
        self.assertIn("Place Link Tx before solving the link.", payload_source)
        self.assertIn("Place Radio Map Tx before running the radio map.", payload_source)
        self.assertIn("Place Mobility Tx before running mobility.", payload_source)
        self.assertIn("Place DeepMIMO Tx before exporting data.", payload_source)

    def test_antenna_array_payloads_are_sent_to_solvers(self) -> None:
        source = read_frontend_js_modules()
        shared_controls = (WORKBENCH_SRC / "features" / "controls" / "SharedSolverControls.tsx").read_text(encoding="utf-8")

        self.assertIn("solverConfig.tx_array = antennaArrayPayload(state.antenna.txArray)", source)
        self.assertIn("rx_array: antennaArrayPayload(state.antenna.rxArray)", source)
        self.assertRegex(source, r"\.\.\.commonSolverConfig\([^)]*\),\n\s+samples_per_tx")
        self.assertIn("samples_per_tx: state.radiomap.solver.samplesPerTx", source)
        self.assertIn('update("pattern"', shared_controls)
        self.assertIn('update("polarization"', shared_controls)

    def test_radiomap_ui_parameters_are_wired(self) -> None:
        source = read_frontend_js_modules()
        colormap_source = read_static_js("colormaps.js")
        radiomap_controls = (WORKBENCH_SRC / "features" / "controls" / "RadiomapControls.tsx").read_text(encoding="utf-8")
        result_drawer = (WORKBENCH_SRC / "features" / "results" / "RightAnalysisDrawer.tsx").read_text(encoding="utf-8")

        self.assertIn("samplesPerTx", radiomap_controls)
        self.assertIn("cellSize", radiomap_controls)
        self.assertIn("colormap", radiomap_controls)
        self.assertIn("RadiomapResultsBlock", result_drawer)
        self.assertIn("radiomapColorbarBar", result_drawer)
        self.assertIn("solver: {samplesPerTx: 1000000}", source)
        self.assertIn('colormap: "jet"', source)
        self.assertIn("surface.cell_size = state.radiomap.surface.cellSize", source)
        self.assertIn("samples_per_tx: state.radiomap.solver.samplesPerTx", source)
        self.assertNotIn("samples_per_tx: 1000000", source)
        self.assertNotIn("state.livePreview.radiomap", source)
        self.assertNotIn("function scheduleRadiomapPreview", source)
        self.assertNotIn("function runRadiomapLiveJob", source)
        self.assertIn('throw new Error(job.error || job.message || "Radio map job failed");', source)
        self.assertIn("createRadiomapController", source)
        self.assertRegex(source, r"state\.radiomap\.jobId = null;\s+state\.radiomap\.result = null;")
        self.assertRegex(
            source,
            r"const failure = requestFailureState\(error\);\s+"
            r"state\.radiomap\.status = failure\.status;\s+"
            r"state\.radiomap\.failureKind = failure\.kind;\s+"
            r"state\.radiomap\.result = null;",
        )
        self.assertIn('surface.resolution_mode === "cell_size_grid"', source)
        self.assertIn('`${nx} × ${ny} (${formatCount(surface.grid_cell_count)})`', source)
        self.assertIn("surface.triangle_count", source)
        self.assertIn("colormapGradient(colormap)", source)
        self.assertIn("Colormap: ${colormap}", source)
        self.assertIn("Display limits: ${minDb.toFixed(0)} .. ${maxDb.toFixed(0)} dB", source)
        self.assertIn('import {colorForColormap} from "/js/colormaps.js";', source)
        self.assertIn('colorForColormap(primitive.colormap || "jet", clamp01', source)
        self.assertIn("values[triangle] !== null && Number.isFinite(value)", source)
        self.assertIn('? name : "jet"', colormap_source)
        self.assertIn('resultDock.update("radiomap"', source)

    def test_live_preview_controls_and_schedulers_are_wired(self) -> None:
        link_controls = (WORKBENCH_SRC / "features" / "controls" / "LinkControls.tsx").read_text(encoding="utf-8")
        device_bar = (WORKBENCH_SRC / "app-shell" / "DeviceBar.tsx").read_text(encoding="utf-8")
        app_source = read_frontend_js_modules()
        api_source = read_static_js("api.js")
        viewer_source = read_static_js("viewer.js")

        self.assertIn("livePreview", link_controls)
        self.assertIn("previewSamplesPerSrc", link_controls)
        self.assertIn("pathsDelayS", link_controls)
        self.assertIn("surfaceClearanceM", device_bar)
        self.assertIn("livePreview: {\n    enabled: false", app_source)
        self.assertIn("previewSamplesPerSrc: 1000", app_source)
        self.assertIn("surfaceClearanceM: 1.5", app_source)
        self.assertNotIn("mapDelayS: 3.0", app_source)
        self.assertNotIn("previewSamplesPerTx", app_source)
        self.assertIn("export function solveLink(payload, options = {})", api_source)
        self.assertIn("signal: options.signal", api_source)
        self.assertIn("function linkSolvePayload({preview = false} = {})", app_source)
        self.assertIn("solver.samples_per_src = Math.max(1, Math.floor(Number(state.livePreview.link.previewSamplesPerSrc)));", app_source)
        self.assertIn("solver.max_num_paths_per_src = Math.min(Number(solver.max_num_paths_per_src), 10000);", app_source)
        self.assertIn("channel.compute_taps = false;", app_source)
        self.assertIn("new AbortController()", app_source)
        self.assertIn("token !== live.generation", app_source)
        self.assertRegex(app_source, r"live\.previewController\?\.abort\(\);\s+live\.finalController\?\.abort\(\);")
        self.assertIn('setLivePreviewStatus("link", preview ? "Previewing" : "Finalizing");', app_source)
        self.assertNotIn('setLivePreviewStatus("radiomap"', app_source)
        self.assertIn('handleLivePreviewDeviceUpdate(target, phase = "change")', app_source)
        self.assertIn("surfacePosition: [hit.point.x, hit.point.y, hit.point.z]", viewer_source)
        self.assertIn("surfaceNormal: surfaceNormal ?", viewer_source)
        self.assertIn("devicePicking.clearActiveDevice({render: false});", app_source)
        self.assertIn("solverControls.cancelLivePreview();", app_source)
        self.assertIn('view.addEventListener("pointerdown", handlePickPointerDown, {capture: true});', app_source)
        self.assertIn("event.currentTarget.setPointerCapture(event.pointerId);", app_source)
        self.assertIn("pointerView?.releasePointerCapture(pointerId);", app_source)

    def test_path_details_show_array_pair_aggregation(self) -> None:
        source = read_frontend_js_modules()
        result_drawer = (WORKBENCH_SRC / "features" / "results" / "RightAnalysisDrawer.tsx").read_text(encoding="utf-8")

        self.assertIn('detailField("array-pairs", "Array Pairs", String(path.array_pair_count ?? 1))', source)
        self.assertIn('detailField("strongest-pair", "Strongest Pair", formatFixed(path.strongest_pair_power_db, 2, " dB"))', source)
        self.assertIn('detailField("variants", "Variants", `${variants} variants`)', source)
        self.assertIn('detailField("raw-paths", "Raw Paths", formatRawPathIndices(path), true)', source)
        self.assertIn('detailField("representative", "Representative", String(path.representative_path_index ?? path.path_index ?? "N/A"))', source)
        self.assertIn("const PATH_TYPE_LABELS = {", source)
        self.assertIn('LOS: "Line-of-sight"', source)
        self.assertIn('MIXED: "Mixed interactions"', source)
        self.assertIn("function formatPathSelectionMeta(paths, summary = null)", source)
        self.assertIn('return `${solverPaths} solver ${solverPaths === 1 ? "path" : "paths"}${mergedLabel}`;', source)
        self.assertIn("name: `${model.featureId}.path.select`", result_drawer)

    def test_link_and_mobility_results_live_in_right_analysis_drawer(self) -> None:
        source = read_frontend_js_modules()
        result_drawer = (WORKBENCH_SRC / "features" / "results" / "RightAnalysisDrawer.tsx").read_text(encoding="utf-8")
        css_source = read_workbench_css()

        self.assertIn('data-oat-react-owner="result-dock"', result_drawer)
        self.assertIn('id="linkTapChart"', result_drawer)
        self.assertIn('id="mobilitySeriesChart"', result_drawer)
        self.assertIn('viewBox="0 0 420 172"', result_drawer)
        self.assertIn("Power Delay Profile", result_drawer)
        self.assertIn("Discrete Channel Taps", result_drawer)
        self.assertIn("const left = 68;", source)
        self.assertNotIn("const left = 36;", source)
        self.assertIn('yAxisTitle.textContent = "Power (dB)";', source)
        self.assertIn('xAxisTitle.textContent = "Tap Index";', source)
        self.assertIn("tapGrid", css_source)
        self.assertIn('registerCommandHandler("link", (command) =>', source)
        self.assertIn('resultDock.registerCommandHandler("mobility"', source)
        self.assertIn("getViewer().renderPaths(result.paths, state.link.selectedPath);", source)
        self.assertIn("getViewer().renderPaths(sample.paths || [], state.mobility.selectedPath);", source)

    def test_mobility_mode_controls_and_api_are_wired(self) -> None:
        api_source = read_static_js("api.js")
        source = read_frontend_js_modules()
        mobility_controls = (WORKBENCH_SRC / "features" / "controls" / "MobilityControls.tsx").read_text(encoding="utf-8")
        mobility_runtime = read_static_js("features/mobility/runtime.js")

        self.assertIn("btnMobilityAddRxPoint", mobility_controls)
        self.assertIn("mobilityWaypoint.select", mobility_controls)
        self.assertIn("mobilityWaypoint.remove", mobility_controls)
        self.assertIn("btnMobilityClearPoints", mobility_controls)
        self.assertIn("maxSteps", mobility_controls)
        self.assertIn('requestJson("/api/mobility/jobs"', api_source)
        self.assertIn("getMobilityJob", api_source)
        self.assertIn("getMobilityResult", api_source)
        self.assertIn("state.link.advanced.computeTaps = true;", source)
        self.assertIn("export function createMobilityState()", source)
        self.assertIn("points: [],", source)
        self.assertIn("selectedWaypointIndex: -1", source)
        self.assertIn("mobilityWaypoint.select", mobility_runtime)
        self.assertIn("function deleteMobilityWaypoint(index = state.mobility.selectedWaypointIndex)", source)
        self.assertIn("state.mobility.trajectory.points = [];", source)
        self.assertIn("rx_trajectory: {", source)
        self.assertIn("tx: {position: txPosition, orientation: [0, 0, 0]}", source)
        self.assertIn("points: state.mobility.trajectory.points", source)
        self.assertIn("max_steps: state.mobility.trajectory.maxSteps", source)
        self.assertIn("applyPick(pick, target)", mobility_runtime)
        self.assertIn("createMobilityController", source)
        self.assertIn("renderMobilityTrajectory(points = [], samples = [], selectedIndex = -1)", source)

    def test_mode_specific_device_visuals_are_isolated(self) -> None:
        source = read_frontend_js_modules()
        viewer_source = read_static_js("viewer.js")

        self.assertIn('id: "mobility-tx", role: "tx", scope: "mobility"', source)
        self.assertIn('id: "mobility-rx", role: "rx", scope: "mobility"', source)
        self.assertIn("syncViewerMarkers();", source)
        self.assertIn("syncModeVisuals();", source)
        self.assertIn("context.features.instance(state.mode)?.markerPositions?.()", source)
        self.assertIn("return {tx: state.radiomap.txVisual, rx: null};", source)
        self.assertIn("return {tx: state.deepmimo.txVisual, rx: null};", source)
        self.assertIn("function syncModeVisuals()", source)
        self.assertIn("const activeLayers = new Set(context.features.get(state.mode)?.renderLayers || []);", source)
        self.assertIn('["radiomap", () => getViewer().clearRadiomap()]', source)
        self.assertIn('["roi", () => getViewer().clearDeepMimoRoi()]', source)
        self.assertIn('["trajectory", () => getViewer().clearMobility()]', source)
        self.assertIn('["paths", () => getViewer().clearPaths()]', source)
        self.assertIn("if (!activeLayers.has(layer))", source)
        self.assertIn('if (bounds && state.mode === "deepmimo")', source)
        self.assertIn('const shouldShow = state.mode === "radiomap"', source)
        self.assertIn("if (!Array.isArray(position)) {\n      this.stopTxOrbit();\n      this.txMarker.visible = false;", viewer_source)
        self.assertIn("if (!Array.isArray(position)) {\n      this.rxMarker.visible = false;", viewer_source)

    def test_tx_orbit_showcase_button_is_wired(self) -> None:
        device_bar = (WORKBENCH_SRC / "app-shell" / "DeviceBar.tsx").read_text(encoding="utf-8")
        app_source = read_frontend_js_modules()
        state_source = read_static_js("app_state.js")
        viewer_source = read_static_js("viewer.js")

        self.assertIn('actionId: "btnOrbitTx"', device_bar)
        self.assertIn("startTxOrbit() { return false; }", state_source)
        self.assertIn("stopTxOrbit() {}", state_source)
        self.assertIn("isTxOrbiting() { return false; }", state_source)
        self.assertIn("startTxOrbit(center)", viewer_source)
        self.assertIn("stopTxOrbit()", viewer_source)
        self.assertIn("isTxOrbiting()", viewer_source)
        self.assertIn('window.dispatchEvent(new CustomEvent("hku-tx-orbit-change"', viewer_source)
        self.assertIn("devicePicking.toggleTxOrbit();", app_source)
        self.assertIn('window.addEventListener("hku-tx-orbit-change"', app_source)
        self.assertIn("devicePicking.stopTxOrbit();", app_source)

    def test_deepmimo_roi_export_controls_are_wired(self) -> None:
        api_source = read_static_js("api.js")
        source = read_frontend_js_modules()
        viewer_source = read_static_js("viewer.js")
        dataset_view_source = read_static_js("ui/deepmimo_dataset_view.js")
        deepmimo_controls = (WORKBENCH_SRC / "features" / "controls" / "DeepMimoControls.tsx").read_text(encoding="utf-8")
        top_bar = (WORKBENCH_SRC / "app-shell" / "TopWorkspaceBar.tsx").read_text(encoding="utf-8")
        deepmimo_payload_source = source.split("export function deepMimoPayload(", 1)[1].split(
            "export function",
            1,
        )[0]

        self.assertIn("roiCenterX", deepmimo_controls)
        self.assertIn("roiWidth", deepmimo_controls)
        self.assertIn("gridSpacing", deepmimo_controls)
        self.assertIn("maxReceivers", deepmimo_controls)
        self.assertIn("deepmimo.datasets.toggle", top_bar)
        self.assertIn('requestJson("/api/deepmimo/jobs"', api_source)
        self.assertIn("export function cancelDeepMimoJob(jobId, options = {})", api_source)
        self.assertIn("`/api/deepmimo/jobs/${encodeURIComponent(jobId)}/cancel`", api_source)
        self.assertIn("`/api/deepmimo/jobs/${encodeURIComponent(jobId)}/download`", api_source)
        self.assertIn("export function createDeepMimoState()", source)
        self.assertIn("maxReceivers: 30000", source)
        self.assertIn("visualZ: null", source)
        self.assertIn("datasets: []", source)
        self.assertIn("datasetTrayOpen: false", source)
        self.assertIn("const DEEPMIMO_FIXED_ANTENNA_ARRAY = Object.freeze({", source)
        self.assertIn("function deepMimoReceiverAxisCount(size, spacing)", source)
        self.assertIn("Math.floor((numericSize / numericSpacing) + 1e-9) + 1", source)
        self.assertIn("includeTxArray: false", deepmimo_payload_source)
        self.assertNotIn("tx_array", deepmimo_payload_source)
        self.assertNotIn("rx_array", deepmimo_payload_source)
        self.assertIn("synthetic_array: true", source)
        self.assertIn("createDeepMimoController", source)
        self.assertIn("createDeepMimoJob(payload)", source)
        self.assertIn("datasetModel.update({", dataset_view_source)
        self.assertNotIn("document.createElement", dataset_view_source)
        self.assertIn('title: "Exporting DeepMIMO Dataset"', source)
        self.assertIn("renderDeepMimoRoi(bounds, visualZ = 0)", viewer_source)
        self.assertIn("clearDeepMimoRoi()", viewer_source)


if __name__ == "__main__":
    unittest.main()
