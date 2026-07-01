"use client";

import dynamic from "next/dynamic";

import { MarketBreadthPanel } from "@/features/market-dashboard/components/market-breadth-panel";
import {
  InsightSidebarSkeleton,
  InstitutionalHeatmapSkeleton,
  MarketBreadthPanelSkeleton,
  MarketMoversPanelSkeleton,
  MarketPulseCoreSkeleton,
  MarketPulseLeadersSkeleton,
  MarketTimelineSkeleton,
  SmartSignalFeedSkeleton,
} from "@/features/market-dashboard/components/dashboard-skeletons";
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
  { loading: () => <InstitutionalHeatmapSkeleton /> },
);

const InsightSidebar = dynamic(
  () =>
    import("@/features/market-dashboard/components/insight-sidebar").then((module) => ({
      default: module.InsightSidebar,
    })),
  { loading: () => <InsightSidebarSkeleton /> },
);

export function MarketDashboardView() {
  const { model, isError, sectionLoading, signalsSectionError } = useMarketDashboard();

  return (
    <div className="market-dashboard-view">
      <MarketDashboardHeader />
      {sectionLoading.pulseCore ? (
        <MarketPulseCoreSkeleton leadersLoading={sectionLoading.leaders} />
      ) : (
        <MarketPulsePanel leadersLoading={sectionLoading.leaders} model={model} />
      )}
      {isError ? (
        <div className="data-warning">
          Backend data is unavailable. Showing resilient workspace placeholders based on current contracts.
        </div>
      ) : null}
      <div className="dashboard-workspace-grid">
        <div className="dashboard-primary-column">
          {sectionLoading.breadth ? <MarketBreadthPanelSkeleton /> : <MarketBreadthPanel breadth={model.breadth} />}
          {sectionLoading.heatmap ? (
            <InstitutionalHeatmapSkeleton />
          ) : (
            <InstitutionalHeatmap tiles={model.heatmapTiles} />
          )}
          <div className="movers-grid">
            {sectionLoading.movers ? (
              <>
                <MarketMoversPanelSkeleton title="Top gainers" />
                <MarketMoversPanelSkeleton delayMs={80} title="Top losers" />
              </>
            ) : (
              <>
                <MarketMoversPanel movers={model.movers.gainers} title="Top gainers" />
                <MarketMoversPanel movers={model.movers.losers} title="Top losers" />
              </>
            )}
          </div>
          {sectionLoading.timeline ? <MarketTimelineSkeleton /> : <MarketTimeline items={model.timeline} />}
        </div>
        <div className="dashboard-secondary-column">
          {sectionLoading.signals ? (
            <SmartSignalFeedSkeleton />
          ) : signalsSectionError ? (
            <section className="workspace-card">
              <div className="section-heading">
                <p className="eyebrow">Smart Signals</p>
                <h2>Explanation-first feed</h2>
              </div>
              <div className="empty-state">Trader signals are warming up after startup. This section should populate shortly.</div>
            </section>
          ) : (
            <SmartSignalFeed signals={model.signals} />
          )}
        </div>
        <div className="dashboard-tertiary-column">
          {sectionLoading.insights ? <InsightSidebarSkeleton /> : <InsightSidebar insights={model.insights} />}
          {sectionLoading.movers ? (
            <MarketMoversPanelSkeleton delayMs={120} eyebrow="Turnover Leaders" title="Liquidity watch" />
          ) : (
            <MarketMoversPanel movers={model.movers.turnoverLeaders} title="Liquidity watch" eyebrow="Turnover Leaders" />
          )}
        </div>
      </div>
    </div>
  );
}
