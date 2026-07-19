export function createDeepMimoRenderer({viewerRef}) {
  const viewer = () => viewerRef.current;
  return {
    renderDeepMimoRegion(bounds, visualZ = 0) {
      return viewer().renderDeepMimoRoi(bounds, visualZ);
    },
    clearDeepMimoRegion() {
      viewer().clearDeepMimoRoi();
    },
  };
}
