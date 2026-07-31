import {createRadarAssetPreview} from "/js/features/radar/asset_preview.js?v=20260723-radar-empty-scene";

export function createRadarFeature(context) {
  const {controller, dom, renderer, resultView, state, transport} = context;
  const radar = state.radar;
  const controls = context.featureServices.radarControls;
  const shared = context.featureServices.solver;
  const scene = () => context.controllers.scene;
  const picking = () => context.controllers.devicePicking;
  let manifestPromise = null;
  let targetPointer = null;
  let pointerCanvas = null;
  const assetPreview = createRadarAssetPreview({dom, state, viewerRef: context.viewerRef});

  function reportActionError(title, error) {
    scene().hideOverlay(null, true);
    context.utilities.showErrorDialog(title, error);
  }

  function inputChanged() {
    controller.handleInputChanged();
    renderer.render();
  }

  function loadAssets() {
    if (radar.assetsLoaded) {
      renderer.registerAssets({assets: radar.assets});
      assetPreview.setAssets(radar.assets);
      renderer.render();
      return Promise.resolve(radar.assets);
    }
    if (!manifestPromise) {
      manifestPromise = transport.getRadarAssetManifest()
        .then((manifest) => {
          controls.setAssets(manifest);
          renderer.registerAssets(manifest);
          assetPreview.setAssets(radar.assets);
          renderer.render();
          return radar.assets;
        })
        .catch((error) => {
          radar.assetsLoaded = true;
          radar.error = `Drone asset manifest unavailable: ${error.message}`;
          assetPreview.setAssets([]);
          scene().renderAll();
          return [];
        });
    }
    return manifestPromise;
  }

  function handleTargetPointerDown(event) {
    if (state.mode === "radar" && !state.pickTarget && event.isPrimary && event.button === 0) {
      targetPointer = {id: event.pointerId, x: event.clientX, y: event.clientY};
    }
  }

  function handleTargetPointerUp(event) {
    if (!targetPointer || targetPointer.id !== event.pointerId || state.mode !== "radar" || state.pickTarget) {
      targetPointer = null;
      return;
    }
    const moved = Math.hypot(event.clientX - targetPointer.x, event.clientY - targetPointer.y);
    targetPointer = null;
    if (moved > 6) return;
    const targetId = renderer.pickTarget(event.clientX, event.clientY);
    if (targetId && controls.selectTarget(targetId)) scene().renderAll();
  }

  function attachEvents() {
    resultView.attachEvents();
    if (pointerCanvas) return;
    pointerCanvas = context.ui.view;
    pointerCanvas.addEventListener("pointerdown", handleTargetPointerDown);
    pointerCanvas.addEventListener("pointerup", handleTargetPointerUp);
  }

  function dispose() {
    pointerCanvas?.removeEventListener("pointerdown", handleTargetPointerDown);
    pointerCanvas?.removeEventListener("pointerup", handleTargetPointerUp);
    pointerCanvas = null;
    targetPointer = null;
    resultView.dispose();
    assetPreview.dispose();
    renderer.dispose();
  }

  const deviceIds = new Set([
    "radarTxX", "radarTxY", "radarTxZ", "radarRxX", "radarRxY", "radarRxZ",
  ]);
  const modeIds = new Set(["radarModeMonostatic", "radarModeBistatic"]);
  const targetIds = new Set([
    "radarTargetAsset", "radarTargetX", "radarTargetY", "radarTargetZ",
    "radarTargetRoll", "radarTargetPitch", "radarTargetSpeed",
    "radarTargetDirection", "radarTargetClimb", "radarTargetRcs",
  ]);
  const parameterIds = new Set([
    "radarCarrierFrequency", "radarBandwidth", "radarNumSubcarriers",
    "radarNumSymbols", "radarTxPower", "radarNoiseFigure", "radarSystemLoss",
    "radarNoiseTemperature", "radarDirectPathCancellation", "radarCfarEnabled",
    "radarCfarGuardRange", "radarCfarGuardDoppler", "radarCfarTrainingRange",
    "radarCfarTrainingDoppler", "radarCfarPfa", "radarSamplesPerSrc",
    "radarMaxPaths", "radarMaxDepth", "radarSeed", "radarLos",
    "radarSpecular", "radarDiffuse", "radarRefraction", "radarDiffraction",
    "radarSyntheticArray",
  ]);

  function handleControlCommit(controlId) {
    if (deviceIds.has(controlId)) {
      inputChanged();
      context.settings.publish("radar-device");
      picking().refreshPickStatus("radar");
      return true;
    }
    if (modeIds.has(controlId)) {
      inputChanged();
      if (radar.mode === "monostatic" && state.deviceControl.activeTarget === "radar-rx") {
        picking().closeDevicePrecision();
      }
      controls.syncInputs();
      scene().renderAll();
      return true;
    }
    if (!targetIds.has(controlId) && !parameterIds.has(controlId)) return false;
    inputChanged();
    return true;
  }

  async function handleControlAction(actionId, value) {
    if (actionId === "radarTarget.select") {
      if (controls.selectTarget(String(value))) scene().renderAll();
      return true;
    }
    if (actionId === "btnRadarAssetPrevious") {
      assetPreview.previous();
      return true;
    }
    if (actionId === "btnRadarAssetNext") {
      assetPreview.next();
      return true;
    }
    if (actionId === "btnPickRadarTx") {
      picking().openDevicePrecision("radar-tx");
      return true;
    }
    if (actionId === "btnPickRadarRx") {
      picking().openDevicePrecision("radar-rx");
      return true;
    }
    if (actionId === "btnPickRadarTarget") {
      context.featureServices.picking.toggleTarget("radar-target");
      return true;
    }
    if (actionId === "btnFocusRadarTarget") {
      renderer.focusTarget(radar.selectedTargetId);
      return true;
    }
    if (actionId === "btnAddRadarTarget") {
      try {
        controls.addTarget(assetPreview.selectedAssetId());
        controller.invalidateRadarResult();
        renderer.render();
        scene().renderAll();
      } catch (error) {
        reportActionError("Cannot Add Radar Target", error);
      }
      return true;
    }
    if (actionId === "btnRemoveRadarTarget") {
      controls.removeSelectedTarget();
      controller.invalidateRadarResult();
      renderer.render();
      scene().renderAll();
      return true;
    }
    if (actionId === "btnCancelRadar") {
      await controller.cancelCurrentRadarJob().catch((error) => reportActionError(
        "Radar Cancellation Failed",
        error,
      ));
      return true;
    }
    if (actionId === "btnSolveRadar" || actionId === "btnRetryRadar") {
      await context.utilities.runSolveFromDock(
        "btnSolveRadar",
        () => controller.runRadarSolve(),
      ).catch((error) => reportActionError(
        actionId === "btnRetryRadar" ? "Radar Retry Failed" : "Radar Sensing Failed",
        error,
      ));
      return true;
    }
    return false;
  }

  function handleControlGroupToggle(controlId, open) {
    if (controlId !== "radarTargetsGroup") return false;
    assetPreview.syncGroup(open);
    return true;
  }

  function applyPick(pick, target) {
    if (target.role === "target") {
      const selected = controls.selectedTarget();
      const position = pick.surfacePosition || pick.logicalPosition;
      if (!selected || !Array.isArray(position)) return;
      selected.position = position.map(Number);
      controls.syncInputs();
      controller.invalidateRadarResult();
      renderer.render();
      return;
    }
    const position = shared.pickPositionWithSurfaceClearance(pick, target.scope);
    radar[target.role] = [...position];
    radar[`${target.role}Visual`] = [...position];
    if (radar.mode === "monostatic") {
      radar.rx = [...radar.tx];
      radar.rxVisual = [...radar.txVisual];
    }
    controls.syncInputs();
    controller.invalidateRadarResult();
    renderer.render();
  }

  function renderStatus() {
    const activeJob = ["submitting", "queued", "running", "cancelling"].includes(radar.status);
    const deviceRequirement = controls.deviceRequirementMessage();
    dom.radarJobBar.classList.toggle("hidden", !activeJob && radar.status !== "failed");
    dom.radarJobBar.dataset.status = radar.status;
    dom.radarJobStatus.textContent = radar.status.toUpperCase();
    dom.radarJobStatus.className = `radarStatusPill status-${radar.status}`;
    dom.radarJobMessage.textContent = radar.error || radar.message;
    dom.radarJobProgress.value = Math.max(0, Math.min(1, Number(radar.progress) || 0));
    dom.btnCancelRadar.classList.toggle("hidden", !activeJob || !radar.jobId);
    dom.btnRetryRadar.classList.toggle("hidden", radar.status !== "failed");
    dom.radarInputError.textContent = radar.error || "";
    dom.radarInputError.classList.toggle("hidden", !radar.error);
    dom.btnSolveRadar.disabled = activeJob || state.tileLoadBusy || !controls.devicesReady();
    dom.btnSolveRadar.setAttribute("aria-busy", String(activeJob));
    if (deviceRequirement) dom.btnSolveRadar.title = deviceRequirement;
    else dom.btnSolveRadar.removeAttribute("title");
  }

  return {
    attachEvents,
    handleControlAction,
    handleControlCommit,
    handleControlGroupToggle,
    applyPick,
    markerPositions() { return {tx: radar.txVisual, rx: radar.mode === "monostatic" ? radar.txVisual : radar.rxVisual}; },
    readInputs() { controls.readInputs(); },
    runRequirementMessage: controls.deviceRequirementMessage,
    syncInputs() { controls.syncInputs(); },
    activate() {
      dom.radarPanel.parentElement?.classList.add("radarFullMode");
      if (dom.radarPanel.parentElement) dom.radarPanel.parentElement.scrollTop = 0;
      context.viewerRef.current.clearOverlay();
      renderer.activate();
      assetPreview.activate();
      controls.syncInputs();
      loadAssets();
    },
    deactivate() {
      dom.radarPanel.parentElement?.classList.remove("radarFullMode");
      if (radar.autoCollapsedPanel && state.panelCollapsed) state.panelCollapsed = false;
      radar.autoCollapsedPanel = false;
      assetPreview.deactivate();
      renderer.deactivate();
      resultView.restoreOtherResultSections();
    },
    onSettingsChanged() { controller.invalidateRadarResult(); renderer.clearResult(); },
    render() { renderStatus(); resultView.renderRadarResult(); renderer.render(); assetPreview.syncState(); },
    dispose,
  };
}
