import { memo } from "react";

import type { TerminalCopy } from "@/features/market-dashboard/terminal-copy";
import type { MarketTimelineItemModel } from "@/features/market-dashboard/types/market-dashboard-types";

type MarketTimelineProps = { items: MarketTimelineItemModel[]; copy: TerminalCopy; loading: boolean };

export const MarketTimeline = memo(function MarketTimeline({ items, copy, loading }: MarketTimelineProps) {
  return <section className="sw-timeline" aria-labelledby="sw-timeline-title" aria-busy={loading}>
    <h2 className="sw-section-title" id="sw-timeline-title">{copy.timeline}</h2>
    {loading ? <p className="sw-state" role="status">{copy.loading}</p> : items.length ? (
      <ul className="sw-timeline-list">
        {items.map((item, index) => {
          const date = /^\d{4}-\d{2}-\d{2}$/.test(item.time);
          const mover = /^([\w.-]+) ([+-][\d.]+%)$/.exec(item.title);
          const tone = mover ? (Number.parseFloat(mover[2]) > 0 ? "positive" : Number.parseFloat(mover[2]) < 0 ? "negative" : "neutral") : "neutral";
          return <li key={item.time + "-" + item.title + "-" + index}>
            {date ? <time dateTime={item.time}>{item.time}</time> : <span className="sw-event-time">{item.time}</span>}
            <div className="sw-event-body">
              <strong>{mover ? <>{mover[1]} <span className={"sw-" + tone}>{mover[2]}</span></> : item.title}</strong>
              {item.description ? <p>{item.description}</p> : null}
            </div>
          </li>;
        })}
      </ul>
    ) : <p className="sw-state">{copy.timelineEmpty}</p>}
  </section>;
});
