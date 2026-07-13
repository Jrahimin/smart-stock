"use client";

import Link from "next/link";
import { Check, Eye } from "lucide-react";

import type { FocusStockModel } from "@/features/market-pulse/types/market-pulse-types";
import type { MarketPulseLanguage } from "@/features/market-pulse/market-pulse-language";
import { MiniSparkline, PulseScoreHeaderCluster } from "@/features/market-pulse/components/pulse-score-badge";

type FocusStockCardProps = {
  stock: FocusStockModel;
  copy: MarketPulseLanguage["focus"];
  scoreCopy: MarketPulseLanguage["score"];
};

export function FocusStockCard({ stock, copy, scoreCopy }: FocusStockCardProps) {
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
        <PulseScoreHeaderCluster breakdown={stock.scoreBreakdown} copy={scoreCopy} score={stock.pulseScore} />
      </div>

      <span className={`pulse-focus-label-badge pulse-focus-label-badge-${stock.labelTone}`}>{stock.focusLabel}</span>

      <div className="pulse-focus-why-block">
        <span className="pulse-focus-why-label">{copy.whySelected}</span>
        <ul className="pulse-focus-reasons">
          {stock.whyHere.map((reason) => (
            <li key={reason}>
              <Check aria-hidden="true" size={12} />
              {reason}
            </li>
          ))}
        </ul>
      </div>

      <p className="pulse-focus-conviction">
        <span className="pulse-focus-conviction-label">{copy.conviction}</span>
        <strong>{stock.actionSummary}</strong>
      </p>

      <div className="pulse-focus-trigger-block">
        <span>{copy.nextTrigger}</span>
        <strong>{stock.trigger}</strong>
      </div>

      <div className="pulse-focus-card-footer">
        <div className="pulse-focus-quote-values">
          <span className="pulse-focus-price">{stock.latestPrice}</span>
          <span className={`pulse-focus-change pulse-focus-change-${stock.priceTone}`}>{stock.priceChangePercent}</span>
        </div>
        <MiniSparkline points={stock.sparklinePoints} tone={stock.priceTone} />
      </div>
    </Link>
  );
}

type StocksInFocusSectionProps = {
  stocks: FocusStockModel[];
  stockCount?: number;
  isLoading?: boolean;
  usingMonitorFallback?: boolean;
  copy: MarketPulseLanguage["focus"];
  scoreCopy: MarketPulseLanguage["score"];
};

export function StocksInFocusSection({
  stocks,
  stockCount = stocks.length,
  isLoading = false,
  usingMonitorFallback = false,
  copy,
  scoreCopy,
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
              {copy.eyebrow}
            </p>
            <h2 id="pulse-focus-heading">
              {usingMonitorFallback ? copy.titleMonitorFallback : copy.titleDefault}
            </h2>
          </div>
          <Link className="pulse-section-link" href="/scanner">
            {copy.viewAll}
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
              <FocusStockCard copy={copy} key={stock.stockId} scoreCopy={scoreCopy} stock={stock} />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
