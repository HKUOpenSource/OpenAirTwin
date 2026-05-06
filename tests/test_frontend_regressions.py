from __future__ import annotations

from pathlib import Path
import unittest


PROJECT_ROOT = Path(__file__).resolve().parents[1]


def read_static_js(name: str) -> str:
    return (PROJECT_ROOT / "backend" / "static" / "js" / name).read_text(encoding="utf-8")


class FrontendRegressionTests(unittest.TestCase):
    def test_entry_search_focus_does_not_reset_selection_badge(self) -> None:
        source = read_static_js("entry_map.js")

        self.assertNotIn("updateEntryMapBadge(tileId)", source)
        self.assertIn("syncEntryOverviewUi();\n    setEntrySearchHint(`Located in", source)

    def test_loaded_tile_status_requires_all_tile_bundles(self) -> None:
        source = read_static_js("viewer.js")

        self.assertIn("this.tileBundleCounts = new Map();", source)
        self.assertIn("this.tileExpectedBundleCounts = new Map();", source)
        self.assertIn("loadedCount === expectedCount", source)
        self.assertNotIn("loadedTileIds.add(bundle.tile)", source)

    def test_rt_capabilities_are_loaded_for_antenna_arrays(self) -> None:
        api_source = read_static_js("api.js")
        app_source = read_static_js("app.js")
        state_source = read_static_js("app_state.js")

        self.assertIn('requestJson("/api/rt/capabilities")', api_source)
        self.assertIn("state.rtCapabilities = await getRtCapabilities();", app_source)
        self.assertIn("solverControls.applyRtCapabilities(state.rtCapabilities);", app_source)
        self.assertIn("txArray: createDefaultAntennaArray()", state_source)
        self.assertIn("rxArray: createDefaultAntennaArray()", state_source)

    def test_antenna_array_payloads_are_sent_to_solvers(self) -> None:
        source = read_static_js("solver_controls.js")
        html = (PROJECT_ROOT / "backend" / "static" / "index.html").read_text(encoding="utf-8")

        self.assertIn("tx_array: antennaArrayPayload(state.antenna.txArray)", source)
        self.assertIn("rx_array: antennaArrayPayload(state.antenna.rxArray)", source)
        self.assertIn("...commonSolverConfig(),\n      samples_per_tx", source)
        self.assertIn('id="txArrayPattern"', html)
        self.assertIn('id="rxArrayPattern"', html)
        self.assertIn('class="paramField linkOnlyParam" for="rxArrayPattern"', html)

    def test_path_details_show_array_pair_aggregation(self) -> None:
        source = read_static_js("solver_controls.js")

        self.assertIn('addField("Array Pairs", String(path.array_pair_count ?? 1));', source)
        self.assertIn('addField("Strongest Pair", formatFixed(path.strongest_pair_power_db, 2, " dB"));', source)

    def test_link_results_live_in_right_side_dock(self) -> None:
        html = (PROJECT_ROOT / "backend" / "static" / "index.html").read_text(encoding="utf-8")
        source = read_static_js("solver_controls.js")

        dock_start = html.index('id="linkChannelSection"')
        link_panel_start = html.index('id="linkPanel"')
        radiomap_panel_start = html.index('id="radiomapPanel"')
        dock_html = html[dock_start:link_panel_start]
        link_panel_html = html[link_panel_start:radiomap_panel_start]
        tap_index = dock_html.index('id="linkTapAnalysisSection"')
        selection_index = dock_html.index('id="pathSelectionSection"')
        buttons_index = dock_html.index('id="pathButtons"')

        self.assertIn("Link Results", dock_html)
        self.assertIn('id="linkResult"', dock_html)
        self.assertIn('id="pathSelectionSection"', dock_html)
        self.assertIn('id="pathSelectionCount"', dock_html)
        self.assertIn('id="pathButtons"', dock_html)
        self.assertIn('id="pathDetailSection"', dock_html)
        self.assertIn('id="linkTapAnalysisSection"', dock_html)
        self.assertLess(tap_index, selection_index)
        self.assertLess(selection_index, buttons_index)
        self.assertNotIn('id="linkResult"', link_panel_html)
        self.assertNotIn('id="pathSelectionSection"', link_panel_html)
        self.assertNotIn('id="pathButtons"', link_panel_html)
        self.assertNotIn('id="pathDetailSection"', link_panel_html)
        self.assertNotIn("Channel Result", html)
        self.assertIn("function renderPathSelection(paths, selectedIndex, onSelect)", source)
        self.assertIn('ui.pathSelectionSection.classList.add("hidden");', source)
        self.assertIn('ui.pathSelectionSection.classList.remove("hidden");', source)
        self.assertIn("getViewer().renderPaths(result.paths, index);", source)
        self.assertIn("getViewer().renderPaths(paths, index);", source)

    def test_tap_analysis_no_longer_controls_whole_link_result_dock(self) -> None:
        source = read_static_js("solver_controls.js")
        render_channel = source[
            source.index("function renderLinkChannel"):
            source.index("function renderLinkResult")
        ]

        self.assertIn('ui.linkTapAnalysisSection.classList.add("hidden");', render_channel)
        self.assertIn('ui.linkTapAnalysisSection.classList.remove("hidden");', render_channel)
        self.assertNotIn("ui.linkChannelSection.classList.add", render_channel)
        self.assertNotIn("ui.linkChannelSection.classList.remove", render_channel)

    def test_tap_chart_axes_are_labeled_and_not_clipped(self) -> None:
        source = read_static_js("solver_controls.js")
        html = (PROJECT_ROOT / "backend" / "static" / "index.html").read_text(encoding="utf-8")
        css = (PROJECT_ROOT / "backend" / "static" / "css" / "app.css").read_text(encoding="utf-8")

        self.assertIn('viewBox="0 0 420 172"', html)
        self.assertIn("x-axis Tap Index, y-axis Power in dB", html)
        self.assertIn("const left = 68;", source)
        self.assertNotIn("const left = 36;", source)
        self.assertIn('yAxisTitle.textContent = "Power (dB)";', source)
        self.assertIn('xAxisTitle.textContent = "Tap Index";', source)
        self.assertIn("const yTicks = [", source)
        self.assertIn('desc.textContent = "X-axis shows Tap Index. Y-axis shows tap power in dB.', source)
        self.assertIn("tapGrid", css)

    def test_mobility_mode_controls_and_api_are_wired(self) -> None:
        api_source = read_static_js("api.js")
        app_source = read_static_js("app.js")
        state_source = read_static_js("app_state.js")
        source = read_static_js("solver_controls.js")
        html = (PROJECT_ROOT / "backend" / "static" / "index.html").read_text(encoding="utf-8")

        self.assertIn('id="tabMobility"', html)
        self.assertIn('id="btnRunMobility"', html)
        self.assertIn('id="mobilityWaypointList"', html)
        self.assertIn('id="mobilityMaxSteps" type="number" step="1" min="2" max="500" value="50"', html)
        self.assertIn('id="mobilitySeriesChart"', html)
        self.assertIn('requestJson("/api/mobility/jobs"', api_source)
        self.assertIn("getMobilityJob", api_source)
        self.assertIn("getMobilityResult", api_source)
        self.assertIn("state.mode = \"mobility\";", app_source)
        self.assertIn("state.link.advanced.computeTaps = true;", app_source)
        self.assertIn("createMobilityJob", app_source)
        self.assertIn("mobility:", state_source)
        self.assertIn("rx_trajectory: {", source)
        self.assertIn("points: state.mobility.trajectory.points", source)
        self.assertIn("max_steps: state.mobility.trajectory.maxSteps", source)
        self.assertIn("${estimate.steps} / ${estimate.maxSteps} steps", source)
        self.assertNotIn("estimate.steps > 50", source)
        self.assertIn("solver: linkSolverConfig()", source)
        self.assertIn("channel: linkChannelConfig()", source)
        self.assertIn("getViewer().renderPaths(sample?.paths || [], -1);", source)

    def test_mobility_uses_shared_result_dock_and_viewer_preview(self) -> None:
        source = read_static_js("solver_controls.js")
        viewer_source = read_static_js("viewer.js")
        scene_source = read_static_js("scene_render_state.js")
        html = (PROJECT_ROOT / "backend" / "static" / "index.html").read_text(encoding="utf-8")

        self.assertIn('id="mobilityResult"', html)
        self.assertIn('id="mobilityTimelineSection"', html)
        self.assertIn('ui.resultDockTitle.textContent = "Mobility Results";', source)
        self.assertIn("function renderMobilityResult()", source)
        self.assertIn("function renderMobilitySeriesChart(result)", source)
        self.assertIn("renderPathDetails(paths, state.mobility.selectedPath);", source)
        self.assertIn("renderMobilityResult();", scene_source)
        self.assertIn("renderMobilityTrajectory(points = [], samples = [], selectedIndex = -1)", viewer_source)
        self.assertIn("this.mobilityGroup = new THREE.Group();", viewer_source)

    def test_tx_orbit_showcase_button_is_wired(self) -> None:
        html = (PROJECT_ROOT / "backend" / "static" / "index.html").read_text(encoding="utf-8")
        app_source = read_static_js("app.js")
        state_source = read_static_js("app_state.js")
        dom_source = read_static_js("dom_refs.js")
        scene_source = read_static_js("scene_render_state.js")
        viewer_source = read_static_js("viewer.js")

        action_bar_index = html.index('id="deviceActionBar"')
        orbit_index = html.index('id="btnOrbitTx"')
        solve_index = html.index('id="btnSolveLink"')

        self.assertLess(action_bar_index, orbit_index)
        self.assertLess(orbit_index, solve_index)
        self.assertIn('aria-label="Orbit around transmitter"', html)
        self.assertIn('btnOrbitTx: document.getElementById("btnOrbitTx")', dom_source)
        self.assertIn("startTxOrbit() { return false; }", state_source)
        self.assertIn("stopTxOrbit() {}", state_source)
        self.assertIn("isTxOrbiting() { return false; }", state_source)
        self.assertIn("startTxOrbit(center)", viewer_source)
        self.assertIn("stopTxOrbit()", viewer_source)
        self.assertIn("isTxOrbiting()", viewer_source)
        self.assertIn('window.dispatchEvent(new CustomEvent("hku-tx-orbit-change"', viewer_source)
        self.assertIn("return state.mode === \"radiomap\" ? state.radiomap.txVisual : state.link.txVisual;", app_source)
        self.assertIn("ui.btnOrbitTx.addEventListener(\"click\", toggleTxOrbit);", app_source)
        self.assertIn("window.addEventListener(\"hku-tx-orbit-change\"", app_source)
        self.assertIn("stopTxOrbit();\n    state.mode = \"link\";", app_source)
        self.assertIn("stopTxOrbit();\n    state.mode = \"mobility\";", app_source)
        self.assertIn("stopTxOrbit();\n    state.mode = \"radiomap\";", app_source)
        self.assertIn("ui.btnResetView.addEventListener(\"click\", () => {\n    stopTxOrbit();", app_source)
        self.assertIn("ui.btnOrbitTx.classList.toggle(\"active\", orbitingTx);", scene_source)
        self.assertIn('ui.btnOrbitTx.querySelector(".deviceActionText").textContent = orbitingTx ? "Stop" : "Orbit";', scene_source)


if __name__ == "__main__":
    unittest.main()
