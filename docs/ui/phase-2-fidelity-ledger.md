# Phase 2 UI Fidelity Ledger

> Objective: Standardize the existing native UI components without changing functionality, interaction logic, visuals, or layout.

## Allowed Source Changes

- Production nodes gain shared `oat-*` classes only; existing IDs, semantic classes, tags, attributes, and order remain unchanged.
- `.btn`, `.miniBtn`, and `.miniSelect` become temporary aliases of shared rules and no longer own separate component implementations.
- Core Radar button geometry moves to shared modifiers; the feature stylesheet retains only target-editor domain layout and picking states.
- Existing SVG icon sizes and stroke values map one-to-one to tokens.
- The development-only component catalog is not served by the production server and is absent from the production request set.

## Prohibited Changes

- Do not update Phase 0 product visual snapshots or computed-style baselines.
- Do not change REST contracts, the Feature Registry, DOM IDs, copy, focus order, or user workflow steps.
- Do not change the `1440x900` product layout; `1280x720` must continue to satisfy the non-overlap contract.

## Verification Evidence

- Phase 0 DOM comparison permits only added `oat-*` classes; all other historical fields remain strictly equal.
- Phase 0 network comparison continues to verify paths, status, MIME type, and resource type. Source length changes are reviewed through the Git diff and this ledger, not treated as a runtime interface.
- The component catalog checks shared variants, states, accessible names, and a feature composed only from shared components.
- Product Playwright screenshots use the existing baselines and may not be updated.
