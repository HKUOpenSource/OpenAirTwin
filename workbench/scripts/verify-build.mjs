import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

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
const REQUIRED_REACT_OUTPUT = /(?:^|\/)react-runtime-[A-Za-z0-9_-]{8,}\.js$/;
const FORBIDDEN_PRODUCTION_ROOT_IDS = [
  "result-dock-content",
  "deepmimo-dataset-tray",
  "control-form-content",
  "device-dock-content",
];
const FORBIDDEN_UI_MARKERS = [
  "CompatibilityAppShellTree",
  "CompatibilityControlTree",
  "createAppShellBridge",
  "createControlSurfaceBridge",
  "createDeepMimoDatasetBridge",
  "createResultDockBridge",
  "legacyBare",
  "miniBtn",
  "miniSelect",
  "oat-button--legacy-native-font",
  " primary appDialogPrimary",
  " primary entryFooterBtn",
];
const FORBIDDEN_UI_SOURCE_NAMES = [
  "app-shell/CompatibilityAppShellTree.tsx",
  "features/controls/CompatibilityControlTree.tsx",
  "app-shell/app-shell-bridge.tsx",
  "features/controls/control-surface-bridge.tsx",
  "features/deepmimo/deepmimo-dataset-bridge.tsx",
  "features/results/result-dock-bridge.tsx",
];
const BUDGETS = {
  initialGzip: 352 * 1024,
  allJavaScriptGzip: 384 * 1024,
  allCssGzip: 24 * 1024,
  reactRuntimeGzip: 68 * 1024,
  singleFeatureGzip: 30 * 1024,
  htmlGzip: 3 * 1024,
  maxChunkRaw: 576 * 1024,
  maxChunkGzip: 145 * 1024,
};
const FEATURE_IDS = ["link", "mobility", "radiomap", "deepmimo", "radar"];

const workbenchRoot = fileURLToPath(new URL("..", import.meta.url));
const outputRoot = resolve(workbenchRoot, "../backend/static/workbench");
const indexPath = resolve(outputRoot, "index.html");
const manifestPath = resolve(outputRoot, ".vite/manifest.json");
const buildInfoPath = resolve(outputRoot, "build-info.json");
const integrityPath = resolve(outputRoot, "integrity.json");

function fail(message) {
  throw new Error(`Invalid production workbench: ${message}`);
}

function walk(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolutePath = resolve(directory, entry.name);
    return entry.isDirectory() ? walk(absolutePath) : [absolutePath];
  });
}

function toPosix(value) {
  return value.split(sep).join("/");
}

function sha256(data) {
  return createHash("sha256").update(data).digest("hex");
}

function gzipSize(path) {
  return gzipSync(readFileSync(path), { level: 9 }).byteLength;
}

function sumGzip(paths) {
  return [...paths].reduce((total, path) => total + gzipSize(path), 0);
}

function checkBudget(label, actual, budget) {
  if (actual > budget)
    fail(`${label} is ${actual} bytes; budget is ${budget} bytes`);
}

function manifestOutputFiles(entry) {
  return [entry.file, ...(entry.css ?? []), ...(entry.assets ?? [])].filter(
    (value) => typeof value === "string",
  );
}

function collectInitialOutputs(source, manifest, seenSources, outputs) {
  if (seenSources.has(source)) return;
  seenSources.add(source);
  const entry = manifest[source];
  if (!entry || typeof entry !== "object") return;
  for (const file of manifestOutputFiles(entry))
    outputs.add(resolve(outputRoot, file));
  for (const dependency of entry.imports ?? []) {
    if (typeof dependency === "string") {
      collectInitialOutputs(dependency, manifest, seenSources, outputs);
    }
  }
}

if (!existsSync(indexPath)) fail("index.html is missing");
if (!existsSync(manifestPath)) fail(".vite/manifest.json is missing");
if (!existsSync(buildInfoPath)) fail("build-info.json is missing");
if (!existsSync(integrityPath)) fail("integrity.json is missing");

const index = readFileSync(indexPath, "utf8");
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const buildInfo = JSON.parse(readFileSync(buildInfoPath, "utf8"));
const integrity = JSON.parse(readFileSync(integrityPath, "utf8"));
const files = walk(outputRoot);
const appEntry = manifest["js/app.js"];
const manifestSources = Object.keys(manifest);

if (
  buildInfo.schemaVersion !== 1 ||
  typeof buildInfo.releaseVersion !== "string" ||
  typeof buildInfo.gitCommit !== "string" ||
  typeof buildInfo.buildId !== "string"
) {
  fail("build-info.json is invalid");
}
const developmentBuild =
  buildInfo.releaseVersion === "development" &&
  buildInfo.gitCommit === "development" &&
  buildInfo.buildId === "development";
if (!developmentBuild) {
  if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(buildInfo.releaseVersion))
    fail("release version is invalid");
  if (!/^[0-9a-f]{40}$/.test(buildInfo.gitCommit))
    fail("Git commit must be a full lowercase SHA");
  if (
    buildInfo.buildId !==
    `${buildInfo.releaseVersion}+${buildInfo.gitCommit.slice(0, 12)}`
  )
    fail("Build ID does not match release metadata");
}
if (
  integrity.schemaVersion !== 1 ||
  integrity.buildId !== buildInfo.buildId ||
  !Array.isArray(integrity.files)
) {
  fail("integrity.json metadata is invalid");
}
const expectedIntegrityPaths = integrity.files.map((entry) => entry.path);
if (
  expectedIntegrityPaths.some((path, index) =>
    index > 0
      ? path.localeCompare(expectedIntegrityPaths[index - 1]) < 0
      : false,
  )
) {
  fail("integrity entries are not sorted by path");
}
const actualIntegrityPaths = files
  .filter((path) => path !== integrityPath)
  .map((path) => toPosix(relative(outputRoot, path)))
  .sort();
if (
  JSON.stringify([...expectedIntegrityPaths].sort()) !==
  JSON.stringify(actualIntegrityPaths)
)
  fail("integrity file set does not match production output");
for (const entry of integrity.files) {
  if (
    !entry ||
    typeof entry.path !== "string" ||
    !Number.isInteger(entry.bytes) ||
    entry.bytes < 0 ||
    !/^[0-9a-f]{64}$/.test(entry.sha256)
  ) {
    fail("integrity entry is invalid");
  }
  const path = resolve(outputRoot, entry.path);
  const data = readFileSync(path);
  if (data.byteLength !== entry.bytes || sha256(data) !== entry.sha256)
    fail(`integrity mismatch for ${entry.path}`);
}

if (!index.includes('<script type="importmap">'))
  fail("compatibility import map is missing");
if (index.includes("data-oat-react-owner") || index.includes('id="view"'))
  fail("legacy workbench markup remains in the production HTML entry");
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

if (!files.some((path) => REQUIRED_REACT_OUTPUT.test(toPosix(path))))
  fail("production React runtime chunk is missing");

const productionJavaScript = files
  .filter((path) => path.endsWith(".js"))
  .map((path) => readFileSync(path, "utf8"))
  .join("\n");
if (!/id:[`'"]app-shell[`'"]/.test(productionJavaScript))
  fail("single AppShell root is missing from production JavaScript");
for (const rootId of FORBIDDEN_PRODUCTION_ROOT_IDS) {
  if (productionJavaScript.includes(rootId))
    fail(`legacy production React root remains: ${rootId}`);
}
for (const marker of FORBIDDEN_UI_MARKERS) {
  if (productionJavaScript.includes(marker))
    fail(`legacy UI marker remains: ${marker}`);
}
for (const sourceName of FORBIDDEN_UI_SOURCE_NAMES) {
  if (existsSync(resolve(workbenchRoot, "src", sourceName)))
    fail(`legacy UI source remains: ${sourceName}`);
  if (manifestSources.some((source) => source.endsWith(sourceName)))
    fail(`legacy UI source entered the production manifest: ${sourceName}`);
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

const javascriptFiles = files.filter((path) => path.endsWith(".js"));
const cssFiles = files.filter((path) => path.endsWith(".css"));
const initialOutputs = new Set();
collectInitialOutputs("js/app.js", manifest, new Set(), initialOutputs);
const reactRuntimeOutputs = new Set();
for (const path of javascriptFiles) {
  if (REQUIRED_REACT_OUTPUT.test(toPosix(path))) reactRuntimeOutputs.add(path);
}
const sizes = {
  initialGzip: sumGzip(initialOutputs),
  allJavaScriptGzip: sumGzip(javascriptFiles),
  allCssGzip: sumGzip(cssFiles),
  reactRuntimeGzip: sumGzip(reactRuntimeOutputs),
  htmlGzip: gzipSize(indexPath),
  maxChunkRaw: Math.max(...javascriptFiles.map((path) => statSync(path).size)),
  maxChunkGzip: Math.max(...javascriptFiles.map(gzipSize)),
};
for (const [name, actual] of Object.entries(sizes))
  checkBudget(name, actual, BUDGETS[name]);
const featureSizes = {};
for (const featureId of FEATURE_IDS) {
  const outputs = new Set(
    javascriptFiles.filter((path) =>
      toPosix(path).includes(`/feature-${featureId}-`),
    ),
  );
  if (outputs.size !== 1) fail(`${featureId} feature chunk is missing`);
  featureSizes[featureId] = sumGzip(outputs);
  checkBudget(
    `${featureId} feature gzip`,
    featureSizes[featureId],
    BUDGETS.singleFeatureGzip,
  );
}

console.log(
  `Verified production workbench ${buildInfo.buildId}: ${Object.keys(manifest).length} manifest entries, ${files.length} files`,
);
console.log(
  `Production budgets: ${JSON.stringify({ ...sizes, features: featureSizes })}`,
);
