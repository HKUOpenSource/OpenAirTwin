import { AppShell } from "./AppShell.tsx";
import {
  createControlSurfaceModel,
  type ControlSurfaceApi,
} from "../features/controls/control-surface-model.ts";
import {
  createDeepMimoDatasetModel,
  type DeepMimoDatasetApi,
} from "../features/deepmimo/deepmimo-dataset-model.ts";
import {
  createResultDockModel,
  type ResultDockApi,
} from "../features/results/result-dock-model.ts";
import type { WorkbenchFeatureId } from "../features/controls/contracts.ts";
import type { RootErrorReporter } from "../runtime/error-reporting.ts";
import { reactRootRegistry } from "../runtime/root-registry.tsx";
import { CommandBus, type AnyUiCommand } from "../runtime/ui-command.ts";
import { createShellUiModel, type ShellUiModel } from "./shell-ui-model.ts";

export type AppShellCommandHandler = (
  command: AnyUiCommand,
) => void | Promise<void>;

export interface AppShellRuntime {
  readonly controls: ControlSurfaceApi;
  readonly datasets: DeepMimoDatasetApi;
  readonly results: ResultDockApi;
  readonly shell: ShellUiModel;
  readonly element: (id: string) => HTMLElement;
  readonly elements: (selector: string) => readonly HTMLElement[];
  readonly setCommandHandler: (handler: AppShellCommandHandler | null) => void;
  readonly setDatasetToggleHandler: (handler: (() => void) | null) => void;
  readonly dispose: () => void;
}

const shellCommandNames = new Set([
  "dialog.close",
  "dialog.primary",
  "dialog.secondary",
  "entry.map.fit",
  "entry.map.focusSelection",
  "entry.map.pointerLeave",
  "entry.map.zoomIn",
  "entry.map.zoomOut",
  "entry.place.select",
  "entry.scene.enter",
  "entry.scene.open",
  "entry.scene.return",
  "entry.search.submit",
  "entry.sidebar.toggle",
  "entry.tile.toggle",
  "loading.cancel",
  "performance.categories.hideHeavy",
  "performance.categories.showAll",
  "performance.category.toggle",
  "performance.dock.toggle",
  "performance.lightMaterials.toggle",
  "performance.mode.select",
  "performance.tick",
  "results.dock.toggle",
  "viewer.precision.escape",
  "workbench.controls.toggle",
  "workbench.mode.select",
  "workbench.mode.toggle",
  "workbench.resize",
  "workbench.transient.dismiss",
]);

function owner(container: ParentNode, name: string): Element {
  const element = container.querySelector(`[data-oat-react-owner="${name}"]`);
  if (!element) throw new Error(`AppShell owner is missing: ${name}`);
  return element;
}

export function mountAppShell({
  activeMode,
  container,
  reportError,
}: {
  readonly activeMode: WorkbenchFeatureId;
  readonly container: HTMLElement;
  readonly reportError: RootErrorReporter;
}): AppShellRuntime {
  const commandBus = new CommandBus();
  const shellModel = createShellUiModel();
  let commandHandler: AppShellCommandHandler | null = null;
  let datasetToggleHandler: (() => void) | null = null;
  const resolveOwner = (name: string) => owner(container, name);
  const controls = createControlSurfaceModel({
    activeMode,
    commandBus,
    resolveContainers: () => [
      resolveOwner("control-form"),
      resolveOwner("device-dock"),
    ],
  });
  const results = createResultDockModel({
    commandBus,
    resolveContainer: () => resolveOwner("result-dock"),
  });
  const datasets = createDeepMimoDatasetModel({
    commandBus,
    onToggle: () => datasetToggleHandler?.(),
  });
  // Exact subscriptions run before feature-wide wildcard adapters. This keeps
  // shell state, especially mode selection, observable before click() returns.
  const unsubscribeShellCommands = [...shellCommandNames].map((commandName) =>
    commandBus.subscribe(commandName, (nextCommand) =>
      commandHandler?.(nextCommand),
    ),
  );
  container.replaceChildren();
  const root = reactRootRegistry.mount({
    id: "app-shell",
    container,
    children: (
      <AppShell
        controlModel={controls}
        datasetModel={datasets}
        resultModel={results}
        shellModel={shellModel}
      />
    ),
    commandBus,
    reportError,
    synchronous: true,
  });
  controls.initializeFromRenderedSurface();
  root.registerCleanup(() => {
    commandHandler = null;
    datasetToggleHandler = null;
    for (const unsubscribe of unsubscribeShellCommands) unsubscribe();
    datasets.dispose();
    results.dispose();
    controls.dispose();
    shellModel.dispose();
    commandBus.dispose();
  });

  return {
    controls,
    datasets,
    results,
    shell: shellModel,
    element(id) {
      const element = container.querySelector<HTMLElement>(`#${id}`);
      if (!element) throw new Error(`AppShell element is missing: ${id}`);
      return element;
    },
    elements(selector) {
      return [...container.querySelectorAll<HTMLElement>(selector)];
    },
    setCommandHandler(handler) {
      commandHandler = handler;
    },
    setDatasetToggleHandler(handler) {
      datasetToggleHandler = handler;
    },
    dispose() {
      root.unmount();
    },
  };
}
