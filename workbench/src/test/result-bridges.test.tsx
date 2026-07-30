import { act, fireEvent, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createDeepMimoDatasetBridge } from "../features/deepmimo/deepmimo-dataset-bridge.tsx";
import { createInitialResultDockSnapshot } from "../features/results/contracts.ts";
import { createResultDockBridge } from "../features/results/result-dock-bridge.tsx";

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

describe("Phase 5 React result bridges", () => {
  it("keeps chart hosts stable while Link data and commands update", async () => {
    const container = mountContainer();
    let bridge!: ReturnType<typeof createResultDockBridge>;
    act(() => {
      bridge = createResultDockBridge({
        container,
        reportError: vi.fn(),
      });
    });
    const initial = createInitialResultDockSnapshot();
    const commandHandler = vi.fn();
    bridge.registerCommandHandler("link", commandHandler);
    expect(container.innerHTML).toContain("linkTapChart");
    expect(container.querySelector("#linkTapTotalPower")?.textContent).toBe(
      "--",
    );
    expect(container.querySelector("#linkTapPeak")?.textContent).toBe("--");
    expect(container.querySelector("#linkCirCoeffCount")?.textContent).toBe(
      "--",
    );
    expect(container.querySelector("#linkCirStrongest")?.textContent).toBe(
      "--",
    );
    const chartHost = bridge.element("linkTapChart");

    act(() => {
      bridge.update(
        "link",
        {
          ...initial.link,
          status: "success",
          visible: true,
          summary: [
            {
              id: "power",
              label: "Total Path Gain",
              value: "-81.25 dB",
              valueId: "linkPower",
            },
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
                delay: "12.00 ns",
                ariaLabel: "Select Path 1",
                selected: true,
              },
            ],
            detail: null,
          },
        },
        "link",
      );
    });

    expect(container.querySelector("#linkPower")?.textContent).toBe(
      "-81.25 dB",
    );
    const path = container.querySelector<HTMLButtonElement>(
      "#pathButtons .pathRow",
    );
    expect(path?.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(path as HTMLButtonElement);
    await waitFor(() => {
      expect(commandHandler).toHaveBeenCalledWith({
        name: "link.path.select",
        featureId: "link",
        payload: { index: 0 },
      });
    });

    act(() => {
      bridge.update("link", initial.link, null);
    });
    expect(bridge.element("linkTapChart")).toBe(chartHost);

    const mobilityHandler = vi.fn();
    bridge.registerCommandHandler("mobility", mobilityHandler);
    act(() => {
      bridge.update(
        "mobility",
        { ...initial.mobility, maxStep: 2 },
        "mobility",
      );
    });
    const speed = container.querySelector<HTMLSelectElement>(
      "#mobilityPlaybackSpeed",
    );
    expect(
      [...(speed?.options ?? [])].find((option) => option.defaultSelected)
        ?.value,
    ).toBe("1");
    fireEvent.input(
      container.querySelector("#mobilityStepSlider") as HTMLInputElement,
      { target: { value: "1" } },
    );
    await waitFor(() => {
      expect(mobilityHandler).toHaveBeenCalledWith({
        name: "mobility.timeline.seek",
        featureId: "mobility",
        payload: { value: 1 },
      });
    });
    act(() => {
      bridge.dispose();
    });
    expect(container.childNodes).toHaveLength(0);
  });

  it("owns the DeepMIMO dataset tray and preserves download semantics", async () => {
    const container = mountContainer();
    const onToggle = vi.fn();
    let bridge!: ReturnType<typeof createDeepMimoDatasetBridge>;
    act(() => {
      bridge = createDeepMimoDatasetBridge({
        container,
        onToggle,
        reportError: vi.fn(),
      });
    });

    act(() => {
      bridge.update({
        visible: true,
        expanded: true,
        datasets: [
          {
            jobId: "job-1",
            scenarioName: "Hong Kong",
            detail: "128 receivers",
            archiveName: "hong-kong.zip",
            downloadUrl: "/api/deepmimo/jobs/job-1/download",
          },
        ],
      });
    });

    expect(container.querySelector("#deepMimoDatasetCount")?.textContent).toBe(
      "1",
    );
    const download = container.querySelector<HTMLAnchorElement>(
      "#deepMimoDatasetList a[download]",
    );
    expect(download?.getAttribute("href")).toBe(
      "/api/deepmimo/jobs/job-1/download",
    );
    expect(download?.download).toBe("hong-kong.zip");
    fireEvent.click(
      container.querySelector("#deepMimoDatasetToggle") as HTMLButtonElement,
    );
    await waitFor(() => {
      expect(onToggle).toHaveBeenCalledOnce();
    });

    act(() => {
      bridge.dispose();
    });
    expect(container.childNodes).toHaveLength(0);
  });
});
