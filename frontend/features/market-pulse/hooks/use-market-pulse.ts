"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { useAuth } from "@/features/auth/context/auth-context";
import { readMarketPulseSnapshot, writeMarketPulseSnapshot } from "@/features/market-pulse/lib/market-pulse-storage";
import {
  buildMarketPulseSnapshotFromDto,
  buildMarketPulseViewModel,
} from "@/features/market-pulse/view-models/market-pulse-view-model";
import { getMarketPulseBriefing, getMarketPulseSummary } from "@/lib/api/market-pulse-api";
import type { BackendMarketPulseDto, BackendMarketPulsePreviousSnapshotDto } from "@/lib/api/backend-api-types";
import { useMarketDataFreshness } from "@/hooks/market/use-market-data-freshness";
import { getMarketRefetchIntervalMs, getMarketStaleTimeMs } from "@/lib/market/market-cache-policy";

function toApiPreviousSnapshot(stored: ReturnType<typeof readMarketPulseSnapshot>): BackendMarketPulsePreviousSnapshotDto | null {
  if (!stored.lastSyncedAt) {
    return null;
  }

  return {
    last_synced_at: stored.lastSyncedAt,
    focus_stock_ids: stored.focusStockIds,
    scores: stored.scores,
    recommendations: stored.recommendations,
    alert_ids: stored.alertIds,
  };
}

export function useMarketPulse() {
  const { user } = useAuth();
  const freshnessQuery = useMarketDataFreshness("DSE", { refetchInterval: false });
  const staleTime = getMarketStaleTimeMs(freshnessQuery.data);
  const refetchInterval = getMarketRefetchIntervalMs(freshnessQuery.data);

  const [storedSnapshot] = useState(readMarketPulseSnapshot);
  const previousSnapshot = useMemo(() => toApiPreviousSnapshot(storedSnapshot), [storedSnapshot]);

  const summaryQuery = useQuery({
    queryKey: ["market-pulse-summary", "DSE", user?.display_name ?? null, previousSnapshot?.last_synced_at ?? null],
    queryFn: () =>
      getMarketPulseSummary({
        exchange: "DSE",
        previousSnapshot,
        displayName: user?.display_name ?? null,
      }),
    staleTime,
    refetchInterval,
  });

  const briefingQuery = useQuery({
    queryKey: ["market-pulse-briefing", "DSE", user?.display_name ?? null],
    queryFn: () =>
      getMarketPulseBriefing({
        exchange: "DSE",
        displayName: user?.display_name ?? null,
      }),
    staleTime,
    refetchInterval,
    enabled: Boolean(summaryQuery.data),
  });

  const pulseDto = useMemo<BackendMarketPulseDto | null>(() => {
    if (!summaryQuery.data) {
      return null;
    }

    return {
      ...summaryQuery.data,
      briefing: briefingQuery.data ?? null,
      today_insight: null,
      changes: [],
      market_movers: { gainers: [], losers: [] },
    };
  }, [briefingQuery.data, summaryQuery.data]);

  const model = useMemo(() => (pulseDto ? buildMarketPulseViewModel(pulseDto) : null), [pulseDto]);

  useEffect(() => {
    if (!pulseDto) {
      return;
    }

    writeMarketPulseSnapshot({
      ...buildMarketPulseSnapshotFromDto(pulseDto),
      lastSyncedAt: freshnessQuery.data?.last_synced_at ?? new Date().toISOString(),
    });
  }, [freshnessQuery.data?.last_synced_at, pulseDto]);

  return {
    model,
    isLoading: summaryQuery.isLoading,
    isBriefingLoading: briefingQuery.isLoading,
    isError: summaryQuery.isError || briefingQuery.isError,
    refetch: async () => {
      await summaryQuery.refetch();
      await briefingQuery.refetch();
      await freshnessQuery.refetch();
    },
  };
}
