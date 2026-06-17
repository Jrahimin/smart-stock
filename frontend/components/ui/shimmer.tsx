"use client";

import type { CSSProperties, ReactNode } from "react";

export type ShimmerProps = {
  className?: string;
  delayMs?: number;
};

export function Shimmer({ className = "", delayMs = 0 }: ShimmerProps) {
  return (
    <span
      aria-hidden="true"
      className={`ui-shimmer ${className}`.trim()}
      style={{ "--ui-shimmer-delay": `${delayMs}ms` } as CSSProperties}
    />
  );
}

type LoadingStatusProps = {
  label?: string;
  className?: string;
};

export function LoadingStatus({ label = "Loading", className = "" }: LoadingStatusProps) {
  return (
    <div aria-live="polite" className={`ui-loading-status ${className}`.trim()} role="status">
      <span className="ui-loading-dots" aria-hidden="true">
        <span />
        <span />
        <span />
      </span>
      {label}
    </div>
  );
}

type WorkspaceCardSkeletonProps = {
  children?: ReactNode;
  className?: string;
  delayMs?: number;
  eyebrow?: string;
  title?: string;
};

export function WorkspaceCardSkeleton({
  children,
  className = "",
  delayMs = 0,
  eyebrow,
  title,
}: WorkspaceCardSkeletonProps) {
  return (
    <section
      aria-busy="true"
      className={`workspace-card workspace-card-skeleton ${className}`.trim()}
      style={{ "--ui-shimmer-card-delay": `${delayMs}ms` } as CSSProperties}
    >
      <div className="section-heading">
        {eyebrow ? <p className="eyebrow">{eyebrow}</p> : <Shimmer className="ui-shimmer-eyebrow" delayMs={delayMs} />}
        {title ? <h2>{title}</h2> : <Shimmer className="ui-shimmer-title" delayMs={delayMs + 40} />}
      </div>
      {children}
    </section>
  );
}

type ShimmerRowsProps = {
  count?: number;
  delayMs?: number;
  size?: "sm" | "md" | "lg";
};

export function ShimmerRows({ count = 4, delayMs = 0, size = "md" }: ShimmerRowsProps) {
  return (
    <div className="ui-shimmer-rows">
      {Array.from({ length: count }).map((_, index) => (
        <Shimmer
          className={`ui-shimmer-row ui-shimmer-row-${size}`}
          delayMs={delayMs + 80 + index * 50}
          key={index}
        />
      ))}
    </div>
  );
}

export function ShimmerMoverRows({ count = 5, delayMs = 0 }: { count?: number; delayMs?: number }) {
  return (
    <div className="ui-shimmer-mover-list">
      {Array.from({ length: count }).map((_, index) => (
        <div className="ui-shimmer-mover-row" key={index}>
          <div className="ui-shimmer-mover-leading">
            <Shimmer className="ui-shimmer-mover-symbol" delayMs={delayMs + index * 45} />
            <Shimmer className="ui-shimmer-mover-name" delayMs={delayMs + 60 + index * 45} />
          </div>
          <Shimmer className="ui-shimmer-mover-change" delayMs={delayMs + 90 + index * 45} />
        </div>
      ))}
    </div>
  );
}

export function ShimmerSignalRows({ count = 3, delayMs = 0 }: { count?: number; delayMs?: number }) {
  return (
    <div className="ui-shimmer-signal-list">
      {Array.from({ length: count }).map((_, index) => (
        <div className="ui-shimmer-signal-card" key={index}>
          <div className="ui-shimmer-signal-top">
            <Shimmer className="ui-shimmer-mover-symbol" delayMs={delayMs + index * 55} />
            <Shimmer className="ui-shimmer-signal-badge" delayMs={delayMs + 80 + index * 55} />
          </div>
          <Shimmer className="ui-shimmer-row ui-shimmer-row-md" delayMs={delayMs + 110 + index * 55} />
          <Shimmer className="ui-shimmer-row ui-shimmer-row-sm" delayMs={delayMs + 140 + index * 55} />
        </div>
      ))}
    </div>
  );
}

export function ShimmerInsightBlocks({ count = 3, delayMs = 0 }: { count?: number; delayMs?: number }) {
  return (
    <div className="ui-shimmer-insight-list">
      {Array.from({ length: count }).map((_, index) => (
        <article className="ui-shimmer-insight-block" key={index}>
          <Shimmer className="ui-shimmer-eyebrow ui-shimmer-eyebrow-inline" delayMs={delayMs + index * 60} />
          <Shimmer className="ui-shimmer-title ui-shimmer-title-compact" delayMs={delayMs + 40 + index * 60} />
          <Shimmer className="ui-shimmer-row ui-shimmer-row-md" delayMs={delayMs + 80 + index * 60} />
          <Shimmer className="ui-shimmer-row ui-shimmer-row-sm" delayMs={delayMs + 110 + index * 60} />
        </article>
      ))}
    </div>
  );
}

export function ShimmerBreadthTrack({ delayMs = 0 }: { delayMs?: number }) {
  return (
    <div className="ui-shimmer-breadth">
      <Shimmer className="ui-shimmer-breadth-track" delayMs={delayMs} />
      <div className="ui-shimmer-breadth-stats">
        <Shimmer className="ui-shimmer-row ui-shimmer-row-sm" delayMs={delayMs + 60} />
        <Shimmer className="ui-shimmer-row ui-shimmer-row-sm" delayMs={delayMs + 90} />
        <Shimmer className="ui-shimmer-row ui-shimmer-row-sm" delayMs={delayMs + 120} />
      </div>
    </div>
  );
}

export function ShimmerHeatmapGrid({ delayMs = 0 }: { delayMs?: number }) {
  return (
    <div className="ui-shimmer-heatmap">
      <div className="ui-shimmer-heatmap-toolbar">
        <Shimmer className="ui-shimmer-heatmap-toggle" delayMs={delayMs} />
        <Shimmer className="ui-shimmer-heatmap-toggle" delayMs={delayMs + 40} />
        <Shimmer className="ui-shimmer-heatmap-meta" delayMs={delayMs + 80} />
      </div>
      <div className="ui-shimmer-heatmap-grid">
        {Array.from({ length: 6 }).map((_, index) => (
          <Shimmer className="ui-shimmer-heatmap-sector" delayMs={delayMs + 100 + index * 45} key={index} />
        ))}
      </div>
    </div>
  );
}

export function ShimmerTimelineTiles({ count = 4, delayMs = 0 }: { count?: number; delayMs?: number }) {
  return (
    <div className="ui-shimmer-timeline-track">
      {Array.from({ length: count }).map((_, index) => (
        <div className="ui-shimmer-timeline-tile" key={index}>
          <Shimmer className="ui-shimmer-eyebrow ui-shimmer-eyebrow-inline" delayMs={delayMs + index * 50} />
          <Shimmer className="ui-shimmer-title ui-shimmer-title-compact" delayMs={delayMs + 30 + index * 50} />
          <Shimmer className="ui-shimmer-row ui-shimmer-row-sm" delayMs={delayMs + 70 + index * 50} />
        </div>
      ))}
    </div>
  );
}
