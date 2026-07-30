import { ResultDockContent } from "./ResultDockContent.tsx";
import {
  createInitialResultDockSnapshot,
  type ResultDockSnapshot,
  type ResultFeatureId,
} from "./contracts.ts";
import { ObservableStateAdapter } from "../../runtime/observable-state.ts";
import { reactRootRegistry } from "../../runtime/root-registry.tsx";
import { CommandBus, type AnyUiCommand } from "../../runtime/ui-command.ts";
import type { RootErrorReporter } from "../../runtime/error-reporting.ts";

export type ResultCommandHandler = (
  command: AnyUiCommand,
) => void | Promise<void>;

export interface ResultDockBridgeOptions {
  readonly container: Element;
  readonly reportError?: RootErrorReporter;
}

export interface ResultDockBridge {
  readonly update: <TFeature extends ResultFeatureId>(
    featureId: TFeature,
    model: ResultDockSnapshot[TFeature],
    activeMode: ResultFeatureId | null,
  ) => void;
  readonly registerCommandHandler: (
    featureId: ResultFeatureId,
    handler: ResultCommandHandler,
  ) => () => void;
  readonly element: (id: string) => HTMLElement;
  readonly dispose: () => void;
}

const defaultReporter: RootErrorReporter = ({ rootId, error }) => {
  console.error(`[${rootId}]`, error);
};

export function createResultDockBridge({
  container,
  reportError = defaultReporter,
}: ResultDockBridgeOptions): ResultDockBridge {
  let snapshot = createInitialResultDockSnapshot();
  const handlers = new Map<ResultFeatureId, ResultCommandHandler>();
  const store = new ObservableStateAdapter(() => snapshot);
  const commandBus = new CommandBus();
  const unsubscribe = commandBus.subscribe("*", async (command) => {
    const featureId = command.featureId as ResultFeatureId | undefined;
    if (!featureId) return;
    await handlers.get(featureId)?.(command);
  });
  const root = reactRootRegistry.mount({
    id: "result-dock-content",
    container,
    children: <ResultDockContent store={store} />,
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
    update(featureId, model, activeMode) {
      snapshot = { ...snapshot, [featureId]: model, activeMode };
      store.refresh();
    },
    registerCommandHandler(featureId, handler) {
      handlers.set(featureId, handler);
      return () => {
        if (handlers.get(featureId) === handler) handlers.delete(featureId);
      };
    },
    element(id: string): HTMLElement {
      const element = container.querySelector<HTMLElement>(`#${id}`);
      if (!element) throw new Error(`Result Dock element is missing: ${id}`);
      return element;
    },
    dispose() {
      handlers.clear();
      root.unmount();
    },
  };
}
