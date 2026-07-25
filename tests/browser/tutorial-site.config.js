import { defineConfig } from "@playwright/test";

const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
  ?? (process.platform === "darwin" ? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" : undefined);
const port = process.env.OAT_TUTORIAL_SITE_PORT ?? "4174";
const baseURL = `http://127.0.0.1:${port}/OpenAirTwin/`;

export default defineConfig({
  testDir: ".",
  testMatch: "tutorial-site.e2e.js",
  timeout: 30_000,
  expect: { timeout: 5_000 },
  fullyParallel: false,
  use: {
    baseURL,
    viewport: { width: 1440, height: 900 },
    colorScheme: "light",
    locale: "en-US",
    timezoneId: "UTC",
    launchOptions: {
      ...(executablePath ? { executablePath } : {}),
      args: [
        "--use-angle=swiftshader",
        "--use-gl=angle",
        "--disable-gpu-driver-bug-workarounds",
      ],
    },
  },
  webServer: {
    command: `npm run dev -- --host 127.0.0.1 --port ${port}`,
    cwd: "../../website",
    url: baseURL,
    timeout: 60_000,
    reuseExistingServer: true,
  },
});
