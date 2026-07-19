export function createRadiomapRenderer({viewerRef}) {
  const viewer = () => viewerRef.current;
  return {
    renderRadiomapMesh(result, colorRange) {
      return viewer().renderRadiomap(result, colorRange);
    },
    clearRadiomapMesh() {
      viewer().clearRadiomap();
    },
  };
}
