"use client";

import { WorkspacePageHero } from "@/components/layout/workspace-page-hero";
import type { MarketPulseHeroModel, PulseBriefingChipModel } from "@/features/market-pulse/types/market-pulse-types";

type MarketPulseHeroProps = {
  hero: MarketPulseHeroModel;
  briefingChips: PulseBriefingChipModel[];
};

export function MarketPulseHero({ hero, briefingChips }: MarketPulseHeroProps) {
  return (
    <WorkspacePageHero
      className="pulse-page-hero"
      eyebrow="Market Pulse"
      subtitle={
        <div className="pulse-hero-briefing">
          <p className="pulse-hero-subline pulse-hero-subline-brief">{hero.attentionSubline}</p>

          {briefingChips.length > 0 ? (
            <div className="pulse-briefing-chips" role="list" aria-label="Today's market context">
              {briefingChips.map((chip) => (
                <span
                  className={`pulse-briefing-chip pulse-briefing-chip-${chip.tone}`}
                  key={chip.id}
                  role="listitem"
                >
                  <span className="pulse-briefing-chip-label">{chip.label}</span>
                  <strong>{chip.value}</strong>
                </span>
              ))}
            </div>
          ) : null}
        </div>
      }
      title={hero.attentionHeadline}
    >
      {hero.relativeUpdatedLabel ? (
        <p className="pulse-hero-updated-top">Last updated: {hero.relativeUpdatedLabel.replace(/^Updated\s+/i, "")}</p>
      ) : null}
    </WorkspacePageHero>
  );
}
