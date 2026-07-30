import {defineConfig} from "@playwright/test";

const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
  ?? (process.platform === "darwin" ? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" : undefined);
const pythonCommand = process.env.OAT_TEST_PYTHON ?? (process.platform === "win32" ? "python" : "python3");
const serverPort = process.env.OAT_PORT ?? "8090";
const baseURL = `http://127.0.0.1:${serverPort}`;
const catalogPort = process.env.OAT_UI_CATALOG_PORT ?? "8091";
const catalogURL = `http://127.0.0.1:${catalogPort}`;

export default defineConfig({
  testDir: ".",
  testMatch: "*.spec.js",
  timeout: 30_000,
  expect: {timeout: 5_000},
  fullyParallel: false,
  use: {
    baseURL,
    viewport: {width: 1440, height: 900},
    colorScheme: "light",
    locale: "en-US",
    timezoneId: "UTC",
    launchOptions: {
      ...(executablePath ? {executablePath} : {}),
      args: [
        "--use-angle=swiftshader",
        "--use-gl=angle",
        "--disable-gpu-driver-bug-workarounds",
      ],
    },
  },
  webServer: [
    {
      command: `${pythonCommand} tools/run_production_server.py`,
      cwd: "../..",
      url: `${baseURL}/api/health`,
      timeout: 60_000,
      reuseExistingServer: process.env.OAT_REUSE_TEST_SERVER === "1",
    },
    {
      command: `${pythonCommand} tools/serve_ui_catalog.py --port ${catalogPort}`,
      cwd: "../..",
      url: `${catalogURL}/ui-catalog/`,
      timeout: 30_000,
      reuseExistingServer: process.env.OAT_REUSE_TEST_SERVER === "1",
    },
  ],
});
