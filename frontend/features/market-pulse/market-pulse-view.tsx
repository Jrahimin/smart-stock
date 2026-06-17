"use client";

import { MarketAlertsSection } from "@/features/market-pulse/components/market-alerts-section";
import { MarketBriefingFooter, MarketBriefingSection } from "@/features/market-pulse/components/market-briefing-section";
import { MarketPulseHero } from "@/features/market-pulse/components/market-pulse-hero";
import { SinceLastVisitStrip } from "@/features/market-pulse/components/since-last-visit-strip";
import { StocksInFocusSection } from "@/features/market-pulse/components/stocks-in-focus-section";
import { useMarketPulse } from "@/features/market-pulse/hooks/use-market-pulse";
import { MarketActivityLoader } from "@/components/ui/market-activity-loader";

export function MarketPulseView() {
  const { model, isLoading, isError } = useMarketPulse();

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
  const showAlerts = model.alerts.length > 0;
  const showEvidenceRow = showAlerts || Boolean(model.briefing);
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

      {model.briefing ? <MarketBriefingSection briefing={model.briefing} /> : null}

      {showFocusSection ? (
        <StocksInFocusSection
          isLoading={isLoading}
          stockCount={focusStocks.length}
          stocks={focusStocks}
          usingMonitorFallback={model.focusStocks.length === 0 && model.monitorCandidates.length > 0}
        />
      ) : null}

      {showEvidenceRow ? (
        <div className="pulse-evidence-row">
          {showAlerts ? <MarketAlertsSection alerts={model.alerts} /> : <div />}
          {model.briefing ? (
            <MarketBriefingFooter leadership={model.briefing.leadership} summary={model.briefing.summary} />
          ) : null}
        </div>
      ) : null}

    </div>
  );
}
