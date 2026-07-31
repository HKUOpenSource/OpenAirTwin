import {radarSolvePayload, radarSolverConfig} from "/js/solvers/solver_payloads.js?v=20260722-radar-display-cleanup";
import {
  RADAR_FALLBACK_ASSETS,
  radarAssetDisplayName,
  radarTargetDisplayName,
} from "/js/features/radar/presentation.js?v=20260722-radar-ui-consistency";

const SPEED_OF_LIGHT_MPS = 299792458;
export const RADAR_MAX_TARGETS = 16;
const INITIAL_SPEED_MIN_MPS = 5;
const INITIAL_SPEED_MAX_MPS = 15;
const INITIAL_DIRECTION_MIN_DEG = -180;
const INITIAL_DIRECTION_MAX_DEG = 180;
const INITIAL_CLIMB_MIN_DEG = -10;
const INITIAL_CLIMB_MAX_DEG = 10;

function finite(value, label, {min = -Infinity, max = Infinity, integer = false} = {}) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < min || number > max || (integer && !Number.isInteger(number))) {
    throw new Error(`${label} must be ${integer ? "an integer" : "a number"} between ${min} and ${max}`);
  }
  return number;
}

function vectorLength(vector) {
  return Math.hypot(...vector);
}

function normalizeDirectionDeg(value) {
  const normalized = ((Number(value) + 180) % 360 + 360) % 360 - 180;
  return Object.is(normalized, -0) ? 0 : normalized;
}

function velocityToMotion(vector, fallbackDirectionDeg = 0) {
  const velocity = vector.map(Number);
  const speed = vectorLength(velocity);
  const horizontal = Math.hypot(velocity[0], velocity[1]);
  return {
    speed,
    directionDeg: horizontal > 1e-9
      ? normalizeDirectionDeg(Math.atan2(velocity[1], velocity[0]) * 180 / Math.PI)
      : normalizeDirectionDeg(fallbackDirectionDeg),
    climbDeg: speed > 1e-9 ? Math.atan2(velocity[2], horizontal) * 180 / Math.PI : 0,
  };
}

function motionToVelocity(speed, directionDeg, climbDeg) {
  const direction = directionDeg * Math.PI / 180;
  const climb = climbDeg * Math.PI / 180;
  const horizontal = speed * Math.cos(climb);
  return [
    horizontal * Math.cos(direction),
    horizontal * Math.sin(direction),
    speed * Math.sin(climb),
  ].map((value) => Math.abs(value) < 1e-10 ? 0 : value);
}

function randomInRange(minimum, maximum, digits) {
  const scale = 10 ** digits;
  return Math.round((minimum + Math.random() * (maximum - minimum)) * scale) / scale;
}

function randomInitialMotion() {
  const speed = randomInRange(INITIAL_SPEED_MIN_MPS, INITIAL_SPEED_MAX_MPS, 2);
  const directionDeg = normalizeDirectionDeg(
    randomInRange(INITIAL_DIRECTION_MIN_DEG, INITIAL_DIRECTION_MAX_DEG, 1),
  );
  const climbDeg = randomInRange(INITIAL_CLIMB_MIN_DEG, INITIAL_CLIMB_MAX_DEG, 1);
  return {
    speed,
    directionDeg,
    climbDeg,
    velocity: motionToVelocity(speed, directionDeg, climbDeg),
  };
}

function equivalentRadarRange(radar, position) {
  if (!Array.isArray(radar.tx)) return null;
  const rxPosition = radar.mode === "monostatic" ? radar.tx : radar.rx;
  if (!Array.isArray(rxPosition)) return null;
  const txRange = vectorLength(position.map((value, index) => value - radar.tx[index]));
  const rxRange = vectorLength(position.map((value, index) => value - rxPosition[index]));
  return (txRange + rxRange) / 2;
}

function selectedTarget(radar) {
  return radar.targets.find((target) => target.id === radar.selectedTargetId) || null;
}

function alignTargetYaw(target) {
  const orientation = Array.isArray(target.orientation) ? target.orientation : [0, 0, 0];
  const fallbackDirectionDeg = Number(orientation[2]) * 180 / Math.PI;
  const directionDeg = velocityToMotion(target.velocity, fallbackDirectionDeg).directionDeg;
  target.orientation = [Number(orientation[0]), Number(orientation[1]), directionDeg * Math.PI / 180];
  return directionDeg;
}

export function createRadarControls(context) {
  const {dom, state} = context;
  const radar = state.radar;

  function publishControlledFields() {
    context.featureServices.controls.updateFields(
      Object.values(dom)
        .filter((field) => field instanceof HTMLInputElement || field instanceof HTMLSelectElement)
        .map((field) => ({
          id: field.id,
          value: field.value,
          disabled: field.disabled,
          ...(field instanceof HTMLInputElement
            ? {
              checked: field.checked,
              readOnly: field.readOnly,
              min: field.min,
              max: field.max,
              step: field.step,
            }
            : {}),
        })),
    );
  }

  function assets() {
    return radar.assets.length ? radar.assets : RADAR_FALLBACK_ASSETS;
  }

  function assetFor(id) {
    return assets().find((asset) => asset.id === id) || null;
  }

  function setSelectOptions(select, selectedId) {
    const oldValue = selectedId || select.value;
    const options = assets().map((asset) => ({
      label: radarAssetDisplayName(assets(), asset.id),
      value: asset.id,
    }));
    const selectedValue = options.some((option) => option.value === oldValue)
      ? oldValue
      : options[0]?.value || "";
    context.featureServices.controls.updateSelectOptions(
      select.id,
      options,
      selectedValue,
    );
  }

  function setAssets(manifest) {
    const manifestAssets = Array.isArray(manifest?.assets) ? manifest.assets : [];
    radar.assets = manifestAssets.filter((asset) => asset?.id && asset?.visual?.url);
    radar.assetsLoaded = true;
    syncInputs();
    return radar.assets;
  }

  function setVectorInputs(inputs, values, digits = 2) {
    if (!Array.isArray(values)) {
      inputs.forEach((input) => { input.value = ""; });
      return;
    }
    inputs.forEach((input, index) => { input.value = Number(values[index]).toFixed(digits); });
  }

  function readDeviceVector(inputs, label) {
    const values = inputs.map((input) => input.value.trim());
    if (values.some((value) => value === "")) return null;
    return values.map((value, index) => finite(value, `${label} ${"XYZ"[index]}`, {min: -1e6, max: 1e6}));
  }

  function devicesReady() {
    return Array.isArray(radar.tx)
      && (radar.mode === "monostatic" || Array.isArray(radar.rx));
  }

  function deviceRequirementMessage() {
    if (!Array.isArray(radar.tx) && radar.mode === "bistatic" && !Array.isArray(radar.rx)) {
      return "Place Radar Tx and Rx before running sensing.";
    }
    if (!Array.isArray(radar.tx)) return "Place Radar Tx before running sensing.";
    if (radar.mode === "bistatic" && !Array.isArray(radar.rx)) {
      return "Place Radar Rx before running sensing.";
    }
    return "";
  }

  function syncTargetList() {
    context.featureServices.controls.updateRadarTargets(
      radar.targets.map((target) => {
        const range = equivalentRadarRange(radar, target.position);
        return {
          id: target.id,
          name: radarAssetDisplayName(assets(), target.asset_id),
          meta: `${radarTargetDisplayName(target.id)} · ${range === null ? "Set Tx/Rx" : `${range.toFixed(1)} m`} · ${vectorLength(target.velocity).toFixed(1)} m/s`,
          selected: target.id === radar.selectedTargetId,
        };
      }),
      `${radar.targets.length} / ${RADAR_MAX_TARGETS}`,
    );
  }

  function syncTargetEditor() {
    const target = selectedTarget(radar);
    const editorControls = [dom.radarTargetAsset, dom.radarTargetX, dom.radarTargetY, dom.radarTargetZ, dom.radarTargetRoll, dom.radarTargetPitch, dom.radarTargetYaw, dom.radarTargetSpeed, dom.radarTargetDirection, dom.radarTargetClimb, dom.radarTargetRcs, dom.btnPickRadarTarget, dom.btnFocusRadarTarget, dom.btnRemoveRadarTarget];
    dom.radarTargetEditor.classList.toggle("empty", !target);
    dom.radarEditorTitle.textContent = target ? radarTargetDisplayName(target.id) : "No target selected";
    dom.radarEditorAssetName.textContent = target ? radarAssetDisplayName(assets(), target.asset_id) : "Add a drone to edit";
    setSelectOptions(dom.radarTargetAsset, target?.asset_id);
    editorControls.forEach((control) => { control.disabled = !target; });
    if (!target) {
      setVectorInputs([dom.radarTargetX, dom.radarTargetY, dom.radarTargetZ], null);
      setVectorInputs([dom.radarTargetRoll, dom.radarTargetPitch, dom.radarTargetYaw], null);
      setVectorInputs([dom.radarTargetSpeed, dom.radarTargetDirection, dom.radarTargetClimb], null);
      dom.radarTargetRcs.value = "";
      dom.radarVelocityVectorPreview.textContent = "Velocity unavailable";
      return;
    }
    setVectorInputs([dom.radarTargetX, dom.radarTargetY, dom.radarTargetZ], target.position);
    const directionDeg = alignTargetYaw(target);
    setVectorInputs([dom.radarTargetRoll, dom.radarTargetPitch], target.orientation.slice(0, 2).map((value) => value * 180 / Math.PI), 1);
    dom.radarTargetYaw.value = directionDeg.toFixed(1);
    const motion = velocityToMotion(target.velocity, directionDeg);
    dom.radarTargetSpeed.value = motion.speed.toFixed(2);
    dom.radarTargetDirection.value = motion.directionDeg.toFixed(1);
    dom.radarTargetClimb.value = motion.climbDeg.toFixed(1);
    dom.radarVelocityVectorPreview.textContent = `Velocity [${target.velocity.map((value) => Number(value).toFixed(1)).join(", ")}] m/s`;
    dom.radarTargetRcs.value = String(target.rcs_m2);
  }

  function syncDerived() {
    const frequencyHz = radar.waveform.carrierFrequencyGhz * 1e9;
    const bandwidthHz = radar.waveform.bandwidthMhz * 1e6;
    const spacingHz = bandwidthHz / radar.waveform.numSubcarriers;
    const dopplerResolutionHz = spacingHz / radar.waveform.numSymbols;
    dom.radarRangeResolutionPreview.textContent = `${(SPEED_OF_LIGHT_MPS / (2 * bandwidthHz)).toFixed(2)} m`;
    dom.radarDopplerResolutionPreview.textContent = `${dopplerResolutionHz.toFixed(1)} Hz`;
    dom.radarVelocityResolutionPreview.textContent = `${(SPEED_OF_LIGHT_MPS * dopplerResolutionHz / (2 * frequencyHz)).toFixed(2)} m/s`;
  }

  function syncInputs() {
    radar.targets.forEach(alignTargetYaw);
    dom.radarModeHint.textContent = radar.mode === "monostatic" ? "Rx is locked to Tx for a co-located monostatic radar." : "Tx and Rx are placed independently for bistatic sensing.";
    // Precision coordinate cards are owned by the shared Picking controller. It
    // must remain the only authority deciding whether the active Tx or Rx card is
    // visible; otherwise bistatic input sync exposes both cards at once.
    dom.btnPickRadarRx.classList.toggle("hidden", radar.mode === "monostatic" || state.mode !== "radar");
    syncTargetList();
    syncTargetEditor();
    if (radar.tx || state.deviceControl.activeTarget !== "radar-tx") {
      setVectorInputs([dom.radarTxX, dom.radarTxY, dom.radarTxZ], radar.tx, 1);
    }
    if (radar.rx || state.deviceControl.activeTarget !== "radar-rx") {
      setVectorInputs([dom.radarRxX, dom.radarRxY, dom.radarRxZ], radar.rx, 1);
    }
    dom.radarModeMonostatic.checked = radar.mode === "monostatic";
    dom.radarModeBistatic.checked = radar.mode === "bistatic";
    const values = {
      radarCarrierFrequency: radar.waveform.carrierFrequencyGhz, radarBandwidth: radar.waveform.bandwidthMhz,
      radarNumSubcarriers: radar.waveform.numSubcarriers, radarNumSymbols: radar.waveform.numSymbols,
      radarTxPower: radar.signal.txPowerDbm, radarNoiseFigure: radar.signal.noiseFigureDb,
      radarSystemLoss: radar.signal.systemLossDb, radarNoiseTemperature: radar.signal.noiseTemperatureK,
      radarCfarGuardRange: radar.cfar.guardRange, radarCfarGuardDoppler: radar.cfar.guardDoppler,
      radarCfarTrainingRange: radar.cfar.trainingRange, radarCfarTrainingDoppler: radar.cfar.trainingDoppler,
      radarCfarPfa: radar.cfar.falseAlarmProbability, radarSamplesPerSrc: radar.solver.samplesPerSrc,
      radarMaxPaths: radar.solver.maxNumPathsPerSrc, radarMaxDepth: radar.solver.maxDepth, radarSeed: radar.solver.seed,
    };
    Object.entries(values).forEach(([id, value]) => { dom[id].value = String(value); });
    dom.radarDirectPathCancellation.checked = radar.signal.directPathCancellation;
    dom.radarCfarEnabled.checked = radar.cfar.enabled;
    dom.radarLos.checked = radar.solver.los;
    dom.radarSpecular.checked = radar.solver.specularReflection;
    dom.radarDiffuse.checked = radar.solver.diffuseReflection;
    dom.radarRefraction.checked = radar.solver.refraction;
    dom.radarDiffraction.checked = radar.solver.diffraction;
    dom.radarSyntheticArray.checked = radar.solver.syntheticArray;
    syncDerived();
    publishControlledFields();
  }

  function readTargetEditor() {
    const target = selectedTarget(radar);
    if (!target) return;
    target.asset_id = dom.radarTargetAsset.value;
    target.position = [dom.radarTargetX, dom.radarTargetY, dom.radarTargetZ].map((input, index) => finite(input.value, `Target position ${"XYZ"[index]}`, {min: -1e6, max: 1e6}));
    const [roll, pitch] = [dom.radarTargetRoll, dom.radarTargetPitch].map((input, index) => finite(input.value, `Target ${index ? "pitch" : "roll"}`, {min: -360, max: 360}) * Math.PI / 180);
    const speed = finite(dom.radarTargetSpeed.value, "Target speed", {min: 0, max: 500});
    const direction = normalizeDirectionDeg(finite(dom.radarTargetDirection.value, "Target direction", {min: -180, max: 360}));
    const climb = finite(dom.radarTargetClimb.value, "Target climb angle", {min: -90, max: 90});
    target.orientation = [roll, pitch, direction * Math.PI / 180];
    target.velocity = motionToVelocity(speed, direction, climb);
    dom.radarTargetDirection.value = direction.toFixed(1);
    dom.radarTargetYaw.value = direction.toFixed(1);
    dom.radarVelocityVectorPreview.textContent = `Velocity [${target.velocity.map((value) => value.toFixed(1)).join(", ")}] m/s`;
    target.rcs_m2 = finite(dom.radarTargetRcs.value, "Effective RCS", {min: 1e-8, max: 10000});
  }

  function readInputs() {
    radar.mode = dom.radarModeMonostatic.checked ? "monostatic" : "bistatic";
    radar.tx = readDeviceVector([dom.radarTxX, dom.radarTxY, dom.radarTxZ], "Radar Tx");
    radar.txVisual = radar.tx ? [...radar.tx] : null;
    radar.rx = radar.mode === "monostatic"
      ? (radar.tx ? [...radar.tx] : null)
      : readDeviceVector([dom.radarRxX, dom.radarRxY, dom.radarRxZ], "Radar Rx");
    radar.rxVisual = radar.rx ? [...radar.rx] : null;
    readTargetEditor();
    radar.targets.forEach(alignTargetYaw);
    radar.waveform.carrierFrequencyGhz = finite(dom.radarCarrierFrequency.value, "Carrier frequency", {min: 0.1, max: 300});
    radar.waveform.bandwidthMhz = finite(dom.radarBandwidth.value, "Bandwidth", {min: 1, max: 2000});
    radar.waveform.numSubcarriers = finite(dom.radarNumSubcarriers.value, "Subcarrier count", {min: 16, max: 2048, integer: true});
    radar.waveform.numSymbols = finite(dom.radarNumSymbols.value, "Symbol count", {min: 8, max: 1024, integer: true});
    if (radar.waveform.numSubcarriers * radar.waveform.numSymbols > 1048576) throw new Error("OFDM subcarriers × symbols must not exceed 1,048,576 cells");
    if (radar.waveform.bandwidthMhz * 1e6 >= 2 * radar.waveform.carrierFrequencyGhz * 1e9) throw new Error("Bandwidth must keep the occupied RF band above 0 Hz");
    const spacing = radar.waveform.bandwidthMhz * 1e6 / radar.waveform.numSubcarriers;
    if (spacing < 1000 || spacing > 1e7) throw new Error("Derived subcarrier spacing must be between 1 kHz and 10 MHz");
    radar.signal.txPowerDbm = finite(dom.radarTxPower.value, "Tx power", {min: -100, max: 100});
    radar.signal.noiseFigureDb = finite(dom.radarNoiseFigure.value, "Noise figure", {min: 0, max: 50});
    radar.signal.systemLossDb = finite(dom.radarSystemLoss.value, "System loss", {min: 0, max: 100});
    radar.signal.noiseTemperatureK = finite(dom.radarNoiseTemperature.value, "Noise temperature", {min: 1, max: 1000});
    radar.signal.directPathCancellation = dom.radarDirectPathCancellation.checked;
    radar.cfar.enabled = dom.radarCfarEnabled.checked;
    radar.cfar.guardRange = finite(dom.radarCfarGuardRange.value, "CFAR range guard", {min: 0, max: 64, integer: true});
    radar.cfar.guardDoppler = finite(dom.radarCfarGuardDoppler.value, "CFAR Doppler guard", {min: 0, max: 64, integer: true});
    radar.cfar.trainingRange = finite(dom.radarCfarTrainingRange.value, "CFAR range training", {min: 1, max: 128, integer: true});
    radar.cfar.trainingDoppler = finite(dom.radarCfarTrainingDoppler.value, "CFAR Doppler training", {min: 1, max: 128, integer: true});
    radar.cfar.falseAlarmProbability = finite(dom.radarCfarPfa.value, "CFAR false-alarm probability", {min: 1e-12, max: 0.1});
    if (2 * (radar.cfar.guardRange + radar.cfar.trainingRange) + 1 > radar.waveform.numSubcarriers) throw new Error("CFAR range window must fit within the OFDM subcarriers");
    if (2 * (radar.cfar.guardDoppler + radar.cfar.trainingDoppler) + 1 > radar.waveform.numSymbols) throw new Error("CFAR Doppler window must fit within the OFDM symbols");
    radar.solver.samplesPerSrc = finite(dom.radarSamplesPerSrc.value, "Samples per source", {min: 1, max: 1e6, integer: true});
    radar.solver.maxNumPathsPerSrc = finite(dom.radarMaxPaths.value, "Maximum paths", {min: 1, max: 1e6, integer: true});
    radar.solver.maxDepth = finite(dom.radarMaxDepth.value, "Maximum depth", {min: 0, max: 8, integer: true});
    radar.solver.seed = finite(dom.radarSeed.value, "Random seed", {min: 0, max: 2147483647, integer: true});
    radar.solver.los = dom.radarLos.checked; radar.solver.specularReflection = dom.radarSpecular.checked;
    radar.solver.diffuseReflection = dom.radarDiffuse.checked; radar.solver.refraction = dom.radarRefraction.checked;
    radar.solver.diffraction = dom.radarDiffraction.checked; radar.solver.syntheticArray = dom.radarSyntheticArray.checked;
    syncDerived();
    return radar;
  }

  function nextTargetId() {
    while (radar.targets.some((target) => target.id === `target-${radar.nextTargetNumber}`)) radar.nextTargetNumber += 1;
    return `target-${radar.nextTargetNumber++}`;
  }

  function addTarget(assetId = assets()[0]?.id) {
    if (radar.targets.length >= RADAR_MAX_TARGETS) throw new Error(`Radar supports at most ${RADAR_MAX_TARGETS} targets`);
    const asset = assetFor(assetId) || assets()[0];
    if (!asset) throw new Error("No Radar drone asset is available");
    const id = nextTargetId();
    const offset = radar.targets.length * 5;
    const motion = randomInitialMotion();
    radar.targets.push({
      id,
      asset_id: asset.id,
      position: [82 + offset, 42, 24],
      orientation: [0, 0, motion.directionDeg * Math.PI / 180],
      velocity: motion.velocity,
      rcs_m2: Number(asset.default_effective_rcs_m2 || 0.01),
    });
    radar.selectedTargetId = id;
    syncInputs();
    return id;
  }

  function removeSelectedTarget() {
    const index = radar.targets.findIndex((target) => target.id === radar.selectedTargetId);
    if (index < 0) return null;
    const [removed] = radar.targets.splice(index, 1);
    radar.selectedTargetId = radar.targets[Math.min(index, radar.targets.length - 1)]?.id || null;
    radar.selectedDetectionId = null;
    radar.selectedPath = -1;
    syncInputs();
    return removed;
  }

  function selectTarget(id) {
    if (!radar.targets.some((target) => target.id === id)) return false;
    radar.selectedTargetId = id;
    syncInputs();
    return true;
  }

  return Object.freeze({
    addTarget, assetFor, deviceRequirementMessage, devicesReady, readInputs, readTargetEditor, removeSelectedTarget, selectTarget, selectedTarget: () => selectedTarget(radar), setAssets,
    solvePayload: () => {
      radar.targets.forEach(alignTargetYaw);
      const requirement = deviceRequirementMessage();
      if (requirement) throw new Error(requirement);
      return radarSolvePayload({state});
    },
    solverConfig: () => radarSolverConfig({state}), syncInputs,
  });
}
