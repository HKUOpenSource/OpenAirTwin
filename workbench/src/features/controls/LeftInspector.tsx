import { useState } from "react";
import { Badge } from "@astryxdesign/core/Badge";
import { Button } from "@astryxdesign/core/Button";
import { HStack } from "@astryxdesign/core/HStack";
import { ProgressBar } from "@astryxdesign/core/ProgressBar";
import { Tab, TabList } from "@astryxdesign/core/TabList";
import { Text } from "@astryxdesign/core/Text";
import { Play, RotateCcw, Square } from "lucide-react";

import { useUiCommand } from "../../app/use-ui-command.ts";
import type { ImperativeHostRegistry } from "../../runtime/host-registry.ts";
import type {
  ControlsSnapshot,
  WorkbenchFeatureId,
} from "../../runtime/workbench-store.ts";
import { DeepMimoControls } from "./DeepMimoControls.tsx";
import { LinkControls } from "./LinkControls.tsx";
import { MobilityControls } from "./MobilityControls.tsx";
import {
  RadarSolverControls,
  RadarWorkflowControls,
} from "./RadarControls.tsx";
import { RadiomapControls } from "./RadiomapControls.tsx";
import { SharedSolverControls } from "./SharedSolverControls.tsx";

const MODE_META: Record<
  WorkbenchFeatureId,
  {
    readonly title: string;
    readonly actionId: string;
    readonly runLabel: string;
    readonly workflowTab: string;
    readonly solverTab: string;
  }
> = {
  link: {
    title: "Link Analysis",
    actionId: "btnSolveLink",
    runLabel: "Solve Link",
    workflowTab: "Channel & Link",
    solverTab: "Solver & Antenna",
  },
  mobility: {
    title: "Mobility Analysis",
    actionId: "btnRunMobility",
    runLabel: "Run Mobility",
    workflowTab: "Trajectory",
    solverTab: "Solver & Antenna",
  },
  radiomap: {
    title: "Radio Map",
    actionId: "btnRunRadiomap",
    runLabel: "Run Radio Map",
    workflowTab: "Patch & Display",
    solverTab: "Solver & Antenna",
  },
  deepmimo: {
    title: "DeepMIMO Export",
    actionId: "btnRunDeepMimo",
    runLabel: "Export Dataset",
    workflowTab: "ROI & Grid",
    solverTab: "Solver & Antenna",
  },
  radar: {
    title: "Radar Sensing",
    actionId: "btnSolveRadar",
    runLabel: "Run Radar Sensing",
    workflowTab: "Targets & OFDM",
    solverTab: "CFAR & Solver",
  },
};

export function LeftInspector({
  controls,
  collapsed,
  hosts,
}: {
  readonly controls: ControlsSnapshot;
  readonly collapsed: boolean;
  readonly hosts: ImperativeHostRegistry;
}) {
  const dispatch = useUiCommand();
  const [activeTab, setActiveTab] = useState<"workflow" | "solver">("workflow");
  const mode = controls.activeMode;
  const meta = MODE_META[mode];

  const runDisabledReason =
    mode === "link"
      ? controls.link.runDisabledReason
      : mode === "mobility"
        ? controls.mobility.runDisabledReason
        : mode === "radiomap"
          ? controls.radiomap.runDisabledReason
          : mode === "deepmimo"
            ? controls.deepmimo.runDisabledReason
            : controls.radar.runDisabledReason;

  const isBusy =
    controls.busyActionId === meta.actionId ||
    (mode === "radar" && controls.radar.job.active);
  const isDisabled = controls.tileLoadBusy || Boolean(runDisabledReason);

  return (
    <aside
      className="oat-left-rail oat-dense-surface"
      data-collapsed={collapsed}
      aria-hidden={collapsed}
      aria-label="Simulation parameters"
      data-testid="left-inspector"
    >
      <div className="oat-rail-tabs">
        <TabList
          value={activeTab}
          size="sm"
          layout="fill"
          onChange={(next) => {
            setActiveTab(next === "solver" ? "solver" : "workflow");
          }}
        >
          <Tab value="workflow" label={meta.workflowTab} />
          <Tab value="solver" label={meta.solverTab} />
        </TabList>
      </div>

      <div className="oat-rail-scroll">
        {activeTab === "workflow" ? (
          <>
            {mode === "link" ? <LinkControls controls={controls} /> : null}
            {mode === "mobility" ? (
              <MobilityControls controls={controls} />
            ) : null}
            {mode === "radiomap" ? (
              <RadiomapControls controls={controls} />
            ) : null}
            {mode === "deepmimo" ? (
              <DeepMimoControls controls={controls} />
            ) : null}
            {mode === "radar" ? (
              <RadarWorkflowControls controls={controls} hosts={hosts} />
            ) : null}
          </>
        ) : mode === "radar" ? (
          <RadarSolverControls controls={controls} />
        ) : (
          <SharedSolverControls controls={controls} />
        )}
      </div>

      <div className="oat-rail-footer">
        {mode === "radar" && controls.radar.inputError ? (
          <Text type="supporting" color="accent" role="alert">
            {controls.radar.inputError}
          </Text>
        ) : null}

        {mode === "radar" && controls.radar.job.visible ? (
          <div className="oat-section-stack" data-testid="radar-job-bar">
            <HStack hAlign="between" vAlign="center" gap={2}>
              <Badge
                label={controls.radar.job.status.toUpperCase()}
                variant={
                  controls.radar.job.status === "failed" ? "error" : "info"
                }
              />
              <Text type="supporting" color="secondary" maxLines={1}>
                {controls.radar.job.message}
              </Text>
            </HStack>
            <ProgressBar
              label="Radar simulation progress"
              value={Math.round(controls.radar.job.progress * 100)}
              max={100}
              isLabelHidden
              variant={
                controls.radar.job.status === "failed" ? "error" : "accent"
              }
            />
            <HStack gap={1.5} hAlign="end">
              {controls.radar.job.canCancel ? (
                <Button
                  label="Cancel"
                  size="sm"
                  variant="secondary"
                  icon={<Square size={12} />}
                  onClick={() => {
                    void dispatch({
                      name: "workbench.control.action",
                      payload: { actionId: "btnCancelRadar" },
                    });
                  }}
                />
              ) : null}
              {controls.radar.job.canRetry ? (
                <Button
                  label="Retry"
                  size="sm"
                  variant="secondary"
                  icon={<RotateCcw size={13} />}
                  onClick={() => {
                    void dispatch({
                      name: "workbench.control.action",
                      payload: { actionId: "btnRetryRadar" },
                    });
                  }}
                />
              ) : null}
            </HStack>
          </div>
        ) : null}

        <Button
          label={meta.runLabel}
          size="sm"
          variant="primary"
          width="100%"
          icon={<Play size={14} />}
          isLoading={isBusy}
          isDisabled={isDisabled}
          {...(runDisabledReason ? { tooltip: runDisabledReason } : {})}
          onClick={() => {
            void dispatch({
              name: "workbench.control.action",
              payload: { actionId: meta.actionId },
            });
          }}
        />
      </div>
    </aside>
  );
}
