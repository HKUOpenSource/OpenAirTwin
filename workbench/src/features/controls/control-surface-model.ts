import { flushSync } from "react-dom";
import { ObservableStateAdapter } from "../../runtime/observable-state.ts";
import { CommandBus, type AnyUiCommand } from "../../runtime/ui-command.ts";
import type {
  ControlFieldPatch,
  ControlFieldViewModel,
  ControlNodeViewModel,
  MobilityWaypointViewModel,
  RadarTargetControlViewModel,
  WorkbenchControlCommand,
  WorkbenchControlsSnapshot,
  WorkbenchFeatureId,
} from "./contracts.ts";

export type WorkbenchControlCommandHandler = (
  command: WorkbenchControlCommand,
) => void | Promise<void>;

export interface ControlSurfaceApi {
  readonly element: (id: string) => HTMLElement;
  readonly elements: (selector: string) => readonly HTMLElement[];
  readonly syncFromAdapters: (activeMode?: WorkbenchFeatureId) => void;
  readonly setActionBusy: (id: string, busy: boolean) => void;
  readonly updateMobilityWaypoints: (
    items: readonly MobilityWaypointViewModel[],
  ) => void;
  readonly updateRadarTargets: (
    targets: readonly RadarTargetControlViewModel[],
    countLabel: string,
  ) => void;
  readonly updateSelectOptions: (
    id: string,
    options: readonly { readonly label: string; readonly value: string }[],
    selectedValue: string,
  ) => void;
  readonly updateFields: (patches: readonly ControlFieldPatch[]) => void;
  readonly setCommandHandler: (
    handler: WorkbenchControlCommandHandler | null,
  ) => void;
  readonly dispose: () => void;
}

export interface ControlSurfaceModel extends ControlSurfaceApi {
  readonly commandBus: CommandBus;
  readonly store: ObservableStateAdapter<WorkbenchControlsSnapshot>;
  readonly initializeFromRenderedSurface: () => void;
}

const mutableAttributeNames = new Set([
  "aria-busy",
  "aria-hidden",
  "aria-pressed",
  "aria-selected",
  "data-state",
  "data-status",
  "title",
]);

function captureField(
  element: HTMLInputElement | HTMLSelectElement,
): ControlFieldViewModel {
  if (element instanceof HTMLSelectElement) {
    const defaultSelectedValue =
      [...element.options].find((option) => option.defaultSelected)?.value ??
      element.options[0]?.value ??
      "";
    return {
      kind: "select",
      value: element.value,
      defaultValue: defaultSelectedValue,
      defaultSelectedValue,
      separateOptions: [...element.childNodes].some(
        (node) => node.nodeType === Node.TEXT_NODE && Boolean(node.textContent),
      ),
      disabled: element.disabled,
      options: [...element.options].map((option) => ({
        label: option.textContent,
        value: option.value,
        disabled: option.disabled,
      })),
    };
  }
  const kind =
    element.type === "checkbox" || element.type === "radio"
      ? element.type
      : element.type === "hidden"
        ? "hidden"
        : element.type === "text"
          ? "text"
          : "number";
  return {
    kind,
    ...(element.name ? { name: element.name } : {}),
    value: element.value,
    defaultValue: element.defaultValue,
    checked: element.checked,
    defaultChecked: element.defaultChecked,
    disabled: element.disabled,
    readOnly: element.readOnly,
    ...(element.min ? { min: element.min } : {}),
    ...(element.max ? { max: element.max } : {}),
    ...(element.step ? { step: element.step } : {}),
    ...(element.placeholder ? { placeholder: element.placeholder } : {}),
  };
}

function captureNode(element: HTMLElement): ControlNodeViewModel {
  const attributes: Record<string, string> = {};
  for (const name of mutableAttributeNames) {
    const value = element.getAttribute(name);
    if (value !== null) attributes[name] = value;
  }
  const childElements = element.children.length > 0;
  return {
    className: element.className,
    attributes,
    ...(!childElements ? { text: element.textContent } : {}),
    ...(element instanceof HTMLButtonElement
      ? { disabled: element.disabled }
      : {}),
    ...(element instanceof HTMLDetailsElement ? { open: element.open } : {}),
    ...(element instanceof HTMLProgressElement
      ? { progressValue: element.value }
      : {}),
  };
}

function captureSnapshot(
  containers: readonly Element[],
  activeMode: WorkbenchFeatureId,
  previous?: WorkbenchControlsSnapshot,
): WorkbenchControlsSnapshot {
  const fields: Record<string, ControlFieldViewModel> = {};
  const nodes: Record<string, ControlNodeViewModel> = {};
  for (const container of containers) {
    for (const element of container.querySelectorAll<HTMLElement>("[id]")) {
      nodes[element.id] = captureNode(element);
      if (
        element instanceof HTMLInputElement ||
        element instanceof HTMLSelectElement
      ) {
        const captured = captureField(element);
        const previousField = previous?.fields[element.id];
        fields[element.id] = previousField
          ? {
              ...captured,
              defaultValue: previousField.defaultValue,
              ...(previousField.defaultChecked === undefined
                ? {}
                : { defaultChecked: previousField.defaultChecked }),
              ...(previousField.defaultSelectedValue === undefined
                ? {}
                : {
                    defaultSelectedValue: previousField.defaultSelectedValue,
                  }),
            }
          : captured;
      }
    }
  }
  return createEmptySnapshot(activeMode, previous, fields, nodes);
}

function createEmptySnapshot(
  activeMode: WorkbenchFeatureId,
  previous?: WorkbenchControlsSnapshot,
  fields: Record<string, ControlFieldViewModel> = {},
  nodes: Record<string, ControlNodeViewModel> = {},
): WorkbenchControlsSnapshot {
  return {
    activeMode,
    fields,
    nodes,
    mobilityWaypoints: previous?.mobilityWaypoints ?? [],
    mobilityEstimate: previous?.mobilityEstimate ?? "--",
    deepMimoReceiverEstimate: previous?.deepMimoReceiverEstimate ?? "--",
    deviceDock: previous?.deviceDock ?? {
      visible: false,
      precisionVisible: false,
      precisionTitle: "Tx",
      activeTarget: null,
      pickTarget: null,
      clearanceVisible: false,
      hint: "Click a surface point or adjust coordinates.",
      actions: {},
    },
    radarJob: previous?.radarJob ?? {
      visible: false,
      status: "idle",
      statusLabel: "READY",
      message: "Ready",
      progress: 0,
      cancelVisible: false,
      retryVisible: false,
    },
    radarAssetPicker: previous?.radarAssetPicker ?? {
      state: "loading",
      status: "Loading drone models…",
      name: "Loading…",
      count: "0 / 0",
      addDisabled: true,
      navigationDisabled: true,
    },
    radarTargets: previous?.radarTargets ?? [],
    radarTargetCount: previous?.radarTargetCount ?? "0 / 16",
    radarTargetEditor: previous?.radarTargetEditor ?? {
      empty: true,
      title: "Target",
      assetName: "--",
      velocityPreview: "Velocity [0.0, 0.0, 0.0] m/s",
      controlsDisabled: true,
    },
    radarModeHint:
      previous?.radarModeHint ?? "Tx and Rx are placed independently.",
    radarRangeResolution: previous?.radarRangeResolution ?? "--",
    radarDopplerResolution: previous?.radarDopplerResolution ?? "--",
    radarVelocityResolution: previous?.radarVelocityResolution ?? "--",
    radarInputError: previous?.radarInputError ?? "",
  };
}

function patchCommandSnapshot(
  current: WorkbenchControlsSnapshot,
  command: WorkbenchControlCommand,
): WorkbenchControlsSnapshot {
  if (command.name === "workbench.control.group.toggle") {
    const { controlId, open } = command.payload;
    const node = current.nodes[controlId];
    if (!node) return current;
    return {
      ...current,
      nodes: { ...current.nodes, [controlId]: { ...node, open } },
    };
  }
  if (
    command.name === "workbench.control.draft" ||
    command.name === "workbench.control.commit"
  ) {
    const { controlId, value, checked } = command.payload;
    const field = current.fields[controlId];
    if (!field) return current;
    const nextFields = { ...current.fields };
    if (field.kind === "radio" && checked && field.name) {
      for (const [id, candidate] of Object.entries(nextFields)) {
        if (
          id !== controlId &&
          candidate.kind === "radio" &&
          candidate.name === field.name
        ) {
          nextFields[id] = { ...candidate, checked: false };
        }
      }
    }
    nextFields[controlId] = {
      ...field,
      value,
      ...(checked === undefined ? {} : { checked }),
    };
    return {
      ...current,
      fields: nextFields,
    };
  }
  return current;
}

function patchActionBusy(
  current: WorkbenchControlsSnapshot,
  id: string,
  busy: boolean,
): WorkbenchControlsSnapshot {
  const node = current.nodes[id];
  if (!node) throw new Error(`Control action is missing: ${id}`);
  const classes = new Set(node.className.split(/\s+/).filter(Boolean));
  if (busy) classes.add("busy");
  else classes.delete("busy");
  const attributes = { ...node.attributes };
  if (busy) attributes["aria-busy"] = "true";
  else delete attributes["aria-busy"];
  return {
    ...current,
    nodes: {
      ...current.nodes,
      [id]: {
        ...node,
        className: [...classes].join(" "),
        attributes,
        disabled: busy,
      },
    },
  };
}

export function createControlSurfaceModel({
  activeMode = "link",
  commandBus: providedCommandBus,
  resolveContainers,
}: {
  readonly activeMode?: WorkbenchFeatureId;
  readonly commandBus?: CommandBus;
  readonly resolveContainers: () => readonly Element[];
}): ControlSurfaceModel {
  const containers = resolveContainers;
  let snapshot = createEmptySnapshot(activeMode);
  let commandHandler: WorkbenchControlCommandHandler | null = null;
  const busyActionIds = new Set<string>();

  const store = new ObservableStateAdapter(() => snapshot);
  const publish = () => {
    flushSync(() => {
      store.refresh();
    });
  };
  const enforceBusyActions = (current: WorkbenchControlsSnapshot) => {
    let next = current;
    for (const id of busyActionIds) next = patchActionBusy(next, id, true);
    return next;
  };
  const publishCapturedSnapshot = (captured: WorkbenchControlsSnapshot) => {
    snapshot = captured;
    publish();
    if (busyActionIds.size === 0) return;
    snapshot = enforceBusyActions(snapshot);
    publish();
  };
  const commandBus = providedCommandBus ?? new CommandBus();
  const ownsCommandBus = providedCommandBus === undefined;
  const unsubscribe = commandBus.subscribe(
    "*",
    async (command: AnyUiCommand) => {
      if (!command.name.startsWith("workbench.control.")) return;
      const typedCommand = command as WorkbenchControlCommand;
      snapshot = patchCommandSnapshot(snapshot, typedCommand);
      publish();
      await commandHandler?.(typedCommand);
      publishCapturedSnapshot(
        captureSnapshot(containers(), snapshot.activeMode, snapshot),
      );
    },
  );
  let disposed = false;

  return {
    commandBus,
    store,
    initializeFromRenderedSurface() {
      publishCapturedSnapshot(
        captureSnapshot(containers(), snapshot.activeMode, snapshot),
      );
    },
    element(id) {
      for (const container of containers()) {
        const element = container.querySelector<HTMLElement>(`#${id}`);
        if (element) return element;
      }
      throw new Error(`Control surface element is missing: ${id}`);
    },
    elements(selector) {
      return containers().flatMap((container) => [
        ...container.querySelectorAll<HTMLElement>(selector),
      ]);
    },
    syncFromAdapters(nextMode = snapshot.activeMode) {
      publishCapturedSnapshot(
        captureSnapshot(containers(), nextMode, snapshot),
      );
    },
    setActionBusy(id, busy) {
      if (busy) busyActionIds.add(id);
      else busyActionIds.delete(id);
      snapshot = patchActionBusy(snapshot, id, busy);
      publish();
    },
    updateMobilityWaypoints(items) {
      snapshot = { ...snapshot, mobilityWaypoints: [...items] };
      publish();
    },
    updateRadarTargets(targets, countLabel) {
      snapshot = {
        ...snapshot,
        radarTargets: [...targets],
        radarTargetCount: countLabel,
      };
      publish();
    },
    updateSelectOptions(id, options, selectedValue) {
      const field = snapshot.fields[id];
      if (!field || field.kind !== "select") {
        throw new Error(`Control select is missing: ${id}`);
      }
      snapshot = {
        ...snapshot,
        fields: {
          ...snapshot.fields,
          [id]: {
            ...field,
            value: selectedValue,
            defaultValue: selectedValue,
            defaultSelectedValue: selectedValue,
            separateOptions: false,
            options: options.map((option) => ({ ...option })),
          },
        },
      };
      publish();
    },
    updateFields(patches) {
      const fields = { ...snapshot.fields };
      for (const { id, ...patch } of patches) {
        const field = fields[id];
        if (!field) throw new Error(`Control field is missing: ${id}`);
        fields[id] = { ...field, ...patch };
      }
      snapshot = { ...snapshot, fields };
      publish();
    },
    setCommandHandler(handler) {
      commandHandler = handler;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      commandHandler = null;
      busyActionIds.clear();
      unsubscribe();
      if (ownsCommandBus) commandBus.dispose();
      store.dispose();
    },
  };
}
