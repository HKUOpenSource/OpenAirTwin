import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import {
  ChevronLeft,
  ChevronRight,
  Crosshair,
  Pause,
  Play,
  RotateCcw,
} from "lucide-react";
import { Badge } from "@astryxdesign/core/Badge";
import { Button } from "@astryxdesign/core/Button";
import { Slider } from "@astryxdesign/core/Slider";
import { Switch } from "@astryxdesign/core/Switch";
import { Tab, TabList } from "@astryxdesign/core/TabList";

import {
  LAB_MODES,
  getModeFromUrl,
  type LabModeId,
} from "../data/siteData";
import {
  COLORMAP_NAMES,
  colorForColormap,
  colormapGradient,
  type ColormapName,
} from "../physics/colormaps";
import {
  DEFAULT_RX,
  DEFAULT_RX_HEIGHT_M,
  DEFAULT_TX,
  DEFAULT_TX_HEIGHT_M,
  computeDeepMimoGrid,
  computeLinkPaths,
  computeRadarScene,
  computeRadioMapGrid,
  nudgePointOutsideBuildings,
  radarNormalizedCoords,
  sampleMobilityTrajectory,
  type Point2D,
} from "../physics/urbanModel";
import { UrbanScene3D } from "./UrbanScene3D";

const NLOS_TEST_RX: Point2D = { x: 70, y: 63 };

function formatSigned(value: number, decimals = 1): string {
  return value < 0
    ? `−${Math.abs(value).toFixed(decimals)}`
    : value.toFixed(decimals);
}

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function PhysicsSandbox({
  activeModeId,
  onModeChange,
  sceneResetSignal = 0,
}: {
  readonly activeModeId: LabModeId;
  readonly onModeChange: (modeId: LabModeId, pushHistory?: boolean) => void;
  readonly sceneResetSignal?: number;
}) {
  const modeSpec =
    LAB_MODES.find((m) => m.id === activeModeId) ?? LAB_MODES[0];

  // Shared 3D Tx / Rx link state
  const [tx, setTx] = useState<Point2D>(DEFAULT_TX);
  const [rx, setRx] = useState<Point2D>(DEFAULT_RX);
  const [txHeightM, setTxHeightM] = useState<number>(DEFAULT_TX_HEIGHT_M);
  const [rxHeightM, setRxHeightM] = useState<number>(DEFAULT_RX_HEIGHT_M);
  const [freqGhz, setFreqGhz] = useState<number>(3.5);
  const [maxDepth, setMaxDepth] = useState<number>(2);

  // Mobility playback
  const [mobilityProgress, setMobilityProgress] = useState<number>(0.36);
  const [mobilityPlaying, setMobilityPlaying] = useState<boolean>(
    () => !prefersReducedMotion(),
  );

  // Radio map state
  const [colormap, setColormap] = useState<ColormapName>("viridis");

  // DeepMIMO state
  const [roiWidthM, setRoiWidthM] = useState<number>(420);
  const [rxSpacingM, setRxSpacingM] = useState<number>(22);
  const [deepMimoTraceRays, setDeepMimoTraceRays] = useState<boolean>(true);
  const [selectedDeepMimoIndex, setSelectedDeepMimoIndex] = useState<number>(18);

  // Radar state
  const [bistatic, setBistatic] = useState<boolean>(false);
  const [clutterSuppression, setClutterSuppression] = useState<boolean>(true);
  const [cfarThresholdDb, setCfarThresholdDb] = useState<number>(12);
  const [radarPhase, setRadarPhase] = useState<number>(0.18);
  const [radarPlaying, setRadarPlaying] = useState<boolean>(
    () => !prefersReducedMotion(),
  );
  const radarCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // Sync browser back/forward history with ?mode=...
  useEffect(() => {
    const handlePopState = () => {
      const next = getModeFromUrl();
      onModeChange(next ?? "link", false);
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [onModeChange]);

  // Animation loop only while active mode is Mobility or Radar and playing
  useEffect(() => {
    const animateMobility = activeModeId === "mobility" && mobilityPlaying;
    const animateRadar = activeModeId === "radar" && radarPlaying;
    if (!animateMobility && !animateRadar) return undefined;

    let rafId = 0;
    let lastTime = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(0.1, (now - lastTime) / 1000);
      lastTime = now;
      if (animateMobility) {
        setMobilityProgress((prev) => (prev + dt * 0.11) % 1);
      }
      if (animateRadar) {
        setRadarPhase((prev) => (prev + dt * 0.12) % 1);
      }
      rafId = window.requestAnimationFrame(tick);
    };
    rafId = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(rafId);
  }, [activeModeId, mobilityPlaying, radarPlaying]);

  // Physics computations
  const linkSim = useMemo(
    () => computeLinkPaths(tx, rx, freqGhz, maxDepth, txHeightM, rxHeightM),
    [tx, rx, freqGhz, maxDepth, txHeightM, rxHeightM],
  );

  const mobilitySamples = useMemo(
    () => sampleMobilityTrajectory(tx, freqGhz, 56, txHeightM),
    [tx, freqGhz, txHeightM],
  );

  const activeMobilitySample = useMemo(() => {
    const index = Math.min(
      mobilitySamples.length - 1,
      Math.max(
        0,
        Math.round(mobilityProgress * (mobilitySamples.length - 1)),
      ),
    );
    return mobilitySamples[index];
  }, [mobilityProgress, mobilitySamples]);

  const radioMap = useMemo(
    () => computeRadioMapGrid(tx, freqGhz, 80, 50, txHeightM),
    [tx, freqGhz, txHeightM],
  );

  const deepMimo = useMemo(
    () => computeDeepMimoGrid(roiWidthM, rxSpacingM, tx, freqGhz, txHeightM),
    [roiWidthM, rxSpacingM, tx, freqGhz, txHeightM],
  );

  const clampedDeepMimoIndex =
    deepMimo.points.length > 0
      ? Math.max(0, Math.min(deepMimo.points.length - 1, selectedDeepMimoIndex))
      : 0;

  const deepMimoUserSim = useMemo(() => {
    if (deepMimo.points.length === 0) return null;
    const pt = deepMimo.points[clampedDeepMimoIndex];
    return computeLinkPaths(tx, pt, freqGhz, 2, txHeightM, DEFAULT_RX_HEIGHT_M);
  }, [deepMimo.points, clampedDeepMimoIndex, tx, freqGhz, txHeightM]);

  const radarSim = useMemo(
    () =>
      computeRadarScene(
        bistatic,
        clutterSuppression ? 1.0 : 0.85,
        clutterSuppression ? cfarThresholdDb : Math.max(8, cfarThresholdDb - 2),
        radarPhase,
        clutterSuppression,
      ),
    [bistatic, clutterSuppression, cfarThresholdDb, radarPhase],
  );

  // Paint Range-Doppler heatmap onto mini inspector canvas when active mode is Radar
  useEffect(() => {
    if (activeModeId !== "radar") return;
    const canvas = radarCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const { rdCols, rdRows, rdMatrixDb } = radarSim;
    const img = ctx.createImageData(rdCols, rdRows);
    const minDb = -98;
    const maxDb = -46;
    for (let i = 0; i < rdCols * rdRows; i += 1) {
      const valDb = rdMatrixDb[i];
      const norm = (valDb - minDb) / (maxDb - minDb);
      const { r, g, b } = colorForColormap("turbo", norm);
      const offset = i * 4;
      img.data[offset] = r;
      img.data[offset + 1] = g;
      img.data[offset + 2] = b;
      img.data[offset + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
  }, [activeModeId, radarSim]);

  const handleNudgeKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    const step = 4;
    let dx = 0;
    let dy = 0;
    if (event.key === "ArrowLeft") dx = -step;
    else if (event.key === "ArrowRight") dx = step;
    else if (event.key === "ArrowUp") dy = -step;
    else if (event.key === "ArrowDown") dy = step;
    else return;
    event.preventDefault();
    setRx((curr) =>
      nudgePointOutsideBuildings({ x: curr.x + dx, y: curr.y + dy }),
    );
  };

  const toggleSampleRxSpot = () => {
    const distFromDefault = Math.hypot(rx.x - DEFAULT_RX.x, rx.y - DEFAULT_RX.y);
    setRx(distFromDefault < 14 ? NLOS_TEST_RX : DEFAULT_RX);
  };

  const stepDeepMimoUser = (delta: number) => {
    const total = deepMimo.points.length;
    if (total <= 0) return;
    setSelectedDeepMimoIndex((curr) => (curr + delta + total) % total);
  };

  return (
    <div className="oat-lab-shell" data-testid="physics-sandbox">
      <div className="oat-lab-header-bar">
        <div className="oat-lab-tabs">
          <TabList
            aria-label="Interactive 3D physics workflows"
            hasDivider={false}
            onChange={(value) => onModeChange(value as LabModeId, true)}
            role="tablist"
            size="md"
            value={activeModeId}
          >
            {LAB_MODES.map((mode) => (
              <Tab
                id={`lab-tab-${mode.id}`}
                key={mode.id}
                label={mode.shortLabel}
                panelId="lab-panel"
                value={mode.id}
              />
            ))}
          </TabList>
        </div>

        <span className="oat-lab-scene-meta oat-tabular">
          640 × 400 m · Urban Twin
        </span>
      </div>

      <div
        aria-labelledby={`lab-tab-${activeModeId}`}
        className="oat-lab-grid"
        id="lab-panel"
        role="tabpanel"
      >
        {/* Left Interactive 3D Viewport */}
        <div className="oat-lab-stage-pane">
          <UrbanScene3D
            colormap={colormap}
            deepMimo={deepMimo}
            deepMimoTraceRays={deepMimoTraceRays}
            deepMimoUserPaths={deepMimoUserSim?.paths ?? []}
            linkPaths={linkSim.paths}
            mobilityPaths={activeMobilitySample.paths}
            mobilityRx={activeMobilitySample.rx}
            modeSpec={modeSpec}
            onPlaceRx={(pt) => setRx(pt)}
            onPlaceTx={(pt) => setTx(pt)}
            onSelectDeepMimoUser={(idx) => setSelectedDeepMimoIndex(idx)}
            radarBistatic={bistatic}
            radarSim={radarSim}
            radioMap={radioMap}
            resetSignal={sceneResetSignal}
            rx={rx}
            rxHeightM={rxHeightM}
            selectedDeepMimoIndex={clampedDeepMimoIndex}
            tx={tx}
            txHeightM={txHeightM}
          />
        </div>

        {/* Right Fixed-Height Inspector Pane */}
        <aside className="oat-lab-control-pane" aria-label="Simulation controls">
          <div className="oat-lab-control-head">
            <div className="oat-lab-control-title-row">
              <h3>{modeSpec.label}</h3>
              <Badge label={modeSpec.outcomeLabel} variant="neutral" />
            </div>
            <p className="oat-lab-control-desc">{modeSpec.description}</p>
          </div>

          <div className="oat-lab-controls-stack">
            {activeModeId === "link" ? (
              <>
                <Slider
                  formatValue={(v) => `${v.toFixed(1)} GHz`}
                  label="Frequency"
                  max={28}
                  min={2.4}
                  onChange={setFreqGhz}
                  step={0.1}
                  value={freqGhz}
                  valueDisplay="text"
                  width="100%"
                />
                <Slider
                  formatValue={(v) => `${v}`}
                  label="Max Bounces"
                  max={2}
                  min={0}
                  onChange={setMaxDepth}
                  step={1}
                  value={maxDepth}
                  valueDisplay="text"
                  width="100%"
                />
                <Slider
                  formatValue={(v) => `${v.toFixed(0)} m`}
                  label="Rx Height"
                  max={32}
                  min={2}
                  onChange={setRxHeightM}
                  step={1}
                  value={rxHeightM}
                  valueDisplay="text"
                  width="100%"
                />
                <div className="oat-lab-btn-row">
                  <button
                    aria-label="Move Rx between LoS and NLoS test positions (arrow keys move Rx)"
                    className="oat-lab-action-btn"
                    data-testid="lab-handle-rx"
                    onClick={toggleSampleRxSpot}
                    onKeyDown={handleNudgeKeyDown}
                    type="button"
                  >
                    <Crosshair size={14} />
                    <span>{linkSim.losVisible ? "Move to NLoS" : "Move to LoS"}</span>
                  </button>
                  <Button
                    icon={<RotateCcw size={13} />}
                    label="Reset"
                    onClick={() => {
                      setTx(DEFAULT_TX);
                      setRx(DEFAULT_RX);
                      setRxHeightM(DEFAULT_RX_HEIGHT_M);
                    }}
                    size="sm"
                    variant="secondary"
                  />
                </div>
              </>
            ) : null}

            {activeModeId === "mobility" ? (
              <>
                <Slider
                  formatValue={(v) => `${Math.round(v * 100)}%`}
                  label="Route Progress"
                  max={1}
                  min={0}
                  onChange={(val: number) => {
                    setMobilityPlaying(false);
                    setMobilityProgress(val);
                  }}
                  step={0.02}
                  value={mobilityProgress}
                  valueDisplay="text"
                  width="100%"
                />
                <Slider
                  formatValue={(v) => `${v.toFixed(1)} GHz`}
                  label="Frequency"
                  max={28}
                  min={2.4}
                  onChange={setFreqGhz}
                  step={0.1}
                  value={freqGhz}
                  valueDisplay="text"
                  width="100%"
                />
                <Slider
                  formatValue={(v) => `${v.toFixed(0)} m`}
                  label="Tx Height"
                  max={44}
                  min={14}
                  onChange={setTxHeightM}
                  step={1}
                  value={txHeightM}
                  valueDisplay="text"
                  width="100%"
                />
                <Button
                  icon={
                    mobilityPlaying ? <Pause size={14} /> : <Play size={14} />
                  }
                  label={mobilityPlaying ? "Pause Route" : "Play Route"}
                  onClick={() => setMobilityPlaying((prev) => !prev)}
                  size="sm"
                  variant="primary"
                  width="100%"
                />
              </>
            ) : null}

            {activeModeId === "radiomap" ? (
              <>
                <Slider
                  formatValue={(v) => `${v.toFixed(1)} GHz`}
                  label="Frequency"
                  max={28}
                  min={2.4}
                  onChange={setFreqGhz}
                  step={0.1}
                  value={freqGhz}
                  valueDisplay="text"
                  width="100%"
                />
                <Slider
                  formatValue={(v) => `${v.toFixed(0)} m`}
                  label="Tx Height"
                  max={44}
                  min={14}
                  onChange={setTxHeightM}
                  step={1}
                  value={txHeightM}
                  valueDisplay="text"
                  width="100%"
                />
                <div>
                  <div className="oat-lab-sublabel">Colormap</div>
                  <div className="oat-colormap-picker">
                    {COLORMAP_NAMES.map((name) => (
                      <button
                        aria-pressed={colormap === name}
                        className="oat-colormap-btn"
                        key={name}
                        onClick={() => setColormap(name)}
                        type="button"
                      >
                        <span
                          className="oat-colormap-bar"
                          style={{ background: colormapGradient(name) }}
                        />
                        <span>{name}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </>
            ) : null}

            {activeModeId === "deepmimo" ? (
              <>
                <Slider
                  formatValue={(v) => `${v} m`}
                  label="ROI Width"
                  max={520}
                  min={200}
                  onChange={setRoiWidthM}
                  step={20}
                  value={roiWidthM}
                  valueDisplay="text"
                  width="100%"
                />
                <Slider
                  formatValue={(v) => `${v} m`}
                  label="Grid Spacing"
                  max={36}
                  min={12}
                  onChange={setRxSpacingM}
                  step={2}
                  value={rxSpacingM}
                  valueDisplay="text"
                  width="100%"
                />
                <Switch
                  label="Show User Rays"
                  labelPosition="start"
                  labelSpacing="spread"
                  onChange={setDeepMimoTraceRays}
                  size="sm"
                  value={deepMimoTraceRays}
                  width="100%"
                />
                <div className="oat-user-stepper">
                  <button
                    aria-label="Previous sampled Rx user"
                    className="oat-stepper-btn"
                    onClick={() => stepDeepMimoUser(-1)}
                    type="button"
                  >
                    <ChevronLeft size={14} />
                  </button>
                  <span className="oat-stepper-value oat-tabular">
                    User #{clampedDeepMimoIndex + 1} / {deepMimo.outdoorCount}
                  </span>
                  <button
                    aria-label="Next sampled Rx user"
                    className="oat-stepper-btn"
                    onClick={() => stepDeepMimoUser(1)}
                    type="button"
                  >
                    <ChevronRight size={14} />
                  </button>
                </div>
              </>
            ) : null}

            {activeModeId === "radar" ? (
              <>
                <Switch
                  label="Bistatic Mode"
                  labelPosition="start"
                  labelSpacing="spread"
                  onChange={setBistatic}
                  size="sm"
                  value={bistatic}
                  width="100%"
                />
                <Switch
                  label="Clutter Filter"
                  labelPosition="start"
                  labelSpacing="spread"
                  onChange={setClutterSuppression}
                  size="sm"
                  value={clutterSuppression}
                  width="100%"
                />
                <Slider
                  formatValue={(v) => `${v.toFixed(1)} dB`}
                  label="CA-CFAR Threshold"
                  max={22}
                  min={8}
                  onChange={setCfarThresholdDb}
                  step={0.5}
                  value={cfarThresholdDb}
                  valueDisplay="text"
                  width="100%"
                />
                <Button
                  icon={
                    radarPlaying ? <Pause size={14} /> : <Play size={14} />
                  }
                  label={radarPlaying ? "Pause Targets" : "Animate Targets"}
                  onClick={() => setRadarPlaying((prev) => !prev)}
                  size="sm"
                  variant="primary"
                  width="100%"
                />
              </>
            ) : null}
          </div>

          <div className="oat-lab-inspector-bottom">
            {/* Fixed-height secondary analytical preview box */}
            {activeModeId === "link" ? (
              <div className="oat-lab-chart-box">
                <div className="oat-lab-chart-head">
                  <span>Power Delay Profile (PDP)</span>
                  <span className="oat-tabular">
                    {linkSim.paths.length} paths · τ{" "}
                    {linkSim.delaySpreadNs.toFixed(1)} ns
                  </span>
                </div>
                <svg
                  aria-label="Power Delay Profile chart"
                  className="oat-lab-mini-svg"
                  viewBox="0 0 360 58"
                >
                  <line
                    stroke="rgba(17,17,17,0.14)"
                    strokeWidth={1}
                    x1={8}
                    x2={352}
                    y1={50}
                    y2={50}
                  />
                  {(() => {
                    const minDelay = linkSim.paths[0]?.delayNs ?? 0;
                    const maxDelay = Math.max(
                      minDelay + 400,
                      linkSim.paths[linkSim.paths.length - 1]?.delayNs ?? 400,
                    );
                    return linkSim.paths.map((p, idx) => {
                      const x =
                        20 +
                        ((p.delayNs - minDelay) /
                          Math.max(1, maxDelay - minDelay)) *
                          320;
                      const normH = Math.max(
                        0.1,
                        Math.min(1, (p.powerDbm + 115) / 65),
                      );
                      const yTop = 50 - normH * 40;
                      const color =
                        p.kind === "los"
                          ? "#0074e2"
                          : p.kind === "reflection"
                            ? "#0d9488"
                            : "#d97706";
                      return (
                        <g key={idx}>
                          <line
                            stroke={color}
                            strokeWidth={2.5}
                            x1={x}
                            x2={x}
                            y1={50}
                            y2={yTop}
                          />
                          <circle cx={x} cy={yTop} fill={color} r={2.8} />
                        </g>
                      );
                    });
                  })()}
                </svg>
              </div>
            ) : null}

            {activeModeId === "mobility" ? (
              <div className="oat-lab-chart-box">
                <div className="oat-lab-chart-head">
                  <span>Rx Power Along Route</span>
                  <span className="oat-tabular">
                    {activeMobilitySample.losVisible ? "LoS" : "NLoS"} ·{" "}
                    {formatSigned(activeMobilitySample.rxPowerDbm)} dBm
                  </span>
                </div>
                <svg
                  aria-label="Mobility received power trace"
                  className="oat-lab-mini-svg"
                  viewBox="0 0 360 58"
                >
                  <line
                    stroke="rgba(17,17,17,0.14)"
                    strokeWidth={1}
                    x1={8}
                    x2={352}
                    y1={50}
                    y2={50}
                  />
                  <polyline
                    fill="none"
                    points={mobilitySamples
                      .map((sample, idx) => {
                        const x =
                          12 + (idx / (mobilitySamples.length - 1)) * 336;
                        const norm = Math.max(
                          0,
                          Math.min(1, (sample.rxPowerDbm + 105) / 55),
                        );
                        const y = 48 - norm * 38;
                        return `${x.toFixed(1)},${y.toFixed(1)}`;
                      })
                      .join(" ")}
                    stroke="#198100"
                    strokeWidth={2}
                  />
                  {(() => {
                    const x = 12 + mobilityProgress * 336;
                    const norm = Math.max(
                      0,
                      Math.min(1, (activeMobilitySample.rxPowerDbm + 105) / 55),
                    );
                    const y = 48 - norm * 38;
                    return (
                      <g>
                        <line
                          stroke="#111111"
                          strokeDasharray="3 2"
                          strokeWidth={1}
                          x1={x}
                          x2={x}
                          y1={6}
                          y2={50}
                        />
                        <circle cx={x} cy={y} fill="#198100" r={3.6} />
                      </g>
                    );
                  })()}
                </svg>
              </div>
            ) : null}

            {activeModeId === "radiomap" ? (
              <div className="oat-lab-chart-box">
                <div className="oat-lab-chart-head">
                  <span>Coverage Breakdown</span>
                  <span className="oat-tabular">Tx {txHeightM.toFixed(0)} m</span>
                </div>
                {(() => {
                  const losPct = radioMap.losPct;
                  const nlosCovPct = Math.max(0, radioMap.coveragePct - losPct);
                  const outagePct = Math.max(0, 100 - radioMap.coveragePct);
                  return (
                    <>
                      <div className="oat-split-bar" role="img" aria-label="Coverage distribution bar">
                        <span
                          className="oat-split-seg oat-split-seg--los"
                          style={{ width: `${losPct.toFixed(1)}%` }}
                        />
                        <span
                          className="oat-split-seg oat-split-seg--nlos"
                          style={{ width: `${nlosCovPct.toFixed(1)}%` }}
                        />
                        <span
                          className="oat-split-seg oat-split-seg--outage"
                          style={{ width: `${outagePct.toFixed(1)}%` }}
                        />
                      </div>
                      <div className="oat-split-legend oat-tabular">
                        <span>
                          <i className="oat-split-dot oat-split-seg--los" />
                          LoS {losPct.toFixed(0)}%
                        </span>
                        <span>
                          <i className="oat-split-dot oat-split-seg--nlos" />
                          NLoS {nlosCovPct.toFixed(0)}%
                        </span>
                        <span>
                          <i className="oat-split-dot oat-split-seg--outage" />
                          Outage {outagePct.toFixed(0)}%
                        </span>
                      </div>
                    </>
                  );
                })()}
              </div>
            ) : null}

            {activeModeId === "deepmimo" ? (
              <div className="oat-lab-chart-box">
                <div className="oat-lab-chart-head">
                  <span>Grid Sampling</span>
                  <span className="oat-tabular">
                    {deepMimo.cols}×{deepMimo.rows} grid
                  </span>
                </div>
                {(() => {
                  const total = Math.max(
                    1,
                    deepMimo.outdoorCount + deepMimo.maskedCount,
                  );
                  const outdoorPct = (deepMimo.outdoorCount / total) * 100;
                  const maskedPct = 100 - outdoorPct;
                  return (
                    <>
                      <div className="oat-split-bar" role="img" aria-label="Grid sampling split bar">
                        <span
                          className="oat-split-seg oat-split-seg--los"
                          style={{ width: `${outdoorPct.toFixed(1)}%` }}
                        />
                        <span
                          className="oat-split-seg oat-split-seg--outage"
                          style={{ width: `${maskedPct.toFixed(1)}%` }}
                        />
                      </div>
                      <div className="oat-split-legend oat-tabular">
                        <span>
                          <i className="oat-split-dot oat-split-seg--los" />
                          Outdoor {deepMimo.outdoorCount} ({outdoorPct.toFixed(0)}%)
                        </span>
                        <span>
                          <i className="oat-split-dot oat-split-seg--outage" />
                          Masked {deepMimo.maskedCount} ({maskedPct.toFixed(0)}%)
                        </span>
                      </div>
                    </>
                  );
                })()}
              </div>
            ) : null}

            {activeModeId === "radar" ? (
              <div className="oat-lab-chart-box">
                <div className="oat-lab-chart-head">
                  <span>Range–Doppler · CA-CFAR</span>
                  <span className="oat-tabular">
                    {radarSim.detections.length}/3 UAVs
                  </span>
                </div>
                <div className="oat-radar-mini-wrap">
                  <canvas
                    aria-label="Range-Doppler power map"
                    data-testid="radar-rd-canvas"
                    height={radarSim.rdRows}
                    ref={radarCanvasRef}
                    width={radarSim.rdCols}
                  />
                  <div
                    aria-label="CA-CFAR detection overlay"
                    className="oat-radar-overlay"
                  >
                    <div className="oat-radar-zero-line" aria-hidden="true" />
                    {radarSim.detections.map((det) => {
                      const { u, v } = radarNormalizedCoords(
                        det.rangeM,
                        det.velocityMs,
                        radarSim.maxRangeM,
                        radarSim.maxVelocityMs,
                      );
                      return (
                        <div
                          className="oat-radar-marker"
                          data-testid={`radar-marker-${det.targetId}`}
                          key={det.targetId}
                          style={{
                            left: `${(u * 100).toFixed(3)}%`,
                            top: `${(v * 100).toFixed(3)}%`,
                          }}
                        >
                          <span className="oat-radar-ring" />
                          <span
                            className={
                              u > 0.84
                                ? "oat-radar-tag oat-radar-tag--left"
                                : "oat-radar-tag"
                            }
                          >
                            {det.shortLabel}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            ) : null}

            <dl className="oat-telemetry-list" data-testid="lab-telemetry">
              {activeModeId === "link" ? (
                <>
                  <div className="oat-telemetry-row">
                    <dt>Channel</dt>
                    <dd>
                      {linkSim.losVisible
                        ? "Line-of-Sight"
                        : "Non-Line-of-Sight"}
                    </dd>
                  </div>
                  <div className="oat-telemetry-row">
                    <dt>Rx Power</dt>
                    <dd>{formatSigned(linkSim.rxPowerDbm)} dBm</dd>
                  </div>
                  <div className="oat-telemetry-row">
                    <dt>Delay Spread</dt>
                    <dd>{linkSim.delaySpreadNs.toFixed(1)} ns</dd>
                  </div>
                </>
              ) : null}

              {activeModeId === "mobility" ? (
                <>
                  <div className="oat-telemetry-row">
                    <dt>Link State</dt>
                    <dd>
                      {activeMobilitySample.losVisible
                        ? "Line-of-Sight"
                        : "Non-Line-of-Sight"}
                    </dd>
                  </div>
                  <div className="oat-telemetry-row">
                    <dt>Rx Power</dt>
                    <dd>{formatSigned(activeMobilitySample.rxPowerDbm)} dBm</dd>
                  </div>
                  <div className="oat-telemetry-row">
                    <dt>Ray Paths</dt>
                    <dd>{activeMobilitySample.paths.length}</dd>
                  </div>
                </>
              ) : null}

              {activeModeId === "radiomap" ? (
                <>
                  <div className="oat-telemetry-row">
                    <dt>Mean Gain</dt>
                    <dd>{formatSigned(radioMap.meanDbm)} dBm</dd>
                  </div>
                  <div className="oat-telemetry-row">
                    <dt>Coverage (&ge; −95 dBm)</dt>
                    <dd>{radioMap.coveragePct.toFixed(1)}%</dd>
                  </div>
                  <div className="oat-telemetry-row">
                    <dt>LoS Area</dt>
                    <dd>{radioMap.losPct.toFixed(1)}%</dd>
                  </div>
                </>
              ) : null}

              {activeModeId === "deepmimo" ? (
                <>
                  <div className="oat-telemetry-row">
                    <dt>User Rx Power</dt>
                    <dd>
                      #{clampedDeepMimoIndex + 1} ·{" "}
                      {deepMimoUserSim
                        ? `${formatSigned(deepMimoUserSim.rxPowerDbm)} dBm`
                        : "—"}
                    </dd>
                  </div>
                  <div className="oat-telemetry-row">
                    <dt>Active Grid</dt>
                    <dd>{deepMimo.outdoorCount} outdoor users</dd>
                  </div>
                  <div className="oat-telemetry-row">
                    <dt>Dataset Size</dt>
                    <dd>{deepMimo.estimatedSizeMb.toFixed(1)} MB</dd>
                  </div>
                </>
              ) : null}

              {activeModeId === "radar" ? (
                <>
                  <div className="oat-telemetry-row">
                    <dt>Geometry</dt>
                    <dd>{bistatic ? "Bistatic" : "Monostatic"}</dd>
                  </div>
                  <div className="oat-telemetry-row">
                    <dt>Detections</dt>
                    <dd>{radarSim.detections.length} / 3 UAVs</dd>
                  </div>
                  <div className="oat-telemetry-row">
                    <dt>Peak SNR</dt>
                    <dd>
                      {radarSim.detections.length > 0
                        ? `${Math.max(...radarSim.detections.map((d) => d.snrDb)).toFixed(1)} dB`
                        : "—"}
                    </dd>
                  </div>
                </>
              ) : null}
            </dl>
          </div>
        </aside>
      </div>
    </div>
  );
}
