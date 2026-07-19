import {createRadiomapJob, getRadiomapJob, getRadiomapResult} from "/js/api.js";

export function createRadiomapTransport() {
  return {createRadiomapJob, getRadiomapJob, getRadiomapResult};
}
