import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repositoryRoot = path.resolve(root, "..");
const read = (relativePath) => readFile(path.join(root, relativePath), "utf8");
const expectedModes = ["link", "mobility", "radiomap", "deepmimo", "radar"];

assert.ok(
  !existsSync(path.join(root, "src/components/QuickStartAndCitation.tsx")),
  "QuickStartAndCitation.tsx must remain removed.",
);

const [main, app, siteData, sandbox, scene3d, urbanModel, capabilities, quickStart, css, html] =
  await Promise.all([
    read("src/main.tsx"),
    read("src/App.tsx"),
    read("src/data/siteData.ts"),
    read("src/components/PhysicsSandbox.tsx"),
    read("src/components/UrbanScene3D.tsx"),
    read("src/physics/urbanModel.ts"),
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
assert.match(urbanModel, /txLos:\s*boolean/);
assert.match(urbanModel, /rxLos:\s*boolean/);
assert.match(scene3d, /if\s*\(target\.txLos\)/);
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

// 7. 3D Radar LoS, collision clearance, sector alignment, and 3D spatial dispersion sweep
const urbanModelJs = ts.transpileModule(urbanModel, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const {
  computeRadarScene,
  hasUavBuildingCollision,
  isLineOfSightClear3D,
  radarNormalizedCoords,
  WORLD_W,
  WORLD_H,
} = await import(
  `data:text/javascript;base64,${Buffer.from(urbanModelJs, "utf8").toString("base64")}`
);
for (const bistatic of [false, true]) {
  let clearTotal = 0;
  let occludedTotal = 0;
  let saw2Detections = false;
  let saw3Detections = false;
  const trackMap = new Map();

  for (let i = 0; i < 100; i += 1) {
    const sim = computeRadarScene(bistatic, 1.0, 12, i / 100);
    if (i === 0) {
      for (let k = 0; k <= 40; k += 1) {
        const ang =
          sim.sector.startAngleRad +
          (k / 40) * (sim.sector.endAngleRad - sim.sector.startAngleRad);
        const sx = sim.tx.x + sim.sector.radiusUnits * Math.cos(ang);
        const sy = sim.tx.y + sim.sector.radiusUnits * Math.sin(ang);
        assert.ok(
          sx >= 0 && sx <= WORLD_W && sy >= 0 && sy <= WORLD_H,
          `Tx radar sector boundary spills outside urban plinth at (${sx.toFixed(1)}, ${sy.toFixed(1)})`,
        );
      }
      for (const target of sim.targets) {
        assert.equal(
          target.orbitPath.length,
          48,
          `UAV ${target.id} orbitPath must contain 48 samples`,
        );
        for (const pt of target.orbitPath) {
          assert.equal(
            hasUavBuildingCollision({ x: pt.x, y: pt.y }, pt.zM, 3.6, 5.0),
            false,
            `UAV ${target.id} orbitPath collides with a building`,
          );
        }
      }
    }

    const tx3 = { x: sim.tx.x, y: sim.tx.y, zM: sim.txHeightM };
    const rx3 = { x: sim.rx.x, y: sim.rx.y, zM: sim.rxHeightM };
    for (const target of sim.targets) {
      assert.equal(
        hasUavBuildingCollision(target.pos, target.altitudeM, 3.6, 5.0),
        false,
        `UAV ${target.id} collides with a building (step=${i})`,
      );
      const dx = target.pos.x - sim.tx.x;
      const dy = target.pos.y - sim.tx.y;
      const polarDist = Math.hypot(dx, dy);
      const polarAng = Math.atan2(dy, dx);
      assert.ok(
        polarDist <= sim.sector.radiusUnits - 4.0,
        `UAV ${target.id} leaves Tx radar sector range (${polarDist.toFixed(1)} > ${sim.sector.radiusUnits - 4})`,
      );
      assert.ok(
        polarAng >= sim.sector.startAngleRad + 0.04 &&
          polarAng <= sim.sector.endAngleRad - 0.04,
        `UAV ${target.id} leaves Tx radar sector azimuth (${polarAng.toFixed(3)} rad)`,
      );

      let entry = trackMap.get(target.id);
      if (!entry) {
        entry = {
          pts: [],
          minZ: Infinity,
          maxZ: -Infinity,
          minAng: Infinity,
          maxAng: -Infinity,
        };
        trackMap.set(target.id, entry);
      }
      entry.pts.push({ x: target.pos.x, y: target.pos.y });
      entry.minZ = Math.min(entry.minZ, target.altitudeM);
      entry.maxZ = Math.max(entry.maxZ, target.altitudeM);
      entry.minAng = Math.min(entry.minAng, polarAng);
      entry.maxAng = Math.max(entry.maxAng, polarAng);

      const tgt3 = { x: target.pos.x, y: target.pos.y, zM: target.altitudeM };
      assert.equal(
        target.txLos,
        isLineOfSightClear3D(tx3, tgt3, undefined, -0.35, 1.0),
        `Radar txLos mismatch for ${target.id} (bistatic=${bistatic}, step=${i})`,
      );
      if (target.txLos) {
        assert.ok(
          isLineOfSightClear3D(tx3, tgt3),
          `Unoccluded tx leg intersects a building for ${target.id}`,
        );
      }
      if (bistatic) {
        assert.equal(
          target.rxLos,
          isLineOfSightClear3D(rx3, tgt3, undefined, -0.35, 1.0),
          `Radar rxLos mismatch for ${target.id} (bistatic=${bistatic}, step=${i})`,
        );
        if (target.rxLos) {
          assert.ok(
            isLineOfSightClear3D(rx3, tgt3),
            `Unoccluded rx leg intersects a building for ${target.id}`,
          );
        }
      }
      if (target.occluded) occludedTotal += 1;
      else clearTotal += 1;
    }
    if (sim.detections.length === 2) saw2Detections = true;
    if (sim.detections.length === 3) saw3Detections = true;
    for (const det of sim.detections) {
      const matched = sim.targets.find((t) => t.id === det.targetId);
      assert.ok(matched && !matched.occluded, "Occluded UAV must not produce CA-CFAR detection.");

      // Verify exact Range-Doppler peak alignment with detection marker normalized coordinates
      const { u, v } = radarNormalizedCoords(
        det.rangeM,
        det.velocityMs,
        sim.maxRangeM,
        sim.maxVelocityMs,
      );
      const cCol = Math.min(sim.rdCols - 1, Math.max(0, Math.floor(u * sim.rdCols)));
      const cRow = Math.min(sim.rdRows - 1, Math.max(0, Math.floor(v * sim.rdRows)));
      const cellDb = sim.rdMatrixDb[cRow * sim.rdCols + cCol];
      assert.ok(
        cellDb >= -65,
        `Range-Doppler energy at mapped bin for ${det.targetId} is too weak (${cellDb.toFixed(1)} dB)`,
      );
      let peakCol = cCol;
      let peakRow = cRow;
      let peakDb = -Infinity;
      for (let r = Math.max(0, cRow - 2); r <= Math.min(sim.rdRows - 1, cRow + 2); r += 1) {
        for (let c = Math.max(0, cCol - 2); c <= Math.min(sim.rdCols - 1, cCol + 2); c += 1) {
          const valDb = sim.rdMatrixDb[r * sim.rdCols + c];
          if (valDb > peakDb) {
            peakDb = valDb;
            peakCol = c;
            peakRow = r;
          }
        }
      }
      assert.ok(
        peakDb >= -65,
        `Range-Doppler peak for ${det.targetId} is too weak (${peakDb.toFixed(1)} dB)`,
      );
      assert.ok(
        Math.abs((peakCol + 0.5) / sim.rdCols - u) <= 1.0 / sim.rdCols,
        `Range-Doppler column peak misaligned for ${det.targetId} (bistatic=${bistatic}, step=${i})`,
      );
      assert.ok(
        Math.abs((peakRow + 0.5) / sim.rdRows - v) <= 1.0 / sim.rdRows,
        `Range-Doppler row peak misaligned for ${det.targetId} (bistatic=${bistatic}, step=${i})`,
      );
    }
  }

  const tracks = Array.from(trackMap.entries());
  assert.equal(tracks.length, 3, "Radar scene must contain 3 UAV tracks.");
  for (let a = 0; a < tracks.length; a += 1) {
    for (let b = a + 1; b < tracks.length; b += 1) {
      const [idA, trA] = tracks[a];
      const [idB, trB] = tracks[b];
      let minXyDist = Infinity;
      for (const pa of trA.pts) {
        for (const pb of trB.pts) {
          minXyDist = Math.min(minXyDist, Math.hypot(pa.x - pb.x, pa.y - pb.y));
        }
      }
      assert.ok(
        minXyDist >= 12.0,
        `UAV tracks ${idA} and ${idB} are too close horizontally (${minXyDist.toFixed(1)} < 12.0 units)`,
      );
      const zGap = Math.max(0, trA.minZ - trB.maxZ, trB.minZ - trA.maxZ);
      assert.ok(
        zGap >= 10.0,
        `UAV tracks ${idA} and ${idB} lack distinct altitude tiers (zGap=${zGap.toFixed(1)}m < 10m)`,
      );
      const azGap = Math.max(0, trA.minAng - trB.maxAng, trB.minAng - trA.maxAng);
      assert.ok(
        azGap >= 0.1,
        `UAV tracks ${idA} and ${idB} overlap in Tx azimuth (${azGap.toFixed(3)} rad < 0.10 rad)`,
      );
    }
  }

  assert.ok(clearTotal > 0 && occludedTotal > 0, "Radar sweep must cover both LoS and occluded states.");
  if (!bistatic) {
    assert.ok(
      saw2Detections && saw3Detections,
      "Monostatic Radar orbital sweep must dynamically transition between 2 and 3 detections.",
    );
  }
}
const monoDefault = computeRadarScene(false, 1.0, 12, 0.18);
const biDefault = computeRadarScene(true, 1.0, 12, 0.18);
assert.ok(monoDefault.detections.length >= 2, "Default Monostatic Radar must show >= 2 detections.");
assert.ok(biDefault.detections.length >= 2, "Default Bistatic Radar must show >= 2 detections.");

