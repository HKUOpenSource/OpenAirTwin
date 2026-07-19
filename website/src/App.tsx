import { useState, type CSSProperties, type KeyboardEvent } from "react";
import { WorkflowTutorial } from "./WorkflowTutorial";
import {
  featureItems,
  quickStart,
  tutorialModes,
} from "./tutorialData";
import type { ModeId } from "./tutorialData";

const media = (fileName: string) => `${import.meta.env.BASE_URL}media/${fileName}`;
const mainRepositoryUrl = "https://github.com/HKUOpenSource/OpenAirTwin";
const architectureUrl = "https://hkuopensource.github.io/OpenAirTwin/architecture/";

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
              <a className="primaryAction" href="#features">
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
                    {item.mediaType === "video" ? (
                      <video
                        aria-label={`${item.title} feature preview`}
                        autoPlay={!window.matchMedia("(prefers-reduced-motion: reduce)").matches}
                        loop
                        muted
                        playsInline
                        preload="metadata"
                        src={media(item.image)}
                      />
                    ) : (
                      <img
                        alt={`${item.title} feature preview`}
                        decoding="async"
                        loading="lazy"
                        src={media(item.image)}
                      />
                    )}
                    <span>{String(index + 1).padStart(2, "0")}</span>
                  </div>
                  <div className="featureCardBody">
                    <h3>{item.title}</h3>
                    <p>{item.body}</p>
                    <a
                      href={`?tutorial=${item.modeId}/${mode.steps[0].id}#workflow-tutorial`}
                      onClick={(event) => {
                        event.preventDefault();
                        requestTutorialMode(item.modeId);
                        document.getElementById("workflow-tutorial")?.scrollIntoView();
                      }}
                    >
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
          <InstallationGuide />
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
  const [videoReady, setVideoReady] = useState(false);
  const [videoFailed, setVideoFailed] = useState(false);
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const className = [
    "heroTitleMedia",
    videoReady && !videoFailed ? "isVideoReady" : "",
    videoFailed ? "isVideoFailed" : "",
  ].filter(Boolean).join(" ");

  return (
    <div className={className}>
      <h1 className="srOnly">OpenAirTwin</h1>
      <video
        aria-hidden="true"
        autoPlay={!reduceMotion}
        className="heroTitleVideo"
        loop={!reduceMotion}
        muted
        onCanPlay={() => setVideoReady(true)}
        onError={() => setVideoFailed(true)}
        playsInline
        preload="metadata"
        src={media("hero_text_alpha_compact.webm")}
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
        <BrandLogo decorative priority />
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
        <a href={`${mainRepositoryUrl}#installation-details`}>README</a>
        <a href={`${mainRepositoryUrl}/blob/master/LICENSE`}>License</a>
      </div>
      <div>
        <h3>Docs</h3>
        <a href={architectureUrl}>Architecture</a>
        <a href="#features">Features</a>
        <a href="#workflow-tutorial">Tutorial</a>
        <a href="#quick-start">Setup</a>
      </div>
      <div>
        <h3>Community</h3>
        <a href={`${mainRepositoryUrl}/issues`}>Issues</a>
        <a href={`${mainRepositoryUrl}/pulls`}>Pull requests</a>
      </div>
    </footer>
  );
}

function BrandLogo({ decorative = false, priority = false }: { decorative?: boolean; priority?: boolean }) {
  return (
    <img
      className="brandLogo"
      src={media("openairtwin_logo_dark.png")}
      alt={decorative ? "" : "OpenAirTwin"}
      decoding="async"
      loading={priority ? "eager" : "lazy"}
    />
  );
}

type InstallPlatform = "unix" | "windows";

function InstallationGuide() {
  const [platform, setPlatform] = useState<InstallPlatform>("unix");
  const platforms: Array<{ id: InstallPlatform; label: string }> = [
    { id: "unix", label: "macOS / Linux" },
    { id: "windows", label: "Windows PowerShell" },
  ];

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const offset = event.key === "ArrowRight" ? 1 : -1;
    const next = platforms[(index + offset + platforms.length) % platforms.length];
    setPlatform(next.id);
    window.requestAnimationFrame(() => document.getElementById(`install-tab-${next.id}`)?.focus());
  };

  return (
    <div>
      <div className="osTabs" role="tablist" aria-label="Installation operating system">
        {platforms.map((item, index) => (
          <button
            aria-controls="installation-steps"
            aria-selected={platform === item.id}
            className={platform === item.id ? "active" : ""}
            id={`install-tab-${item.id}`}
            key={item.id}
            onClick={() => setPlatform(item.id)}
            onKeyDown={(event) => handleKeyDown(event, index)}
            role="tab"
            tabIndex={platform === item.id ? 0 : -1}
            type="button"
          >
            {item.label}
          </button>
        ))}
      </div>
      <div
        aria-labelledby={`install-tab-${platform}`}
        className="quickGrid"
        id="installation-steps"
        role="tabpanel"
      >
        {quickStart.map((item, index) => {
          const command = item.code[platform];
          return (
            <article className="quickStep" key={item.title}>
              <div className="quickStepRail"><span className="stepNumber">{index + 1}</span></div>
              <div>
                <h3>{item.title}</h3>
                <p>{item.body}</p>
                <div className="codePanel">
                  <div className="codePanelTop">
                    <span aria-hidden="true" className="windowDots"><i></i><i></i><i></i></span>
                    <CopyButton text={command} />
                  </div>
                  <pre><code>{command}</code></pre>
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  };

  return <button className="copyButton" onClick={copy} type="button">{copied ? "Copied" : "Copy"}</button>;
}

export { App };
