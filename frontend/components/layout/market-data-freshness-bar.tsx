"use client";

import { Clock3, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";

import type { DashboardLanguage } from "@/features/market-dashboard/dashboard-language";
import { getDashboardLanguage } from "@/features/market-dashboard/dashboard-language";
import {
  buildMarketFreshnessViewModel,
  formatRelativeLastUpdated,
  useMarketDataFreshness,
} from "@/hooks/market/use-market-data-freshness";
import { useMarketCacheRefresh } from "@/hooks/market/use-market-cache-coordinator";
import type { ExchangeCode } from "@/lib/api/backend-api-types";
import type { AppLocale } from "@/lib/locale/app-locale";

const englishFreshnessLabels: DashboardLanguage["freshness"] = {
  syncing: "Syncing…",
  statusUnavailable: "Status unavailable",
  statusUnavailableTitle: "Market snapshot status unavailable",
  lastUpdated: (relative) => `Last updated ${relative}`,
  noSnapshotYet: "No snapshot yet",
  lastUpdatedPending: "Last updated …",
  refreshAria: "Refresh market data",
  refreshTitle: "Refresh market data",
  refreshDisabledTitle: "Refresh unavailable during this session",
  synced: (label) => `Synced ${label}`,
  session: (label) => `Session: ${label}`,
  nextUpdate: (label) => `Next update: ${label}`,
};

function buildFreshnessTooltip(
  model: ReturnType<typeof buildMarketFreshnessViewModel>,
  labels: DashboardLanguage["freshness"],
  staleDisclaimer?: string,
) {
  const parts = [
    model.lastUpdatedLabel ? labels.synced(model.lastUpdatedLabel) : null,
    model.freshnessLabel,
    model.sessionLabel ? labels.session(model.sessionLabel) : null,
    model.nextUpdateLabel ? labels.nextUpdate(model.nextUpdateLabel) : null,
    model.delayDisclaimer,
    staleDisclaimer,
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
  disabledTitle: string;
  isRefreshing?: boolean;
  onRefresh: () => void;
  refreshAria: string;
  refreshTitle: string;
};

function MarketFreshnessRefreshButton({
  disabled = false,
  disabledTitle,
  isRefreshing = false,
  onRefresh,
  refreshAria,
  refreshTitle,
}: MarketFreshnessRefreshButtonProps) {
  return (
    <button
      aria-label={refreshAria}
      className="market-freshness-refresh-button"
      disabled={disabled || isRefreshing}
      onClick={onRefresh}
      title={disabled ? disabledTitle : refreshTitle}
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
  /** When set, dashboard freshness copy and stale disclaimer are localized. */
  locale?: AppLocale;
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

export function MarketDataFreshnessBar({
  variant = "embedded",
  exchange = "DSE",
  className,
  locale,
}: MarketDataFreshnessBarProps) {
  const { data, isLoading, isError } = useMarketDataFreshness(exchange);
  const refreshMarketCaches = useMarketCacheRefresh();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [hasMounted, setHasMounted] = useState(false);
  const [, setTick] = useState(0);
  const dashboardLanguage = locale ? getDashboardLanguage(locale) : null;
  const labels = dashboardLanguage?.freshness ?? englishFreshnessLabels;
  const staleDisclaimer = dashboardLanguage?.states.staleDisclaimer;

  useEffect(() => {
    setHasMounted(true);
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setTick((value) => value + 1), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const model = buildMarketFreshnessViewModel(data, isLoading, isError);
  const tooltip = buildFreshnessTooltip(model, labels, staleDisclaimer);
  const wrapperClass = [resolveFreshnessWrapperClass(variant), "market-freshness-bar-with-refresh", className]
    .filter(Boolean)
    .join(" ");
  const relativeLabel =
    hasMounted && data?.last_synced_at ? formatRelativeLastUpdated(data.last_synced_at) : null;
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
        <FreshnessChip className="market-freshness-chip-loading" label={labels.syncing} />
      </div>
    );
  }

  if (isError) {
    return (
      <div className={wrapperClass}>
        <FreshnessChip
          className="market-freshness-chip-warning"
          label={labels.statusUnavailable}
          title={labels.statusUnavailableTitle}
        />
        <MarketFreshnessRefreshButton
          disabledTitle={labels.refreshDisabledTitle}
          isRefreshing={isRefreshing}
          onRefresh={handleRefresh}
          refreshAria={labels.refreshAria}
          refreshTitle={labels.refreshTitle}
        />
      </div>
    );
  }

  const label = relativeLabel
    ? labels.lastUpdated(relativeLabel)
    : hasMounted
      ? labels.noSnapshotYet
      : model.lastUpdatedLabel
        ? labels.lastUpdatedPending
        : labels.syncing;

  return (
    <div className={wrapperClass}>
      <FreshnessChip label={label} title={tooltip} />
      <MarketFreshnessRefreshButton
        disabled={refreshDisabled}
        disabledTitle={labels.refreshDisabledTitle}
        isRefreshing={isRefreshing}
        onRefresh={handleRefresh}
        refreshAria={labels.refreshAria}
        refreshTitle={labels.refreshTitle}
      />
    </div>
  );
}
