import { Button } from "@astryxdesign/core/Button";
import { HStack } from "@astryxdesign/core/HStack";
import { IconButton } from "@astryxdesign/core/IconButton";
import { Text } from "@astryxdesign/core/Text";
import { ToggleButton } from "@astryxdesign/core/ToggleButton";
import { VStack } from "@astryxdesign/core/VStack";
import {
  Crosshair,
  Orbit,
  Radio,
  SquareDashedMousePointer,
  X,
} from "lucide-react";

import { useUiCommand } from "../app/use-ui-command.ts";
import type { ControlsSnapshot } from "../runtime/workbench-store.ts";
import { formatFixed1 } from "../ui/number-format.ts";
import { InlineNumberField, InspectorRow } from "../ui/ParamFields.tsx";

export function DeviceBar({
  controls,
}: {
  readonly controls: ControlsSnapshot;
}) {
  const dispatch = useUiCommand();
  const { deviceBar, activeMode } = controls;
  if (!deviceBar.visible) return null;

  const txActionId =
    activeMode === "link"
      ? "btnPickLinkTx"
      : activeMode === "mobility"
        ? "btnPickMobilityTx"
        : activeMode === "radiomap"
          ? "btnPickRmTx"
          : activeMode === "deepmimo"
            ? "btnDeepMimoPickTx"
            : "btnPickRadarTx";
  const rxActionId =
    activeMode === "link"
      ? "btnPickLinkRx"
      : activeMode === "mobility"
        ? "btnPickMobilityRx"
        : "btnPickRadarRx";

  const txTargetId =
    activeMode === "link"
      ? "link-tx"
      : activeMode === "mobility"
        ? "mobility-tx"
        : activeMode === "radiomap"
          ? "rm-tx"
          : activeMode === "deepmimo"
            ? "deepmimo-tx"
            : "radar-tx";
  const rxTargetId =
    activeMode === "link"
      ? "link-rx"
      : activeMode === "mobility"
        ? "mobility-rx"
        : "radar-rx";

  const isTxActive = deviceBar.activeTarget === txTargetId;
  const isRxActive = deviceBar.activeTarget === rxTargetId;
  const isRoiActive = deviceBar.activeTarget === "deepmimo-roi";
  const showPrecisionCard = isTxActive || isRxActive;
  const activePosition = isTxActive
    ? deviceBar.txPosition
    : deviceBar.rxPosition;
  const coordRole = isTxActive ? "tx" : "rx";

  return (
    <div className="oat-device-bar-wrap" data-testid="device-bar">
      {deviceBar.activeTarget && !showPrecisionCard ? (
        <div className="oat-device-hint" role="status" aria-live="polite">
          {deviceBar.hintText}
        </div>
      ) : null}

      {showPrecisionCard ? (
        <div
          className="oat-device-precision-card oat-card-compact oat-dense-surface"
          data-testid="device-precision-card"
        >
          <VStack gap={2}>
            <HStack hAlign="between" vAlign="center" gap={2}>
              <Text type="label" weight="semibold">
                {`${deviceBar.precisionTitle} Coordinates`}
              </Text>
              <IconButton
                label="Close coordinate editor"
                size="sm"
                variant="ghost"
                icon={<X size={14} />}
                onClick={() => {
                  void dispatch({
                    name: "viewer.precision.escape",
                    payload: undefined,
                  });
                }}
              />
            </HStack>
            <InspectorRow
              label="Position (m)"
              tooltip="Device (X, Y, Z) position in scene meters."
            >
              <div className="oat-axis-triple">
                {(["X", "Y", "Z"] as const).map((axis, idx) => (
                  <InlineNumberField
                    key={axis}
                    label={axis}
                    prefix={axis}
                    step={0.5}
                    formatValue={formatFixed1}
                    value={activePosition ? (activePosition[idx] ?? 0) : null}
                    placeholder="--"
                    onChange={(value) => {
                      void dispatch({
                        name: "workbench.device.coord",
                        payload: {
                          mode: activeMode,
                          role: coordRole,
                          axis: idx,
                          value,
                        },
                      });
                    }}
                  />
                ))}
              </div>
            </InspectorRow>
            {deviceBar.showClearance ? (
              <InspectorRow
                label="Clearance"
                tooltip="Height offset above surface for next placement."
              >
                <InlineNumberField
                  label="Surface Clearance"
                  units="m"
                  min={0}
                  max={200}
                  step={0.5}
                  formatValue={formatFixed1}
                  value={deviceBar.surfaceClearanceM}
                  onChange={(value) => {
                    void dispatch({
                      name: "workbench.control.update",
                      payload: { field: "surfaceClearanceM", value },
                    });
                  }}
                />
              </InspectorRow>
            ) : null}
          </VStack>
        </div>
      ) : null}

      <div
        className="oat-device-bar"
        role="toolbar"
        aria-label="Scene placement controls"
      >
        <ToggleButton
          label={deviceBar.txLabel}
          size="sm"
          icon={<Radio size={14} />}
          isPressed={isTxActive}
          isDisabled={controls.tileLoadBusy}
          tooltip="Place or edit Tx coordinates"
          onPressedChange={() => {
            void dispatch({
              name: "workbench.control.action",
              payload: { actionId: txActionId },
            });
          }}
        />

        {deviceBar.showRx ? (
          <ToggleButton
            label={deviceBar.rxLabel}
            size="sm"
            icon={<Crosshair size={14} />}
            isPressed={isRxActive}
            isDisabled={controls.tileLoadBusy}
            tooltip="Place or edit Rx coordinates"
            onPressedChange={() => {
              void dispatch({
                name: "workbench.control.action",
                payload: { actionId: rxActionId },
              });
            }}
          />
        ) : null}

        {activeMode === "deepmimo" ? (
          <>
            <ToggleButton
              label={controls.deepmimo.hasRoi ? "Redraw ROI" : "Draw ROI"}
              size="sm"
              icon={<SquareDashedMousePointer size={14} />}
              isPressed={isRoiActive}
              isDisabled={controls.tileLoadBusy}
              tooltip="Drag on terrain to draw receiver ROI"
              onPressedChange={() => {
                void dispatch({
                  name: "workbench.control.action",
                  payload: { actionId: "btnDeepMimoPickRoi" },
                });
              }}
            />
            {controls.deepmimo.hasRoi ? (
              <Button
                label="Clear ROI"
                size="sm"
                variant="ghost"
                onClick={() => {
                  void dispatch({
                    name: "workbench.control.action",
                    payload: { actionId: "btnDeepMimoClearRoi" },
                  });
                }}
              />
            ) : null}
          </>
        ) : null}

        <span className="oat-bar-divider" aria-hidden="true" />

        <ToggleButton
          label="Orbit Tx"
          size="sm"
          icon={<Orbit size={14} />}
          isPressed={deviceBar.txOrbiting}
          isDisabled={!deviceBar.canOrbitTx || controls.tileLoadBusy}
          tooltip="Orbit camera around Tx"
          onPressedChange={() => {
            void dispatch({
              name: "workbench.control.action",
              payload: { actionId: "btnOrbitTx" },
            });
          }}
        />
      </div>
    </div>
  );
}
