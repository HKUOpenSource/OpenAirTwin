import {
  createDeepMimoJob,
  createMobilityJob,
  createRadiomapJob,
  createTileDownloadJob,
  cancelDeepMimoJob,
  cancelTileDownloadJob,
  deepMimoDownloadUrl,
  getManifest,
  getOpen3dHkTileCoverage,
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
import {entryMap, PERFORMANCE_MODES, state, viewerRef} from "/js/app_state.js?v=20260519-mode-isolation";
import {inputs, ui} from "/js/dom_refs.js?v=20260519-mode-isolation";
import {createAppDialogController} from "/js/controllers/app_dialog_controller.js?v=20260604-app-dialog";
import {createDevicePickingController} from "/js/controllers/device_picking_controller.js?v=20260519-mode-isolation";
import {createEntryMapController} from "/js/entry_map.js";
import {createParamTooltipController} from "/js/param_tooltips.js";
import {createPerformancePanelController} from "/js/performance_panel.js";
import {createSceneRenderStateController} from "/js/scene_render_state.js?v=20260519-mode-isolation";
import {createSolverControlsController} from "/js/solver_controls.js?v=20260519-mode-isolation";

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
    cancelDeepMimoJob,
    cancelTileDownloadJob,
    deepMimoDownloadUrl,
    getDeepMimoJob,
    getMobilityJob,
    getMobilityResult,
    getManifest,
    getOpen3dHkTileCoverage,
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

const dialogController = createAppDialogController(context);
context.controllers.dialogs = dialogController;

const performancePanel = createPerformancePanelController(context);
const entryMapController = createEntryMapController(context);
const solverControls = createSolverControlsController(context);
const sceneRenderState = createSceneRenderStateController(context);
const paramTooltips = createParamTooltipController(context);
const devicePicking = createDevicePickingController(context);

context.controllers.performance = performancePanel;
context.controllers.entry = entryMapController;
context.controllers.solver = solverControls;
context.controllers.scene = sceneRenderState;
context.controllers.tooltips = paramTooltips;
context.controllers.devicePicking = devicePicking;

function errorMessage(error) {
  return error?.message || String(error || "Unknown error");
}

function showErrorDialog(title, error) {
  return dialogController.alert({
    title,
    message: errorMessage(error),
    variant: "error",
  });
}

function currentViewer() {
  return viewerRef.current;
}

function setModeMenuOpen(open) {
  ui.modeSelector.open = open;
  ui.modeSelectButton.setAttribute("aria-expanded", String(open));
}

function closeModeMenu() {
  setModeMenuOpen(false);
}

function closeDeepMimoDatasetTray() {
  if (!state.deepmimo.datasetTrayOpen) {
    return;
  }
  state.deepmimo.datasetTrayOpen = false;
  solverControls.renderDeepMimoDatasetTray();
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
  solverControls.invalidateMobilityResult();
}

async function runSolveFromDock(button, run) {
  devicePicking.clearActiveDevice({render: false});
  solverControls.cancelLivePreview();
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

function attachEvents() {
  paramTooltips.attach();

  const handleEnterScene = () => {
    devicePicking.clearActiveDevice({render: false, status: false});
    return sceneRenderState.enterScene().catch((error) => {
      sceneRenderState.hideOverlay(null, true);
      state.tileLoadBusy = false;
      sceneRenderState.syncTileListUi();
      return showErrorDialog("Enter Scene Failed", error);
    });
  };
  const handleReturnToScene = () => {
    devicePicking.clearActiveDevice({render: false});
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
    devicePicking.clearActiveDevice({render: false});
    solverControls.cancelLivePreview();
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
  ui.deepMimoDatasetToggle.addEventListener("click", (event) => {
    event.stopPropagation();
    closeModeMenu();
    if (state.deepmimo.datasets.length === 0) {
      return;
    }
    state.deepmimo.datasetTrayOpen = !state.deepmimo.datasetTrayOpen;
    solverControls.renderDeepMimoDatasetTray();
  });
  ui.deepMimoDatasetTray.addEventListener("click", (event) => {
    event.stopPropagation();
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

  ui.modeSelector.addEventListener("toggle", () => {
    ui.modeSelectButton.setAttribute("aria-expanded", String(ui.modeSelector.open));
  });
  ui.modeMenu.addEventListener("click", (event) => {
    event.stopPropagation();
  });
  document.addEventListener("click", (event) => {
    if (event.target instanceof Element && event.target.closest(".modeSelector")) {
      return;
    }
    closeModeMenu();
    closeDeepMimoDatasetTray();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeModeMenu();
      closeDeepMimoDatasetTray();
    }
  });

  ui.tabLink.addEventListener("click", () => {
    closeModeMenu();
    paramTooltips.hideTooltip();
    solverControls.cancelLivePreview();
    solverControls.stopMobilityPlayback();
    devicePicking.stopTxOrbit();
    state.mode = "link";
    devicePicking.clearActiveDevice({render: false});
    currentViewer().clearOverlay();
    sceneRenderState.renderAll();
  });
  ui.tabMobility.addEventListener("click", () => {
    closeModeMenu();
    paramTooltips.hideTooltip();
    solverControls.cancelLivePreview();
    devicePicking.stopTxOrbit();
    state.mode = "mobility";
    if (!state.mobility.tapsDefaulted) {
      state.link.advanced.computeTaps = true;
      state.mobility.tapsDefaulted = true;
    }
    devicePicking.clearActiveDevice({render: false});
    currentViewer().clearOverlay();
    solverControls.renderMobilityTrajectoryPreview();
    sceneRenderState.renderAll();
  });
  ui.tabRadiomap.addEventListener("click", () => {
    closeModeMenu();
    paramTooltips.hideTooltip();
    solverControls.cancelLivePreview();
    solverControls.stopMobilityPlayback();
    devicePicking.stopTxOrbit();
    state.mode = "radiomap";
    devicePicking.clearActiveDevice({render: false});
    currentViewer().clearOverlay();
    sceneRenderState.renderAll();
  });
  ui.tabDeepMimo.addEventListener("click", () => {
    closeModeMenu();
    paramTooltips.hideTooltip();
    solverControls.cancelLivePreview();
    solverControls.stopMobilityPlayback();
    devicePicking.stopTxOrbit();
    state.mode = "deepmimo";
    devicePicking.clearActiveDevice({render: false});
    currentViewer().clearPaths();
    currentViewer().clearRadiomap();
    currentViewer().clearSurfacePreview();
    sceneRenderState.renderAll();
  });

  ui.btnSolveLink.addEventListener("click", () => runSolveFromDock(ui.btnSolveLink, () => solverControls.runLinkSolve()).catch((error) => {
    sceneRenderState.hideOverlay(null, true);
    return showErrorDialog("Link Solve Failed", error);
  }));
  ui.btnRunRadiomap.addEventListener("click", () => runSolveFromDock(ui.btnRunRadiomap, () => solverControls.runRadiomap()).catch((error) => {
    sceneRenderState.hideOverlay(null, true);
    return showErrorDialog("Radiomap Failed", error);
  }));
  ui.btnRunMobility.addEventListener("click", () => runSolveFromDock(ui.btnRunMobility, () => solverControls.runMobility()).catch((error) => {
    sceneRenderState.hideOverlay(null, true);
    solverControls.stopMobilityPlayback();
    return showErrorDialog("Mobility Failed", error);
  }));
  ui.btnRunDeepMimo.addEventListener("click", () => {
    devicePicking.clearActiveDevice({render: false});
    solverControls.cancelLivePreview();
    ui.btnRunDeepMimo.disabled = true;
    ui.btnRunDeepMimo.classList.add("busy");
    ui.btnRunDeepMimo.setAttribute("aria-busy", "true");
    solverControls.runDeepMimo().catch((error) => {
      return showErrorDialog("DeepMIMO Export Failed", error);
    }).finally(() => {
      ui.btnRunDeepMimo.disabled = false;
      ui.btnRunDeepMimo.classList.remove("busy");
      ui.btnRunDeepMimo.removeAttribute("aria-busy");
      sceneRenderState.renderAll();
    });
  });
  ui.btnOrbitTx.addEventListener("click", () => devicePicking.toggleTxOrbit());
  ui.btnPickLinkTx.addEventListener("click", () => devicePicking.openDevicePrecision("link-tx"));
  ui.btnPickLinkRx.addEventListener("click", () => devicePicking.openDevicePrecision("link-rx"));
  ui.btnPickMobilityTx.addEventListener("click", () => devicePicking.openDevicePrecision("mobility-tx"));
  ui.btnPickMobilityRx.addEventListener("click", () => devicePicking.openDevicePrecision("mobility-rx"));
  ui.btnPickRmTx.addEventListener("click", () => devicePicking.openDevicePrecision("rm-tx"));
  ui.btnDeepMimoPickTx.addEventListener("click", () => devicePicking.openDevicePrecision("deepmimo-tx"));
  ui.btnDeepMimoPickRoi.addEventListener("click", () => devicePicking.handleDeepMimoRoiPickToggle());
  ui.btnDeepMimoClearRoi.addEventListener("click", () => devicePicking.handleDeepMimoClearRoi());

  for (const [input, target] of [
    [inputs.linkTxX, "link-tx"], [inputs.linkTxY, "link-tx"], [inputs.linkTxZ, "link-tx"],
    [inputs.linkRxX, "link-rx"], [inputs.linkRxY, "link-rx"], [inputs.linkRxZ, "link-rx"],
  ]) {
    input.addEventListener("change", () => {
      solverControls.readLinkInputs();
      solverControls.invalidateLinkResult();
      invalidateMobilityResult();
      devicePicking.refreshPickStatus("link");
      solverControls.handleLivePreviewDeviceUpdate(target, "change");
      sceneRenderState.renderAll();
    });
  }

  for (const [input, target] of [
    [inputs.mobilityTxX, "mobility-tx"], [inputs.mobilityTxY, "mobility-tx"], [inputs.mobilityTxZ, "mobility-tx"],
    [inputs.mobilityRxX, "mobility-rx"], [inputs.mobilityRxY, "mobility-rx"], [inputs.mobilityRxZ, "mobility-rx"],
  ]) {
    input.addEventListener("change", () => {
      solverControls.readMobilityInputs();
      invalidateMobilityResult();
      devicePicking.refreshPickStatus("mobility");
      sceneRenderState.renderAll();
    });
  }

  for (const input of [inputs.mobilityVelocity, inputs.mobilityTimeStep, inputs.mobilityMaxSteps]) {
    input.addEventListener("change", () => {
      solverControls.readMobilityInputs();
      invalidateMobilityResult();
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
      solverControls.invalidateLinkResult();
      invalidateMobilityResult();
      solverControls.invalidateDeepMimoResult();
      sceneRenderState.renderAll();
    });
  }

  for (const input of [
    inputs.cfgFrequency,
    inputs.cfgMaxDepth,
    inputs.cfgLos,
    inputs.cfgSpecular,
    inputs.cfgDiffuse,
    inputs.cfgRefraction,
    inputs.cfgSeed,
  ]) {
    input.addEventListener("change", () => {
      solverControls.invalidateLinkResult();
      solverControls.invalidateRadiomapResult();
      invalidateMobilityResult();
      solverControls.invalidateDeepMimoResult();
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
      solverControls.invalidateLinkResult();
      solverControls.invalidateRadiomapResult();
      invalidateMobilityResult();
      sceneRenderState.renderAll();
    });
  }

  for (const input of [inputs.rmTxX, inputs.rmTxY, inputs.rmTxZ]) {
    input.addEventListener("change", () => {
      solverControls.readRadiomapInputs();
      solverControls.invalidateRadiomapResult();
      devicePicking.refreshPickStatus("radiomap");
      sceneRenderState.renderAll();
    });
  }

  for (const input of [
    inputs.rmSizeX, inputs.rmSizeY, inputs.rmHeightOffset, inputs.rmSamplesPerTx, inputs.rmCellSize, inputs.rmDensityLevel,
  ]) {
    input.addEventListener("change", () => {
      solverControls.readRadiomapInputs();
      solverControls.invalidateRadiomapResult();
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
      solverControls.invalidateDeepMimoResult();
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
    solverControls.invalidateLinkResult();
    invalidateMobilityResult();
    sceneRenderState.renderAll();
  });

  for (const input of [inputs.rmColorMin, inputs.rmColorMax, inputs.rmColormap]) {
    input.addEventListener("change", () => {
      try {
        solverControls.readRadiomapInputs();
        solverControls.rerenderRadiomapOverlay();
        solverControls.renderRadiomapResult();
      } catch (error) {
        showErrorDialog("Radiomap Display Failed", error);
      }
    });
  }

  devicePicking.attachPointerEvents(document.getElementById("view"));

  window.addEventListener("keydown", (event) => {
    if (devicePicking.handleDevicePrecisionEscape(event)) {
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
  sceneRenderState.showOverlay({title: "Loading Scene", message: "Loading scene manifest...", percent: 10, force: true});
  attachEvents();
  sceneRenderState.showOverlay({title: "Loading Scene", message: "Loading RT capabilities...", percent: 14, force: true});
  state.rtCapabilities = await getRtCapabilities();
  solverControls.applyRtCapabilities(state.rtCapabilities);
  sceneRenderState.showOverlay({title: "Loading Scene", message: "Loading scene manifest...", percent: 18, force: true});
  state.manifest = await getManifest();
  sceneRenderState.showOverlay({title: "Loading Scene", message: "Loading Open3DHK coverage...", percent: 22, force: true});
  state.entry.coverage = await getOpen3dHkTileCoverage();
  sceneRenderState.populateTileList(state.manifest);
  performancePanel.populatePerformanceControls(state.manifest);
  state.entry.overview = entryMapController.buildEntryOverview(state.manifest, state.entry.coverage);
  entryMapController.renderEntryOverview();
  sceneRenderState.setTileSelection([]);
  sceneRenderState.hideOverlay(null, true);

  sceneRenderState.renderAll();
  if (state.entry.overview) {
    entryMapController.showEntryScreen();
  } else {
    ui.panel.style.display = "flex";
    sceneRenderState.syncControlSidebarUi();
  }
}

bootstrap().catch((error) => {
  sceneRenderState.hideOverlay(null, true);
  return showErrorDialog("Startup Failed", error);
});
