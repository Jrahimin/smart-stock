import { memo } from "react";

import type { TerminalCopy } from "@/features/market-dashboard/terminal-copy";
import type { MarketTimelineItemModel } from "@/features/market-dashboard/types/market-dashboard-types";

type MarketTimelineProps = { items: MarketTimelineItemModel[]; copy: TerminalCopy; loading: boolean; error?: boolean };

export const MarketTimeline = memo(function MarketTimeline({ items, copy, loading, error = false }: MarketTimelineProps) {
  return <section className="sw-timeline" aria-labelledby="sw-timeline-title" aria-busy={loading}>
    <div className="sw-wire-header"><h2 className="sw-section-title" id="sw-timeline-title">Market timeline</h2><span className="sw-wire-label"><i aria-hidden="true" />{copy.timeline === "Market timeline" ? "Session notes" : "কার্যদিবসের খবর"}</span></div>
    {error && items.length > 0 ? <p className="sw-state sw-warning" role="status">{copy.timelineCached}</p> : null}
    {loading ? <p className="sw-state" role="status">{copy.loading}</p> : error && !items.length ? <p className="sw-state sw-warning" role="status">{copy.timelineError}</p> : items.length ? (
      <ul className="sw-timeline-list">
        {items.map((item, index) => {
          const date = /^\d{4}-\d{2}-\d{2}$/.test(item.time);
          const mover = /^([\w.-]+) ([+-][\d.]+%)$/.exec(item.title);
          const tone = mover ? (Number.parseFloat(mover[2]) > 0 ? "positive" : Number.parseFloat(mover[2]) < 0 ? "negative" : "neutral") : "neutral";
          return <li className={item.kind === "snapshot" ? "sw-event-snapshot" : "sw-event-market"} key={item.time + "-" + item.title + "-" + index}>
            {date ? <time dateTime={item.time}>{item.time}</time> : <span className="sw-event-time">{item.time}</span>}
            <div className="sw-event-body">
              <small className="sw-event-kind">{item.kind === "snapshot" ? copy.snapshotUpdate : item.kind === "mover" ? copy.moverEvent : copy.marketAlert}</small>
              <strong>{mover ? <>{mover[1]} <span className={"sw-" + tone}>{mover[2]}</span></> : item.title}</strong>
              {item.description ? <p>{item.description}</p> : null}
              {item.sourceUrl && /^https?:\/\//i.test(item.sourceUrl) ? <a className="sw-section-link" href={item.sourceUrl} target="_blank" rel="noopener noreferrer">{copy.sourceLink} ↗</a> : null}
            </div>
          </li>;
        })}
      </ul>
    ) : <p className="sw-state">{copy.timelineEmpty}</p>}
  </section>;
});
