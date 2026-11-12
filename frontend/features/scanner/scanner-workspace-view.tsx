"use client";

import { controllingReasonLabel, selectedDecisionExplanation } from "@/lib/market/decision-presentation";
import { EntryApplicabilityLabel } from "@/components/market/entry-applicability-label";
import Link from "next/link";
import { shortTradeDate } from "@/lib/formatters/trader-formatters";
import { useMemo, useState } from "react";

import { WorkspacePageHero } from "@/components/layout/workspace-page-hero";
import { MarketActivityLoader } from "@/components/ui/market-activity-loader";
import { SignalBadge } from "@/components/ui/signal-badge";
import { WatchlistStarToggle } from "@/features/watchlist/components/watchlist-star-toggle";
import { useUserWatchlist } from "@/features/watchlist/hooks/use-user-watchlist";
import type { WatchlistFilterMode } from "@/features/watchlist/types/watchlist-types";
import { useMarketUniverse } from "@/features/market-dashboard/hooks/use-market-universe";
import { DecisionPublicationLabel, QuotePublicationLabel } from "@/components/ui/market-publication-label";
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
  items: ReturnType<typeof buildScannerCategoryItems>;
};

type ScannerWorkspaceViewProps = {
  locale?: AppLocale;
};

export function ScannerWorkspaceView({ locale = DEFAULT_LOCALE }: ScannerWorkspaceViewProps) {
  const language = getScannerLanguage(locale);
  const advancedScanners = frontendConfig.features.advancedScanners;
  const { universe, isLoading, isError, isWarmingUp, decisionPublication } = useMarketUniverse({ stockLimit: 500 });
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
      <p className="snapshot-price-note">{locale === "bn" ? "দাম স্ন্যাপশট থেকে নেওয়া। সিদ্ধান্তের আগে ব্রোকারের লাইভ দাম মিলিয়ে নিন।" : "Prices are snapshots. Check your broker's live price before acting."}</p>
      {isWarmingUp ? <div className="data-warning">Market view is warming up.</div> : null}
      <DecisionPublicationLabel decision={decisionPublication} locale={locale} />
      {isError ? <div className="data-warning">{language.states.loadError}</div> : null}
      {isLoading ? <MarketActivityLoader label={language.states.loading} /> : null}
      {!isLoading && !isWarmingUp ? (
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
                      const selected = selectedDecisionExplanation(stock.traderDecision, locale);
                      const policy = controllingReasonLabel(decision.reasonCode, "", locale);

                      return (
                        <article className="scanner-result-card" key={stock.stock.id}>
                          <div className="scanner-card-topline">
                            <strong>{stock.stock.symbol}</strong>
                            <div className="scanner-card-actions">
                              <WatchlistStarToggle locale={locale} stockId={stock.stock.id} stopPropagation />
                              <SignalBadge locale={locale} signal={decision.recommendation} />
                            </div>
                          </div>
                          <span>
                            {formatNumber(stock.latestPrice)} / {formatPercent(stock.priceChangePercent)}
                          </span>
                          <QuotePublicationLabel locale={locale} quote={stock.displayQuote} />
                          <small>{locale === "bn" ? "নতুন ক্রেতার জন্য" : "For new buyers"} · {shortTradeDate(stock.decisionDate, locale)}</small>
                          <EntryApplicabilityLabel assessment={decision.entryApplicability} locale={locale} policyReason={policy} />
                          {(policy || selected.limitation) ? <p className="scanner-entry-condition">{policy || selected.limitation}</p> : null}
                          <small>{scannerMatchReason(stock.scannerMatch.reason_code, locale)}</small>
                          <Link href={buildStockDetailPath(stock.stock.exchange, stock.stock.symbol)}>{locale === "bn" ? "বিস্তারিত দেখুন" : "View details"} →</Link>
                        </article>
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


export function scannerMatchReason(code: string, locale: AppLocale): string {
  const reasons: Record<string, [string, string]> = {
    price_volume_break_event: ["Discovery: price crossed prior resistance with expanded relative volume.", "খোঁজের কারণ: স্বাভাবিকের তুলনায় লেনদেন বেড়ে দাম আগের প্রতিরোধসীমা পেরিয়েছে।"],
    support_reclaim_event: ["Discovery: support rebound; price reclaimed the support band.", "খোঁজের কারণ: দাম সমর্থনসীমায় ফিরে এসেছে।"],
    uptrend_positive_5d_return: ["Discovery: uptrend with a positive five-session return.", "খোঁজের কারণ: ঊর্ধ্বমুখী প্রবণতায় পাঁচ সেশনের পরিবর্তন ইতিবাচক।"],
    support_break_event: ["Discovery: price crossed below prior support.", "খোঁজের কারণ: দাম আগের সমর্থনসীমার নিচে নেমেছে।"],
    elevated_trading_risk: ["Discovery: elevated trading risk.", "খোঁজের কারণ: ট্রেডিং ঝুঁকি বেশি।"],
    low_volatility_compression: ["Discovery: measured low-volatility compression.", "খোঁজের কারণ: পরিমাপ করা কম অস্থিরতার সীমায় দাম আছে।"],
  };
  return reasons[code]?.[locale === "bn" ? 1 : 0] ?? (locale === "bn" ? "এই বাছাইয়ের প্রকাশিত শর্ত মিলে গেছে।" : "Matches this scan's published condition.");
}
