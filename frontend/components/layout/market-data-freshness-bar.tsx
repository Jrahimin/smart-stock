"use client";

import {
  buildMarketFreshnessViewModel,
  useMarketDataFreshness,
} from "@/hooks/market/use-market-data-freshness";

export function MarketDataFreshnessBar() {
  const { data, isLoading, isError } = useMarketDataFreshness("DSE");
  const model = buildMarketFreshnessViewModel(data, isLoading, isError);

  if (isLoading && !model.lastUpdatedLabel) {
    return (
      <div className="market-freshness-bar" role="status">
        Loading market snapshot status…
      </div>
    );
  }

  if (isError) {
    return (
      <div className="market-freshness-bar market-freshness-bar-warning" role="status">
        Market snapshot status unavailable. Data may be stale until the backend responds.
      </div>
    );
  }

  return (
    <div className="market-freshness-bar" role="status">
      <span className="market-freshness-bar-item">
        <strong>Last updated:</strong> {model.lastUpdatedLabel ?? "No snapshot yet"}
      </span>
      {model.nextUpdateLabel ? (
        <span className="market-freshness-bar-item">
          <strong>Next update:</strong> {model.nextUpdateLabel}
        </span>
      ) : null}
      {model.sessionLabel ? (
        <span className="market-freshness-bar-item">
          <strong>Session:</strong> {model.sessionLabel}
        </span>
      ) : null}
      {model.delayDisclaimer ? (
        <span className="market-freshness-bar-item market-freshness-bar-muted">{model.delayDisclaimer}</span>
      ) : null}
    </div>
  );
}
