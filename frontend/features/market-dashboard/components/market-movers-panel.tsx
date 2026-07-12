import Link from "next/link";
import { memo } from "react";

import type { MarketMoverModel } from "@/features/market-dashboard/types/market-dashboard-types";

type MarketMoversPanelProps = {
  title: string;
  movers: MarketMoverModel[];
  eyebrow?: string;
  emptyText: string;
  turnoverSuffix: string;
};

export const MarketMoversPanel = memo(function MarketMoversPanel({
  title,
  movers,
  eyebrow = "Market Movers",
  emptyText,
  turnoverSuffix,
}: MarketMoversPanelProps) {
  return (
    <section className="workspace-card">
      <div className="section-heading">
        <p className="eyebrow">{eyebrow}</p>
        <h2>{title}</h2>
      </div>
      <div className="mover-list">
        {movers.length ? (
          movers.map((mover) => (
            <Link className="mover-row" href={mover.href} key={`${title}-${mover.symbol}`}>
              <div className="mover-row-leading">
                <div>
                  <strong>{mover.symbol}</strong>
                  <span>{mover.name}</span>
                </div>
              </div>
              <div className={`mover-change mover-change-${mover.tone}`}>
                <strong>{mover.changePercent}</strong>
                <span>{mover.latestPrice}</span>
              </div>
              <small>
                {mover.turnover} {turnoverSuffix}
              </small>
            </Link>
          ))
        ) : (
          <div className="empty-state">{emptyText}</div>
        )}
      </div>
    </section>
  );
});
