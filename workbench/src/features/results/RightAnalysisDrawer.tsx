import { useState } from "react";
import { Badge } from "@astryxdesign/core/Badge";
import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { Divider } from "@astryxdesign/core/Divider";
import { HStack } from "@astryxdesign/core/HStack";
import { IconButton } from "@astryxdesign/core/IconButton";
import {
  SegmentedControl,
  SegmentedControlItem,
} from "@astryxdesign/core/SegmentedControl";
import { Tab, TabList } from "@astryxdesign/core/TabList";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import { Pause, Play, X } from "lucide-react";

import { useUiCommand } from "../../app/use-ui-command.ts";
import {
  useFeatureSnapshot,
  type UiExternalStore,
} from "../../runtime/observable-state.ts";
import type { ShellSnapshot } from "../../runtime/workbench-store.ts";
import { ParamSelect, ParamSlider } from "../../ui/ParamFields.tsx";
import {
  ChartFrame,
  DockEmptyState,
  KeyValueList,
  type KeyValueItem,
  MetricGrid,
  PanelSectionHeader,
  StatusBadge,
} from "../../ui/WorkbenchChrome.tsx";
import type {
  ChannelViewModel,
  MobilityResultViewModel,
  PathResultsViewModel,
  RadarResultViewModel,
  RadarRowViewModel,
  RadioMapResultViewModel,
  ResultDockSnapshot,
  ResultMetricViewModel,
} from "./contracts.ts";

function toMetricItems(items: readonly ResultMetricViewModel[]) {
  return items.map((item) => ({
    id: item.id,
    label: item.label,
    value: item.value,
  }));
}

function toKeyValueItems(
  items: readonly ResultMetricViewModel[],
): readonly KeyValueItem[] {
  return items.map((item) => ({
    id: item.id,
    label: item.label,
    value: item.value,
    ...(item.valueId !== undefined ? { valueId: item.valueId } : {}),
  }));
}

function PathResultsBlock({ model }: { readonly model: PathResultsViewModel }) {
  const dispatch = useUiCommand();
  if (!model.visible) return null;

  return (
    <div className="oat-section-stack" data-testid="path-results-section">
      <PanelSectionHeader
        title="Propagation Paths"
        {...(model.meta ? { meta: model.meta } : {})}
        actions={<Badge label={model.countLabel} variant="neutral" />}
      />
      <div
        className="oat-row-list"
        style={{ maxHeight: "220px", overflowY: "auto" }}
      >
        <button
          type="button"
          className="oat-list-row"
          data-selected={model.selectedIndex === -1}
          aria-pressed={model.selectedIndex === -1}
          onClick={() => {
            void dispatch({
              name: `${model.featureId}.path.select`,
              featureId: model.featureId,
              payload: { index: -1 },
            });
          }}
        >
          <div className="oat-list-row-head">
            <span className="oat-list-row-title">All Paths</span>
          </div>
        </button>
        {model.rows.map((row) => (
          <button
            key={row.index}
            type="button"
            className="oat-list-row"
            data-selected={row.selected}
            aria-pressed={row.selected}
            aria-label={row.ariaLabel}
            onClick={() => {
              void dispatch({
                name: `${model.featureId}.path.select`,
                featureId: model.featureId,
                payload: { index: row.index },
              });
            }}
          >
            <div className="oat-list-row-head">
              <HStack gap={1.5} vAlign="center" style={{ minWidth: 0 }}>
                <span className="oat-list-row-title">{row.name}</span>
                <Badge label={row.typeLabel} variant="neutral" />
              </HStack>
              <span className="oat-list-row-meta">{row.gain}</span>
            </div>
            <div className="oat-list-row-detail">
              {row.variantLabel
                ? `${row.variantLabel} · ${row.delay}`
                : row.delay}
            </div>
          </button>
        ))}
      </div>

      {model.detail ? (
        <div className="oat-section-stack">
          <PanelSectionHeader
            title={model.detail.title}
            actions={<Badge label={model.detail.typeLabel} variant="info" />}
          />
          <KeyValueList
            items={model.detail.fields.map((field) => ({
              id: field.id,
              label: field.label,
              value: field.value,
            }))}
          />
        </div>
      ) : null}
    </div>
  );
}

function MobilityPlaybackBlock({
  mobility,
}: {
  readonly mobility: MobilityResultViewModel;
}) {
  const dispatch = useUiCommand();
  return (
    <div className="oat-section-stack">
      <HStack hAlign="between" vAlign="center" gap={2}>
        <ParamSelect
          label="Timeline Metric"
          isLabelHidden
          value={mobility.metric}
          options={[
            { value: "received_power_db", label: "Total Path Gain (dB)" },
            { value: "valid_paths", label: "Valid Paths" },
            { value: "max_abs_doppler_hz", label: "Max Doppler (Hz)" },
            { value: "peak_tap_power_db", label: "Strongest Tap (dB)" },
          ]}
          onChange={(value) => {
            void dispatch({
              name: "mobility.timeline.metric.change",
              featureId: "mobility",
              payload: { value },
            });
          }}
        />
        <Badge label={mobility.stepLabel} variant="info" />
      </HStack>

      <HStack gap={1.5} vAlign="center">
        <Button
          label={mobility.playing ? "Pause" : "Play"}
          size="sm"
          variant="secondary"
          icon={mobility.playing ? <Pause size={13} /> : <Play size={13} />}
          onClick={() => {
            void dispatch({
              name: "mobility.playback.toggle",
              featureId: "mobility",
              payload: undefined,
            });
          }}
        />
        <div style={{ flex: 1, minWidth: 0 }}>
          <ParamSlider
            label="Mobility step"
            isLabelHidden
            value={mobility.selectedStep}
            min={0}
            max={Math.max(0, mobility.maxStep)}
            step={1}
            isDisabled={mobility.maxStep <= 0}
            onChange={(value) => {
              void dispatch({
                name: "mobility.timeline.seek",
                featureId: "mobility",
                payload: { value },
              });
            }}
          />
        </div>
        <div style={{ width: "80px", flexShrink: 0 }}>
          <ParamSelect
            label="Playback speed"
            isLabelHidden
            value={mobility.playbackSpeed}
            options={[
              { value: "0.5", label: "0.5×" },
              { value: "1", label: "1×" },
              { value: "2", label: "2×" },
              { value: "4", label: "4×" },
            ]}
            onChange={(value) => {
              void dispatch({
                name: "mobility.playback.speed.change",
                featureId: "mobility",
                payload: { value },
              });
            }}
          />
        </div>
      </HStack>
    </div>
  );
}

function RadiomapResultsBlock({
  radiomap,
}: {
  readonly radiomap: RadioMapResultViewModel;
}) {
  if (!radiomap.visible) return null;
  return (
    <div className="oat-section-stack" data-testid="radiomap-results">
      <MetricGrid items={toMetricItems(radiomap.summary)} />
      {radiomap.colorbar.visible ? (
        <Card padding={2} variant="muted">
          <VStack gap={1.5}>
            <HStack hAlign="between" vAlign="center">
              <Text type="label" weight="semibold">
                {radiomap.colorbar.colormapLabel}
              </Text>
            </HStack>
            <div
              className="radiomapColorbarBar"
              style={{ background: radiomap.colorbar.gradient }}
            />
            <div className="radiomapColorbarTicks">
              <span>{radiomap.colorbar.minLabel}</span>
              <span>{radiomap.colorbar.maxLabel}</span>
            </div>
          </VStack>
        </Card>
      ) : null}
      {radiomap.resolution.length > 0 ? (
        <>
          <PanelSectionHeader title="Grid Resolution" />
          <KeyValueList items={toKeyValueItems(radiomap.resolution)} />
        </>
      ) : null}
    </div>
  );
}

function RadarRowList({
  id,
  rows,
  commandName,
  emptyTitle,
  emptyMessage,
}: {
  readonly id?: string;
  readonly rows: readonly RadarRowViewModel[];
  readonly commandName: string;
  readonly emptyTitle: string;
  readonly emptyMessage: string;
}) {
  const dispatch = useUiCommand();
  if (rows.length === 0) {
    return (
      <div id={id}>
        <DockEmptyState
          title={emptyTitle}
          description={emptyMessage || "No entries available."}
        />
      </div>
    );
  }
  return (
    <div
      id={id}
      className="oat-row-list"
      style={{ maxHeight: "240px", overflowY: "auto" }}
    >
      {rows.map((row) => (
        <button
          key={row.id}
          type="button"
          className="oat-list-row"
          data-selected={row.selected}
          aria-pressed={row.selected}
          onClick={() => {
            void dispatch({
              name: commandName,
              featureId: "radar",
              payload: { value: row.dataValue },
            });
          }}
        >
          <div className="oat-list-row-head">
            <span className="oat-list-row-title">{row.title}</span>
            <span className="oat-list-row-meta">{row.meta}</span>
          </div>
          {row.detail ? (
            <div className="oat-list-row-detail">{row.detail}</div>
          ) : null}
        </button>
      ))}
    </div>
  );
}

function RadarResultsControlsBlock({
  radar,
}: {
  readonly radar: RadarResultViewModel;
}) {
  const dispatch = useUiCommand();
  const [listTab, setListTab] = useState<"detections" | "truth" | "paths">(
    "detections",
  );
  const rd = radar.rangeDoppler;

  return (
    <div className="oat-section-stack" data-testid="radar-results-detail">
      <HStack hAlign="between" vAlign="center" gap={2}>
        <Text type="supporting" color="secondary">
          {rd.meta}
        </Text>
        <SegmentedControl
          label="Range-Doppler viewport"
          size="sm"
          value={rd.viewport}
          onChange={(value) => {
            void dispatch({
              name: "radar.rangeDoppler.scope.select",
              featureId: "radar",
              payload: { value },
            });
          }}
        >
          <SegmentedControlItem
            value="focus"
            label="Focus"
            isDisabled={!rd.focusAvailable}
          />
          <SegmentedControlItem value="full" label="Full" />
        </SegmentedControl>
      </HStack>

      {rd.processingOptions.length > 0 ? (
        <SegmentedControl
          label="Clutter processing view"
          size="sm"
          layout="fill"
          value={rd.processingView}
          onChange={(value) => {
            void dispatch({
              name: "radar.processing.select",
              featureId: "radar",
              payload: { value },
            });
          }}
        >
          {rd.processingOptions.map((option) => (
            <SegmentedControlItem
              key={option.id}
              value={option.id}
              label={option.label}
              isDisabled={!option.available}
            />
          ))}
        </SegmentedControl>
      ) : null}

      <Divider />

      <TabList
        value={listTab}
        size="sm"
        layout="fill"
        hasDivider
        onChange={(next) => {
          if (next === "detections" || next === "truth" || next === "paths") {
            setListTab(next);
          }
        }}
      >
        <Tab
          value="detections"
          label={`Detections (${radar.detectionCount})`}
        />
        <Tab value="truth" label={`Truth (${String(radar.truth.length)})`} />
        <Tab value="paths" label={`Paths (${radar.pathCount})`} />
      </TabList>

      {listTab === "detections" ? (
        <VStack gap={2}>
          <HStack hAlign="between" vAlign="center" gap={2}>
            <ParamSelect
              label="Detection filter"
              isLabelHidden
              value={radar.detectionFilter}
              options={[
                { value: "all", label: "All detections" },
                { value: "target", label: "Target-associated" },
                { value: "clutter", label: "Unassociated / clutter" },
              ]}
              onChange={(value) => {
                void dispatch({
                  name: "radar.detections.filter",
                  featureId: "radar",
                  payload: { value },
                });
              }}
            />
            {radar.detectionMoreVisible ? (
              <Button
                label={radar.detectionMoreLabel}
                size="sm"
                variant="ghost"
                onClick={() => {
                  void dispatch({
                    name: "radar.detections.toggleAll",
                    featureId: "radar",
                    payload: undefined,
                  });
                }}
              />
            ) : null}
          </HStack>
          <RadarRowList
            id="radarDetectionList"
            rows={radar.detections}
            commandName="radar.detection.select"
            emptyTitle="No detections"
            emptyMessage={radar.detectionEmptyMessage}
          />
        </VStack>
      ) : null}

      {listTab === "truth" ? (
        <RadarRowList
          id="radarTruthList"
          rows={radar.truth}
          commandName="radar.truth.select"
          emptyTitle="No target truth"
          emptyMessage={radar.truthEmptyMessage}
        />
      ) : null}

      {listTab === "paths" ? (
        <VStack gap={2}>
          <ParamSelect
            label="Path display filter"
            isLabelHidden
            value={radar.pathDisplayMode}
            options={[
              { value: "key", label: "Key paths (target + strongest clutter)" },
              { value: "target", label: "Target echoes only" },
              { value: "all", label: "All paths" },
            ]}
            onChange={(value) => {
              void dispatch({
                name: "radar.paths.displayMode.change",
                featureId: "radar",
                payload: { value },
              });
            }}
          />
          <RadarRowList
            id="radarPathList"
            rows={radar.paths}
            commandName="radar.path.select"
            emptyTitle="No propagation paths"
            emptyMessage={radar.pathEmptyMessage}
          />
        </VStack>
      ) : null}
    </div>
  );
}

export function RightAnalysisDrawer({
  shell,
  resultStore,
}: {
  readonly shell: ShellSnapshot;
  readonly resultStore: UiExternalStore<ResultDockSnapshot>;
}) {
  const dispatch = useUiCommand();
  const snapshot = useFeatureSnapshot(resultStore);

  const visible = shell.resultDock.visible;
  const collapsed = !visible || shell.rightRailCollapsed;
  const activeChannel: ChannelViewModel =
    snapshot.activeMode === "mobility"
      ? snapshot.mobility.channel
      : snapshot.link.channel;
  const showLink = snapshot.activeMode === "link" && snapshot.link.visible;
  const showMobility =
    snapshot.activeMode === "mobility" && snapshot.mobility.visible;
  const showRadiomap =
    snapshot.activeMode === "radiomap" && snapshot.radiomap.visible;
  const showRadar = snapshot.activeMode === "radar" && snapshot.radar.visible;

  return (
    <aside
      className="oat-right-rail oat-dense-surface"
      data-collapsed={collapsed}
      aria-hidden={collapsed}
      aria-label="Analysis results"
      data-testid="right-analysis-drawer"
    >
      <div className="oat-rail-header">
        <Text type="label" weight="semibold">
          {shell.resultDock.title}
        </Text>
        <HStack gap={1.5} vAlign="center">
          {shell.livePreviewStatus.visible ? (
            <StatusBadge
              label={shell.livePreviewStatus.label}
              tone={shell.livePreviewStatus.tone}
            />
          ) : null}
          <IconButton
            label="Collapse results panel"
            tooltip="Collapse"
            size="sm"
            variant="ghost"
            icon={<X size={15} />}
            onClick={() => {
              void dispatch({
                name: "results.dock.toggle",
                payload: undefined,
              });
            }}
          />
        </HStack>
      </div>

      <div className="oat-rail-scroll" data-oat-react-owner="result-dock">
        <div className="oat-section-stack">
          {/* Link Summary */}
          {showLink ? (
            <MetricGrid
              items={toMetricItems(snapshot.link.summary)}
              testId="link-summary-metrics"
            />
          ) : null}

          {/* Mobility Summary & Playback */}
          {showMobility ? (
            <>
              <MetricGrid
                items={toMetricItems(snapshot.mobility.summary)}
                testId="mobility-summary-metrics"
              />
              <MobilityPlaybackBlock mobility={snapshot.mobility} />
            </>
          ) : null}

          {/* Persistent Mobility Series SVG Host */}
          <div className={showMobility ? undefined : "hidden"}>
            <ChartFrame title="Mobility Time Series">
              <svg
                id="mobilitySeriesChart"
                className="tapChart"
                viewBox="0 0 420 172"
                role="img"
                aria-label="Mobility time series chart"
              />
            </ChartFrame>
          </div>

          {/* Persistent Power Delay Profile SVG Host (shared by Link & Mobility) */}
          <div
            className={
              (showLink || showMobility) && activeChannel.visible
                ? "oat-section-stack"
                : "hidden"
            }
          >
            <KeyValueList items={toKeyValueItems(activeChannel.metrics)} />
            <ChartFrame title="Power Delay Profile">
              <svg
                id="linkTapChart"
                className="tapChart"
                viewBox="0 0 420 172"
                role="img"
                aria-label="Power delay profile: Discrete Channel Taps"
              />
            </ChartFrame>
          </div>

          {/* Link / Mobility Path Selection */}
          {showLink ? <PathResultsBlock model={snapshot.link.paths} /> : null}
          {showMobility ? (
            <PathResultsBlock model={snapshot.mobility.paths} />
          ) : null}

          {/* Radio Map Results */}
          {showRadiomap ? (
            <RadiomapResultsBlock radiomap={snapshot.radiomap} />
          ) : null}

          {/* Radar Summary */}
          {showRadar ? (
            <MetricGrid
              items={toMetricItems(snapshot.radar.summary)}
              testId="radar-summary-metrics"
            />
          ) : null}

          {/* Persistent Radar Canvas Hosts */}
          <div className={showRadar ? "oat-section-stack" : "hidden"}>
            <ChartFrame title="Range–Doppler Map">
              <div className="radarCanvasWrap">
                <canvas
                  id="radarRangeDopplerCanvas"
                  className="radarRdCanvas"
                  aria-label="Radar Range-Doppler heatmap"
                />
                <div
                  id="radarChartCrosshair"
                  className="radarCrosshair hidden"
                  aria-hidden="true"
                />
                <div
                  id="radarChartTooltip"
                  className="radarChartTooltip hidden"
                />
              </div>
              <div
                id="radarRdHover"
                className="oat-list-row-meta"
                style={{ marginTop: "4px" }}
              />
              <div id="radarPlotLegend" className="radarPlotLegend radarLegend">
                <span className="target">Target truth</span>
                <span className="unassociatedTarget">Unassociated target</span>
                <span className="clutter">Clutter detection</span>
                <span className="unassociatedDetection">
                  Unassociated detection
                </span>
              </div>
            </ChartFrame>

            <ChartFrame title="Range Profile">
              <canvas
                id="radarRangeProfileCanvas"
                className="radarRangeCanvas"
                aria-label="Radar range profile chart"
              />
            </ChartFrame>
          </div>

          {showRadar ? (
            <RadarResultsControlsBlock radar={snapshot.radar} />
          ) : null}
        </div>
      </div>
    </aside>
  );
}
