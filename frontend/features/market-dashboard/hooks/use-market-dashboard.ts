"use client";

import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";

import { getDsexIndexSnapshot, listMarketSummaries } from "@/lib/api/market-data-api";
import { buildMarketDashboardModel } from "@/features/market-dashboard/view-models/market-dashboard-view-model";
import { useMarketUniverse } from "@/features/market-dashboard/hooks/use-market-universe";
import { useMarketDataFreshness } from "@/hooks/market/use-market-data-freshness";
import { frontendConfig } from "@/lib/frontend-config";

export function useMarketDashboard() {
  const cacheMs = frontendConfig.cacheHours * 60 * 60 * 1000;
  const freshnessQuery = useMarketDataFreshness("DSE");
  const snapshotStaleMs = freshnessQuery.data?.snapshot_interval_minutes
    ? freshnessQuery.data.snapshot_interval_minutes * 60 * 1000
    : cacheMs;
  const marketUniverse = useMarketUniverse({
    stockLimit: 500,
    priceWindowLimit: 90,
    staleTimeMs: snapshotStaleMs,
  });
  const marketSummariesQuery = useQuery({
    queryKey: ["market-summaries", "dashboard", "DSE"],
    queryFn: () => listMarketSummaries({ exchange: "DSE", limit: 280 }),
    staleTime: cacheMs,
  });
  const dsexSnapshotQuery = useQuery({
    queryKey: ["market-index", "dsex", "DSE"],
    queryFn: () => getDsexIndexSnapshot("DSE"),
    staleTime: snapshotStaleMs,
    retry: 1,
  });

  const model = buildMarketDashboardModel(
    marketSummariesQuery.data ?? [],
    marketUniverse.stocks,
    marketUniverse.universe,
    dsexSnapshotQuery.data ?? null,
    freshnessQuery.data ?? null,
  );

  useEffect(() => {
    if (!model.session.shouldPoll || model.session.pollingIntervalMs === false) {
      return;
    }

    const timer = window.setInterval(() => {
      void Promise.all([marketSummariesQuery.refetch(), dsexSnapshotQuery.refetch(), marketUniverse.refetch()]);
    }, model.session.pollingIntervalMs);

    return () => window.clearInterval(timer);
  }, [dsexSnapshotQuery, marketSummariesQuery, marketUniverse, model.session.pollingIntervalMs, model.session.shouldPoll]);

  return {
    model,
    isLoading: marketSummariesQuery.isLoading || marketUniverse.isLoading,
    isError: marketSummariesQuery.isError || marketUniverse.isError,
    loadedPriceCount: marketUniverse.loadedPriceCount,
    refetch: async () => {
      await Promise.all([marketSummariesQuery.refetch(), dsexSnapshotQuery.refetch(), marketUniverse.refetch()]);
    },
  };
}
