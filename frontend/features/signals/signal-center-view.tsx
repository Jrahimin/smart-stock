"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { WorkspacePageHero } from "@/components/layout/workspace-page-hero";
import { MarketActivityLoader } from "@/components/ui/market-activity-loader";
import { SignalBadge } from "@/components/ui/signal-badge";
import { useMarketUniverse } from "@/features/market-dashboard/hooks/use-market-universe";
import type { StockIntelligenceModel } from "@/lib/market/market-intelligence-types";
import {
  buildDecisionSupportingContext,
  getDecisionMomentumHint,
  getDecisionPriority,
  getRiskAdjustedDecisionScore,
  getVolumeConfirmationScore,
  resolveTraderDecision,
} from "@/lib/market/trader-decision";

export function SignalCenterView() {
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
        eyebrow="Signal Center"
        filterContextName="signal center"
        onFilterTable={setSymbolFilter}
        subtitle={`${signalRows.length} decision-ready names from the shared deterministic engine`}
        title="Explanation-first trader decisions"
      >
        <div className="explorer-controls">
          <select value={filter} onChange={(event) => setFilter(event.target.value)}>
            <option value="ALL">All actions</option>
            <option value="BUY">BUY</option>
            <option value="WAIT">WAIT</option>
            <option value="HOLD">HOLD</option>
            <option value="SELL">SELL</option>
          </select>
          <select value={riskFilter} onChange={(event) => setRiskFilter(event.target.value)}>
            <option value="ALL">All risk</option>
            <option value="LOW">Low risk</option>
            <option value="MEDIUM">Medium risk</option>
            <option value="HIGH">High risk</option>
            <option value="SPECULATIVE">Speculative</option>
          </select>
          <select value={sortMode} onChange={(event) => setSortMode(event.target.value)}>
            <option value="CONVICTION">Highest conviction</option>
            <option value="NEWEST">Newest/as-of</option>
            <option value="RISK_ADJUSTED">Risk-adjusted</option>
            <option value="VOLUME_CONFIRMED">Volume-confirmed</option>
          </select>
        </div>
      </WorkspacePageHero>
      {isError ? <div className="data-warning">Could not load signal data.</div> : null}
      {isLoading ? <MarketActivityLoader /> : null}
      <div className="signal-center-list">
        {signalRows.map((stock) => {
          const decision = resolveTraderDecision(stock);
          const supportingContext = buildDecisionSupportingContext(stock);

          return (
            <Link
              className={`signal-center-item signal-center-item-${decision.recommendation.toLowerCase()} priority-${getDecisionPriority(decision.confidence)}`}
              href={`/stocks/${stock.stock.exchange}/${stock.stock.symbol}`}
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
              <p>{decision.reason}</p>
              <div className="signal-visual-row">
                <div className="signal-confidence-meter" aria-label={`${decision.confidence}% confidence`}>
                  <span style={{ width: `${decision.confidence}%` }} />
                </div>
                <span className={`risk-pill risk-pill-${decision.riskLabel.toLowerCase()}`}>{decision.riskLabel} risk</span>
                <span className={`momentum-marker momentum-marker-${decision.recommendation.toLowerCase()}`}>
                  {getDecisionMomentumHint(stock)}
                </span>
              </div>
              <div className="signal-evidence-row">
                <span>{decision.confidence}% confidence</span>
                <span>Risk {decision.riskLabel}</span>
                <span>Decision engine</span>
                <span>{stock.latestTradeDate ?? "Awaiting price data"}</span>
              </div>
              <small>{supportingContext.join(" / ") || "Awaiting stronger technical context"}</small>
            </Link>
          );
        })}
      </div>
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
