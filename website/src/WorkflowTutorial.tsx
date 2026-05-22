import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import type { ModeId, TutorialMode, TutorialStep } from "./tutorialData";

type WorkflowTutorialProps = {
  modes: TutorialMode[];
};

const mediaAsset = (path: string) => `${import.meta.env.BASE_URL}${path.replace(/^\/+/, "")}`;
const PLAYBACK_RATE = 1.5;

function WorkflowTutorial({ modes }: WorkflowTutorialProps) {
  const firstMode = modes[0];
  const [activeModeId, setActiveModeId] = useState<ModeId>(firstMode.id);
  const [activeStepIndex, setActiveStepIndex] = useState(0);
  const [unavailableVideos, setUnavailableVideos] = useState<Set<string>>(() => new Set());
  const [autoplayBlocked, setAutoplayBlocked] = useState(false);
  const [replayKey, setReplayKey] = useState(0);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const modeIds = useMemo(() => new Set(modes.map((mode) => mode.id)), [modes]);
  const activeModeIndex = modes.findIndex((mode) => mode.id === activeModeId);
  const activeMode = modes.find((mode) => mode.id === activeModeId) ?? firstMode;
  const activeStep = activeMode.steps[activeStepIndex] ?? activeMode.steps[0];
  const activeVideoKey = activeStep.video.sources.map((source) => source.src).join("|");
  const missingVideo = unavailableVideos.has(activeVideoKey);
  const accentStyle = { "--mode-accent": activeMode.accent } as CSSProperties;

  const playActiveVideo = useCallback((restart = false) => {
    const video = videoRef.current;
    if (!video) {
      return;
    }

    video.muted = true;
    video.playbackRate = PLAYBACK_RATE;

    if (restart) {
      try {
        video.currentTime = 0;
      } catch {
        // Some browsers disallow seeking before metadata is ready.
      }
    }

    void video
      .play()
      .then(() => setAutoplayBlocked(false))
      .catch(() => setAutoplayBlocked(true));
  }, []);

  useEffect(() => {
    const handleSetMode = (event: Event) => {
      const modeId = (event as CustomEvent<ModeId>).detail;
      if (!modeIds.has(modeId)) {
        return;
      }
      setActiveModeId(modeId);
      setActiveStepIndex(0);
      setReplayKey((key) => key + 1);
    };

    window.addEventListener("openairtwin:set-mode", handleSetMode);
    return () => window.removeEventListener("openairtwin:set-mode", handleSetMode);
  }, [modeIds]);

  useEffect(() => {
    setAutoplayBlocked(false);
    const timer = window.setTimeout(() => playActiveVideo(true), 0);
    return () => window.clearTimeout(timer);
  }, [activeVideoKey, replayKey, playActiveVideo]);

  const selectMode = (modeId: ModeId) => {
    setActiveModeId(modeId);
    setActiveStepIndex(0);
    setReplayKey((key) => key + 1);
  };

  const selectStep = (stepIndex: number) => {
    setActiveStepIndex(stepIndex);
    setReplayKey((key) => key + 1);
  };

  const replayStep = () => {
    setUnavailableVideos((current) => {
      const next = new Set(current);
      next.delete(activeVideoKey);
      return next;
    });
    setReplayKey((key) => key + 1);
  };

  const previousStep = () => {
    if (activeStepIndex > 0) {
      selectStep(activeStepIndex - 1);
      return;
    }

    const previousModeIndex = activeModeIndex <= 0 ? modes.length - 1 : activeModeIndex - 1;
    const previousMode = modes[previousModeIndex] ?? firstMode;
    setActiveModeId(previousMode.id);
    setActiveStepIndex(previousMode.steps.length - 1);
    setReplayKey((key) => key + 1);
  };

  const nextStep = () => {
    if (activeStepIndex < activeMode.steps.length - 1) {
      selectStep(activeStepIndex + 1);
      return;
    }

    const nextModeIndex = activeModeIndex < 0 || activeModeIndex >= modes.length - 1 ? 0 : activeModeIndex + 1;
    const nextMode = modes[nextModeIndex] ?? firstMode;
    setActiveModeId(nextMode.id);
    setActiveStepIndex(0);
    setReplayKey((key) => key + 1);
  };

  return (
    <div className="workflowTutorial" style={accentStyle}>
      <div className="workflowTabs" role="tablist" aria-label="Workflow tutorial modes">
        {modes.map((mode) => (
          <button
            aria-selected={mode.id === activeMode.id}
            className={mode.id === activeMode.id ? "active" : ""}
            key={mode.id}
            onClick={() => selectMode(mode.id)}
            role="tab"
            type="button"
          >
            <span className="tabLabelFull">{mode.label}</span>
            <span className="tabLabelShort">{mode.shortLabel}</span>
          </button>
        ))}
      </div>

      <div className="workflowLayout">
        <aside className="tutorialSteps" aria-label={`${activeMode.label} steps`}>
          {activeMode.steps.map((step, index) => (
            <StepButton
              active={index === activeStepIndex}
              index={index}
              key={step.id}
              onClick={() => selectStep(index)}
              step={step}
            />
          ))}
        </aside>

        <section className="videoWorkspace" aria-live="polite">
          <div className="videoHeader">
            <div>
              <span>Step {activeStepIndex + 1}</span>
              <h3>{activeStep.title}</h3>
              <p>{activeStep.summary}</p>
            </div>
            <div className="videoControls">
              <button onClick={previousStep} type="button">Previous</button>
              <button onClick={replayStep} type="button">Replay step</button>
              <button className="primary" onClick={nextStep} type="button">Next</button>
            </div>
          </div>

          <div className="videoFrame">
            <video
              autoPlay
              className={missingVideo ? "isUnavailable" : ""}
              controls
              key={`${activeVideoKey}-${replayKey}`}
              muted
              onEnded={nextStep}
              onError={() => {
                setUnavailableVideos((current) => new Set(current).add(activeVideoKey));
              }}
              onLoadedData={() => {
                setUnavailableVideos((current) => {
                  const next = new Set(current);
                  next.delete(activeVideoKey);
                  return next;
                });
              }}
              onLoadedMetadata={() => playActiveVideo(false)}
              onPlay={() => {
                const video = videoRef.current;
                if (video) {
                  video.playbackRate = PLAYBACK_RATE;
                }
                setAutoplayBlocked(false);
              }}
              playsInline
              preload="auto"
              ref={videoRef}
            >
              {activeStep.video.sources.map((source) => (
                <source key={source.src} src={mediaAsset(source.src)} type={source.type} />
              ))}
            </video>
            {autoplayBlocked && !missingVideo ? <PlaybackPrompt onPlay={() => playActiveVideo(false)} /> : null}
            {missingVideo ? <MissingVideo step={activeStep} /> : null}
          </div>
        </section>

        <StepNotes step={activeStep} />
      </div>
    </div>
  );
}

type StepButtonProps = {
  active: boolean;
  index: number;
  onClick: () => void;
  step: TutorialStep;
};

function StepButton({ active, index, onClick, step }: StepButtonProps) {
  return (
    <button
      aria-current={active ? "step" : undefined}
      className={active ? "active" : ""}
      onClick={onClick}
      type="button"
    >
      <span>{String(index + 1).padStart(2, "0")}</span>
      <div>
        <b>{step.title}</b>
      </div>
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
      <p>
        Add a compressed MP4 operation recording at the path below. The player will load it
        automatically on GitHub Pages and in local preview.
      </p>
      <code>{step.video.expectedPath}</code>
    </div>
  );
}

function StepNotes({ step }: { step: TutorialStep }) {
  const notes = [
    { label: "Focus", text: step.summary },
    { label: "Action", text: step.clicks[0] ?? step.summary },
    { label: "Result", text: step.success[0] ?? step.summary },
    { label: "Tip", text: step.warning },
  ];

  return (
    <aside className="stepNotes" aria-label={`${step.title} quick guide`}>
      <div className="stepNotesHead">
        <span>Quick Guide</span>
        <h4>{step.title}</h4>
      </div>
      <div className="quickNotes">
        {notes.map((note) => (
          <section className="quickNote" key={note.label}>
            <h5>{note.label}</h5>
            <p>{note.text}</p>
          </section>
        ))}
      </div>
    </aside>
  );
}

export { WorkflowTutorial };
