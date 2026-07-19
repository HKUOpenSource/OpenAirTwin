export function createRadiomapState() {
  return {
    generation: 0,
    tx: [72.0, 37.0, 40.0],
    txVisual: [72.0, 37.0, 40.0],
    surfaceClearanceM: 1.5,
    surface: {
      size: [160.0, 160.0],
      heightOffset: 1.5,
      densityLevel: 2,
      cellSize: null,
    },
    solver: {samplesPerTx: 1000000},
    display: {colorMinDb: -140, colorMaxDb: -80, colormap: "jet"},
    jobId: null,
    result: null,
    status: "Idle",
  };
}
