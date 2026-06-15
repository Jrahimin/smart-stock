"use client";

import type { SinceLastVisitModel } from "@/features/market-pulse/types/market-pulse-types";
import { History } from "lucide-react";

type SinceLastVisitStripProps = {
  sinceLastVisit: SinceLastVisitModel;
};

export function SinceLastVisitStrip({ sinceLastVisit }: SinceLastVisitStripProps) {
  if (!sinceLastVisit.visible) {
    return null;
  }

  const stats = [
    sinceLastVisit.newChangesCount > 0
      ? { label: "Changes", value: sinceLastVisit.newChangesCount }
      : null,
    sinceLastVisit.newFocusCount > 0
      ? { label: "New focus", value: sinceLastVisit.newFocusCount }
      : null,
    sinceLastVisit.newAlertsCount > 0
      ? { label: "Alerts", value: sinceLastVisit.newAlertsCount }
      : null,
  ].filter((stat): stat is { label: string; value: number } => stat !== null);

  return (
    <aside className="pulse-since-last-visit-strip" aria-label="Since your last visit">
      <div className="pulse-since-last-visit-strip-icon">
        <History aria-hidden="true" size={18} />
      </div>
      <div className="pulse-since-last-visit-strip-copy">
        <span className="pulse-since-last-visit-strip-label">Since your last visit</span>
        <strong>{sinceLastVisit.summaryLabel}</strong>
      </div>
      {stats.length > 0 ? (
        <div className="pulse-since-last-visit-stats">
          {stats.map((stat) => (
            <span className="pulse-since-last-visit-stat" key={stat.label}>
              <strong>{stat.value}</strong>
              {stat.label}
            </span>
          ))}
        </div>
      ) : null}
    </aside>
  );
}
