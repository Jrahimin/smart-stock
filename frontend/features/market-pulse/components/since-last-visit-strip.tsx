"use client";

import type { SinceLastVisitModel } from "@/features/market-pulse/types/market-pulse-types";
import type { MarketPulseLanguage } from "@/features/market-pulse/market-pulse-language";
import { History } from "lucide-react";

type SinceLastVisitStripProps = {
  sinceLastVisit: SinceLastVisitModel;
  copy: MarketPulseLanguage["sinceLastVisit"];
};

export function SinceLastVisitStrip({ sinceLastVisit, copy }: SinceLastVisitStripProps) {
  if (!sinceLastVisit.visible) {
    return null;
  }

  const stats = [
    sinceLastVisit.newChangesCount > 0
      ? { label: copy.changes, value: sinceLastVisit.newChangesCount }
      : null,
    sinceLastVisit.newFocusCount > 0
      ? { label: copy.newFocus, value: sinceLastVisit.newFocusCount }
      : null,
    sinceLastVisit.newAlertsCount > 0
      ? { label: copy.alerts, value: sinceLastVisit.newAlertsCount }
      : null,
  ].filter((stat): stat is { label: string; value: number } => stat !== null);

  return (
    <aside className="pulse-since-last-visit-strip" aria-label={copy.ariaLabel}>
      <div className="pulse-since-last-visit-strip-icon">
        <History aria-hidden="true" size={18} />
      </div>
      <div className="pulse-since-last-visit-strip-copy">
        <span className="pulse-since-last-visit-strip-label">{copy.label}</span>
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
