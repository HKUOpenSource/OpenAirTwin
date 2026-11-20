import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Theme } from "@astryxdesign/core/theme";
import { neutralTheme } from "@astryxdesign/theme-neutral/built";

import {
  InlineNumberField,
  InspectorRow,
  InspectorSection,
  MultiToggleRow,
  ParamCheckbox,
  ParamGrid,
  ParamNumber,
  ParamSection,
  ParamSelect,
  ParamSwitch,
  ParamText,
  SliderNumberRow,
} from "../ui/ParamFields.tsx";
import {
  formatCompactNumber,
  formatFixed1,
  formatFixed2,
  formatInteger,
} from "../ui/number-format.ts";
import {
  ChartFrame,
  DockEmptyState,
  KeyValueList,
  MetricGrid,
  StatusBadge,
} from "../ui/WorkbenchChrome.tsx";

function renderWithTheme(ui: React.ReactElement) {
  return render(
    <Theme theme={neutralTheme} mode="light">
      {ui}
    </Theme>,
  );
}

describe("Astryx domain UI primitives", () => {
  it("renders ParamNumber with label, units, and accessible value", () => {
    const onChange = vi.fn();
    renderWithTheme(
      <ParamGrid columns={2}>
        <ParamNumber
          label="Carrier Freq"
          units="GHz"
          value={3.5}
          min={0.1}
          max={100}
          step={0.1}
          tooltip="RF carrier frequency"
          onChange={onChange}
        />
        <ParamText label="Scenario" value="hku_roi" onChange={vi.fn()} />
      </ParamGrid>,
    );
    expect(screen.getByText("Carrier Freq")).toBeTruthy();
    expect(screen.getByText("GHz")).toBeTruthy();
    expect(screen.getByDisplayValue("3.5")).toBeTruthy();
    expect(screen.getByDisplayValue("hku_roi")).toBeTruthy();
  });

  it("renders ParamSelect, ParamCheckbox, ParamSwitch, and ParamSection", () => {
    renderWithTheme(
      <ParamSection title="Propagation" defaultIsOpen>
        <ParamSelect
          label="Pattern"
          value="iso"
          options={[
            { value: "iso", label: "iso" },
            { value: "dipole", label: "dipole" },
          ]}
          onChange={vi.fn()}
        />
        <ParamCheckbox label="Line of Sight" checked onChange={vi.fn()} />
        <ParamSwitch label="Live Preview" checked={false} onChange={vi.fn()} />
      </ParamSection>,
    );
    expect(screen.getByText("Propagation")).toBeTruthy();
    expect(screen.getByText("Line of Sight")).toBeTruthy();
    expect(screen.getByText("Live Preview")).toBeTruthy();
  });

  it("renders MetricGrid, StatusBadge, ChartFrame, and DockEmptyState", () => {
    renderWithTheme(
      <>
        <MetricGrid
          items={[
            { id: "gain", label: "Path Gain", value: "-84.2 dB" },
            { id: "paths", label: "Paths", value: "12" },
          ]}
        />
        <StatusBadge label="Ready" tone="success" />
        <ChartFrame title="Power Delay Profile">
          <svg data-testid="chart-svg" />
        </ChartFrame>
        <DockEmptyState title="No data" description="Run a solve to begin." />
      </>,
    );
    expect(screen.getByText("Path Gain")).toBeTruthy();
    expect(screen.getByText("-84.2 dB")).toBeTruthy();
    expect(screen.getByText("Ready")).toBeTruthy();
    expect(screen.getByText("Power Delay Profile")).toBeTruthy();
    expect(screen.getByTestId("chart-svg")).toBeTruthy();
    expect(screen.getByText("No data")).toBeTruthy();
  });

  it("formats numbers cleanly and renders CAD inspector primitives", () => {
    expect(formatFixed1(-0.0001)).toBe("0");
    expect(formatFixed1(12.3456)).toBe("12.3");
    expect(formatFixed2(3.5)).toBe("3.5");
    expect(formatFixed2(122.0703125)).toBe("122.07");
    expect(formatInteger(12.4)).toBe("12");
    expect(formatCompactNumber(0.01, 4)).toBe("0.01");

    renderWithTheme(
      <InspectorSection title="Solver">
        <InspectorRow label="Max Depth">
          <SliderNumberRow
            label="Max Depth"
            min={0}
            max={12}
            step={1}
            isIntegerOnly
            value={3}
            onChange={vi.fn()}
          />
        </InspectorRow>
        <InspectorRow label="Position">
          <InlineNumberField
            label="X"
            prefix="X"
            formatValue={formatFixed1}
            value={12.3456}
            onChange={vi.fn()}
          />
        </InspectorRow>
        <InspectorRow label="Propagation">
          <MultiToggleRow
            label="Propagation"
            options={[
              { id: "los", label: "LOS" },
              { id: "specular", label: "Specular" },
            ]}
            value={["los"]}
            onChange={vi.fn()}
          />
        </InspectorRow>
        <KeyValueList
          items={[{ id: "delta-r", label: "ΔRange", value: "1.50 m" }]}
        />
      </InspectorSection>,
    );

    expect(screen.getByRole("slider", { name: "Max Depth" })).toBeTruthy();
    expect(screen.getByRole("spinbutton", { name: "Max Depth" })).toBeTruthy();
    expect(screen.getByDisplayValue("12.3")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "LOS" }).getAttribute("aria-pressed"),
    ).toBe("true");
    expect(screen.getByText("1.50 m")).toBeTruthy();
  });
});
