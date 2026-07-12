import { memo } from "react";

import type { DashboardLanguage } from "@/features/market-dashboard/dashboard-language";
import type { MarketTimelineItemModel } from "@/features/market-dashboard/types/market-dashboard-types";

type MarketTimelineProps = {
  items: MarketTimelineItemModel[];
  copy: DashboardLanguage["timeline"];
};

export const MarketTimeline = memo(function MarketTimeline({ items, copy }: MarketTimelineProps) {
  return (
    <section className="workspace-card market-timeline-section">
      <div className="section-heading">
        <p className="eyebrow">{copy.eyebrow}</p>
        <h2>{copy.title}</h2>
      </div>
      <div aria-label="Market timeline events" className="market-timeline-track" role="list">
        {items.length ? (
          items.map((item) => (
            <article className="market-timeline-tile" key={`${item.time}-${item.title}`} role="listitem">
              <time>{item.time}</time>
              <strong>{item.title}</strong>
              <p>{item.description}</p>
            </article>
          ))
        ) : (
          <div className="market-timeline-tile market-timeline-tile-empty">
            <p>{copy.empty}</p>
          </div>
        )}
      </div>
    </section>
  );
});
