import { readdirSync, readFileSync } from "node:fs";
import { relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { defineConfig, type Plugin } from "vite";

import { CORE_STYLE_ORDER, PRODUCTION_BASE } from "./src/toolchain-contract.ts";

const workbenchRoot = fileURLToPath(new URL(".", import.meta.url));
const projectRoot = resolve(workbenchRoot, "..");
const legacyRoot = resolve(projectRoot, "backend/static");
const legacyJavaScriptRoot = resolve(legacyRoot, "js");
const outputRoot = resolve(legacyRoot, "workbench");

function toPosixPath(value: string): string {
  return value.split(sep).join("/");
}

function collectJavaScriptFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolutePath = resolve(directory, entry.name);
    if (entry.isDirectory()) return collectJavaScriptFiles(absolutePath);
    if (
      !entry.isFile() ||
      !entry.name.endsWith(".js") ||
      entry.name === "radar-demo.js"
    )
      return [];
    return [absolutePath];
  });
}

const legacyJavaScriptFiles = collectJavaScriptFiles(legacyJavaScriptRoot);
const rollupInputs: Record<string, string> = {
  index: resolve(legacyRoot, "index.html"),
};
for (const stylesheet of CORE_STYLE_ORDER) {
  rollupInputs[`css/${stylesheet.replace(/\.css$/, "")}`] = resolve(
    legacyRoot,
    "css",
    stylesheet,
  );
}

function collectLegacySpecifiers(): Map<string, Set<string>> {
  const result = new Map<string, Set<string>>();
  const sources = [resolve(legacyRoot, "index.html"), ...legacyJavaScriptFiles];
  const pattern = /["'](\/js\/[^"']+?\.js(?:\?[^"']*)?)["']/g;

  for (const sourcePath of sources) {
    const source = readFileSync(sourcePath, "utf8");
    for (const match of source.matchAll(pattern)) {
      const specifier = match[1];
      if (!specifier) continue;
      const pathname = specifier.split("?", 1)[0];
      if (!pathname) continue;
      const aliases = result.get(pathname) ?? new Set<string>();
      aliases.add(pathname);
      aliases.add(specifier);
      result.set(pathname, aliases);
    }
  }

  for (const absolutePath of legacyJavaScriptFiles) {
    const pathname = `/${toPosixPath(relative(legacyRoot, absolutePath))}`;
    const aliases = result.get(pathname) ?? new Set<string>();
    aliases.add(pathname);
    result.set(pathname, aliases);
  }
  return result;
}

function stripLegacyModuleVersionQueries(source: string): string {
  return source.replace(/(["']\/js\/[^"'?]+\.js)\?[^"']+(["'])/g, "$1$2");
}

function normalizeLegacyModuleIdsPlugin(): Plugin {
  return {
    name: "openairtwin-normalize-legacy-module-ids",
    enforce: "pre",
    transformIndexHtml(html) {
      return stripLegacyModuleVersionQueries(html);
    },
    transform(code, id) {
      const sourcePath = id.split("?", 1)[0];
      if (
        !sourcePath ||
        !sourcePath.startsWith(`${legacyJavaScriptRoot}${sep}`) ||
        !sourcePath.endsWith(".js")
      ) {
        return null;
      }
      const normalized = stripLegacyModuleVersionQueries(code);
      return normalized === code ? null : { code: normalized, map: null };
    },
    resolveId(source) {
      if (!source.startsWith("/js/") || !source.includes("?")) return null;
      const sourcePath = source.slice(1).split("?", 1)[0];
      if (!sourcePath) return null;
      return resolve(legacyRoot, sourcePath);
    },
  };
}

function productionImportMapPlugin(): Plugin {
  const aliasesByPath = collectLegacySpecifiers();
  const appSourcePath = resolve(legacyJavaScriptRoot, "app.js");
  return {
    name: "openairtwin-production-import-map",
    enforce: "post",
    generateBundle(_options, bundle) {
      const imports: Record<string, string> = {};
      for (const output of Object.values(bundle)) {
        if (output.type !== "chunk" || !output.facadeModuleId) continue;
        const sourcePath = toPosixPath(
          relative(legacyRoot, output.facadeModuleId),
        );
        if (!sourcePath.startsWith("js/")) continue;
        const pathname = `/${sourcePath}`;
        for (const alias of aliasesByPath.get(pathname) ?? [pathname]) {
          imports[alias] = `${PRODUCTION_BASE}${output.fileName}`;
        }
      }

      const index = bundle["index.html"];
      if (
        !index ||
        index.type !== "asset" ||
        typeof index.source !== "string"
      ) {
        this.error("Vite did not emit the production index.html asset");
        return;
      }
      const appOutput = Object.values(bundle).find(
        (candidate) =>
          candidate.type === "chunk" &&
          candidate.facadeModuleId === appSourcePath,
      );
      if (!appOutput || appOutput.type !== "chunk") {
        this.error("Vite did not emit the production app.js entry");
        return;
      }
      const importMap = JSON.stringify({
        imports: Object.fromEntries(Object.entries(imports).sort()),
      }).replaceAll("<", "\\u003c");
      let indexSource = index.source;
      for (const stylesheet of CORE_STYLE_ORDER) {
        const output = Object.values(bundle).find(
          (candidate) =>
            candidate.type === "asset" &&
            candidate.fileName.startsWith(
              `assets/css/${stylesheet.replace(/\.css$/, "")}-`,
            ) &&
            candidate.fileName.endsWith(".css"),
        );
        if (!output) {
          this.error(`Vite did not emit the ${stylesheet} stylesheet entry`);
          return;
        }
        indexSource = indexSource.replace(
          new RegExp(`href="/css/${stylesheet.replace(".", "\\.")}\\?[^"]*"`),
          `href="${PRODUCTION_BASE}${output.fileName}"`,
        );
      }
      const importMapTag = `<script type="importmap">${importMap}</script>`;
      const appScriptTag = `<script type="module" crossorigin src="${PRODUCTION_BASE}${appOutput.fileName}"></script>`;
      indexSource = indexSource.replace(
        /\s*<script type="module"[^>]*><\/script>/g,
        "",
      );
      index.source = indexSource
        .replace("</head>", `  ${importMapTag}\n</head>`)
        .replace("</body>", `  ${appScriptTag}\n</body>`);
    },
  };
}

export default defineConfig({
  root: legacyRoot,
  base: PRODUCTION_BASE,
  publicDir: false,
  plugins: [normalizeLegacyModuleIdsPlugin(), productionImportMapPlugin()],
  resolve: {
    alias: [
      { find: "/js", replacement: resolve(legacyRoot, "js") },
      { find: "/css", replacement: resolve(legacyRoot, "css") },
      { find: "/lib", replacement: resolve(legacyRoot, "lib") },
    ],
  },
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true,
    fs: {
      strict: true,
      allow: [legacyRoot],
    },
    proxy: {
      "/api": {
        target: process.env.OAT_API_ORIGIN ?? "http://127.0.0.1:8090",
        changeOrigin: false,
      },
    },
  },
  build: {
    outDir: outputRoot,
    emptyOutDir: true,
    manifest: true,
    sourcemap: false,
    cssCodeSplit: true,
    cssMinify: false,
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      preserveEntrySignatures: "strict",
      input: rollupInputs,
      output: {
        preserveModules: true,
        preserveModulesRoot: legacyRoot,
        entryFileNames: "assets/[name]-[hash].js",
        chunkFileNames: "assets/chunks/[name]-[hash].js",
        assetFileNames: "assets/[name]-[hash][extname]",
      },
    },
  },
});
