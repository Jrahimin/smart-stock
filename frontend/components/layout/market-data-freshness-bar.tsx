"use client";

import { Clock3, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";

import {
  buildMarketFreshnessViewModel,
  formatRelativeLastUpdated,
  useMarketDataFreshness,
} from "@/hooks/market/use-market-data-freshness";
import { useMarketCacheRefresh } from "@/hooks/market/use-market-cache-coordinator";
import type { ExchangeCode } from "@/lib/api/backend-api-types";

function buildFreshnessTooltip(model: ReturnType<typeof buildMarketFreshnessViewModel>) {
  const parts = [
    model.lastUpdatedLabel ? `Synced ${model.lastUpdatedLabel}` : null,
    model.freshnessLabel,
    model.sessionLabel ? `Session: ${model.sessionLabel}` : null,
    model.nextUpdateLabel ? `Next update: ${model.nextUpdateLabel}` : null,
    model.delayDisclaimer,
  ].filter(Boolean);

  return parts.length > 0 ? parts.join(" · ") : undefined;
}

function isManualRefreshDisabled(marketStatus: string | undefined) {
  return marketStatus === "PRE_OPEN" || marketStatus === "HOLIDAY";
}

type FreshnessChipProps = {
  className?: string;
  label: string;
  title?: string;
};

function FreshnessChip({ className, label, title }: FreshnessChipProps) {
  return (
    <div className={className ? `market-freshness-chip ${className}` : "market-freshness-chip"} role="status" title={title}>
      <Clock3 aria-hidden="true" className="market-freshness-icon" size={12} strokeWidth={2.25} />
      <span className="market-freshness-text">{label}</span>
    </div>
  );
}

type MarketFreshnessRefreshButtonProps = {
  disabled?: boolean;
  isRefreshing?: boolean;
  onRefresh: () => void;
};

function MarketFreshnessRefreshButton({ disabled = false, isRefreshing = false, onRefresh }: MarketFreshnessRefreshButtonProps) {
  return (
    <button
      aria-label="Refresh market data"
      className="market-freshness-refresh-button"
      disabled={disabled || isRefreshing}
      onClick={onRefresh}
      title={disabled ? "Refresh unavailable during this session" : "Refresh market data"}
      type="button"
    >
      <RefreshCw aria-hidden="true" className={isRefreshing ? "market-freshness-refresh-icon-spinning" : undefined} size={12} strokeWidth={2.25} />
    </button>
  );
}

export type MarketDataFreshnessBarProps = {
  /** Controls placement only; chip styling stays consistent across pages. */
  variant?: "inline" | "embedded" | "status";
  exchange?: ExchangeCode;
  className?: string;
};

function resolveFreshnessWrapperClass(variant: MarketDataFreshnessBarProps["variant"]) {
  if (variant === "status") {
    return "market-freshness-bar market-freshness-bar-status";
  }
  if (variant === "inline") {
    return "market-freshness-bar market-freshness-bar-inline";
  }
  return "market-freshness-bar market-freshness-bar-embedded";
}

export function MarketDataFreshnessBar({ variant = "embedded", exchange = "DSE", className }: MarketDataFreshnessBarProps) {
  const { data, isLoading, isError } = useMarketDataFreshness(exchange);
  const refreshMarketCaches = useMarketCacheRefresh();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [, setTick] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => setTick((value) => value + 1), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const model = buildMarketFreshnessViewModel(data, isLoading, isError);
  const tooltip = buildFreshnessTooltip(model);
  const wrapperClass = [resolveFreshnessWrapperClass(variant), "market-freshness-bar-with-refresh", className]
    .filter(Boolean)
    .join(" ");
  const relativeLabel =
    model.relativeLastUpdatedLabel ??
    (data?.last_synced_at ? formatRelativeLastUpdated(data.last_synced_at) : null);
  const refreshDisabled = isManualRefreshDisabled(data?.market_status);

  const handleRefresh = () => {
    setIsRefreshing(true);
    void refreshMarketCaches().finally(() => {
      setIsRefreshing(false);
    });
  };

  if (isLoading && !model.lastUpdatedLabel) {
    return (
      <div className={wrapperClass}>
        <FreshnessChip className="market-freshness-chip-loading" label="Syncing…" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className={wrapperClass}>
        <FreshnessChip
          className="market-freshness-chip-warning"
          label="Status unavailable"
          title="Market snapshot status unavailable"
        />
        <MarketFreshnessRefreshButton isRefreshing={isRefreshing} onRefresh={handleRefresh} />
      </div>
    );
  }

  const label = relativeLabel ? `Last updated ${relativeLabel}` : "No snapshot yet";

  return (
    <div className={wrapperClass}>
      <FreshnessChip label={label} title={tooltip} />
      <MarketFreshnessRefreshButton disabled={refreshDisabled} isRefreshing={isRefreshing} onRefresh={handleRefresh} />
    </div>
  );
}
