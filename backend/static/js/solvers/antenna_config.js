export const DEEPMIMO_FIXED_ANTENNA_ARRAY = Object.freeze({
  numRows: 1,
  numCols: 1,
  verticalSpacing: 0.5,
  horizontalSpacing: 0.5,
  pattern: "iso",
  polarization: "V",
});

export function normalizeAntennaArrayConfig(config = {}) {
  return {
    numRows: Number(config.num_rows ?? config.numRows ?? 1),
    numCols: Number(config.num_cols ?? config.numCols ?? 1),
    verticalSpacing: Number(config.vertical_spacing ?? config.verticalSpacing ?? 0.5),
    horizontalSpacing: Number(config.horizontal_spacing ?? config.horizontalSpacing ?? 0.5),
    pattern: String(config.pattern ?? "iso"),
    polarization: String(config.polarization ?? "V"),
  };
}

export function antennaArrayPayload(arrayConfig) {
  return {
    num_rows: Number(arrayConfig.numRows),
    num_cols: Number(arrayConfig.numCols),
    vertical_spacing: Number(arrayConfig.verticalSpacing),
    horizontal_spacing: Number(arrayConfig.horizontalSpacing),
    pattern: String(arrayConfig.pattern),
    polarization: String(arrayConfig.polarization),
  };
}
