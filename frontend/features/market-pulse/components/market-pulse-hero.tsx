"use client";

import { WorkspacePageHero } from "@/components/layout/workspace-page-hero";
import type { MarketPulseHeroModel, PulseBriefingChipModel } from "@/features/market-pulse/types/market-pulse-types";

type MarketPulseHeroProps = {
  hero: MarketPulseHeroModel;
  briefingChips: PulseBriefingChipModel[];
};

export function MarketPulseHero({ hero, briefingChips }: MarketPulseHeroProps) {
  const hasChips = briefingChips.length > 0 || Boolean(hero.sessionLabel);

  return (
    <WorkspacePageHero
      className="pulse-page-hero"
      eyebrow="Market Pulse"
      subtitle={
        <div className="pulse-hero-briefing">
          <p className="pulse-hero-subline">
            <span className="pulse-page-greeting">{hero.greeting}</span>
            <span className="pulse-hero-subline-text">{hero.attentionSubline}</span>
          </p>

          {hasChips ? (
            <div className="pulse-briefing-chips" role="list" aria-label="Today's briefing highlights">
              {hero.sessionLabel ? (
                <span className="pulse-chip pulse-chip-live" role="listitem">
                  Market {hero.sessionLabel}
                </span>
              ) : null}
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
    />
  );
}
