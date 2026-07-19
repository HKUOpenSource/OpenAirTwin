import assert from "node:assert/strict";
import { copyFile, mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const websiteRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const architectureSource = path.resolve(websiteRoot, "../docs/openairtwin-architecture.html");
const architectureDirectory = path.join(websiteRoot, "dist/architecture");
const architectureTarget = path.join(architectureDirectory, "index.html");

const source = await readFile(architectureSource, "utf8");
assert.match(source, /^<!doctype html>/i, "Architecture documentation must be a standalone HTML document.");

await mkdir(architectureDirectory, { recursive: true });
await copyFile(architectureSource, architectureTarget);

console.log(`Copied architecture documentation to ${path.relative(websiteRoot, architectureTarget)}.`);
