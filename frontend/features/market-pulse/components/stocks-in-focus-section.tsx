"use client";

import Link from "next/link";
import { Eye } from "lucide-react";

import type { FocusStockModel } from "@/features/market-pulse/types/market-pulse-types";
import { MiniSparkline, PulseScoreBadge } from "@/features/market-pulse/components/pulse-score-badge";

type FocusStockCardProps = {
  stock: FocusStockModel;
};

export function FocusStockCard({ stock }: FocusStockCardProps) {
  return (
    <Link className="pulse-focus-card" href={stock.href}>
      <div className="pulse-focus-card-header">
        <div className="pulse-focus-card-head">
          <span className="pulse-focus-rank">{stock.rank}</span>
          <div className="pulse-focus-identity">
            <strong title={stock.symbol}>{stock.symbol}</strong>
            <span title={stock.name}>{stock.name}</span>
          </div>
        </div>
        <PulseScoreBadge breakdown={stock.scoreBreakdown} compact score={stock.pulseScore} />
      </div>

      <span className={`pulse-focus-label-badge pulse-focus-label-badge-${stock.labelTone}`}>{stock.focusLabel}</span>

      <div className="pulse-focus-quote">
        <div className="pulse-focus-quote-values">
          <span className="pulse-focus-price">{stock.latestPrice}</span>
          <span className={`pulse-focus-change pulse-focus-change-${stock.priceTone}`}>{stock.priceChangePercent}</span>
        </div>
        <MiniSparkline points={stock.sparklinePoints} tone={stock.priceTone} />
      </div>

      <ul className="pulse-focus-reasons">
        {stock.whyHere.map((reason) => (
          <li key={reason}>{reason}</li>
        ))}
      </ul>

      <div className="pulse-focus-card-actions">
        <div className="pulse-focus-trigger-block">
          <span>Trigger</span>
          <strong>{stock.trigger}</strong>
        </div>
        <div className="pulse-focus-action-block">
          <span>Action</span>
          <strong>{stock.actionSummary}</strong>
        </div>
      </div>
    </Link>
  );
}

type StocksInFocusSectionProps = {
  stocks: FocusStockModel[];
  stockCount?: number;
  isLoading?: boolean;
  usingMonitorFallback?: boolean;
};

export function StocksInFocusSection({
  stocks,
  stockCount = stocks.length,
  isLoading = false,
  usingMonitorFallback = false,
}: StocksInFocusSectionProps) {
  const skeletonCount = Math.max(stockCount, 3);
  const gridClass =
    stockCount > 0
      ? `pulse-focus-equal-grid pulse-focus-equal-grid-count-${Math.min(stockCount, 5)}`
      : "pulse-focus-equal-grid";

  return (
    <section className="pulse-section pulse-focus-section" aria-labelledby="pulse-focus-heading">
      <div className="pulse-focus-shell-card">
        <div className="pulse-section-head">
          <div>
            <p className="pulse-section-eyebrow">
              <Eye aria-hidden="true" size={16} />
              Stocks In Focus
            </p>
            <h2 id="pulse-focus-heading">
              {usingMonitorFallback ? "Stocks approaching attention threshold" : "Stocks worth your attention"}
            </h2>
          </div>
          <Link className="pulse-section-link" href="/scanner">
            View all
          </Link>
        </div>

        {isLoading ? (
          <div className={`${gridClass} pulse-focus-equal-grid-loading`}>
            {Array.from({ length: skeletonCount }).map((_, index) => (
              <div className="pulse-skeleton pulse-skeleton-card" key={index} />
            ))}
          </div>
        ) : (
          <div className={gridClass}>
            {stocks.map((stock) => (
              <FocusStockCard key={stock.stockId} stock={stock} />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
