import type { CSSProperties } from "react";
import { WorkflowTutorial } from "./WorkflowTutorial";
import {
  featureItems,
  quickStart,
  tutorialModes,
} from "./tutorialData";

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
          <div className="heroCopy">
            <h1>OpenAirTwin</h1>
            <p>
              An open-source digital twin platform for interactive wireless studies.
            </p>
            <div className="heroActions">
              <a className="primaryAction" href="#workflow-tutorial">
                Get Started
                <ArrowRightIcon />
              </a>
            </div>
          </div>
          <div className="browserFrame" aria-label="OpenAirTwin platform preview">
            <div className="browserTop">
              <span></span>
              <span></span>
              <span></span>
              <b>OpenAirTwin Platform</b>
            </div>
            <div className="heroPreview">
              <img src={media("openairtwin_showcase.png")} alt="OpenAirTwin WebGL interface preview" />
            </div>
          </div>
        </section>

        <section className="section" id="features">
          <div className="sectionHead">
            <h2>Features</h2>
          </div>
          <div className="featureGrid">
            {featureItems.map((item) => {
              const mode = tutorialModes.find((tutorialMode) => tutorialMode.id === item.modeId) ?? activeMode;

              return (
                <article className="featureCard" key={item.title} style={{ "--mode-accent": mode.accent } as CSSProperties}>
                  <img src={media(item.image)} alt={`${item.title} feature preview`} />
                  <div className="featureCardBody">
                    <h3>{item.title}</h3>
                    <p>{item.body}</p>
                    <ul>
                      {item.bullets.map((bullet) => (
                        <li key={bullet}>{bullet}</li>
                      ))}
                    </ul>
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
                <span className="stepNumber">{index + 1}</span>
                <div>
                  <h3>{item.title}</h3>
                  <p>{item.body}</p>
                  <pre>{item.code}</pre>
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

function requestTutorialMode(modeId: string) {
  window.dispatchEvent(new CustomEvent("openairtwin:set-mode", { detail: modeId }));
}

function ArrowRightIcon() {
  return (
    <svg aria-hidden="true" className="arrowIcon" fill="none" viewBox="0 0 20 20">
      <path d="M4 10h11m-4-5 5 5-5 5" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
    </svg>
  );
}

function Header() {
  return (
    <header className="topNav">
      <a className="brand" href="#home" aria-label="OpenAirTwin tutorial home">
        <img src={media("openairtwin_logo.png")} alt="" />
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
        <img src={media("openairtwin_logo.png")} alt="OpenAirTwin" />
        <p>An open-source digital twin platform for interactive wireless studies.</p>
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

export { App };
