import { Badge } from "@astryxdesign/core/Badge";

import { useUiCommand } from "../../app/use-ui-command.ts";
import type { ControlsSnapshot } from "../../runtime/workbench-store.ts";
import { formatFixed1 } from "../../ui/number-format.ts";
import {
  InlineNumberField,
  InspectorRow,
  InspectorSection,
  InspectorSwitchRow,
  ParamText,
} from "../../ui/ParamFields.tsx";

export function DeepMimoControls({
  controls,
}: {
  readonly controls: ControlsSnapshot;
}) {
  const dispatch = useUiCommand();
  const { deepmimo } = controls;

  const update = (field: string, value: string | number | boolean) => {
    void dispatch({
      name: "workbench.control.update",
      payload: { scope: "deepmimo", field, value },
    });
  };

  return (
    <div data-testid="deepmimo-controls">
      <InspectorSection title="Scenario & Receiver ROI">
        <InspectorRow
          label="Scenario"
          tooltip="Exported DeepMIMO dataset folder name."
        >
          <ParamText
            label="Scenario Name"
            isLabelHidden
            value={deepmimo.scenarioName}
            placeholder="hku_deepmimo_roi"
            onChange={(v) => {
              update("scenarioName", v);
            }}
          />
        </InspectorRow>

        <InspectorRow
          label="ROI Center (m)"
          tooltip="ROI center (X, Y) in local scene coordinates."
        >
          <div className="oat-axis-pair">
            <InlineNumberField
              label="ROI Center X"
              prefix="X"
              tooltip="ROI center X coordinate."
              step={1}
              formatValue={formatFixed1}
              value={deepmimo.roiCenterX}
              placeholder="--"
              onChange={(v) => {
                update("roiCenterX", v);
              }}
            />
            <InlineNumberField
              label="ROI Center Y"
              prefix="Y"
              tooltip="ROI center Y coordinate."
              step={1}
              formatValue={formatFixed1}
              value={deepmimo.roiCenterY}
              placeholder="--"
              onChange={(v) => {
                update("roiCenterY", v);
              }}
            />
          </div>
        </InspectorRow>

        <InspectorRow
          label="ROI Size (m)"
          tooltip="ROI width (X) and length (Y)."
        >
          <div className="oat-axis-pair">
            <InlineNumberField
              label="ROI Width"
              prefix="W"
              tooltip="ROI span along X."
              min={1}
              step={1}
              formatValue={formatFixed1}
              value={deepmimo.roiWidth}
              placeholder="--"
              onChange={(v) => {
                update("roiWidth", v);
              }}
            />
            <InlineNumberField
              label="ROI Length"
              prefix="L"
              tooltip="ROI span along Y."
              min={1}
              step={1}
              formatValue={formatFixed1}
              value={deepmimo.roiLength}
              placeholder="--"
              onChange={(v) => {
                update("roiLength", v);
              }}
            />
          </div>
        </InspectorRow>

        <InspectorRow
          label="Rx Candidates"
          tooltip="Estimated receiver grid points before filtering."
        >
          <Badge label={deepmimo.rxCandidatesText} variant="info" />
        </InspectorRow>
      </InspectorSection>

      <InspectorSection title="Receiver Grid & Export Budget" dividers={[]}>
        <InspectorRow
          label="Grid Spacing"
          tooltip="Spacing between receiver grid points."
        >
          <InlineNumberField
            label="Grid Spacing"
            units="m"
            min={0.1}
            step={0.5}
            formatValue={formatFixed1}
            value={deepmimo.gridSpacing}
            onChange={(v) => {
              update("gridSpacing", v);
            }}
          />
        </InspectorRow>

        <InspectorRow
          label="Rx Height"
          tooltip="Receiver height above terrain."
        >
          <InlineNumberField
            label="Rx Height"
            units="m"
            min={0}
            step={0.5}
            formatValue={formatFixed1}
            value={deepmimo.rxHeight}
            onChange={(v) => {
              update("rxHeight", v);
            }}
          />
        </InspectorRow>

        <InspectorRow
          label="Max Receivers"
          tooltip="Maximum receiver points allowed per export."
        >
          <InlineNumberField
            label="Max Receivers"
            min={1}
            step={1000}
            isIntegerOnly
            value={deepmimo.maxReceivers}
            onChange={(v) => {
              update("maxReceivers", v);
            }}
          />
        </InspectorRow>

        <InspectorRow
          label="Chunk Size"
          tooltip="Receivers traced per worker batch."
        >
          <InlineNumberField
            label="Chunk Size"
            min={1}
            step={128}
            isIntegerOnly
            value={deepmimo.chunkSize}
            onChange={(v) => {
              update("chunkSize", v);
            }}
          />
        </InspectorRow>

        <InspectorRow
          label="Samples / Src"
          tooltip="Monte Carlo rays per transmitter per chunk."
        >
          <InlineNumberField
            label="Samples / Src"
            min={100}
            step={1000}
            isIntegerOnly
            value={deepmimo.samplesPerSrc}
            onChange={(v) => {
              update("samplesPerSrc", v);
            }}
          />
        </InspectorRow>

        <InspectorRow
          label="Max Paths"
          tooltip="Maximum paths retained per solve."
        >
          <InlineNumberField
            label="Max Paths"
            min={1}
            step={1000}
            isIntegerOnly
            value={deepmimo.maxNumPathsPerSrc}
            onChange={(v) => {
              update("maxNumPathsPerSrc", v);
            }}
          />
        </InspectorRow>

        <InspectorSwitchRow
          label="Filter Indoor"
          switchLabel="Filter Indoor / Building Points"
          checked={deepmimo.filterBuildings}
          tooltip="Exclude receiver points inside building footprints."
          onChange={(v) => {
            update("filterBuildings", v);
          }}
        />
      </InspectorSection>
    </div>
  );
}
