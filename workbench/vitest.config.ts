import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "/js": fileURLToPath(new URL("../backend/static/js", import.meta.url)),
      "/lib": fileURLToPath(new URL("../backend/static/lib", import.meta.url)),
    },
  },
  test: {
    environment: "jsdom",
    restoreMocks: true,
    setupFiles: ["./src/test/setup.ts"],
  },
});
