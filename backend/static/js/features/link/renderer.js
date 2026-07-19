export function createLinkRenderer({viewerRef}) {
  const viewer = () => viewerRef.current;
  return {
    renderLinkPaths(paths, selectedIndex = -1) {
      return viewer().renderPaths(paths, selectedIndex);
    },
    clearLinkPaths() {
      viewer().clearPaths();
    },
  };
}
