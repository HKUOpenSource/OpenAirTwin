export function createMobilityState() {
  return {
    generation: 0,
    tx: null,
    txVisual: null,
    rx: null,
    rxVisual: null,
    surfaceClearanceM: 1.5,
    trajectory: {points: [], velocityMps: 1.5, timeStepS: 1.0, maxSteps: 1000},
    jobId: null,
    result: null,
    status: "Idle",
    selectedWaypointIndex: -1,
    selectedStep: 0,
    selectedPath: -1,
    metric: "received_power_db",
    playing: false,
    playbackSpeed: 1.0,
    playbackTimer: null,
    tapsDefaulted: false,
  };
}
