import { DeepMimoDatasetTray } from "./DeepMimoDatasetTray.tsx";
import type { DeepMimoDatasetTrayViewModel } from "./contracts.ts";
import { ObservableStateAdapter } from "../../runtime/observable-state.ts";
import { reactRootRegistry } from "../../runtime/root-registry.tsx";
import { CommandBus } from "../../runtime/ui-command.ts";
import type { RootErrorReporter } from "../../runtime/error-reporting.ts";

export interface DeepMimoDatasetBridge {
  readonly update: (model: DeepMimoDatasetTrayViewModel) => void;
  readonly dispose: () => void;
}

const defaultReporter: RootErrorReporter = ({ rootId, error }) => {
  console.error(`[${rootId}]`, error);
};

export function createDeepMimoDatasetBridge({
  container,
  onToggle,
  reportError = defaultReporter,
}: {
  readonly container: Element;
  readonly onToggle: () => void;
  readonly reportError?: RootErrorReporter;
}): DeepMimoDatasetBridge {
  let model: DeepMimoDatasetTrayViewModel = {
    visible: false,
    expanded: false,
    datasets: [],
  };
  const store = new ObservableStateAdapter(() => model);
  const commandBus = new CommandBus();
  const unsubscribe = commandBus.subscribe(
    "deepmimo.datasets.toggle",
    onToggle,
  );
  const root = reactRootRegistry.mount({
    id: "deepmimo-dataset-tray",
    container,
    children: <DeepMimoDatasetTray store={store} />,
    commandBus,
    reportError,
    synchronous: true,
  });
  root.registerCleanup(unsubscribe);
  root.registerCleanup(() => {
    commandBus.dispose();
  });
  root.registerCleanup(() => {
    store.dispose();
  });
  return {
    update(nextModel) {
      model = nextModel;
      store.refresh();
    },
    dispose() {
      root.unmount();
    },
  };
}
