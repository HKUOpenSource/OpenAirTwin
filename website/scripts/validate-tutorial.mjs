import assert from "node:assert/strict";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repositoryRoot = path.resolve(root, "..");
const read = (relativePath) => readFile(path.join(root, relativePath), "utf8");
const expectedModes = ["map", "link", "mobility", "radiomap", "deepmimo", "radar"];
const expectedScreenshots = [
  "map-search.png",
  "map-selected.png",
  "map-loading.png",
  "map-scene.png",
  "link.png",
  "mobility.png",
  "radiomap.png",
  "deepmimo.png",
  "radar.png",
];

const [workflow, app, data, css, html] = await Promise.all([
  read("src/WorkflowTutorial.tsx"),
  read("src/App.tsx"),
  read("src/tutorialData.ts"),
  read("src/styles.css"),
  read("index.html"),
]);
const tutorialDataSource = data.split("export type QuickStartStep")[0];

function pngDimensions(buffer) {
  assert.equal(buffer.toString("ascii", 1, 4), "PNG", "Tutorial assets must be PNG files.");
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

async function filesBelow(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const absolutePath = path.join(directory, entry.name);
    return entry.isDirectory() ? filesBelow(absolutePath) : [absolutePath];
  }));
  return nested.flat();
}

assert.doesNotMatch(workflow, /<video\b|<track\b|\.mp4\b|\.vtt\b/i);
assert.doesNotMatch(tutorialDataSource, /\bvideo\s*:|\.mp4\b|\.vtt\b/i);
assert.doesNotMatch(workflow, /new Image\s*\(/, "Only the active manual screenshot may be loaded.");
assert.doesNotMatch(workflow, /overview|focused controls/i, "The old Overview/Focus reader must be removed.");
assert.match(workflow, /version:\s*2/);
assert.match(workflow, /completedSteps/);
assert.match(workflow, /typeof legacy\.stepIndex === "number"/);
assert.match(workflow, /window\.localStorage/);
assert.match(workflow, /window\.history\[replace \? "replaceState" : "pushState"\]/);
assert.match(workflow, /role="tabpanel"/);
assert.match(workflow, /aria-controls="tutorial-panel"/);
assert.match(workflow, /data-tutorial-target/);
assert.doesNotMatch(workflow, /Focus control|Full view|Zoom (?:in|out)|tutorialStageToolbar/);
assert.doesNotMatch(
  workflow,
  /tutorialModeHeader|lessonEyebrow|tutorialNotes|tutorialStageFooter|What to check|Keep in mind/,
  "The compact tutorial must not render duplicated headings, notes, or a screenshot footer.",
);
assert.match(workflow, /className="tutorialPrompt"/);
assert.match(workflow, /activeStep\.secondaryTargets/);
assert.doesNotMatch(
  workflow,
  /tutorialTarget\.explored|explored \? "✓"/,
  "Explored screenshot targets must keep their original numbered appearance.",
);
assert.match(workflow, /Screenshot unavailable/);
assert.match(workflow, /Next step/);
const exploreTargetBody = workflow.match(/const exploreTarget = \(\) => \{([\s\S]*?)\n  \};/)?.[1] ?? "";
assert.doesNotMatch(
  exploreTargetBody,
  /select\(/,
  "Exploring a highlighted control must not advance the tutorial step.",
);

assert.ok(
  app.indexOf('id="features"') < app.indexOf('id="workflow-tutorial"'),
  "The feature overview must appear before the interactive tutorial.",
);
assert.ok(
  app.indexOf('id="workflow-tutorial"') < app.indexOf('id="quick-start"'),
  "The interactive tutorial must appear before installation.",
);
assert.match(app, /<h2>Tutorial<\/h2>/);
assert.match(app, /<section className="hero" id="home">/);
assert.match(app, /href="#features"[\s\S]*?Get Started/);
assert.ok(
  app.indexOf('<a href="#features">Features</a>') <
    app.indexOf('<a href="#workflow-tutorial">Tutorial</a>'),
  "The navigation must list Features before Tutorial.",
);
assert.match(app, /Watch tutorial/);
assert.doesNotMatch(app, /Learn by exploring|Explore 24 focused steps|Interactive Tutorial/);
assert.doesNotMatch(app, /Start interactive tutorial|Open tutorial|Six connected workflows|heroCompact/);
assert.match(app, /loading="lazy"/);
assert.match(app, /Windows PowerShell/);
assert.match(app, /#installation-details/);
assert.match(app, /blob\/master\/LICENSE/);
assert.doesNotMatch(app, /blob\/main\//, "Public repository links must use the default master branch.");
assert.doesNotMatch(app, /\/discussions/, "Do not link to GitHub Discussions while it is disabled.");
assert.match(app, /hkuopensource\.github\.io\/OpenAirTwin\/architecture\//);
assert.match(app, /hero_text_alpha_compact\.webm/);

assert.match(data, /\.oat-env\.ps1/);
assert.match(data, /--with-sample-scene/);
assert.equal((tutorialDataSource.match(/\n\s+kind:\s*"(?:action|observe)",/g) ?? []).length, 24);
for (const mode of expectedModes) {
  assert.match(tutorialDataSource, new RegExp(`id:\\s*"${mode}"`));
}
for (const radarStep of ["place-radar", "add-targets", "run-radar", "run-inspect-radar"]) {
  assert.match(tutorialDataSource, new RegExp(`id:\\s*"${radarStep}"`));
}
for (const radioMapStep of ["place-tx", "configure-patch", "run-radiomap", "inspect-radiomap-results"]) {
  assert.match(tutorialDataSource, new RegExp(`id:\\s*"${radioMapStep}"`));
}
assert.match(data, /secondaryTargets\?: TutorialTarget\[\]/);

const referencedScreenshots = [
  ...tutorialDataSource.matchAll(/image\(\s*"[^"]+",\s*"([^"]+\.png)"/g),
].map((match) => match[1]);
assert.deepEqual(
  [...referencedScreenshots].sort(),
  [...expectedScreenshots].sort(),
  "Tutorial data must reference exactly the nine approved manual screenshots.",
);
assert.equal(
  referencedScreenshots.filter((name) => name.startsWith("map-")).length,
  4,
  "Map Selection must use four interface states.",
);
for (const mode of expectedModes.filter((mode) => mode !== "map")) {
  assert.equal(
    referencedScreenshots.filter((name) => name === `${mode}.png`).length,
    1,
    `${mode} must use one manual interface state.`,
  );
}

const manualDirectory = path.join(root, "public/media/tutorial/manual");
const manualFiles = (await readdir(manualDirectory)).sort();
assert.deepEqual(manualFiles, [...expectedScreenshots].sort());
for (const fileName of manualFiles) {
  const buffer = await readFile(path.join(manualDirectory, fileName));
  assert.deepEqual(
    pngDimensions(buffer),
    { width: 4064, height: 2144 },
    `${fileName} must keep the original high-resolution dimensions.`,
  );
}

assert.match(css, /\.tutorialTarget\s*\{[\s\S]*?min-width:\s*44px;[\s\S]*?min-height:\s*44px;/);
assert.match(css, /\.tutorialTarget:focus-visible/);
assert.match(css, /\.tutorialPrompt\s*\{/);
assert.doesNotMatch(
  css,
  /\.tutorialPrompt\.success|\.tutorialTargetBox\.explored|\.tutorialTarget\.explored/,
  "Completed screenshot targets must not switch to green or display a checkmark.",
);
assert.match(css, /\.tutorialViewport\s*\{[\s\S]*?overscroll-behavior-y:\s*auto/);
assert.match(css, /\.tutorialViewport\s*\{[\s\S]*?touch-action:\s*pan-y/);
assert.match(workflow, /className="workflowLayout"/);
assert.match(workflow, /className="tutorialSteps"/);
assert.match(workflow, /className="tutorialStageWorkspace"/);
assert.match(workflow, /className="tutorialStageHeader"/);
assert.match(workflow, /String\(index \+ 1\)\.padStart\(2, "0"\)/);
assert.doesNotMatch(workflow, /tutorialBody|tutorialSidebar|tutorialStepRail/);
assert.match(css, /\.featureGrid\s*\{[\s\S]*?grid-template-columns:\s*repeat\(3,/);
assert.match(css, /\.workflowTabs\s*\{[\s\S]*?grid-template-columns:\s*repeat\(6,/);
assert.match(css, /\.workflowLayout\s*\{[\s\S]*?grid-template-columns:\s*190px\s+minmax\(0,\s*1fr\)/);
assert.match(css, /\.tutorialSteps\s*\{[\s\S]*?grid-column:\s*1/);
assert.match(css, /\.tutorialStageWorkspace\s*\{[\s\S]*?grid-column:\s*2/);
assert.doesNotMatch(
  css,
  /Interactive screenshot tutorial|Manual screenshot walkthrough|\.hero\.heroCompact|\.videoWorkspace|\.videoHeader|\.videoControls|\.stepNotes|\.quickNotes/,
  "Obsolete tutorial and compact-hero overrides must remain removed.",
);
assert.match(css, /@media \(max-width:\s*920px\)/);
assert.match(css, /@media \(max-width:\s*640px\)/);
assert.match(css, /@media \(prefers-reduced-motion:\s*reduce\)/);
const heroTitleRule = css.match(/\.heroTitleMedia\s*\{([\s\S]*?)\}/)?.[1] ?? "";
const heroSubtitleRule = css.match(/\.hero p\s*\{([\s\S]*?)\}/)?.[1] ?? "";
assert.doesNotMatch(heroTitleRule, /isolation:\s*isolate/, "The hero video must blend with the page backdrop.");
assert.doesNotMatch(heroSubtitleRule, /margin:\s*[^;]*-\d/, "The hero subtitle must not overlap the title media.");

for (const token of ["rel=\"canonical\"", "property=\"og:title\"", "name=\"twitter:card\"", "name=\"theme-color\""]) {
  assert.ok(html.includes(token), `Missing SEO metadata: ${token}`);
}

const tutorialFiles = await filesBelow(path.join(root, "public/media/tutorial"));
assert.equal(tutorialFiles.filter((file) => file.includes("/manual/") && file.endsWith(".png")).length, 9);
assert.equal(tutorialFiles.filter((file) => /\.(mp4|vtt)$/i.test(file)).length, 0, "Legacy tutorial videos must remain removed.");

const gifSize = (await stat(path.join(root, "public/media/feature-mobility-analysis.gif"))).size;
const mp4Size = (await stat(path.join(root, "public/media/feature-mobility-analysis.mp4"))).size;
assert.ok(mp4Size < gifSize / 4, "The Mobility feature preview should remain substantially smaller than its GIF source.");
const originalHeroSize = (await stat(path.join(root, "public/media/hero_text.webm"))).size;
const transparentHeroSize = (await stat(path.join(root, "public/media/hero_text_alpha_compact.webm"))).size;
assert.ok(transparentHeroSize < originalHeroSize * 1.5, "The transparent Hero animation must remain web-friendly.");

for (const documentPath of [
  "docs/openairtwin-architecture.html",
  "docs/development.md",
  "docs/data-licenses.md",
  "docs/README.md",
  "docs/release-checklist.md",
  "CHANGELOG.md",
]) {
  assert.ok((await stat(path.join(repositoryRoot, documentPath))).isFile(), `Missing public documentation: ${documentPath}`);
}

console.log("Tutorial contracts passed: 6 modes, 24 steps, 9 manual 2× screenshots, stable progress, and accessible controls.");
