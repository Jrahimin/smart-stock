"use client";

import dynamic from "next/dynamic";

import { MarketBreadthPanel } from "@/features/market-dashboard/components/market-breadth-panel";
import { MarketMoversPanel } from "@/features/market-dashboard/components/market-movers-panel";
import { MarketDashboardHeader, MarketPulsePanel } from "@/features/market-dashboard/components/market-pulse-header";
import { MarketTimeline } from "@/features/market-dashboard/components/market-timeline";
import { SmartSignalFeed } from "@/features/market-dashboard/components/smart-signal-feed";
import { useMarketDashboard } from "@/features/market-dashboard/hooks/use-market-dashboard";

const InstitutionalHeatmap = dynamic(
  () =>
    import("@/features/market-dashboard/components/institutional-heatmap").then((module) => ({
      default: module.InstitutionalHeatmap,
    })),
  { loading: () => <div className="data-warning">Loading heatmap...</div> },
);

const InsightSidebar = dynamic(
  () =>
    import("@/features/market-dashboard/components/insight-sidebar").then((module) => ({
      default: module.InsightSidebar,
    })),
  { loading: () => <div className="data-warning">Loading insights...</div> },
);

export function MarketDashboardView() {
  const { model, isError, isLoading, isDeferredLoading } = useMarketDashboard();

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
      {isDeferredLoading ? <div className="data-warning">Refreshing heatmap and sentiment panels...</div> : null}
      <div className="dashboard-workspace-grid">
        <div className="dashboard-primary-column">
          <MarketBreadthPanel breadth={model.breadth} />
          <InstitutionalHeatmap tiles={model.heatmapTiles} />
          <div className="movers-grid">
            <MarketMoversPanel movers={model.movers.gainers} title="Top gainers" />
            <MarketMoversPanel movers={model.movers.losers} title="Top losers" />
          </div>
          <MarketTimeline items={model.timeline} />
        </div>
        <div className="dashboard-secondary-column">
          <SmartSignalFeed signals={model.signals} />
        </div>
        <div className="dashboard-tertiary-column">
          <InsightSidebar insights={model.insights} />
          <MarketMoversPanel movers={model.movers.turnoverLeaders} title="Liquidity watch" eyebrow="Turnover Leaders" />
        </div>
      </div>
    </div>
  );
}
