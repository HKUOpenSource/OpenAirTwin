import {createMobilityJob, getMobilityJob, getMobilityResult} from "/js/api.js";

export function createMobilityTransport() {
  return {createMobilityJob, getMobilityJob, getMobilityResult};
}
