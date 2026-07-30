import { act } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { RootErrorEvent } from "../runtime/error-reporting.ts";
import { ReactRootRegistry } from "../runtime/root-registry.tsx";
import { CommandBus } from "../runtime/ui-command.ts";

function BrokenPanel(): never {
  throw new Error("catalog panel failed");
}

describe("ReactRootRegistry", () => {
  it("rejects a mount point still owned by legacy DOM", () => {
    const registry = new ReactRootRegistry();
    const container = document.createElement("div");
    container.append(document.createElement("span"));
    expect(() =>
      registry.mount({
        id: "occupied",
        container,
        children: <div />,
        commandBus: new CommandBus(),
        reportError: vi.fn(),
      }),
    ).toThrow("requires an empty mount container");
  });

  it("unmounts once, runs cleanup and restores focus", () => {
    vi.useFakeTimers();
    const registry = new ReactRootRegistry();
    const focusTarget = document.createElement("button");
    const container = document.createElement("div");
    document.body.append(focusTarget, container);
    focusTarget.focus();
    let handle!: ReturnType<ReactRootRegistry["mount"]>;
    act(() => {
      handle = registry.mount({
        id: "feature-result",
        container,
        children: <button type="button">React action</button>,
        commandBus: new CommandBus(),
        reportError: vi.fn(),
      });
    });
    const tick = vi.fn();
    const timer = setInterval(tick, 100);
    const cleanup = vi.fn(() => {
      clearInterval(timer);
    });
    handle.registerCleanup(cleanup);
    (container.querySelector("button") as HTMLButtonElement).focus();

    act(() => {
      handle.unmount();
    });
    expect(cleanup).toHaveBeenCalledOnce();
    expect(registry.size()).toBe(0);
    expect(container.childNodes).toHaveLength(0);
    expect(document.activeElement).toBe(focusTarget);
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(tick).not.toHaveBeenCalled();
    handle.unmount();
    expect(cleanup).toHaveBeenCalledOnce();
    expect(() => handle.registerCleanup(vi.fn())).toThrow(
      "React root has been unmounted",
    );
    focusTarget.remove();
    container.remove();
    vi.useRealTimers();
  });

  it("renders a visible fallback and reports caught component errors", () => {
    const registry = new ReactRootRegistry();
    const container = document.createElement("div");
    document.body.append(container);
    const errors: RootErrorEvent[] = [];
    act(() => {
      registry.mount({
        id: "broken-result",
        container,
        children: <BrokenPanel />,
        commandBus: new CommandBus(),
        reportError: (event) => errors.push(event),
      });
    });
    expect(container.getAttribute("role")).toBeNull();
    expect(container.querySelector("[role='alert']")?.textContent).toContain(
      "catalog panel failed",
    );
    expect(errors.some((event) => event.kind === "caught")).toBe(true);
    act(() => {
      registry.unmountAll();
    });
    container.remove();
  });
});
