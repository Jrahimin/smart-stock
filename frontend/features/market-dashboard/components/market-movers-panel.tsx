import Link from "next/link";

import type { MarketMoverModel } from "@/features/market-dashboard/types/market-dashboard-types";

type MarketMoversPanelProps = {
  title: string;
  movers: MarketMoverModel[];
  eyebrow?: string;
};

export function MarketMoversPanel({ title, movers, eyebrow = "Market Movers" }: MarketMoversPanelProps) {
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
              <small>{mover.turnover} turnover</small>
            </Link>
          ))
        ) : (
          <div className="empty-state">No price-backed movers are available yet.</div>
        )}
      </div>
    </section>
  );
}
