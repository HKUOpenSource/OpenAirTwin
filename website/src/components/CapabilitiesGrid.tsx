import {
  ArrowRight,
  Building2,
  Database,
  Layers,
  Radar,
  Radio,
  Route,
} from "lucide-react";
import { Badge } from "@astryxdesign/core/Badge";
import { Button } from "@astryxdesign/core/Button";

import { WORKFLOW_CARDS, type LabModeId } from "../data/siteData";

const CARD_ICONS: Record<string, typeof Building2> = {
  scenes: Building2,
  link: Radio,
  mobility: Route,
  radiomap: Layers,
  deepmimo: Database,
  radar: Radar,
};

export function CapabilitiesGrid({
  onSelectMode,
  onInspectScene,
}: {
  readonly onSelectMode: (modeId: LabModeId) => void;
  readonly onInspectScene: () => void;
}) {
  return (
    <div className="oat-capabilities-grid">
      {WORKFLOW_CARDS.map((card) => {
        const Icon = CARD_ICONS[card.id] ?? Building2;
        return (
          <article className="oat-cap-card" key={card.id}>
            <div className="oat-cap-top">
              <span className="oat-cap-icon" aria-hidden="true">
                <Icon size={16} strokeWidth={1.85} />
              </span>
              <span className="oat-cap-index oat-tabular">{card.index}</span>
            </div>

            <div>
              <h3 className="oat-cap-title">{card.label}</h3>
              <p className="oat-cap-desc">{card.description}</p>
            </div>

            <div className="oat-cap-footer">
              <Badge label={card.outcomeLabel} variant={card.badgeVariant} />
              <Button
                endContent={<ArrowRight size={14} />}
                label={card.actionLabel}
                onClick={() => {
                  if (card.id === "scenes") {
                    onInspectScene();
                  } else {
                    onSelectMode(card.targetMode);
                  }
                  document
                    .getElementById("lab")
                    ?.scrollIntoView({ behavior: "smooth" });
                }}
                size="sm"
                variant="ghost"
              />
            </div>
          </article>
        );
      })}
    </div>
  );
}
