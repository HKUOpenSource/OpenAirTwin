import { act, fireEvent, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { mountAppShell } from "../app-shell/app-shell-runtime.tsx";
import type { AnyUiCommand } from "../runtime/ui-command.ts";

const mountedContainers: HTMLElement[] = [];

function mountContainer(): HTMLElement {
  const container = document.createElement("div");
  document.body.append(container);
  mountedContainers.push(container);
  return container;
}

afterEach(() => {
  for (const container of mountedContainers.splice(0)) container.remove();
});

describe("Unidirectional ControlsStore and LeftInspector", () => {
  it("projects feature mode snapshots into modular control views and dispatches typed run commands", async () => {
    const container = mountContainer();
    const commands: AnyUiCommand[] = [];
    let runtime!: ReturnType<typeof mountAppShell>;
    act(() => {
      runtime = mountAppShell({
        activeMode: "link",
        container,
        reportError: vi.fn(),
      });
      runtime.setCommandHandler((cmd) => {
        commands.push(cmd);
      });
    });

    expect(
      container.querySelector('[data-testid="link-controls"]'),
    ).not.toBeNull();

    // Enable Link solve by clearing runDisabledReason and clicking Solve Link
    act(() => {
      runtime.controls.patch((current) => ({
        ...current,
        link: { ...current.link, runDisabledReason: "" },
      }));
    });

    const solveButton = [...container.querySelectorAll("button")].find(
      (btn) => btn.textContent.trim() === "Solve Link",
    );
    expect(solveButton).toBeTruthy();
    if (solveButton) fireEvent.click(solveButton);

    await waitFor(() => {
      expect(
        commands.some(
          (cmd) =>
            cmd.name === "workbench.control.action" &&
            (cmd.payload as { actionId?: string } | undefined)?.actionId ===
              "btnSolveLink",
        ),
      ).toBe(true);
    });

    // Switch to Mobility mode and verify waypoint list updates declaratively
    act(() => {
      runtime.controls.patch((current) => ({
        ...current,
        activeMode: "mobility",
        mobility: {
          ...current.mobility,
          estimateText: "42.0 m · 28.0 s · 29 / 1000 steps",
          waypoints: [
            {
              index: 0,
              label: "Waypoint 1",
              coords: "1.0, 2.0, 3.0",
              selected: true,
            },
          ],
        },
      }));
    });

    const mobilityEl = container.querySelector<HTMLElement>(
      '[data-testid="mobility-controls"]',
    );
    expect(mobilityEl).not.toBeNull();
    expect(mobilityEl?.textContent).toContain("42.0 m");
    expect(mobilityEl?.textContent).toContain("1.0, 2.0, 3.0");

    // Switch to Radar mode and verify preview canvas registers cleanly
    act(() => {
      runtime.controls.patch((current) => ({
        ...current,
        activeMode: "radar",
        radar: {
          ...current.radar,
          pickerAssetName: "Quadcopter Drone",
          targets: [
            {
              id: "target-1",
              title: "Quadcopter Drone",
              meta: "Target 1 · 55.0 m · 8.0 m/s",
              color: "#e58a28",
              selected: true,
            },
          ],
        },
      }));
    });

    expect(
      container.querySelector('[data-testid="radar-workflow-controls"]'),
    ).not.toBeNull();
    expect(runtime.hosts.get("radarAssetPreviewCanvas")).toBeInstanceOf(
      HTMLCanvasElement,
    );

    act(() => {
      runtime.dispose();
    });
  });

  it("renders bottom DeviceBar and opens coordinate precision card when activeTarget is set", () => {
    const container = mountContainer();
    let runtime!: ReturnType<typeof mountAppShell>;
    act(() => {
      runtime = mountAppShell({
        activeMode: "link",
        container,
        reportError: vi.fn(),
      });
      runtime.controls.patch((current) => ({
        ...current,
        deviceBar: {
          ...current.deviceBar,
          visible: true,
          activeTarget: "link-tx",
          precisionTitle: "Link Tx",
          txPosition: [10.5, 20.5, 15.0],
          hintText: "Click any surface to place Tx",
        },
      }));
    });

    expect(
      container.querySelector('[data-testid="device-bar"]'),
    ).not.toBeNull();
    const card = container.querySelector<HTMLElement>(
      '[data-testid="device-precision-card"]',
    );
    expect(card).not.toBeNull();
    expect(card?.textContent).toContain("Link Tx Coordinates");

    act(() => {
      runtime.dispose();
    });
  });
});
