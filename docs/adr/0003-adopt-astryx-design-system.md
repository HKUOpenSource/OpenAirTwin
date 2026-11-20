# ADR 0003: Adopt Meta Astryx Design System and Unidirectional Workbench State

- Status: Accepted
- Date: 2026-11-19
- Supersedes: ADR 0002
- Decision scope: Desktop workbench UI components, theme layer, workstation layout, and React-to-domain state flow

## Context

Maintaining a custom component layer (`oat-*` CSS classes, 5,000+ lines of static control JSX, hand-rolled tooltip positioning, hand-rolled dialog focus traps, and `dom_refs.js` bidirectional DOM scraping) created high maintenance overhead, fragile state synchronization between imperative JavaScript controllers and React, and layout crowding across floating docks.

Because OpenAirTwin already runs on React 19, TypeScript, and Vite, adopting a standard React 19 design system eliminates duplicated primitive engineering while providing first-class accessibility, keyboard interaction, and consistent desktop density.

## Decision

1. Adopt **Astryx** (`@astryxdesign/core` with `@astryxdesign/theme-neutral` and `lucide-react`) as the standard UI component library for the desktop workbench, starting with a high-density light theme (`<Theme theme={neutralTheme} mode="light">`).
2. Consume Astryx's pre-built static CSS (`reset.css`, `astryx.css`, `theme.css`) inside an explicit CSS `@layer` stack (`reset, astryx-base, astryx-theme, oat-theme, oat-layout, oat-charts`) bundled by Vite.
3. Reorganize the workbench into a structured CAD/simulation workstation layout: a 44 px top workspace bar (with 5-mode `SegmentedControl`, tile-map launcher, Datasets popover, and Performance popover), a collapsible left inspector with tabbed workflow/solver panels and sticky run footer, a full-bleed center 3D viewport with a compact bottom device bar, and a collapsible right analysis drawer.
4. Abolish `dom_refs.js` and bidirectional DOM scraping (`captureSnapshot`). Domain controllers mutate domain state and publish immutable snapshots to React stores; React components render declaratively with Astryx controls and dispatch typed `UiCommand` actions back to domain handlers.
5. Keep imperative rendering engines (Three.js 3D viewport, Leaflet + MapLibre GL entry map, SVG/Canvas scientific charts, and the Radar 3D asset preview canvas) isolated inside stable DOM hosts registered via a minimal host registry.
6. Retire the legacy Native-vs-React UI catalog (`tools/ui-catalog/`) and legacy pixel-freeze compatibility contracts; replace them with semantic accessibility and behavior tests.

## Consequences

- Standard form controls (`NumberInput` with built-in units and `labelTooltip`, `Selector`, `TextInput`, `Switch`, `CheckboxInput`, `Slider`, `SegmentedControl`), overlays (`AlertDialog`, `Dialog`, `Popover`, `Tooltip`), and data displays (`MetadataList`, `ProgressBar`, `EmptyState`, `Card`, `SelectableCard`, `Badge`) replace thousands of lines of bespoke markup and CSS.
- Production CSS gzip budget increases from 24 KiB to reflect Astryx's pre-compiled stylesheet (`~50 KiB` gzip for reset + core + neutral theme) while eliminating legacy `tokens.css` and `components.css`.
- Adding new Features or parameters requires only state fields, command handlers, and concise React composition over `workbench/src/ui/` thin wrappers.
