"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import type { ExchangeCode } from "@/lib/api/backend-api-types";
import { WorkspaceCommandSearch } from "@/components/command/workspace-command-search";
import { MarketDataFreshnessBar } from "@/components/layout/market-data-freshness-bar";
import { StockCandlestickChart } from "@/components/charts/stock-candlestick-chart";
import { BreakoutAnalysisCard } from "@/features/stock-workspace/components/breakout-analysis-card";
import { CompanySnapshotStrip } from "@/features/stock-workspace/components/company-snapshot-strip";
import { DecisionScoresPanel } from "@/features/stock-workspace/components/decision-scores-panel";
import { EventTimelinePanel } from "@/features/stock-workspace/components/event-timeline-panel";
import { FundamentalsPanel } from "@/features/stock-workspace/components/fundamentals-panel";
import { OwnershipInsightsPanel } from "@/features/stock-workspace/components/ownership-valuation-panels";
import { PricePositionPanel } from "@/features/stock-workspace/components/price-position-panel";
import { SectorIntelligenceCard } from "@/features/stock-workspace/components/sector-intelligence-card";
import { RelatedStocksSection } from "@/features/stock-workspace/components/related-stocks-section";
import { SmartWarningsPanel } from "@/features/stock-workspace/components/smart-warnings-panel";
import { StockResearchSection } from "@/features/stock-workspace/components/stock-research-section";
import { StockSectionNav } from "@/features/stock-workspace/components/stock-section-nav";
import { StockWorkspaceHeader } from "@/features/stock-workspace/components/stock-workspace-header";
import { TechnicalSummaryPanel } from "@/features/stock-workspace/components/technical-summary-panel";
import { TradePlanPanel } from "@/features/stock-workspace/components/trade-plan-panel";
import { TraderDecisionCard } from "@/features/stock-workspace/components/trader-decision-card";
import { useRelatedStocks } from "@/features/stock-workspace/hooks/use-related-stocks";
import { useSectorContext } from "@/features/stock-workspace/hooks/use-sector-context";
import { useStockSectionNav } from "@/features/stock-workspace/hooks/use-stock-section-nav";
import { useStockWorkspace } from "@/features/stock-workspace/hooks/use-stock-workspace";
import { STOCK_SECTION_DEFINITIONS, type StockSectionId } from "@/features/stock-workspace/types/stock-section-types";
import { buildCompanySnapshotStrip } from "@/features/stock-workspace/view-models/company-snapshot-view-model";
import { buildSectorIntelligenceViewModel } from "@/features/stock-workspace/view-models/sector-context-view-model";
import { buildStockSemanticSummary } from "@/features/stock-workspace/view-models/stock-semantic-summary-view-model";
import { frontendConfig } from "@/lib/frontend-config";

type StockDetailWorkspaceViewProps = {
  exchange: ExchangeCode;
  symbol: string;
};

function resolveEnabledSections(decisionAvailable: boolean, hasOwnership: boolean, hasEvents: boolean): StockSectionId[] {
  const sections: StockSectionId[] = ["overview", "technicals", "fundamentals"];

  if (decisionAvailable && hasOwnership) {
    sections.push("ownership");
  }

  if (decisionAvailable && hasEvents) {
    sections.push("events");
  }

  sections.push("related");
  return sections;
}

export function StockDetailWorkspaceView({ exchange, symbol }: StockDetailWorkspaceViewProps) {
  const [relatedLoadEnabled, setRelatedLoadEnabled] = useState(false);
  const [sectorContextEnabled, setSectorContextEnabled] = useState(false);

  const sectorContextQuery = useSectorContext({
    exchange,
    symbol,
    enabled: sectorContextEnabled,
  });

  const { model, decisionModel, fundamentalsModel, decisionRaw, isError, isLoading, isDecisionLoading, isDecisionError } =
    useStockWorkspace(exchange, symbol, sectorContextQuery.sectorContext);
  const intelligence = model.intelligence;

  const enableSectorContext = useCallback(() => {
    setSectorContextEnabled(true);
  }, []);

  const hasOwnership = Boolean(decisionModel.available && decisionModel.ownership);
  const hasEvents = Boolean(decisionModel.available && decisionModel.events.length > 0);

  const enabledSectionIds = useMemo(
    () => resolveEnabledSections(decisionModel.available, hasOwnership, hasEvents),
    [decisionModel.available, hasEvents, hasOwnership],
  );

  const visibleSections = useMemo(
    () => STOCK_SECTION_DEFINITIONS.filter((section) => enabledSectionIds.includes(section.id)),
    [enabledSectionIds],
  );

  const { activeSection, scrollToSection } = useStockSectionNav({ enabledSectionIds });

  const requestRelatedLoad = useCallback(() => {
    setRelatedLoadEnabled(true);
    enableSectorContext();
  }, [enableSectorContext]);

  const handleNavigate = useCallback(
    (sectionId: StockSectionId) => {
      if (sectionId === "related" || sectionId === "fundamentals") {
        requestRelatedLoad();
        if (sectionId === "fundamentals") {
          enableSectorContext();
        }
      }
      scrollToSection(sectionId);
    },
    [enableSectorContext, requestRelatedLoad, scrollToSection],
  );

  const relatedStocks = useRelatedStocks({
    exchange,
    currentStock: intelligence,
    sectorLabel: model.header.sector,
    enabled: relatedLoadEnabled,
  });

  const sectorIntelligence = useMemo(
    () => buildSectorIntelligenceViewModel(sectorContextQuery.sectorContext),
    [sectorContextQuery.sectorContext],
  );

  useEffect(() => {
    const section = document.getElementById("fundamentals");
    if (!section) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          enableSectorContext();
        }
      },
      { rootMargin: "240px 0px" },
    );

    observer.observe(section);
    return () => observer.disconnect();
  }, [enableSectorContext]);

  const companySnapshotCells = useMemo(() => buildCompanySnapshotStrip(model, decisionModel), [decisionModel, model]);
  const semanticSummary = useMemo(() => buildStockSemanticSummary(model, decisionModel), [decisionModel, model]);

  return (
    <div className="stock-workspace-view stock-workspace-view-v2 trader-workspace-fade-in">
      {isError ? <div className="data-warning">Could not load stock workspace data for {symbol}.</div> : null}
      {isLoading ? <div className="data-warning">Loading stock intelligence...</div> : null}
      {isDecisionError ? <div className="data-warning">Decision support unavailable; chart remains active.</div> : null}

      <div className="trader-workspace-topbar">
        <StockWorkspaceHeader decision={decisionModel} model={model} stockId={model.intelligence?.stock.id} />
        <div className="trader-workspace-topbar-rail">
          <MarketDataFreshnessBar variant="inline" />
          <WorkspaceCommandSearch filterContextName="stocks" showQuickActions={false} variant="compact" />
        </div>
      </div>

      <StockSectionNav activeSection={activeSection} onNavigate={handleNavigate} sections={visibleSections} />
      <CompanySnapshotStrip cells={companySnapshotCells} />

      <p className="sr-only">{semanticSummary}</p>

      <div className="trader-workspace-layout">
        <main className="trader-workspace-main">
          <StockResearchSection id="overview">
            <section className="chart-hero-card chart-hero-card-compact">
              <StockCandlestickChart
                candles={intelligence?.candles ?? []}
                ema20={intelligence?.ema20}
                overlaysEnabled={frontendConfig.features.advancedChartOverlays}
                patterns={decisionRaw?.patterns ?? []}
                resistance={intelligence?.resistance}
                riskLabel={decisionModel.riskLabel}
                sma20={intelligence?.sma20}
                support={intelligence?.support}
                volumeBars={intelligence?.volumeBars ?? []}
              />
            </section>
          </StockResearchSection>

          <StockResearchSection divided id="technicals" showHeader title="Technicals">
            <BreakoutAnalysisCard decision={decisionModel} />
            <PricePositionPanel decision={decisionModel} />
            <TradePlanPanel decision={decisionModel} />
            <SmartWarningsPanel decision={decisionModel} />
            <TechnicalSummaryPanel model={model} />
          </StockResearchSection>

          <StockResearchSection divided id="fundamentals" showHeader title="Fundamentals">
            <FundamentalsPanel fundamentals={fundamentalsModel} />
          </StockResearchSection>

          <StockResearchSection divided hidden={!hasOwnership} id="ownership" showHeader title="Ownership">
            <OwnershipInsightsPanel decision={decisionModel} />
          </StockResearchSection>

          <StockResearchSection divided hidden={!hasEvents} id="events" showHeader title="Events">
            <EventTimelinePanel decision={decisionModel} />
          </StockResearchSection>

          <StockResearchSection divided id="related">
            {sectorContextEnabled && sectorIntelligence ? (
              <>
                <h2 className="stock-research-subsection-heading">Sector Intelligence</h2>
                <SectorIntelligenceCard sector={sectorIntelligence} />
              </>
            ) : null}
            {sectorContextEnabled && sectorContextQuery.isError ? (
              <div className="data-warning data-warning-compact">Sector context unavailable.</div>
            ) : null}
            <h2 className="stock-research-subsection-heading stock-research-subsection-heading-spaced">Related Stocks</h2>
            <RelatedStocksSection
              cta={relatedStocks.cta}
              groups={relatedStocks.groups}
              hasResults={relatedStocks.hasResults}
              isError={relatedStocks.isError}
              isLoading={relatedStocks.isLoading}
              loadEnabled={relatedLoadEnabled}
              onRequestLoad={requestRelatedLoad}
            />
          </StockResearchSection>
        </main>

        <aside className="trader-decision-rail">
          <TraderDecisionCard decision={decisionModel} />
          <DecisionScoresPanel decision={decisionModel} />
          {isDecisionLoading ? <div className="data-warning data-warning-compact">Updating decision…</div> : null}
        </aside>
      </div>
    </div>
  );
}
