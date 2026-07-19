import {antennaArrayPayload} from "/js/solvers/antenna_config.js?v=20260519-mode-isolation";

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
  if (preview) {
    solver.samples_per_src = Math.max(1, Math.floor(Number(state.livePreview.link.previewSamplesPerSrc)));
    solver.max_num_paths_per_src = Math.min(Number(solver.max_num_paths_per_src), 10000);
    channel.compute_taps = false;
  }
  return {
    tx: {position: state.link.tx, orientation: [0, 0, 0]},
    rx: {position: state.link.rx, orientation: [0, 0, 0]},
    solver,
    channel,
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
  return {
    tx: {position: state.radiomap.tx, orientation: [0, 0, 0]},
    metric: "path_gain",
    surface: radiomapSurfacePayload({state}),
    solver: {
      ...commonSolverConfig({state, inputs}),
      samples_per_tx: state.radiomap.solver.samplesPerTx,
    },
  };
}

export function mobilityJobPayload({state, inputs, linkDomain = null} = {}) {
  return {
    tx: {position: state.mobility.tx, orientation: [0, 0, 0]},
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
    tx: {position: state.deepmimo.tx, orientation: [0, 0, 0]},
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
