import { useEffect, useRef } from "react";
import { Badge } from "@astryxdesign/core/Badge";
import { Button } from "@astryxdesign/core/Button";
import { HStack } from "@astryxdesign/core/HStack";
import { IconButton } from "@astryxdesign/core/IconButton";
import { InfoTip } from "@astryxdesign/core/InfoTip";
import {
  SegmentedControl,
  SegmentedControlItem,
} from "@astryxdesign/core/SegmentedControl";
import { Text } from "@astryxdesign/core/Text";
import {
  ChevronLeft,
  ChevronRight,
  Crosshair,
  Focus,
  Plus,
  Trash2,
} from "lucide-react";

import { useUiCommand } from "../../app/use-ui-command.ts";
import type { ImperativeHostRegistry } from "../../runtime/host-registry.ts";
import type { ControlsSnapshot } from "../../runtime/workbench-store.ts";
import {
  formatCompactNumber,
  formatFixed1,
  formatFixed2,
} from "../../ui/number-format.ts";
import {
  InlineNumberField,
  InspectorRow,
  InspectorSection,
  InspectorSwitchRow,
  MultiToggleRow,
  ParamSelect,
  SliderNumberRow,
} from "../../ui/ParamFields.tsx";
import { DockEmptyState, KeyValueList } from "../../ui/WorkbenchChrome.tsx";

const RADAR_MECHANISM_KEYS = [
  "los",
  "specularReflection",
  "diffuseReflection",
  "refraction",
  "diffraction",
  "syntheticArray",
] as const;

function formatCompact4(value: number): string {
  return formatCompactNumber(value, 4);
}

function formatPfa(value: number): string {
  if (!Number.isFinite(value)) return "";
  return value < 1e-3 ? value.toExponential(1) : formatCompactNumber(value, 4);
}

export function RadarWorkflowControls({
  controls,
  hosts,
}: {
  readonly controls: ControlsSnapshot;
  readonly hosts: ImperativeHostRegistry;
}) {
  const dispatch = useUiCommand();
  const { radar } = controls;
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    hosts.register("radarAssetPreviewCanvas", previewCanvasRef.current);
    void dispatch({
      name: "workbench.control.group.toggle",
      payload: { controlId: "radarTargetsGroup", open: true },
    });
    return () => {
      hosts.register("radarAssetPreviewCanvas", null);
    };
  }, [dispatch, hosts]);

  const updateWaveform = (field: string, value: number) => {
    void dispatch({
      name: "workbench.control.update",
      payload: { scope: "radar.waveform", field, value },
    });
  };

  const updateTarget = (field: string, value: string | number) => {
    void dispatch({
      name: "workbench.control.update",
      payload: { scope: "radar.target", field, value },
    });
  };

  return (
    <div data-testid="radar-workflow-controls">
      <InspectorSection
        title="Radar Geometry"
        actions={
          <InfoTip
            size="xsm"
            content={radar.modeHint}
            label="About radar geometry"
          />
        }
      >
        <SegmentedControl
          label="Radar geometry mode"
          size="sm"
          layout="fill"
          value={radar.mode}
          onChange={(mode) => {
            void dispatch({
              name: "workbench.control.update",
              payload: { scope: "radar", field: "mode", value: mode },
            });
          }}
        >
          <SegmentedControlItem value="monostatic" label="Monostatic" />
          <SegmentedControlItem value="bistatic" label="Bistatic" />
        </SegmentedControl>
      </InspectorSection>

      <InspectorSection title={`Drone Targets (${radar.targetCountLabel})`}>
        <HStack hAlign="between" vAlign="center" gap={1}>
          <IconButton
            label="Previous drone model"
            size="sm"
            variant="ghost"
            isDisabled={!radar.hasMultipleAssets}
            icon={<ChevronLeft size={15} />}
            onClick={() => {
              void dispatch({
                name: "workbench.control.action",
                payload: { actionId: "btnRadarAssetPrevious" },
              });
            }}
          />
          <Text type="label" weight="semibold" maxLines={1} hasTabularNumbers>
            {`${radar.pickerAssetName} (${radar.pickerCountLabel})`}
          </Text>
          <IconButton
            label="Next drone model"
            size="sm"
            variant="ghost"
            isDisabled={!radar.hasMultipleAssets}
            icon={<ChevronRight size={15} />}
            onClick={() => {
              void dispatch({
                name: "workbench.control.action",
                payload: { actionId: "btnRadarAssetNext" },
              });
            }}
          />
        </HStack>

        <div style={{ position: "relative" }}>
          <canvas
            id="radarAssetPreviewCanvas"
            ref={previewCanvasRef}
            className="radarAssetPreviewCanvas"
            aria-label={`Interactive 3D preview of ${radar.pickerAssetName}`}
          />
          {radar.pickerState !== "ready" && radar.pickerStatus ? (
            <div
              style={{
                position: "absolute",
                inset: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: "rgba(248, 250, 252, 0.78)",
              }}
            >
              <Badge
                label={radar.pickerStatus}
                variant={radar.pickerState === "error" ? "error" : "neutral"}
              />
            </div>
          ) : null}
        </div>

        <Button
          label="Add Target to Scene"
          size="sm"
          variant="secondary"
          width="100%"
          icon={<Plus size={14} />}
          isDisabled={!radar.canAddTarget}
          {...(radar.addTargetDisabledReason
            ? { tooltip: radar.addTargetDisabledReason }
            : {})}
          onClick={() => {
            void dispatch({
              name: "workbench.control.action",
              payload: { actionId: "btnAddRadarTarget" },
            });
          }}
        />

        {radar.targets.length === 0 ? (
          <DockEmptyState
            title="No radar targets"
            description="Select a drone model above and add it to the 3D scene."
          />
        ) : (
          <div className="oat-row-list" data-testid="radar-target-list">
            {radar.targets.map((target) => (
              <button
                key={target.id}
                type="button"
                className="oat-list-row"
                data-selected={target.selected}
                aria-pressed={target.selected}
                onClick={() => {
                  void dispatch({
                    name: "workbench.control.action",
                    payload: {
                      actionId: "radarTarget.select",
                      value: target.id,
                    },
                  });
                }}
              >
                <div className="oat-list-row-head">
                  <HStack gap={1.5} vAlign="center" style={{ minWidth: 0 }}>
                    <span
                      className="oat-target-dot"
                      style={{ backgroundColor: target.color }}
                    />
                    <span className="oat-list-row-title">{target.title}</span>
                  </HStack>
                </div>
                <div className="oat-list-row-meta">{target.meta}</div>
              </button>
            ))}
          </div>
        )}
      </InspectorSection>

      {radar.selectedTarget ? (
        <InspectorSection
          title={radar.selectedTarget.title}
          actions={
            <HStack gap={0.5}>
              <IconButton
                label="Pick target position in 3D"
                tooltip="Pick position in scene"
                size="sm"
                variant={
                  controls.deviceBar.activeTarget === "radar-target"
                    ? "primary"
                    : "ghost"
                }
                icon={<Crosshair size={14} />}
                onClick={() => {
                  void dispatch({
                    name: "workbench.control.action",
                    payload: { actionId: "btnPickRadarTarget" },
                  });
                }}
              />
              <IconButton
                label="Focus camera on target"
                tooltip="Focus target"
                size="sm"
                variant="ghost"
                icon={<Focus size={14} />}
                onClick={() => {
                  void dispatch({
                    name: "workbench.control.action",
                    payload: { actionId: "btnFocusRadarTarget" },
                  });
                }}
              />
              <IconButton
                label="Remove selected target"
                tooltip="Remove target"
                size="sm"
                variant="ghost"
                icon={<Trash2 size={14} />}
                onClick={() => {
                  void dispatch({
                    name: "workbench.control.action",
                    payload: { actionId: "btnRemoveRadarTarget" },
                  });
                }}
              />
            </HStack>
          }
        >
          <InspectorRow label="Model" tooltip="3D drone model for this target.">
            <ParamSelect
              label="Drone Model"
              isLabelHidden
              value={radar.selectedTarget.assetId}
              options={radar.assets.map((asset) => ({
                value: asset.id,
                label: asset.label,
              }))}
              onChange={(v) => {
                updateTarget("assetId", v);
              }}
            />
          </InspectorRow>

          <InspectorRow
            label="Position XY (m)"
            tooltip="Target horizontal (X, Y) coordinates."
          >
            <div className="oat-axis-pair">
              <InlineNumberField
                label="X"
                prefix="X"
                tooltip="Target X coordinate."
                step={0.5}
                formatValue={formatFixed1}
                value={radar.selectedTarget.position[0]}
                onChange={(v) => {
                  updateTarget("x", v);
                }}
              />
              <InlineNumberField
                label="Y"
                prefix="Y"
                tooltip="Target Y coordinate."
                step={0.5}
                formatValue={formatFixed1}
                value={radar.selectedTarget.position[1]}
                onChange={(v) => {
                  updateTarget("y", v);
                }}
              />
            </div>
          </InspectorRow>

          <InspectorRow
            label="Alt (m) / RCS"
            tooltip="Target altitude (Z) and radar cross section."
          >
            <div className="oat-axis-pair">
              <InlineNumberField
                label="Z"
                prefix="Z"
                tooltip="Target altitude coordinate."
                step={0.5}
                formatValue={formatFixed1}
                value={radar.selectedTarget.position[2]}
                onChange={(v) => {
                  updateTarget("z", v);
                }}
              />
              <InlineNumberField
                label="RCS"
                units="m²"
                tooltip="Radar cross section scaling echo power."
                min={0.0001}
                max={1000}
                step={0.01}
                formatValue={formatCompact4}
                value={radar.selectedTarget.rcsM2}
                onChange={(v) => {
                  updateTarget("rcsM2", v);
                }}
              />
            </div>
          </InspectorRow>

          <InspectorRow
            label="Speed / Hdg"
            tooltip="Target airspeed and heading; yaw follows motion."
          >
            <div className="oat-axis-pair">
              <InlineNumberField
                label="Speed"
                units="m/s"
                tooltip="3D target airspeed."
                min={0}
                max={100}
                step={0.5}
                formatValue={formatFixed1}
                value={radar.selectedTarget.speed}
                onChange={(v) => {
                  updateTarget("speed", v);
                }}
              />
              <InlineNumberField
                label="Heading"
                units="°"
                tooltip="Horizontal heading (-180° to 180°)."
                min={-180}
                max={180}
                step={5}
                formatValue={formatFixed1}
                value={radar.selectedTarget.directionDeg}
                onChange={(v) => {
                  updateTarget("directionDeg", v);
                }}
              />
            </div>
          </InspectorRow>

          <InspectorRow
            label="Climb"
            tooltip="Vertical climb angle (-89° to 89°)."
          >
            <InlineNumberField
              label="Climb"
              units="°"
              min={-89}
              max={89}
              step={1}
              formatValue={formatFixed1}
              value={radar.selectedTarget.climbDeg}
              onChange={(v) => {
                updateTarget("climbDeg", v);
              }}
            />
          </InspectorRow>

          <InspectorRow
            label="Attitude (°)"
            tooltip="Airframe roll (R) and pitch (P) angles."
          >
            <div className="oat-axis-pair">
              <InlineNumberField
                label="Roll"
                prefix="R"
                tooltip="Airframe roll angle."
                min={-180}
                max={180}
                step={1}
                formatValue={formatFixed1}
                value={radar.selectedTarget.orientationDeg[0]}
                onChange={(v) => {
                  updateTarget("rollDeg", v);
                }}
              />
              <InlineNumberField
                label="Pitch"
                prefix="P"
                tooltip="Airframe pitch angle."
                min={-180}
                max={180}
                step={1}
                formatValue={formatFixed1}
                value={radar.selectedTarget.orientationDeg[1]}
                onChange={(v) => {
                  updateTarget("pitchDeg", v);
                }}
              />
            </div>
          </InspectorRow>
        </InspectorSection>
      ) : null}

      <InspectorSection title="OFDM Waveform" dividers={[]}>
        <InspectorRow label="Carrier Freq" tooltip="Radar carrier frequency.">
          <InlineNumberField
            label="Carrier Freq"
            units="GHz"
            min={0.5}
            max={100}
            step={0.1}
            formatValue={formatFixed2}
            value={radar.waveform.carrierFrequencyGhz}
            onChange={(v) => {
              updateWaveform("carrierFrequencyGhz", v);
            }}
          />
        </InspectorRow>

        <InspectorRow
          label="Bandwidth"
          tooltip="OFDM bandwidth; wider improves range resolution."
        >
          <InlineNumberField
            label="Bandwidth"
            units="MHz"
            min={1}
            max={4000}
            step={1}
            formatValue={formatFixed1}
            value={radar.waveform.bandwidthMhz}
            onChange={(v) => {
              updateWaveform("bandwidthMhz", v);
            }}
          />
        </InspectorRow>

        <InspectorRow
          label="Grid (Nsc / Sym)"
          tooltip="OFDM subcarriers (N) and symbols (M)."
        >
          <div className="oat-axis-pair">
            <InlineNumberField
              label="Subcarriers"
              tooltip="Frequency bins per OFDM symbol."
              min={32}
              max={8192}
              step={32}
              isIntegerOnly
              value={radar.waveform.numSubcarriers}
              onChange={(v) => {
                updateWaveform("numSubcarriers", v);
              }}
            />
            <InlineNumberField
              label="OFDM Symbols"
              tooltip="Slow-time symbols for Doppler processing."
              min={16}
              max={4096}
              step={16}
              isIntegerOnly
              value={radar.waveform.numSymbols}
              onChange={(v) => {
                updateWaveform("numSymbols", v);
              }}
            />
          </div>
        </InspectorRow>

        <KeyValueList
          items={[
            {
              id: "range-res",
              label: "ΔRange",
              value: radar.waveform.rangeResolutionText,
              tooltip: "Range resolution from bandwidth.",
            },
            {
              id: "doppler-res",
              label: "ΔDoppler",
              value: radar.waveform.dopplerResolutionText,
              tooltip: "Doppler bin spacing from OFDM grid.",
            },
            {
              id: "vel-res",
              label: "ΔVelocity",
              value: radar.waveform.velocityResolutionText,
              tooltip: "Radial velocity resolution.",
            },
          ]}
        />
      </InspectorSection>
    </div>
  );
}

export function RadarSolverControls({
  controls,
}: {
  readonly controls: ControlsSnapshot;
}) {
  const dispatch = useUiCommand();
  const { radar } = controls;

  const updateSignal = (field: string, value: number | boolean) => {
    void dispatch({
      name: "workbench.control.update",
      payload: { scope: "radar.signal", field, value },
    });
  };

  const updateCfar = (field: string, value: number | boolean) => {
    void dispatch({
      name: "workbench.control.update",
      payload: { scope: "radar.cfar", field, value },
    });
  };

  const updateSolver = (field: string, value: number | boolean) => {
    void dispatch({
      name: "workbench.control.update",
      payload: { scope: "radar.solver", field, value },
    });
  };

  const activeSolverFlags = RADAR_MECHANISM_KEYS.filter(
    (key) => radar.solver[key],
  );
  const handleSolverFlagsChange = (next: string[]) => {
    const selected = new Set(next);
    for (const key of RADAR_MECHANISM_KEYS) {
      const enabled = selected.has(key);
      if (radar.solver[key] !== enabled) {
        updateSolver(key, enabled);
      }
    }
  };

  return (
    <div data-testid="radar-solver-controls">
      <InspectorSection title="RF Front-End & Signal">
        <InspectorRow label="Tx Power" tooltip="Total radar transmit power.">
          <InlineNumberField
            label="Tx Power"
            units="dBm"
            step={1}
            formatValue={formatFixed1}
            value={radar.signal.txPowerDbm}
            onChange={(v) => {
              updateSignal("txPowerDbm", v);
            }}
          />
        </InspectorRow>

        <InspectorRow label="Noise Figure" tooltip="Receiver noise figure.">
          <InlineNumberField
            label="Noise Figure"
            units="dB"
            min={0}
            step={0.5}
            formatValue={formatFixed1}
            value={radar.signal.noiseFigureDb}
            onChange={(v) => {
              updateSignal("noiseFigureDb", v);
            }}
          />
        </InspectorRow>

        <InspectorRow
          label="System Loss"
          tooltip="Hardware and implementation loss."
        >
          <InlineNumberField
            label="System Loss"
            units="dB"
            min={0}
            step={0.5}
            formatValue={formatFixed1}
            value={radar.signal.systemLossDb}
            onChange={(v) => {
              updateSignal("systemLossDb", v);
            }}
          />
        </InspectorRow>

        <InspectorRow
          label="Noise Temp"
          tooltip="System thermal noise temperature."
        >
          <InlineNumberField
            label="Noise Temp"
            units="K"
            min={1}
            step={10}
            isIntegerOnly
            value={radar.signal.noiseTemperatureK}
            onChange={(v) => {
              updateSignal("noiseTemperatureK", v);
            }}
          />
        </InspectorRow>

        <InspectorSwitchRow
          label="Direct Path"
          switchLabel="Direct-Path Cancellation"
          checked={radar.signal.directPathCancellation}
          tooltip="Suppress direct Tx–Rx leakage before detection."
          onChange={(v) => {
            updateSignal("directPathCancellation", v);
          }}
        />
      </InspectorSection>

      <InspectorSection title="CA-CFAR Detector">
        <InspectorSwitchRow
          label="CA-CFAR"
          switchLabel="Enable CA-CFAR"
          checked={radar.cfar.enabled}
          tooltip="Enable 2D CA-CFAR Range–Doppler thresholding."
          onChange={(v) => {
            updateCfar("enabled", v);
          }}
        />
        {radar.cfar.enabled ? (
          <>
            <InspectorRow
              label="Guard (R / D)"
              tooltip="Range/Doppler cells excluded around the test cell."
            >
              <div className="oat-axis-pair">
                <InlineNumberField
                  label="Guard Range"
                  prefix="R"
                  tooltip="Range guard cells around test cell."
                  min={0}
                  max={16}
                  step={1}
                  isIntegerOnly
                  value={radar.cfar.guardRange}
                  onChange={(v) => {
                    updateCfar("guardRange", v);
                  }}
                />
                <InlineNumberField
                  label="Guard Doppler"
                  prefix="D"
                  tooltip="Doppler guard cells around test cell."
                  min={0}
                  max={16}
                  step={1}
                  isIntegerOnly
                  value={radar.cfar.guardDoppler}
                  onChange={(v) => {
                    updateCfar("guardDoppler", v);
                  }}
                />
              </div>
            </InspectorRow>

            <InspectorRow
              label="Train (R / D)"
              tooltip="Range/Doppler cells used to estimate noise floor."
            >
              <div className="oat-axis-pair">
                <InlineNumberField
                  label="Train Range"
                  prefix="R"
                  tooltip="Range cells estimating local noise."
                  min={1}
                  max={32}
                  step={1}
                  isIntegerOnly
                  value={radar.cfar.trainingRange}
                  onChange={(v) => {
                    updateCfar("trainingRange", v);
                  }}
                />
                <InlineNumberField
                  label="Train Doppler"
                  prefix="D"
                  tooltip="Doppler cells estimating local noise."
                  min={1}
                  max={32}
                  step={1}
                  isIntegerOnly
                  value={radar.cfar.trainingDoppler}
                  onChange={(v) => {
                    updateCfar("trainingDoppler", v);
                  }}
                />
              </div>
            </InspectorRow>

            <InspectorRow
              label="False Alarm Pfa"
              tooltip="False-alarm probability setting CFAR threshold."
            >
              <InlineNumberField
                label="False Alarm Pfa"
                min={1e-12}
                max={0.1}
                step={1e-8}
                formatValue={formatPfa}
                value={radar.cfar.falseAlarmProbability}
                onChange={(v) => {
                  updateCfar("falseAlarmProbability", v);
                }}
              />
            </InspectorRow>
          </>
        ) : null}
      </InspectorSection>

      <InspectorSection title="Radar Propagation Solver" dividers={[]}>
        <InspectorRow
          label="Samples / Src"
          tooltip="Monte Carlo rays launched per source."
        >
          <InlineNumberField
            label="Samples / Src"
            min={1024}
            step={4096}
            isIntegerOnly
            value={radar.solver.samplesPerSrc}
            onChange={(v) => {
              updateSolver("samplesPerSrc", v);
            }}
          />
        </InspectorRow>

        <InspectorRow
          label="Max Paths"
          tooltip="Maximum paths retained per source."
        >
          <InlineNumberField
            label="Max Paths"
            min={64}
            step={512}
            isIntegerOnly
            value={radar.solver.maxNumPathsPerSrc}
            onChange={(v) => {
              updateSolver("maxNumPathsPerSrc", v);
            }}
          />
        </InspectorRow>

        <InspectorRow
          label="Max Depth"
          tooltip="Maximum ray interactions per path."
        >
          <SliderNumberRow
            label="Max Depth"
            min={0}
            max={8}
            step={1}
            isIntegerOnly
            value={radar.solver.maxDepth}
            onChange={(v) => {
              updateSolver("maxDepth", v);
            }}
          />
        </InspectorRow>

        <InspectorRow
          label="Seed"
          tooltip="Random seed for repeatable ray sampling."
        >
          <InlineNumberField
            label="Seed"
            min={0}
            step={1}
            isIntegerOnly
            value={radar.solver.seed}
            onChange={(v) => {
              updateSolver("seed", v);
            }}
          />
        </InspectorRow>

        <InspectorRow
          label="Propagation"
          align="start"
          tooltip="Active propagation mechanisms for radar solving."
        >
          <MultiToggleRow
            label="Radar propagation mechanisms"
            options={[
              {
                id: "los",
                label: "LOS",
                tooltip: "Direct unobstructed propagation paths.",
              },
              {
                id: "specularReflection",
                label: "Specular",
                tooltip: "Mirror-like surface reflections.",
              },
              {
                id: "diffuseReflection",
                label: "Diffuse",
                tooltip: "Rough-surface scattering and clutter.",
              },
              {
                id: "refraction",
                label: "Refraction",
                tooltip: "Transmission through scene materials.",
              },
              {
                id: "diffraction",
                label: "Diffraction",
                tooltip: "Ray bending around wedges and edges.",
              },
              {
                id: "syntheticArray",
                label: "Synthetic",
                tooltip: "Use synthetic antenna array approximation.",
              },
            ]}
            value={activeSolverFlags}
            onChange={handleSolverFlagsChange}
          />
        </InspectorRow>
      </InspectorSection>
    </div>
  );
}
