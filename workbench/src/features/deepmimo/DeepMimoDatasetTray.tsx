import { useUiCommand } from "../../app/use-ui-command.ts";
import { ScrollRegion } from "../../design-system/components/Panel.tsx";
import { classNames } from "../../design-system/class-names.ts";
import {
  useFeatureSnapshot,
  type UiExternalStore,
} from "../../runtime/observable-state.ts";
import type { DeepMimoDatasetTrayViewModel } from "./contracts.ts";

export function DeepMimoDatasetTray({
  store,
}: {
  readonly store: UiExternalStore<DeepMimoDatasetTrayViewModel>;
}) {
  const model = useFeatureSnapshot(store);
  const dispatch = useUiCommand();
  return (
    <div
      id="deepMimoDatasetTray"
      className={classNames(
        "deepMimoDatasetTray",
        !model.visible && "hidden",
        model.expanded && "open",
      )}
      aria-hidden={!model.visible}
      onClick={(event) => {
        event.stopPropagation();
      }}
    >
      <button
        className="deepMimoDatasetToggle"
        id="deepMimoDatasetToggle"
        type="button"
        aria-expanded={model.expanded}
        aria-controls="deepMimoDatasetPanel"
        title="DeepMIMO datasets"
        onClick={() => {
          void dispatch({
            name: "deepmimo.datasets.toggle",
            featureId: "deepmimo",
            payload: undefined,
          });
        }}
      >
        <span className="deepMimoDatasetIcon" aria-hidden="true">
          <svg viewBox="0 0 24 24">
            <path d="M12 3v10" />
            <path d="m7 9 5 5 5-5" />
            <path d="M5 19h14" />
          </svg>
        </span>
        <span className="deepMimoDatasetLabel">Datasets</span>{" "}
        <span
          className="deepMimoDatasetCount"
          id="deepMimoDatasetCount"
          aria-live="polite"
        >
          {model.datasets.length}
        </span>
      </button>
      <div
        id="deepMimoDatasetPanel"
        className={classNames(
          "deepMimoDatasetPanel oat-panel",
          !model.expanded && "hidden",
        )}
        aria-hidden={!model.expanded}
      >
        <div className="deepMimoDatasetHeader">
          <span>Generated Datasets</span>
        </div>
        <ScrollRegion id="deepMimoDatasetList" className="deepMimoDatasetList">
          {model.datasets.map((dataset) => (
            <div
              className="deepMimoDatasetItem oat-list-card"
              key={dataset.jobId}
            >
              <div className="deepMimoDatasetMeta">
                <div className="deepMimoDatasetName">
                  {dataset.scenarioName}
                </div>
                <div className="deepMimoDatasetDetail">{dataset.detail}</div>
              </div>
              <a
                className="deepMimoDatasetDownload"
                href={dataset.downloadUrl}
                download={dataset.archiveName}
              >
                Download
              </a>
            </div>
          ))}
        </ScrollRegion>
      </div>
    </div>
  );
}
