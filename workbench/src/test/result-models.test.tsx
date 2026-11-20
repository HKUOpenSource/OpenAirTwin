import { act, fireEvent, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { mountAppShell } from "../app-shell/app-shell-runtime.tsx";
import { createInitialResultDockSnapshot } from "../features/results/contracts.ts";
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

describe("RightAnalysisDrawer and ResultDockModel", () => {
  it("isolates Link path details to the active Link mode and keeps SVG/Canvas chart hosts stable", async () => {
    const container = mountContainer();
    const linkCommands: AnyUiCommand[] = [];
    let runtime!: ReturnType<typeof mountAppShell>;
    act(() => {
      runtime = mountAppShell({
        activeMode: "link",
        container,
        reportError: vi.fn(),
      });
      runtime.results.registerCommandHandler("link", (cmd) => {
        linkCommands.push(cmd);
      });
    });

    const tapChartBefore = runtime.results.element("linkTapChart");
    const rdCanvasBefore = runtime.results.element("radarRangeDopplerCanvas");
    const initial = createInitialResultDockSnapshot();

    act(() => {
      runtime.shell.patch((current) => ({
        ...current,
        resultDock: {
          visible: true,
          title: "Link Results",
          subtitle: "Path Gains & Taps",
        },
      }));
      runtime.results.update(
        "link",
        {
          ...initial.link,
          status: "success",
          visible: true,
          summary: [
            { id: "link-power", label: "Total Path Gain", value: "-81.25 dB" },
          ],
          paths: {
            visible: true,
            featureId: "link",
            countLabel: "1 path",
            meta: "1 valid",
            selectedIndex: 0,
            rows: [
              {
                index: 0,
                name: "Path 1",
                typeLabel: "LoS",
                typeClassName: "los",
                variantLabel: null,
                gain: "-81.25 dB",
                delay: "0.12 µs",
                ariaLabel: "Select Path 1",
                selected: true,
              },
            ],
            detail: {
              title: "Path 1",
              typeLabel: "LoS",
              fields: [
                {
                  id: "gain",
                  label: "Path Gain",
                  value: "-81.25 dB",
                  wide: false,
                },
              ],
            },
          },
        },
        "link",
      );
    });

    const drawer = container.querySelector<HTMLElement>(
      '[data-testid="right-analysis-drawer"]',
    );
    expect(drawer?.dataset.collapsed).toBe("false");
    expect(drawer?.textContent).toContain("-81.25 dB");

    const allPathsBtn = [...container.querySelectorAll("button")].find((btn) =>
      btn.textContent.includes("All Paths"),
    );
    expect(allPathsBtn).toBeTruthy();
    if (allPathsBtn) fireEvent.click(allPathsBtn);
    await waitFor(() => {
      expect(
        linkCommands.some(
          (cmd) =>
            cmd.name === "link.path.select" &&
            (cmd.payload as { index?: number } | undefined)?.index === -1,
        ),
      ).toBe(true);
    });

    // Switch to Radio Map mode and ensure Link path details do not leak
    act(() => {
      runtime.results.update(
        "radiomap",
        {
          ...initial.radiomap,
          status: "success",
          visible: true,
          summary: [{ id: "status", label: "Status", value: "Succeeded" }],
        },
        "radiomap",
      );
    });
    expect(drawer?.textContent).not.toContain("-81.25 dB");
    expect(drawer?.textContent).toContain("Succeeded");

    // Imperative SVG & Canvas hosts remain the exact same DOM instances
    expect(runtime.results.element("linkTapChart")).toBe(tapChartBefore);
    expect(runtime.results.element("radarRangeDopplerCanvas")).toBe(
      rdCanvasBefore,
    );

    act(() => {
      runtime.dispose();
    });
  });
});
