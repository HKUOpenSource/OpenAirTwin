import { useSyncExternalStore } from "react";

export type StoreListener = () => void;
export type StoreConnector = (
  notify: StoreListener,
) => (() => void) | undefined;

export interface UiExternalStore<TSnapshot> {
  readonly getSnapshot: () => TSnapshot;
  readonly getServerSnapshot: () => TSnapshot;
  readonly subscribe: (listener: StoreListener) => () => void;
}

export class ObservableStateAdapter<
  TSnapshot,
> implements UiExternalStore<TSnapshot> {
  readonly #readSnapshot: () => TSnapshot;
  readonly #connect: StoreConnector | undefined;
  readonly #equals: (left: TSnapshot, right: TSnapshot) => boolean;
  readonly #listeners = new Set<StoreListener>();
  #snapshot: TSnapshot;
  #disconnect: (() => void) | null = null;
  #disposed = false;

  constructor(
    readSnapshot: () => TSnapshot,
    connect?: StoreConnector,
    equals: (left: TSnapshot, right: TSnapshot) => boolean = Object.is,
  ) {
    this.#readSnapshot = readSnapshot;
    this.#connect = connect;
    this.#equals = equals;
    this.#snapshot = readSnapshot();
  }

  readonly getSnapshot = (): TSnapshot => this.#snapshot;

  readonly getServerSnapshot = (): TSnapshot => this.#snapshot;

  readonly subscribe = (listener: StoreListener): (() => void) => {
    this.assertActive();
    this.#listeners.add(listener);
    if (this.#listeners.size === 1 && this.#connect) {
      this.#disconnect = this.#connect(this.refresh) ?? null;
    }
    return () => {
      this.#listeners.delete(listener);
      if (this.#listeners.size === 0) this.disconnect();
    };
  };

  readonly refresh = (): void => {
    this.assertActive();
    const nextSnapshot = this.#readSnapshot();
    if (this.#equals(this.#snapshot, nextSnapshot)) return;
    this.#snapshot = nextSnapshot;
    for (const listener of [...this.#listeners]) listener();
  };

  listenerCount(): number {
    return this.#listeners.size;
  }

  dispose(): void {
    if (this.#disposed) return;
    this.disconnect();
    this.#listeners.clear();
    this.#disposed = true;
  }

  private disconnect(): void {
    this.#disconnect?.();
    this.#disconnect = null;
  }

  private assertActive(): void {
    if (this.#disposed) {
      throw new Error("ObservableStateAdapter has been disposed");
    }
  }
}

export function useFeatureSnapshot<TSnapshot>(
  store: UiExternalStore<TSnapshot>,
): TSnapshot {
  return useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getServerSnapshot,
  );
}
