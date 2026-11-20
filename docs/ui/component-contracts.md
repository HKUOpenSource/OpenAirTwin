# OpenAirTwin UI Component Contract

> Status: Active production contract; the workbench is owned by one React `app-shell` root powered by Astryx (`@astryxdesign/core` + `@astryxdesign/theme-neutral` in light mode)
>
> Scope: Core desktop workbench at `1280x720` and larger
>
> Visual reference: `1440x900`

## 1. Contract Rules

1. A DOM subtree has exactly one rendering owner. Shared components, feature components, and imperative engines may not mutate the same subtree.
2. Shared wrappers in `workbench/src/ui/` accept semantic domain properties and stable identifiers. Arbitrary inline styles for static spacing, colors, radii, shadows, or z-index values are prohibited (except closed runtime exceptions in [`imperative-ui-exceptions.md`](imperative-ui-exceptions.md)).
3. Components render immutable snapshots from Workbench stores and emit typed `UiCommand` objects. They do not call REST endpoints or mutate sibling feature state directly.
4. The [DOM compatibility contract](dom-compatibility-contract.json) and interaction tests protect key IDs, element semantics, ARIA attributes, keyboard navigation, and focus restoration.
5. Styling lives in the Vite-bundled `@layer` stack (`reset, astryx-base, astryx-theme, oat-theme, oat-layout, oat-charts`) inside `workbench/src/styles/workbench.css`.
6. Every shared component handles `hover`, `focus-visible`, and `disabled` states; interactive controls handle `busy`, `invalid`, `selected`, and `empty` states where applicable.
7. Controlled field values flow unidirectionally from feature snapshots, and edits submit through `CommandBus` (`workbench.control.update` / `workbench.control.action`).

## 2. Shared Component API

The machine-readable component registry is [`component-manifest.json`](component-manifest.json) (schema v7). Desktop primitives are provided by `@astryxdesign/core` and wrapped ergonomically in `workbench/src/ui/ParamFields.tsx` and `workbench/src/ui/WorkbenchChrome.tsx`:

| Contract Component | Implementation Primitives | Optional semantic properties | Behavior and Accessibility Contract | Owner |
| --- | --- | --- | --- | --- |
| `Button` | `@astryxdesign/core/Button` | `variant=primary\|secondary\|ghost\|destructive`, `size`, `isDisabled`, `isLoading`, `icon`, `tooltip` | Native `button`; busy exposes `aria-busy=true`; icons marked `aria-hidden` | `@astryxdesign/core`, `workbench.css` |
| `IconButton` | `@astryxdesign/core/IconButton` | `pressed`, `isDisabled`, `tooltip` | Native button with required accessible `label` and fixed square hit area | `@astryxdesign/core`, `workbench.css` |
| `ButtonGroup` | `@astryxdesign/core/ToggleButtonGroup`, `MultiToggleRow` | `type`, `size` | Accessible toggle group preserving arrow/keyboard focus across items | `@astryxdesign/core`, `ParamFields.tsx` |
| `Field` | `InspectorRow`, `@astryxdesign/core/Field` | `label`, `tooltip`, `units`, `status` | Aligned two-column CAD row (`104 px` label column with hover tooltip + flexible control column) | `ParamFields.tsx`, `workbench.css` |
| `NumberField` | `ParamNumber` / `InlineNumberField` (`NumberInput`) | `min`, `max`, `step`, `units`, `prefix`, `isIntegerOnly`, `hasClear`, `hasNumberSteppers` | Built-in stepper buttons (`+`/`-` up/down), unit suffix, draft commit on blur/Enter | `@astryxdesign/core`, `ParamFields.tsx` |
| `TextField` | `ParamText` (`TextInput`) | `placeholder`, `isDisabled`, `isReadOnly`, `hasClear` | Accessible text input with optional Enter commit handler and clear action | `@astryxdesign/core`, `ParamFields.tsx` |
| `SelectField` | `ParamSelect` (`Selector`) | `isDisabled`, `renderValue`, `renderOption` | Keyboard-navigable listbox supporting custom swatches (fixed-width colormap bars + names) | `@astryxdesign/core`, `ParamFields.tsx`, `workbench.css` |
| `UnitInput` | `ParamNumber` with `units` / `prefix` | `formatValue` | Units (`MHz`, `GHz`, `m`, `m/s`, `dB`, `°`) and axis badges sit inside field chrome, never in editable value | `ParamFields.tsx`, `number-format.ts` |
| `Checkbox` | `@astryxdesign/core/CheckboxInput`, `ParamCheckbox` | `isDisabled`, `description` | Native checkbox semantics; preserves label click and Space toggle | `@astryxdesign/core`, `ParamFields.tsx` |
| `RadioGroup` | `ModeSelector`, `SegmentedControl` | `size`, `layout`, `value` | Full-group radiogroup semantics and keyboard arrow navigation | `@astryxdesign/core` |
| `RangeInput` | `SliderNumberRow` (`@astryxdesign/core/Slider` + `InlineNumberField`) | `min`, `max`, `step`, `units` | Synchronized fill slider paired with a width-locked stepped numeric input | `ParamFields.tsx`, `workbench.css` |
| `Panel` | `.oat-left-rail`, `.oat-right-rail`, `DrawerSection` | `collapsible`, `collapsed` | Collapsible workstation rails with smooth open/close persistence | `AppShell.tsx`, `workbench.css` |
| `PanelHeader` | Left/Right rail tab headers & section headers | `title`, `actions`, `icon` | Title and action buttons share one baseline without stealing accessible names | `WorkbenchChrome.tsx`, `LeftInspector.tsx`, `RightAnalysisDrawer.tsx` |
| `CollapsibleGroup` | `InspectorSection` | `title`, `collapsible`, `defaultCollapsed`, `dividers` | Accordion section toggle preserving internal expand state across renders | `ParamFields.tsx` |
| `ScrollRegion` | `.oat-left-rail-scroll`, `.oat-right-rail-scroll` | `flex` scroll container | Bounded vertical scroll region preserving scroll offset across state updates | `LeftInspector.tsx`, `RightAnalysisDrawer.tsx`, `workbench.css` |
| `Badge` / `StatusBadge` | `@astryxdesign/core/Badge` | `variant=neutral\|info\|success\|warning\|error` | Semantic status pill; never relies on color alone to convey state | `@astryxdesign/core` |
| `Progress` | `@astryxdesign/core/ProgressBar` | `value`, `max`, `isIndeterminate` | Accessible progressbar synchronized with async transfer and solver progress | `@astryxdesign/core`, `AppOverlays.tsx` |
| `MetricGrid` / `Metric` | `MetricGrid` (`.oat-metric-grid`, `.oat-metric-card`) | `columns=2\|3`, `wide` | Fixed-column key-metric summary grid using `tabular-nums` alignment | `WorkbenchChrome.tsx`, `workbench.css` |
| `ListCard` | `@astryxdesign/core/SelectableCard`, `.oat-list-row` | `selected`, `title`, `meta`, `detail` | Accessible card/button selection without color-only active indicators | `@astryxdesign/core`, `workbench.css` |
| `EmptyState` | `@astryxdesign/core/EmptyState` | `message`, `icon`, `action` | Guides users before devices/waypoints/results are present without nesting panels | `@astryxdesign/core` |
| `Dialog` | `@astryxdesign/core/Dialog` & `AlertDialog` | `variant`, `detail`, `onOpenChange` | Focus-trapped modal/confirm/error dialog supporting Escape and focus restoration | `AppOverlays.tsx` |
| `Tooltip` | `@astryxdesign/core/Tooltip` | `placement`, `delay` | Pointer hover tooltips on inspector labels, sub-inputs, and toolbar controls (`focusTrigger="never"`) | `@astryxdesign/core`, `ParamFields.tsx` |
| `LoadingOverlay` | `LoadingOverlay` (`.oat-loading-overlay`, `.oat-loading-card`) | `title`, `message`, `percent`, `cancellable` | Modal progress card with single-line ellipsized status text and cancel trigger | `AppOverlays.tsx`, `workbench.css` |
| `ChartFrame` | `ChartFrame`, SVG/Canvas result containers | `id`, `title`, `legend`, `actions` | Provides stable host ref for imperative chart rendering without rebuilding canvas hosts | `WorkbenchChrome.tsx`, `RightAnalysisDrawer.tsx` |

## 3. React Production Boundary & Shell Composition

All desktop chrome and forms mount through a single React root (`app-shell`) wrapped in `<Theme theme={neutralTheme} mode="light">` (`workbench/src/app/AppProviders.tsx`).

| Composite Module | DOM / Test Anchor | Owner | Composition |
| --- | --- | --- | --- |
| `ModeSelector` / Top Bar | `[data-testid="top-workspace-bar"]` | `TopWorkspaceBar.tsx` | Brand mark, `Map` launcher, 5-mode `SegmentedControl`, Datasets `Popover`, `PerformanceDock` `Popover`, drawer toggle |
| Control Panel | `#ui` / `[data-testid="left-inspector"]` | `LeftInspector.tsx` | Collapsible left rail, tabbed workflow vs. `SharedSolverControls`, `ScrollRegion`, sticky action footer |
| `DeviceDock` / Device Bar | `#deviceDock` / `[data-testid="device-bar"]` | `DeviceBar.tsx` | Compact `Tx` / `Rx` / `Draw ROI` / `Orbit Tx` pills + expandable coordinate precision editor card |
| `ResultDock` / Right Drawer | `[data-testid="right-analysis-drawer"]` | `RightAnalysisDrawer.tsx` | Summary `MetricGrid`, `KeyValueList`, `ListCard` selection lists, SVG/Canvas `ChartFrame`, Radar/Radiomap telemetry |
| `PerformanceDock` | `[data-testid="performance-panel"]` | `TopWorkspaceBar.tsx` | Fixed-width `328 px` FPS popover with Auto/Quality/Fast selector, material toggle, stats, single-line category checkboxes |
| Entry Map Screen | `#entryScreen` / `[data-testid="entry-map-screen"]` | `EntryMapScreen.tsx` | Place search `SelectableCard` list, floating map controls, bottom `N selected` action bar, Leaflet/MapLibre host |
| App Overlays | `#loadingScreen`, Alert/Modal dialogs | `AppOverlays.tsx` | `LoadingOverlay` (`ProgressBar` + single-line message) and Astryx `AlertDialog` / `Dialog` |

State flows unidirectionally from domain runtime (`backend/static/js/`) via `ShellStore`, `ControlsStore`, `ResultDockModel`, and `DeepMimoDatasetStore` into React via `useSyncExternalStore`. Leaflet (`#entryMap`), OpenFreeMap Positron MapLibre GL adapter (`entry-basemap.ts`), Three.js (`#view`), and SVG/Canvas chart hosts remain isolated behind `ImperativeHostRegistry`.

## 4. Repeated Pattern Ownership

| Production pattern | Shared component owner | Current consumers |
| --- | --- | --- |
| Primary, secondary, ghost, icon & toggle actions | `Button` / `IconButton` / `ToggleButton` | All 5 features, Top Bar, DeviceBar, Entry Map, Overlays |
| Labeled inspector row + tooltip + numeric/select input | `InspectorRow` + `ParamNumber` / `ParamSelect` | `Link`, `Mobility`, `Radio Map`, `DeepMIMO`, `Radar`, `SharedSolverControls`, `DeviceBar` |
| Multi-select ray/propagation option chips | `MultiToggleRow` (`ToggleButtonGroup`) | `Link` ray options, `SharedSolverControls` propagation, `Radar` propagation |
| Checkboxes, switches & density segments | `ParamCheckbox` / `ParamSwitch` / `SegmentedControl` | `Link`, `Mobility`, `Radio Map`, `DeepMIMO`, `Radar`, Performance popover |
| Expandable parameter sections | `InspectorSection` | Solver, Tx/Rx Arrays, Target editor, OFDM waveform, CFAR detector |
| Status badge & transfer progress | `Badge` / `ProgressBar` | Loading overlay, Radar job status, DeepMIMO queue, Entry Map selection count |
| Telemetry grids & tabular details | `MetricGrid` / `KeyValueList` | Link, Mobility, Radio Map, Radar results, Performance popover |
| Selectable paths, targets & search hits | `ListCard` / `SelectableCard` | Link paths, Mobility waypoints, DeepMIMO datasets, Radar targets/detections/paths, Map search |
| Empty, loading, failed & cancelled states | `EmptyState` / `Badge` / `Button` | Async solvers (`Mobility`, `Radio Map`, `DeepMIMO`, `Radar`) and empty waypoint/target lists |
| Scientific plot hosts & colormaps | `ChartFrame` + colorbar swatches | Link CIR taps, Mobility timeline, Radio Map colormap/legend, Radar Range–Doppler/Range profile |

## 5. Feature-Specific Domain Ownership

Feature-specific domain computation, transport calls, invalidation rules, and Viewer layer management remain cleanly separated inside `backend/static/js/features/<feature-id>/` and matching React view components (`workbench/src/features/controls/*.tsx` and `RightAnalysisDrawer.tsx`):

- **`Link`**: Synchronous path solve, discrete tap calculation, CIR Frequency/PDP charts, and live drag preview scheduling.
- **`Mobility`**: Rx waypoint list, kinematic duration estimate, time-series polling, timeline scrubber, and trajectory playback.
- **`Radio Map`**: Receiver patch dimensions, Auto `D1`–`D4` vs. cell-size grid, fixed-width gradient colormap picker, and terrain-mesh heatmap overlay.
- **`DeepMIMO`**: Scenario naming, terrain-dragged rectangular ROI, receiver candidate estimator, chunked subprocess jobs, and downloadable dataset list.
- **`Radar`**: Monostatic/bistatic Tx/Rx selection, 4-model 3D drone picker with GLB preview canvas, 6-DoF target parameters, OFDM grid & resolution derivations, CA-CFAR detector, Range–Doppler plots, and 3D projected labels.

## 6. Change and Acceptance Process

When adding or modifying UI controls or views:

1. Reuse `@astryxdesign/core` primitives and `workbench/src/ui/` wrappers rather than introducing one-off markup or imperative DOM builders.
2. Register any intentional host or inline-style exception in [`imperative-ui-exceptions.json`](imperative-ui-exceptions.json) and [`imperative-ui-exceptions.md`](imperative-ui-exceptions.md).
3. Keep [`component-manifest.json`](component-manifest.json) and [`dom-compatibility-contract.json`](dom-compatibility-contract.json) accurate if root boundaries, IDs, or command names change.
4. Run `npm --prefix workbench test`, Python contract tests (`tests/test_ui_contracts.py`, `tests/test_ui_components.py`), and Playwright accessibility/behavior specs (`tests/browser/`).
