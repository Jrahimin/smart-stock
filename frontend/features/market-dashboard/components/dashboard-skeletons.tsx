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
import type { DashboardLanguage } from "@/features/market-dashboard/dashboard-language";

type PulseSkeletonCopy = DashboardLanguage["skeletons"];

export function MarketPulseCoreSkeleton({
  copy,
  leadersLoading = true,
}: {
  copy: PulseSkeletonCopy;
  leadersLoading?: boolean;
}) {
  return (
    <section
      className="market-pulse-panel market-pulse-panel-loading"
      aria-busy="true"
      aria-label={copy.pulseLoadingAria}
    >
      <LoadingStatus className="market-dashboard-loading-status" label={copy.pulseLoading} />
      <div className="market-pulse-card">
        <div className="market-pulse-strip market-pulse-strip-skeleton" role="list">
          {Array.from({ length: 4 }).map((_, index) => (
            <div className="pulse-widget pulse-widget-skeleton-shell" key={index} role="listitem">
              <Shimmer className="ui-shimmer-pulse-widget-category" delayMs={index * 70} />
              <Shimmer className="ui-shimmer-pulse-widget-value" delayMs={index * 70 + 40} />
              <Shimmer className="ui-shimmer-pulse-widget-meter" delayMs={index * 70 + 80} />
              <Shimmer className="ui-shimmer-pulse-widget-footer" delayMs={index * 70 + 120} />
            </div>
          ))}
          {leadersLoading ? <MarketPulseLeadersSkeleton /> : null}
        </div>
      </div>
      <Shimmer className="ui-shimmer-ticker" delayMs={200} />
    </section>
  );
}

export function MarketPulseLeadersSkeleton() {
  return (
    <div className="pulse-widget pulse-widget-skeleton-shell" role="listitem">
      <Shimmer className="ui-shimmer-pulse-widget-category" delayMs={280} />
      <Shimmer className="ui-shimmer-pulse-widget-value" delayMs={320} />
      <Shimmer className="ui-shimmer-pulse-widget-meter" delayMs={360} />
      <Shimmer className="ui-shimmer-pulse-widget-footer" delayMs={400} />
    </div>
  );
}

/** @deprecated Use MarketPulseCoreSkeleton — full strip blocks on leaders. */
export function MarketPulseStripSkeleton({ copy }: { copy: PulseSkeletonCopy }) {
  return <MarketPulseCoreSkeleton copy={copy} />;
}

export function MarketBreadthPanelSkeleton({
  eyebrow,
  title,
}: {
  eyebrow: string;
  title: string;
}) {
  return (
    <WorkspaceCardSkeleton delayMs={0} eyebrow={eyebrow} title={title}>
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

export function SmartSignalFeedSkeleton({
  eyebrow,
  title,
}: {
  eyebrow: string;
  title: string;
}) {
  return (
    <WorkspaceCardSkeleton delayMs={120} eyebrow={eyebrow} title={title}>
      <ShimmerSignalRows count={3} delayMs={200} />
    </WorkspaceCardSkeleton>
  );
}

export function InstitutionalHeatmapSkeleton({
  eyebrow,
  title,
}: {
  eyebrow: string;
  title: string;
}) {
  return (
    <WorkspaceCardSkeleton className="heatmap-card" delayMs={160} eyebrow={eyebrow} title={title}>
      <ShimmerHeatmapGrid delayMs={240} />
    </WorkspaceCardSkeleton>
  );
}

export function InsightSidebarSkeleton({
  eyebrow,
  title,
}: {
  eyebrow: string;
  title: string;
}) {
  return (
    <aside className="insight-sidebar insight-sidebar-skeleton" aria-busy="true">
      <div className="section-heading">
        <p className="eyebrow">{eyebrow}</p>
        <h2>{title}</h2>
      </div>
      <ShimmerInsightBlocks count={3} delayMs={200} />
    </aside>
  );
}

export function MarketTimelineSkeleton({
  eyebrow,
  title,
}: {
  eyebrow: string;
  title: string;
}) {
  return (
    <WorkspaceCardSkeleton className="market-timeline-section" delayMs={280} eyebrow={eyebrow} title={title}>
      <ShimmerTimelineTiles count={4} delayMs={360} />
    </WorkspaceCardSkeleton>
  );
}
