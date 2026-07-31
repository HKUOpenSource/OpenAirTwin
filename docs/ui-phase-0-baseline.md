# OpenAirTwin UI Phase 0 Baseline

> Status: Frozen
> Date: 2026-07-30
> Scope: Core desktop workbench
> Visual reference: `1440x900`
> Minimum supported viewport: `1280x720`

## 1. Purpose

This baseline protects the later component-standardization and React migration work. It records the DOM, styles, network traffic, resources, and visual behavior of the releasable workbench so later migrations can prove that implementation changed while functionality, interaction logic, visuals, and styling did not.

The baseline is not a new design specification and does not authorize visual differences. Unless a task explicitly approves a user-visible product change, a baseline difference must first be treated as a regression.

## 2. Frozen Evidence

### 2.1 Machine-Comparable Contracts

The deterministic Playwright workbench fixture generates the following files and ordinary test runs compare them strictly:

- `tests/browser/baselines/phase-0-dom-contract.json`
  - Records every element with an ID in document order.
  - Records tag, class, role, ARIA, mode data, label, default value, checked, disabled, and details-open state.
  - Protects existing DOM IDs, accessibility relationships, control order, and default state.
- `tests/browser/baselines/phase-0-computed-styles.json`
  - Records the browser-resolved value of every `--oat-*` token.
  - Records representative computed styles for panels, buttons, inputs, checkboxes, badges, collapsible groups, scroll regions, the Device Dock, Result Dock, Performance Dock, dialog, Entry Panel, and Radar fields.
  - Detects drift in cascade, tokens, typography, borders, spacing, dimensions, scrolling, and stacking.
- `tests/browser/baselines/phase-0-network-contract.json`
  - Records first-party CSS, JavaScript, libraries, and key UI assets loaded during initial scene setup.
  - Records path, status, resource type, content type, and content length.
  - Detects missing resources, unexpected dependencies, and unreviewed transfer growth.
- `tests/browser/baselines/phase-0-resource-contract.json`
  - Warms all five features and then executes five consecutive mode cycles.
  - Requires zero growth in active intervals, canvases, DOM nodes, frame listeners, listener registrations, and Radar label elements.

### 2.2 Runtime Observation

`tests/browser/baselines/phase-0-runtime-observation.json` stores one observation of the baseline environment. It is not a byte-for-byte performance assertion:

- Playwright browser: Chromium
- Browser UA: Headless Chrome 146
- Platform: macOS / MacIntel
- Viewport: `1440x900`
- UI Ready wall time: 152 ms
- DOM Complete: 90.4 ms
- First Contentful Paint: 768 ms
- Resource count: 101
- Encoded body: 18,133,972 bytes
- Transfer: 18,163,672 bytes
- Before and after five feature cycles: 1 active interval, 4 canvases, 1,396 DOM nodes, and 274 listener registrations, with zero growth in every measure

Timing and heap data vary with hardware, browser build, cache state, and test scheduling. Performance budgets must repeat samples in the same environment and use the median instead of treating a single observation as a cross-machine hard threshold.

### 2.3 Visual Snapshots

Added:

- `workbench-shell-1440-darwin.png`: Complete `1440x900` workbench with the Performance Dock expanded.
- `workbench-shell-1280-darwin.png`: Complete `1280x720` workbench with the Performance Dock collapsed by default.
- `performance-dock-expanded-darwin.png`: Expanded Performance Dock component.

Retained without updates:

- Control-panel snapshots for Link, Mobility, Radio Map, DeepMIMO, and Radar.
- Radar Result Dock snapshot.
- Radar target-label snapshot.

The complete-workbench snapshots use a stable Viewer stub so continuous WebGL frames do not obscure UI regression signals with subpixel noise. Existing browser tests continue to verify the real Viewer, WebGL, assets, layers, Radar targets, and Canvas charts separately.

The `1280x720` full-screen baseline also asserts that:

- The Control Panel and Result Dock do not overlap.
- The Control Panel and Device Dock do not overlap.
- The Result Dock and Device Dock do not overlap.
- The collapsed Performance Dock does not overlap the Result or Device Dock.
- The Device Dock is entirely within the viewport.

## 3. Browser Support Record

Phase 0 preserves the existing support scope and does not broaden compatibility commitments:

- Desktop Chromium and Google Chrome.
- macOS visual snapshots run through the local Google Chrome or Chromium path.
- CI uses Playwright Chromium for contracts that are independent of platform pixel rendering.
- The core workbench does not support viewports smaller than `1280x720`.
- Firefox, Safari, and mobile are outside this release contract.
- The tutorial website retains its separate responsive and browser test system.

## 4. Update and Review Rules

Normal verification command:

```bash
cd tests/browser
npx playwright test --grep "phase 0"
```

Run the following only when a baseline change has been explicitly reviewed:

```bash
cd tests/browser
OAT_UPDATE_PHASE0_BASELINE=1 npx playwright test --grep "phase 0" --update-snapshots
```

Before updating a baseline:

1. Explain why the old contract no longer applies.
2. Inspect differences in DOM IDs, ARIA, default values, and control order.
3. Inspect token and computed-style differences.
4. Inspect added, removed, and resized network resources.
5. Compare every old and new snapshot in an image viewer.
6. Confirm that resource growth remains zero.
7. List every intentional difference in the pull request or phase evidence report.
8. Run the complete Python and Playwright suites, not only the baseline tests.

Do not update the baseline merely because the implementation changed to React, Vite, TypeScript, a DOM factory, or components. An implementation change must first prove product-contract equivalence. Only explained network-path changes caused by infrastructure may be reviewed separately in the corresponding migration phase.

## 5. Phase 0 Completion Gate

- [x] The seven-file CSS architecture and `--oat-*` token contract are established.
- [x] Existing `1440x900` visual snapshots were not updated.
- [x] Complete `1440x900` and `1280x720` workbench snapshots were added.
- [x] DOM, computed-style, network, and resource contracts are versioned.
- [x] Five complete feature cycles produce zero resource growth.
- [x] Browser support scope is documented.
- [x] Complete Python suite passed: 303 passed, 4 skipped.
- [x] Complete Playwright suite passed: 19 passed.
- [x] The real page and interaction flow passed in-app browser verification with no console warning or error.
- [x] The final diff was reviewed and the Phase 0 commit was created.

The Phase 0 contracts, verification evidence, and commit scope have received final review.
