import {
  createInitialResultDockSnapshot,
  type ResultDockSnapshot,
  type ResultFeatureId,
} from "./contracts.ts";
import { ObservableStateAdapter } from "../../runtime/observable-state.ts";
import { CommandBus, type AnyUiCommand } from "../../runtime/ui-command.ts";

export type ResultCommandHandler = (
  command: AnyUiCommand,
) => void | Promise<void>;

export interface ResultDockApi {
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

export interface ResultDockModel extends ResultDockApi {
  readonly commandBus: CommandBus;
  readonly store: ObservableStateAdapter<ResultDockSnapshot>;
}

export function createResultDockModel({
  commandBus: providedCommandBus,
  resolveContainer,
}: {
  readonly commandBus?: CommandBus;
  readonly resolveContainer: () => Element;
}): ResultDockModel {
  let snapshot = createInitialResultDockSnapshot();
  const handlers = new Map<ResultFeatureId, ResultCommandHandler>();
  const store = new ObservableStateAdapter(() => snapshot);
  const commandBus = providedCommandBus ?? new CommandBus();
  const ownsCommandBus = providedCommandBus === undefined;
  const unsubscribe = commandBus.subscribe("*", async (command) => {
    const featureId = command.featureId as ResultFeatureId | undefined;
    if (!featureId) return;
    await handlers.get(featureId)?.(command);
  });
  let disposed = false;

  return {
    commandBus,
    store,
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
      const element = resolveContainer().querySelector<HTMLElement>(`#${id}`);
      if (!element) throw new Error(`Result Dock element is missing: ${id}`);
      return element;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      handlers.clear();
      unsubscribe();
      if (ownsCommandBus) commandBus.dispose();
      store.dispose();
    },
  };
}
