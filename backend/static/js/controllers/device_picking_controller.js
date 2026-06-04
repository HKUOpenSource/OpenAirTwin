export const DEVICE_TARGET_LABELS = Object.freeze({
  "link-tx": "Link Tx",
  "link-rx": "Link Rx",
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
  const {state, ui, viewerRef} = context;
  let pickTapCandidate = null;

  const solverControls = () => context.controllers.solver;
  const sceneRenderState = () => context.controllers.scene;

  function currentViewer() {
    return viewerRef.current;
  }

  function setPickStatus(message = "") {
    ui.hintText.textContent = message || "Click a surface point or adjust coordinates.";
  }

  function clearPickTapCandidate() {
    pickTapCandidate = null;
  }

  function readActiveDeviceInputs() {
    const solver = solverControls();
    if (isLinkDeviceTarget(state.deviceControl.activeTarget)) {
      solver.readLinkInputs();
      return;
    }
    if (isMobilityDeviceTarget(state.deviceControl.activeTarget)) {
      solver.readMobilityInputs();
      return;
    }
    if (state.deviceControl.activeTarget === "rm-tx") {
      solver.readRadiomapInputs();
      return;
    }
    if (isDeepMimoDeviceTarget(state.deviceControl.activeTarget)) {
      solver.readDeepMimoInputs();
    }
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
    const solver = solverControls();
    if (state.deviceControl.activeTarget === target) {
      closeDevicePrecision();
      return;
    }
    clearPickTapCandidate();
    readActiveDeviceInputs();
    if (isLinkDeviceTarget(target)) {
      solver.readLinkInputs();
    } else if (isMobilityDeviceTarget(target)) {
      solver.readMobilityInputs();
    } else if (target === "rm-tx") {
      solver.readRadiomapInputs();
    } else if (isDeepMimoDeviceTarget(target)) {
      solver.readDeepMimoInputs();
    }
    state.deviceControl.activeTarget = target;
    state.pickTarget = target;
    setPickStatus(placementPromptForTarget(target));
    sceneRenderState().renderAll();
  }

  function refreshPickStatus(scope = "all") {
    const activeTarget = state.deviceControl.activeTarget;
    const shouldRefresh = scope === "all"
      || (scope === "link" && isLinkDeviceTarget(activeTarget))
      || (scope === "mobility" && isMobilityDeviceTarget(activeTarget))
      || (scope === "radiomap" && activeTarget === "rm-tx")
      || (scope === "deepmimo" && isDeepMimoDeviceTarget(activeTarget));
    if (shouldRefresh && activeTarget) {
      setPickStatus(placementPromptForTarget(activeTarget));
    }
  }

  function txOrbitCenterForMode() {
    if (state.mode === "radiomap") {
      return state.radiomap.txVisual;
    }
    if (state.mode === "deepmimo") {
      return state.deepmimo.txVisual;
    }
    if (state.mode === "mobility") {
      return state.mobility.txVisual;
    }
    return state.link.txVisual;
  }

  function readTxInputsForCurrentMode() {
    const solver = solverControls();
    if (state.mode === "radiomap") {
      solver.readRadiomapInputs();
      return;
    }
    if (state.mode === "deepmimo") {
      solver.readDeepMimoInputs();
      return;
    }
    if (state.mode === "mobility") {
      solver.readMobilityInputs();
      return;
    }
    solver.readLinkInputs();
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
    solver.applyPick(pick);
    if (pick) {
      state.deviceControl.activeTarget = target;
      state.pickTarget = target;
      setPickStatus(placementPromptForTarget(target));
      if (target === "deepmimo-roi") {
        return true;
      }
      solver.handleLivePreviewDeviceUpdate(target, livePhase);
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
    const solver = solverControls();
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
      solver.startDeepMimoRoiDrag(position);
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
    const solver = solverControls();
    if (!pickTapCandidate || event.pointerId !== pickTapCandidate.pointerId) {
      return;
    }
    if (pickTapCandidate.roiDrawing) {
      const position = deepMimoSurfacePositionAt(event.clientX, event.clientY);
      if (position) {
        solver.updateDeepMimoRoiDrag(position);
        setPickStatus(placementPromptForTarget("deepmimo-roi"));
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
    const solver = solverControls();
    if (!pickTapCandidate || event.pointerId !== pickTapCandidate.pointerId) {
      return;
    }
    const candidate = pickTapCandidate;
    clearPickTapCandidate();
    if (candidate.roiDrawing) {
      const position = deepMimoSurfacePositionAt(event.clientX, event.clientY);
      if (position) {
        solver.finishDeepMimoRoiDrag(position);
      }
      state.deviceControl.activeTarget = "deepmimo-roi";
      state.pickTarget = "deepmimo-roi";
      setPickStatus(placementPromptForTarget("deepmimo-roi"));
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

  function handleDeepMimoRoiPickToggle() {
    const solver = solverControls();
    clearPickTapCandidate();
    if (state.pickTarget === "deepmimo-roi" || state.deviceControl.activeTarget === "deepmimo-roi") {
      state.deepmimo.roi.pickingStep = "a";
      state.pickTarget = null;
      state.deviceControl.activeTarget = null;
      setPickStatus();
      sceneRenderState().renderAll();
      return;
    }
    solver.readDeepMimoInputs();
    state.deepmimo.roi.pickingStep = "drag";
    state.deviceControl.activeTarget = "deepmimo-roi";
    state.pickTarget = "deepmimo-roi";
    setPickStatus(placementPromptForTarget("deepmimo-roi"));
    sceneRenderState().renderAll();
  }

  function handleDeepMimoClearRoi() {
    clearActiveDevice({status: true});
    solverControls().clearDeepMimoRoi();
    sceneRenderState().renderAll();
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
