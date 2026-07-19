import { useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import type { ModeId, TutorialMode, TutorialStep } from "./tutorialData";

type WorkflowTutorialProps = {
  modes: TutorialMode[];
};

type TutorialSelection = {
  modeId: ModeId;
  stepIndex: number;
};

type SavedProgress = TutorialSelection & {
  completedSteps: string[];
};

const mediaAsset = (path: string) => `${import.meta.env.BASE_URL}${path.replace(/^\/+/, "")}`;
const STORAGE_KEY = "openairtwin:tutorial-progress";

function getSelectionFromUrl(modes: TutorialMode[]): TutorialSelection | null {
  if (typeof window === "undefined") {
    return null;
  }

  const tutorialPath = new URLSearchParams(window.location.search).get("tutorial");
  if (!tutorialPath) {
    return null;
  }

  const [modeId, stepId] = tutorialPath.split("/");
  const mode = modes.find((candidate) => candidate.id === modeId);
  const stepIndex = mode?.steps.findIndex((step) => step.id === stepId) ?? -1;
  return mode && stepIndex >= 0 ? { modeId: mode.id, stepIndex } : null;
}

function getSavedProgress(modes: TutorialMode[]): SavedProgress | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "null") as SavedProgress | null;
    const mode = modes.find((candidate) => candidate.id === parsed?.modeId);
    if (!mode || typeof parsed?.stepIndex !== "number" || !mode.steps[parsed.stepIndex]) {
      return null;
    }
    return { ...parsed, completedSteps: Array.isArray(parsed.completedSteps) ? parsed.completedSteps : [] };
  } catch {
    return null;
  }
}

function tutorialStepKey(modeId: ModeId, step: TutorialStep) {
  return `${modeId}/${step.id}`;
}

function WorkflowTutorial({ modes }: WorkflowTutorialProps) {
  const firstMode = modes[0];
  const savedProgress = useMemo(() => getSavedProgress(modes), [modes]);
  const initialSelection = useMemo(
    () => getSelectionFromUrl(modes) ?? savedProgress ?? { modeId: firstMode.id, stepIndex: 0 },
    [firstMode.id, modes, savedProgress],
  );
  const [activeModeId, setActiveModeId] = useState<ModeId>(initialSelection.modeId);
  const [activeStepIndex, setActiveStepIndex] = useState(initialSelection.stepIndex);
  const [completedSteps, setCompletedSteps] = useState<Set<string>>(
    () => new Set(savedProgress?.completedSteps ?? []),
  );
  const [unavailableVideos, setUnavailableVideos] = useState<Set<string>>(() => new Set());
  const [playbackBlocked, setPlaybackBlocked] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [videoEnded, setVideoEnded] = useState(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const activeMode = modes.find((mode) => mode.id === activeModeId) ?? firstMode;
  const activeStep = activeMode.steps[activeStepIndex] ?? activeMode.steps[0];
  const activeVideoKey = activeStep.video.sources.map((source) => source.src).join("|");
  const missingVideo = unavailableVideos.has(activeVideoKey);
  const accentStyle = { "--mode-accent": activeMode.accent } as CSSProperties;
  const activeProgressKey = tutorialStepKey(activeMode.id, activeStep);

  const updateUrl = (mode: TutorialMode, stepIndex: number, replace = false) => {
    const step = mode.steps[stepIndex] ?? mode.steps[0];
    const url = new URL(window.location.href);
    url.searchParams.set("tutorial", `${mode.id}/${step.id}`);
    url.hash = "workflow-tutorial";
    window.history[replace ? "replaceState" : "pushState"]({}, "", url);
  };

  const select = (modeId: ModeId, stepIndex: number, updateHistory = true) => {
    const mode = modes.find((candidate) => candidate.id === modeId);
    if (!mode || !mode.steps[stepIndex]) {
      return;
    }
    videoRef.current?.pause();
    setActiveModeId(modeId);
    setActiveStepIndex(stepIndex);
    setPlaybackBlocked(false);
    setVideoEnded(false);
    if (updateHistory) {
      updateUrl(mode, stepIndex);
    }
  };

  useEffect(() => {
    const handleSetMode = (event: Event) => {
      const modeId = (event as CustomEvent<ModeId>).detail;
      select(modeId, 0);
    };

    const handlePopState = () => {
      const selection = getSelectionFromUrl(modes);
      if (selection) {
        select(selection.modeId, selection.stepIndex, false);
      }
    };

    window.addEventListener("openairtwin:set-mode", handleSetMode);
    window.addEventListener("popstate", handlePopState);
    return () => {
      window.removeEventListener("openairtwin:set-mode", handleSetMode);
      window.removeEventListener("popstate", handlePopState);
    };
  });

  useEffect(() => {
    const progress: SavedProgress = {
      modeId: activeMode.id,
      stepIndex: activeStepIndex,
      completedSteps: Array.from(completedSteps),
    };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
  }, [activeMode.id, activeStepIndex, completedSteps]);

  useEffect(() => {
    const video = videoRef.current;
    if (video) {
      video.defaultPlaybackRate = playbackRate;
      video.playbackRate = playbackRate;
    }
  }, [activeVideoKey, playbackRate]);

  const replayStep = () => {
    const video = videoRef.current;
    setUnavailableVideos((current) => {
      const next = new Set(current);
      next.delete(activeVideoKey);
      return next;
    });
    setVideoEnded(false);
    if (!video) {
      return;
    }
    try {
      video.currentTime = 0;
    } catch {
      // Seeking is unavailable until metadata has loaded.
    }
    video.playbackRate = playbackRate;
    void video.play().then(() => setPlaybackBlocked(false)).catch(() => setPlaybackBlocked(true));
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

      <div
        aria-labelledby={`tutorial-tab-${activeMode.id}`}
        className="workflowLayout"
        id="tutorial-panel"
        role="tabpanel"
      >
        <section className="videoWorkspace" aria-live="polite">
          <div className="videoHeader">
            <div>
              <span>Step {activeStepIndex + 1} of {activeMode.steps.length}</span>
              <h3>{activeStep.title}</h3>
              <p>{activeStep.summary}</p>
            </div>
            <div className="videoControls">
              <button disabled={activeStepIndex === 0} onClick={() => select(activeMode.id, activeStepIndex - 1)} type="button">
                Previous
              </button>
              <button onClick={replayStep} type="button">Replay step</button>
              <label className="playbackRate">
                <span>Speed</span>
                <select
                  aria-label="Video playback speed"
                  onChange={(event) => setPlaybackRate(Number(event.target.value))}
                  value={playbackRate}
                >
                  <option value="0.75">0.75×</option>
                  <option value="1">1×</option>
                  <option value="1.25">1.25×</option>
                  <option value="1.5">1.5×</option>
                  <option value="2">2×</option>
                </select>
              </label>
              <button
                className="primary"
                disabled={activeStepIndex === activeMode.steps.length - 1}
                onClick={() => select(activeMode.id, activeStepIndex + 1)}
                type="button"
              >
                Next step
              </button>
            </div>
          </div>

          <div className="videoFrame">
            <video
              className={missingVideo ? "isUnavailable" : ""}
              controls
              key={activeVideoKey}
              muted
              onEnded={() => {
                setVideoEnded(true);
                setCompletedSteps((current) => new Set(current).add(activeProgressKey));
              }}
              onError={() => setUnavailableVideos((current) => new Set(current).add(activeVideoKey))}
              onLoadedData={() => {
                setUnavailableVideos((current) => {
                  const next = new Set(current);
                  next.delete(activeVideoKey);
                  return next;
                });
              }}
              onPlay={() => setPlaybackBlocked(false)}
              playsInline
              preload="metadata"
              ref={videoRef}
            >
              {activeStep.video.sources.map((source) => (
                <source key={source.src} src={mediaAsset(source.src)} type={source.type} />
              ))}
              <track
                default
                kind="captions"
                label="English"
                src={mediaAsset(activeStep.video.captionSrc)}
                srcLang="en"
              />
            </video>
            {playbackBlocked && !missingVideo ? <PlaybackPrompt onPlay={replayStep} /> : null}
            {missingVideo ? <MissingVideo step={activeStep} /> : null}
          </div>
          <p className="playbackStatus" aria-live="polite">
            {videoEnded || completedSteps.has(activeProgressKey)
              ? "Step complete. Continue when you are ready."
              : `Paused by default · ${activeStep.video.durationHint} · progress is saved in this browser.`}
          </p>
        </section>

        <aside className="tutorialSteps" aria-label={`${activeMode.label} steps`}>
          {activeMode.steps.map((step, index) => (
            <StepButton
              active={index === activeStepIndex}
              completed={completedSteps.has(tutorialStepKey(activeMode.id, step))}
              index={index}
              key={step.id}
              onClick={() => select(activeMode.id, index)}
              step={step}
            />
          ))}
        </aside>

        <StepNotes step={activeStep} />
      </div>
    </div>
  );
}

type StepButtonProps = {
  active: boolean;
  completed: boolean;
  index: number;
  onClick: () => void;
  step: TutorialStep;
};

function StepButton({ active, completed, index, onClick, step }: StepButtonProps) {
  return (
    <button
      aria-current={active ? "step" : undefined}
      className={active ? "active" : ""}
      onClick={onClick}
      type="button"
    >
      <span>{completed ? "✓" : String(index + 1).padStart(2, "0")}</span>
      <div><b>{step.title}</b></div>
    </button>
  );
}

function PlaybackPrompt({ onPlay }: { onPlay: () => void }) {
  return (
    <div className="playbackPrompt">
      <button onClick={onPlay} type="button">Tap to play</button>
    </div>
  );
}

function MissingVideo({ step }: { step: TutorialStep }) {
  return (
    <div className="missingVideo">
      <span>Clip not added yet</span>
      <h4>{step.title}</h4>
      <p>Add a compressed MP4 operation recording at the path below. The player will load it automatically.</p>
      <code>{step.video.expectedPath}</code>
    </div>
  );
}

function GuideList({ items }: { items: string[] }) {
  return (
    <ol>
      {items.map((item) => <li key={item}>{item}</li>)}
    </ol>
  );
}

function StepNotes({ step }: { step: TutorialStep }) {
  return (
    <aside className="stepNotes" aria-label={`${step.title} complete guide`}>
      <div className="stepNotesHead">
        <span>Complete Guide & Transcript</span>
        <h4>{step.title}</h4>
        <p>{step.summary}</p>
      </div>
      <div className="quickNotes">
        <section className="quickNote">
          <h5>Actions</h5>
          <GuideList items={step.clicks} />
        </section>
        <section className="quickNote">
          <h5>Parameters</h5>
          <GuideList items={step.parameters} />
        </section>
        <section className="quickNote">
          <h5>Expected result</h5>
          <GuideList items={step.success} />
        </section>
        <section className="quickNote warningNote">
          <h5>Before you continue</h5>
          <p>{step.warning}</p>
        </section>
      </div>
    </aside>
  );
}

export { WorkflowTutorial };
