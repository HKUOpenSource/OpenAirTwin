import {createRadiomapJob, getManifest, getRadiomapJob, getRadiomapResult, solveLink} from "/js/api.js";
import {entryMap, PERFORMANCE_MODES, state, viewerRef} from "/js/app_state.js";
import {inputs, ui} from "/js/dom_refs.js";
import {createEntryMapController} from "/js/entry_map.js";
import {createParamTooltipController} from "/js/param_tooltips.js";
import {createPerformancePanelController} from "/js/performance_panel.js";
import {createSceneRenderStateController} from "/js/scene_render_state.js";
import {createSolverControlsController} from "/js/solver_controls.js";

const context = {
  state,
  entryMap,
  ui,
  inputs,
  viewerRef,
  api: {
    createRadiomapJob,
    getRadiomapJob,
    getRadiomapResult,
    solveLink,
  },
  controllers: {},
};

const performancePanel = createPerformancePanelController(context);
const entryMapController = createEntryMapController(context);
const solverControls = createSolverControlsController(context);
const sceneRenderState = createSceneRenderStateController(context);
const paramTooltips = createParamTooltipController(context);

context.controllers.performance = performancePanel;
context.controllers.entry = entryMapController;
context.controllers.solver = solverControls;
context.controllers.scene = sceneRenderState;
context.controllers.tooltips = paramTooltips;

function currentViewer() {
  return viewerRef.current;
}

const DEVICE_TARGET_LABELS = {
  "link-tx": "Link Tx",
  "link-rx": "Link Rx",
  "rm-tx": "Radio Map Tx",
};

const PICK_TAP_MAX_MOVE_PX = 6;
const PICK_TAP_MAX_DURATION_MS = 350;

let pickTapCandidate = null;

function setPickStatus(message = "") {
  ui.hintText.textContent = message || "Click a surface point or adjust coordinates.";
}

function placementPromptForTarget(target) {
  return target === "link-rx"
    ? "Click any surface to place Rx"
    : "Click any surface to place Tx";
}

function isLinkDeviceTarget(target) {
  return target === "link-tx" || target === "link-rx";
}

function clearPickTapCandidate() {
  pickTapCandidate = null;
}

function closeDevicePrecision() {
  readActiveDeviceInputs();
  clearPickTapCandidate();
  state.pickTarget = null;
  state.deviceControl.activeTarget = null;
  setPickStatus();
  sceneRenderState.renderAll();
}

function openDevicePrecision(target) {
  if (state.deviceControl.activeTarget === target) {
    closeDevicePrecision();
    return;
  }
  clearPickTapCandidate();
  readActiveDeviceInputs();
  if (isLinkDeviceTarget(target)) {
    solverControls.readLinkInputs();
  } else {
    solverControls.readRadiomapInputs();
  }
  state.deviceControl.activeTarget = target;
  state.pickTarget = target;
  setPickStatus(placementPromptForTarget(target));
  sceneRenderState.renderAll();
}

function readActiveDeviceInputs() {
  if (isLinkDeviceTarget(state.deviceControl.activeTarget)) {
    solverControls.readLinkInputs();
    return;
  }
  if (state.deviceControl.activeTarget === "rm-tx") {
    solverControls.readRadiomapInputs();
  }
}

async function runSolveFromDock(button, run) {
  clearPickTapCandidate();
  state.pickTarget = null;
  state.deviceControl.activeTarget = null;
  setPickStatus();
  sceneRenderState.renderAll();
  button.disabled = true;
  button.classList.add("busy");
  button.setAttribute("aria-busy", "true");
  try {
    await run();
  } finally {
    button.disabled = false;
    button.classList.remove("busy");
    button.removeAttribute("aria-busy");
  }
}

function pickActiveDeviceAt(clientX, clientY, target) {
  if (!target || state.pickTarget !== target) {
    return;
  }
  const pick = currentViewer().pickOnSurface(
    clientX,
    clientY,
    solverControls.markerRadiusForPickTarget(target),
  );
  solverControls.applyPick(pick);
  if (pick) {
    state.deviceControl.activeTarget = target;
    state.pickTarget = target;
    setPickStatus(placementPromptForTarget(target));
    return;
  }
  setPickStatus(placementPromptForTarget(target));
}

function handlePickPointerDown(event) {
  if (!state.pickTarget || !event.isPrimary || event.button !== 0) {
    clearPickTapCandidate();
    return;
  }
  pickTapCandidate = {
    pointerId: event.pointerId,
    target: state.pickTarget,
    startX: event.clientX,
    startY: event.clientY,
    startAt: window.performance.now(),
    canceled: false,
  };
}

function handlePickPointerMove(event) {
  if (!pickTapCandidate || event.pointerId !== pickTapCandidate.pointerId) {
    return;
  }
  const dx = event.clientX - pickTapCandidate.startX;
  const dy = event.clientY - pickTapCandidate.startY;
  if ((dx * dx) + (dy * dy) > PICK_TAP_MAX_MOVE_PX * PICK_TAP_MAX_MOVE_PX) {
    pickTapCandidate.canceled = true;
  }
}

function handlePickPointerUp(event) {
  if (!pickTapCandidate || event.pointerId !== pickTapCandidate.pointerId) {
    return;
  }
  const candidate = pickTapCandidate;
  clearPickTapCandidate();
  const duration = window.performance.now() - candidate.startAt;
  const dx = event.clientX - candidate.startX;
  const dy = event.clientY - candidate.startY;
  const moved = (dx * dx) + (dy * dy) > PICK_TAP_MAX_MOVE_PX * PICK_TAP_MAX_MOVE_PX;
  if (
    candidate.canceled
    || moved
    || duration > PICK_TAP_MAX_DURATION_MS
    || state.pickTarget !== candidate.target
  ) {
    return;
  }
  pickActiveDeviceAt(event.clientX, event.clientY, candidate.target);
}

function attachEvents() {
  paramTooltips.attach();

  const handleEnterScene = () => {
    clearPickTapCandidate();
    state.pickTarget = null;
    state.deviceControl.activeTarget = null;
    return sceneRenderState.enterScene().catch((error) => {
      sceneRenderState.hideOverlay();
      state.tileLoadBusy = false;
      sceneRenderState.syncTileListUi();
      window.alert(error.message);
    });
  };
  const handleReturnToScene = () => {
    clearPickTapCandidate();
    state.pickTarget = null;
    state.deviceControl.activeTarget = null;
    setPickStatus();
    sceneRenderState.resetSelectionToLoadedTiles();
    entryMapController.hideEntryScreen();
    sceneRenderState.renderAll();
  };

  ui.panelToggle.addEventListener("click", () => {
    paramTooltips.hideTooltip();
    state.panelCollapsed = !state.panelCollapsed;
    sceneRenderState.syncControlSidebarUi();
  });
  ui.entryMapFigure.addEventListener("mouseleave", () => {
    entryMapController.hideEntryMapTooltip();
  });

  ui.btnEntrySidebarToggle.addEventListener("click", () => {
    state.entry.sidebarCollapsed = !state.entry.sidebarCollapsed;
    entryMapController.syncEntrySidebarUi();
    if (!state.entry.sidebarCollapsed) {
      window.setTimeout(() => ui.entryPlaceInput.focus(), 120);
    }
  });
  ui.btnEntryReturnScene.addEventListener("click", handleReturnToScene);
  ui.btnEntrySearch.addEventListener("click", () => {
    entryMapController.runEntryPlaceSearch();
  });
  ui.entryPlaceInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      entryMapController.runEntryPlaceSearch();
    }
  });
  ui.btnEntryFitMap.addEventListener("click", () => {
    entryMapController.fitEntryMapToView();
  });
  ui.btnEntryFocusSelection.addEventListener("click", () => {
    const selected = sceneRenderState.tileSelections();
    if (!selected.length) {
      return;
    }
    entryMapController.focusEntryMapTiles(selected, selected.length > 1 ? 0.98 : 1.08);
  });
  ui.btnEntryZoomIn.addEventListener("click", () => {
    entryMap.map?.zoomIn(0.5);
  });
  ui.btnEntryZoomOut.addEventListener("click", () => {
    entryMap.map?.zoomOut(0.5);
  });
  ui.btnEnterScene.addEventListener("click", handleEnterScene);
  ui.btnOpenTileIndex.addEventListener("click", () => {
    clearPickTapCandidate();
    state.pickTarget = null;
    state.deviceControl.activeTarget = null;
    setPickStatus();
    entryMapController.showEntryScreen();
  });

  for (const button of ui.perfModeButtons) {
    button.addEventListener("click", () => {
      const mode = button.dataset.performanceMode;
      if (!PERFORMANCE_MODES.has(mode)) {
        return;
      }
      state.performance.mode = mode;
      currentViewer().setPerformanceMode(mode);
      performancePanel.syncPerformanceUi();
    });
  }
  ui.perfLightMaterials.addEventListener("change", () => {
    state.performance.lightweightMaterials = ui.perfLightMaterials.checked;
    currentViewer().setLightweightMaterials(state.performance.lightweightMaterials);
    performancePanel.syncPerformanceUi();
  });
  ui.btnPerformanceDockToggle.addEventListener("click", () => {
    state.performance.dockExpanded = !state.performance.dockExpanded;
    performancePanel.syncPerformanceUi();
  });
  ui.btnShowAllCategories.addEventListener("click", () => {
    performancePanel.showAllCategories();
  });
  ui.btnHideHeavyCategories.addEventListener("click", () => {
    performancePanel.hideHeavyCategories();
  });
  window.setInterval(() => {
    if (currentViewer().__ready && !state.entry.visible) {
      performancePanel.syncPerformanceUi();
    }
  }, 500);

  ui.tabLink.addEventListener("click", () => {
    paramTooltips.hideTooltip();
    state.mode = "link";
    clearPickTapCandidate();
    state.pickTarget = null;
    state.deviceControl.activeTarget = null;
    setPickStatus();
    currentViewer().clearOverlay();
    sceneRenderState.renderAll();
  });
  ui.tabRadiomap.addEventListener("click", () => {
    paramTooltips.hideTooltip();
    state.mode = "radiomap";
    clearPickTapCandidate();
    state.pickTarget = null;
    state.deviceControl.activeTarget = null;
    setPickStatus();
    currentViewer().clearOverlay();
    sceneRenderState.renderAll();
  });

  ui.btnSolveLink.addEventListener("click", () => runSolveFromDock(ui.btnSolveLink, () => solverControls.runLinkSolve()).catch((error) => {
    sceneRenderState.hideOverlay();
    window.alert(error.message);
  }));
  ui.btnRunRadiomap.addEventListener("click", () => runSolveFromDock(ui.btnRunRadiomap, () => solverControls.runRadiomap()).catch((error) => {
    sceneRenderState.hideOverlay();
    window.alert(error.message);
  }));
  ui.btnResetView.addEventListener("click", () => {
    if (!currentViewer().focusOnTiles([...currentViewer().loadedTileIds])) {
      currentViewer().resetView();
    }
  });
  ui.btnClearOverlay.addEventListener("click", () => currentViewer().clearOverlay());

  ui.btnPickLinkTx.addEventListener("click", () => openDevicePrecision("link-tx"));
  ui.btnPickLinkRx.addEventListener("click", () => openDevicePrecision("link-rx"));
  ui.btnPickRmTx.addEventListener("click", () => openDevicePrecision("rm-tx"));

  for (const input of [
    inputs.linkTxX, inputs.linkTxY, inputs.linkTxZ,
    inputs.linkRxX, inputs.linkRxY, inputs.linkRxZ,
  ]) {
    input.addEventListener("change", () => {
      solverControls.readLinkInputs();
      if (isLinkDeviceTarget(state.deviceControl.activeTarget)) {
        setPickStatus(placementPromptForTarget(state.deviceControl.activeTarget));
      }
      sceneRenderState.renderAll();
    });
  }

  for (const input of [
    inputs.linkSamplesPerSrc,
    inputs.linkMaxNumPaths,
    inputs.linkBandwidthMhz,
    inputs.linkSyntheticArray,
    inputs.linkDiffraction,
    inputs.linkEdgeDiffraction,
    inputs.linkDiffractionLitRegion,
    inputs.linkComputeTaps,
    inputs.linkTapLMin,
    inputs.linkTapLMax,
    inputs.linkTapFftSize,
  ]) {
    input.addEventListener("change", () => {
      solverControls.readLinkInputs();
      sceneRenderState.renderAll();
    });
  }

  for (const input of [
    inputs.rmTxX, inputs.rmTxY, inputs.rmTxZ,
    inputs.rmSizeX, inputs.rmSizeY, inputs.rmHeightOffset, inputs.rmDensityLevel,
  ]) {
    input.addEventListener("change", () => {
      solverControls.readRadiomapInputs();
      if (state.deviceControl.activeTarget === "rm-tx") {
        setPickStatus(placementPromptForTarget(state.deviceControl.activeTarget));
      }
      sceneRenderState.renderAll();
    });
  }

  for (const input of [inputs.rmColorMin, inputs.rmColorMax]) {
    input.addEventListener("change", () => {
      try {
        solverControls.readRadiomapInputs();
        solverControls.rerenderRadiomapOverlay();
        solverControls.renderRadiomapResult();
      } catch (error) {
        window.alert(error.message);
      }
    });
  }

  const view = document.getElementById("view");
  view.addEventListener("pointerdown", handlePickPointerDown);
  window.addEventListener("pointermove", handlePickPointerMove);
  window.addEventListener("pointerup", handlePickPointerUp);
  window.addEventListener("pointercancel", clearPickTapCandidate);
  window.addEventListener("blur", clearPickTapCandidate);

  window.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || !state.deviceControl.activeTarget) {
      return;
    }
    event.preventDefault();
    clearPickTapCandidate();
    closeDevicePrecision();
  });

  window.addEventListener("resize", () => {
    if (!state.entry.visible) {
      return;
    }
    const selected = sceneRenderState.tileSelections();
    if (selected.length) {
      entryMapController.focusEntryMapTiles(selected, selected.length > 1 ? 0.98 : 1.08);
      return;
    }
    entryMapController.fitEntryMapToView();
  });
}

async function bootstrap() {
  sceneRenderState.showOverlay({title: "Loading Scene", message: "Loading scene manifest...", percent: 10});
  attachEvents();
  state.manifest = await getManifest();
  sceneRenderState.populateTileList(state.manifest);
  performancePanel.populatePerformanceControls(state.manifest);
  state.entry.overview = entryMapController.buildEntryOverview(state.manifest);
  entryMapController.renderEntryOverview();
  sceneRenderState.setTileSelection([]);
  sceneRenderState.hideOverlay();

  sceneRenderState.renderAll();
  if (state.entry.overview) {
    entryMapController.showEntryScreen();
  } else {
    ui.panel.style.display = "flex";
    sceneRenderState.syncControlSidebarUi();
  }
}

bootstrap().catch((error) => {
  sceneRenderState.hideOverlay();
  window.alert(error.message);
});
