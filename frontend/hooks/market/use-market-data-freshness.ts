"use client";

import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";

import { setMarketPersistentCacheTtlMs } from "@/lib/api/backend-api-client";
import { getMarketFreshness } from "@/lib/api/market-data-api";
import type { BackendMarketFreshnessDto, ExchangeCode } from "@/lib/api/backend-api-types";

const FRESHNESS_POLL_MS = 2 * 60 * 1000;

export function useMarketDataFreshness(
  exchange: ExchangeCode = "DSE",
  options?: { refetchInterval?: number | false },
) {
  return useQuery({
    queryKey: ["market-freshness", exchange],
    queryFn: () => getMarketFreshness(exchange),
    staleTime: 60_000,
    refetchInterval: options?.refetchInterval ?? FRESHNESS_POLL_MS,
  });
}

/** Sync IndexedDB TTL from freshness; pass `ttlSeconds` from an existing freshness query to avoid duplicate subscriptions. */
export function useMarketPersistentCacheTtl(
  exchange: ExchangeCode = "DSE",
  ttlSeconds?: number | null,
) {
  const shouldSubscribe = ttlSeconds === undefined;
  const { data } = useMarketDataFreshness(exchange, {
    refetchInterval: shouldSubscribe ? undefined : false,
  });
  const resolvedTtlSeconds = ttlSeconds ?? data?.dashboard_cache_ttl_seconds ?? null;

  useEffect(() => {
    if (resolvedTtlSeconds == null) {
      return;
    }
    setMarketPersistentCacheTtlMs(resolvedTtlSeconds * 1000);
  }, [resolvedTtlSeconds]);
}

export type MarketFreshnessViewModel = {
  raw: BackendMarketFreshnessDto | null;
  lastUpdatedLabel: string | null;
  relativeLastUpdatedLabel: string | null;
  nextUpdateLabel: string | null;
  delayDisclaimer: string | null;
  sessionLabel: string | null;
  freshnessLabel: string | null;
  snapshotIntervalMs: number;
  isLoading: boolean;
  isError: boolean;
};

function formatDhakaDateTime(iso: string | null) {
  if (!iso) {
    return null;
  }
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Dhaka",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZoneName: "short",
  }).format(new Date(iso));
}

function formatLastUpdatedLabel(iso: string | null) {
  if (!iso) {
    return null;
  }
  const formatted = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Dhaka",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(new Date(iso));
  return `${formatted}.`;
}

export function formatRelativeLastUpdated(iso: string | null) {
  if (!iso) {
    return null;
  }

  const diffMs = Date.now() - new Date(iso).getTime();
  const diffMinutes = Math.max(0, Math.floor(diffMs / 60_000));

  if (diffMinutes < 1) {
    return "just now";
  }
  if (diffMinutes === 1) {
    return "1 minute ago";
  }
  if (diffMinutes < 60) {
    return `${diffMinutes} minutes ago`;
  }

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours === 1) {
    return "1 hour ago";
  }
  if (diffHours < 24) {
    return `${diffHours} hours ago`;
  }

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays === 1) {
    return "1 day ago";
  }
  return `${diffDays} days ago`;
}

export function buildMarketFreshnessViewModel(
  data: BackendMarketFreshnessDto | undefined,
  isLoading: boolean,
  isError: boolean,
): MarketFreshnessViewModel {
  const intervalMs = (data?.snapshot_interval_minutes ?? 15) * 60 * 1000;
  return {
    raw: data ?? null,
    lastUpdatedLabel: data?.last_synced_at ? formatLastUpdatedLabel(data.last_synced_at) : null,
    relativeLastUpdatedLabel: data?.last_synced_at ? formatRelativeLastUpdated(data.last_synced_at) : null,
    nextUpdateLabel: data?.next_sync_at ? formatDhakaDateTime(data.next_sync_at) : null,
    delayDisclaimer: data
      ? `Prices are snapshots and may be delayed by up to ${data.expected_delay_minutes} minutes.`
      : null,
    sessionLabel: data?.market_status?.replace("_", " ") ?? null,
    freshnessLabel: data?.freshness_label ?? null,
    snapshotIntervalMs: intervalMs,
    isLoading,
    isError,
  };
}
