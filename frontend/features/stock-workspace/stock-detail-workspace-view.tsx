"use client";

import type { ExchangeCode } from "@/lib/api/backend-api-types";
import { WorkspaceCommandSearch } from "@/components/command/workspace-command-search";
import { MarketDataFreshnessBar } from "@/components/layout/market-data-freshness-bar";
import { StockCandlestickChart } from "@/components/charts/stock-candlestick-chart";
import { BreakoutAnalysisCard } from "@/features/stock-workspace/components/breakout-analysis-card";
import { DecisionScoresPanel } from "@/features/stock-workspace/components/decision-scores-panel";
import { DataFreshnessIndicator, EventTimelinePanel } from "@/features/stock-workspace/components/event-timeline-panel";
import { FundamentalsPanel } from "@/features/stock-workspace/components/fundamentals-panel";
import { OwnershipInsightsPanel } from "@/features/stock-workspace/components/ownership-valuation-panels";
import { PricePositionPanel } from "@/features/stock-workspace/components/price-position-panel";
import { SmartWarningsPanel } from "@/features/stock-workspace/components/smart-warnings-panel";
import { StockWorkspaceHeader } from "@/features/stock-workspace/components/stock-workspace-header";
import { TechnicalSummaryPanel } from "@/features/stock-workspace/components/technical-summary-panel";
import { TradePlanPanel } from "@/features/stock-workspace/components/trade-plan-panel";
import { TraderDecisionCard } from "@/features/stock-workspace/components/trader-decision-card";
import { useStockWorkspace } from "@/features/stock-workspace/hooks/use-stock-workspace";
import { frontendConfig } from "@/lib/frontend-config";

type StockDetailWorkspaceViewProps = {
  exchange: ExchangeCode;
  symbol: string;
};

export function StockDetailWorkspaceView({ exchange, symbol }: StockDetailWorkspaceViewProps) {
  const { model, decisionModel, decisionRaw, isError, isLoading, isDecisionLoading, isDecisionError } = useStockWorkspace(exchange, symbol);
  const intelligence = model.intelligence;

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
          <DataFreshnessIndicator decision={decisionModel} />
        </div>
      </div>

      <div className="trader-workspace-layout">
        <main className="trader-workspace-main">
          <section className="chart-hero-card">
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

          <BreakoutAnalysisCard decision={decisionModel} />
          <PricePositionPanel decision={decisionModel} />
          <SmartWarningsPanel decision={decisionModel} />
          <TradePlanPanel decision={decisionModel} />
          <OwnershipInsightsPanel decision={decisionModel} />
          <EventTimelinePanel decision={decisionModel} />
          <TechnicalSummaryPanel model={model} />
          <FundamentalsPanel model={model} />
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
