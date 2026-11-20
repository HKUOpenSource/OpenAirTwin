import { useEffect, useRef } from "react";

import { useUiCommand } from "../app/use-ui-command.ts";
import { LeftInspector } from "../features/controls/LeftInspector.tsx";
import type { DeepMimoDatasetModel } from "../features/deepmimo/deepmimo-dataset-model.ts";
import { RightAnalysisDrawer } from "../features/results/RightAnalysisDrawer.tsx";
import type { ResultDockModel } from "../features/results/result-dock-model.ts";
import type { ImperativeHostRegistry } from "../runtime/host-registry.ts";
import { useFeatureSnapshot } from "../runtime/observable-state.ts";
import type {
  ControlsStoreController,
  ShellStoreController,
} from "../runtime/workbench-store.ts";
import { AppAlertDialog, LoadingOverlay } from "./AppOverlays.tsx";
import { DeviceBar } from "./DeviceBar.tsx";
import { EntryMapScreen } from "./EntryMapScreen.tsx";
import { TopWorkspaceBar } from "./TopWorkspaceBar.tsx";

export function AppShell({
  shellStore,
  controlsStore,
  datasetModel,
  resultModel,
  hosts,
}: {
  readonly shellStore: ShellStoreController;
  readonly controlsStore: ControlsStoreController;
  readonly datasetModel: DeepMimoDatasetModel;
  readonly resultModel: ResultDockModel;
  readonly hosts: ImperativeHostRegistry;
}) {
  const dispatch = useUiCommand();
  const shell = useFeatureSnapshot(shellStore.store);
  const controls = useFeatureSnapshot(controlsStore.store);
  const viewCanvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    hosts.register("view", viewCanvasRef.current);
    return () => {
      hosts.register("view", null);
    };
  }, [hosts]);

  useEffect(() => {
    const handleGlobalKeydown = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      void dispatch({
        name: "workbench.transient.dismiss",
        payload: undefined,
      });
      void dispatch({ name: "viewer.precision.escape", payload: undefined });
    };
    const handleResize = () => {
      void dispatch({ name: "workbench.resize", payload: undefined });
    };
    document.addEventListener("keydown", handleGlobalKeydown);
    window.addEventListener("resize", handleResize);
    const performanceTimer = window.setInterval(() => {
      void dispatch({ name: "performance.tick", payload: undefined });
    }, 500);
    return () => {
      document.removeEventListener("keydown", handleGlobalKeydown);
      window.removeEventListener("resize", handleResize);
      window.clearInterval(performanceTimer);
    };
  }, [dispatch]);

  const inScene = shell.screen === "scene";

  return (
    <div
      className="oat-root"
      data-oat-react-owner="app-shell"
      data-testid="app-shell"
    >
      {/* Persistent full-bleed WebGL 3D scene host */}
      <canvas id="view" ref={viewCanvasRef} />

      {/* Main CAD / Simulation Workstation Layout */}
      <div
        className="oat-workspace shell"
        data-hidden={!inScene}
        aria-hidden={!inScene}
      >
        <TopWorkspaceBar shell={shell} datasetStore={datasetModel.store} />

        <div className="oat-stage">
          <LeftInspector
            controls={controls}
            collapsed={shell.leftRailCollapsed}
            hosts={hosts}
          />

          <main className="oat-center-stage" aria-label="3D Viewport Overlay">
            <DeviceBar controls={controls} />
          </main>

          <RightAnalysisDrawer shell={shell} resultStore={resultModel.store} />
        </div>
      </div>

      {/* Fullscreen Tile-Selection Map Screen */}
      <EntryMapScreen shell={shell} hosts={hosts} />

      {/* Global Modal Loading Overlay & Alert/Confirm Dialog */}
      <LoadingOverlay loading={shell.loading} />
      <AppAlertDialog dialog={shell.dialog} />
    </div>
  );
}
