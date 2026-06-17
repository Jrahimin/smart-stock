import { memo } from "react";

import type { MarketTimelineItemModel } from "@/features/market-dashboard/types/market-dashboard-types";

type MarketTimelineProps = {
  items: MarketTimelineItemModel[];
};

export const MarketTimeline = memo(function MarketTimeline({ items }: MarketTimelineProps) {
  return (
    <section className="workspace-card market-timeline-section">
      <div className="section-heading">
        <p className="eyebrow">Market Timeline</p>
        <h2>Events and operating context</h2>
      </div>
      <div className="market-timeline-track" role="list" aria-label="Market timeline events">
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
            <p>Timeline events will appear after the next market scan.</p>
          </div>
        )}
      </div>
    </section>
  );
});
