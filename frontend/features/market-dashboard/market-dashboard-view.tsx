"use client";

import { InsightSidebar } from "@/features/market-dashboard/components/insight-sidebar";
import { InstitutionalHeatmap } from "@/features/market-dashboard/components/institutional-heatmap";
import { MarketBreadthPanel } from "@/features/market-dashboard/components/market-breadth-panel";
import { MarketMoversPanel } from "@/features/market-dashboard/components/market-movers-panel";
import { MarketDashboardHeader, MarketPulsePanel } from "@/features/market-dashboard/components/market-pulse-header";
import { MarketTimeline } from "@/features/market-dashboard/components/market-timeline";
import { SmartSignalFeed } from "@/features/market-dashboard/components/smart-signal-feed";
import { useMarketDashboard } from "@/features/market-dashboard/hooks/use-market-dashboard";
import { FloatingRefreshButton } from "@/components/ui/floating-refresh-button";

export function MarketDashboardView() {
  const { model, isError, isLoading, refetch } = useMarketDashboard();

  return (
    <div className="market-dashboard-view">
      <MarketDashboardHeader />
      <MarketPulsePanel model={model} />
      {isError ? (
        <div className="data-warning">
          Backend data is unavailable. Showing resilient workspace placeholders based on current contracts.
        </div>
      ) : null}
      {isLoading ? <div className="data-warning">Loading latest market intelligence...</div> : null}
      <div className="dashboard-workspace-grid">
        <div className="dashboard-primary-column">
          <MarketBreadthPanel breadth={model.breadth} />
          <InstitutionalHeatmap tiles={model.heatmapTiles} />
          <div className="movers-grid">
            <MarketMoversPanel movers={model.movers.gainers} title="Top gainers" />
            <MarketMoversPanel movers={model.movers.losers} title="Top losers" />
          </div>
        </div>
        <div className="dashboard-secondary-column">
          <SmartSignalFeed signals={model.signals} />
          <MarketTimeline items={model.timeline} />
        </div>
        <div className="dashboard-tertiary-column">
          <InsightSidebar insights={model.insights} />
          <MarketMoversPanel movers={model.movers.turnoverLeaders} title="Liquidity watch" eyebrow="Turnover Leaders" />
        </div>
      </div>
      <FloatingRefreshButton
        disabled={model.session.disablesFreshDataActions}
        disabledReason={model.session.description}
        onRefresh={refetch}
      />
    </div>
  );
}
