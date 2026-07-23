export const DEVICE_TARGET_LABELS = Object.freeze({
  "link-tx": "Link Tx",
  "link-rx": "Link Rx",
  "radar-tx": "Radar Tx",
  "radar-rx": "Radar Rx",
  "mobility-tx": "Mobility Tx",
  "mobility-rx": "Mobility Rx",
  "rm-tx": "Radio Map Tx",
  "deepmimo-tx": "DeepMIMO Tx",
  "deepmimo-roi": "DeepMIMO ROI",
});

const PICK_TAP_MAX_MOVE_PX = 6;
const PICK_TAP_MAX_DURATION_MS = 350;

export function placementPromptForTarget(target) {
  if (target === "deepmimo-roi") {
    return "Drag on the terrain to draw a rectangular DeepMIMO ROI";
  }
  if (target === "deepmimo-tx") {
    return "Click any surface to place DeepMIMO Tx";
  }
  return target === "link-rx" || target === "mobility-rx"
    ? "Click any surface to place Rx"
    : "Click any surface to place Tx";
}

export function isLinkDeviceTarget(target) {
  return target === "link-tx" || target === "link-rx";
}

export function isMobilityDeviceTarget(target) {
  return target === "mobility-tx" || target === "mobility-rx";
}

export function isDeepMimoDeviceTarget(target) {
  return target === "deepmimo-tx" || target === "deepmimo-roi";
}

export function createDevicePickingController(context) {
  const {features, picking, state, ui, viewerRef} = context;
  let pickTapCandidate = null;

  const solverControls = () => context.controllers.solver;
  const sceneRenderState = () => context.controllers.scene;

  function currentViewer() {
    return viewerRef.current;
  }

  function setPickStatus(message = "") {
    ui.hintText.textContent = message || "Click a surface point or adjust coordinates.";
  }

  function targetDefinition(targetId = state.deviceControl.activeTarget) {
    return picking.get(targetId);
  }

  function targetPrompt(targetId) {
    return targetDefinition(targetId)?.prompt || placementPromptForTarget(targetId);
  }

  function clearPickTapCandidate() {
    pickTapCandidate = null;
  }

  function readActiveDeviceInputs() {
    const target = targetDefinition();
    features.instance(target?.featureId)?.readInputs?.();
  }

  function clearActiveDevice({render = false, status = true} = {}) {
    clearPickTapCandidate();
    state.pickTarget = null;
    state.deviceControl.activeTarget = null;
    if (status) {
      setPickStatus();
    }
    if (render) {
      sceneRenderState().renderAll();
    }
  }

  function closeDevicePrecision() {
    readActiveDeviceInputs();
    clearActiveDevice({render: true});
  }

  function openDevicePrecision(target) {
    if (state.deviceControl.activeTarget === target) {
      closeDevicePrecision();
      return;
    }
    clearPickTapCandidate();
    readActiveDeviceInputs();
    const definition = targetDefinition(target);
    if (!definition || definition.featureId !== state.mode) {
      return;
    }
    features.instance(definition.featureId)?.readInputs?.();
    state.deviceControl.activeTarget = target;
    state.pickTarget = target;
    setPickStatus(targetPrompt(target));
    sceneRenderState().renderAll();
  }

  function refreshPickStatus(scope = "all") {
    const activeTarget = state.deviceControl.activeTarget;
    const shouldRefresh = scope === "all" || targetDefinition(activeTarget)?.scope === scope;
    if (shouldRefresh && activeTarget) {
      setPickStatus(targetPrompt(activeTarget));
    }
  }

  function txOrbitCenterForMode() {
    return features.store.get(state.mode).txVisual;
  }

  function readTxInputsForCurrentMode() {
    features.instance(state.mode)?.readInputs?.();
  }

  function stopTxOrbit() {
    currentViewer().stopTxOrbit();
  }

  function toggleTxOrbit() {
    const viewer = currentViewer();
    if (viewer.isTxOrbiting()) {
      viewer.stopTxOrbit();
      sceneRenderState().renderAll();
      return;
    }
    readTxInputsForCurrentMode();
    clearActiveDevice({status: true});
    viewer.startTxOrbit(txOrbitCenterForMode());
    sceneRenderState().renderAll();
  }

  function pickActiveDeviceAt(clientX, clientY, target, livePhase = "change") {
    const solver = solverControls();
    if (!target || state.pickTarget !== target) {
      return false;
    }
    const pick = currentViewer().pickOnSurface(
      clientX,
      clientY,
      solver.markerRadiusForPickTarget(target),
    );
    const definition = targetDefinition(target);
    if (!pick || typeof features.instance(definition?.featureId)?.applyPick !== "function") {
      setPickStatus(targetPrompt(target));
      return false;
    }
    solver.applyPick(pick, target);
    state.deviceControl.activeTarget = target;
    state.pickTarget = target;
    setPickStatus(targetPrompt(target));
    if (definition.pointerAdapter) {
      return true;
    }
    solver.handleLivePreviewDeviceUpdate(target, livePhase);
    return true;
  }

  function surfacePositionAt(clientX, clientY) {
    const pick = currentViewer().pickOnSurface(clientX, clientY, 0);
    return pick ? (pick.surfacePosition || pick.logicalPosition) : null;
  }

  function handlePickPointerDown(event) {
    if (!state.pickTarget || !event.isPrimary || event.button !== 0 || event.shiftKey) {
      clearPickTapCandidate();
      return;
    }
    const definition = targetDefinition(state.pickTarget);
    const feature = features.instance(definition?.featureId);
    if (definition?.pointerAdapter && typeof feature?.startPickDrag === "function") {
      const position = surfacePositionAt(event.clientX, event.clientY);
      if (!position) {
        setPickStatus(targetPrompt(state.pickTarget));
        return;
      }
      feature.startPickDrag(position, definition);
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
      sceneRenderState().renderAll();
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
      const definition = targetDefinition(pickTapCandidate.target);
      const feature = features.instance(definition?.featureId);
      const position = surfacePositionAt(event.clientX, event.clientY);
      if (position) {
        feature?.updatePickDrag?.(position, definition);
        setPickStatus(targetPrompt(pickTapCandidate.target));
        sceneRenderState().renderAll();
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

  function releaseViewPointerCapture(pointerId) {
    try {
      document.getElementById("view").releasePointerCapture(pointerId);
    } catch {}
  }

  function handlePickPointerUp(event) {
    if (!pickTapCandidate || event.pointerId !== pickTapCandidate.pointerId) {
      return;
    }
    const candidate = pickTapCandidate;
    clearPickTapCandidate();
    if (candidate.roiDrawing) {
      const definition = targetDefinition(candidate.target);
      const feature = features.instance(definition?.featureId);
      const position = surfacePositionAt(event.clientX, event.clientY);
      if (position) {
        feature?.finishPickDrag?.(position, definition);
      }
      state.deviceControl.activeTarget = candidate.target;
      state.pickTarget = candidate.target;
      setPickStatus(targetPrompt(candidate.target));
      sceneRenderState().renderAll();
      event.preventDefault();
      event.stopPropagation();
      releaseViewPointerCapture(event.pointerId);
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
      releaseViewPointerCapture(event.pointerId);
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
    releaseViewPointerCapture(event.pointerId);
  }

  function togglePickingTarget(targetId) {
    const definition = targetDefinition(targetId);
    const feature = features.instance(definition?.featureId);
    if (!definition || !feature) {
      return;
    }
    clearPickTapCandidate();
    if (state.pickTarget === targetId || state.deviceControl.activeTarget === targetId) {
      feature.cancelPicking?.(definition);
      state.pickTarget = null;
      state.deviceControl.activeTarget = null;
      setPickStatus();
      sceneRenderState().renderAll();
      return;
    }
    feature.readInputs?.();
    feature.beginPicking?.(definition);
    state.deviceControl.activeTarget = targetId;
    state.pickTarget = targetId;
    setPickStatus(targetPrompt(targetId));
    sceneRenderState().renderAll();
  }

  function clearPickingTarget(targetId) {
    const definition = targetDefinition(targetId);
    clearActiveDevice({status: true});
    features.instance(definition?.featureId)?.clearPicking?.(definition);
    sceneRenderState().renderAll();
  }

  function handleDeepMimoRoiPickToggle() {
    togglePickingTarget("deepmimo-roi");
  }

  function handleDeepMimoClearRoi() {
    clearPickingTarget("deepmimo-roi");
  }

  function handleDevicePrecisionEscape(event) {
    if (event.key !== "Escape" || !state.deviceControl.activeTarget) {
      return false;
    }
    event.preventDefault();
    clearPickTapCandidate();
    closeDevicePrecision();
    return true;
  }

  function attachPointerEvents(view) {
    view.addEventListener("pointerdown", handlePickPointerDown, {capture: true});
    window.addEventListener("pointermove", handlePickPointerMove, {capture: true});
    window.addEventListener("pointerup", handlePickPointerUp, {capture: true});
    window.addEventListener("pointercancel", clearPickTapCandidate);
    window.addEventListener("blur", clearPickTapCandidate);
    window.addEventListener("hku-tx-orbit-change", () => {
      sceneRenderState().renderAll();
    });
  }

  context.featureServices.picking = Object.freeze({
    toggleTarget: togglePickingTarget,
    clearTarget: clearPickingTarget,
  });

  return {
    attachPointerEvents,
    clearActiveDevice,
    clearPickTapCandidate,
    closeDevicePrecision,
    handleDeepMimoClearRoi,
    handleDeepMimoRoiPickToggle,
    handleDevicePrecisionEscape,
    isDeepMimoDeviceTarget,
    isLinkDeviceTarget,
    isMobilityDeviceTarget,
    openDevicePrecision,
    placementPromptForTarget,
    refreshPickStatus,
    setPickStatus,
    stopTxOrbit,
    toggleTxOrbit,
  };
}
