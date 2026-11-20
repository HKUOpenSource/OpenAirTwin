export const PRODUCTION_BASE = "/workbench/" as const;

export const LEGACY_PUBLIC_PREFIXES = [
  "/api/",
  "/assets/",
  "/lib/",
  "/js/",
  "/css/",
] as const;

export const EXCLUDED_PRODUCTION_NAMES = [
  "ui-catalog",
  "radar-demo",
  "test-results",
  "playwright-report",
] as const;
