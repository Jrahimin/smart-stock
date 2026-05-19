"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { SearchableSymbolFilter } from "@/components/filters/searchable-symbol-filter";
import { FloatingRefreshButton } from "@/components/ui/floating-refresh-button";
import { MarketActivityLoader } from "@/components/ui/market-activity-loader";
import { SignalBadge } from "@/components/ui/signal-badge";
import { useMarketUniverse } from "@/features/market-dashboard/hooks/use-market-universe";
import type { StockIntelligenceModel } from "@/lib/market/market-intelligence-types";

export function SignalCenterView() {
  const { universe, isLoading, isError, refetch } = useMarketUniverse({ stockLimit: 500, priceWindowLimit: 30 });
  const [filter, setFilter] = useState("ALL");
  const [riskFilter, setRiskFilter] = useState("ALL");
  const [sortMode, setSortMode] = useState("CONVICTION");
  const [sourceFilter, setSourceFilter] = useState("ALL");
  const [symbolFilter, setSymbolFilter] = useState("");

  const signalRows = useMemo(
    () =>
      universe
        .filter((stock) => filter === "ALL" || stock.signal.signal === filter)
        .filter((stock) => riskFilter === "ALL" || stock.signal.risk === riskFilter)
        .filter((stock) => sourceFilter === "ALL" || (stock.signal.source ?? "derived").toUpperCase() === sourceFilter)
        .filter((stock) => !symbolFilter || stock.signal.symbol.includes(symbolFilter))
        .sort((a, b) => compareSignalRows(a, b, sortMode)),
    [filter, riskFilter, sortMode, sourceFilter, symbolFilter, universe],
  );

  return (
    <section className="signal-center-view">
      <div className="explorer-header">
        <div>
          <p className="eyebrow">Signal Center</p>
          <h1>Explanation-first signal intelligence</h1>
          <span>{signalRows.length} explanation-ready signals from loaded market data</span>
        </div>
        <div className="explorer-controls">
          <SearchableSymbolFilter
            id="signal-symbol-filter"
            options={universe.map((stock) => ({ id: stock.stock.id, symbol: stock.stock.symbol, name: stock.stock.name }))}
            value={symbolFilter}
            onChange={setSymbolFilter}
          />
          <select value={filter} onChange={(event) => setFilter(event.target.value)}>
            <option value="ALL">All signals</option>
            <option value="BUY">BUY</option>
            <option value="HOLD">HOLD</option>
            <option value="SELL">SELL</option>
          </select>
          <select value={riskFilter} onChange={(event) => setRiskFilter(event.target.value)}>
            <option value="ALL">All risk</option>
            <option value="LOW">Low risk</option>
            <option value="MEDIUM">Medium risk</option>
            <option value="HIGH">High risk</option>
          </select>
          <select value={sourceFilter} onChange={(event) => setSourceFilter(event.target.value)}>
            <option value="ALL">All sources</option>
            <option value="DERIVED">Derived</option>
            <option value="BACKEND">Persisted</option>
          </select>
          <select value={sortMode} onChange={(event) => setSortMode(event.target.value)}>
            <option value="CONVICTION">Highest conviction</option>
            <option value="NEWEST">Newest/as-of</option>
            <option value="RISK_ADJUSTED">Risk-adjusted</option>
            <option value="VOLUME_CONFIRMED">Volume-confirmed</option>
          </select>
        </div>
      </div>
      {isError ? <div className="data-warning">Could not load signal data.</div> : null}
      {isLoading ? <MarketActivityLoader /> : null}
      <div className="signal-center-list">
        {signalRows.map((stock) => {
          const signal = stock.signal;

          return (
            <Link
              className={`signal-center-item signal-center-item-${signal.signal.toLowerCase()} priority-${getSignalPriority(signal.confidence)}`}
              href={`/stocks/${signal.exchange}/${signal.symbol}`}
              key={signal.stockId}
            >
              <div className="signal-center-topline">
                <div>
                  <strong>{signal.symbol}</strong><br/>
                  <span>{signal.name}</span>
                </div>
                <SignalBadge signal={signal.signal} />
              </div>
              <p>{signal.reason}</p>
              <div className="signal-visual-row">
                <div className="signal-confidence-meter" aria-label={`${signal.confidence}% confidence`}>
                  <span style={{ width: `${signal.confidence}%` }} />
                </div>
                <span className={`risk-pill risk-pill-${signal.risk.toLowerCase()}`}>{signal.risk} risk</span>
                <span className={`momentum-marker momentum-marker-${signal.signal.toLowerCase()}`}>
                  {signal.momentumPhase ?? (signal.signal === "BUY" ? "Momentum expanding" : signal.signal === "SELL" ? "Pressure rising" : "Wait for trigger")}
                </span>
              </div>
              <div className="signal-evidence-row">
                <span>{signal.confidence}% confidence</span>
                <span>Risk {signal.risk}</span>
                <span>{signal.source === "backend" ? "Persisted" : "Derived"}</span>
                <span>{signal.asOfTradeDate ?? signal.generatedAt}</span>
              </div>
              <small>{signal.supportingContext.join(" / ") || signal.volumeBehavior || "Awaiting stronger technical context"}</small>
            </Link>
          );
        })}
      </div>
      <FloatingRefreshButton onRefresh={refetch} />
    </section>
  );
}

function compareSignalRows(a: StockIntelligenceModel, b: StockIntelligenceModel, sortMode: string) {
  if (sortMode === "NEWEST") {
    return (b.signal.asOfTradeDate ?? b.signal.generatedAt).localeCompare(a.signal.asOfTradeDate ?? a.signal.generatedAt);
  }

  if (sortMode === "RISK_ADJUSTED") {
    return getRiskAdjustedScore(b) - getRiskAdjustedScore(a);
  }

  if (sortMode === "VOLUME_CONFIRMED") {
    return getVolumeConfirmationScore(b) - getVolumeConfirmationScore(a);
  }

  return b.signal.confidence - a.signal.confidence;
}

function getRiskAdjustedScore(stock: StockIntelligenceModel) {
  const riskPenalty = stock.signal.risk === "HIGH" ? 24 : stock.signal.risk === "MEDIUM" ? 10 : 0;
  return stock.signal.confidence - riskPenalty;
}

function getVolumeConfirmationScore(stock: StockIntelligenceModel) {
  const volumeRatio = stock.averageVolume && stock.averageVolume > 0 ? stock.volume / stock.averageVolume : 1;
  return stock.signal.confidence + Math.min(30, volumeRatio * 10);
}

function getSignalPriority(confidence: number) {
  if (confidence >= 70) {
    return "high";
  }

  if (confidence >= 58) {
    return "medium";
  }

  return "low";
}
