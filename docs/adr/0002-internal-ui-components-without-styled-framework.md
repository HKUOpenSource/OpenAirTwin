# ADR 0002: Use an Internal Component Library Without a Styled Third-Party Framework

- Status: Accepted
- Date: 2026-07-30
- Decision scope: Core desktop workbench components and styles

## Context

OpenAirTwin must preserve the existing control density, DOM IDs, element semantics, keyboard and focus behavior, the `1440x900` pixel baseline, and the `1280x720` layout. Styled component frameworks such as MUI, Ant Design, and Bootstrap usually introduce their own DOM wrappers, dimensions, state styling, and theme layer, which would increase the cost of proving fidelity.

## Decision

Maintain an internal OpenAirTwin component layer that reuses the seven existing CSS modules, Cascade Layers, and `--oat-*` tokens. Component APIs expose semantic variants only and do not accept arbitrary visual values. `docs/ui/component-contracts.md` is the authority for shared component contracts.

No headless component library is introduced by default. A complex component may adopt one only through a separate ADR backed by DOM, ARIA, keyboard, focus, lifecycle, bundle, and visual-equivalence tests. Pure icon assets such as Lucide may be evaluated separately after a centralized icon contract exists; that does not authorize a component framework.

## Consequences

- Existing visuals and behavior can be reused exactly without creating two sources of truth between a third-party theme and project tokens.
- The project must maintain component states, accessibility, the catalog, and the test matrix itself.
- New features must compose shared components first; domain components may not override shared core geometry.
- The native UI contract was validated before React components became the production rendering owners.

## Rejected Alternatives

- Styled component frameworks: high risk of DOM and visual drift.
- Utility-first CSS rewrite: it would bypass current token and layer ownership and create a class-level visual API.
- CSS-in-JS: it would add runtime and style-injection ordering and break the native CSS contract.
