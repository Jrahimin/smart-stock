import { memo } from "react";

import type { MarketTimelineItemModel } from "@/features/market-dashboard/types/market-dashboard-types";

type MarketTimelineProps = {
  items: MarketTimelineItemModel[];
};

export const MarketTimeline = memo(function MarketTimeline({ items }: MarketTimelineProps) {
  return (
    <section className="workspace-card">
      <div className="section-heading">
        <p className="eyebrow">Market Timeline</p>
        <h2>Events and operating context</h2>
      </div>
      <div className="timeline-list">
        {items.map((item) => (
          <article className="timeline-item" key={`${item.time}-${item.title}`}>
            <time>{item.time}</time>
            <div>
              <strong>{item.title}</strong>
              <p>{item.description}</p>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
});
