"use client";

import { useQuery } from "@tanstack/react-query";

import { getMarketFreshness } from "@/lib/api/market-data-api";
import type { BackendMarketFreshnessDto, ExchangeCode } from "@/lib/api/backend-api-types";

const FRESHNESS_POLL_MS = 2 * 60 * 1000;

export function useMarketDataFreshness(exchange: ExchangeCode = "DSE") {
  return useQuery({
    queryKey: ["market-freshness", exchange],
    queryFn: () => getMarketFreshness(exchange),
    staleTime: 60_000,
    refetchInterval: FRESHNESS_POLL_MS,
  });
}

export type MarketFreshnessViewModel = {
  raw: BackendMarketFreshnessDto | null;
  lastUpdatedLabel: string | null;
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

export function buildMarketFreshnessViewModel(
  data: BackendMarketFreshnessDto | undefined,
  isLoading: boolean,
  isError: boolean,
): MarketFreshnessViewModel {
  const intervalMs = (data?.snapshot_interval_minutes ?? 15) * 60 * 1000;
  return {
    raw: data ?? null,
    lastUpdatedLabel: data?.last_synced_at ? formatDhakaDateTime(data.last_synced_at) : null,
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
