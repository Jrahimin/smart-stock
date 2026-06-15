"use client";

import Link from "next/link";
import { TrendingDown, TrendingUp } from "lucide-react";

import type { MarketMoverModel, MarketMoversModel } from "@/features/market-pulse/types/market-pulse-types";

type MarketMoversSectionProps = {
  movers: MarketMoversModel;
};

function MoverRow({ mover }: { mover: MarketMoverModel }) {
  return (
    <Link className="pulse-mover-row" href={mover.href}>
      <div className="pulse-mover-leading">
        <strong>{mover.symbol}</strong>
        <span>{mover.name}</span>
      </div>
      <div className={`pulse-mover-quote pulse-mover-quote-${mover.priceTone}`}>
        <strong>{mover.priceChangePercent}</strong>
        <span>{mover.latestPrice}</span>
      </div>
    </Link>
  );
}

export function MarketMoversSection({ movers }: MarketMoversSectionProps) {
  const hasMovers = movers.gainers.length > 0 || movers.losers.length > 0;

  if (!hasMovers) {
    return null;
  }

  return (
    <section className="pulse-section pulse-movers-section" aria-labelledby="pulse-movers-heading">
      <div className="pulse-panel-card">
        <div className="pulse-section-head pulse-section-head-compact">
          <div>
            <p className="pulse-section-eyebrow">Market Movers</p>
            <h2 id="pulse-movers-heading">Today&apos;s price leaders</h2>
          </div>
        </div>

        <div className="pulse-movers-grid">
          {movers.gainers.length > 0 ? (
            <div className="pulse-movers-column">
              <p className="pulse-movers-column-label">
                <TrendingUp aria-hidden="true" size={14} />
                Gainers
              </p>
              <div className="pulse-movers-list">
                {movers.gainers.map((mover) => (
                  <MoverRow key={`gainer-${mover.symbol}`} mover={mover} />
                ))}
              </div>
            </div>
          ) : null}

          {movers.losers.length > 0 ? (
            <div className="pulse-movers-column">
              <p className="pulse-movers-column-label">
                <TrendingDown aria-hidden="true" size={14} />
                Losers
              </p>
              <div className="pulse-movers-list">
                {movers.losers.map((mover) => (
                  <MoverRow key={`loser-${mover.symbol}`} mover={mover} />
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
