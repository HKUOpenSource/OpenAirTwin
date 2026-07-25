import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type KeyboardEvent,
} from "react";
import type { ModeId, TutorialMode, TutorialStep } from "./tutorialData";

type WorkflowTutorialProps = {
  modes: TutorialMode[];
};

type TutorialSelection = {
  modeId: ModeId;
  stepIndex: number;
};

type SavedProgressV2 = {
  version: 2;
  modeId: ModeId;
  stepId: string;
  completedSteps: string[];
  completedActions?: string[];
};

type LegacySavedProgress = TutorialSelection & {
  completedSteps?: string[];
};

const STORAGE_KEY = "openairtwin:tutorial-progress";
const mediaAsset = (path: string) => `${import.meta.env.BASE_URL}${path.replace(/^\/+/, "")}`;
const stepKey = (modeId: ModeId, step: TutorialStep) => `${modeId}/${step.id}`;

function getSelectionFromUrl(modes: TutorialMode[]): TutorialSelection | null {
  if (typeof window === "undefined") return null;
  const tutorialPath = new URLSearchParams(window.location.search).get("tutorial");
  if (!tutorialPath) return null;
  const [modeId, stepId] = tutorialPath.split("/");
  const mode = modes.find((candidate) => candidate.id === modeId);
  const stepIndex = mode?.steps.findIndex((step) => step.id === stepId) ?? -1;
  return mode && stepIndex >= 0 ? { modeId: mode.id, stepIndex } : null;
}

function getSavedProgress(modes: TutorialMode[]) {
  const empty = {
    selection: null as TutorialSelection | null,
    completedSteps: [] as string[],
  };
  if (typeof window === "undefined") return empty;

  try {
    const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "null") as
      | SavedProgressV2
      | LegacySavedProgress
      | null;
    if (!parsed) return empty;

    if ("version" in parsed && parsed.version === 2) {
      const mode = modes.find((candidate) => candidate.id === parsed.modeId);
      const stepIndex = mode?.steps.findIndex((step) => step.id === parsed.stepId) ?? -1;
      if (!mode || stepIndex < 0) return empty;
      return {
        selection: { modeId: mode.id, stepIndex },
        completedSteps: Array.isArray(parsed.completedSteps) ? parsed.completedSteps : [],
      };
    }

    const legacy = parsed as LegacySavedProgress;
    const mode = modes.find((candidate) => candidate.id === legacy.modeId);
    const stepIndex = typeof legacy.stepIndex === "number" ? legacy.stepIndex : -1;
    if (!mode || !mode.steps[stepIndex]) return empty;
    return {
      selection: { modeId: mode.id, stepIndex },
      completedSteps: Array.isArray(legacy.completedSteps) ? legacy.completedSteps : [],
    };
  } catch {
    return empty;
  }
}

function WorkflowTutorial({ modes }: WorkflowTutorialProps) {
  const firstMode = modes[0];
  const savedProgress = useMemo(() => getSavedProgress(modes), [modes]);
  const initialSelection = useMemo(
    () => getSelectionFromUrl(modes) ?? savedProgress.selection ?? { modeId: firstMode.id, stepIndex: 0 },
    [firstMode.id, modes, savedProgress.selection],
  );
  const [activeModeId, setActiveModeId] = useState<ModeId>(initialSelection.modeId);
  const [activeStepIndex, setActiveStepIndex] = useState(initialSelection.stepIndex);
  const [completedSteps, setCompletedSteps] = useState<Set<string>>(
    () => new Set(savedProgress.completedSteps),
  );
  const [imageReady, setImageReady] = useState(false);
  const [failedImages, setFailedImages] = useState<Set<string>>(() => new Set());

  const activeMode = modes.find((mode) => mode.id === activeModeId) ?? firstMode;
  const activeStep = activeMode.steps[activeStepIndex] ?? activeMode.steps[0];
  const activeFrame = activeMode.frames.find((frame) => frame.id === activeStep.frameId) ?? activeMode.frames[0];
  const activeTargets = [activeStep.target, ...(activeStep.secondaryTargets ?? [])];
  const currentStepKey = stepKey(activeMode.id, activeStep);
  const explored = completedSteps.has(currentStepKey);
  const accentStyle = { "--mode-accent": activeMode.accent } as CSSProperties;

  const updateUrl = useCallback((mode: TutorialMode, stepIndex: number, replace = false) => {
    const step = mode.steps[stepIndex] ?? mode.steps[0];
    const url = new URL(window.location.href);
    url.searchParams.set("tutorial", `${mode.id}/${step.id}`);
    url.hash = "workflow-tutorial";
    window.history[replace ? "replaceState" : "pushState"]({}, "", url);
  }, []);

  const select = useCallback((modeId: ModeId, stepIndex: number, updateHistory = true) => {
    const mode = modes.find((candidate) => candidate.id === modeId);
    const step = mode?.steps[stepIndex];
    if (!mode || !step) return;
    setActiveModeId(modeId);
    setActiveStepIndex(stepIndex);
    setImageReady(false);
    if (updateHistory) updateUrl(mode, stepIndex);
  }, [modes, updateUrl]);

  useEffect(() => {
    const handleSetMode = (event: Event) => select((event as CustomEvent<ModeId>).detail, 0);
    const handlePopState = () => {
      const selection = getSelectionFromUrl(modes);
      if (selection) select(selection.modeId, selection.stepIndex, false);
    };
    window.addEventListener("openairtwin:set-mode", handleSetMode);
    window.addEventListener("popstate", handlePopState);
    return () => {
      window.removeEventListener("openairtwin:set-mode", handleSetMode);
      window.removeEventListener("popstate", handlePopState);
    };
  }, [modes, select]);

  useEffect(() => {
    const progress: SavedProgressV2 = {
      version: 2,
      modeId: activeMode.id,
      stepId: activeStep.id,
      completedSteps: Array.from(completedSteps),
    };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
  }, [activeMode.id, activeStep.id, completedSteps]);

  const exploreTarget = () => {
    setCompletedSteps((current) => new Set(current).add(currentStepKey));
  };

  const goToNext = () => {
    if (activeStepIndex < activeMode.steps.length - 1) {
      select(activeMode.id, activeStepIndex + 1);
      return;
    }
    const modeIndex = modes.findIndex((mode) => mode.id === activeMode.id);
    const nextMode = modes[modeIndex + 1];
    if (nextMode) select(nextMode.id, 0);
  };

  const handleModeKeyDown = (event: KeyboardEvent<HTMLButtonElement>, modeIndex: number) => {
    let nextIndex = modeIndex;
    if (event.key === "ArrowRight") nextIndex = (modeIndex + 1) % modes.length;
    else if (event.key === "ArrowLeft") nextIndex = (modeIndex - 1 + modes.length) % modes.length;
    else if (event.key === "Home") nextIndex = 0;
    else if (event.key === "End") nextIndex = modes.length - 1;
    else return;
    event.preventDefault();
    const nextMode = modes[nextIndex];
    select(nextMode.id, 0);
    window.requestAnimationFrame(() => document.getElementById(`tutorial-tab-${nextMode.id}`)?.focus());
  };

  const lastMode = modes[modes.length - 1];
  const isFinalStep = activeMode.id === lastMode.id && activeStepIndex === activeMode.steps.length - 1;
  const nextLabel = activeStepIndex < activeMode.steps.length - 1 ? "Next step" : "Next mode";

  return (
    <div className="workflowTutorial" style={accentStyle}>
      <div className="workflowTabs" role="tablist" aria-label="Workflow tutorial modes">
        {modes.map((mode, modeIndex) => (
            <button
              aria-controls="tutorial-panel"
              aria-selected={mode.id === activeMode.id}
              className={mode.id === activeMode.id ? "active" : ""}
              id={`tutorial-tab-${mode.id}`}
              key={mode.id}
              onClick={() => select(mode.id, 0)}
              onKeyDown={(event) => handleModeKeyDown(event, modeIndex)}
              role="tab"
              tabIndex={mode.id === activeMode.id ? 0 : -1}
              type="button"
            >
              <span className="tabLabelFull">{mode.label}</span>
              <span className="tabLabelShort" aria-hidden="true">{mode.shortLabel}</span>
            </button>
        ))}
      </div>

      <section
        aria-labelledby={`tutorial-tab-${activeMode.id}`}
        className="workflowLayout"
        id="tutorial-panel"
        role="tabpanel"
      >
        <aside className="tutorialSteps" aria-label={`${activeMode.label} steps`}>
          {activeMode.steps.map((step, index) => {
            const completed = completedSteps.has(stepKey(activeMode.id, step));
            return (
              <button
                aria-current={index === activeStepIndex ? "step" : undefined}
                className={index === activeStepIndex ? "active" : ""}
                key={step.id}
                onClick={() => select(activeMode.id, index)}
                type="button"
              >
                <span>{completed ? "✓" : String(index + 1).padStart(2, "0")}</span>
                <b>{step.title}</b>
              </button>
            );
          })}
        </aside>

        <section className="tutorialStageWorkspace" aria-live="polite">
          <div className="tutorialStageHeader">
            <p
              aria-live="polite"
              className="tutorialPrompt"
            >
              {explored ? activeStep.success : activeStep.instruction}
            </p>

            <div className="lessonNavigation">
              <button
                disabled={activeStepIndex === 0}
                onClick={() => select(activeMode.id, activeStepIndex - 1)}
                type="button"
              >
                Previous
              </button>
              <button
                className="primary"
                disabled={isFinalStep}
                onClick={goToNext}
                type="button"
              >
                {isFinalStep ? "Tutorial complete" : nextLabel}
              </button>
            </div>
          </div>

          <div className="tutorialStageShell">
            <div
              className="tutorialViewport"
              style={{ aspectRatio: `${activeFrame.width} / ${activeFrame.height}` }}
            >
              <div
                className="tutorialCanvas"
                style={{ aspectRatio: `${activeFrame.width} / ${activeFrame.height}` }}
              >
                {failedImages.has(activeFrame.src) ? (
                  <div className="imageFallback" role="status">
                    <span>Screenshot unavailable</span>
                    <h4>{activeStep.title}</h4>
                    <p>{activeFrame.alt}</p>
                    <p>The written walkthrough remains available beside the stage.</p>
                  </div>
                ) : (
                  <img
                    alt={activeFrame.alt}
                    decoding="async"
                    height={activeFrame.height}
                    key={`${currentStepKey}/${activeFrame.src}`}
                    onError={() => setFailedImages((current) => new Set(current).add(activeFrame.src))}
                    onLoad={() => setImageReady(true)}
                    src={mediaAsset(activeFrame.src)}
                    width={activeFrame.width}
                  />
                )}

                {!failedImages.has(activeFrame.src) && (
                  <>
                    {activeTargets.map((target) => (
                      <Fragment key={target.label}>
                        <span
                          aria-hidden="true"
                          className="tutorialTargetBox"
                          style={{
                            left: `${target.x * 100}%`,
                            top: `${target.y * 100}%`,
                            width: `${target.width * 100}%`,
                            height: `${target.height * 100}%`,
                          }}
                        />
                        <button
                          aria-label={`Explore ${target.label}: ${activeStep.instruction}`}
                          aria-pressed={explored}
                          className="tutorialTarget"
                          data-tutorial-target
                          disabled={!imageReady}
                          onClick={exploreTarget}
                          style={{
                            left: `${(target.x + target.width / 2) * 100}%`,
                            top: `${(target.y + target.height / 2) * 100}%`,
                            width: `max(44px, ${target.width * 100}%)`,
                            height: `max(44px, ${target.height * 100}%)`,
                          }}
                          type="button"
                        >
                          <span>{activeStepIndex + 1}</span>
                        </button>
                      </Fragment>
                    ))}
                  </>
                )}
              </div>
            </div>
          </div>
        </section>
      </section>
    </div>
  );
}

export { WorkflowTutorial };
