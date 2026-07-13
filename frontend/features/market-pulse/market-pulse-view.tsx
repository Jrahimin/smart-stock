"use client";

import { useMemo } from "react";

import { MarketAlertsSection } from "@/features/market-pulse/components/market-alerts-section";
import {
  MarketBriefingFooter,
  MarketBriefingFooterSkeleton,
  MarketBriefingSection,
  MarketBriefingSectionSkeleton,
} from "@/features/market-pulse/components/market-briefing-section";
import { MarketPulseHero } from "@/features/market-pulse/components/market-pulse-hero";
import { SinceLastVisitStrip } from "@/features/market-pulse/components/since-last-visit-strip";
import { StocksInFocusSection } from "@/features/market-pulse/components/stocks-in-focus-section";
import type { MarketPulseHookResult } from "@/features/market-pulse/hooks/use-market-pulse";
import {
  getMarketPulseLanguage,
  localizePulseBriefingChips,
} from "@/features/market-pulse/market-pulse-language";
import type { AppLocale } from "@/lib/locale/app-locale";
import { DEFAULT_LOCALE } from "@/lib/locale/app-locale";

type MarketPulseViewProps = MarketPulseHookResult & {
  locale?: AppLocale;
};

export function MarketPulseView({
  model,
  showFullPageLoader,
  showUnavailable,
  showPersonalizationWarning,
  showBriefingPersonalizationWarning,
  isBriefingLoading,
  sectionLoading,
  isError,
  locale = DEFAULT_LOCALE,
}: MarketPulseViewProps) {
  const language = getMarketPulseLanguage(locale);
  const localizedChips = useMemo(
    () => (model ? localizePulseBriefingChips(model.briefingChips, locale) : []),
    [locale, model],
  );

  if (showFullPageLoader) {
    return (
      <div className="market-pulse-page">
        <div
          className="pulse-skeleton pulse-skeleton-card pulse-page-hero"
          aria-busy="true"
          aria-label={language.states.loadingPage}
        />
        <MarketBriefingSectionSkeleton copy={language} />
        <StocksInFocusSection
          copy={language.focus}
          isLoading
          scoreCopy={language.score}
          stockCount={3}
          stocks={[]}
          usingMonitorFallback={false}
        />
      </div>
    );
  }

  if (showUnavailable || !model) {
    return (
      <div className="market-pulse-page">
        <div className="data-warning">{language.states.unavailable}</div>
      </div>
    );
  }

  const focusStocks = model.focusStocks.length > 0 ? model.focusStocks : model.monitorCandidates;
  const showFocusSection = focusStocks.length > 0 || sectionLoading.focus;
  const showAlerts = model.alerts.length > 0;
  const showEvidenceRow = showAlerts || Boolean(model.briefing) || isBriefingLoading;
  const showCriticalNotice =
    model.emptyState === "waiting-snapshot" || model.emptyState === "insufficient-history";

  return (
    <div className="market-pulse-page">
      <MarketPulseHero
        briefingChips={localizedChips}
        copy={language}
        hero={model.hero}
        locale={locale}
      />

      <SinceLastVisitStrip copy={language.sinceLastVisit} sinceLastVisit={model.sinceLastVisit} />

      {showPersonalizationWarning ? (
        <div className="data-warning pulse-inline-notice">{language.states.personalizationWarning}</div>
      ) : null}

      {showBriefingPersonalizationWarning ? (
        <div className="data-warning pulse-inline-notice">{language.states.briefingPersonalizationWarning}</div>
      ) : null}

      {isError ? <div className="data-warning pulse-inline-notice">{language.states.backendError}</div> : null}

      {showCriticalNotice && model.emptyMessage ? (
        <div className="data-warning pulse-inline-notice">{model.emptyMessage}</div>
      ) : null}

      {model.dataQualityNote ? <div className="data-warning pulse-inline-notice">{model.dataQualityNote}</div> : null}

      {isBriefingLoading && !model.briefing ? (
        <MarketBriefingSectionSkeleton copy={language} />
      ) : model.briefing ? (
        <MarketBriefingSection briefing={model.briefing} copy={language} />
      ) : null}

      {showFocusSection ? (
        <StocksInFocusSection
          copy={language.focus}
          isLoading={sectionLoading.focus}
          scoreCopy={language.score}
          stockCount={focusStocks.length}
          stocks={focusStocks}
          usingMonitorFallback={model.focusStocks.length === 0 && model.monitorCandidates.length > 0}
        />
      ) : null}

      {showEvidenceRow ? (
        <div className="pulse-evidence-row">
          {showAlerts ? <MarketAlertsSection alerts={model.alerts} copy={language.alerts} /> : <div />}
          {isBriefingLoading && !model.briefing ? (
            <MarketBriefingFooterSkeleton copy={language} />
          ) : model.briefing ? (
            <MarketBriefingFooter
              copy={{ leadership: language.leadership, summary: language.summary }}
              leadership={model.briefing.leadership}
              summary={model.briefing.summary}
            />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
