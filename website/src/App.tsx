import { useEffect, useRef, useState, type CSSProperties } from "react";
import { WorkflowTutorial } from "./WorkflowTutorial";
import {
  featureItems,
  quickStart,
  tutorialModes,
} from "./tutorialData";
import type { ModeId } from "./tutorialData";

const media = (fileName: string) => `${import.meta.env.BASE_URL}media/${fileName}`;
const mainRepositoryUrl = "https://github.com/HKUOpenSource/OpenAirTwin";

function App() {
  const activeMode = tutorialModes[0];
  const accentStyle = { "--mode-accent": activeMode.accent } as CSSProperties;

  return (
    <div className="site" style={accentStyle}>
      <Header />
      <main>
        <section className="hero" id="home">
          <div className="heroBackdrop" aria-hidden="true">
            <span className="heroGrid"></span>
            <span className="heroScan"></span>
            <span className="heroGlow heroGlowOne"></span>
            <span className="heroGlow heroGlowTwo"></span>
          </div>
          <div className="heroCopy">
            <HeroTitleMedia />
            <p>
              An open-source digital twin platform for interactive wireless research
            </p>
            <div className="heroActions">
              <a className="primaryAction" href="#workflow-tutorial">
                Get Started
                <ArrowRightIcon />
              </a>
            </div>
          </div>
        </section>

        <section className="section" id="features">
          <div className="sectionHead">
            <h2>Features</h2>
          </div>
          <div className="featureGrid">
            {featureItems.map((item, index) => {
              const mode = tutorialModes.find((tutorialMode) => tutorialMode.id === item.modeId) ?? activeMode;

              return (
                <article className="featureCard" key={item.title} style={{ "--mode-accent": mode.accent } as CSSProperties}>
                  <div className="featureMedia">
                    <img src={media(item.image)} alt={`${item.title} feature preview`} />
                    <span>{String(index + 1).padStart(2, "0")}</span>
                  </div>
                  <div className="featureCardBody">
                    <h3>{item.title}</h3>
                    <p>{item.body}</p>
                    <a href="#workflow-tutorial" onClick={() => requestTutorialMode(item.modeId)}>
                      Watch tutorial
                      <ArrowRightIcon />
                    </a>
                  </div>
                </article>
              );
            })}
          </div>
        </section>

        <section className="section workflowSection" id="workflow-tutorial">
          <div className="sectionHead">
            <h2>Tutorial</h2>
          </div>
          <WorkflowTutorial modes={tutorialModes} />
        </section>

        <section className="section" id="quick-start">
          <div className="sectionHead">
            <h2>Installation</h2>
          </div>
          <div className="quickGrid">
            {quickStart.map((item, index) => (
              <article className="quickStep" key={item.title}>
                <div className="quickStepRail">
                  <span className="stepNumber">{index + 1}</span>
                </div>
                <div>
                  <h3>{item.title}</h3>
                  <p>{item.body}</p>
                  <div className="codePanel">
                    <div className="codePanelTop" aria-hidden="true">
                      <span></span>
                      <span></span>
                      <span></span>
                    </div>
                    <pre>{item.code}</pre>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}

function requestTutorialMode(modeId: ModeId) {
  window.dispatchEvent(new CustomEvent("openairtwin:set-mode", { detail: modeId }));
}

function ArrowRightIcon() {
  return (
    <svg aria-hidden="true" className="arrowIcon" fill="none" viewBox="0 0 20 20">
      <path d="M4 10h11m-4-5 5 5-5 5" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
    </svg>
  );
}

function HeroTitleMedia() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [videoReady, setVideoReady] = useState(false);
  const [canvasReady, setCanvasReady] = useState(false);
  const [videoFailed, setVideoFailed] = useState(false);

  useEffect(() => {
    if (!videoReady || videoFailed) {
      return undefined;
    }

    const canvas = canvasRef.current;
    const video = videoRef.current;
    const context = canvas?.getContext("2d", { willReadFrequently: true });

    if (!canvas || !video || !context) {
      setVideoFailed(true);
      return undefined;
    }

    let animationFrame = 0;
    let didShowCanvas = false;
    let stopped = false;
    let renderedWidth = 0;
    let renderedHeight = 0;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const resizeCanvas = () => {
      const bounds = canvas.getBoundingClientRect();
      const scale = Math.min(window.devicePixelRatio || 1, 1.5);
      const width = Math.max(1, Math.round(bounds.width * scale));
      const height = Math.max(1, Math.round(bounds.height * scale));

      if (width !== renderedWidth || height !== renderedHeight) {
        renderedWidth = width;
        renderedHeight = height;
        canvas.width = width;
        canvas.height = height;
      }
    };

    const keyFrame = () => {
      resizeCanvas();

      if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || renderedWidth === 0 || renderedHeight === 0) {
        return;
      }

      context.clearRect(0, 0, renderedWidth, renderedHeight);
      context.drawImage(video, 0, 0, renderedWidth, renderedHeight);

      const frame = context.getImageData(0, 0, renderedWidth, renderedHeight);
      const { data } = frame;

      for (let index = 0; index < data.length; index += 4) {
        const red = data[index];
        const green = data[index + 1];
        const blue = data[index + 2];
        const alpha = data[index + 3];
        const luma = red * 0.2126 + green * 0.7152 + blue * 0.0722;
        const signal = Math.max(luma, red * 0.56, green * 0.66, blue * 0.78);
        const keyed = Math.min(1, Math.max(0, (signal - 28) / 88));
        const smoothAlpha = keyed * keyed * (3 - 2 * keyed);

        data[index + 3] = Math.round(alpha * smoothAlpha);
      }

      context.putImageData(frame, 0, 0);

      if (!didShowCanvas) {
        didShowCanvas = true;
        setCanvasReady(true);
      }
    };

    const render = () => {
      if (stopped) {
        return;
      }

      keyFrame();

      if (reduceMotion) {
        video.pause();
        return;
      }

      animationFrame = window.requestAnimationFrame(render);
    };

    const observer = new ResizeObserver(resizeCanvas);
    observer.observe(canvas);

    void video.play().catch(() => undefined);
    render();

    return () => {
      stopped = true;
      observer.disconnect();
      window.cancelAnimationFrame(animationFrame);
    };
  }, [videoReady, videoFailed]);

  const className = [
    "heroTitleMedia",
    videoReady && canvasReady && !videoFailed ? "isVideoReady" : "",
    videoFailed ? "isVideoFailed" : "",
  ].filter(Boolean).join(" ");

  return (
    <div className={className}>
      <h1 className="srOnly">OpenAirTwin</h1>
      <canvas aria-hidden="true" className="heroTitleCanvas" ref={canvasRef} />
      <video
        aria-hidden="true"
        autoPlay
        className="heroTitleVideo"
        loop
        muted
        onCanPlay={() => setVideoReady(true)}
        onError={() => setVideoFailed(true)}
        playsInline
        preload="auto"
        ref={videoRef}
        src={media("hero_text.webm")}
      />
      <div aria-hidden={!videoFailed} className="heroTitleFallback">
        OpenAirTwin
      </div>
    </div>
  );
}

function Header() {
  return (
    <header className="topNav">
      <a className="brand" href="#home" aria-label="OpenAirTwin tutorial home">
        <BrandLogo decorative />
      </a>
      <nav aria-label="Tutorial navigation">
        <a href="#features">Features</a>
        <a href="#workflow-tutorial">Tutorial</a>
        <a href="#quick-start">Setup</a>
      </nav>
      <a className="githubLink" href={mainRepositoryUrl}>
        GitHub
      </a>
    </header>
  );
}

function Footer() {
  return (
    <footer className="footer">
      <div>
        <BrandLogo />
        <p>An open-source digital twin platform for interactive wireless research.</p>
      </div>
      <div>
        <h3>Project</h3>
        <a href={mainRepositoryUrl}>Repository</a>
        <a href={`${mainRepositoryUrl}#installation`}>README</a>
        <a href={`${mainRepositoryUrl}/blob/main/LICENSE`}>License</a>
      </div>
      <div>
        <h3>Docs</h3>
        <a href="#features">Features</a>
        <a href="#workflow-tutorial">Tutorial</a>
        <a href="#quick-start">Setup</a>
      </div>
      <div>
        <h3>Community</h3>
        <a href={`${mainRepositoryUrl}/issues`}>Issues</a>
        <a href={`${mainRepositoryUrl}/discussions`}>Discussions</a>
      </div>
    </footer>
  );
}

function BrandLogo({ decorative = false }: { decorative?: boolean }) {
  return (
    <img
      className="brandLogo"
      src={media("openairtwin_logo_dark.png")}
      alt={decorative ? "" : "OpenAirTwin"}
    />
  );
}

export { App };
