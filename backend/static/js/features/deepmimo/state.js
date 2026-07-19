export function createDeepMimoState() {
  return {
    generation: 0,
    tx: [72.0, 37.0, 40.0],
    txVisual: [72.0, 37.0, 40.0],
    surfaceClearanceM: 1.5,
    roi: {cornerA: null, cornerB: null, pickingStep: "a", visualZ: null},
    rxGrid: {
      spacing: 2.0,
      height: 1.5,
      maxReceivers: 30000,
      chunkSize: 1024,
      filterBuildings: true,
    },
    solver: {samplesPerSrc: 30000, maxNumPathsPerSrc: 1000000},
    export: {scenarioName: "hku_deepmimo_roi"},
    jobId: null,
    result: null,
    status: "Idle",
    progress: 0,
    message: "Idle",
    pendingDataset: null,
    datasets: [],
    datasetTrayOpen: false,
  };
}
