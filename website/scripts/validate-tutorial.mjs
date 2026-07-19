import assert from "node:assert/strict";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relativePath) => readFile(path.join(root, relativePath), "utf8");

const [workflow, app, data, css, html] = await Promise.all([
  read("src/WorkflowTutorial.tsx"),
  read("src/App.tsx"),
  read("src/tutorialData.ts"),
  read("src/styles.css"),
  read("index.html"),
]);

assert.doesNotMatch(workflow, /\bautoPlay\b/, "Tutorial clips must never autoplay.");
assert.doesNotMatch(workflow, /preload="auto"/, "Tutorial clips must not preload full videos.");
assert.doesNotMatch(workflow, /onEnded=\{nextStep\}/, "Finishing a clip must not change the active step.");
assert.doesNotMatch(workflow, /PLAYBACK_RATE/, "Tutorial playback must default to the browser's 1× rate.");
assert.match(workflow, /preload="metadata"/);
assert.match(workflow, /role="tabpanel"/);
assert.match(workflow, /aria-controls="tutorial-panel"/);
assert.match(workflow, /tabIndex=\{mode\.id === activeMode\.id \? 0 : -1\}/);
assert.match(workflow, /<track/);
assert.match(workflow, /step\.parameters/);
assert.match(workflow, /window\.localStorage/);
assert.match(workflow, /window\.history\[replace \? "replaceState" : "pushState"\]/);

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
assert.match(data, /feature-mobility-analysis\.mp4/);
assert.match(css, /\.videoWorkspace\s*\{[\s\S]*?grid-row:\s*1/);
const heroTitleRule = css.match(/\.heroTitleMedia\s*\{([\s\S]*?)\}/)?.[1] ?? "";
const heroSubtitleRule = css.match(/\.hero p\s*\{([\s\S]*?)\}/)?.[1] ?? "";
assert.doesNotMatch(heroTitleRule, /isolation:\s*isolate/, "The hero video must blend with the page backdrop.");
assert.doesNotMatch(heroSubtitleRule, /margin:\s*[^;]*-\d/, "The hero subtitle must not overlap the title media.");

for (const token of ["rel=\"canonical\"", "property=\"og:title\"", "name=\"twitter:card\"", "name=\"theme-color\""]) {
  assert.ok(html.includes(token), `Missing SEO metadata: ${token}`);
}

const tutorialRoot = path.join(root, "public/media/tutorial");
const modeNames = ["map", "link", "mobility", "radiomap", "deepmimo"];
let videoCount = 0;

for (const modeName of modeNames) {
  const files = await readdir(path.join(tutorialRoot, modeName));
  const videos = files.filter((file) => file.endsWith(".mp4"));
  assert.equal(videos.length, 4, `${modeName} must have exactly four tutorial videos.`);
  for (const video of videos) {
    const caption = video.replace(/\.mp4$/, ".vtt");
    assert.ok(files.includes(caption), `Missing caption file for ${modeName}/${video}.`);
    assert.match(await readFile(path.join(tutorialRoot, modeName, caption), "utf8"), /^WEBVTT/);
    videoCount += 1;
  }
}

assert.equal(videoCount, 20);
const gifSize = (await stat(path.join(root, "public/media/feature-mobility-analysis.gif"))).size;
const mp4Size = (await stat(path.join(root, "public/media/feature-mobility-analysis.mp4"))).size;
assert.ok(mp4Size < gifSize / 4, "The Mobility preview should be substantially smaller than its GIF source.");
const originalHeroSize = (await stat(path.join(root, "public/media/hero_text.webm"))).size;
const transparentHeroSize = (await stat(path.join(root, "public/media/hero_text_alpha_compact.webm"))).size;
assert.ok(transparentHeroSize < originalHeroSize * 1.5, "The transparent Hero animation must remain web-friendly.");

for (const documentPath of [
  "../docs/openairtwin-architecture.html",
  "../docs/development.md",
  "../docs/data-licenses.md",
  "../docs/README.md",
  "../docs/release-checklist.md",
  "../CHANGELOG.md",
]) {
  assert.ok((await stat(path.resolve(root, documentPath))).isFile(), `Missing public documentation: ${documentPath}`);
}

console.log(`Tutorial contracts passed: ${videoCount} clips, captions, navigation, installation, accessibility, SEO, and documentation links.`);
