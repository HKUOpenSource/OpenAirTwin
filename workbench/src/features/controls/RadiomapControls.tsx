import {
  SegmentedControl,
  SegmentedControlItem,
} from "@astryxdesign/core/SegmentedControl";

import { useUiCommand } from "../../app/use-ui-command.ts";
import type { ControlsSnapshot } from "../../runtime/workbench-store.ts";
import { formatFixed1 } from "../../ui/number-format.ts";
import {
  InlineNumberField,
  InspectorRow,
  InspectorSection,
  ParamSelect,
} from "../../ui/ParamFields.tsx";

const DENSITY_SEGMENTS = [
  { value: "1", label: "D1" },
  { value: "2", label: "D2" },
  { value: "3", label: "D3" },
  { value: "4", label: "D4" },
] as const;

const COLORMAP_GRADIENTS: Readonly<Record<string, string>> = {
  viridis:
    "linear-gradient(90deg, #440154 0%, #482878 13%, #3e4a89 25%, #31688e 38%, #26828e 50%, #1f9e89 63%, #35b779 75%, #6dcd59 88%, #fde725 100%)",
  plasma:
    "linear-gradient(90deg, #0d0887 0%, #4b03a1 13%, #7d03a8 25%, #a82296 38%, #cb4679 50%, #e56b5d 63%, #f89441 75%, #fdc328 88%, #f0f921 100%)",
  inferno:
    "linear-gradient(90deg, #000004 0%, #1f0c48 13%, #550f6d 25%, #88226a 38%, #ba3655 50%, #e35933 63%, #f98c0a 75%, #f9c932 88%, #fcffa4 100%)",
  magma:
    "linear-gradient(90deg, #000004 0%, #1c1044 13%, #4f127b 25%, #812581 38%, #b5367a 50%, #e55064 63%, #fb8761 75%, #fec287 88%, #fcfdbf 100%)",
  turbo:
    "linear-gradient(90deg, #30123b 0%, #3264b2 13%, #1f96d2 25%, #27c192 38%, #9ad73f 50%, #f5c82f 63%, #fa8426 75%, #dc3220 88%, #7a0403 100%)",
  jet: "linear-gradient(90deg, #000080 0%, #0000ff 16%, #00a0ff 36%, #00ffff 50%, #ffff00 68%, #ffa000 82%, #ff0000 93%, #800000 100%)",
};

function renderColormapItem(name: string) {
  const gradient =
    COLORMAP_GRADIENTS[name.toLowerCase()] ?? COLORMAP_GRADIENTS.jet;
  return (
    <span className="oat-colormap-option">
      <span
        className="oat-colormap-swatch"
        style={{ background: gradient }}
        aria-hidden="true"
      />
      <span className="oat-colormap-name">{name}</span>
    </span>
  );
}

export function RadiomapControls({
  controls,
}: {
  readonly controls: ControlsSnapshot;
}) {
  const dispatch = useUiCommand();
  const { radiomap, capabilities } = controls;

  const updateSurface = (field: string, value: number | null) => {
    void dispatch({
      name: "workbench.control.update",
      payload: { scope: "radiomap.surface", field, value },
    });
  };

  const updateDisplay = (field: string, value: string | number) => {
    void dispatch({
      name: "workbench.control.update",
      payload: { scope: "radiomap.display", field, value },
    });
  };

  return (
    <div data-testid="radiomap-controls">
      <InspectorSection title="Receiver Patch & Grid">
        <InspectorRow
          label="Patch Size (m)"
          tooltip="Coverage patch width (X) and depth (Y)."
        >
          <div className="oat-axis-pair">
            <InlineNumberField
              label="Patch Size X"
              prefix="X"
              tooltip="Coverage patch width along X."
              min={5}
              max={2000}
              step={5}
              formatValue={formatFixed1}
              value={radiomap.sizeX}
              onChange={(v) => {
                updateSurface("sizeX", v);
              }}
            />
            <InlineNumberField
              label="Patch Size Y"
              prefix="Y"
              tooltip="Coverage patch depth along Y."
              min={5}
              max={2000}
              step={5}
              formatValue={formatFixed1}
              value={radiomap.sizeY}
              onChange={(v) => {
                updateSurface("sizeY", v);
              }}
            />
          </div>
        </InspectorRow>

        <InspectorRow
          label="Height Offset"
          tooltip="Sampling height above terrain."
        >
          <InlineNumberField
            label="Height Offset"
            units="m"
            min={0}
            max={200}
            step={0.5}
            formatValue={formatFixed1}
            value={radiomap.heightOffset}
            onChange={(v) => {
              updateSurface("heightOffset", v);
            }}
          />
        </InspectorRow>

        <InspectorRow
          label="Cell Size"
          tooltip="Grid cell size; leave blank for Auto density."
        >
          <InlineNumberField
            label="Cell Size"
            units="m"
            min={0.5}
            max={50}
            step={0.5}
            formatValue={formatFixed1}
            value={radiomap.cellSize}
            placeholder="Auto"
            hasClear
            onChange={(v) => {
              updateSurface("cellSize", v);
            }}
            onClear={() => {
              updateSurface("cellSize", null);
            }}
          />
        </InspectorRow>

        <InspectorRow
          label="Density Level"
          tooltip="Auto grid resolution (D1 coarse to D4 ultra)."
        >
          <SegmentedControl
            label="Density Level"
            size="sm"
            layout="fill"
            value={String(radiomap.densityLevel)}
            onChange={(v) => {
              updateSurface("densityLevel", Number(v));
            }}
          >
            {DENSITY_SEGMENTS.map((item) => (
              <SegmentedControlItem
                key={item.value}
                value={item.value}
                label={item.label}
              />
            ))}
          </SegmentedControl>
        </InspectorRow>

        <InspectorRow
          label="Samples / Tx"
          tooltip="Base Monte Carlo rays per transmitter."
        >
          <InlineNumberField
            label="Samples / Tx"
            min={1000}
            step={50000}
            isIntegerOnly
            value={radiomap.samplesPerTx}
            onChange={(v) => {
              updateSurface("samplesPerTx", v);
            }}
          />
        </InspectorRow>
      </InspectorSection>

      <InspectorSection title="Heatmap Display" dividers={[]}>
        <InspectorRow
          label="Colormap"
          tooltip="Color scale for heatmap overlay and legend."
        >
          <ParamSelect
            label="Colormap"
            isLabelHidden
            value={radiomap.colormap}
            options={capabilities.colormaps.map((name) => ({
              value: name,
              label: name,
            }))}
            renderValue={(option) => renderColormapItem(option.value)}
            renderOption={(option) => renderColormapItem(option.value)}
            onChange={(v) => {
              updateDisplay("colormap", v);
            }}
          />
        </InspectorRow>

        <InspectorRow
          label="Range (dB)"
          tooltip="Display min/max dB bounds for heatmap coloring."
        >
          <div className="oat-axis-pair">
            <InlineNumberField
              label="Color Min"
              prefix="Min"
              tooltip="Lower dB bound for heatmap coloring."
              step={5}
              formatValue={formatFixed1}
              value={radiomap.colorMinDb}
              onChange={(v) => {
                updateDisplay("colorMinDb", v);
              }}
            />
            <InlineNumberField
              label="Color Max"
              prefix="Max"
              tooltip="Upper dB bound for heatmap coloring."
              step={5}
              formatValue={formatFixed1}
              value={radiomap.colorMaxDb}
              onChange={(v) => {
                updateDisplay("colorMaxDb", v);
              }}
            />
          </div>
        </InspectorRow>
      </InspectorSection>
    </div>
  );
}
