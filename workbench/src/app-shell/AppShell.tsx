import {
  memo,
  useEffect,
  useRef,
  type ChangeEvent,
  type KeyboardEvent,
  type MouseEvent,
} from "react";

import { useUiCommand } from "../app/use-ui-command.ts";
import type { ControlSurfaceModel } from "../features/controls/control-surface-model.ts";
import type { DeepMimoDatasetModel } from "../features/deepmimo/deepmimo-dataset-model.ts";
import type { ResultDockModel } from "../features/results/result-dock-model.ts";
import { ShellLayout } from "./ShellLayout.tsx";
import type { ShellUiModel } from "./shell-ui-model.ts";

const shellButtonCommands = new Map<string, string>([
  ["panelToggle", "workbench.controls.toggle"],
  ["btnEntrySidebarToggle", "entry.sidebar.toggle"],
  ["btnEntryReturnScene", "entry.scene.return"],
  ["btnEntrySearch", "entry.search.submit"],
  ["btnEntryFitMap", "entry.map.fit"],
  ["btnEntryFocusSelection", "entry.map.focusSelection"],
  ["btnEntryZoomIn", "entry.map.zoomIn"],
  ["btnEntryZoomOut", "entry.map.zoomOut"],
  ["btnEnterScene", "entry.scene.enter"],
  ["btnOpenTileIndex", "entry.scene.open"],
  ["btnPerformanceDockToggle", "performance.dock.toggle"],
  ["btnResultDockToggle", "results.dock.toggle"],
  ["btnShowAllCategories", "performance.categories.showAll"],
  ["btnHideHeavyCategories", "performance.categories.hideHeavy"],
  ["btnLoadingCancel", "loading.cancel"],
  ["appDialogPrimary", "dialog.primary"],
  ["appDialogSecondary", "dialog.secondary"],
  ["appDialogClose", "dialog.close"],
]);

const embeddedOwners = new Set([
  "control-form",
  "deepmimo-datasets",
  "device-dock",
  "result-dock",
]);

const ShellMarkup = memo(
  function ShellMarkup({
    handleChange,
    handleClick,
    handleKeyDown,
    handleMouseOut,
    handleToggle,
    controlModel,
    datasetModel,
    resultModel,
    shellModel,
  }: {
    readonly handleChange: (event: ChangeEvent<HTMLDivElement>) => void;
    readonly handleClick: (event: MouseEvent<HTMLDivElement>) => void;
    readonly handleKeyDown: (event: KeyboardEvent<HTMLDivElement>) => void;
    readonly handleMouseOut: (event: MouseEvent<HTMLDivElement>) => void;
    readonly handleToggle: (event: Event) => void;
    readonly controlModel: ControlSurfaceModel;
    readonly datasetModel: DeepMimoDatasetModel;
    readonly resultModel: ResultDockModel;
    readonly shellModel: ShellUiModel;
  }) {
    const shellRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
      const shell = shellRef.current;
      if (!shell) return;
      shell.addEventListener("toggle", handleToggle, true);
      return () => {
        shell.removeEventListener("toggle", handleToggle, true);
      };
    }, [handleToggle]);
    return (
      <div
        className="shell"
        data-oat-react-owner="app-shell"
        ref={shellRef}
        onChange={handleChange}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        onMouseOut={handleMouseOut}
      >
        <ShellLayout
          controlModel={controlModel}
          datasetModel={datasetModel}
          resultModel={resultModel}
          shellModel={shellModel}
        />
      </div>
    );
  },
  () => true,
);

function ownerFor(target: Element): string | null {
  return (
    target.closest<HTMLElement>("[data-oat-react-owner]")?.dataset
      .oatReactOwner ?? null
  );
}

function command(name: string, payload?: unknown) {
  return { name, payload };
}

export function AppShell({
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
  const dispatch = useUiCommand();

  useEffect(() => {
    const dismissTransient = (event: globalThis.MouseEvent) => {
      const target = event.target;
      if (target instanceof Element && target.closest(".modeSelector")) return;
      void dispatch(command("workbench.transient.dismiss"));
    };
    const handleGlobalKeydown = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      void dispatch(command("workbench.transient.dismiss"));
      void dispatch(command("viewer.precision.escape"));
    };
    const handleResize = () => {
      void dispatch(command("workbench.resize"));
    };
    document.addEventListener("click", dismissTransient);
    document.addEventListener("keydown", handleGlobalKeydown);
    window.addEventListener("resize", handleResize);
    const performanceTimer = window.setInterval(() => {
      void dispatch(command("performance.tick"));
    }, 500);
    return () => {
      document.removeEventListener("click", dismissTransient);
      document.removeEventListener("keydown", handleGlobalKeydown);
      window.removeEventListener("resize", handleResize);
      window.clearInterval(performanceTimer);
    };
  }, [dispatch]);

  const handleClick = (event: MouseEvent<HTMLDivElement>) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const button = target.closest<HTMLButtonElement>("button");
    if (!button) return;
    const owner = ownerFor(button);
    if (owner && embeddedOwners.has(owner)) return;
    const mode = button.dataset.mode;
    if (mode) {
      void dispatch(command("workbench.mode.select", { mode }));
      return;
    }
    const performanceMode = button.dataset.performanceMode;
    if (performanceMode) {
      void dispatch(
        command("performance.mode.select", { mode: performanceMode }),
      );
      return;
    }
    const placeIndex = button.dataset.entryPlaceIndex;
    if (placeIndex !== undefined) {
      void dispatch(
        command("entry.place.select", { index: Number(placeIndex) }),
      );
      return;
    }
    const commandName = shellButtonCommands.get(button.id);
    if (commandName) void dispatch(command(commandName));
  };

  const handleChange = (event: ChangeEvent<HTMLDivElement>) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) return;
    const owner = ownerFor(target);
    if (owner && embeddedOwners.has(owner)) return;
    if (target.id === "perfLightMaterials") {
      void dispatch(
        command("performance.lightMaterials.toggle", {
          checked: target.checked,
        }),
      );
      return;
    }
    const category =
      target.closest<HTMLElement>("[data-category]")?.dataset.category;
    if (category) {
      void dispatch(
        command("performance.category.toggle", {
          category,
          checked: target.checked,
        }),
      );
      return;
    }
    if (target.closest("#tileList")) {
      void dispatch(
        command("entry.tile.toggle", {
          tileId: target.value,
          checked: target.checked,
        }),
      );
    }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (
      event.target instanceof HTMLInputElement &&
      event.target.id === "entryPlaceInput" &&
      event.key === "Enter" &&
      !event.shiftKey
    ) {
      event.preventDefault();
      void dispatch(command("entry.search.submit"));
    }
  };

  const handleToggle = (event: Event) => {
    const target = event.target;
    if (!(target instanceof HTMLDetailsElement)) return;
    if (target.id === "modeSelector") {
      void dispatch(command("workbench.mode.toggle", { open: target.open }));
    }
  };

  const handleMouseOut = (event: MouseEvent<HTMLDivElement>) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const figure = target.closest("#entryMapFigure");
    if (!figure) return;
    if (
      event.relatedTarget instanceof Node &&
      figure.contains(event.relatedTarget)
    ) {
      return;
    }
    void dispatch(command("entry.map.pointerLeave"));
  };

  return (
    <>
      <canvas id="view" />
      <ShellMarkup
        controlModel={controlModel}
        datasetModel={datasetModel}
        handleChange={handleChange}
        handleClick={handleClick}
        handleKeyDown={handleKeyDown}
        handleMouseOut={handleMouseOut}
        handleToggle={handleToggle}
        resultModel={resultModel}
        shellModel={shellModel}
      />
    </>
  );
}
