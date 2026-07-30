import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const workbenchRoot = fileURLToPath(new URL("..", import.meta.url));
const projectRoot = resolve(workbenchRoot, "..");
const apiPort = process.env.OAT_API_PORT ?? "8090";
const uiPort = process.env.OAT_UI_PORT ?? "5173";
const pythonCommand =
  process.env.OAT_PYTHON ??
  (process.platform === "win32" ? "python" : "python3");
const viteEntry = resolve(workbenchRoot, "node_modules/vite/bin/vite.js");

const children = [
  spawn(pythonCommand, ["-m", "backend.server"], {
    cwd: projectRoot,
    env: { ...process.env, OAT_PORT: apiPort },
    stdio: "inherit",
  }),
  spawn(process.execPath, [viteEntry, "--port", uiPort], {
    cwd: workbenchRoot,
    env: { ...process.env, OAT_API_ORIGIN: `http://127.0.0.1:${apiPort}` },
    stdio: "inherit",
  }),
];

let stopping = false;
function stop(exitCode = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) {
    if (!child.killed) child.kill("SIGTERM");
  }
  process.exitCode = exitCode;
}

for (const child of children) {
  child.on("error", (error) => {
    console.error(error);
    stop(1);
  });
  child.on("exit", (code, signal) => {
    if (!stopping && (code !== 0 || signal)) stop(code ?? 1);
  });
}

process.on("SIGINT", () => stop(0));
process.on("SIGTERM", () => stop(0));
