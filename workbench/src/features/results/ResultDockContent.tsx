import { useEffect, useRef } from "react";

import { useUiCommand } from "../../app/use-ui-command.ts";
import {
  EmptyState,
  MetricGrid,
} from "../../design-system/components/DataDisplay.tsx";
import {
  Filter,
  ChartFrame,
} from "../../design-system/components/ResultData.tsx";
import { classNames } from "../../design-system/class-names.ts";
import {
  useFeatureSnapshot,
  type UiExternalStore,
} from "../../runtime/observable-state.ts";
import type {
  ChannelViewModel,
  PathResultsViewModel,
  RadarRowViewModel,
  ResultDockSnapshot,
  ResultMetricViewModel,
} from "./contracts.ts";

const metricItems = (items: readonly ResultMetricViewModel[]) =>
  items.map((item) => ({
    id: item.id,
    label: item.label,
    value: item.value,
    ...(item.valueId ? { valueId: item.valueId } : {}),
    ...(item.valueClassName ? { valueClassName: item.valueClassName } : {}),
  }));

function Summary({
  id,
  visible,
  metrics,
  className,
}: {
  readonly id: string;
  readonly visible: boolean;
  readonly metrics: readonly ResultMetricViewModel[];
  readonly className?: string;
}) {
  return (
    <div
      id={id}
      className={classNames(
        "linkResultSummary",
        visible && "is-visible",
        className,
      )}
    >
      <MetricGrid
        className="channelStats linkSummaryStats"
        items={metricItems(metrics)}
      />
    </div>
  );
}

function ChannelSection({ channel }: { readonly channel: ChannelViewModel }) {
  return (
    <div
      id="linkTapAnalysisSection"
      className={classNames("linkDockSection", !channel.visible && "hidden")}
      aria-hidden={!channel.visible}
    >
      <div className="sectionTitleRow">
        <div>
          <div className="sectionTitle">Power Delay Profile</div>
          <div className="channelAnalysisMiniTitle">Discrete Channel Taps</div>
        </div>
      </div>
      <MetricGrid
        className="channelStats"
        items={metricItems(channel.metrics)}
      />
      <ChartFrame>
        <svg
          id="linkTapChart"
          className="tapChart"
          viewBox="0 0 420 172"
          role="img"
          aria-label="Power delay profile chart: x-axis Tap Index, y-axis Power in dB"
        />
      </ChartFrame>
    </div>
  );
}

function PathSections({ model }: { readonly model: PathResultsViewModel }) {
  const dispatch = useUiCommand();
  const listRef = useRef<HTMLDivElement>(null);
  const detailRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const active = listRef.current?.querySelector(
      ".pathRow.active, .pathAllButton.active",
    );
    if (active && "scrollIntoView" in active) {
      active.scrollIntoView({ block: "nearest" });
    }
  }, [model.selectedIndex, model.rows]);

  useEffect(() => {
    if (
      model.detail &&
      detailRef.current &&
      "scrollIntoView" in detailRef.current
    ) {
      detailRef.current.scrollIntoView({ block: "nearest" });
    }
  }, [model.detail]);

  return (
    <>
      <div
        id="pathSelectionSection"
        className={classNames("linkDockSection", !model.visible && "hidden")}
        aria-hidden={!model.visible}
      >
        <div className="sectionTitleRow pathSelectionHeader">
          <div>
            <div className="sectionTitle">Paths</div>
            <div
              className={classNames(
                "pathSelectionMeta",
                !model.meta && "hidden",
              )}
              id="pathSelectionMeta"
            >
              {model.meta}
            </div>
          </div>
          <div
            className="channelAnalysisMiniTitle pathSelectionCount"
            id="pathSelectionCount"
          >
            {model.countLabel}
          </div>
        </div>
        <div
          id="pathButtons"
          className="pathList oat-scroll-region"
          ref={listRef}
        >
          <button
            type="button"
            className={classNames(
              "pathAllButton oat-list-card oat-list-card--interactive",
              model.selectedIndex === -1 && "active",
            )}
            aria-pressed={model.selectedIndex === -1}
            onClick={() => {
              void dispatch({
                name: `${model.featureId}.path.select`,
                featureId: model.featureId,
                payload: { index: -1 },
              });
            }}
          >
            Show all paths
          </button>
          {model.rows.map((row) => (
            <button
              type="button"
              className={classNames(
                "pathRow oat-list-card oat-list-card--interactive",
                row.selected && "active",
              )}
              aria-pressed={row.selected}
              aria-label={row.ariaLabel}
              key={row.index}
              onClick={() => {
                void dispatch({
                  name: `${model.featureId}.path.select`,
                  featureId: model.featureId,
                  payload: { index: row.index },
                });
              }}
            >
              <span className="pathRowHead">
                <span className="pathRowName">{row.name}</span>
                <span className="pathRowBadges">
                  <span className={`pathRowBadge type-${row.typeClassName}`}>
                    {row.typeLabel}
                  </span>
                  {row.variantLabel ? (
                    <span className="pathRowBadge pathVariantBadge">
                      {row.variantLabel}
                    </span>
                  ) : null}
                </span>
              </span>
              <span className="pathRowMetrics">
                <span className="pathMetric">
                  <span className="pathMetricLabel">Path gain</span>
                  <span className="pathMetricValue">{row.gain}</span>
                </span>
                <span className="pathMetric">
                  <span className="pathMetricLabel">Delay</span>
                  <span className="pathMetricValue">{row.delay}</span>
                </span>
              </span>
            </button>
          ))}
        </div>
      </div>
      <div
        id="pathDetailSection"
        className={classNames("linkDockSection", !model.detail && "hidden")}
        aria-hidden={!model.detail}
        ref={detailRef}
      >
        <div className="sectionTitle" id="pathDetailTitle">
          Selected Path
        </div>
        <div id="pathDetailList" className="pathDetailList">
          {model.detail ? (
            <div className="pathDetailCard oat-list-card active">
              <div className="pathDetailHead">
                <div className="pathDetailTitle">{model.detail.title}</div>
                <span className="pathTypeTag">{model.detail.typeLabel}</span>
              </div>
              <div className="pathDetailGrid">
                {model.detail.fields.map((field) => (
                  <div
                    className={classNames(
                      "pathDetailItem oat-list-card",
                      field.wide && "wide",
                    )}
                    key={field.id}
                  >
                    <b>{field.label}</b>
                    <span>{field.value}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </>
  );
}

function MobilityTimeline({
  model,
}: {
  readonly model: ResultDockSnapshot["mobility"];
}) {
  const dispatch = useUiCommand();
  return (
    <div
      id="mobilityTimelineSection"
      className={classNames("linkDockSection", !model.visible && "hidden")}
      aria-hidden={!model.visible}
    >
      <div className="sectionTitleRow">
        <div>
          <div className="sectionTitle">Mobility Timeline</div>
          <div className="channelAnalysisMiniTitle" id="mobilityStepLabel">
            {model.stepLabel}
          </div>
        </div>
        <Filter
          id="mobilityMetric"
          className="miniSelect"
          ariaLabel="Mobility metric"
          featureId="mobility"
          commandName="mobility.timeline.metric.change"
          value={model.metric}
          options={[
            { value: "received_power_db", label: "Path Gain" },
            { value: "valid_paths", label: "Paths" },
            { value: "max_abs_doppler_hz", label: "Doppler" },
            { value: "peak_tap_power_db", label: "Strongest Tap" },
          ]}
        />
      </div>
      <ChartFrame>
        <svg
          id="mobilitySeriesChart"
          className="tapChart mobilityChart"
          viewBox="0 0 420 172"
          role="img"
          aria-label="Mobility time series chart"
        />
      </ChartFrame>
      <div className="mobilityPlayback">
        <button
          className="miniBtn oat-button oat-button--compact oat-button--legacy-native-font"
          id="btnMobilityPlay"
          type="button"
          onClick={() => {
            void dispatch({
              name: "mobility.playback.toggle",
              featureId: "mobility",
              payload: undefined,
            });
          }}
        >
          {model.playing ? "Pause" : "Play"}
        </button>
        <input
          id="mobilityStepSlider"
          type="range"
          min="0"
          max={model.maxStep}
          step="1"
          value={model.selectedStep}
          aria-label="Mobility step"
          onInput={(event) => {
            void dispatch({
              name: "mobility.timeline.seek",
              featureId: "mobility",
              payload: { value: Number(event.currentTarget.value) },
            });
          }}
        />
        <Filter
          id="mobilityPlaybackSpeed"
          className="miniSelect"
          ariaLabel="Mobility playback speed"
          featureId="mobility"
          commandName="mobility.playback.speed.change"
          value={model.playbackSpeed}
          defaultValue="1"
          options={[
            { value: "0.5", label: "0.5x" },
            { value: "1", label: "1x" },
            { value: "2", label: "2x" },
            { value: "5", label: "5x" },
          ]}
        />
      </div>
    </div>
  );
}

function RadioMapSections({
  model,
}: {
  readonly model: ResultDockSnapshot["radiomap"];
}) {
  return (
    <>
      <Summary
        id="radiomapResult"
        visible={model.visible}
        metrics={model.summary}
      />
      <div
        id="radiomapResolutionSection"
        className={classNames("linkDockSection", !model.visible && "hidden")}
        aria-hidden={!model.visible}
      >
        <div className="sectionTitle">Resolution &amp; Budget</div>
        <MetricGrid
          className="channelStats"
          items={metricItems(model.resolution)}
        />
      </div>
      <div
        id="rmColorbarSection"
        className={classNames(
          "linkDockSection rmColorbarSection",
          !model.colorbar.visible && "hidden",
        )}
        aria-hidden={!model.colorbar.visible}
      >
        <div className="sectionTitle">Display Scale</div>
        <div className="rmColorbarHead">
          <span id="rmColormapLabel">{model.colorbar.colormapLabel}</span>
          <span id="rmColorbarRange">{model.colorbar.rangeLabel}</span>
        </div>
        <div
          id="rmColorbar"
          className="rmColorbar"
          style={{ background: model.colorbar.gradient || undefined }}
        />
        <div className="rmColorbarTicks">
          <span id="rmColorbarMin">{model.colorbar.minLabel}</span>
          <span id="rmColorbarMax">{model.colorbar.maxLabel}</span>
        </div>
      </div>
    </>
  );
}

function RadarRow({ row }: { readonly row: RadarRowViewModel }) {
  const dispatch = useUiCommand();
  const commandName =
    row.dataAttribute === "detectionId"
      ? "radar.detection.select"
      : row.dataAttribute === "targetId"
        ? "radar.truth.select"
        : "radar.path.select";
  return (
    <button
      type="button"
      className={classNames(
        "radarResultRow oat-list-card oat-list-card--interactive",
        row.className,
        row.selected && "selected",
      )}
      data-detection-id={
        row.dataAttribute === "detectionId" ? row.dataValue : undefined
      }
      data-target-id={
        row.dataAttribute === "targetId" ? row.dataValue : undefined
      }
      data-path-index={
        row.dataAttribute === "pathIndex" ? row.dataValue : undefined
      }
      onClick={() => {
        void dispatch({
          name: commandName,
          featureId: "radar",
          payload: { value: row.dataValue },
        });
      }}
    >
      <span className="radarResultRowHead">
        <strong>{row.title}</strong>
        <small>{row.meta}</small>
      </span>
      <span>{row.detail}</span>
    </button>
  );
}

function RadarSections({
  model,
}: {
  readonly model: ResultDockSnapshot["radar"];
}) {
  const dispatch = useUiCommand();
  return (
    <div
      id="radarResultSections"
      className={classNames("radarResultSections", !model.visible && "hidden")}
      aria-hidden={!model.visible}
    >
      <Summary
        id="radarResult"
        visible={model.visible}
        metrics={model.summary}
        className="radarResultSummary"
      />
      <section
        id="radarRangeDopplerSection"
        className="linkDockSection radarChartSection"
      >
        <div className="sectionTitleRow">
          <div>
            <div className="sectionTitle">Range–Doppler</div>
            <div id="radarRdMeta" className="channelAnalysisMiniTitle">
              {model.rangeDoppler.meta}
            </div>
          </div>
          <span
            id="radarRdTruncated"
            className={classNames(
              "radarSummaryBadge oat-badge",
              !model.rangeDoppler.truncated && "hidden",
            )}
          >
            DOWNSAMPLED
          </span>
        </div>
        <div
          className="radarProcessingToolbar"
          role="group"
          aria-label="Range Doppler signal processing view"
        >
          {model.rangeDoppler.processingOptions.map((option) => (
            <button
              id={`radarRd${option.id === "raw" ? "Raw" : option.id === "mean_subtracted" ? "Mean" : "Ideal"}`}
              className={classNames(
                model.rangeDoppler.processingView === option.id && "active",
              )}
              type="button"
              disabled={model.visible && !option.available}
              aria-pressed={
                model.visible
                  ? model.rangeDoppler.processingView === option.id
                  : undefined
              }
              key={option.id}
              onClick={() => {
                void dispatch({
                  name: "radar.processing.select",
                  featureId: "radar",
                  payload: { value: option.id },
                });
              }}
            >
              {option.label}
            </button>
          ))}
        </div>
        <p id="radarRdProcessingHint" className="radarProcessingHint">
          {model.rangeDoppler.processingHint}
        </p>
        <div
          className="radarChartToolbar"
          role="group"
          aria-label="Range Doppler viewport"
        >
          <button
            id="radarRdFocus"
            className={classNames(
              model.rangeDoppler.viewport === "focus" && "active",
            )}
            type="button"
            disabled={model.visible && !model.rangeDoppler.focusAvailable}
            aria-pressed={
              model.visible
                ? model.rangeDoppler.viewport === "focus"
                : undefined
            }
            onClick={() => {
              void dispatch({
                name: "radar.rangeDoppler.scope.select",
                featureId: "radar",
                payload: { value: "focus" },
              });
            }}
          >
            Target Detail
          </button>
          <button
            id="radarRdFull"
            className={classNames(
              model.rangeDoppler.viewport === "full" && "active",
            )}
            type="button"
            aria-pressed={
              model.visible ? model.rangeDoppler.viewport === "full" : undefined
            }
            onClick={() => {
              void dispatch({
                name: "radar.rangeDoppler.scope.select",
                featureId: "radar",
                payload: { value: "full" },
              });
            }}
          >
            Scene Overview
          </button>
          <span id="radarRdHover">Hover for range, Doppler, and power.</span>
        </div>
        <div
          id="radarPlotLegend"
          className="radarPlotLegend"
          aria-label="Range Doppler legend"
        >
          <span className="target">Ground truth</span>
          <span className="detection">Associated detection</span>
          <span className="clutter">Clutter detection</span>
          <span className="power">Power (dBm)</span>
        </div>
        <ChartFrame className="radarChartFrame">
          <canvas
            id="radarRangeDopplerCanvas"
            className="radarChart"
            aria-label="Range Doppler heatmap"
          />
          <div
            id="radarChartCrosshair"
            className="radarChartCrosshair hidden"
            aria-hidden="true"
          >
            <i className="vertical" />
            <i className="horizontal" />
            <span id="radarChartTooltip" />
          </div>
        </ChartFrame>
      </section>
      <section className="linkDockSection radarChartSection">
        <div className="sectionTitle">Range Profile</div>
        <canvas
          id="radarRangeProfileCanvas"
          className="radarChart radarProfileChart"
          aria-label="Range profile"
        />
      </section>
      <section id="radarDetectionSection" className="linkDockSection">
        <div className="sectionTitleRow">
          <div className="sectionTitle">Detections</div>
          <span
            id="radarDetectionCount"
            className="radarSummaryBadge oat-badge"
          >
            {model.detectionCount}
          </span>
        </div>
        <div className="radarResultControls">
          <Filter
            id="radarDetectionFilter"
            ariaLabel="Detection filter"
            featureId="radar"
            commandName="radar.detections.filter"
            value={model.detectionFilter}
            legacyBare
            options={[
              { value: "all", label: "Targets + strongest clutter" },
              { value: "target", label: "Target detections only" },
              { value: "clutter", label: "Clutter detections only" },
            ]}
          />
          <button
            id="radarDetectionMore"
            className={classNames(
              "miniBtn oat-button oat-button--compact",
              !model.detectionMoreVisible && "hidden",
            )}
            type="button"
            onClick={() => {
              void dispatch({
                name: "radar.detections.toggleAll",
                featureId: "radar",
                payload: undefined,
              });
            }}
          >
            {model.detectionMoreLabel}
          </button>
        </div>
        <div
          id="radarDetectionList"
          className="radarResultList radarDetectionList oat-scroll-region"
        >
          {model.detections.length ? (
            model.detections.map((row) => <RadarRow row={row} key={row.id} />)
          ) : model.detectionEmptyMessage ? (
            <EmptyState
              className="radarEmptyState"
              message={model.detectionEmptyMessage}
            />
          ) : null}
        </div>
      </section>
      <section id="radarTruthSection" className="linkDockSection">
        <div className="sectionTitle">Target Ground Truth</div>
        <div id="radarTruthList" className="radarResultList oat-scroll-region">
          {model.truth.length ? (
            model.truth.map((row) => <RadarRow row={row} key={row.id} />)
          ) : model.truthEmptyMessage ? (
            <EmptyState
              className="radarEmptyState"
              message={model.truthEmptyMessage}
            />
          ) : null}
        </div>
      </section>
      <section id="radarPathSection" className="linkDockSection">
        <div className="sectionTitleRow">
          <div className="sectionTitle">Propagation Paths</div>
          <span id="radarPathCount" className="radarSummaryBadge oat-badge">
            {model.pathCount}
          </span>
        </div>
        <div className="radarPathControls">
          <Filter
            id="radarPathDisplayMode"
            ariaLabel="3D path display"
            featureId="radar"
            commandName="radar.paths.displayMode.change"
            value={model.pathDisplayMode}
            defaultValue="key"
            legacyBare
            options={[
              { value: "target", label: "Target Echoes" },
              { value: "key", label: "Target + Key Clutter" },
              { value: "all", label: "All Returned Paths" },
            ]}
          />
          <span id="radarPathDisplayHint">{model.pathDisplayHint}</span>
        </div>
        <div
          id="radarPathList"
          className="radarResultList radarPathList oat-scroll-region"
        >
          {model.paths.length ? (
            model.paths.map((row) => <RadarRow row={row} key={row.id} />)
          ) : model.pathEmptyMessage ? (
            <EmptyState
              className="radarEmptyState"
              message={model.pathEmptyMessage}
            />
          ) : null}
          {model.pathNote ? (
            <p className="radarListNote">{model.pathNote}</p>
          ) : null}
        </div>
      </section>
    </div>
  );
}

export interface ResultDockContentProps {
  readonly store: UiExternalStore<ResultDockSnapshot>;
}

export function ResultDockContent({ store }: ResultDockContentProps) {
  const snapshot = useFeatureSnapshot(store);
  const linkActive = snapshot.activeMode === "link" && snapshot.link.visible;
  const mobilityActive =
    snapshot.activeMode === "mobility" && snapshot.mobility.visible;
  const radioMapActive =
    snapshot.activeMode === "radiomap" && snapshot.radiomap.visible;
  const radarActive = snapshot.activeMode === "radar" && snapshot.radar.visible;
  const paths = mobilityActive ? snapshot.mobility.paths : snapshot.link.paths;
  const channel = mobilityActive
    ? snapshot.mobility.channel
    : snapshot.link.channel;
  return (
    <>
      <Summary
        id="linkResult"
        visible={linkActive}
        metrics={snapshot.link.summary}
      />
      <Summary
        id="mobilityResult"
        visible={mobilityActive}
        metrics={snapshot.mobility.summary}
      />
      <RadioMapSections
        model={{ ...snapshot.radiomap, visible: radioMapActive }}
      />
      <MobilityTimeline
        model={{ ...snapshot.mobility, visible: mobilityActive }}
      />
      <PathSections
        model={{
          ...paths,
          visible: (linkActive || mobilityActive) && paths.visible,
        }}
      />
      <ChannelSection
        channel={{
          ...channel,
          visible: (linkActive || mobilityActive) && channel.visible,
        }}
      />
      <RadarSections model={{ ...snapshot.radar, visible: radarActive }} />
    </>
  );
}
