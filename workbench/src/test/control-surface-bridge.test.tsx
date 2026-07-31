import { act, fireEvent, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createControlSurfaceBridge } from "../features/controls/control-surface-bridge.tsx";

const mountedContainers: HTMLElement[] = [];

function mountContainer(markup: string): HTMLElement {
  const container = document.createElement("div");
  container.innerHTML = markup;
  document.body.append(container);
  mountedContainers.push(container);
  return container;
}

afterEach(() => {
  for (const container of mountedContainers.splice(0)) container.remove();
});

describe("Phase 6 React control surface", () => {
  it("owns fields and actions while preserving frozen DOM and imperative hosts", async () => {
    const form = mountContainer(`
      <details id="controlGroup" open>
        <summary>Parameters</summary>
        <label for="frequency">Frequency</label>
        <input id="frequency" type="number" value="3.5" min="0.1" max="100" step="0.1">
        <select id="pattern"><option value="iso" selected>iso</option> <option value="dipole">dipole</option></select>
        <label><input id="mono" name="mode" type="radio" value="mono"> Mono</label>
        <label><input id="bi" name="mode" type="radio" value="bi" checked> Bi</label>
        <button id="solve" type="button" class="oat-button">Solve</button>
        <div id="asyncStatus">Loading</div>
        <div id="mobilityWaypointList"><div class="waypointEmpty">No points</div></div>
      </details>
    `);
    const device = mountContainer(`
      <button id="pick" type="button" class="oat-button">Pick</button>
    `);
    const handler = vi.fn();
    let bridge!: ReturnType<typeof createControlSurfaceBridge>;
    act(() => {
      bridge = createControlSurfaceBridge({
        formContainer: form,
        deviceContainer: device,
        reportError: vi.fn(),
      });
      bridge.setCommandHandler(handler);
    });

    const frequency = bridge.element("frequency") as HTMLInputElement;
    expect(frequency.defaultValue).toBe("3.5");
    expect(frequency.min).toBe("0.1");
    expect(frequency.max).toBe("100");
    expect(frequency.step).toBe("0.1");
    expect(
      [...(bridge.element("pattern") as HTMLSelectElement).options].find(
        (option) => option.defaultSelected,
      )?.value,
    ).toBe("iso");
    expect(bridge.elements('input[name="mode"]')).toHaveLength(2);

    frequency.focus();
    fireEvent.input(frequency, { target: { value: "4.2" } });
    expect(document.activeElement).toBe(frequency);
    fireEvent.blur(frequency);
    await waitFor(() => {
      expect(handler).toHaveBeenCalledWith({
        name: "workbench.control.commit",
        payload: { controlId: "frequency", value: "4.2" },
      });
    });

    act(() => {
      bridge.updateFields([{ id: "frequency", value: "6.4" }]);
    });
    expect(frequency.value).toBe("6.4");
    expect(frequency.defaultValue).toBe("3.5");

    frequency.value = "7.1";
    fireEvent.change(frequency);
    await waitFor(() => {
      expect(handler).toHaveBeenCalledWith({
        name: "workbench.control.commit",
        payload: { controlId: "frequency", value: "7.1" },
      });
    });
    expect(frequency.defaultValue).toBe("3.5");

    fireEvent.click(bridge.element("mono"));
    await waitFor(() => {
      expect((bridge.element("mono") as HTMLInputElement).checked).toBe(true);
      expect((bridge.element("bi") as HTMLInputElement).checked).toBe(false);
    });

    fireEvent.click(bridge.element("solve"));
    await waitFor(() => {
      expect(handler).toHaveBeenCalledWith({
        name: "workbench.control.action",
        payload: { actionId: "solve" },
      });
    });

    act(() => {
      bridge.setActionBusy("solve", true);
    });
    expect(bridge.element("solve").getAttribute("aria-busy")).toBe("true");
    expect((bridge.element("solve") as HTMLButtonElement).disabled).toBe(true);
    (bridge.element("solve") as HTMLButtonElement).disabled = false;
    bridge.element("solve").classList.remove("busy");
    bridge.element("solve").removeAttribute("aria-busy");
    act(() => {
      bridge.refreshFromDom();
    });
    expect(bridge.element("solve").getAttribute("aria-busy")).toBe("true");
    expect((bridge.element("solve") as HTMLButtonElement).disabled).toBe(true);
    act(() => {
      bridge.setActionBusy("solve", false);
    });
    expect(bridge.element("solve").hasAttribute("aria-busy")).toBe(false);

    bridge.element("asyncStatus").textContent = "Ready";
    act(() => {
      bridge.updateMobilityWaypoints([
        { index: 0, coordinate: "1.0, 2.0, 3.0", selected: true },
      ]);
    });
    act(() => {
      bridge.refreshFromDom("mobility");
    });
    expect(bridge.element("asyncStatus").textContent).toBe("Ready");
    expect(bridge.element("mobilityWaypointList").textContent).toContain(
      "[1.0, 2.0, 3.0]",
    );

    act(() => {
      bridge.dispose();
    });
    expect(form.childNodes).toHaveLength(0);
    expect(device.childNodes).toHaveLength(0);
  });
});
