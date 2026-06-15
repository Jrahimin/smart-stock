"use client";

import { Clock3 } from "lucide-react";
import { useEffect, useState } from "react";

import {
  buildMarketFreshnessViewModel,
  formatRelativeLastUpdated,
  useMarketDataFreshness,
} from "@/hooks/market/use-market-data-freshness";

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

function FreshnessChip({ className, label, title, subtle }: FreshnessChipProps & { subtle?: boolean }) {
  return (
    <div
      className={className ? `market-freshness-chip ${className}` : "market-freshness-chip"}
      role="status"
      title={title}
    >
      <Clock3
        aria-hidden="true"
        className="market-freshness-icon"
        size={subtle ? 10 : 12}
        strokeWidth={subtle ? 2 : 2.25}
      />
      <span className="market-freshness-text">{label}</span>
    </div>
  );
}

type MarketDataFreshnessBarProps = {
  variant?: "inline" | "embedded" | "status";
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

export function MarketDataFreshnessBar({ variant = "embedded" }: MarketDataFreshnessBarProps) {
  const { data, isLoading, isError } = useMarketDataFreshness("DSE");
  const [, setTick] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => setTick((value) => value + 1), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const model = buildMarketFreshnessViewModel(data, isLoading, isError);
  const tooltip = buildFreshnessTooltip(model);
  const wrapperClass = resolveFreshnessWrapperClass(variant);
  const isStatus = variant === "status";
  const chipClassName = isStatus ? "market-freshness-chip-status" : undefined;
  const relativeLabel =
    model.relativeLastUpdatedLabel ??
    (data?.last_synced_at ? formatRelativeLastUpdated(data.last_synced_at) : null);

  if (isLoading && !model.lastUpdatedLabel) {
    return (
      <div className={wrapperClass}>
        <FreshnessChip className={chipClassName ?? "market-freshness-chip-loading"} label="Syncing…" subtle={isStatus} />
      </div>
    );
  }

  if (isError) {
    return (
      <div className={wrapperClass}>
        <FreshnessChip
          className={chipClassName ?? "market-freshness-chip-warning"}
          label="Status unavailable"
          subtle={isStatus}
          title="Market snapshot status unavailable"
        />
      </div>
    );
  }

  const label = relativeLabel ? `Last updated ${relativeLabel}` : "No snapshot yet";

  return (
    <div className={wrapperClass}>
      <FreshnessChip className={chipClassName} label={label} subtle={isStatus} title={tooltip} />
    </div>
  );
}
