"use client";

import { EntryApplicabilityLabel } from "@/components/market/entry-applicability-label";
import { isDatedPlanGuidance, evidenceLabel, controllingReasonLabel, selectedDecisionExplanation, riskValueLabel } from "@/lib/market/decision-presentation";
import Link from "next/link";
import { shortTradeDate } from "@/lib/formatters/trader-formatters";
import { getSignalActionLabel } from "@/lib/market/signal-action-labels";
import { useMemo, useState } from "react";

import { WorkspacePageHero } from "@/components/layout/workspace-page-hero";
import { MarketActivityLoader } from "@/components/ui/market-activity-loader";
import { SignalBadge } from "@/components/ui/signal-badge";
import { useMarketUniverse } from "@/features/market-dashboard/hooks/use-market-universe";
import { getSignalsLanguage } from "@/features/signals/signals-language";
import type { StockIntelligenceModel } from "@/lib/market/market-intelligence-types";
import type { AppLocale } from "@/lib/locale/app-locale";
import { DEFAULT_LOCALE } from "@/lib/locale/app-locale";
import {
  compareCanonicalShortlist,
  getRiskAdjustedDecisionScore,
  getVolumeConfirmationScore,
  resolveTraderDecision,
} from "@/lib/market/trader-decision";
import {
  buildLocalizedSignalReason,
  buildLocalizedSignalSupportingContext,
  buildSignalTechnicalContext,
  resolveTraderDecisionReason,
} from "@/lib/market/trader-decision-reason";
import { localizeEntryCondition } from "@/features/stock-workspace/stock-decision-language";
import { buildStockDetailPath } from "@/lib/seo/stock-page-seo";

type SignalCenterViewProps = {
  locale?: AppLocale;
};

export function SignalCenterView({ locale = DEFAULT_LOCALE }: SignalCenterViewProps) {
  const language = getSignalsLanguage(locale);
  const { universe, isLoading, isError, isWarmingUp, isUpdating, decisionDate } = useMarketUniverse({ stockLimit: 500 });
  const [filter, setFilter] = useState("ALL");
  const [riskFilter, setRiskFilter] = useState("ALL");
  const [sortMode, setSortMode] = useState("CONVICTION");
  const [symbolFilter, setSymbolFilter] = useState("");

  const signalRows = useMemo(
    () =>
      universe
        .filter((stock) => {
          const decision = resolveTraderDecision(stock);
          return filter === "ALL" || decision.recommendation === filter;
        })
        .filter((stock) => {
          const decision = resolveTraderDecision(stock);
          return riskFilter === "ALL" || decision.riskLabel === riskFilter;
        })
        .filter((stock) => {
          if (!symbolFilter) {
            return true;
          }

          const query = symbolFilter.trim().toLowerCase();
          return (
            stock.stock.symbol.toLowerCase().includes(query) ||
            stock.stock.name.toLowerCase().includes(query) ||
            stock.sector.toLowerCase().includes(query)
          );
        })
        .sort((a, b) => compareSignalRows(a, b, sortMode)),
    [filter, riskFilter, sortMode, symbolFilter, universe],
  );

  return (
    <section className="signal-center-view">
      <WorkspacePageHero
        eyebrow={language.hero.eyebrow}
        filterContextName={language.hero.filterContextName}
        locale={locale}
        localeSwitcherAria={language.localeSwitcherAria}
        onFilterTable={setSymbolFilter}
        subtitle={
          isLoading
            ? language.hero.loadingSubtitle
            : `${language.hero.readySubtitle(signalRows.length)} · ${shortTradeDate(decisionDate, locale)}`
        }
        title={language.hero.title}
      >
        <div className="explorer-controls">
          <select value={filter} onChange={(event) => setFilter(event.target.value)}>
            <option value="ALL">{language.filters.allActions}</option>
            {(["POTENTIAL_BUY", "WAIT", "HOLD", "SELL"] as const).map(action => <option key={action} value={action}>{getSignalActionLabel(action, locale)}</option>)}
          </select>
          <select value={riskFilter} onChange={(event) => setRiskFilter(event.target.value)}>
            <option value="ALL">{language.filters.allRisk}</option>
            <option value="LOW">{language.filters.lowRisk}</option>
            <option value="MEDIUM">{language.filters.mediumRisk}</option>
            <option value="HIGH">{language.filters.highRisk}</option>
            <option value="SPECULATIVE">{language.filters.speculative}</option>
          </select>
          <select value={sortMode} onChange={(event) => setSortMode(event.target.value)}>
            <option value="CONVICTION">{locale === "bn" ? "নতুন এন্ট্রির সেরা বাছাই" : "Entry shortlist"}</option>
            <option value="HOLDER_EXIT">{locale === "bn" ? "হোল্ডারের বিক্রির অগ্রাধিকার" : "Holder exit priority"}</option>
            <option value="NEWEST">{language.filters.newest}</option>
            <option value="RISK_ADJUSTED">{language.filters.riskAdjusted}</option>
            <option value="VOLUME_CONFIRMED">{language.filters.volumeConfirmed}</option>
          </select>
        </div>
      </WorkspacePageHero>
      <p className="snapshot-price-note">{locale === "bn" ? "দাম স্ন্যাপশট থেকে নেওয়া। সিদ্ধান্তের আগে ব্রোকারের লাইভ দাম মিলিয়ে নিন।" : "Prices are snapshots. Check your broker's live price before acting."}</p>
      {isUpdating ? <div className="data-warning">{locale === "bn" ? "সিদ্ধান্ত আপডেট হচ্ছে; আগের চূড়ান্ত তথ্য:" : "Updating decisions; previous finalized result:"} {decisionDate}</div> : null}
      {isWarmingUp ? <div className="data-warning">Market view is warming up.</div> : null}
      {isError ? <div className="data-warning">{language.states.loadError}</div> : null}
      {isLoading ? <MarketActivityLoader label={language.states.loading} /> : null}
      {!isLoading && !isWarmingUp ? (
        <div className="signal-center-list">
          {signalRows.length ? (
            signalRows.map((stock) => {
              const decision = resolveTraderDecision(stock);
              const selected = selectedDecisionExplanation(stock.traderDecision, locale);
              const policy = controllingReasonLabel(decision.reasonCode, "", locale);

              return (
                <article
                  className={`signal-center-item signal-center-item-${(decision.recommendation?.toLowerCase() ?? "unavailable")} priority-${stock.traderDecision?.opportunity_quality === "STRONG" ? "high" : "low"}`}
                  key={stock.stock.id}
                >
                  <div className="signal-center-topline">
                    <div>
                      <strong>{stock.stock.symbol}</strong>
                      <br />
                      <span>{stock.stock.name}</span>
                    </div>
                    <SignalBadge signal={decision.recommendation} locale={locale} />
                  </div>
                  <small>{locale === "bn" ? "নতুন ক্রেতার জন্য" : "For new buyers"} · {shortTradeDate(stock.decisionDate, locale)}</small>
                  <EntryApplicabilityLabel assessment={decision.entryApplicability} locale={locale} policyReason={policy} />
                  {policy && !isDatedPlanGuidance(decision.reasonCode) ? <p className="signal-controlling-reason">{policy}</p> : null}
                  {selected.limitation && selected.limitation !== policy ? <p className="signal-controlling-reason">{selected.limitation}</p> : null}
                  {selected.support ? <small className="signal-measured-support">{selected.support}</small> : null}
                  <div className="signal-evidence-row">
                    <span>{stock.traderDecision?.trading_risk ? locale === "bn" ? "এন্ট্রির ঝুঁকি" : "Entry risk" : locale === "bn" ? "প্রকাশিত ঝুঁকি" : "Published risk"}: {riskValueLabel(decision.riskLabel, locale)}</span>
                  </div>
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
      ) : null}
    </section>
  );
}

function compareSignalRows(a: StockIntelligenceModel, b: StockIntelligenceModel, sortMode: string) {
  if (sortMode === "HOLDER_EXIT") {
    return (a.shortlist?.holder_exit_rank ?? 9999) - (b.shortlist?.holder_exit_rank ?? 9999);
  }
  if (sortMode === "NEWEST") {
    return (b.decisionDate ?? "").localeCompare(a.decisionDate ?? "");
  }

  if (sortMode === "RISK_ADJUSTED") {
    return getRiskAdjustedDecisionScore(b) - getRiskAdjustedDecisionScore(a);
  }

  if (sortMode === "VOLUME_CONFIRMED") {
    return getVolumeConfirmationScore(b) - getVolumeConfirmationScore(a);
  }

  return compareCanonicalShortlist(a, b);
}
