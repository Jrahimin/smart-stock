"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { SearchableSymbolFilter } from "@/components/filters/searchable-symbol-filter";
import { FloatingRefreshButton } from "@/components/ui/floating-refresh-button";
import { MarketActivityLoader } from "@/components/ui/market-activity-loader";
import { SignalBadge } from "@/components/ui/signal-badge";
import { useMarketUniverse } from "@/features/market-dashboard/hooks/use-market-universe";
import { formatCompactNumber, formatNumber, formatPercent } from "@/lib/formatters/financial-formatters";
import { frontendConfig } from "@/lib/frontend-config";
import { isBreakdownRiskDecision, resolveTraderDecision } from "@/lib/market/trader-decision";

export function ScannerWorkspaceView() {
  const { universe, isLoading, isError, refetch } = useMarketUniverse({ stockLimit: 500, priceWindowLimit: 90 });
  const [symbolFilter, setSymbolFilter] = useState("");
  const filteredUniverse = useMemo(
    () => universe.filter((stock) => !symbolFilter || stock.stock.symbol.includes(symbolFilter)),
    [symbolFilter, universe],
  );
  const categories = useMemo(() => {
    if (frontendConfig.features.advancedScanners) {
      return [
        {
          title: "Volume-confirmed Breakouts",
          description: "Positive price action with materially expanded volume.",
          items: filteredUniverse
            .filter((stock) => (stock.priceChangePercent ?? 0) > 0 && stock.averageVolume !== null && stock.volume > stock.averageVolume * 1.8)
            .sort((a, b) => resolveTraderDecision(b).confidence - resolveTraderDecision(a).confidence)
            .slice(0, 6),
        },
        {
          title: "Support-rebound Candidates",
          description: "Names trading near recent support with oversold or improving momentum context.",
          items: filteredUniverse
            .filter((stock) => stock.support !== null && stock.latestPrice !== null && stock.latestPrice <= stock.support * 1.04 && (stock.rsi ?? 50) < 45)
            .sort((a, b) => (a.latestPrice ?? Infinity) - (b.latestPrice ?? Infinity))
            .slice(0, 6),
        },
        {
          title: "Risk / Compression Watchlist",
          description: "High-risk or low-volatility names that need confirmation before action.",
          items: filteredUniverse
            .filter((stock) => {
              const decision = resolveTraderDecision(stock);
              return decision.riskLabel === "HIGH" || decision.riskLabel === "SPECULATIVE" || (stock.volatility !== null && stock.volatility < 1.1);
            })
            .sort((a, b) => resolveTraderDecision(b).confidence - resolveTraderDecision(a).confidence)
            .slice(0, 6),
        },
      ];
    }

    return [
      {
        title: "RSI Oversold",
        description: "Potential rebound candidates below RSI 35.",
        items: filteredUniverse.filter((stock) => stock.rsi !== null && stock.rsi < 35).slice(0, 6),
      },
      {
        title: "Momentum Continuation",
        description: "Positive change with uptrend confirmation.",
        items: filteredUniverse.filter((stock) => stock.trend === "UPTREND" && (stock.priceChangePercent ?? 0) > 0).slice(0, 6),
      },
      {
        title: "Unusual Volume",
        description: "Latest volume materially above 20-session average.",
        items: filteredUniverse.filter((stock) => stock.averageVolume !== null && stock.volume > stock.averageVolume * 1.5).slice(0, 6),
      },
      {
        title: "Breakdown Risk",
        description: "Sell actions or elevated risk from the shared decision engine.",
        items: filteredUniverse.filter((stock) => isBreakdownRiskDecision(stock)).slice(0, 6),
      },
    ];
  }, [filteredUniverse]);

  return (
    <section className="scanner-workspace-view">
      <div className="explorer-header">
        <div>
          <p className="eyebrow">Market Scanner</p>
          <h1>Daily opportunity detection</h1>
          <span>Rule-based scans from latest OHLCV with shared trader decision badges</span>
        </div>
        <div className="explorer-controls">
          <SearchableSymbolFilter
            id="scanner-symbol-filter"
            options={universe.map((stock) => ({ id: stock.stock.id, symbol: stock.stock.symbol, name: stock.stock.name }))}
            value={symbolFilter}
            onChange={setSymbolFilter}
          />
        </div>
      </div>
      {isError ? <div className="data-warning">Could not load scanner data.</div> : null}
      {isLoading ? <MarketActivityLoader /> : null}
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
                category.items.map((stock) => {
                  const decision = resolveTraderDecision(stock);

                  return (
                    <Link className="scanner-result-card" href={`/stocks/${stock.stock.exchange}/${stock.stock.symbol}`} key={stock.stock.id}>
                      <div className="scanner-card-topline">
                        <strong>{stock.stock.symbol}</strong>
                        <SignalBadge signal={decision.recommendation} />
                      </div>
                      <span>
                        {formatNumber(stock.latestPrice)} / {formatPercent(stock.priceChangePercent)}
                      </span>
                      <div className="mini-momentum-bar" aria-label="Momentum strength">
                        <span style={{ width: `${Math.min(100, Math.abs(stock.priceChangePercent ?? 0) * 12)}%` }} />
                      </div>
                      <small className="scanner-context-row">
                        <span>RSI {formatNumber(stock.rsi)}</span>
                        <span>Vol {formatCompactNumber(stock.volume)}</span>
                        <span className={`trend-icon trend-icon-${stock.trend.toLowerCase()}`} aria-label={stock.trend} title={stock.trend} />
                      </small>
                    </Link>
                  );
                })
              ) : (
                <div className="empty-state empty-state-premium">
                  <strong>No names match this scan yet</strong>
                  <span>This means the current universe has no high-conviction candidates for this condition, not that market data is missing.</span>
                </div>
              )}
            </div>
          </section>
        ))}
      </div>
      <FloatingRefreshButton onRefresh={refetch} />
    </section>
  );
}
