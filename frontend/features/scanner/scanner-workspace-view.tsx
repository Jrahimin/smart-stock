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
import {
  getScannerCategoryDescription,
  getScannerLanguage,
  type ScannerCategoryId,
} from "@/features/scanner/scanner-language";
import { buildScannerCategoryItems } from "@/features/scanner/scanner-results";
import { localizeEntryCondition } from "@/features/stock-workspace/stock-decision-language";
import { formatCompactNumber, formatNumber, formatPercent } from "@/lib/formatters/financial-formatters";
import { frontendConfig } from "@/lib/frontend-config";
import type { AppLocale } from "@/lib/locale/app-locale";
import { DEFAULT_LOCALE } from "@/lib/locale/app-locale";
import { resolveTraderDecision } from "@/lib/market/trader-decision";
import type { StockIntelligenceModel } from "@/lib/market/market-intelligence-types";
import { buildStockDetailPath } from "@/lib/seo/stock-page-seo";

type ScannerCategoryView = {
  id: ScannerCategoryId;
  items: StockIntelligenceModel[];
};

type ScannerWorkspaceViewProps = {
  locale?: AppLocale;
};

export function ScannerWorkspaceView({ locale = DEFAULT_LOCALE }: ScannerWorkspaceViewProps) {
  const language = getScannerLanguage(locale);
  const advancedScanners = frontendConfig.features.advancedScanners;
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
    if (advancedScanners) {
      return [
        {
          id: "volume_breakouts" as const,
          items: buildScannerCategoryItems(filteredUniverse, "volume_breakouts"),
        },
        {
          id: "support_rebound" as const,
          items: buildScannerCategoryItems(filteredUniverse, "support_rebound"),
        },
        {
          id: "risk_compression" as const,
          items: buildScannerCategoryItems(filteredUniverse, "risk_compression"),
        },
      ] satisfies ScannerCategoryView[];
    }

    return [
      {
        id: "momentum_continuation" as const,
        items: buildScannerCategoryItems(filteredUniverse, "momentum_continuation"),
      },
      {
        id: "volume_breakouts" as const,
        items: buildScannerCategoryItems(filteredUniverse, "volume_breakouts"),
      },
      {
        id: "breakdown_risk" as const,
        items: buildScannerCategoryItems(filteredUniverse, "breakdown_risk"),
      },
      {
        id: "oversold_rebound" as const,
        items: buildScannerCategoryItems(filteredUniverse, "oversold_rebound"),
      },
    ] satisfies ScannerCategoryView[];
  }, [advancedScanners, filteredUniverse]);

  return (
    <section className="scanner-workspace-view">
      <WorkspacePageHero
        eyebrow={language.hero.eyebrow}
        filterContextName={language.hero.filterContextName}
        locale={locale}
        localeSwitcherAria={language.localeSwitcherAria}
        onFilterTable={setSymbolFilter}
        subtitle={language.hero.subtitle}
        title={language.hero.title}
      >
        <div className="explorer-controls">
          <div className="explorer-controls-watchlist" role="group" aria-label={language.filters.watchlistAria}>
            <select value={watchlistFilter} onChange={(event) => setWatchlistFilter(event.target.value as WatchlistFilterMode)}>
              <option value="ALL">{language.filters.allStocks}</option>
              <option value="WATCHLISTED">{language.filters.watchlistedOnly}</option>
              <option value="NOT_WATCHLISTED">{language.filters.notWatchlisted}</option>
              <option value="HOLDINGS">{language.filters.holdingsOnly}</option>
            </select>
            <button
              className={`explorer-watchlist-quick ${watchlistFilter === "WATCHLISTED" ? "is-active" : ""}`}
              onClick={() => setWatchlistFilter("WATCHLISTED")}
              type="button"
            >
              {language.filters.myWatchlist}
            </button>
          </div>
        </div>
      </WorkspacePageHero>
      {isError ? <div className="data-warning">{language.states.loadError}</div> : null}
      {isLoading ? <MarketActivityLoader label={language.states.loading} /> : null}
      {!isLoading ? (
        <div className="scanner-category-grid">
          {categories.map((category) => {
            const copy = language.categories[category.id];

            return (
              <section className="workspace-card" key={category.id}>
                <div className="section-heading">
                  <p className="eyebrow">{language.states.sectionEyebrow}</p>
                  <h2>{copy.title}</h2>
                  <span>{getScannerCategoryDescription(copy, advancedScanners)}</span>
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
                              <SignalBadge locale={locale} signal={decision.recommendation} />
                            </div>
                          </div>
                          <span>
                            {formatNumber(stock.latestPrice)} / {formatPercent(stock.priceChangePercent)}
                          </span>
                          {decision.recommendation === "POTENTIAL_BUY" && decision.entryCondition ? (
                            <small className="scanner-entry-condition">
                              {localizeEntryCondition(decision.entryCondition, locale)}
                            </small>
                          ) : null}
                          <div className="mini-momentum-bar" aria-label={language.states.momentumAria}>
                            <span style={{ width: `${Math.min(100, Math.abs(stock.priceChangePercent ?? 0) * 12)}%` }} />
                          </div>
                          <small className="scanner-context-row">
                            <span>
                              {language.metrics.rsi} {formatNumber(stock.rsi)}
                            </span>
                            <span>
                              {language.metrics.vol} {formatCompactNumber(stock.volume)}
                            </span>
                            <span className={`trend-icon trend-icon-${stock.trend.toLowerCase()}`} aria-label={stock.trend} title={stock.trend} />
                          </small>
                        </Link>
                      );
                    })
                  ) : (
                    <div className="empty-state empty-state-premium">
                      <strong>{language.states.emptyTitle}</strong>
                      <span>{language.states.emptyDescription}</span>
                    </div>
                  )}
                </div>
              </section>
            );
          })}
        </div>
      ) : null}
    </section>
  );
}
