export function createMobilityRenderer({viewerRef}) {
  const viewer = () => viewerRef.current;
  return {
    renderMobilityPaths(paths, selectedIndex = -1) {
      return viewer().renderPaths(paths, selectedIndex);
    },
    renderMobilityTrajectory(points, samples, selectedIndex = -1) {
      return viewer().renderMobilityTrajectory(points, samples, selectedIndex);
    },
    clearMobilityLayers() {
      viewer().clearPaths();
      viewer().clearMobility();
    },
  };
}
