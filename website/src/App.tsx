import { useCallback, useEffect, useState } from "react";
import {
  ArrowRight,
  Building2,
  Database,
  ExternalLink,
  Radar,
} from "lucide-react";
import { Button } from "@astryxdesign/core/Button";

import { CapabilitiesGrid } from "./components/CapabilitiesGrid";
import { PhysicsSandbox } from "./components/PhysicsSandbox";
import { QuickStartSection } from "./components/QuickStartSection";
import {
  ARCHITECTURE_HREF,
  LAB_MODES,
  RELEASE_URL,
  REPOSITORY_URL,
  VALUE_PILLARS,
  getModeFromUrl,
  type LabModeId,
} from "./data/siteData";

const media = (fileName: string) =>
  `${import.meta.env.BASE_URL}media/${fileName}`;

const PILLAR_ICONS = [Building2, Radar, Database] as const;

export function App() {
  const [activeModeId, setActiveModeId] = useState<LabModeId>(
    () => getModeFromUrl() ?? "link",
  );
  const [sceneResetSignal, setSceneResetSignal] = useState<number>(0);

  const selectMode = useCallback((modeId: LabModeId, pushHistory = true) => {
    setActiveModeId(modeId);
    if (pushHistory && typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.delete("tutorial");
      url.searchParams.set("mode", modeId);
      url.hash = "lab";
      window.history.pushState({}, "", url);
    }
  }, []);

  const inspectScene = useCallback(() => {
    selectMode("link", true);
    setSceneResetSignal((n) => n + 1);
  }, [selectMode]);

  useEffect(() => {
    const handleSelectMode = (event: Event) => {
      const detail = (event as CustomEvent<string>).detail;
      if (detail === "map") {
        inspectScene();
      } else if (LAB_MODES.some((m) => m.id === detail)) {
        selectMode(detail as LabModeId, true);
      }
    };
    window.addEventListener("openairtwin:select-mode", handleSelectMode);
    return () =>
      window.removeEventListener("openairtwin:select-mode", handleSelectMode);
  }, [selectMode, inspectScene]);

  return (
    <div className="oat-site">
      <Header />

      <main>
        {/* 1. Centered Hero & 3D Interactive Lab Showcase */}
        <section className="oat-section oat-section--hero" id="home">
          <div className="oat-container">
            <div className="oat-hero-centered">
              <p className="oat-hero-eyebrow">
                Open-Source Wireless Digital Twin
              </p>

              <h1 className="oat-hero-title">
                Real-world 3D cities for wireless research.
              </h1>

              <p className="oat-hero-subtitle">
                Transform urban geometry into open, physics-based digital twins
                for wireless communication, sensing, and AI.
              </p>

              <div className="oat-hero-actions">
                <Button
                  endContent={<ArrowRight size={15} />}
                  href="#lab"
                  label="Try 3D Lab"
                  size="lg"
                  variant="primary"
                />
                <Button
                  href="#get-started"
                  label="Get Started"
                  size="lg"
                  variant="secondary"
                />
              </div>
            </div>

            <div className="oat-hero-stage" id="lab">
              <PhysicsSandbox
                activeModeId={activeModeId}
                onModeChange={selectMode}
                sceneResetSignal={sceneResetSignal}
              />
            </div>
          </div>
        </section>

        {/* 2. Platform Vision & Core Pillars */}
        <section className="oat-section" id="why">
          <div className="oat-container">
            <div className="oat-section-header">
              <p className="oat-section-eyebrow">Vision</p>
              <h2 className="oat-section-title">
                Site-specific. Unified. Open.
              </h2>
              <p className="oat-section-lead">
                One shared foundation uniting real-world 3D geometry, ray-traced
                propagation, and open research workflows.
              </p>
            </div>

            <div className="oat-pillars-grid">
              {VALUE_PILLARS.map((pillar, idx) => {
                const Icon = PILLAR_ICONS[idx] ?? Building2;
                return (
                  <article className="oat-pillar-card" key={pillar.id}>
                    <div className="oat-cap-top">
                      <span className="oat-cap-icon" aria-hidden="true">
                        <Icon size={16} strokeWidth={1.85} />
                      </span>
                      <span className="oat-cap-index oat-tabular">
                        {pillar.index}
                      </span>
                    </div>
                    <h3 className="oat-pillar-title">{pillar.title}</h3>
                    <p className="oat-pillar-desc">{pillar.description}</p>
                  </article>
                );
              })}
            </div>
          </div>
        </section>

        {/* 3. Platform Capabilities (Strict 3x2 Matrix) */}
        <section className="oat-section oat-section--surface" id="workflows">
          <div className="oat-container">
            <div className="oat-section-header">
              <p className="oat-section-eyebrow">Capabilities</p>
              <h2 className="oat-section-title">
                Core workflows on a shared 3D twin
              </h2>
              <p className="oat-section-lead">
                Explore propagation, sensing, mobility, and AI datasets today,
                with a modular architecture built to grow with your research.
              </p>
            </div>

            <CapabilitiesGrid
              onInspectScene={inspectScene}
              onSelectMode={(modeId) => selectMode(modeId, true)}
            />
          </div>
        </section>

        {/* 4. Get Started */}
        <section className="oat-section" id="get-started">
          <div className="oat-container">
            <div className="oat-section-header">
              <p className="oat-section-eyebrow">Get Started</p>
              <h2 className="oat-section-title">Run locally in minutes</h2>
              <p className="oat-section-lead">
                Install once and start exploring immediately with a bundled 3D
                sample scene.
              </p>
            </div>

            <QuickStartSection />
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}

function Header() {
  return (
    <header className="oat-nav">
      <div className="oat-container oat-nav-inner">
        <a aria-label="OpenAirTwin home" className="oat-brand" href="#home">
          <img
            alt=""
            className="oat-brand-logo"
            decoding="async"
            loading="eager"
            src={media("openairtwin_logo.png")}
          />
        </a>

        <nav aria-label="Primary navigation" className="oat-nav-links">
          <a className="oat-nav-link" href="#lab">
            3D Lab
          </a>
          <a className="oat-nav-link" href="#why">
            Vision
          </a>
          <a className="oat-nav-link" href="#workflows">
            Capabilities
          </a>
          <a className="oat-nav-link" href="#get-started">
            Get Started
          </a>
          <a className="oat-nav-link" href={ARCHITECTURE_HREF}>
            Architecture
          </a>
        </nav>

        <div className="oat-nav-actions">
          <Button
            endContent={<ExternalLink size={13} />}
            href={REPOSITORY_URL}
            label="GitHub"
            size="sm"
            variant="secondary"
          />
        </div>
      </div>
    </header>
  );
}

function Footer() {
  return (
    <footer className="oat-footer">
      <div className="oat-container oat-footer-grid">
        <div>
          <img
            alt="OpenAirTwin"
            className="oat-brand-logo"
            decoding="async"
            loading="lazy"
            src={media("openairtwin_logo.png")}
          />
          <p className="oat-footer-tagline">
            Open-source 3D digital twins for next-generation wireless research.
          </p>
        </div>

        <div className="oat-footer-col">
          <h3>Explore</h3>
          <a href="#lab">3D Lab</a>
          <a href="#why">Vision</a>
          <a href="#workflows">Capabilities</a>
          <a href={ARCHITECTURE_HREF}>Architecture</a>
        </div>

        <div className="oat-footer-col">
          <h3>Open Source</h3>
          <a href={REPOSITORY_URL}>GitHub</a>
          <a href={RELEASE_URL}>Release v1.2.0</a>
          <a href={`${REPOSITORY_URL}/blob/master/LICENSE`}>License</a>
          <a href={`${REPOSITORY_URL}/issues`}>Issues</a>
        </div>
      </div>
    </footer>
  );
}
