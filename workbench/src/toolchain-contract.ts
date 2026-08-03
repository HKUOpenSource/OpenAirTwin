export const PRODUCTION_BASE = "/workbench/" as const;

export const CORE_STYLE_ORDER = [
  "tokens.css",
  "base.css",
  "components.css",
  "shell.css",
  "entry-map.css",
  "results.css",
  "radar.css",
] as const;

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
