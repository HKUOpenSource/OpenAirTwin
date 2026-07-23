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

  function attachEvents() {
    resultView.attachEvents();
    dom.btnSolveRadar.addEventListener("click", () => context.utilities.runSolveFromDock(dom.btnSolveRadar, () => controller.runRadarSolve()).catch((error) => reportActionError("Radar Sensing Failed", error)));
    dom.btnCancelRadar.addEventListener("click", () => controller.cancelCurrentRadarJob().catch((error) => reportActionError("Radar Cancellation Failed", error)));
    dom.btnRetryRadar.addEventListener("click", () => context.utilities.runSolveFromDock(dom.btnSolveRadar, () => controller.runRadarSolve()).catch((error) => reportActionError("Radar Retry Failed", error)));
    dom.btnPickRadarTx.addEventListener("click", () => picking().openDevicePrecision("radar-tx"));
    dom.btnPickRadarRx.addEventListener("click", () => picking().openDevicePrecision("radar-rx"));
    dom.btnPickRadarTarget.addEventListener("click", () => context.featureServices.picking.toggleTarget("radar-target"));
    dom.btnFocusRadarTarget.addEventListener("click", () => renderer.focusTarget(radar.selectedTargetId));
    dom.radarPathDisplayMode.addEventListener("change", () => {
      radar.pathDisplayMode = dom.radarPathDisplayMode.value;
      scene().renderAll();
    });

    for (const input of [dom.radarTxX, dom.radarTxY, dom.radarTxZ, dom.radarRxX, dom.radarRxY, dom.radarRxZ]) {
      input.addEventListener("change", () => {
        inputChanged();
        context.settings.publish("radar-device");
        picking().refreshPickStatus("radar");
      });
    }
    for (const input of [dom.radarModeMonostatic, dom.radarModeBistatic]) input.addEventListener("change", () => {
      inputChanged();
      if (radar.mode === "monostatic" && state.deviceControl.activeTarget === "radar-rx") {
        picking().closeDevicePrecision();
      }
      controls.syncInputs();
      scene().renderAll();
    });

    dom.btnAddRadarTarget.addEventListener("click", () => {
      try { controls.addTarget(assetPreview.selectedAssetId()); controller.invalidateRadarResult(); renderer.render(); scene().renderAll(); }
      catch (error) { reportActionError("Cannot Add Radar Target", error); }
    });
    dom.btnRemoveRadarTarget.addEventListener("click", () => {
      controls.removeSelectedTarget(); controller.invalidateRadarResult(); renderer.render(); scene().renderAll();
    });
    dom.radarTargetList.addEventListener("click", (event) => {
      const target = event.target.closest("[data-target-id]");
      if (target && controls.selectTarget(target.dataset.targetId)) scene().renderAll();
    });

    const targetInputs = [dom.radarTargetAsset, dom.radarTargetX, dom.radarTargetY, dom.radarTargetZ, dom.radarTargetRoll, dom.radarTargetPitch, dom.radarTargetSpeed, dom.radarTargetDirection, dom.radarTargetClimb, dom.radarTargetRcs];
    for (const input of targetInputs) input.addEventListener("change", () => inputChanged());
    const parameterInputs = [
      dom.radarCarrierFrequency, dom.radarBandwidth, dom.radarNumSubcarriers, dom.radarNumSymbols, dom.radarTxPower, dom.radarNoiseFigure, dom.radarSystemLoss, dom.radarNoiseTemperature, dom.radarDirectPathCancellation,
      dom.radarCfarEnabled, dom.radarCfarGuardRange, dom.radarCfarGuardDoppler, dom.radarCfarTrainingRange, dom.radarCfarTrainingDoppler, dom.radarCfarPfa,
      dom.radarSamplesPerSrc, dom.radarMaxPaths, dom.radarMaxDepth, dom.radarSeed, dom.radarLos, dom.radarSpecular, dom.radarDiffuse, dom.radarRefraction, dom.radarDiffraction, dom.radarSyntheticArray,
    ];
    for (const input of parameterInputs) input.addEventListener("change", inputChanged);

    const canvas = document.getElementById("view");
    canvas.addEventListener("pointerdown", (event) => {
      if (state.mode === "radar" && !state.pickTarget && event.isPrimary && event.button === 0) targetPointer = {id: event.pointerId, x: event.clientX, y: event.clientY};
    });
    canvas.addEventListener("pointerup", (event) => {
      if (!targetPointer || targetPointer.id !== event.pointerId || state.mode !== "radar" || state.pickTarget) { targetPointer = null; return; }
      const moved = Math.hypot(event.clientX - targetPointer.x, event.clientY - targetPointer.y);
      targetPointer = null;
      if (moved > 6) return;
      const targetId = renderer.pickTarget(event.clientX, event.clientY);
      if (targetId && controls.selectTarget(targetId)) scene().renderAll();
    });
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
    context.ui.btnOrbitTx.disabled = !Array.isArray(radar.txVisual);
    if (!Array.isArray(radar.txVisual)) context.ui.btnOrbitTx.title = "Place Radar Tx before orbiting.";
    else context.ui.btnOrbitTx.removeAttribute("title");
  }

  return {
    attachEvents,
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
      dom.radarResultSections.classList.add("hidden");
    },
    onSettingsChanged() { controller.invalidateRadarResult(); renderer.clearResult(); },
    render() { renderStatus(); resultView.renderRadarResult(); renderer.render(); assetPreview.syncState(); },
    dispose() { assetPreview.dispose(); renderer.dispose(); },
  };
}
