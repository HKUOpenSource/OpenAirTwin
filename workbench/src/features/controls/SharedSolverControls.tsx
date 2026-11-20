import { Badge } from "@astryxdesign/core/Badge";

import { useUiCommand } from "../../app/use-ui-command.ts";
import type {
  AntennaArrayState,
  ControlsSnapshot,
} from "../../runtime/workbench-store.ts";
import { formatFixed2 } from "../../ui/number-format.ts";
import {
  InlineNumberField,
  InspectorRow,
  InspectorSection,
  MultiToggleRow,
  ParamSelect,
  SliderNumberRow,
} from "../../ui/ParamFields.tsx";

const SOLVER_MECHANISM_OPTIONS = [
  {
    id: "los",
    label: "LOS",
    tooltip: "Direct line-of-sight paths.",
  },
  {
    id: "specularReflection",
    label: "Specular",
    tooltip: "Mirror-like surface reflections.",
  },
  {
    id: "diffuseReflection",
    label: "Diffuse",
    tooltip: "Scattered reflections from rough surfaces.",
  },
  {
    id: "refraction",
    label: "Refraction",
    tooltip: "Transmission through scene materials.",
  },
] as const;

function AntennaArraySection({
  title,
  kind,
  array,
  controls,
  isFixed,
  dividers = ["bottom"],
}: {
  readonly title: string;
  readonly kind: "tx" | "rx";
  readonly array: AntennaArrayState;
  readonly controls: ControlsSnapshot;
  readonly isFixed: boolean;
  readonly dividers?: ("top" | "bottom" | "start" | "end")[];
}) {
  const dispatch = useUiCommand();
  const { capabilities } = controls;
  const fixedReason = isFixed
    ? "DeepMIMO uses a fixed single-element isotropic V-polarized array."
    : undefined;

  const patternTooltip =
    kind === "tx"
      ? "Tx antenna element radiation pattern."
      : "Rx antenna element radiation pattern.";
  const polarizationTooltip =
    kind === "tx" ? "Tx antenna polarization." : "Rx antenna polarization.";
  const sizeTooltip = "Planar array rows (R) and columns (C).";
  const rowsTooltip = "Vertical elements in the planar array.";
  const colsTooltip = "Horizontal elements in the planar array.";
  const spacingTooltip = "Element spacing in carrier wavelengths (λ).";

  const update = (field: string, value: string | number) => {
    void dispatch({
      name: "workbench.control.update",
      payload: { scope: `antenna.${kind}`, field, value },
    });
  };

  return (
    <InspectorSection title={title} dividers={dividers}>
      <InspectorRow label="Pattern" tooltip={patternTooltip}>
        <ParamSelect
          label="Pattern"
          isLabelHidden
          value={array.pattern}
          options={capabilities.antennaPatterns.map((p) => ({
            value: p,
            label: p,
          }))}
          isDisabled={isFixed}
          {...(fixedReason ? { disabledMessage: fixedReason } : {})}
          onChange={(v) => {
            update("pattern", v);
          }}
        />
      </InspectorRow>

      <InspectorRow label="Polarization" tooltip={polarizationTooltip}>
        <ParamSelect
          label="Polarization"
          isLabelHidden
          value={array.polarization}
          options={capabilities.antennaPolarizations.map((p) => ({
            value: p,
            label: p,
          }))}
          isDisabled={isFixed}
          {...(fixedReason ? { disabledMessage: fixedReason } : {})}
          onChange={(v) => {
            update("polarization", v);
          }}
        />
      </InspectorRow>

      <InspectorRow label="Array Size" tooltip={sizeTooltip}>
        <div className="oat-axis-pair">
          <InlineNumberField
            label="Rows"
            prefix="R"
            tooltip={rowsTooltip}
            value={array.numRows}
            min={capabilities.antennaLimits.numRows.min}
            max={capabilities.antennaLimits.numRows.max}
            step={1}
            isIntegerOnly
            isDisabled={isFixed}
            {...(fixedReason ? { disabledMessage: fixedReason } : {})}
            onChange={(v) => {
              update("numRows", v);
            }}
          />
          <InlineNumberField
            label="Columns"
            prefix="C"
            tooltip={colsTooltip}
            value={array.numCols}
            min={capabilities.antennaLimits.numCols.min}
            max={capabilities.antennaLimits.numCols.max}
            step={1}
            isIntegerOnly
            isDisabled={isFixed}
            {...(fixedReason ? { disabledMessage: fixedReason } : {})}
            onChange={(v) => {
              update("numCols", v);
            }}
          />
        </div>
      </InspectorRow>

      <InspectorRow label="Spacing (λ)" tooltip={spacingTooltip}>
        <div className="oat-axis-pair">
          <InlineNumberField
            label="V Spacing"
            prefix="V"
            tooltip="Vertical spacing in wavelengths (λ)."
            value={array.verticalSpacing}
            min={capabilities.antennaLimits.verticalSpacing.min}
            max={capabilities.antennaLimits.verticalSpacing.max}
            step={0.05}
            formatValue={formatFixed2}
            isDisabled={isFixed}
            {...(fixedReason ? { disabledMessage: fixedReason } : {})}
            onChange={(v) => {
              update("verticalSpacing", v);
            }}
          />
          <InlineNumberField
            label="H Spacing"
            prefix="H"
            tooltip="Horizontal spacing in wavelengths (λ)."
            value={array.horizontalSpacing}
            min={capabilities.antennaLimits.horizontalSpacing.min}
            max={capabilities.antennaLimits.horizontalSpacing.max}
            step={0.05}
            formatValue={formatFixed2}
            isDisabled={isFixed}
            {...(fixedReason ? { disabledMessage: fixedReason } : {})}
            onChange={(v) => {
              update("horizontalSpacing", v);
            }}
          />
        </div>
      </InspectorRow>
    </InspectorSection>
  );
}

export function SharedSolverControls({
  controls,
}: {
  readonly controls: ControlsSnapshot;
}) {
  const dispatch = useUiCommand();
  const { solver, antenna } = controls;

  const updateSolver = (field: string, value: number | boolean) => {
    void dispatch({
      name: "workbench.control.update",
      payload: { scope: "solver", field, value },
    });
  };

  const activeMechanisms = SOLVER_MECHANISM_OPTIONS.filter(
    (option) => solver[option.id],
  ).map((option) => option.id);

  const handleMechanismsChange = (next: string[]) => {
    const selected = new Set(next);
    for (const option of SOLVER_MECHANISM_OPTIONS) {
      const enabled = selected.has(option.id);
      if (solver[option.id] !== enabled) {
        updateSolver(option.id, enabled);
      }
    }
  };

  const showRxArray = antenna.policy === "both" || antenna.policy === "fixed";

  return (
    <div data-testid="shared-solver-controls">
      <InspectorSection
        title="Physical Layer & Ray Tracing"
        dividers={antenna.policy !== "none" ? ["bottom"] : []}
        {...(antenna.policy === "fixed"
          ? {
              actions: <Badge label="1×1 Iso Fixed" variant="neutral" />,
            }
          : {})}
      >
        <InspectorRow
          label="Carrier Freq"
          tooltip="Carrier frequency for ray tracing."
        >
          <InlineNumberField
            label="Carrier Freq"
            units="GHz"
            min={0.1}
            max={300}
            step={0.1}
            formatValue={formatFixed2}
            value={solver.frequencyGhz}
            onChange={(v) => {
              updateSolver("frequencyGhz", v);
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
            max={12}
            step={1}
            isIntegerOnly
            value={solver.maxDepth}
            onChange={(v) => {
              updateSolver("maxDepth", v);
            }}
          />
        </InspectorRow>

        <InspectorRow
          label="Random Seed"
          tooltip="Random seed for repeatable ray sampling."
        >
          <InlineNumberField
            label="Random Seed"
            min={0}
            step={1}
            isIntegerOnly
            value={solver.seed}
            onChange={(v) => {
              updateSolver("seed", v);
            }}
          />
        </InspectorRow>

        <InspectorRow
          label="Propagation"
          align="start"
          tooltip="Active ray-tracing propagation mechanisms."
        >
          <MultiToggleRow
            label="Propagation mechanisms"
            options={SOLVER_MECHANISM_OPTIONS}
            value={activeMechanisms}
            onChange={handleMechanismsChange}
          />
        </InspectorRow>
      </InspectorSection>

      {antenna.policy !== "none" ? (
        <>
          <AntennaArraySection
            title="Tx Antenna Array"
            kind="tx"
            array={antenna.txArray}
            controls={controls}
            isFixed={antenna.policy === "fixed"}
            dividers={showRxArray ? ["bottom"] : []}
          />
          {showRxArray ? (
            <AntennaArraySection
              title="Rx Antenna Array"
              kind="rx"
              array={antenna.rxArray}
              controls={controls}
              isFixed={antenna.policy === "fixed"}
              dividers={[]}
            />
          ) : null}
        </>
      ) : null}
    </div>
  );
}
