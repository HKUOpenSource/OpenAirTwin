import { act, fireEvent, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { mountAppShell } from "../app-shell/app-shell-runtime.tsx";
import { reactRootRegistry } from "../runtime/root-registry.tsx";

const mountedContainers: HTMLElement[] = [];

afterEach(() => {
  reactRootRegistry.unmountAll();
  for (const container of mountedContainers.splice(0)) container.remove();
});

describe("Phase 8 React control surface model", () => {
  it("owns fields and actions through the production AppShell tree", async () => {
    const container = document.createElement("main");
    document.body.append(container);
    mountedContainers.push(container);
    const handler = vi.fn();
    let runtime!: ReturnType<typeof mountAppShell>;
    act(() => {
      runtime = mountAppShell({
        activeMode: "link",
        container,
        reportError: vi.fn(),
      });
      runtime.controls.setCommandHandler(handler);
    });
    const controls = runtime.controls;

    const frequency = controls.element("cfgFrequency") as HTMLInputElement;
    expect(frequency.defaultValue).toBe("3.5");
    expect(frequency.step).toBe("0.1");
    expect(
      [
        ...(controls.element("txArrayPattern") as HTMLSelectElement).options,
      ].find((option) => option.defaultSelected)?.value,
    ).toBe("iso");
    expect(controls.elements('input[name="radarMode"]')).toHaveLength(2);

    frequency.focus();
    fireEvent.input(frequency, { target: { value: "4.2" } });
    expect(document.activeElement).toBe(frequency);
    fireEvent.blur(frequency);
    await waitFor(() => {
      expect(handler).toHaveBeenCalledWith({
        name: "workbench.control.commit",
        payload: { controlId: "cfgFrequency", value: "4.2" },
      });
    });

    act(() => {
      controls.updateFields([{ id: "cfgFrequency", value: "6.4" }]);
    });
    expect(frequency.value).toBe("6.4");
    expect(frequency.defaultValue).toBe("3.5");

    fireEvent.click(controls.element("radarModeMonostatic"));
    await waitFor(() => {
      expect(
        (controls.element("radarModeMonostatic") as HTMLInputElement).checked,
      ).toBe(true);
      expect(
        (controls.element("radarModeBistatic") as HTMLInputElement).checked,
      ).toBe(false);
    });

    fireEvent.click(controls.element("btnSolveLink"));
    await waitFor(() => {
      expect(handler).toHaveBeenCalledWith({
        name: "workbench.control.action",
        payload: { actionId: "btnSolveLink" },
      });
    });

    act(() => {
      controls.setActionBusy("btnSolveLink", true);
    });
    const solve = controls.element("btnSolveLink") as HTMLButtonElement;
    expect(solve.getAttribute("aria-busy")).toBe("true");
    expect(solve.disabled).toBe(true);
    solve.disabled = false;
    solve.classList.remove("busy");
    solve.removeAttribute("aria-busy");
    act(() => {
      controls.syncFromAdapters();
    });
    expect(solve.getAttribute("aria-busy")).toBe("true");
    expect(solve.disabled).toBe(true);

    controls.element("mobilityEstimate").textContent = "Ready";
    act(() => {
      controls.updateMobilityWaypoints([
        { index: 0, coordinate: "1.0, 2.0, 3.0", selected: true },
      ]);
      controls.syncFromAdapters("mobility");
    });
    expect(controls.element("mobilityEstimate").textContent).toBe("Ready");
    expect(controls.element("mobilityWaypointList").textContent).toContain(
      "[1.0, 2.0, 3.0]",
    );

    act(() => {
      runtime.dispose();
    });
    expect(container.childNodes).toHaveLength(0);
  });
});
