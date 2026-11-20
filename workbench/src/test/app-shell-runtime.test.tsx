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

describe("AppShellRuntime (Astryx workstation)", () => {
  it("mounts the single app-shell root, registers imperative hosts, and dispatches topbar commands", async () => {
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

    expect(runtime.hosts.require("view")).toBeInstanceOf(HTMLCanvasElement);
    expect(runtime.hosts.require("entryMapScene")).toBeInstanceOf(
      HTMLDivElement,
    );
    expect(
      container.querySelector('[data-testid="top-workspace-bar"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-testid="left-inspector"]'),
    ).not.toBeNull();

    // Switch mode via the top-bar SegmentedControl
    const radarRadio = container.querySelector<HTMLElement>(
      '[role="radio"][data-value="radar"], input[value="radar"]',
    );
    const radarButton =
      radarRadio ??
      [...container.querySelectorAll("button, [role='radio']")].find(
        (el) => el.textContent.trim() === "Radar",
      );
    expect(radarButton).toBeTruthy();
    if (radarButton) {
      fireEvent.click(radarButton);
    }

    await waitFor(() => {
      expect(
        commands.some(
          (cmd) =>
            cmd.name === "workbench.mode.select" &&
            (cmd.payload as { mode?: string } | undefined)?.mode === "radar",
        ),
      ).toBe(true);
    });

    // Toggle inspector collapse button
    const collapseBtn = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Collapse inspector panel"]',
    );
    expect(collapseBtn).not.toBeNull();
    if (collapseBtn) fireEvent.click(collapseBtn);
    await waitFor(() => {
      expect(
        commands.some((cmd) => cmd.name === "workbench.controls.toggle"),
      ).toBe(true);
    });

    act(() => {
      runtime.dispose();
    });
    expect(runtime.hosts.get("view")).toBeNull();
  });

  it("renders loading overlay and dialog states purely from shellStore snapshots", () => {
    const container = mountContainer();
    let runtime!: ReturnType<typeof mountAppShell>;
    act(() => {
      runtime = mountAppShell({
        activeMode: "link",
        container,
        reportError: vi.fn(),
      });
    });

    act(() => {
      runtime.shell.patch((current) => ({
        ...current,
        loading: {
          visible: true,
          title: "Solving Link",
          message: "Tracing rays...",
          percent: 42,
          indeterminate: false,
          cancellable: true,
          cancelLabel: "Stop",
        },
      }));
    });

    const overlay = container.querySelector<HTMLElement>(
      '[data-testid="loading-overlay"]',
    );
    expect(overlay?.dataset.hidden).toBe("false");
    expect(overlay?.textContent).toContain("Solving Link");
    expect(overlay?.textContent).toContain("42%");

    act(() => {
      runtime.shell.patch((current) => ({
        ...current,
        screen: "entry",
        entry: {
          ...current.entry,
          badgeValue: "2 selected",
          canEnterScene: true,
        },
      }));
    });
    const entryScreen = container.querySelector<HTMLElement>(
      '[data-testid="entry-screen"]',
    );
    expect(entryScreen?.dataset.hidden).toBe("false");
    expect(entryScreen?.textContent).toContain("2 selected");

    act(() => {
      runtime.dispose();
    });
  });
});
