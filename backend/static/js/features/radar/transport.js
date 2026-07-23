import {
  cancelRadarJob,
  createRadarJob,
  getRadarAssetManifest,
  getRadarJob,
  getRadarResult,
} from "/js/api.js";

export function createRadarTransport() {
  return {
    cancelRadarJob,
    createRadarJob,
    getRadarAssetManifest,
    getRadarJob,
    getRadarResult,
  };
}
