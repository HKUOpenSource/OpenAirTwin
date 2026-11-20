import {createRadarAssetPreview} from "/js/features/radar/asset_preview.js?v=20260723-radar-empty-scene";

export function createRadarFeature(context) {
  const {controller, hosts, renderer, resultView, state, transport} = context;
  const radar = state.radar;
  const controls = context.featureServices.radarControls;
  const shared = context.featureServices.solver;
  const scene = () => context.controllers.scene;
  const picking = () => context.controllers.devicePicking;
  let manifestPromise = null;
  let targetPointer = null;
  let pointerCanvas = null;

  const assetPreview = createRadarAssetPreview({
    hosts,
    state,
    viewerRef: context.viewerRef,
    onStateChange: () => {
      context.controllers.solver?.publishControls?.();
    },
  });

  function reportActionError(title, error) {
    scene().hideOverlay(null, true);
    context.utilities.showErrorDialog(title, error);
  }

  function inputChanged() {
    controller.handleInputChanged();
    renderer.render();
    scene().renderAll();
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
          scene().renderAll();
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
    pointerCanvas = hosts.require("view");
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

  function handleControlUpdate(scope, field, value) {
    if (scope === "radar" && field === "mode") {
      radar.mode = value === "monostatic" ? "monostatic" : "bistatic";
      if (radar.mode === "monostatic") {
        radar.rx = radar.tx ? [...radar.tx] : null;
        radar.rxVisual = radar.rx ? [...radar.rx] : null;
        if (state.deviceControl.activeTarget === "radar-rx") {
          picking().closeDevicePrecision();
        }
      }
      inputChanged();
      return true;
    }
    if (scope === "radar.target") {
      try {
        controls.updateSelectedTargetField(field, value);
        radar.error = null;
      } catch (error) {
        radar.error = error.message;
      }
      inputChanged();
      return true;
    }
    if (scope === "radar.waveform" && field in radar.waveform) {
      radar.waveform[field] = Number(value);
      inputChanged();
      return true;
    }
    if (scope === "radar.signal" && field in radar.signal) {
      radar.signal[field] = field === "directPathCancellation" ? Boolean(value) : Number(value);
      inputChanged();
      return true;
    }
    if (scope === "radar.cfar" && field in radar.cfar) {
      radar.cfar[field] = field === "enabled" ? Boolean(value) : Number(value);
      inputChanged();
      return true;
    }
    if (scope === "radar.solver" && field in radar.solver) {
      radar.solver[field] = typeof radar.solver[field] === "boolean" ? Boolean(value) : Number(value);
      inputChanged();
      return true;
    }
    return false;
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
        assetPreview.syncState();
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
      assetPreview.syncState();
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
    controller.invalidateRadarResult();
    renderer.render();
  }

  return {
    attachEvents,
    handleControlAction,
    handleControlUpdate,
    handleControlGroupToggle,
    applyPick,
    markerPositions() {
      return {tx: radar.txVisual, rx: radar.mode === "monostatic" ? null : radar.rxVisual};
    },
    readInputs: () => controls.readInputs(),
    runRequirementMessage: () => controls.deviceRequirementMessage(),
    invalidateRadarResult: (options) => controller.invalidateRadarResult(options),
    activate() {
      context.viewerRef.current.clearOverlay();
      loadAssets();
      assetPreview.activate();
      renderer.activate();
    },
    deactivate() {
      assetPreview.deactivate();
      renderer.deactivate();
    },
    onSettingsChanged() {
      controller.invalidateRadarResult();
    },
    render() {
      assetPreview.syncState();
      renderer.render();
      resultView.renderRadarResult();
    },
    dispose,
  };
}
