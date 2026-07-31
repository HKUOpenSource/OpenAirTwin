import { ControlSurface } from "../features/controls/ControlSurface.tsx";
import type { ControlSurfaceModel } from "../features/controls/control-surface-model.ts";
import { DeepMimoDatasetTray } from "../features/deepmimo/DeepMimoDatasetTray.tsx";
import type { DeepMimoDatasetModel } from "../features/deepmimo/deepmimo-dataset-model.ts";
import { ResultDockContent } from "../features/results/ResultDockContent.tsx";
import type { ResultDockModel } from "../features/results/result-dock-model.ts";
import {
  EntryPlaceResults,
  PerformanceCategoryList,
  TileSelectionList,
} from "./ShellCollections.tsx";
import type { ShellUiModel } from "./shell-ui-model.ts";

export function ShellLayout({
  controlModel,
  datasetModel,
  resultModel,
  shellModel,
}: {
  readonly controlModel: ControlSurfaceModel;
  readonly datasetModel: DeepMimoDatasetModel;
  readonly resultModel: ResultDockModel;
  readonly shellModel: ShellUiModel;
}) {
  return (
    <>
      <div
        id="paramTooltipLayer"
        className="paramTooltipLayer hidden"
        role="tooltip"
        aria-hidden="true"
      >
        <div className="paramTooltipText" id="paramTooltipText"></div>
        <div className="paramTooltipArrow" aria-hidden="true"></div>
      </div>
      <div
        id="linkChannelSection"
        className="channelAnalysisDock oat-panel hidden"
        aria-hidden="true"
      >
        <button
          className="channelAnalysisHead"
          id="btnResultDockToggle"
          type="button"
          aria-label="Collapse results panel"
          aria-expanded="true"
          aria-controls="channelAnalysisScroll"
        >
          <span className="channelAnalysisTitleBlock">
            <span className="sectionTitle" id="resultDockTitle">
              {"Link Results"}
            </span>{" "}
            <span className="channelAnalysisSubtitle" id="resultDockSubtitle">
              {"Path Gains & Taps"}
            </span>
          </span>{" "}
          <span className="channelAnalysisHeadActions">
            <span
              id="livePreviewStatus"
              className="livePreviewStatus hidden"
              aria-live="polite"
            >
              {"Idle"}
            </span>
            <span className="channelAnalysisChevron" aria-hidden="true">
              <svg viewBox="0 0 24 24">
                <path d="m6 9 6 6 6-6"></path>
              </svg>
            </span>
          </span>
        </button>
        <div
          id="channelAnalysisScroll"
          className="channelAnalysisScroll oat-scroll-region"
          aria-hidden="false"
        >
          <div className="oat-react-mount" data-oat-react-owner="result-dock">
            <ResultDockContent store={resultModel.store} />
          </div>
        </div>
      </div>
      <div className="oat-react-mount" data-oat-react-owner="deepmimo-datasets">
        <DeepMimoDatasetTray store={datasetModel.store} />
      </div>
      <div id="loadingScreen">
        <div className="loadingCard">
          <div className="loadingTitle" id="loadingTitle">
            {"Loading Scene"}
          </div>
          <div id="barWrap">
            <div id="bar"></div>
          </div>
          <div id="loadingPhase">{"Initializing..."}</div>
          <button
            className="oat-button loadingCancelBtn hidden"
            id="btnLoadingCancel"
            type="button"
          >
            {"Cancel"}
          </button>
        </div>
      </div>
      <div id="appDialog" className="appDialog hidden" aria-hidden="true">
        <div className="appDialogBackdrop" aria-hidden="true"></div>
        <section
          className="appDialogCard oat-panel"
          id="appDialogCard"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="appDialogTitle"
          aria-describedby="appDialogMessage"
          tabIndex={-1}
        >
          <button
            className="appDialogClose"
            id="appDialogClose"
            type="button"
            aria-label="Close dialog"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M18 6 6 18"></path>
              <path d="m6 6 12 12"></path>
            </svg>
          </button>
          <div className="appDialogTone" aria-hidden="true"></div>
          <h2 className="appDialogTitle" id="appDialogTitle">
            {"OpenAirTwin"}
          </h2>
          <p className="appDialogMessage" id="appDialogMessage"></p>
          <pre className="appDialogDetail hidden" id="appDialogDetail"></pre>
          <div className="appDialogActions">
            <button
              className="oat-button appDialogSecondary hidden"
              id="appDialogSecondary"
              type="button"
            >
              {"Cancel"}
            </button>
            <button
              className="oat-button oat-button--primary appDialogPrimary"
              id="appDialogPrimary"
              type="button"
            >
              {"OK"}
            </button>
          </div>
        </section>
      </div>
      <div id="entryScreen" className="hidden">
        <div className="entryCard">
          <button
            className="entrySidebarToggle"
            id="btnEntrySidebarToggle"
            type="button"
            aria-label="Collapse search sidebar"
            aria-expanded="true"
          >
            <span
              className="sidebarToggleIcon sidebarToggleIconCollapse"
              aria-hidden="true"
            >
              <svg viewBox="0 0 24 24">
                <path d="m15 18-6-6 6-6"></path>
              </svg>
            </span>
            <span
              className="sidebarToggleIcon sidebarToggleIconOpen"
              aria-hidden="true"
            >
              <svg viewBox="0 0 24 24">
                <circle cx="11" cy="11" r="6"></circle>
                <path d="m16 16 4 4"></path>
              </svg>
            </span>
          </button>
          <div className="entrySidebarStack">
            <section className="entryIntro oat-panel" id="entrySidebar">
              <div className="entrySidebarHead">
                <div className="entrySidebarBrand" aria-label="OpenAirTwin">
                  <img
                    className="brandLogo openAirTwinLogo"
                    src="/assets/openairtwin_logo.png"
                    alt="OpenAirTwin logo"
                  />
                </div>
              </div>
              <div className="entryManual">
                <label className="entryManualLabel" htmlFor="entryPlaceInput">
                  {"Place Search"}
                </label>
                <div className="entryManualRow">
                  <input
                    id="entryPlaceInput"
                    className="entryManualInput oat-input"
                    type="text"
                    placeholder="e.g. HKU, Pok Fu Lam, Central"
                    autoComplete="off"
                  />
                  <button
                    className="oat-button oat-button--compact"
                    id="btnEntrySearch"
                    type="button"
                  >
                    {"Search"}
                  </button>
                </div>
                <div className="entryManualHint" id="entrySearchHint"></div>
                <div
                  className="entryPlaceResults"
                  id="entryPlaceResults"
                  aria-live="polite"
                >
                  <EntryPlaceResults store={shellModel.store} />
                </div>
              </div>
            </section>
          </div>
          <section className="entryMapPanel">
            <div className="entryMapHead">
              <div className="entryMapTitle" id="entryMapTitle">
                {"HKU Wireless Digital Twin"}
              </div>
            </div>
            <div className="entryMapToolbar">
              <button
                className="entryIconBtn"
                id="btnEntryFitMap"
                type="button"
                title="Fit map"
                aria-label="Fit map"
              >
                {"⌂"}
              </button>
              <button
                className="entryIconBtn"
                id="btnEntryFocusSelection"
                type="button"
                title="Focus selected tiles"
                aria-label="Focus selected tiles"
              >
                {"◎"}
              </button>
              <button
                className="entryIconBtn"
                id="btnEntryZoomIn"
                type="button"
                title="Zoom in"
                aria-label="Zoom in"
              >
                {"+"}
              </button>
              <button
                className="entryIconBtn"
                id="btnEntryZoomOut"
                type="button"
                title="Zoom out"
                aria-label="Zoom out"
              >
                {"−"}
              </button>
            </div>
            <div className="entryMapViewport" id="entryMapViewport">
              <div className="entryMapFigure" id="entryMapFigure">
                <div className="entryMapScene" id="entryMapScene"></div>
                <div className="entryMapTooltip hidden" id="entryMapTooltip">
                  <strong data-entry-tooltip-title></strong>
                  <br data-entry-tooltip-break />
                  <span data-entry-tooltip-body></span>
                </div>
                <div className="entryMapBadge">
                  <b>{"Selection"}</b>
                  <span id="entryMapBadgeValue">{"0 selected"}</span>
                  <small id="entryMapBadgeDetail">
                    {"0 loaded · 0 pending"}
                  </small>
                </div>
                <div className="entryMapLegend" aria-label="Tile status legend">
                  <span className="legendItem">
                    <i className="legendSwatch available"></i>
                    {" Available"}
                  </span>
                  <span className="legendItem">
                    <i className="legendSwatch selected"></i>
                    {" Selected"}
                  </span>
                  <span className="legendItem">
                    <i className="legendSwatch loaded"></i>
                    {" Loaded"}
                  </span>
                  <span className="legendItem">
                    <i className="legendSwatch downloadable"></i>
                    {" Downloadable"}
                  </span>
                </div>
              </div>
            </div>
            <div className="entryLoadAction">
              <button
                className="oat-button oat-button--primary entryFooterBtn"
                id="btnEnterScene"
                type="button"
                disabled
              >
                {"\n              Load Selected Tiles\n            "}
              </button>
              <button
                className="quickIconBtn"
                id="btnEntryReturnScene"
                type="button"
                title="Return to 3D"
                aria-label="Return to 3D"
                disabled
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M12 3 4.5 7.2 12 11.4l7.5-4.2L12 3Z"></path>
                  <path d="M4.5 7.2v9.1L12 21V11.4"></path>
                  <path d="M19.5 7.2v9.1L12 21"></path>
                </svg>
              </button>
            </div>
          </section>
        </div>
      </div>
      <button
        id="panelToggle"
        className="hidden"
        type="button"
        aria-label="Collapse control sidebar"
        aria-expanded="true"
      >
        <span
          className="sidebarToggleIcon sidebarToggleIconCollapse"
          aria-hidden="true"
        >
          <svg viewBox="0 0 24 24">
            <path d="m15 18-6-6 6-6"></path>
          </svg>
        </span>
        <span
          className="sidebarToggleIcon sidebarToggleIconOpen"
          aria-hidden="true"
        >
          <svg viewBox="0 0 24 24">
            <path d="M5 7h14"></path>
            <path d="M5 12h14"></path>
            <path d="M5 17h14"></path>
          </svg>
        </span>
      </button>
      <div id="ui" className="oat-panel">
        <div className="uiHead">
          <div className="uiTitleBlock" aria-label="OpenAirTwin">
            <img
              className="brandLogo openAirTwinLogo"
              src="/assets/openairtwin_logo.png"
              alt="OpenAirTwin logo"
            />
          </div>
        </div>
        <div id="uiBody" className="oat-scroll-region">
          <details className="paramGroup modeSelector" id="modeSelector">
            <summary
              className="paramGroupSummary modeSelectButton"
              id="modeSelectButton"
              aria-haspopup="listbox"
              aria-expanded="false"
              aria-controls="modeMenu"
            >
              <span className="modeSelectTitle" id="modeSelectTitle">
                {"Mode (Link Analysis)"}
              </span>
            </summary>
            <div className="paramGroupBody modeSelectBody">
              <div
                className="modeMenu"
                id="modeMenu"
                role="listbox"
                aria-label="Analysis mode"
              >
                <button
                  className="modeMenuItem active"
                  data-mode="link"
                  id="tabLink"
                  type="button"
                  role="option"
                  aria-selected="true"
                >
                  <span className="modeMenuDot" aria-hidden="true"></span>
                  <span className="modeMenuTitle">{"Link Analysis"}</span>
                </button>
                <button
                  className="modeMenuItem"
                  data-mode="mobility"
                  id="tabMobility"
                  type="button"
                  role="option"
                  aria-selected="false"
                >
                  <span className="modeMenuDot" aria-hidden="true"></span>
                  <span className="modeMenuTitle">{"Mobility Analysis"}</span>
                </button>
                <button
                  className="modeMenuItem"
                  data-mode="radiomap"
                  id="tabRadiomap"
                  type="button"
                  role="option"
                  aria-selected="false"
                >
                  <span className="modeMenuDot" aria-hidden="true"></span>
                  <span className="modeMenuTitle">{"Radio Map"}</span>
                </button>
                <button
                  className="modeMenuItem"
                  data-mode="deepmimo"
                  id="tabDeepMimo"
                  type="button"
                  role="option"
                  aria-selected="false"
                >
                  <span className="modeMenuDot" aria-hidden="true"></span>
                  <span className="modeMenuTitle">{"DeepMIMO"}</span>
                </button>
                <button
                  className="modeMenuItem"
                  data-mode="radar"
                  id="tabRadar"
                  type="button"
                  role="option"
                  aria-selected="false"
                >
                  <span className="modeMenuDot" aria-hidden="true"></span>
                  <span className="modeMenuTitle">{"Radar Sensing"}</span>
                </button>
              </div>
            </div>
          </details>
          <div className="tileStateCache" aria-hidden="true">
            <div id="tileSummary" className="tileSummary hidden">
              {"0 selected · 0 loaded · 0 pending"}
            </div>
            <div id="tileList" className="tileList hidden">
              <TileSelectionList store={shellModel.store} />
            </div>
          </div>
          <div className="oat-react-mount" data-oat-react-owner="control-form">
            <ControlSurface section="form" store={controlModel.store} />
          </div>
        </div>
      </div>
      <div
        id="deviceDock"
        className="deviceDock oat-panel hidden"
        aria-hidden="true"
      >
        <div className="oat-react-mount" data-oat-react-owner="device-dock">
          <ControlSurface section="device" store={controlModel.store} />
        </div>
      </div>
      <div
        id="sceneQuickBar"
        className="sceneQuickBar hidden"
        aria-hidden="true"
      >
        <button
          className="quickIconBtn"
          id="btnOpenTileIndex"
          type="button"
          title="Choose tiles on map"
          aria-label="Choose tiles on map"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M9 18 3 21V6l6-3 6 3 6-3v15l-6 3-6-3Z"></path>
            <path d="M9 3v15"></path>
            <path d="M15 6v15"></path>
          </svg>
        </button>
        <div
          id="performanceDock"
          className="performanceDock oat-panel hidden collapsed"
          aria-hidden="true"
        >
          <button
            className="performanceDockHead"
            id="btnPerformanceDockToggle"
            type="button"
            aria-label="Expand performance panel"
            aria-expanded="false"
          >
            <span className="performanceDockTitle">{"Performance"}</span>{" "}
            <span className="performanceDockSummary">
              <span className="fpsSummary">
                <b>{"FPS"}</b>
                <i id="perfSummaryFps">{"--"}</i>
              </span>{" "}
              <span className="detailSummary">
                <b>{"DPR"}</b>
                <i id="perfSummaryDpr">{"--"}</i>
              </span>{" "}
              <span className="detailSummary">
                <b>{"Load"}</b>
                <i id="perfSummaryLoaded">{"--"}</i>
              </span>
            </span>
            <span className="performanceDockChevron" aria-hidden="true">
              <svg viewBox="0 0 24 24">
                <path d="m6 9 6 6 6-6"></path>
              </svg>
            </span>
          </button>
          <div className="performanceDockBody">
            <div className="controlLabel">{"Performance Mode"}</div>
            <div
              className="perfModeTabs"
              role="group"
              aria-label="Performance mode"
            >
              <button
                className="perfModeBtn active"
                data-performance-mode="auto"
                id="perfModeAuto"
                type="button"
              >
                {"Auto"}
              </button>
              <button
                className="perfModeBtn"
                data-performance-mode="quality"
                id="perfModeQuality"
                type="button"
              >
                {"Quality"}
              </button>
              <button
                className="perfModeBtn"
                data-performance-mode="fast"
                id="perfModeFast"
                type="button"
              >
                {"Fast"}
              </button>
            </div>
            <label className="perfCheck">
              <input id="perfLightMaterials" type="checkbox" defaultChecked />
              {"\n            Lightweight materials\n          "}
            </label>
            <div className="perfHud" id="perfHud">
              <div className="perfHudGrid">
                <div className="perfHudItem">
                  <b>{"FPS"}</b>
                  <span id="perfFps">{"--"}</span>
                </div>
                <div className="perfHudItem">
                  <b>{"DPR"}</b>
                  <span id="perfDpr">{"--"}</span>
                </div>
                <div className="perfHudItem">
                  <b>{"Calls"}</b>
                  <span id="perfDrawCalls">{"--"}</span>
                </div>
                <div className="perfHudItem">
                  <b>{"Triangles"}</b>
                  <span id="perfTriangles">{"--"}</span>
                </div>
                <div className="perfHudItem wide">
                  <b>{"Visible Faces / Vertices"}</b>
                  <span id="perfFaces">{"--"}</span>
                </div>
                <div className="perfHudItem wide">
                  <b>{"Loaded Tiles / Bundles"}</b>
                  <span id="perfLoaded">{"--"}</span>
                </div>
              </div>
            </div>
            <div className="categoryHead">
              <span>{"Category Visibility"}</span>
              <div className="categoryActions">
                <button
                  className="oat-button oat-button--compact"
                  id="btnShowAllCategories"
                  type="button"
                >
                  {"Show All"}
                </button>
                <button
                  className="oat-button oat-button--compact"
                  id="btnHideHeavyCategories"
                  type="button"
                >
                  {"Hide Heavy"}
                </button>
              </div>
            </div>
            <div id="categoryVisibility" className="categoryVisibility">
              <PerformanceCategoryList store={shellModel.store} />
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
