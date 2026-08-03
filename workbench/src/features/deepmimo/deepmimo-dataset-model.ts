import type { DeepMimoDatasetTrayViewModel } from "./contracts.ts";
import { ObservableStateAdapter } from "../../runtime/observable-state.ts";
import { CommandBus } from "../../runtime/ui-command.ts";

export interface DeepMimoDatasetApi {
  readonly update: (model: DeepMimoDatasetTrayViewModel) => void;
  readonly dispose: () => void;
}

export interface DeepMimoDatasetModel extends DeepMimoDatasetApi {
  readonly commandBus: CommandBus;
  readonly store: ObservableStateAdapter<DeepMimoDatasetTrayViewModel>;
}

export function createDeepMimoDatasetModel({
  commandBus: providedCommandBus,
  onToggle,
}: {
  readonly commandBus?: CommandBus;
  readonly onToggle: () => void;
}): DeepMimoDatasetModel {
  let model: DeepMimoDatasetTrayViewModel = {
    visible: false,
    expanded: false,
    datasets: [],
  };
  const store = new ObservableStateAdapter(() => model);
  const commandBus = providedCommandBus ?? new CommandBus();
  const ownsCommandBus = providedCommandBus === undefined;
  const unsubscribe = commandBus.subscribe(
    "deepmimo.datasets.toggle",
    onToggle,
  );
  let disposed = false;
  return {
    commandBus,
    store,
    update(nextModel) {
      model = nextModel;
      store.refresh();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      unsubscribe();
      if (ownsCommandBus) commandBus.dispose();
      store.dispose();
    },
  };
}
