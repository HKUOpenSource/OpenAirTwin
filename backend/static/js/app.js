import {
  createDeepMimoJob,
  createMobilityJob,
  createRadiomapJob,
  createTileDownloadJob,
  cancelTileDownloadJob,
  deepMimoDownloadUrl,
  getManifest,
  getDeepMimoJob,
  getMobilityJob,
  getMobilityResult,
  getRadiomapJob,
  getRadiomapResult,
  getRtCapabilities,
  getRtSceneSelection,
  getTileDownloadJob,
  setRtSceneSelection,
  solveLink,
} from "/js/api.js";
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
    createDeepMimoJob,
    createRadiomapJob,
    createMobilityJob,
    createTileDownloadJob,
    cancelTileDownloadJob,
    deepMimoDownloadUrl,
    getDeepMimoJob,
    getMobilityJob,
    getMobilityResult,
    getManifest,
    getRadiomapJob,
    getRadiomapResult,
    getRtCapabilities,
    getRtSceneSelection,
    getTileDownloadJob,
    setRtSceneSelection,
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
  "deepmimo-tx": "DeepMIMO Tx",
  "deepmimo-roi": "DeepMIMO ROI",
};

const PICK_TAP_MAX_MOVE_PX = 6;
const PICK_TAP_MAX_DURATION_MS = 350;

let pickTapCandidate = null;

function setPickStatus(message = "") {
  ui.hintText.textContent = message || "Click a surface point or adjust coordinates.";
}

function placementPromptForTarget(target) {
  if (target === "deepmimo-roi") {
    return "Drag on the terrain to draw a rectangular DeepMIMO ROI";
  }
  if (target === "deepmimo-tx") {
    return "Click any surface to place DeepMIMO Tx";
  }
  return target === "link-rx"
    ? "Click any surface to place Rx"
    : "Click any surface to place Tx";
}

function isLinkDeviceTarget(target) {
  return target === "link-tx" || target === "link-rx";
}

function isDeepMimoDeviceTarget(target) {
  return target === "deepmimo-tx" || target === "deepmimo-roi";
}

function isEditableKeyboardTarget(target) {
  const tag = target?.tagName?.toLowerCase();
  return Boolean(
    target?.isContentEditable
    || tag === "input"
    || tag === "textarea"
    || tag === "select"
  );
}

function invalidateMobilityResult() {
  if (state.mode !== "mobility") {
    return;
  }
  solverControls.stopMobilityPlayback();
  state.mobility.result = null;
  state.mobility.selectedStep = 0;
  state.mobility.selectedPath = -1;
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
  } else if (target === "rm-tx") {
    solverControls.readRadiomapInputs();
  } else if (isDeepMimoDeviceTarget(target)) {
    solverControls.readDeepMimoInputs();
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
    return;
  }
  if (isDeepMimoDeviceTarget(state.deviceControl.activeTarget)) {
    solverControls.readDeepMimoInputs();
  }
}

function txOrbitCenterForMode() {
  if (state.mode === "radiomap") {
    return state.radiomap.txVisual;
  }
  if (state.mode === "deepmimo") {
    return state.deepmimo.txVisual;
  }
  return state.link.txVisual;
}

function readTxInputsForCurrentMode() {
  if (state.mode === "radiomap") {
    solverControls.readRadiomapInputs();
    return;
  }
  if (state.mode === "deepmimo") {
    solverControls.readDeepMimoInputs();
    return;
  }
  solverControls.readLinkInputs();
}

function stopTxOrbit() {
  currentViewer().stopTxOrbit();
}

function toggleTxOrbit() {
  const viewer = currentViewer();
  if (viewer.isTxOrbiting()) {
    viewer.stopTxOrbit();
    sceneRenderState.renderAll();
    return;
  }
  readTxInputsForCurrentMode();
  clearPickTapCandidate();
  state.pickTarget = null;
  state.deviceControl.activeTarget = null;
  setPickStatus();
  viewer.startTxOrbit(txOrbitCenterForMode());
  sceneRenderState.renderAll();
}

async function runSolveFromDock(button, run) {
  clearPickTapCandidate();
  solverControls.cancelLivePreview();
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
    sceneRenderState.renderAll();
  }
}

function pickActiveDeviceAt(clientX, clientY, target, livePhase = "change") {
  if (!target || state.pickTarget !== target) {
    return false;
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
    if (target === "deepmimo-roi") {
      return true;
    }
    solverControls.handleLivePreviewDeviceUpdate(target, livePhase);
    return true;
  }
  setPickStatus(placementPromptForTarget(target));
  return false;
}

function deepMimoSurfacePositionAt(clientX, clientY) {
  const pick = currentViewer().pickOnSurface(clientX, clientY, 0);
  return pick ? (pick.surfacePosition || pick.logicalPosition) : null;
}

function handlePickPointerDown(event) {
  if (!state.pickTarget || !event.isPrimary || event.button !== 0 || event.shiftKey) {
    clearPickTapCandidate();
    return;
  }
  if (state.pickTarget === "deepmimo-roi") {
    const position = deepMimoSurfacePositionAt(event.clientX, event.clientY);
    if (!position) {
      setPickStatus(placementPromptForTarget("deepmimo-roi"));
      return;
    }
    solverControls.startDeepMimoRoiDrag(position);
    pickTapCandidate = {
      pointerId: event.pointerId,
      target: state.pickTarget,
      startX: event.clientX,
      startY: event.clientY,
      startAt: window.performance.now(),
      canceled: false,
      dragging: true,
      roiDrawing: true,
    };
    event.preventDefault();
    event.stopPropagation();
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {}
    sceneRenderState.renderAll();
    return;
  }
  pickTapCandidate = {
    pointerId: event.pointerId,
    target: state.pickTarget,
    startX: event.clientX,
    startY: event.clientY,
    startAt: window.performance.now(),
    canceled: false,
    dragging: false,
  };
  event.preventDefault();
  event.stopPropagation();
  try {
    event.currentTarget.setPointerCapture(event.pointerId);
  } catch {}
}

function handlePickPointerMove(event) {
  if (!pickTapCandidate || event.pointerId !== pickTapCandidate.pointerId) {
    return;
  }
  if (pickTapCandidate.roiDrawing) {
    const position = deepMimoSurfacePositionAt(event.clientX, event.clientY);
    if (position) {
      solverControls.updateDeepMimoRoiDrag(position);
      setPickStatus(placementPromptForTarget("deepmimo-roi"));
      sceneRenderState.renderAll();
    }
    event.preventDefault();
    event.stopPropagation();
    return;
  }
  const dx = event.clientX - pickTapCandidate.startX;
  const dy = event.clientY - pickTapCandidate.startY;
  if ((dx * dx) + (dy * dy) > PICK_TAP_MAX_MOVE_PX * PICK_TAP_MAX_MOVE_PX) {
    pickTapCandidate.canceled = true;
    pickTapCandidate.dragging = true;
  }
  if (pickTapCandidate.dragging) {
    pickActiveDeviceAt(event.clientX, event.clientY, pickTapCandidate.target, "move");
    event.preventDefault();
    event.stopPropagation();
  }
}

function handlePickPointerUp(event) {
  if (!pickTapCandidate || event.pointerId !== pickTapCandidate.pointerId) {
    return;
  }
  const candidate = pickTapCandidate;
  clearPickTapCandidate();
  if (candidate.roiDrawing) {
    const position = deepMimoSurfacePositionAt(event.clientX, event.clientY);
    if (position) {
      solverControls.finishDeepMimoRoiDrag(position);
    }
    state.deviceControl.activeTarget = "deepmimo-roi";
    state.pickTarget = "deepmimo-roi";
    setPickStatus(placementPromptForTarget("deepmimo-roi"));
    sceneRenderState.renderAll();
    event.preventDefault();
    event.stopPropagation();
    try {
      document.getElementById("view").releasePointerCapture(event.pointerId);
    } catch {}
    return;
  }
  const duration = window.performance.now() - candidate.startAt;
  const dx = event.clientX - candidate.startX;
  const dy = event.clientY - candidate.startY;
  const moved = (dx * dx) + (dy * dy) > PICK_TAP_MAX_MOVE_PX * PICK_TAP_MAX_MOVE_PX;
  if (candidate.dragging) {
    pickActiveDeviceAt(event.clientX, event.clientY, candidate.target, "end");
    event.preventDefault();
    event.stopPropagation();
    try {
      document.getElementById("view").releasePointerCapture(event.pointerId);
    } catch {}
    return;
  }
  if (
    candidate.canceled
    || moved
    || duration > PICK_TAP_MAX_DURATION_MS
    || state.pickTarget !== candidate.target
  ) {
    return;
  }
  pickActiveDeviceAt(event.clientX, event.clientY, candidate.target, "end");
  try {
    document.getElementById("view").releasePointerCapture(event.pointerId);
  } catch {}
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
  ui.btnResultDockToggle.addEventListener("click", () => {
    state.resultDock.expanded = !state.resultDock.expanded;
    sceneRenderState.syncResultDockUi();
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
    solverControls.cancelLivePreview();
    solverControls.stopMobilityPlayback();
    stopTxOrbit();
    state.mode = "link";
    clearPickTapCandidate();
    state.pickTarget = null;
    state.deviceControl.activeTarget = null;
    setPickStatus();
    currentViewer().clearOverlay();
    sceneRenderState.renderAll();
  });
  ui.tabMobility.addEventListener("click", () => {
    paramTooltips.hideTooltip();
    solverControls.cancelLivePreview();
    stopTxOrbit();
    state.mode = "mobility";
    if (!state.mobility.tapsDefaulted) {
      state.link.advanced.computeTaps = true;
      state.mobility.tapsDefaulted = true;
    }
    clearPickTapCandidate();
    state.pickTarget = null;
    state.deviceControl.activeTarget = null;
    setPickStatus();
    currentViewer().clearOverlay();
    solverControls.renderMobilityTrajectoryPreview();
    sceneRenderState.renderAll();
  });
  ui.tabRadiomap.addEventListener("click", () => {
    paramTooltips.hideTooltip();
    solverControls.cancelLivePreview();
    solverControls.stopMobilityPlayback();
    stopTxOrbit();
    state.mode = "radiomap";
    clearPickTapCandidate();
    state.pickTarget = null;
    state.deviceControl.activeTarget = null;
    setPickStatus();
    currentViewer().clearOverlay();
    sceneRenderState.renderAll();
  });
  ui.tabDeepMimo.addEventListener("click", () => {
    paramTooltips.hideTooltip();
    solverControls.cancelLivePreview();
    solverControls.stopMobilityPlayback();
    stopTxOrbit();
    state.mode = "deepmimo";
    clearPickTapCandidate();
    state.pickTarget = null;
    state.deviceControl.activeTarget = null;
    setPickStatus();
    currentViewer().clearPaths();
    currentViewer().clearRadiomap();
    currentViewer().clearSurfacePreview();
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
  ui.btnRunMobility.addEventListener("click", () => runSolveFromDock(ui.btnRunMobility, () => solverControls.runMobility()).catch((error) => {
    sceneRenderState.hideOverlay();
    solverControls.stopMobilityPlayback();
    window.alert(error.message);
  }));
  ui.btnRunDeepMimo.addEventListener("click", () => {
    clearPickTapCandidate();
    solverControls.cancelLivePreview();
    state.pickTarget = null;
    state.deviceControl.activeTarget = null;
    setPickStatus();
    ui.btnRunDeepMimo.disabled = true;
    ui.btnRunDeepMimo.classList.add("busy");
    ui.btnRunDeepMimo.setAttribute("aria-busy", "true");
    solverControls.runDeepMimo().catch((error) => {
      window.alert(error.message);
    }).finally(() => {
      ui.btnRunDeepMimo.disabled = false;
      ui.btnRunDeepMimo.classList.remove("busy");
      ui.btnRunDeepMimo.removeAttribute("aria-busy");
      sceneRenderState.renderAll();
    });
  });
  ui.btnResetView.addEventListener("click", () => {
    stopTxOrbit();
    if (!currentViewer().focusOnTiles([...currentViewer().loadedTileIds])) {
      currentViewer().resetView();
    }
    sceneRenderState.renderAll();
  });
  ui.btnClearOverlay.addEventListener("click", () => currentViewer().clearOverlay());

  ui.btnOrbitTx.addEventListener("click", toggleTxOrbit);
  ui.btnPickLinkTx.addEventListener("click", () => openDevicePrecision("link-tx"));
  ui.btnPickLinkRx.addEventListener("click", () => openDevicePrecision("link-rx"));
  ui.btnPickRmTx.addEventListener("click", () => openDevicePrecision("rm-tx"));
  ui.btnDeepMimoPickTx.addEventListener("click", () => openDevicePrecision("deepmimo-tx"));
  ui.btnDeepMimoPickRoi.addEventListener("click", () => {
    clearPickTapCandidate();
    solverControls.readDeepMimoInputs();
    state.deepmimo.roi.pickingStep = "drag";
    state.deviceControl.activeTarget = "deepmimo-roi";
    state.pickTarget = "deepmimo-roi";
    setPickStatus(placementPromptForTarget("deepmimo-roi"));
    sceneRenderState.renderAll();
  });
  ui.btnDeepMimoClearRoi.addEventListener("click", () => {
    clearPickTapCandidate();
    state.pickTarget = null;
    state.deviceControl.activeTarget = null;
    setPickStatus();
    solverControls.clearDeepMimoRoi();
    sceneRenderState.renderAll();
  });

  for (const [input, target] of [
    [inputs.linkTxX, "link-tx"], [inputs.linkTxY, "link-tx"], [inputs.linkTxZ, "link-tx"],
    [inputs.linkRxX, "link-rx"], [inputs.linkRxY, "link-rx"], [inputs.linkRxZ, "link-rx"],
  ]) {
    input.addEventListener("change", () => {
      solverControls.readLinkInputs();
      invalidateMobilityResult();
      if (isLinkDeviceTarget(state.deviceControl.activeTarget)) {
        setPickStatus(placementPromptForTarget(state.deviceControl.activeTarget));
      }
      solverControls.handleLivePreviewDeviceUpdate(target, "change");
      sceneRenderState.renderAll();
    });
  }

  for (const input of [inputs.mobilityVelocity, inputs.mobilityTimeStep, inputs.mobilityMaxSteps]) {
    input.addEventListener("change", () => {
      solverControls.readMobilityInputs();
      state.mobility.result = null;
      state.mobility.selectedStep = 0;
      state.mobility.selectedPath = -1;
      sceneRenderState.renderAll();
    });
  }

  ui.btnMobilityAddRxPoint.addEventListener("click", () => solverControls.addCurrentRxWaypoint());
  ui.btnMobilityClearPoints.addEventListener("click", () => {
    solverControls.resetMobilityTrajectoryFromRx();
    sceneRenderState.renderAll();
  });
  ui.mobilityMetric.addEventListener("change", () => {
    state.mobility.metric = ui.mobilityMetric.value;
    solverControls.renderMobilityResult();
  });
  ui.mobilityStepSlider.addEventListener("input", () => {
    solverControls.selectMobilityStep(Number(ui.mobilityStepSlider.value));
  });
  ui.mobilityPlaybackSpeed.addEventListener("change", () => {
    state.mobility.playbackSpeed = Number(ui.mobilityPlaybackSpeed.value);
    if (state.mobility.playing) {
      solverControls.startMobilityPlayback();
    }
  });
  ui.btnMobilityPlay.addEventListener("click", () => {
    if (state.mobility.playing) {
      solverControls.stopMobilityPlayback();
      solverControls.renderMobilityResult();
      return;
    }
    solverControls.startMobilityPlayback();
  });

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
      invalidateMobilityResult();
      sceneRenderState.renderAll();
    });
  }

  for (const input of [
    inputs.txArrayPattern,
    inputs.txArrayPolarization,
    inputs.txArrayRows,
    inputs.txArrayCols,
    inputs.txArrayVerticalSpacing,
    inputs.txArrayHorizontalSpacing,
    inputs.rxArrayPattern,
    inputs.rxArrayPolarization,
    inputs.rxArrayRows,
    inputs.rxArrayCols,
    inputs.rxArrayVerticalSpacing,
    inputs.rxArrayHorizontalSpacing,
  ]) {
    input.addEventListener("change", () => {
      solverControls.readAntennaArrayInputs();
      invalidateMobilityResult();
      sceneRenderState.renderAll();
    });
  }

  for (const input of [inputs.rmTxX, inputs.rmTxY, inputs.rmTxZ]) {
    input.addEventListener("change", () => {
      solverControls.readRadiomapInputs();
      if (state.deviceControl.activeTarget === "rm-tx") {
        setPickStatus(placementPromptForTarget(state.deviceControl.activeTarget));
      }
      sceneRenderState.renderAll();
    });
  }

  for (const input of [
    inputs.rmSizeX, inputs.rmSizeY, inputs.rmHeightOffset, inputs.rmSamplesPerTx, inputs.rmCellSize, inputs.rmDensityLevel,
  ]) {
    input.addEventListener("change", () => {
      solverControls.readRadiomapInputs();
      sceneRenderState.renderAll();
    });
  }

  for (const input of [
    inputs.deepMimoTxX,
    inputs.deepMimoTxY,
    inputs.deepMimoTxZ,
    inputs.deepMimoScenarioName,
    inputs.deepMimoRoiCenterX,
    inputs.deepMimoRoiCenterY,
    inputs.deepMimoRoiWidth,
    inputs.deepMimoRoiLength,
    inputs.deepMimoGridSpacing,
    inputs.deepMimoRxHeight,
    inputs.deepMimoMaxReceivers,
    inputs.deepMimoChunkSize,
    inputs.deepMimoSamplesPerSrc,
    inputs.deepMimoMaxPaths,
    inputs.deepMimoFilterBuildings,
  ]) {
    input.addEventListener("change", () => {
      solverControls.readDeepMimoInputs();
      solverControls.renderDeepMimoState();
      sceneRenderState.renderAll();
    });
  }

  for (const input of [
    inputs.livePreviewEnabled,
    inputs.livePreviewLinkSamples,
    inputs.livePreviewPathsDelay,
  ]) {
    input.addEventListener("change", () => {
      solverControls.readLivePreviewInputs();
      if (!state.livePreview.enabled) {
        solverControls.cancelLivePreview();
      }
      sceneRenderState.renderAll();
    });
  }

  inputs.linkSurfaceClearance.addEventListener("change", () => {
    solverControls.readSurfaceClearanceInput();
    sceneRenderState.renderAll();
  });

  for (const input of [inputs.rmColorMin, inputs.rmColorMax, inputs.rmColormap]) {
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
  view.addEventListener("pointerdown", handlePickPointerDown, {capture: true});
  window.addEventListener("pointermove", handlePickPointerMove, {capture: true});
  window.addEventListener("pointerup", handlePickPointerUp, {capture: true});
  window.addEventListener("pointercancel", clearPickTapCandidate);
  window.addEventListener("blur", clearPickTapCandidate);
  window.addEventListener("hku-tx-orbit-change", () => {
    sceneRenderState.renderAll();
  });

  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && state.deviceControl.activeTarget) {
      event.preventDefault();
      clearPickTapCandidate();
      closeDevicePrecision();
      return;
    }
    if (
      state.mode !== "mobility"
      || state.entry.visible
      || ui.loadingScreen.style.display !== "none"
      || isEditableKeyboardTarget(event.target)
    ) {
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      solverControls.addCurrentRxWaypoint();
      return;
    }
    if (event.key === "Delete" && state.mobility.selectedWaypointIndex >= 0) {
      event.preventDefault();
      solverControls.deleteMobilityWaypoint(state.mobility.selectedWaypointIndex);
    }
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
  sceneRenderState.showOverlay({title: "Loading Scene", message: "Loading RT capabilities...", percent: 14});
  state.rtCapabilities = await getRtCapabilities();
  solverControls.applyRtCapabilities(state.rtCapabilities);
  sceneRenderState.showOverlay({title: "Loading Scene", message: "Loading scene manifest...", percent: 18});
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
