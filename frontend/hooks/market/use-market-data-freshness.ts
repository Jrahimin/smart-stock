"use client";

import { useQuery } from "@tanstack/react-query";

import { getMarketFreshness } from "@/lib/api/market-data-api";
import type { BackendMarketFreshnessDto, ExchangeCode } from "@/lib/api/backend-api-types";

const FRESHNESS_POLL_MS = 2 * 60 * 1000;

export function useMarketDataFreshness(
  exchange: ExchangeCode = "DSE",
  options?: {
    refetchInterval?: number | false;
    initialData?: BackendMarketFreshnessDto;
    initialDataUpdatedAt?: number;
  },
) {
  return useQuery({
    queryKey: ["market-freshness", exchange],
    queryFn: () => getMarketFreshness(exchange),
    initialData: options?.initialData,
    initialDataUpdatedAt: options?.initialDataUpdatedAt,
    staleTime: 60_000,
    refetchInterval: options?.refetchInterval ?? ((query) => Math.min(
      FRESHNESS_POLL_MS, (query.state.data?.snapshot_interval_minutes ?? 2) * 60_000,
    )),
  });
}

export type MarketFreshnessViewModel = {
  raw: BackendMarketFreshnessDto | null;
  lastUpdatedLabel: string | null;
  relativeLastUpdatedLabel: string | null;
  nextUpdateLabel: string | null;
  delayDisclaimer: string | null;
  sessionLabel: string | null;
  freshnessLabel: string | null;
  decisionSessionLabel: string | null;
  isLiveSession: boolean;
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

export function formatRelativeLastUpdated(iso: string | null, locale = "en", now = Date.now()) {
  if (!iso) return null;
  const diffMs = now - Date.parse(iso);
  if (!Number.isFinite(diffMs) || diffMs < 0) return null;
  const diffMinutes = Math.max(0, Math.floor(diffMs / 60_000));
  if (diffMinutes < 1) return locale === "bn" ? "এইমাত্র" : "just now";
  const relative = new Intl.RelativeTimeFormat(locale === "bn" ? "bn-BD" : "en-GB");
  if (diffMinutes < 60) return relative.format(-diffMinutes, "minute");
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return relative.format(-diffHours, "hour");
  return relative.format(-Math.floor(diffHours / 24), "day");
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
    decisionSessionLabel: data?.decision_session_date ?? null,
    isLiveSession: data?.is_live_session ?? false,
    snapshotIntervalMs: intervalMs,
    isLoading,
    isError,
  };
}
