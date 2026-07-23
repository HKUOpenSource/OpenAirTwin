import {defineConfig} from "@playwright/test";

const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
  ?? (process.platform === "darwin" ? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" : undefined);
const pythonCommand = process.env.OAT_TEST_PYTHON ?? (process.platform === "win32" ? "python" : "python3");
const serverPort = process.env.OAT_PORT ?? "8090";
const baseURL = `http://127.0.0.1:${serverPort}`;

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
  webServer: {
    command: `${pythonCommand} -m backend.server`,
    cwd: "../..",
    url: `${baseURL}/api/health`,
    timeout: 60_000,
    reuseExistingServer: true,
  },
});
