# OpenAirTwin UI Interaction Contract

> Status: Phase 8 production contract. This document defines behavior semantics; per-control machine mappings are stored in the `interaction` fields of `dom-compatibility-contract.json`.

## 1. Command Rules

- Names use `<owner>.<subject>.<verb>`; one business action has exactly one name.
- Commands contain business intent and a minimal payload. They never carry HTMLElement, Event, or mutable global objects.
- Components emit commands; feature Controllers and services perform side effects; rendering follows the updated view model.
- Asynchronous commands define idle, busy, success, empty, cancelled, error, retry, and stale-response behavior.
- While busy, submit buttons are disabled with `aria-busy=true`. A failure restores operability and enters the existing visible error path.
- Feature switching cancels Live Preview, stops Tx Orbit, and clears picking and transient UI. A feature must never show another feature's results.

### 1.1 Phase 6 Control Command Envelope

The React control boundary emits only these typed base commands. App and feature runtimes route them to the domain commands in this document; they do not replace domain semantics:

| Command | Payload | Commit timing |
| --- | --- | --- |
| `workbench.control.draft` | `{controlId, value}` | Native `input` for number and text fields; preserves controlled value and focus only |
| `workbench.control.commit` | `{controlId, value, checked?}` | Blur or native `change` for number and text; `change` for select, checkbox, and radio |
| `workbench.control.action` | `{actionId, value?}` | Button, dynamic ListCard, and device action activation |
| `workbench.control.group.toggle` | `{controlId, open}` | Native `toggle` for details elements with IDs |

Checked updates for one radio `name` must be atomic within a snapshot. Solver button busy state is deduplicated by `actionId`; duplicate submission is a no-op, and both success and failure must clear disabled and `aria-busy`. A Controller may read HTMLElement values through registered stable references for domain parsing and Viewer synchronization, but it may not bind click or change listeners to React-owned fields or buttons.

## 2. Shell and Entry Commands

One `app-shell` CommandBus emits the following commands. The Shell no longer registers scattered listeners directly on buttons, checkboxes, mode controls, or dynamic place results. Leaflet, Three.js, and feature adapters perform the domain side effects.

| Command family | Trigger | Behavior and focus contract |
| --- | --- | --- |
| `workbench.mode.select` | Mode button click or keyboard activation | Closes the menu and tooltip, clears transient state, and switches through Registry lifecycle; focus stays on the active button; consecutive clicks remain synchronously observable in trigger order |
| `workbench.mode.toggle` | Details/summary click, Enter, or Space | Keeps `open` and `aria-expanded` synchronized; outside click and Escape close it |
| `workbench.controls.toggle` | Panel-toggle click | Preserves scroll container and expanded parameter-group state; hides the tooltip |
| `entry.sidebar.toggle` | Icon-button click | After expansion, moves focus to search after 120 ms; after collapse, keeps focus on the button |
| `entry.search.submit` | Search click or input Enter | Shift+Enter does not submit; search failure shows the existing state and retains current selection |
| `entry.place.select` | Dynamic result-button click or keyboard activation | Updates map focus and selection without bypassing the tile contract |
| `entry.map.fit/focusSelection/zoomIn/zoomOut/panZoom` | Map button, pointer, wheel, or keyboard | Leaflet retains one map instance; focusSelection is a no-op when there is no selection |
| `entry.tile.select/toggle` | Map tile or list checkbox | Map and list share one selection source and stable tile ordering |
| `entry.scene.enter` | Primary-button click | Clears picking and enters busy state; success opens the Viewer; failure restores state and opens the error dialog |
| `entry.scene.open/return` | Quick bar or return button | Switches between Entry and Scene without rebuilding the loaded Viewer |
| `results.dock.toggle` | Result-header click or keyboard activation | Preserves expanded state, reserve space, internal scrolling, and result selection |
| `performance.*` | Dock, mode, checkbox, category button, or dynamic category checkbox | Synchronizes Viewer mode; `performance.category.toggle` updates only the corresponding scene category and does not change feature state or results |
| `dialog.*` | Primary, secondary, close, backdrop, or Escape | Preserves focus trap and returns focus to the opener; asynchronous actions cannot submit twice |
| `loading.cancel` | Cancel click | Cancels only the current cancellable operation and clears busy and progress state before hiding |
| `parameter.tooltip.inspect` | Parameter hover, focus, or Escape | Hover and focus reveal the same information; pointer leave, blur, Escape, scroll, or resize closes without moving focus |

## 3. Shared Solver and Viewer Commands

| Command | Input | Contract |
| --- | --- | --- |
| `solver.configuration.update` | `{controlId, value}` | Publishes the corresponding setting, invalidates relevant results, and redraws while preserving current parsing and defaults |
| `device.position.update` | `{targetId, axis, value}` | Updates a device position for the active feature only |
| `<feature>.device.pickTx/pickRx` | Picking button or Canvas pointer | A second trigger disables picking; Escape cancels; success synchronizes precision fields and the scene |
| `viewer.device.pick` | Canvas pointerdown and pointerup | Does not pick after exceeding the drag threshold; Pointer Capture must be released |
| `viewer.camera.navigate` | Pointer, wheel, or keyboard | Modifies Camera or Controls only; it must not emit field or result commands |
| `viewer.txOrbit.toggle` | Orbit button | Preserves pressed and active state; feature switch, picking, or Escape stops orbit |
| `workbench.group.toggle` | Details/summary | Preserves native keyboard semantics; unrelated rendering does not reset expansion |
| `workbench.transient.dismiss` | Outside click or Escape | Closes the mode menu, tooltip, and feature transient UI without cancelling a submitted job |

## 4. Feature Commands

| Feature | Configuration commands | Run and result commands |
| --- | --- | --- |
| Link | `link.configuration.update`, `link.configuration.syncDerived` | `link.solve.run`, `link.path.select` |
| Mobility | `mobility.configuration.update`, `mobility.waypoint.addCurrentRx/select/remove/deleteSelected/clear` | `mobility.solve.run`, `mobility.playback.toggle/speed.change`, `mobility.timeline.seek/metric.change/inspect` |
| Radio Map | `radiomap.configuration.update` | `radiomap.solve.run`; the feature palette owns the domain colormap |
| DeepMIMO | `deepmimo.configuration.update`, `deepmimo.roi.pick/clear` | `deepmimo.export.run`, `deepmimo.datasets.toggle`, `deepmimo.dataset.cancel/download` |
| Radar | `radar.configuration.update`, `radar.asset.previous/next`, `radar.target.add/select/pick/focus/remove` | `radar.solve.run`, `radar.job.cancel/retry`, `radar.processing.select`, `radar.rangeDoppler.scope.select/select`, `radar.detections.filter/toggleAll/select`, `radar.truth.select`, `radar.path.select`, `radar.paths.displayMode.change` |

## 5. Pointer, Keyboard, and Focus

- Native button, input, select, details, and summary behavior is the minimum contract; components may not simulate them with div elements.
- Tab order follows the frozen DOM order; hidden subtrees cannot receive focus.
- Enter and Space activate buttons and summary elements. Arrow keys retain native radio, range, and select behavior.
- Escape priority is current Dialog, Tooltip, Mode, or feature transient; then Picking or precision edit; then Viewer movement.
- Hover-only information must also be available through focus, and tooltip closure must not move focus.
- A selected dynamic ListCard retains a clear selected state. List refresh should restore focus for the same business ID when possible.

## 6. Asynchronous Operations, Cancellation, and Retry

1. Submission records the feature, scene generation, and request identity. An older response may not overwrite newer state.
2. Busy state prevents duplicate submission while Cancel and permitted navigation remain available.
3. Cancel enters an explicit terminal state and stops polling; it must not masquerade as an error.
4. Retry submits the current form snapshot and does not reuse an invalidated request object.
5. A job may continue or cancel during feature switch according to existing domain rules, but its callbacks may update only owner state.
6. Every timer, listener, subscription, and pending animation is released by `dispose()`.

## 7. Machine Coverage

Browser tests generate a contract for 363 elements with IDs from the real page. Every button, input, select, textarea, details, and summary element must have a named `interaction.command`. Dynamic lists, Leaflet, Canvas, Viewer, and global-dismiss actions are registered in `dynamicInteractions`. Contract generation fails when a new interactive control has no command.
