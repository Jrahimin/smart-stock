"use client";

import Link from "next/link";
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
  getDecisionPriority,
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
import { buildStockDetailPath } from "@/lib/seo/stock-page-seo";

type SignalCenterViewProps = {
  locale?: AppLocale;
};

export function SignalCenterView({ locale = DEFAULT_LOCALE }: SignalCenterViewProps) {
  const language = getSignalsLanguage(locale);
  const { universe, isLoading, isError } = useMarketUniverse({ stockLimit: 500 });
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
            : language.hero.readySubtitle(signalRows.length)
        }
        title={language.hero.title}
      >
        <div className="explorer-controls">
          <select value={filter} onChange={(event) => setFilter(event.target.value)}>
            <option value="ALL">{language.filters.allActions}</option>
            <option value="POTENTIAL_BUY">POTENTIAL BUY</option>
            <option value="WAIT">WAIT</option>
            <option value="HOLD">HOLD</option>
            <option value="SELL">SELL</option>
          </select>
          <select value={riskFilter} onChange={(event) => setRiskFilter(event.target.value)}>
            <option value="ALL">{language.filters.allRisk}</option>
            <option value="LOW">{language.filters.lowRisk}</option>
            <option value="MEDIUM">{language.filters.mediumRisk}</option>
            <option value="HIGH">{language.filters.highRisk}</option>
            <option value="SPECULATIVE">{language.filters.speculative}</option>
          </select>
          <select value={sortMode} onChange={(event) => setSortMode(event.target.value)}>
            <option value="CONVICTION">{language.filters.highestConviction}</option>
            <option value="NEWEST">{language.filters.newest}</option>
            <option value="RISK_ADJUSTED">{language.filters.riskAdjusted}</option>
            <option value="VOLUME_CONFIRMED">{language.filters.volumeConfirmed}</option>
          </select>
        </div>
      </WorkspacePageHero>
      {isError ? <div className="data-warning">{language.states.loadError}</div> : null}
      {isLoading ? <MarketActivityLoader label={language.states.loading} /> : null}
      {!isLoading ? (
        <div className="signal-center-list">
          {signalRows.length ? (
            signalRows.map((stock) => {
              const decision = resolveTraderDecision(stock);
              const technicalContext = buildSignalTechnicalContext(stock);
              const supportingContext = buildLocalizedSignalSupportingContext(technicalContext, language.signalReasons);
              const localizedReason = buildLocalizedSignalReason(
                technicalContext,
                resolveTraderDecisionReason(decision.reason),
                language.signalReasons,
              );

              return (
                <Link
                  className={`signal-center-item signal-center-item-${decision.recommendation.toLowerCase()} priority-${getDecisionPriority(decision.confidence)}`}
                  href={buildStockDetailPath(stock.stock.exchange, stock.stock.symbol)}
                  key={stock.stock.id}
                >
                  <div className="signal-center-topline">
                    <div>
                      <strong>{stock.stock.symbol}</strong>
                      <br />
                      <span>{stock.stock.name}</span>
                    </div>
                    <SignalBadge signal={decision.recommendation} />
                  </div>
                  <p>
                    {decision.recommendation === "POTENTIAL_BUY" && decision.entryCondition
                      ? decision.entryCondition
                      : localizedReason}
                  </p>
                  <div className="signal-visual-row">
                    <div className="signal-confidence-meter" aria-label={language.row.confidenceAria(decision.confidence)}>
                      <span style={{ width: `${decision.confidence}%` }} />
                    </div>
                    <span className={`risk-pill risk-pill-${decision.riskLabel.toLowerCase()}`}>
                      {language.row.risk(decision.riskLabel)}
                    </span>
                    <span className={`momentum-marker momentum-marker-${decision.recommendation.toLowerCase()}`}>
                      {language.row.momentum(decision.recommendation)}
                    </span>
                  </div>
                  <div className="signal-evidence-row">
                    <span>{language.row.confidence(decision.confidence)}</span>
                    <span>{language.row.riskShort(decision.riskLabel)}</span>
                    <span>{language.states.decisionEngine}</span>
                    <span>{stock.latestTradeDate ?? language.states.awaitingPriceData}</span>
                  </div>
                  <small>{supportingContext.join(" / ") || language.states.awaitingContext}</small>
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
      ) : null}
    </section>
  );
}

function compareSignalRows(a: StockIntelligenceModel, b: StockIntelligenceModel, sortMode: string) {
  if (sortMode === "NEWEST") {
    return (b.latestTradeDate ?? "").localeCompare(a.latestTradeDate ?? "");
  }

  if (sortMode === "RISK_ADJUSTED") {
    return getRiskAdjustedDecisionScore(b) - getRiskAdjustedDecisionScore(a);
  }

  if (sortMode === "VOLUME_CONFIRMED") {
    return getVolumeConfirmationScore(b) - getVolumeConfirmationScore(a);
  }

  return resolveTraderDecision(b).confidence - resolveTraderDecision(a).confidence;
}
