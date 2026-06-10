"use client";

import { HeroMarketIntelligence } from "@/features/market-dashboard/components/hero-market-intelligence";
import { InsightSidebar } from "@/features/market-dashboard/components/insight-sidebar";
import { InstitutionalHeatmap } from "@/features/market-dashboard/components/institutional-heatmap";
import { MarketBreadthPanel } from "@/features/market-dashboard/components/market-breadth-panel";
import { MarketMoversPanel } from "@/features/market-dashboard/components/market-movers-panel";
import { MarketTimeline } from "@/features/market-dashboard/components/market-timeline";
import { MarketTopbar } from "@/features/market-dashboard/components/market-topbar";
import { SmartSignalFeed } from "@/features/market-dashboard/components/smart-signal-feed";
import { useMarketDashboard } from "@/features/market-dashboard/hooks/use-market-dashboard";
import { WorkspaceCommandSearch } from "@/components/command/workspace-command-search";
import { FloatingRefreshButton } from "@/components/ui/floating-refresh-button";

export function MarketDashboardView() {
  const { model, isError, isLoading, refetch } = useMarketDashboard();

  return (
    <div className="market-dashboard-view">
      <MarketTopbar model={model} />
      <div className="workspace-page-search">
        <WorkspaceCommandSearch filterContextName="market dashboard" />
      </div>
      {isError ? (
        <div className="data-warning">
          Backend data is unavailable. Showing resilient workspace placeholders based on current contracts.
        </div>
      ) : null}
      {isLoading ? <div className="data-warning">Loading latest market intelligence...</div> : null}
      <HeroMarketIntelligence model={model} />
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
