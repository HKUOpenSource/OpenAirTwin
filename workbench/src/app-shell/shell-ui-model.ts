import { ObservableStateAdapter } from "../runtime/observable-state.ts";

export interface EntryPlaceResultViewModel {
  readonly index: number;
  readonly title: string;
  readonly detail: string;
  readonly meta: string;
  readonly active: boolean;
}

export interface TileSelectionViewModel {
  readonly id: string;
  readonly title: string;
  readonly detail: string;
  readonly selected: boolean;
  readonly loaded: boolean;
  readonly pendingAdd: boolean;
  readonly pendingRemove: boolean;
  readonly status: string;
  readonly statusClassName: string;
  readonly disabled: boolean;
}

export interface PerformanceCategoryViewModel {
  readonly name: string;
  readonly stats: string;
  readonly visible: boolean;
}

export interface ShellUiSnapshot {
  readonly entryPlaces: readonly EntryPlaceResultViewModel[];
  readonly tiles: readonly TileSelectionViewModel[];
  readonly performanceCategories: readonly PerformanceCategoryViewModel[];
}

export interface ShellUiModel {
  readonly store: ObservableStateAdapter<ShellUiSnapshot>;
  readonly updateEntryPlaces: (
    places: readonly EntryPlaceResultViewModel[],
  ) => void;
  readonly updateTiles: (tiles: readonly TileSelectionViewModel[]) => void;
  readonly updatePerformanceCategories: (
    categories: readonly PerformanceCategoryViewModel[],
  ) => void;
  readonly dispose: () => void;
}

export function createShellUiModel(): ShellUiModel {
  let snapshot: ShellUiSnapshot = {
    entryPlaces: [],
    tiles: [],
    performanceCategories: [],
  };
  const store = new ObservableStateAdapter(() => snapshot);
  let disposed = false;
  const update = (patch: Partial<ShellUiSnapshot>) => {
    if (disposed) return;
    snapshot = { ...snapshot, ...patch };
    store.refresh();
  };
  return {
    store,
    updateEntryPlaces(entryPlaces) {
      update({ entryPlaces: [...entryPlaces] });
    },
    updateTiles(tiles) {
      update({ tiles: [...tiles] });
    },
    updatePerformanceCategories(performanceCategories) {
      update({ performanceCategories: [...performanceCategories] });
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      store.dispose();
    },
  };
}
