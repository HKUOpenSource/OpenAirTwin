import {antennaArrayPayload} from "/js/solvers/antenna_config.js?v=20260519-mode-isolation";

function requireDevicePosition(position, message) {
  if (
    !Array.isArray(position)
    || position.length !== 3
    || !position.map(Number).every(Number.isFinite)
  ) {
    throw new Error(message);
  }
  return position.map(Number);
}

export function commonSolverConfig({state, inputs, includeTxArray = true} = {}) {
  const solverConfig = {
    frequency_hz: Number(inputs.cfgFrequency.value) * 1e9,
    max_depth: Number(inputs.cfgMaxDepth.value),
    los: inputs.cfgLos.checked,
    specular_reflection: inputs.cfgSpecular.checked,
    diffuse_reflection: inputs.cfgDiffuse.checked,
    refraction: inputs.cfgRefraction.checked,
    seed: Number(inputs.cfgSeed.value),
  };
  if (includeTxArray) {
    solverConfig.tx_array = antennaArrayPayload(state.antenna.txArray);
  }
  return solverConfig;
}

export function linkSolverConfig({state, inputs} = {}) {
  const advanced = state.link.advanced;
  return {
    ...commonSolverConfig({state, inputs}),
    samples_per_src: advanced.samplesPerSrc,
    max_num_paths_per_src: advanced.maxNumPathsPerSrc,
    synthetic_array: advanced.syntheticArray,
    diffraction: advanced.diffraction,
    edge_diffraction: advanced.edgeDiffraction,
    diffraction_lit_region: advanced.diffractionLitRegion,
    rx_array: antennaArrayPayload(state.antenna.rxArray),
  };
}

export function linkChannelConfig({state} = {}) {
  const advanced = state.link.advanced;
  return {
    compute_taps: advanced.computeTaps,
    l_min: advanced.tapLMin,
    l_max: advanced.tapLMax,
    fft_size: advanced.tapFftSize,
    subcarrier_spacing_hz: advanced.tapSubcarrierSpacingHz,
  };
}

export function linkSolvePayload({state, inputs, preview = false} = {}) {
  const solver = linkSolverConfig({state, inputs});
  const channel = linkChannelConfig({state});
  const txPosition = requireDevicePosition(state.link.tx, "Place Link Tx before solving the link.");
  const rxPosition = requireDevicePosition(state.link.rx, "Place Link Rx before solving the link.");
  if (preview) {
    solver.samples_per_src = Math.max(1, Math.floor(Number(state.livePreview.link.previewSamplesPerSrc)));
    solver.max_num_paths_per_src = Math.min(Number(solver.max_num_paths_per_src), 10000);
    channel.compute_taps = false;
  }
  return {
    tx: {position: txPosition, orientation: [0, 0, 0]},
    rx: {position: rxPosition, orientation: [0, 0, 0]},
    solver,
    channel,
  };
}

export function radarSolverConfig({state, inputs} = {}) {
  const radar = state.radar;
  const solver = radar.solver;
  const arrayPayload = (array) => ({
    num_rows: Number(array.numRows),
    num_cols: Number(array.numCols),
    vertical_spacing: Number(array.verticalSpacing),
    horizontal_spacing: Number(array.horizontalSpacing),
    pattern: array.pattern,
    polarization: array.polarization,
  });
  return {
    max_depth: Number(solver.maxDepth),
    samples_per_src: Number(solver.samplesPerSrc),
    max_num_paths_per_src: Number(solver.maxNumPathsPerSrc),
    synthetic_array: Boolean(solver.syntheticArray),
    los: Boolean(solver.los),
    specular_reflection: Boolean(solver.specularReflection),
    diffuse_reflection: Boolean(solver.diffuseReflection),
    refraction: Boolean(solver.refraction),
    diffraction: Boolean(solver.diffraction),
    edge_diffraction: Boolean(solver.edgeDiffraction),
    diffraction_lit_region: Boolean(solver.diffractionLitRegion),
    seed: Number(solver.seed),
    tx_array: arrayPayload(solver.txArray),
    rx_array: arrayPayload(solver.rxArray),
  };
}

export function radarSolvePayload({state, inputs} = {}) {
  const radar = state.radar;
  const solver = radarSolverConfig({state, inputs});
  const tx = {position: [...radar.tx], orientation: [0, 0, 0], velocity: [0, 0, 0]};
  const rxPosition = radar.mode === "monostatic" ? [...radar.tx] : [...radar.rx];
  return {
    schema_version: 1,
    mode: radar.mode,
    tx,
    rx: {position: rxPosition, orientation: [0, 0, 0], velocity: [0, 0, 0]},
    targets: radar.targets.map((target) => ({
      id: target.id,
      asset_id: target.asset_id,
      position: [...target.position],
      orientation: [...target.orientation],
      velocity: [...target.velocity],
      rcs_m2: Number(target.rcs_m2),
    })),
    waveform: {
      carrier_frequency_hz: Number(radar.waveform.carrierFrequencyGhz) * 1e9,
      bandwidth_hz: Number(radar.waveform.bandwidthMhz) * 1e6,
      num_subcarriers: Number(radar.waveform.numSubcarriers),
      num_symbols: Number(radar.waveform.numSymbols),
    },
    solver,
    signal: {
      tx_power_dbm: Number(radar.signal.txPowerDbm),
      noise_figure_db: Number(radar.signal.noiseFigureDb),
      system_loss_db: Number(radar.signal.systemLossDb),
      noise_temperature_k: Number(radar.signal.noiseTemperatureK),
      direct_path_cancellation: Boolean(radar.signal.directPathCancellation),
    },
    cfar: {
      enabled: Boolean(radar.cfar.enabled),
      guard_cells_range: Number(radar.cfar.guardRange),
      guard_cells_doppler: Number(radar.cfar.guardDoppler),
      training_cells_range: Number(radar.cfar.trainingRange),
      training_cells_doppler: Number(radar.cfar.trainingDoppler),
      false_alarm_probability: Number(radar.cfar.falseAlarmProbability),
    },
  };
}

export function radiomapSurfacePayload({state} = {}) {
  const surface = {
    type: "terrain_patch",
    size: state.radiomap.surface.size,
    height_offset: state.radiomap.surface.heightOffset,
    density_level: state.radiomap.surface.densityLevel,
  };
  if (state.radiomap.surface.cellSize != null) {
    if (!Number.isFinite(state.radiomap.surface.cellSize)) {
      throw new Error("Radio map cell size must be a finite number or blank for Auto");
    }
    surface.cell_size = state.radiomap.surface.cellSize;
  }
  return surface;
}

export function radiomapJobPayload({state, inputs} = {}) {
  const txPosition = requireDevicePosition(
    state.radiomap.tx,
    "Place Radio Map Tx before running the radio map.",
  );
  return {
    tx: {position: txPosition, orientation: [0, 0, 0]},
    metric: "path_gain",
    surface: radiomapSurfacePayload({state}),
    solver: {
      ...commonSolverConfig({state, inputs}),
      samples_per_tx: state.radiomap.solver.samplesPerTx,
    },
  };
}

export function mobilityJobPayload({state, inputs, linkDomain = null} = {}) {
  const txPosition = requireDevicePosition(
    state.mobility.tx,
    "Place Mobility Tx before running mobility.",
  );
  return {
    tx: {position: txPosition, orientation: [0, 0, 0]},
    rx_trajectory: {
      points: state.mobility.trajectory.points,
      velocity_mps: state.mobility.trajectory.velocityMps,
      time_step_s: state.mobility.trajectory.timeStepS,
      max_steps: state.mobility.trajectory.maxSteps,
    },
    solver: linkDomain?.solverConfig?.() || linkSolverConfig({state, inputs}),
    channel: linkDomain?.channelConfig?.() || linkChannelConfig({state}),
  };
}

export function deepMimoReceiverAxisCount(size, spacing) {
  // Match backend receiver_grid_axis_count in deepmimo_payload.py:
  // inclusive floor + 1, with the same 1e-9 epsilon so float rounding
  // doesn't shave a sample off near integer step boundaries.
  const numericSize = Number(size);
  const numericSpacing = Number(spacing);
  if (!Number.isFinite(numericSize) || !Number.isFinite(numericSpacing) || numericSpacing <= 0) {
    return NaN;
  }
  if (numericSize < 0) {
    return 0;
  }
  return Math.floor((numericSize / numericSpacing) + 1e-9) + 1;
}

export function deepMimoReceiverEstimate(bounds, rxGrid) {
  if (!bounds) {
    return 0;
  }
  const spacing = Number(rxGrid.spacing);
  if (!Number.isFinite(spacing) || spacing <= 0) {
    return NaN;
  }
  const nx = deepMimoReceiverAxisCount(bounds.size[0], spacing);
  const ny = deepMimoReceiverAxisCount(bounds.size[1], spacing);
  return Math.max(0, nx) * Math.max(0, ny);
}

export function deepMimoPayload({state, inputs, bounds, receiverEstimate, formatCount = String, linkDomain = null} = {}) {
  const txPosition = requireDevicePosition(
    state.deepmimo.tx,
    "Place DeepMIMO Tx before exporting data.",
  );
  if (!bounds) {
    throw new Error("Select a rectangular DeepMIMO ROI with two terrain clicks first");
  }
  if (!Number.isFinite(receiverEstimate) || receiverEstimate < 1) {
    throw new Error("DeepMIMO receiver grid is empty; check ROI and grid spacing");
  }
  if (receiverEstimate > Number(state.deepmimo.rxGrid.maxReceivers)) {
    throw new Error(
      `DeepMIMO ROI creates ${formatCount(receiverEstimate)} receiver candidates; increase spacing or Max Rx`,
    );
  }
  const propagation = linkDomain?.propagationConfig?.() || {
    diffraction: state.link.advanced.diffraction,
    edge_diffraction: state.link.advanced.edgeDiffraction,
    diffraction_lit_region: state.link.advanced.diffractionLitRegion,
  };
  return {
    tx: {position: txPosition, orientation: [0, 0, 0]},
    roi: bounds,
    rx_grid: {
      spacing: state.deepmimo.rxGrid.spacing,
      height: state.deepmimo.rxGrid.height,
      max_receivers: state.deepmimo.rxGrid.maxReceivers,
      chunk_size: state.deepmimo.rxGrid.chunkSize,
      filter_buildings: state.deepmimo.rxGrid.filterBuildings,
    },
    solver: {
      ...commonSolverConfig({state, inputs, includeTxArray: false}),
      samples_per_src: state.deepmimo.solver.samplesPerSrc,
      max_num_paths_per_src: state.deepmimo.solver.maxNumPathsPerSrc,
      synthetic_array: true,
      ...propagation,
    },
    export: {
      scenario_name: state.deepmimo.export.scenarioName,
    },
  };
}
