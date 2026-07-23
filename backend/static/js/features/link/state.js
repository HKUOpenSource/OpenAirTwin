export function createLinkState() {
  return {
    generation: 0,
    tx: null,
    txVisual: null,
    rx: null,
    rxVisual: null,
    surfaceClearanceM: 1.5,
    result: null,
    selectedPath: -1,
    advanced: {
      bandwidthMhz: 15.36,
      samplesPerSrc: 30000,
      maxNumPathsPerSrc: 1000000,
      syntheticArray: false,
      diffraction: false,
      edgeDiffraction: false,
      diffractionLitRegion: false,
      computeTaps: false,
      tapLMin: 0,
      tapLMax: 100,
      tapFftSize: 512,
      tapSubcarrierSpacingHz: 30000,
    },
  };
}
