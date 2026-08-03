import { act, fireEvent, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { mountAppShell } from "../app-shell/app-shell-runtime.tsx";
import { createInitialResultDockSnapshot } from "../features/results/contracts.ts";

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

describe("React result models", () => {
  it("hides retained Link path details outside the Link result mode", () => {
    const container = mountContainer();
    let runtime!: ReturnType<typeof mountAppShell>;
    act(() => {
      runtime = mountAppShell({
        activeMode: "link",
        container,
        reportError: vi.fn(),
      });
    });
    const model = runtime.results;
    const initial = createInitialResultDockSnapshot();
    const linkModel = {
      ...initial.link,
      status: "success" as const,
      visible: true,
      paths: {
        visible: true,
        featureId: "link" as const,
        countLabel: "1 path",
        meta: "1 valid",
        selectedIndex: 0,
        rows: [],
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
    };

    act(() => {
      model.update("link", linkModel, "link");
    });
    const detail = container.querySelector<HTMLElement>("#pathDetailSection");
    expect(detail?.classList.contains("hidden")).toBe(false);
    expect(detail?.getAttribute("aria-hidden")).toBe("false");
    expect(detail?.textContent).toContain("-81.25 dB");

    act(() => {
      model.update(
        "radiomap",
        { ...initial.radiomap, visible: true },
        "radiomap",
      );
    });
    expect(detail?.classList.contains("hidden")).toBe(true);
    expect(detail?.getAttribute("aria-hidden")).toBe("true");

    act(() => {
      model.update("link", linkModel, null);
    });
    expect(detail?.classList.contains("hidden")).toBe(true);
    expect(detail?.getAttribute("aria-hidden")).toBe("true");

    act(() => {
      model.update("link", linkModel, "link");
    });
    expect(detail?.classList.contains("hidden")).toBe(false);
    expect(detail?.getAttribute("aria-hidden")).toBe("false");
    expect(detail?.textContent).toContain("-81.25 dB");

    act(() => {
      runtime.dispose();
    });
  });

  it("keeps chart hosts stable while Link data and commands update", async () => {
    const container = mountContainer();
    let runtime!: ReturnType<typeof mountAppShell>;
    act(() => {
      runtime = mountAppShell({
        activeMode: "link",
        container,
        reportError: vi.fn(),
      });
    });
    const model = runtime.results;
    const initial = createInitialResultDockSnapshot();
    const commandHandler = vi.fn();
    model.registerCommandHandler("link", commandHandler);
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
    const chartHost = model.element("linkTapChart");

    act(() => {
      model.update(
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
      model.update("link", initial.link, null);
    });
    expect(model.element("linkTapChart")).toBe(chartHost);

    const mobilityHandler = vi.fn();
    model.registerCommandHandler("mobility", mobilityHandler);
    act(() => {
      model.update("mobility", { ...initial.mobility, maxStep: 2 }, "mobility");
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
      runtime.dispose();
    });
    expect(container.childNodes).toHaveLength(0);
  });

  it("owns the DeepMIMO dataset tray and preserves download semantics", async () => {
    const container = mountContainer();
    const onToggle = vi.fn();
    let runtime!: ReturnType<typeof mountAppShell>;
    act(() => {
      runtime = mountAppShell({
        activeMode: "link",
        container,
        reportError: vi.fn(),
      });
      runtime.setDatasetToggleHandler(onToggle);
    });
    const model = runtime.datasets;

    act(() => {
      model.update({
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
      runtime.dispose();
    });
    expect(container.childNodes).toHaveLength(0);
  });
});
