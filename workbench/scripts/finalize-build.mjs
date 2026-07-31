import { createHash } from "node:crypto";
import {
  existsSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const workbenchRoot = fileURLToPath(new URL("..", import.meta.url));
const outputRoot = resolve(workbenchRoot, "../backend/static/workbench");
const releaseVersion = process.env.OAT_RELEASE_VERSION ?? "development";
const gitCommit = process.env.OAT_GIT_COMMIT ?? "development";
const releasePattern = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;
const commitPattern = /^[0-9a-f]{40}$/;

function fail(message) {
  throw new Error(`Cannot finalize production workbench: ${message}`);
}

function toPosix(value) {
  return value.split(sep).join("/");
}

function walk(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    return entry.isDirectory() ? walk(path) : [path];
  });
}

function sha256(data) {
  return createHash("sha256").update(data).digest("hex");
}

const development =
  releaseVersion === "development" && gitCommit === "development";
if (!development && !releasePattern.test(releaseVersion)) {
  fail(`invalid release version ${JSON.stringify(releaseVersion)}`);
}
if (!development && !commitPattern.test(gitCommit)) {
  fail("OAT_GIT_COMMIT must be the full lowercase 40-character Git SHA");
}
if ((releaseVersion === "development") !== (gitCommit === "development")) {
  fail(
    "release version and Git commit must either both be development or both be explicit",
  );
}
if (!existsSync(outputRoot)) fail("Vite output directory is missing");

const buildId = development
  ? "development"
  : `${releaseVersion}+${gitCommit.slice(0, 12)}`;
const buildInfo = {
  schemaVersion: 1,
  releaseVersion,
  gitCommit,
  buildId,
};
writeFileSync(
  resolve(outputRoot, "build-info.json"),
  `${JSON.stringify(buildInfo, null, 2)}\n`,
  "utf8",
);

const integrityPath = resolve(outputRoot, "integrity.json");
const files = walk(outputRoot)
  .filter((path) => path !== integrityPath && statSync(path).isFile())
  .map((path) => {
    const data = readFileSync(path);
    return {
      path: toPosix(relative(outputRoot, path)),
      bytes: data.byteLength,
      sha256: sha256(data),
    };
  })
  .sort((left, right) => left.path.localeCompare(right.path));
const integrity = { schemaVersion: 1, buildId, files };
writeFileSync(integrityPath, `${JSON.stringify(integrity, null, 2)}\n`, "utf8");

console.log(
  `Finalized production workbench ${buildId} with ${files.length} integrity entries.`,
);
