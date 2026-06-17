"use client";

import { Clock3 } from "lucide-react";
import { useEffect, useState } from "react";

import {
  buildMarketFreshnessViewModel,
  formatRelativeLastUpdated,
  useMarketDataFreshness,
} from "@/hooks/market/use-market-data-freshness";
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
  const [, setTick] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => setTick((value) => value + 1), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const model = buildMarketFreshnessViewModel(data, isLoading, isError);
  const tooltip = buildFreshnessTooltip(model);
  const wrapperClass = [resolveFreshnessWrapperClass(variant), className].filter(Boolean).join(" ");
  const relativeLabel =
    model.relativeLastUpdatedLabel ??
    (data?.last_synced_at ? formatRelativeLastUpdated(data.last_synced_at) : null);

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
      </div>
    );
  }

  const label = relativeLabel ? `Last updated ${relativeLabel}` : "No snapshot yet";

  return (
    <div className={wrapperClass}>
      <FreshnessChip label={label} title={tooltip} />
    </div>
  );
}
