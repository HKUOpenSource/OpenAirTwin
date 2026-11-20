import "../styles/workbench.css";

import {
  createDeepMimoDatasetModel,
  type DeepMimoDatasetApi,
} from "../features/deepmimo/deepmimo-dataset-model.ts";
import {
  createResultDockModel,
  type ResultDockApi,
} from "../features/results/result-dock-model.ts";
import type { RootErrorReporter } from "../runtime/error-reporting.ts";
import {
  createImperativeHostRegistry,
  type ImperativeHostRegistry,
} from "../runtime/host-registry.ts";
import { reactRootRegistry } from "../runtime/root-registry.tsx";
import { CommandBus, type AnyUiCommand } from "../runtime/ui-command.ts";
import {
  createControlsStore,
  createShellStore,
  type ControlsStoreController,
  type ShellStoreController,
  type WorkbenchFeatureId,
} from "../runtime/workbench-store.ts";
import { AppShell } from "./AppShell.tsx";

export type AppShellCommandHandler = (
  command: AnyUiCommand,
) => void | Promise<void>;

export interface AppShellRuntime {
  readonly shell: ShellStoreController;
  readonly controls: ControlsStoreController;
  readonly datasets: DeepMimoDatasetApi;
  readonly results: ResultDockApi;
  readonly hosts: ImperativeHostRegistry;
  readonly element: (id: string) => HTMLElement;
  readonly setCommandHandler: (handler: AppShellCommandHandler | null) => void;
  readonly setDatasetToggleHandler: (handler: (() => void) | null) => void;
  readonly dispose: () => void;
}

const SHELL_AND_CONTROL_COMMANDS = new Set([
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
  "entry.search.query",
  "entry.search.submit",
  "entry.sidebar.toggle",
  "entry.tile.toggle",
  "loading.cancel",
  "performance.categories.hideHeavy",
  "performance.categories.showAll",
  "performance.category.toggle",
  "performance.lightMaterials.toggle",
  "performance.mode.select",
  "performance.tick",
  "results.dock.toggle",
  "viewer.precision.escape",
  "workbench.control.action",
  "workbench.control.group.toggle",
  "workbench.control.update",
  "workbench.controls.toggle",
  "workbench.device.coord",
  "workbench.mode.select",
  "workbench.resize",
  "workbench.transient.dismiss",
]);

function resolveResultOwner(container: ParentNode): Element {
  const element = container.querySelector(
    '[data-oat-react-owner="result-dock"]',
  );
  if (!element) throw new Error("Result dock host is missing");
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
  const hosts = createImperativeHostRegistry();
  const shellStore = createShellStore(activeMode);
  const controlsStore = createControlsStore(activeMode);
  let commandHandler: AppShellCommandHandler | null = null;
  let datasetToggleHandler: (() => void) | null = null;

  const results = createResultDockModel({
    commandBus,
    resolveContainer: () => resolveResultOwner(container),
  });
  const datasets = createDeepMimoDatasetModel({
    commandBus,
    onToggle: () => datasetToggleHandler?.(),
  });

  const unsubscribes = [...SHELL_AND_CONTROL_COMMANDS].map((commandName) =>
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
        shellStore={shellStore}
        controlsStore={controlsStore}
        datasetModel={datasets}
        resultModel={results}
        hosts={hosts}
      />
    ),
    commandBus,
    reportError,
    synchronous: true,
  });

  root.registerCleanup(() => {
    commandHandler = null;
    datasetToggleHandler = null;
    for (const unsubscribe of unsubscribes) unsubscribe();
    datasets.dispose();
    results.dispose();
    controlsStore.dispose();
    shellStore.dispose();
    hosts.clear();
    commandBus.dispose();
  });

  return {
    shell: shellStore,
    controls: controlsStore,
    datasets,
    results,
    hosts,
    element(id) {
      const element = container.querySelector<HTMLElement>(`#${id}`);
      if (!element) throw new Error(`AppShell element is missing: ${id}`);
      return element;
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
