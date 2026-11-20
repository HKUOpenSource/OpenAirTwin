import {radarSolvePayload, radarSolverConfig} from "/js/solvers/solver_payloads.js?v=20260722-radar-display-cleanup";
import {radarTargetColor} from "/js/features/radar/colors.js?v=20260722-radar-color-contract";
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

export function velocityToMotion(vector, fallbackDirectionDeg = 0) {
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

export function motionToVelocity(speed, directionDeg, climbDeg) {
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
  const {state} = context;
  const radar = state.radar;

  function assets() {
    return radar.assets.length ? radar.assets : RADAR_FALLBACK_ASSETS;
  }

  function assetFor(id) {
    return assets().find((asset) => asset.id === id) || null;
  }

  function setAssets(manifest) {
    const manifestAssets = Array.isArray(manifest?.assets) ? manifest.assets : [];
    radar.assets = manifestAssets.filter((asset) => asset?.id && asset?.visual?.url);
    radar.assetsLoaded = true;
    return radar.assets;
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

  function validateState() {
    radar.targets.forEach(alignTargetYaw);
    if (radar.mode === "monostatic") {
      radar.rx = radar.tx ? [...radar.tx] : null;
      radar.rxVisual = radar.rx ? [...radar.rx] : null;
    }
    radar.waveform.carrierFrequencyGhz = finite(radar.waveform.carrierFrequencyGhz, "Carrier frequency", {min: 0.1, max: 300});
    radar.waveform.bandwidthMhz = finite(radar.waveform.bandwidthMhz, "Bandwidth", {min: 1, max: 2000});
    radar.waveform.numSubcarriers = finite(radar.waveform.numSubcarriers, "Subcarrier count", {min: 16, max: 2048, integer: true});
    radar.waveform.numSymbols = finite(radar.waveform.numSymbols, "Symbol count", {min: 8, max: 1024, integer: true});
    if (radar.waveform.numSubcarriers * radar.waveform.numSymbols > 1048576) {
      throw new Error("OFDM subcarriers × symbols must not exceed 1,048,576 cells");
    }
    if (radar.waveform.bandwidthMhz * 1e6 >= 2 * radar.waveform.carrierFrequencyGhz * 1e9) {
      throw new Error("Bandwidth must keep the occupied RF band above 0 Hz");
    }
    const spacing = radar.waveform.bandwidthMhz * 1e6 / radar.waveform.numSubcarriers;
    if (spacing < 1000 || spacing > 1e7) {
      throw new Error("Derived subcarrier spacing must be between 1 kHz and 10 MHz");
    }
    radar.signal.txPowerDbm = finite(radar.signal.txPowerDbm, "Tx power", {min: -100, max: 100});
    radar.signal.noiseFigureDb = finite(radar.signal.noiseFigureDb, "Noise figure", {min: 0, max: 50});
    radar.signal.systemLossDb = finite(radar.signal.systemLossDb, "System loss", {min: 0, max: 100});
    radar.signal.noiseTemperatureK = finite(radar.signal.noiseTemperatureK, "Noise temperature", {min: 1, max: 1000});
    radar.signal.directPathCancellation = Boolean(radar.signal.directPathCancellation);
    radar.cfar.enabled = Boolean(radar.cfar.enabled);
    radar.cfar.guardRange = finite(radar.cfar.guardRange, "CFAR range guard", {min: 0, max: 64, integer: true});
    radar.cfar.guardDoppler = finite(radar.cfar.guardDoppler, "CFAR Doppler guard", {min: 0, max: 64, integer: true});
    radar.cfar.trainingRange = finite(radar.cfar.trainingRange, "CFAR range training", {min: 1, max: 128, integer: true});
    radar.cfar.trainingDoppler = finite(radar.cfar.trainingDoppler, "CFAR Doppler training", {min: 1, max: 128, integer: true});
    radar.cfar.falseAlarmProbability = finite(radar.cfar.falseAlarmProbability, "CFAR false-alarm probability", {min: 1e-12, max: 0.1});
    if (2 * (radar.cfar.guardRange + radar.cfar.trainingRange) + 1 > radar.waveform.numSubcarriers) {
      throw new Error("CFAR range window must fit within the OFDM subcarriers");
    }
    if (2 * (radar.cfar.guardDoppler + radar.cfar.trainingDoppler) + 1 > radar.waveform.numSymbols) {
      throw new Error("CFAR Doppler window must fit within the OFDM symbols");
    }
    radar.solver.samplesPerSrc = finite(radar.solver.samplesPerSrc, "Samples per source", {min: 1, max: 1e6, integer: true});
    radar.solver.maxNumPathsPerSrc = finite(radar.solver.maxNumPathsPerSrc, "Maximum paths", {min: 1, max: 1e6, integer: true});
    radar.solver.maxDepth = finite(radar.solver.maxDepth, "Maximum depth", {min: 0, max: 8, integer: true});
    radar.solver.seed = finite(radar.solver.seed, "Random seed", {min: 0, max: 2147483647, integer: true});
    return radar;
  }

  function updateSelectedTargetField(field, value) {
    const target = selectedTarget(radar);
    if (!target) return false;
    if (field === "assetId") {
      target.asset_id = String(value);
      return true;
    }
    if (field === "x" || field === "y" || field === "z") {
      const idx = field === "x" ? 0 : field === "y" ? 1 : 2;
      target.position[idx] = finite(value, `Target position ${field.toUpperCase()}`, {min: -1e6, max: 1e6});
      return true;
    }
    if (field === "rollDeg" || field === "pitchDeg") {
      const idx = field === "rollDeg" ? 0 : 1;
      target.orientation[idx] = finite(value, field, {min: -360, max: 360}) * Math.PI / 180;
      return true;
    }
    if (field === "speed" || field === "directionDeg" || field === "climbDeg") {
      const currentYawDeg = Number(target.orientation[2] || 0) * 180 / Math.PI;
      const motion = velocityToMotion(target.velocity, currentYawDeg);
      const nextSpeed = field === "speed" ? finite(value, "Target speed", {min: 0, max: 500}) : motion.speed;
      const nextDirection = field === "directionDeg"
        ? normalizeDirectionDeg(finite(value, "Target direction", {min: -180, max: 360}))
        : motion.directionDeg;
      const nextClimb = field === "climbDeg"
        ? finite(value, "Target climb angle", {min: -90, max: 90})
        : motion.climbDeg;
      target.orientation[2] = nextDirection * Math.PI / 180;
      target.velocity = motionToVelocity(nextSpeed, nextDirection, nextClimb);
      return true;
    }
    if (field === "rcsM2") {
      target.rcs_m2 = finite(value, "Effective RCS", {min: 1e-8, max: 10000});
      return true;
    }
    return false;
  }

  function buildControlsViewModel() {
    radar.targets.forEach(alignTargetYaw);
    const activeAssets = assets();
    const frequencyHz = Number(radar.waveform.carrierFrequencyGhz) * 1e9;
    const bandwidthHz = Number(radar.waveform.bandwidthMhz) * 1e6;
    const spacingHz = bandwidthHz / Math.max(1, Number(radar.waveform.numSubcarriers));
    const dopplerResolutionHz = spacingHz / Math.max(1, Number(radar.waveform.numSymbols));

    const target = selectedTarget(radar);
    let selectedTargetVm = null;
    if (target) {
      const directionDeg = alignTargetYaw(target);
      const motion = velocityToMotion(target.velocity, directionDeg);
      selectedTargetVm = {
        id: target.id,
        title: radarTargetDisplayName(target.id),
        assetId: target.asset_id,
        assetName: radarAssetDisplayName(activeAssets, target.asset_id),
        position: [Number(target.position[0]), Number(target.position[1]), Number(target.position[2])],
        orientationDeg: [
          Number((target.orientation[0] * 180 / Math.PI).toFixed(1)),
          Number((target.orientation[1] * 180 / Math.PI).toFixed(1)),
          Number(directionDeg.toFixed(1)),
        ],
        speed: Number(motion.speed.toFixed(2)),
        directionDeg: Number(motion.directionDeg.toFixed(1)),
        climbDeg: Number(motion.climbDeg.toFixed(1)),
        velocityPreview: `[${target.velocity.map((v) => Number(v).toFixed(1)).join(", ")}] m/s`,
        rcsM2: Number(target.rcs_m2),
      };
    }

    const activeJob = ["submitting", "queued", "running", "cancelling"].includes(radar.status);
    const picker = radar.picker || {};

    return {
      mode: radar.mode,
      modeHint: radar.mode === "monostatic"
        ? "Rx is locked to Tx for a co-located monostatic radar."
        : "Tx and Rx are placed independently for bistatic sensing.",
      job: {
        visible: activeJob || radar.status === "failed",
        status: radar.status,
        failureKind: radar.failureKind || "",
        message: radar.error || radar.message || "Ready",
        progress: Math.max(0, Math.min(1, Number(radar.progress) || 0)),
        canCancel: activeJob && Boolean(radar.jobId),
        canRetry: radar.status === "failed",
        active: activeJob,
      },
      assets: activeAssets.map((asset) => ({
        id: asset.id,
        label: radarAssetDisplayName(activeAssets, asset.id),
      })),
      pickerAssetId: picker.assetId || "",
      pickerAssetName: picker.assetName || "No drone models",
      pickerCountLabel: picker.countLabel || "0 / 0",
      pickerStatus: picker.status || "",
      pickerState: picker.state === "ready" || picker.state === "error" ? picker.state : "loading",
      pickerHint: picker.hint || "",
      hasMultipleAssets: Boolean(picker.hasMultipleAssets),
      canAddTarget: Boolean(picker.canAddTarget),
      addTargetDisabledReason: picker.addTargetDisabledReason || "",
      targetCountLabel: `${radar.targets.length} / ${RADAR_MAX_TARGETS}`,
      targets: radar.targets.map((item) => {
        const range = equivalentRadarRange(radar, item.position);
        return {
          id: item.id,
          title: radarAssetDisplayName(activeAssets, item.asset_id),
          meta: `${radarTargetDisplayName(item.id)} · ${range === null ? "Set Tx/Rx" : `${range.toFixed(1)} m`} · ${vectorLength(item.velocity).toFixed(1)} m/s`,
          color: radarTargetColor(item.id),
          selected: item.id === radar.selectedTargetId,
        };
      }),
      selectedTarget: selectedTargetVm,
      waveform: {
        carrierFrequencyGhz: Number(radar.waveform.carrierFrequencyGhz),
        bandwidthMhz: Number(radar.waveform.bandwidthMhz),
        numSubcarriers: Number(radar.waveform.numSubcarriers),
        numSymbols: Number(radar.waveform.numSymbols),
        rangeResolutionText: bandwidthHz > 0 ? `${(SPEED_OF_LIGHT_MPS / (2 * bandwidthHz)).toFixed(2)} m` : "--",
        dopplerResolutionText: Number.isFinite(dopplerResolutionHz) ? `${dopplerResolutionHz.toFixed(1)} Hz` : "--",
        velocityResolutionText: frequencyHz > 0 && Number.isFinite(dopplerResolutionHz)
          ? `${(SPEED_OF_LIGHT_MPS * dopplerResolutionHz / (2 * frequencyHz)).toFixed(2)} m/s`
          : "--",
      },
      signal: {...radar.signal},
      cfar: {...radar.cfar},
      solver: {
        samplesPerSrc: Number(radar.solver.samplesPerSrc),
        maxNumPathsPerSrc: Number(radar.solver.maxNumPathsPerSrc),
        maxDepth: Number(radar.solver.maxDepth),
        seed: Number(radar.solver.seed),
        los: Boolean(radar.solver.los),
        specularReflection: Boolean(radar.solver.specularReflection),
        diffuseReflection: Boolean(radar.solver.diffuseReflection),
        refraction: Boolean(radar.solver.refraction),
        diffraction: Boolean(radar.solver.diffraction),
        syntheticArray: Boolean(radar.solver.syntheticArray),
      },
      inputError: radar.error || "",
      runDisabledReason: deviceRequirementMessage(),
    };
  }

  function nextTargetId() {
    while (radar.targets.some((target) => target.id === `target-${radar.nextTargetNumber}`)) {
      radar.nextTargetNumber += 1;
    }
    return `target-${radar.nextTargetNumber++}`;
  }

  function addTarget(assetId = assets()[0]?.id) {
    if (radar.targets.length >= RADAR_MAX_TARGETS) {
      throw new Error(`Radar supports at most ${RADAR_MAX_TARGETS} targets`);
    }
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
    return id;
  }

  function removeSelectedTarget() {
    const index = radar.targets.findIndex((target) => target.id === radar.selectedTargetId);
    if (index < 0) return null;
    const [removed] = radar.targets.splice(index, 1);
    radar.selectedTargetId = radar.targets[Math.min(index, radar.targets.length - 1)]?.id || null;
    radar.selectedDetectionId = null;
    radar.selectedPath = -1;
    return removed;
  }

  function selectTarget(id) {
    if (!radar.targets.some((target) => target.id === id)) return false;
    radar.selectedTargetId = id;
    return true;
  }

  return Object.freeze({
    addTarget,
    assetFor,
    buildControlsViewModel,
    deviceRequirementMessage,
    devicesReady,
    readInputs: validateState,
    removeSelectedTarget,
    selectTarget,
    selectedTarget: () => selectedTarget(radar),
    setAssets,
    solvePayload: () => {
      validateState();
      const requirement = deviceRequirementMessage();
      if (requirement) throw new Error(requirement);
      return radarSolvePayload({state});
    },
    solverConfig: () => radarSolverConfig({state}),
    syncInputs: () => {},
    updateSelectedTargetField,
  });
}
