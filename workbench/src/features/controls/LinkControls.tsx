import { useUiCommand } from "../../app/use-ui-command.ts";
import type { ControlsSnapshot } from "../../runtime/workbench-store.ts";
import { formatFixed1, formatFixed2 } from "../../ui/number-format.ts";
import {
  InlineNumberField,
  InspectorRow,
  InspectorSection,
  InspectorSwitchRow,
  MultiToggleRow,
} from "../../ui/ParamFields.tsx";

const LINK_FLAG_KEYS = [
  "syntheticArray",
  "diffraction",
  "edgeDiffraction",
  "diffractionLitRegion",
] as const;

export function LinkControls({
  controls,
}: {
  readonly controls: ControlsSnapshot;
}) {
  const dispatch = useUiCommand();
  const { link } = controls;

  const updateLink = (field: string, value: number | boolean) => {
    void dispatch({
      name: "workbench.control.update",
      payload: { scope: "link", field, value },
    });
  };

  const updatePreview = (field: string, value: number | boolean) => {
    void dispatch({
      name: "workbench.control.update",
      payload: { scope: "livePreview", field, value },
    });
  };

  const activeFlags = LINK_FLAG_KEYS.filter((key) => link[key]);
  const handleFlagsChange = (next: string[]) => {
    const selected = new Set(next);
    for (const key of LINK_FLAG_KEYS) {
      const enabled = selected.has(key);
      if (link[key] !== enabled) {
        updateLink(key, enabled);
      }
    }
  };

  return (
    <div data-testid="link-controls">
      <InspectorSection title="Channel & Taps">
        <InspectorRow
          label="Bandwidth"
          tooltip="Channel bandwidth; wider improves delay resolution."
        >
          <InlineNumberField
            label="Bandwidth"
            units="MHz"
            min={0.001}
            step={0.1}
            formatValue={formatFixed1}
            value={link.bandwidthMhz}
            onChange={(v) => {
              updateLink("bandwidthMhz", v);
            }}
          />
        </InspectorRow>

        <InspectorRow
          label="OFDM Carriers"
          tooltip="OFDM frequency bins for CIR and tap output."
        >
          <InlineNumberField
            label="OFDM Carriers"
            min={1}
            step={1}
            isIntegerOnly
            value={link.tapFftSize}
            onChange={(v) => {
              updateLink("tapFftSize", v);
            }}
          />
        </InspectorRow>

        <InspectorRow
          label="Subcarrier Δf"
          tooltip="Subcarrier spacing (bandwidth / OFDM carriers)."
        >
          <InlineNumberField
            label="Subcarrier Δf"
            units="kHz"
            formatValue={formatFixed2}
            value={link.tapSubcarrierSpacingHz / 1000}
            isReadOnly
            onChange={() => undefined}
          />
        </InspectorRow>

        <InspectorSwitchRow
          label="Discrete Taps"
          switchLabel="Compute Discrete Taps"
          checked={link.computeTaps}
          tooltip="Compute discrete channel taps and Power Delay Profile."
          onChange={(v) => {
            updateLink("computeTaps", v);
          }}
        />

        {link.computeTaps ? (
          <InspectorRow
            label="Tap Window"
            tooltip="Discrete tap index range [L0, L1] to report."
          >
            <div className="oat-axis-pair">
              <InlineNumberField
                label="l_min"
                prefix="lmin"
                tooltip="First discrete tap index."
                step={1}
                isIntegerOnly
                value={link.tapLMin}
                onChange={(v) => {
                  updateLink("tapLMin", v);
                }}
              />
              <InlineNumberField
                label="l_max"
                prefix="lmax"
                tooltip="Last discrete tap index."
                step={1}
                isIntegerOnly
                value={link.tapLMax}
                onChange={(v) => {
                  updateLink("tapLMax", v);
                }}
              />
            </div>
          </InspectorRow>
        ) : null}
      </InspectorSection>

      <InspectorSection title="Path Solver Budget" dividers={[]}>
        <InspectorRow
          label="Samples / Src"
          tooltip="Monte Carlo rays launched per transmitter."
        >
          <InlineNumberField
            label="Samples / Src"
            min={100}
            step={1000}
            isIntegerOnly
            value={link.samplesPerSrc}
            onChange={(v) => {
              updateLink("samplesPerSrc", v);
            }}
          />
        </InspectorRow>

        <InspectorRow
          label="Max Paths"
          tooltip="Maximum propagation paths retained per transmitter."
        >
          <InlineNumberField
            label="Max Paths"
            min={1}
            step={1000}
            isIntegerOnly
            value={link.maxNumPathsPerSrc}
            onChange={(v) => {
              updateLink("maxNumPathsPerSrc", v);
            }}
          />
        </InspectorRow>

        <InspectorRow
          label="Ray Options"
          align="start"
          tooltip="Additional ray-tracing diffraction and array options."
        >
          <MultiToggleRow
            label="Link ray tracing options"
            options={[
              {
                id: "syntheticArray",
                label: "Synthetic",
                tooltip: "Use synthetic antenna array approximation.",
              },
              {
                id: "diffraction",
                label: "Diffraction",
                tooltip: "Trace ray bending around edges and wedges.",
              },
              {
                id: "edgeDiffraction",
                label: "Edge Diff",
                tooltip: "Search explicit edge-diffraction paths.",
                disabled: !link.diffraction,
              },
              {
                id: "diffractionLitRegion",
                label: "Lit Region",
                tooltip:
                  "Include lit-region diffraction near shadow boundaries.",
                disabled: !link.diffraction,
              },
            ]}
            value={activeFlags}
            onChange={handleFlagsChange}
          />
        </InspectorRow>

        <InspectorSwitchRow
          label="Live Preview"
          switchLabel="Enable Live Preview"
          checked={link.livePreviewEnabled}
          tooltip="Preview paths live while dragging Tx/Rx."
          onChange={(v) => {
            updatePreview("enabled", v);
          }}
        />
        {link.livePreviewEnabled ? (
          <>
            <InspectorRow
              label="Preview Samples"
              tooltip="Ray samples used during live drag previews."
            >
              <InlineNumberField
                label="Preview Samples"
                min={100}
                step={500}
                isIntegerOnly
                value={link.livePreviewSamples}
                onChange={(v) => {
                  updatePreview("previewSamplesPerSrc", v);
                }}
              />
            </InspectorRow>
            <InspectorRow
              label="Refine Delay"
              tooltip="Idle delay before running the final solve."
            >
              <InlineNumberField
                label="Refine Delay"
                units="s"
                min={0.1}
                max={10}
                step={0.1}
                formatValue={formatFixed1}
                value={link.livePreviewPathsDelay}
                onChange={(v) => {
                  updatePreview("pathsDelayS", v);
                }}
              />
            </InspectorRow>
          </>
        ) : null}
      </InspectorSection>
    </div>
  );
}
