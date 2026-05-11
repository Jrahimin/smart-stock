"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { SearchableSymbolFilter } from "@/components/filters/searchable-symbol-filter";
import { FloatingRefreshButton } from "@/components/ui/floating-refresh-button";
import { MarketActivityLoader } from "@/components/ui/market-activity-loader";
import { SignalBadge } from "@/components/ui/signal-badge";
import { useMarketUniverse } from "@/features/market-dashboard/hooks/use-market-universe";

export function SignalCenterView() {
  const { universe, isLoading, isError, refetch } = useMarketUniverse({ stockLimit: 500, priceWindowLimit: 30 });
  const [filter, setFilter] = useState("ALL");
  const [symbolFilter, setSymbolFilter] = useState("");

  const signals = useMemo(
    () =>
      universe
        .map((stock) => stock.signal)
        .filter((signal) => filter === "ALL" || signal.signal === filter)
        .filter((signal) => !symbolFilter || signal.symbol.includes(symbolFilter))
        .sort((a, b) => b.confidence - a.confidence),
    [filter, symbolFilter, universe],
  );

  return (
    <section className="signal-center-view">
      <div className="explorer-header">
        <div>
          <p className="eyebrow">Signal Center</p>
          <h1>Explanation-first signal intelligence</h1>
          <span>{signals.length} deterministic signals from loaded market data</span>
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
        </div>
      </div>
      {isError ? <div className="data-warning">Could not load signal data.</div> : null}
      {isLoading ? <MarketActivityLoader /> : null}
      <div className="signal-center-list">
        {signals.map((signal) => (
          <Link className="signal-center-item" href={`/stocks/${signal.exchange}/${signal.symbol}`} key={signal.stockId}>
            <div>
              <strong>{signal.symbol}</strong>
              <span>{signal.name}</span>
            </div>
            <SignalBadge signal={signal.signal} />
            <p>{signal.reason}</p>
            <div className="signal-evidence-row">
              <span>{signal.confidence}% confidence</span>
              <span>Risk {signal.risk}</span>
              <span>{signal.generatedAt}</span>
            </div>
            <small>{signal.supportingContext.join(" / ") || "Awaiting stronger technical context"}</small>
          </Link>
        ))}
      </div>
      <FloatingRefreshButton onRefresh={refetch} />
    </section>
  );
}
