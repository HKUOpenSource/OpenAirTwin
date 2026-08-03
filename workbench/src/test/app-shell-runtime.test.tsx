import { act, fireEvent, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { mountAppShell } from "../app-shell/app-shell-runtime.tsx";
import { createInitialResultDockSnapshot } from "../features/results/contracts.ts";
import { reactRootRegistry } from "../runtime/root-registry.tsx";

const mountedContainers: HTMLElement[] = [];

function createShellHost(): HTMLElement {
  const container = document.createElement("main");
  document.body.append(container);
  mountedContainers.push(container);
  return container;
}

afterEach(() => {
  reactRootRegistry.unmountAll();
  for (const container of mountedContainers.splice(0)) container.remove();
});

describe("AppShell runtime", () => {
  it("owns the production UI through one root and routes shell commands", async () => {
    const container = createShellHost();
    const handler = vi.fn();
    let runtime!: ReturnType<typeof mountAppShell>;

    act(() => {
      runtime = mountAppShell({
        activeMode: "link",
        container,
        reportError: vi.fn(),
      });
      runtime.setCommandHandler(handler);
    });

    expect(reactRootRegistry.size()).toBe(1);
    expect(reactRootRegistry.has("app-shell")).toBe(true);
    expect(container.querySelectorAll("#view")).toHaveLength(1);
    expect(
      container.querySelector(".shell")?.getAttribute("data-oat-react-owner"),
    ).toBe("app-shell");
    expect(runtime.controls.element("cfgFrequency")).toBeInstanceOf(
      HTMLInputElement,
    );
    expect(runtime.controls.element("btnPickLinkTx")).toBeInstanceOf(
      HTMLButtonElement,
    );
    expect(runtime.results.element("linkResult")).toBeInstanceOf(HTMLElement);
    expect(container.querySelector("#deepMimoDatasetTray")).not.toBeNull();

    const place = document.createElement("button");
    place.dataset.entryPlaceIndex = "2";
    runtime.element("entryPlaceResults").append(place);
    fireEvent.click(runtime.element("panelToggle"));
    fireEvent.click(runtime.element("tabMobility"));
    fireEvent.click(place);
    const modeSelector = runtime.element("modeSelector") as HTMLDetailsElement;
    modeSelector.open = true;
    fireEvent(modeSelector, new Event("toggle", { bubbles: true }));

    await waitFor(() => {
      expect(handler).toHaveBeenCalledWith({
        name: "workbench.controls.toggle",
        payload: undefined,
      });
      expect(handler).toHaveBeenCalledWith({
        name: "workbench.mode.select",
        payload: { mode: "mobility" },
      });
      expect(handler).toHaveBeenCalledWith({
        name: "entry.place.select",
        payload: { index: 2 },
      });
      expect(handler).toHaveBeenCalledWith({
        name: "workbench.mode.toggle",
        payload: { open: true },
      });
    });

    act(() => {
      runtime.dispose();
    });
    expect(reactRootRegistry.size()).toBe(0);
    expect(container.childNodes).toHaveLength(0);
  });

  it("keeps the viewer canvas stable and cleans the shell timer", () => {
    const clearIntervalSpy = vi.spyOn(window, "clearInterval");
    const container = createShellHost();
    let runtime!: ReturnType<typeof mountAppShell>;

    act(() => {
      runtime = mountAppShell({
        activeMode: "link",
        container,
        reportError: vi.fn(),
      });
    });
    const canvas = runtime.element("view");
    const initial = createInitialResultDockSnapshot();

    act(() => {
      runtime.results.update(
        "link",
        { ...initial.link, visible: true, status: "success" },
        "link",
      );
      runtime.controls.updateFields([{ id: "cfgFrequency", value: "5.8" }]);
    });

    expect(runtime.element("view")).toBe(canvas);
    expect(
      (runtime.controls.element("cfgFrequency") as HTMLInputElement).value,
    ).toBe("5.8");

    act(() => {
      runtime.dispose();
    });
    expect(clearIntervalSpy).toHaveBeenCalledTimes(1);
  });

  it("keeps consecutive shell commands synchronous and ordered", () => {
    const container = createShellHost();
    const commands: string[] = [];
    let runtime!: ReturnType<typeof mountAppShell>;

    act(() => {
      runtime = mountAppShell({
        activeMode: "link",
        container,
        reportError: vi.fn(),
      });
      runtime.setCommandHandler((nextCommand) => {
        const payload = nextCommand.payload as { mode?: string } | undefined;
        commands.push(`${nextCommand.name}:${String(payload?.mode)}`);
      });
    });

    act(() => {
      runtime.element("tabMobility").click();
      expect(
        commands.filter((entry) => entry.startsWith("workbench.mode")),
      ).toEqual(["workbench.mode.select:mobility"]);
      runtime.element("tabLink").click();
    });

    expect(
      commands.filter((entry) => entry.startsWith("workbench.mode")),
    ).toEqual(["workbench.mode.select:mobility", "workbench.mode.select:link"]);
  });
});
