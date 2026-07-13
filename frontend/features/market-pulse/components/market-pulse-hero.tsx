"use client";

import { WorkspacePageHero } from "@/components/layout/workspace-page-hero";
import type { MarketPulseHeroModel, PulseBriefingChipModel } from "@/features/market-pulse/types/market-pulse-types";
import type { MarketPulseLanguage } from "@/features/market-pulse/market-pulse-language";
import type { AppLocale } from "@/lib/locale/app-locale";

type MarketPulseHeroProps = {
  hero: MarketPulseHeroModel;
  briefingChips: PulseBriefingChipModel[];
  copy: MarketPulseLanguage;
  locale: AppLocale;
};

export function MarketPulseHero({ hero, briefingChips, copy, locale }: MarketPulseHeroProps) {
  return (
    <WorkspacePageHero
      className="pulse-page-hero"
      eyebrow={copy.hero.eyebrow}
      locale={locale}
      localeSwitcherAria={copy.localeSwitcherAria}
      subtitle={
        <div className="pulse-hero-briefing">
          <p className="pulse-hero-subline pulse-hero-subline-brief">{copy.hero.subline}</p>

          {briefingChips.length > 0 ? (
            <div className="pulse-briefing-chips" role="list" aria-label={copy.hero.contextAriaLabel}>
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
