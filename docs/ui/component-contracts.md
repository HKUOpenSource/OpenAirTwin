# OpenAirTwin UI Component Contract

> Status: Phase 8 production contract; the workbench is owned by one React `app-shell` root
>
> Scope: Core desktop workbench at `1280x720` and larger
>
> Visual reference: `1440x900`; this contract authorizes no visual changes

## 1. Contract Rules

1. A DOM subtree has exactly one rendering owner. Shared components, feature components, and imperative engines may not mutate the same subtree.
2. Shared components accept semantic properties and stable `id` values only. They may not accept arbitrary colors, spacing, radii, shadows, or z-index values.
3. Components render view models and emit commands. They do not read global state, call REST endpoints, or access sibling feature DOM.
4. The [DOM compatibility contract](dom-compatibility-contract.json) freezes IDs, element semantics, labels, order, ARIA, keyboard behavior, and focus behavior.
5. Shared CSS classes and `--oat-*` tokens own component geometry. Feature CSS may express domain-specific structure only.
6. Every shared component covers default, hover, focus-visible, and disabled states. Interactive components cover active, pressed, busy, invalid, selected, and empty states when applicable.
7. Controlled field values come from feature snapshots and changes are submitted only through named commands. Rendering may not write values back to state.

## 2. Shared Component API

| Component | Required properties | Optional semantic properties | DOM and behavior contract | CSS owner |
| --- | --- | --- | --- | --- |
| `Button` | `id`, `label`, `command` | `variant=default|primary|danger`, `size=default|compact`, `busy`, `disabled`, `pressed`, `icon` | Native `button[type=button]`; busy is disabled with `aria-busy=true`; icons use `aria-hidden` | `components.css` |
| `IconButton` | `id`, `label`, `command`, `icon` | `pressed`, `disabled`, `danger` | Native button with an accessible name and stable square geometry | `components.css` |
| `ButtonGroup` | `label`, `children` | `orientation` | `role=group`; does not intercept child-button focus | `components.css` |
| `Field` | `id`, `label`, `control` | `unit`, `help`, `error`, `disabled`, `readOnly` | `label[for]` exactly matches the control ID; errors use `aria-describedby` and `aria-invalid` | `components.css` |
| `NumberField` | `id`, `label`, `value`, `command` | `min`, `max`, `step`, `unit`, `disabled`, `readOnly` | Native number input; preserves current parsing, commit, and invalidation timing | `components.css` |
| `TextField` | `id`, `label`, `value`, `command` | `placeholder`, `autocomplete`, `disabled`, `readOnly` | Native text input; an explicit command defines Enter behavior | `components.css` |
| `SelectField` | `id`, `label`, `value`, `options`, `command` | `disabled`, `help` | Native select; option order and values remain compatible | `components.css` |
| `UnitInput` | `field`, `unit` | `compact` | The unit is part of the field structure and never part of the input value | `components.css` |
| `Checkbox` | `id`, `label`, `checked`, `command` | `mixed`, `disabled` | Native checkbox; label click and Space retain browser behavior | `components.css` |
| `RadioGroup` | `name`, `label`, `value`, `options`, `command` | `disabled` | Fieldset and legend or equivalent group semantics; arrow-key behavior is preserved | `components.css` |
| `RangeInput` | `id`, `label`, `value`, `command` | `min`, `max`, `step`, `disabled` | Native range input; the `input` event commits in real time | `components.css` |
| `Panel` | `id`, `children` | `surface`, `hidden`, `ariaLabel` | Adds no unexpected wrapper that changes selectors or geometry; passes the ID through | `components.css` |
| `PanelHeader` | `title` | `subtitle`, `actions` | Title and action order remain stable; actions do not take over the title's accessible name | `components.css` |
| `CollapsibleGroup` | `id`, `summary`, `children` | `open`, `command` | Native details and summary; preserves Enter, Space, and toggle semantics | `components.css` |
| `ScrollRegion` | `id`, `children` | `label`, `tabIndex` | Preserves the internal scroll boundary, scroll position, and shared scrollbar | `components.css` |
| `Badge` / `StatusBadge` | `label`, `tone` | `live`, `busy` | Tone is limited to neutral, success, warning, and error; live status uses suitable live-region semantics | `components.css` |
| `Progress` | `value`, `label` | `max`, `indeterminate` | Native progress or equivalent progressbar; value and busy state remain synchronized | `components.css` |
| `MetricGrid` / `Metric` | `items` | `dense` | Stable label and value order; numeric updates do not change grid geometry | `components.css`, `results.css` |
| `ListCard` | `title`, `meta` | `detail`, `selected`, `command`, `tone` | Selectable cards use buttons; selection is accessible and not color-only | `components.css`, `results.css` |
| `EmptyState` | `message` | `action` | Does not nest another panel; loading text does not resize the container | `components.css`, `results.css` |
| `Dialog` | `id`, `title`, `open`, `actions` | `variant`, `detail`, `onDismiss` | Preserves focus trap, Escape, backdrop, and focus restoration after close | `shell.css` |
| `Tooltip` | `content`, `anchor` | `placement` | Available through hover and focus; closes on Escape, scroll, and resize; does not own business clicks | `shell.css` |
| `LoadingOverlay` | `title`, `message`, `progress` | `cancellable` | Modal busy state; cancel command is enabled only while cancellation is available | `shell.css` |
| `ChartFrame` | `id`, `title`, `host` | `legend`, `tooltip`, `empty`, `loading` | Canvas or SVG engine owns the host interior; ordinary component updates do not rebuild the engine | `results.css`, `radar.css` |

### 2.1 Phase 2 Native Class Mapping

[component-manifest.json](component-manifest.json) is the machine-readable authority for the native implementation, and `tools/ui-catalog/index.html` displays every public variant and state. Shared classes include:

- Structure: `oat-panel`, `oat-panel__header`, and `oat-panel__title`.
- Actions: `oat-button`, `oat-button-group`, and `--primary / --compact / --icon / --danger / --block / --toolbar`.
- Fields: `oat-field`, `oat-input`, `oat-input--compact`, and `oat-check`.
- Data: `oat-badge`, `oat-metric-grid`, `oat-list-card`, and `oat-empty-state`.
- Infrastructure: `oat-scroll-region` and `oat-icon`.

Phase 8 removed `.btn`, `.miniBtn`, `.miniSelect`, `.primary`, `.danger`, and the internal compatibility font class. Production UI may use only shared `oat-*` classes. Features may no longer define or duplicate core button, field, or list-card geometry.

### 2.2 Phase 8 React Implementation and Production Boundary

Typed React primitives live in `workbench/src/design-system/components/` and continue to emit the same `oat-*` classes from section 2.1. The machine manifest's `reactSource` is the sole React source location for each shared component. Features may not copy primitives or establish a barrel entry point.

React components observe these boundaries:

- `Button`, fields, Checkbox, and selectable ListCard emit only `UiCommand` objects and never accept or pass HTMLElement or Event objects.
- Field values come from props; input changes return the smallest payload through command factories.
- `AppProviders` injects only command dispatch and error reporting. It does not become a second feature-state source.
- Feature state exposes stable snapshots through `ObservableStateAdapter` and `useSyncExternalStore`.
- Roots mount only into empty containers and `ReactRootRegistry` owns unmount, cleanup, and focus restoration.
- Component exceptions render the shared error panel through an Error Boundary and enter the host error path through the root error hook.
- `className` is only for domain layout composition. Arbitrary inline styles and design values are prohibited.
- `component-manifest.json` declares `productionOwner` as `react`. The sole production root and boundary are both `app-shell`; the previous four production roots are retired.
- `ShellLayout` and `ControlSurface` are explicit JSX trees in one React root, composing the Control, Device, Result, and DeepMIMO Dataset subtrees. The production entry does not parse or inject HTML templates, and ordinary layout may not use portals.
- Leaflet, Three.js, and Canvas or SVG charts remain imperative adapters that own only the interior of stable React-provided hosts. Ordinary Shell or view-model updates may not replace `#view`, the map host, or chart hosts.
- `AppShell` lifecycle owns Shell document and window handlers, the performance interval, and named command routing. Features, the map, the Viewer, and Controllers must release their resources during page or feature disposal.
- `Filter` and `ChartFrame` live in `ResultData.tsx`; together with `MetricGrid`, `ListCard`, and `EmptyState`, they form the shared result-component set.
- The React result boundary accepts typed view models and emits frozen commands only. Chart adapters may write only inside registered SVG or Canvas hosts.
- `ControlledField` preserves native input and select IDs, names, defaults, min/max/step, commit timing, and browser keyboard semantics. Text and number inputs update their draft on `input` and commit on `blur` or compatible native `change`; checkboxes, radio controls, and selects commit immediately.
- `ControlCollections` is the sole DOM owner of Mobility waypoints and Radar targets. Feature runtimes handle only `workbench.control.*` commands and domain state; they do not create list nodes.
- `control-surface-model`, `result-dock-model`, `deepmimo-dataset-model`, and `shell-ui-model` provide the sole typed snapshots and APIs. Controllers may read registered stable native-field references for domain parsing, but may not create, replace, or bind ordinary React-owned UI descendants.

The development catalog renders native and React columns on one page to compare DOM state and computed styles item by item. Vite development service exposes the catalog; it is not part of the production entry or release bundle.

## 3. Workbench Composite Components

| Component | Current instance | Sole owner | Allowed composition |
| --- | --- | --- | --- |
| `ControlPanel` | `#ui` | `react:app-shell`; Controllers only read or synchronize registered references | PanelHeader, ModeSelector, ScrollRegion, FeaturePanel |
| `ModeSelector` | `#modeSelector` | `react:app-shell` | CollapsibleGroup, feature-mode buttons |
| `DeviceDock` / `DeviceCard` | `#deviceDock` and five mode device cards | `react:app-shell` | Field, IconButton, ButtonGroup |
| `ResultDock` | `#linkChannelSection` | `react:app-shell` | FeatureResult, ScrollRegion, PanelHeader |
| `PerformanceDock` | `#performanceDock` | `react:app-shell`; Viewer adapter performs domain side effects | Badge, MetricGrid, Checkbox, ButtonGroup |
| `EntryMap` | `#entryScreen` | `react:app-shell`; Leaflet adapter exclusively owns the interior of `#entryMap` | Search, map host, tile list, primary action |
| `AppDialog` | `#appDialog` | `react:app-shell`; Dialog Controller retains its queue and focus trap | Dialog |
| `ParameterTooltip` | `#paramTooltipLayer` | `react:app-shell`; Tooltip adapter owns runtime positioning | Tooltip |

## 4. Repeated Pattern Ownership

| Production pattern | Shared component owner | Current consumers |
| --- | --- | --- |
| Default, primary, compact, icon, and danger buttons | `Button` / `IconButton` | All five features, Entry, Dialog, Performance |
| Label plus input or select plus unit or help | `Field` and typed fields | All five features, shared Solver, device precision editing |
| Checkbox, radio, and range | `Checkbox` / `RadioGroup` / `RangeInput` | Link, Mobility, Radio Map, DeepMIMO, Radar, Performance |
| Collapsible parameter group | `CollapsibleGroup` | Shared Solver, Radar Geometry, Targets, Waveform, CFAR, Propagation |
| Status badge and progress | `StatusBadge` / `Progress` | Loading, Live Preview, Radar Job, DeepMIMO Dataset |
| Metric grid | `MetricGrid` | Link, Mobility, Radio Map, Radar, Performance |
| Selectable result row | `ListCard` | Link paths, Mobility waypoints, DeepMIMO datasets, Radar targets, detections, truth, and paths |
| Empty, loading, failed, cancelled, and retry states | `EmptyState` plus Status and Button | Every asynchronous feature and result region |
| Chart shell, legend, and tooltip | `ChartFrame` / `Legend` / `ChartTooltip` | Link taps, Mobility timeline, Radio Map colorbar, Radar charts |
| Panel and scroll boundary | `Panel` / `ScrollRegion` | Control, Result, Device, Performance, Dialog, Dataset panels |

## 5. Feature-Specific Components

The following patterns must not be merged merely because they look similar. Their domain semantics remain feature-owned:

- Link: path selection and CIR or tap-detail view models.
- Mobility: waypoint editing, timeline playback state, and trajectory-sampling view models.
- Radio Map: grid and mesh statistics, domain colormap, and scale range.
- DeepMIMO: ROI, receiver-count estimation, Dataset Job, and download lifecycle.
- Radar: target and asset editors, waveform, CFAR, Range-Doppler, detection/truth/path association, and the 3D label layer.

Feature-specific components must still compose shared Button, Field, Badge, Metric, ListCard, ScrollRegion, and ChartFrame components. They may not duplicate shared core geometry or state styling.

## 6. Change and Acceptance Process

Before adding UI, update the machine-readable component manifest and native component catalog. Then register either the shared component or the reason for feature-specific ownership in this file, and register its command in the [interaction contract](interaction-contracts.md). An unowned ID, unnamed user operation, cross-owner DOM mutation, unregistered inline style, or unexplained duplicate component blocks acceptance.
