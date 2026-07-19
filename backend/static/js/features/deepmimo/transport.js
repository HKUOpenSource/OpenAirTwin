import {cancelDeepMimoJob, createDeepMimoJob, deepMimoDownloadUrl, getDeepMimoJob} from "/js/api.js";

export function createDeepMimoTransport() {
  return {cancelDeepMimoJob, createDeepMimoJob, deepMimoDownloadUrl, getDeepMimoJob};
}
