import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const CORE_STYLE_ORDER = [
  "tokens.css",
  "base.css",
  "components.css",
  "shell.css",
  "entry-map.css",
  "results.css",
  "radar.css",
];
const EXCLUDED_PRODUCTION_NAMES = [
  "ui-catalog",
  "radar-demo",
  "test-results",
  "playwright-report",
];
const PRODUCTION_BASE = "/workbench/";
const REQUIRED_REACT_ENTRIES = [
  "workbench/src/features/results/result-dock-bridge.tsx",
  "workbench/src/features/deepmimo/deepmimo-dataset-bridge.tsx",
];

const workbenchRoot = fileURLToPath(new URL("..", import.meta.url));
const outputRoot = resolve(workbenchRoot, "../backend/static/workbench");
const indexPath = resolve(outputRoot, "index.html");
const manifestPath = resolve(outputRoot, ".vite/manifest.json");

function fail(message) {
  throw new Error(`Invalid production workbench: ${message}`);
}

function walk(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolutePath = resolve(directory, entry.name);
    return entry.isDirectory() ? walk(absolutePath) : [absolutePath];
  });
}

if (!existsSync(indexPath)) fail("index.html is missing");
if (!existsSync(manifestPath)) fail(".vite/manifest.json is missing");

const index = readFileSync(indexPath, "utf8");
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const files = walk(outputRoot);
const appEntry = manifest["js/app.js"];
const manifestSources = Object.keys(manifest);

if (!index.includes('<script type="importmap">'))
  fail("compatibility import map is missing");
if (!index.includes(`${PRODUCTION_BASE}assets/`))
  fail("index.html does not reference hashed assets");
if (!appEntry || typeof appEntry.file !== "string")
  fail("js/app.js manifest entry is missing");
const appScript = `<script type="module" crossorigin src="${PRODUCTION_BASE}${appEntry.file}"></script>`;
if (index.split(appScript).length !== 2)
  fail("index.html must load exactly one hashed app entry");
if ((index.match(/<script type="module"/g) ?? []).length !== 1)
  fail("index.html contains extra module entry scripts");
if (files.some((path) => path.endsWith(".map")))
  fail("source maps must not be published");
if (
  files.some((path) =>
    EXCLUDED_PRODUCTION_NAMES.some((name) => path.includes(name)),
  )
) {
  fail("development-only files entered the production output");
}

for (const requiredSource of REQUIRED_REACT_ENTRIES) {
  if (!manifestSources.some((source) => source.endsWith(requiredSource)))
    fail(`production React entry is missing: ${requiredSource}`);
}

for (const [source, entry] of Object.entries(manifest)) {
  if (
    source.includes("ui-catalog") ||
    source.includes("workbench/src/catalog/") ||
    source.includes("workbench/src/test/")
  ) {
    fail(`development-only source entered the production manifest: ${source}`);
  }
  if (!entry || typeof entry !== "object" || typeof entry.file !== "string")
    fail(`invalid manifest entry ${source}`);
  const outputPath = resolve(outputRoot, entry.file);
  if (!existsSync(outputPath) || !statSync(outputPath).isFile())
    fail(`missing manifest file ${entry.file}`);
  if (!/[-][A-Za-z0-9_-]{8,}\.[^.]+$/.test(entry.file))
    fail(`unhashed manifest file ${entry.file}`);
}

let cursor = -1;
for (const stylesheet of CORE_STYLE_ORDER) {
  const next = index.indexOf(stylesheet.replace(".css", "-"), cursor + 1);
  if (next < 0) fail(`stylesheet output for ${stylesheet} is missing`);
  if (next < cursor) fail("core stylesheet order changed");
  cursor = next;
}

console.log(
  `Verified production workbench: ${Object.keys(manifest).length} manifest entries, ${files.length} files`,
);
