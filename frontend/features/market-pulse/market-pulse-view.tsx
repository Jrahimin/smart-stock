"use client";

import { MarketAlertsSection } from "@/features/market-pulse/components/market-alerts-section";
import { MarketMoversSection } from "@/features/market-pulse/components/market-movers-section";
import { MarketPulseHero } from "@/features/market-pulse/components/market-pulse-hero";
import { SinceLastVisitStrip } from "@/features/market-pulse/components/since-last-visit-strip";
import { StocksInFocusSection } from "@/features/market-pulse/components/stocks-in-focus-section";
import { TodaysInsightCard } from "@/features/market-pulse/components/todays-insight-card";
import { WhatsChangedTimeline } from "@/features/market-pulse/components/whats-changed-timeline";
import { useMarketPulse } from "@/features/market-pulse/hooks/use-market-pulse";
import { FloatingRefreshButton } from "@/components/ui/floating-refresh-button";
import { MarketActivityLoader } from "@/components/ui/market-activity-loader";

function getLowerLayoutClass(hasPrimary: boolean, hasMovers: boolean) {
  if (hasPrimary && hasMovers) {
    return "pulse-lower-layout pulse-lower-layout-split";
  }
  if (hasMovers) {
    return "pulse-lower-layout pulse-lower-layout-movers-only";
  }
  return "pulse-lower-layout pulse-lower-layout-primary-only";
}

export function MarketPulseView() {
  const { model, isLoading, isError, refetch } = useMarketPulse();

  if (isLoading && !model) {
    return (
      <div className="market-pulse-page">
        <MarketActivityLoader label="Preparing your market briefing..." />
      </div>
    );
  }

  if (!model) {
    return (
      <div className="market-pulse-page">
        <div className="data-warning">Market Pulse is unavailable right now.</div>
      </div>
    );
  }

  const focusStocks = model.focusStocks.length > 0 ? model.focusStocks : model.monitorCandidates;
  const showFocusSection = focusStocks.length > 0 || isLoading;
  const showInsight = Boolean(model.todayInsight);
  const showChanges = model.changes.length > 0;
  const showAlerts = model.alerts.length > 0;
  const showMovers = model.marketMovers.gainers.length > 0 || model.marketMovers.losers.length > 0;
  const showPrimaryLower = showChanges || showAlerts;
  const showLowerSection = showPrimaryLower || showMovers;
  const showCriticalNotice =
    model.emptyState === "waiting-snapshot" || model.emptyState === "insufficient-history";

  return (
    <div className="market-pulse-page">
      <MarketPulseHero briefingChips={model.briefingChips} hero={model.hero} />

      <SinceLastVisitStrip sinceLastVisit={model.sinceLastVisit} />

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

      {showInsight ? <TodaysInsightCard insight={model.todayInsight!} /> : null}

      {showFocusSection ? (
        <StocksInFocusSection
          isLoading={isLoading}
          stockCount={focusStocks.length}
          stocks={focusStocks}
          usingMonitorFallback={model.focusStocks.length === 0 && model.monitorCandidates.length > 0}
        />
      ) : null}

      {showLowerSection ? (
        <div className={getLowerLayoutClass(showPrimaryLower, showMovers)}>
          {showPrimaryLower ? (
            <div className="pulse-lower-primary">
              {showChanges ? <WhatsChangedTimeline changes={model.changes} /> : null}
              {showAlerts ? <MarketAlertsSection alerts={model.alerts} /> : null}
            </div>
          ) : null}
          {showMovers ? <MarketMoversSection movers={model.marketMovers} /> : null}
        </div>
      ) : null}

      <FloatingRefreshButton
        disabled={model.sessionDisablesRefresh}
        disabledReason={model.sessionDescription}
        onRefresh={refetch}
      />
    </div>
  );
}
