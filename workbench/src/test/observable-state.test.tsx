import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  ObservableStateAdapter,
  useFeatureSnapshot,
} from "../runtime/observable-state.ts";

interface JobSnapshot {
  readonly status: "idle" | "busy" | "cancelled";
  readonly busy: boolean;
  readonly polls: number;
}

function JobStatus({
  store,
}: {
  readonly store: ObservableStateAdapter<JobSnapshot>;
}) {
  const snapshot = useFeatureSnapshot(store);
  return (
    <output data-busy={String(snapshot.busy)}>
      {snapshot.status}:{snapshot.polls}
    </output>
  );
}

describe("ObservableStateAdapter", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("keeps one stable snapshot between explicit legacy notifications", () => {
    let source: JobSnapshot = { status: "idle", busy: false, polls: 0 };
    const store = new ObservableStateAdapter(() => ({ ...source }));
    const initial = store.getSnapshot();
    expect(store.getSnapshot()).toBe(initial);

    source = { status: "busy", busy: true, polls: 1 };
    expect(store.getSnapshot()).toBe(initial);
    store.refresh();
    expect(store.getSnapshot()).toEqual(source);
    expect(store.getSnapshot()).not.toBe(initial);
    store.dispose();
  });

  it("covers polling, busy, cancel and subscription cleanup with fake timers", () => {
    let source: JobSnapshot = { status: "idle", busy: false, polls: 0 };
    let timer: ReturnType<typeof setInterval> | null = null;
    const store = new ObservableStateAdapter(
      () => ({ ...source }),
      (notify) => {
        timer = setInterval(() => {
          source = { status: "busy", busy: true, polls: source.polls + 1 };
          notify();
        }, 100);
        return () => {
          if (timer) clearInterval(timer);
          timer = null;
        };
      },
    );
    const view = render(<JobStatus store={store} />);
    expect(store.listenerCount()).toBe(1);
    expect(screen.getByText("idle:0").dataset.busy).toBe("false");

    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(screen.getByText("busy:2").dataset.busy).toBe("true");

    act(() => {
      if (timer) clearInterval(timer);
      source = { status: "cancelled", busy: false, polls: source.polls };
      store.refresh();
    });
    expect(screen.getByText("cancelled:2").dataset.busy).toBe("false");

    view.unmount();
    expect(store.listenerCount()).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
    store.dispose();
  });
});
