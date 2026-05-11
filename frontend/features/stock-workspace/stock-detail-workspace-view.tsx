"use client";

import type { ExchangeCode } from "@/lib/api/backend-api-types";
import { StockCandlestickChart } from "@/components/charts/stock-candlestick-chart";
import { FundamentalsPanel } from "@/features/stock-workspace/components/fundamentals-panel";
import { StockInsightSidebar } from "@/features/stock-workspace/components/stock-insight-sidebar";
import { StockWorkspaceHeader } from "@/features/stock-workspace/components/stock-workspace-header";
import { TechnicalSummaryPanel } from "@/features/stock-workspace/components/technical-summary-panel";
import { useStockWorkspace } from "@/features/stock-workspace/hooks/use-stock-workspace";
import { frontendConfig } from "@/lib/frontend-config";

type StockDetailWorkspaceViewProps = {
  exchange: ExchangeCode;
  symbol: string;
};

export function StockDetailWorkspaceView({ exchange, symbol }: StockDetailWorkspaceViewProps) {
  const { model, isError, isLoading } = useStockWorkspace(exchange, symbol);
  const intelligence = model.intelligence;

  return (
    <div className="stock-workspace-view">
      {isError ? <div className="data-warning">Could not load stock workspace data for {symbol}.</div> : null}
      {isLoading ? <div className="data-warning">Loading stock intelligence...</div> : null}
      <StockWorkspaceHeader model={model} />
      <div className="stock-workspace-grid">
        <div className="stock-chart-column">
          <section className="workspace-card chart-workspace-card">
            <div className="section-heading">
              <p className="eyebrow">OHLCV Workspace</p>
              <h2>Candlestick and volume context</h2>
              <span>Zoom and pan are provided by TradingView Lightweight Charts.</span>
            </div>
            <StockCandlestickChart
              candles={intelligence?.candles ?? []}
              ema20={intelligence?.ema20}
              overlaysEnabled={frontendConfig.features.advancedChartOverlays}
              resistance={intelligence?.resistance}
              sma20={intelligence?.sma20}
              support={intelligence?.support}
              volumeBars={intelligence?.volumeBars ?? []}
            />
          </section>
          <TechnicalSummaryPanel model={model} />
          <FundamentalsPanel model={model} />
        </div>
        <StockInsightSidebar model={model} />
      </div>
    </div>
  );
}
