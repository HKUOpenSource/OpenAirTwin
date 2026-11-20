import { Button } from "@astryxdesign/core/Button";
import { HStack } from "@astryxdesign/core/HStack";
import { IconButton } from "@astryxdesign/core/IconButton";
import { Text } from "@astryxdesign/core/Text";
import { Plus, Trash2 } from "lucide-react";

import { useUiCommand } from "../../app/use-ui-command.ts";
import type { ControlsSnapshot } from "../../runtime/workbench-store.ts";
import { formatFixed1, formatFixed2 } from "../../ui/number-format.ts";
import {
  InlineNumberField,
  InspectorRow,
  InspectorSection,
  SliderNumberRow,
} from "../../ui/ParamFields.tsx";
import { DockEmptyState } from "../../ui/WorkbenchChrome.tsx";

export function MobilityControls({
  controls,
}: {
  readonly controls: ControlsSnapshot;
}) {
  const dispatch = useUiCommand();
  const { mobility } = controls;

  const updateMobility = (field: string, value: number) => {
    void dispatch({
      name: "workbench.control.update",
      payload: { scope: "mobility", field, value },
    });
  };

  return (
    <div data-testid="mobility-controls">
      <InspectorSection title="Trajectory Kinematics">
        <InspectorRow
          label="Speed"
          tooltip="Receiver speed along the trajectory."
        >
          <SliderNumberRow
            label="Speed"
            units="m/s"
            min={0.1}
            max={30}
            step={0.1}
            formatValue={formatFixed1}
            value={mobility.velocityMps}
            onChange={(v) => {
              updateMobility("velocityMps", v);
            }}
          />
        </InspectorRow>

        <InspectorRow
          label="Time Step"
          tooltip="Time interval between trajectory samples."
        >
          <InlineNumberField
            label="Time Step"
            units="s"
            min={0.05}
            step={0.1}
            formatValue={formatFixed2}
            value={mobility.timeStepS}
            onChange={(v) => {
              updateMobility("timeStepS", v);
            }}
          />
        </InspectorRow>

        <InspectorRow
          label="Max Steps"
          tooltip="Upper limit on sampled trajectory steps."
        >
          <InlineNumberField
            label="Max Steps"
            min={2}
            max={5000}
            step={10}
            isIntegerOnly
            value={mobility.maxSteps}
            onChange={(v) => {
              updateMobility("maxSteps", v);
            }}
          />
        </InspectorRow>

        <InspectorRow
          label="Estimate"
          tooltip="Estimated trajectory distance, duration, and steps."
        >
          <Text type="supporting" color="secondary" hasTabularNumbers>
            {mobility.estimateText}
          </Text>
        </InspectorRow>
      </InspectorSection>

      <InspectorSection
        title={`Rx Waypoints (${String(mobility.waypoints.length)})`}
        dividers={[]}
      >
        <div className="oat-axis-pair">
          <Button
            label="Add Current Rx"
            size="sm"
            variant="secondary"
            width="100%"
            icon={<Plus size={14} />}
            isDisabled={!mobility.canAddRxWaypoint}
            tooltip={
              mobility.canAddRxWaypoint
                ? "Append current Rx position as a waypoint (Enter)."
                : "Place Mobility Rx before adding a waypoint."
            }
            onClick={() => {
              void dispatch({
                name: "workbench.control.action",
                payload: { actionId: "btnMobilityAddRxPoint" },
              });
            }}
          />
          <Button
            label="Clear"
            size="sm"
            variant="secondary"
            width="100%"
            isDisabled={mobility.waypoints.length === 0}
            onClick={() => {
              void dispatch({
                name: "workbench.control.action",
                payload: { actionId: "btnMobilityClearPoints" },
              });
            }}
          />
        </div>

        {mobility.waypoints.length === 0 ? (
          <DockEmptyState
            title="No waypoints yet"
            description="Place Mobility Rx in the scene and click Add Current Rx."
          />
        ) : (
          <div className="oat-row-list" data-testid="mobility-waypoint-list">
            {mobility.waypoints.map((wp) => (
              <div
                key={`${String(wp.index)}-${wp.coords}`}
                className="oat-list-row"
                data-selected={wp.selected}
              >
                <HStack hAlign="between" vAlign="center" gap={2}>
                  <button
                    type="button"
                    style={{
                      background: "transparent",
                      border: "none",
                      padding: 0,
                      textAlign: "left",
                      cursor: "pointer",
                      flex: 1,
                      minWidth: 0,
                      font: "inherit",
                    }}
                    onClick={() => {
                      void dispatch({
                        name: "workbench.control.action",
                        payload: {
                          actionId: "mobilityWaypoint.select",
                          value: wp.index,
                        },
                      });
                    }}
                  >
                    <div className="oat-list-row-title">{wp.label}</div>
                    <div className="oat-list-row-meta">{wp.coords}</div>
                  </button>
                  <IconButton
                    label={`Remove ${wp.label}`}
                    size="sm"
                    variant="ghost"
                    icon={<Trash2 size={14} />}
                    onClick={() => {
                      void dispatch({
                        name: "workbench.control.action",
                        payload: {
                          actionId: "mobilityWaypoint.remove",
                          value: wp.index,
                        },
                      });
                    }}
                  />
                </HStack>
              </div>
            ))}
          </div>
        )}
      </InspectorSection>
    </div>
  );
}
