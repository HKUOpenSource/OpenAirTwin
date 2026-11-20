# OpenAirTwin Icon Contract

> Status: Active production contract

Desktop workbench icons are sourced from `lucide-react` and composed through `@astryxdesign/core` (`Button`, `IconButton`, `ToggleButton`, `NumberInput`, `Tooltip`) and domain wrappers in `workbench/src/ui/`. Axis indicators (`X`, `Y`, `Z`, `Min`, `Max`, `L0`, `L1`, `V`, `H`, `R`, `C`, `P`, `D`) use compact `lucide-react` glyphs or monospaced prefix badges defined in `workbench/src/ui/ParamFields.tsx`.

## Sizing and Stroke Consistency

| Context | Typical Size | Notes |
| --- | --- | --- |
| Compact field prefix & inline badge | `12 px` (`--text-supporting-size`) | Compact axis badges (`X`, `Y`, `Z`, `Min`, `Max`, `V`, `H`) stay vertically aligned inside `size="sm"` controls |
| Toolbar, inspector action & card icon | `14 px` | Standard size (`size={14}`) across `TopWorkspaceBar`, `DeviceBar`, `LeftInspector`, `RadarControls`, and `EntryMapScreen` |
| Panel trigger & navigation button | `14–16 px` | Matches compact `28 px` desktop control rhythm (`workbench.css`) |

Icons inherit `currentColor` with uniform stroke geometry (`fill: none`, round caps and joins via Lucide). Placing an icon inside a button must not shift adjacent text baselines or inflate control height.

## Accessibility

- Icon-only buttons (`IconButton` or icon-only controls) must provide a descriptive `label` / `aria-label`; decorative SVGs use `aria-hidden="true"`.
- When an icon accompanies visible text, the icon uses `aria-hidden="true"` so screen readers announce the visible label only once.
- Data-bearing chart SVGs (such as Link tap plots and Radar target connector overlays) retain appropriate `role="img"` / ARIA semantics rather than decorative icon treatment.
- Interactive state (selected, error, disabled, or busy) must never rely solely on icon color.
