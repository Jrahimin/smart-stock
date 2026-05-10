"use client";

import Link from "next/link";

import { useMarketUniverse } from "@/features/market-dashboard/hooks/use-market-universe";
import { formatCompactNumber, formatNumber, formatPercent } from "@/lib/formatters/financial-formatters";

export function ScannerWorkspaceView() {
  const { universe, isLoading, isError } = useMarketUniverse();
  const categories = [
    {
      title: "RSI Oversold",
      description: "Potential rebound candidates below RSI 35.",
      items: universe.filter((stock) => stock.rsi !== null && stock.rsi < 35).slice(0, 6),
    },
    {
      title: "Momentum Continuation",
      description: "Positive change with uptrend confirmation.",
      items: universe.filter((stock) => stock.trend === "UPTREND" && (stock.priceChangePercent ?? 0) > 0).slice(0, 6),
    },
    {
      title: "Unusual Volume",
      description: "Latest volume materially above 20-session average.",
      items: universe.filter((stock) => stock.averageVolume !== null && stock.volume > stock.averageVolume * 1.5).slice(0, 6),
    },
    {
      title: "Breakdown Risk",
      description: "Negative momentum with elevated risk context.",
      items: universe.filter((stock) => stock.signal.signal === "SELL" || stock.signal.risk === "HIGH").slice(0, 6),
    },
  ];

  return (
    <section className="scanner-workspace-view">
      <div className="explorer-header">
        <div>
          <p className="eyebrow">Market Scanner</p>
          <h1>Daily opportunity detection</h1>
          <span>Rule-based scans from latest available OHLCV rows</span>
        </div>
      </div>
      {isError ? <div className="data-warning">Could not load scanner data.</div> : null}
      {isLoading ? <div className="data-warning">Scanning market universe...</div> : null}
      <div className="scanner-category-grid">
        {categories.map((category) => (
          <section className="workspace-card" key={category.title}>
            <div className="section-heading">
              <p className="eyebrow">Scanner</p>
              <h2>{category.title}</h2>
              <span>{category.description}</span>
            </div>
            <div className="scanner-result-list">
              {category.items.length ? (
                category.items.map((stock) => (
                  <Link className="scanner-result-card" href={`/stocks/${stock.stock.exchange}/${stock.stock.symbol}`} key={stock.stock.id}>
                    <strong>{stock.stock.symbol}</strong>
                    <span>{formatNumber(stock.latestPrice)} / {formatPercent(stock.priceChangePercent)}</span>
                    <small>RSI {formatNumber(stock.rsi)} / Vol {formatCompactNumber(stock.volume)}</small>
                  </Link>
                ))
              ) : (
                <div className="empty-state">No candidates in this scan.</div>
              )}
            </div>
          </section>
        ))}
      </div>
    </section>
  );
}
