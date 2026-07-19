import {deepMimoFeature} from "/js/features/deepmimo/index.js";
import {linkFeature} from "/js/features/link/index.js";
import {mobilityFeature} from "/js/features/mobility/index.js";
import {radiomapFeature} from "/js/features/radiomap/index.js";

export const FEATURE_CATALOG = Object.freeze([
  linkFeature,
  mobilityFeature,
  radiomapFeature,
  deepMimoFeature,
]);
