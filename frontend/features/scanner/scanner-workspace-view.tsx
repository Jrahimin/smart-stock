"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { WorkspacePageHero } from "@/components/layout/workspace-page-hero";
import { MarketActivityLoader } from "@/components/ui/market-activity-loader";
import { SignalBadge } from "@/components/ui/signal-badge";
import { WatchlistStarToggle } from "@/features/watchlist/components/watchlist-star-toggle";
import { useUserWatchlist } from "@/features/watchlist/hooks/use-user-watchlist";
import type { WatchlistFilterMode } from "@/features/watchlist/types/watchlist-types";
import { useMarketUniverse } from "@/features/market-dashboard/hooks/use-market-universe";
import { formatCompactNumber, formatNumber, formatPercent } from "@/lib/formatters/financial-formatters";
import { frontendConfig } from "@/lib/frontend-config";
import { isBreakdownRiskDecision, resolveTraderDecision } from "@/lib/market/trader-decision";
import type { StockIntelligenceModel } from "@/lib/market/market-intelligence-types";
import { buildStockDetailPath } from "@/lib/seo/stock-page-seo";

// BDT average-daily-turnover floor for a name to be considered tradable in a
// scan (mirrors the backend LIQUIDITY_TURNOVER_THIN threshold).
const MIN_SCAN_TURNOVER = 2_000_000;
const MIN_SCAN_AVERAGE_VOLUME_FALLBACK = 50_000;

function passesLiquidityFloor(stock: StockIntelligenceModel): boolean {
  if (stock.averageTurnover != null) {
    return stock.averageTurnover >= MIN_SCAN_TURNOVER;
  }
  return (stock.averageVolume ?? 0) >= MIN_SCAN_AVERAGE_VOLUME_FALLBACK;
}

export function ScannerWorkspaceView() {
  const { universe, isLoading, isError } = useMarketUniverse({ stockLimit: 500 });
  const { watchedStockIds, holdingStockIds } = useUserWatchlist();
  const [symbolFilter, setSymbolFilter] = useState("");
  const [watchlistFilter, setWatchlistFilter] = useState<WatchlistFilterMode>("ALL");
  const filteredUniverse = useMemo(
    () =>
      universe.filter((stock) => {
        if (symbolFilter) {
          const query = symbolFilter.trim().toLowerCase();
          const matchesSymbol = stock.stock.symbol.toLowerCase().includes(query);
          const matchesName = stock.stock.name.toLowerCase().includes(query);
          const matchesSector = stock.sector.toLowerCase().includes(query);
          if (!matchesSymbol && !matchesName && !matchesSector) {
            return false;
          }
        }
        const stockId = stock.stock.id;
        if (watchlistFilter === "WATCHLISTED" && !watchedStockIds.has(stockId)) {
          return false;
        }
        if (watchlistFilter === "NOT_WATCHLISTED" && watchedStockIds.has(stockId)) {
          return false;
        }
        if (watchlistFilter === "HOLDINGS" && !holdingStockIds.has(stockId)) {
          return false;
        }
        return true;
      }),
    [holdingStockIds, symbolFilter, universe, watchlistFilter, watchedStockIds],
  );
  const categories = useMemo(() => {
    // Every scan applies a liquidity floor so illiquid names (untradeable, gap/
    // manipulation-prone on DSE) never surface as opportunities.
    const tradable = filteredUniverse.filter(passesLiquidityFloor);

    if (frontendConfig.features.advancedScanners) {
      return [
        {
          title: "Volume-confirmed Breakouts",
          description: "Closing above prior resistance on expanding volume (shared breakout flag).",
          items: tradable
            .filter((stock) => stock.isBreakout === true)
            .sort((a, b) => resolveTraderDecision(b).confidence - resolveTraderDecision(a).confidence)
            .slice(0, 6),
        },
        {
          title: "Support-rebound Candidates",
          description: "Near recent support, oversold, and already turning up (confirmed rebound).",
          items: tradable
            .filter(
              (stock) =>
                stock.support !== null &&
                stock.latestPrice !== null &&
                stock.latestPrice <= stock.support * 1.04 &&
                (stock.rsi ?? 50) < 45 &&
                (stock.priceChangePercent ?? 0) > 0,
            )
            .sort((a, b) => (a.latestPrice ?? Infinity) - (b.latestPrice ?? Infinity))
            .slice(0, 6),
        },
        {
          title: "Risk / Compression Watchlist",
          description: "High-risk or low-volatility names that need confirmation before action.",
          items: tradable
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
        title: "Oversold Rebound",
        description: "Below RSI 35 and already turning up on the session (not just falling).",
        items: tradable
          .filter((stock) => stock.rsi !== null && stock.rsi < 35 && (stock.priceChangePercent ?? 0) > 0)
          .slice(0, 6),
      },
      {
        title: "Momentum Continuation",
        description: "Uptrend confirmed by a positive multi-day return.",
        items: tradable
          .filter((stock) => stock.trend === "UPTREND" && (stock.returnFiveDayPercent ?? 0) > 0)
          .slice(0, 6),
      },
      {
        title: "Volume-confirmed Breakouts",
        description: "Clearing prior resistance on expanding volume (shared breakout flag).",
        items: tradable.filter((stock) => stock.isBreakout === true).slice(0, 6),
      },
      {
        title: "Breakdown Risk",
        description: "Sell actions or elevated risk from the shared decision engine.",
        items: tradable.filter((stock) => isBreakdownRiskDecision(stock)).slice(0, 6),
      },
    ];
  }, [filteredUniverse]);

  return (
    <section className="scanner-workspace-view">
      <WorkspacePageHero
        eyebrow="Market Scanner"
        filterContextName="scanner"
        onFilterTable={setSymbolFilter}
        subtitle="Rule-based scans from latest OHLCV with shared trader decision badges"
        title="Daily opportunity detection"
      >
        <div className="explorer-controls">
          <div className="explorer-controls-watchlist" role="group" aria-label="Watchlist filters">
            <select value={watchlistFilter} onChange={(event) => setWatchlistFilter(event.target.value as WatchlistFilterMode)}>
              <option value="ALL">All stocks</option>
              <option value="WATCHLISTED">Watchlisted only</option>
              <option value="NOT_WATCHLISTED">Not watchlisted</option>
              <option value="HOLDINGS">Holdings only</option>
            </select>
            <button
              className={`explorer-watchlist-quick ${watchlistFilter === "WATCHLISTED" ? "is-active" : ""}`}
              onClick={() => setWatchlistFilter("WATCHLISTED")}
              type="button"
            >
              My watchlist
            </button>
          </div>
        </div>
      </WorkspacePageHero>
      {isError ? <div className="data-warning">Could not load scanner data.</div> : null}
      {isLoading ? <MarketActivityLoader label="Scanning market universe..." /> : null}
      {!isLoading ? (
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
                      <Link className="scanner-result-card" href={buildStockDetailPath(stock.stock.exchange, stock.stock.symbol)} key={stock.stock.id}>
                        <div className="scanner-card-topline">
                          <strong>{stock.stock.symbol}</strong>
                          <div className="scanner-card-actions">
                            <WatchlistStarToggle stockId={stock.stock.id} stopPropagation />
                            <SignalBadge signal={decision.recommendation} />
                          </div>
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
      ) : null}
    </section>
  );
}
