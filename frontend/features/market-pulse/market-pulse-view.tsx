"use client";

import { MarketAlertsSection } from "@/features/market-pulse/components/market-alerts-section";
import { MarketBriefingFooter, MarketBriefingFooterSkeleton, MarketBriefingSection, MarketBriefingSectionSkeleton } from "@/features/market-pulse/components/market-briefing-section";
import { MarketPulseHero } from "@/features/market-pulse/components/market-pulse-hero";
import { SinceLastVisitStrip } from "@/features/market-pulse/components/since-last-visit-strip";
import { StocksInFocusSection } from "@/features/market-pulse/components/stocks-in-focus-section";
import type { MarketPulseHookResult } from "@/features/market-pulse/hooks/use-market-pulse";

type MarketPulseViewProps = MarketPulseHookResult;

export function MarketPulseView({
  model,
  showFullPageLoader,
  showUnavailable,
  showPersonalizationWarning,
  showBriefingPersonalizationWarning,
  isBriefingLoading,
  sectionLoading,
  isError,
}: MarketPulseViewProps) {
  if (showFullPageLoader) {
    return (
      <div className="market-pulse-page">
        <div className="pulse-skeleton pulse-skeleton-card pulse-page-hero" aria-busy="true" aria-label="Loading market pulse" />
        <MarketBriefingSectionSkeleton />
        <StocksInFocusSection isLoading stockCount={3} stocks={[]} usingMonitorFallback={false} />
      </div>
    );
  }

  if (showUnavailable || !model) {
    return (
      <div className="market-pulse-page">
        <div className="data-warning">Market Pulse is unavailable right now.</div>
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
      <MarketPulseHero briefingChips={model.briefingChips} hero={model.hero} />

      <SinceLastVisitStrip sinceLastVisit={model.sinceLastVisit} />

      {showPersonalizationWarning ? (
        <div className="data-warning pulse-inline-notice">
          Personalized updates are unavailable. Showing the latest shared Market Pulse view.
        </div>
      ) : null}

      {showBriefingPersonalizationWarning ? (
        <div className="data-warning pulse-inline-notice">
          Personalized briefing is unavailable. Showing the latest shared briefing content.
        </div>
      ) : null}

      {isError ? (
        <div className="data-warning pulse-inline-notice">
          Backend data is unavailable. Showing the latest resilient Market Pulse state.
        </div>
      ) : null}

      {showCriticalNotice && model.emptyMessage ? (
        <div className="data-warning pulse-inline-notice">{model.emptyMessage}</div>
      ) : null}

      {model.dataQualityNote ? (
        <div className="data-warning pulse-inline-notice">{model.dataQualityNote}</div>
      ) : null}

      {isBriefingLoading && !model.briefing ? (
        <MarketBriefingSectionSkeleton />
      ) : model.briefing ? (
        <MarketBriefingSection briefing={model.briefing} />
      ) : null}

      {showFocusSection ? (
        <StocksInFocusSection
          isLoading={sectionLoading.focus}
          stockCount={focusStocks.length}
          stocks={focusStocks}
          usingMonitorFallback={model.focusStocks.length === 0 && model.monitorCandidates.length > 0}
        />
      ) : null}

      {showEvidenceRow ? (
        <div className="pulse-evidence-row">
          {showAlerts ? <MarketAlertsSection alerts={model.alerts} /> : <div />}
          {isBriefingLoading && !model.briefing ? (
            <MarketBriefingFooterSkeleton />
          ) : model.briefing ? (
            <MarketBriefingFooter leadership={model.briefing.leadership} summary={model.briefing.summary} />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
