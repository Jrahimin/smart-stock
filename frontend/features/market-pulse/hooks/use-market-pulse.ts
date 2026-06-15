"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { useAuth } from "@/features/auth/context/auth-context";
import { readMarketPulseSnapshot, writeMarketPulseSnapshot } from "@/features/market-pulse/lib/market-pulse-storage";
import {
  buildMarketPulseSnapshotFromDto,
  buildMarketPulseViewModel,
} from "@/features/market-pulse/view-models/market-pulse-view-model";
import { getMarketPulse } from "@/lib/api/market-pulse-api";
import type { BackendMarketPulsePreviousSnapshotDto } from "@/lib/api/backend-api-types";
import { useMarketDataFreshness } from "@/hooks/market/use-market-data-freshness";
import { frontendConfig } from "@/lib/frontend-config";

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
  const freshnessQuery = useMarketDataFreshness("DSE");
  const cacheMs = frontendConfig.cacheHours * 60 * 60 * 1000;
  const snapshotStaleMs = freshnessQuery.data?.snapshot_interval_minutes
    ? freshnessQuery.data.snapshot_interval_minutes * 60 * 1000
    : cacheMs;

  const [storedSnapshot] = useState(readMarketPulseSnapshot);
  const previousSnapshot = useMemo(() => toApiPreviousSnapshot(storedSnapshot), [storedSnapshot]);

  const pulseQuery = useQuery({
    queryKey: ["market-pulse", "v2", "DSE", user?.display_name ?? null, previousSnapshot?.last_synced_at ?? null],
    queryFn: () =>
      getMarketPulse({
        exchange: "DSE",
        previousSnapshot,
        displayName: user?.display_name ?? null,
      }),
    staleTime: snapshotStaleMs,
  });

  const model = useMemo(
    () => (pulseQuery.data ? buildMarketPulseViewModel(pulseQuery.data) : null),
    [pulseQuery.data],
  );

  useEffect(() => {
    if (!pulseQuery.data) {
      return;
    }

    writeMarketPulseSnapshot({
      ...buildMarketPulseSnapshotFromDto(pulseQuery.data),
      lastSyncedAt: freshnessQuery.data?.last_synced_at ?? new Date().toISOString(),
    });
  }, [freshnessQuery.data?.last_synced_at, pulseQuery.data]);

  useEffect(() => {
    if (!freshnessQuery.data?.snapshot_interval_minutes) {
      return;
    }

    const intervalMs = freshnessQuery.data.snapshot_interval_minutes * 60 * 1000;
    const timer = window.setInterval(() => {
      void pulseQuery.refetch();
      void freshnessQuery.refetch();
    }, intervalMs);

    return () => window.clearInterval(timer);
  }, [freshnessQuery, pulseQuery]);

  return {
    model,
    isLoading: pulseQuery.isLoading,
    isError: pulseQuery.isError,
    refetch: async () => {
      await pulseQuery.refetch();
      await freshnessQuery.refetch();
    },
  };
}
