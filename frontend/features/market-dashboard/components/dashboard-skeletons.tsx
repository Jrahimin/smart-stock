"use client";

import {
  LoadingStatus,
  Shimmer,
  ShimmerBreadthTrack,
  ShimmerHeatmapGrid,
  ShimmerInsightBlocks,
  ShimmerMoverRows,
  ShimmerSignalRows,
  ShimmerTimelineTiles,
  WorkspaceCardSkeleton,
} from "@/components/ui/shimmer";

export function MarketPulseStripSkeleton() {
  return (
    <section className="market-pulse-panel market-pulse-panel-loading" aria-busy="true" aria-label="Loading market pulse">
      <LoadingStatus className="market-dashboard-loading-status" label="Loading market pulse" />
      <div className="market-pulse-card">
        <div className="market-pulse-strip market-pulse-strip-skeleton" role="list">
          {Array.from({ length: 5 }).map((_, index) => (
            <div className="pulse-widget pulse-widget-skeleton-shell" key={index} role="listitem">
              <Shimmer className="ui-shimmer-pulse-widget-category" delayMs={index * 70} />
              <Shimmer className="ui-shimmer-pulse-widget-value" delayMs={index * 70 + 40} />
              <Shimmer className="ui-shimmer-pulse-widget-meter" delayMs={index * 70 + 80} />
              <Shimmer className="ui-shimmer-pulse-widget-footer" delayMs={index * 70 + 120} />
            </div>
          ))}
        </div>
      </div>
      <Shimmer className="ui-shimmer-ticker" delayMs={200} />
    </section>
  );
}

export function MarketBreadthPanelSkeleton() {
  return (
    <WorkspaceCardSkeleton delayMs={0} eyebrow="Market Breadth" title="Advancing, declining, unchanged">
      <ShimmerBreadthTrack delayMs={80} />
    </WorkspaceCardSkeleton>
  );
}

export function MarketMoversPanelSkeleton({
  title,
  eyebrow = "Market Movers",
  delayMs = 0,
}: {
  title: string;
  eyebrow?: string;
  delayMs?: number;
}) {
  return (
    <WorkspaceCardSkeleton delayMs={delayMs} eyebrow={eyebrow} title={title}>
      <ShimmerMoverRows count={5} delayMs={delayMs + 80} />
    </WorkspaceCardSkeleton>
  );
}

export function SmartSignalFeedSkeleton() {
  return (
    <WorkspaceCardSkeleton delayMs={120} eyebrow="Smart Signals" title="Explanation-first feed">
      <ShimmerSignalRows count={3} delayMs={200} />
    </WorkspaceCardSkeleton>
  );
}

export function InstitutionalHeatmapSkeleton() {
  return (
    <WorkspaceCardSkeleton className="heatmap-card" delayMs={160} eyebrow="Institutional Heatmap" title="Sector-weighted market map">
      <ShimmerHeatmapGrid delayMs={240} />
    </WorkspaceCardSkeleton>
  );
}

export function InsightSidebarSkeleton() {
  return (
    <aside className="insight-sidebar insight-sidebar-skeleton" aria-busy="true">
      <div className="section-heading">
        <p className="eyebrow">Insights</p>
        <h2>Deterministic intelligence</h2>
      </div>
      <ShimmerInsightBlocks count={3} delayMs={200} />
    </aside>
  );
}

export function MarketTimelineSkeleton() {
  return (
    <WorkspaceCardSkeleton
      className="market-timeline-section"
      delayMs={280}
      eyebrow="Market Timeline"
      title="Events and operating context"
    >
      <ShimmerTimelineTiles count={4} delayMs={360} />
    </WorkspaceCardSkeleton>
  );
}
