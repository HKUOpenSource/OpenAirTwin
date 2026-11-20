import { useState } from "react";
import { Badge } from "@astryxdesign/core/Badge";
import { Button } from "@astryxdesign/core/Button";
import { CheckboxInput } from "@astryxdesign/core/CheckboxInput";
import { Divider } from "@astryxdesign/core/Divider";
import { HStack } from "@astryxdesign/core/HStack";
import { IconButton } from "@astryxdesign/core/IconButton";
import { Popover } from "@astryxdesign/core/Popover";
import {
  SegmentedControl,
  SegmentedControlItem,
} from "@astryxdesign/core/SegmentedControl";
import { Switch } from "@astryxdesign/core/Switch";
import { Text } from "@astryxdesign/core/Text";
import {
  Activity,
  Download,
  Map as MapIcon,
  PanelLeft,
  PanelRight,
} from "lucide-react";

import { useUiCommand } from "../app/use-ui-command.ts";
import type { DeepMimoDatasetTrayViewModel } from "../features/deepmimo/contracts.ts";
import {
  useFeatureSnapshot,
  type UiExternalStore,
} from "../runtime/observable-state.ts";
import type {
  ShellSnapshot,
  WorkbenchFeatureId,
} from "../runtime/workbench-store.ts";
import { KeyValueList, MetricGrid } from "../ui/WorkbenchChrome.tsx";

const MODE_OPTIONS: readonly {
  readonly id: WorkbenchFeatureId;
  readonly label: string;
}[] = [
  { id: "link", label: "Link" },
  { id: "mobility", label: "Mobility" },
  { id: "radiomap", label: "Radio Map" },
  { id: "deepmimo", label: "DeepMIMO" },
  { id: "radar", label: "Radar" },
];

export function TopWorkspaceBar({
  shell,
  datasetStore,
}: {
  readonly shell: ShellSnapshot;
  readonly datasetStore: UiExternalStore<DeepMimoDatasetTrayViewModel>;
}) {
  const dispatch = useUiCommand();
  const datasets = useFeatureSnapshot(datasetStore);
  const [perfOpen, setPerfOpen] = useState(false);

  const showDatasets =
    datasets.visible ||
    (shell.activeMode === "deepmimo" && datasets.datasets.length > 0);

  return (
    <header
      className="oat-topbar"
      role="banner"
      data-testid="top-workspace-bar"
    >
      <div className="oat-topbar-group">
        <IconButton
          label={
            shell.leftRailCollapsed
              ? "Expand inspector panel"
              : "Collapse inspector panel"
          }
          tooltip={
            shell.leftRailCollapsed ? "Show Inspector" : "Hide Inspector"
          }
          size="sm"
          variant={shell.leftRailCollapsed ? "ghost" : "secondary"}
          icon={<PanelLeft size={15} />}
          onClick={() => {
            void dispatch({
              name: "workbench.controls.toggle",
              payload: undefined,
            });
          }}
        />
        <div className="oat-brand" aria-label="OpenAirTwin">
          <img
            className="oat-brand-logo"
            src="/assets/openairtwin_logo.png"
            alt="OpenAirTwin"
          />
        </div>
        <Button
          label="Map"
          size="sm"
          variant="secondary"
          icon={<MapIcon size={14} />}
          endContent={
            <Badge label={String(shell.loadedTileCount)} variant="neutral" />
          }
          tooltip="Open tile map to select or download city tiles"
          onClick={() => {
            void dispatch({ name: "entry.scene.open", payload: undefined });
          }}
        />
      </div>

      <div className="oat-topbar-center">
        <SegmentedControl
          label="Analysis mode"
          size="sm"
          value={shell.activeMode}
          onChange={(mode) => {
            void dispatch({
              name: "workbench.mode.select",
              payload: { mode },
            });
          }}
        >
          {MODE_OPTIONS.map((item) => (
            <SegmentedControlItem
              key={item.id}
              value={item.id}
              label={item.label}
            />
          ))}
        </SegmentedControl>
      </div>

      <div className="oat-topbar-group">
        {showDatasets ? (
          <Popover
            label="Generated DeepMIMO datasets"
            placement="below"
            alignment="end"
            width={340}
            padding={3}
            isOpen={datasets.expanded}
            onOpenChange={(open) => {
              if (open !== datasets.expanded) {
                void dispatch({
                  name: "deepmimo.datasets.toggle",
                  featureId: "deepmimo",
                  payload: undefined,
                });
              }
            }}
            content={
              <div className="oat-popover-body" data-testid="deepmimo-datasets">
                <Text type="label" weight="semibold">
                  Generated Datasets
                </Text>
                <div className="oat-row-list">
                  {datasets.datasets.map((dataset) => (
                    <div key={dataset.jobId} className="oat-list-row">
                      <HStack hAlign="between" vAlign="center" gap={2}>
                        <div style={{ minWidth: 0 }}>
                          <div className="oat-list-row-title">
                            {dataset.scenarioName}
                          </div>
                          <div className="oat-list-row-meta">
                            {dataset.detail}
                          </div>
                        </div>
                        <Button
                          label="Download"
                          size="sm"
                          variant="secondary"
                          href={dataset.downloadUrl}
                        />
                      </HStack>
                    </div>
                  ))}
                </div>
              </div>
            }
          >
            <Button
              label="Datasets"
              size="sm"
              variant="secondary"
              icon={<Download size={14} />}
              endContent={
                <Badge
                  label={String(datasets.datasets.length)}
                  variant="info"
                />
              }
            />
          </Popover>
        ) : null}

        {shell.performance.visible ? (
          <Popover
            label="Scene rendering performance"
            placement="below"
            alignment="end"
            width={328}
            padding={3}
            isOpen={perfOpen}
            onOpenChange={setPerfOpen}
            content={
              <div
                className="oat-popover-body oat-perf-popover oat-dense-surface"
                data-testid="performance-panel"
              >
                <div className="oat-perf-stack">
                  <span className="oat-perf-section-title">
                    Render Performance
                  </span>
                  <SegmentedControl
                    label="Performance mode"
                    size="sm"
                    layout="fill"
                    value={shell.performance.mode}
                    onChange={(mode) => {
                      void dispatch({
                        name: "performance.mode.select",
                        payload: { mode },
                      });
                    }}
                  >
                    <SegmentedControlItem value="auto" label="Auto" />
                    <SegmentedControlItem value="quality" label="Quality" />
                    <SegmentedControlItem value="fast" label="Fast" />
                  </SegmentedControl>
                  <Switch
                    label="Lightweight materials"
                    size="sm"
                    labelPosition="start"
                    labelSpacing="spread"
                    width="100%"
                    value={shell.performance.lightweightMaterials}
                    onChange={(checked) => {
                      void dispatch({
                        name: "performance.lightMaterials.toggle",
                        payload: { checked },
                      });
                    }}
                  />
                  <MetricGrid
                    items={[
                      { id: "fps", label: "FPS", value: shell.performance.fps },
                      {
                        id: "calls",
                        label: "Draw Calls",
                        value: shell.performance.drawCalls,
                      },
                    ]}
                  />
                  <KeyValueList
                    items={[
                      { id: "dpr", label: "DPR", value: shell.performance.dpr },
                      {
                        id: "tris",
                        label: "Triangles",
                        value: shell.performance.triangles,
                      },
                      {
                        id: "faces",
                        label: "Visible Faces",
                        value: shell.performance.faces,
                      },
                      {
                        id: "loaded",
                        label: "Loaded Tiles",
                        value: shell.performance.loadedDetail,
                      },
                    ]}
                  />
                  <Divider />
                  <HStack hAlign="between" vAlign="center" gap={1.5}>
                    <span className="oat-perf-section-title">
                      Category Visibility
                    </span>
                    <HStack gap={0.5}>
                      <Button
                        label="Show All"
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          void dispatch({
                            name: "performance.categories.showAll",
                            payload: undefined,
                          });
                        }}
                      />
                      <Button
                        label="Hide Heavy"
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          void dispatch({
                            name: "performance.categories.hideHeavy",
                            payload: undefined,
                          });
                        }}
                      />
                    </HStack>
                  </HStack>
                  <div className="oat-perf-category-list">
                    {shell.performance.categories.map((category) => (
                      <div
                        key={category.name}
                        className="oat-perf-category-row"
                      >
                        <div
                          className="oat-perf-category-name"
                          title={category.name}
                        >
                          <CheckboxInput
                            label={category.name}
                            value={category.visible}
                            onChange={(checked) => {
                              void dispatch({
                                name: "performance.category.toggle",
                                payload: { category: category.name, checked },
                              });
                            }}
                          />
                        </div>
                        <span className="oat-perf-category-stats">
                          {category.stats}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            }
          >
            <Button
              label={`${shell.performance.fps} FPS`}
              size="sm"
              variant="ghost"
              className="oat-fps-trigger"
              icon={<Activity size={14} />}
              tooltip="Scene rendering performance and category visibility"
            />
          </Popover>
        ) : null}

        {shell.resultDock.visible ? (
          <IconButton
            label={
              shell.rightRailCollapsed
                ? "Expand results panel"
                : "Collapse results panel"
            }
            tooltip={shell.rightRailCollapsed ? "Show Results" : "Hide Results"}
            size="sm"
            variant={shell.rightRailCollapsed ? "ghost" : "secondary"}
            icon={<PanelRight size={15} />}
            onClick={() => {
              void dispatch({
                name: "results.dock.toggle",
                payload: undefined,
              });
            }}
          />
        ) : null}
      </div>
    </header>
  );
}
