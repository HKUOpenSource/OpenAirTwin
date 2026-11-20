import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repositoryRoot = path.resolve(root, "..");
const read = (relativePath) => readFile(path.join(root, relativePath), "utf8");
const expectedModes = ["link", "mobility", "radiomap", "deepmimo", "radar"];

assert.ok(
  !existsSync(path.join(root, "src/components/QuickStartAndCitation.tsx")),
  "QuickStartAndCitation.tsx must remain removed.",
);

const [main, app, siteData, sandbox, scene3d, capabilities, quickStart, css, html] =
  await Promise.all([
    read("src/main.tsx"),
    read("src/App.tsx"),
    read("src/data/siteData.ts"),
    read("src/components/PhysicsSandbox.tsx"),
    read("src/components/UrbanScene3D.tsx"),
    read("src/components/CapabilitiesGrid.tsx"),
    read("src/components/QuickStartSection.tsx"),
    read("src/styles.css"),
    read("index.html"),
  ]);

async function filesBelow(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const absolutePath = path.join(directory, entry.name);
      return entry.isDirectory() ? filesBelow(absolutePath) : [absolutePath];
    }),
  );
  return nested.flat();
}

// 1. Astryx Design System & CSS Cascade Layers
assert.match(main, /@astryxdesign\/core\/theme/);
assert.match(main, /@astryxdesign\/theme-neutral\/built/);
assert.match(main, /<Theme\s+theme=\{neutralTheme\}\s+mode="light"/);
assert.match(
  css,
  /^@layer\s+reset,\s*astryx-base,\s*astryx-theme,\s*site-theme,\s*site-layout;/,
  "Stylesheet must declare the Astryx CSS Cascade Layer stack first.",
);
assert.match(css, /@import\s+"@astryxdesign\/core\/reset\.css";/);
assert.match(css, /@import\s+"@astryxdesign\/core\/astryx\.css";/);
assert.match(css, /@import\s+"@astryxdesign\/theme-neutral\/theme\.css";/);
assert.match(css, /@media\s*\(max-width:\s*960px\)/);
assert.match(css, /@media\s*\(max-width:\s*640px\)/);
assert.match(css, /@media\s*\(prefers-reduced-motion:\s*reduce\)/);

// 2. Zero static UI screenshots, feature PNGs, GIFs, or WebM/MP4 videos
assert.ok(
  !existsSync(path.join(root, "public/media/tutorial")),
  "Legacy static tutorial screenshots directory must remain removed.",
);
assert.doesNotMatch(app, /<video\b|<track\b|\.mp4\b|\.webm\b|\.gif\b/i);
assert.doesNotMatch(sandbox, /<video\b|<track\b|\.mp4\b|\.webm\b|\.gif\b/i);
assert.doesNotMatch(scene3d, /<video\b|<track\b|\.mp4\b|\.webm\b|\.gif\b/i);
assert.doesNotMatch(siteData, /\.mp4\b|\.webm\b|\.gif\b|feature-[a-z-]+\.png/i);

const mediaFiles = await filesBelow(path.join(root, "public/media"));
let totalMediaBytes = 0;
for (const file of mediaFiles) {
  assert.doesNotMatch(
    file,
    /\.(gif|mp4|webm|vtt)$/i,
    `Unexpected heavy animation/video asset in website/public/media: ${file}`,
  );
  assert.doesNotMatch(
    path.basename(file),
    /^feature-/,
    `Legacy feature preview image must remain removed: ${file}`,
  );
  totalMediaBytes += (await stat(file)).size;
}
assert.ok(
  totalMediaBytes < 1_500_000,
  `Expected website/public/media total size < 1.5 MB, found ${totalMediaBytes} bytes.`,
);

// 3. Astryx centered-hero & 3D Interactive Lab contracts (no Map tab, no Citation, concise platform copy)
const expectedSectionOrder = ["home", "why", "workflows", "get-started"];
let lastIndex = -1;
for (const sectionId of expectedSectionOrder) {
  const pos = app.indexOf(`id="${sectionId}"`);
  assert.ok(pos > lastIndex, `Section #${sectionId} is missing or out of order.`);
  lastIndex = pos;
}
assert.match(app, /id="lab"/);
assert.match(app, /Real-world 3D cities for wireless research\./);
assert.match(siteData, /title:\s*"Unified Platform"/);
assert.doesNotMatch(siteData, /Unified Comm & Radar/);

for (const sourceText of [app, quickStart, siteData]) {
  assert.doesNotMatch(
    sourceText,
    /id="citation"|BibTeX Citation|CITATION_APA|CITATION_BIBTEX/,
    "Citation section must not appear on the homepage.",
  );
}

for (const sourceText of [app, siteData, capabilities, quickStart, scene3d]) {
  assert.doesNotMatch(
    sourceText,
    /\/api\/|InProcessJobManager|RouteRegistry|backend\/scene\//,
    "Landing page copy must not expose internal backend routes, class names, or module paths.",
  );
}
assert.doesNotMatch(sandbox, /\/api\//, "Interactive sandbox must not display raw REST endpoints.");

for (const mode of expectedModes) {
  assert.match(siteData, new RegExp(`id:\\s*"${mode}"`));
}
assert.doesNotMatch(
  siteData,
  /export const LAB_MODES[\s\S]*?id:\s*"map"/,
  "Map mode must not appear inside LAB_MODES.",
);
assert.match(scene3d, /from\s+"three"/);
assert.match(scene3d, /OrbitControls/);
assert.match(sandbox, /<UrbanScene3D/);
assert.match(sandbox, /role="tablist"/);
assert.match(sandbox, /role="tabpanel"/);
assert.match(sandbox, /panelId="lab-panel"/);
assert.match(siteData, /getModeFromUrl/);
assert.match(app, /window\.history\.pushState/);

assert.match(siteData, /ARCHITECTURE_HREF\s*=\s*"\.\/architecture\/"/);
assert.match(siteData, /\.oat-env\.ps1/);
assert.match(siteData, /--with-sample-scene/);
assert.match(quickStart, /Windows PowerShell/);

// 4. Repository links & English-only release hygiene
assert.match(app, /blob\/master\/LICENSE/);
assert.doesNotMatch(app, /blob\/main\//, "Public links must use the master branch.");
assert.doesNotMatch(app, /\/discussions/, "Do not link to GitHub Discussions.");
assert.doesNotMatch(quickStart, /blob\/main\//, "Public links must use the master branch.");

// 5. SEO, Social Metadata & Typography
for (const token of [
  'lang="en"',
  'rel="canonical"',
  'property="og:title"',
  'name="twitter:card"',
  'name="theme-color"',
  "Figtree",
]) {
  assert.ok(html.includes(token), `Missing token in index.html: ${token}`);
}

// 6. Public documentation files copied/referenced by site
for (const documentPath of [
  "docs/openairtwin-architecture.html",
  "docs/development.md",
  "docs/data-licenses.md",
  "docs/README.md",
  "docs/release-checklist.md",
  "CHANGELOG.md",
  "CITATION.cff",
]) {
  assert.ok(
    (await stat(path.join(repositoryRoot, documentPath))).isFile(),
    `Missing public documentation: ${documentPath}`,
  );
}

console.log(
  `Website contracts passed: Astryx centered-hero + Three.js 3D Lab (5 modes), zero Citation bloat (${Math.round(totalMediaBytes / 1024)} KB media).`,
);
