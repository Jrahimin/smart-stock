"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";

import { getDsexIndexSnapshot, listMarketSummaries } from "@/lib/api/market-data-api";
import { buildMarketDashboardModel } from "@/features/market-dashboard/view-models/market-dashboard-view-model";
import { useMarketUniverse } from "@/features/market-dashboard/hooks/use-market-universe";
import { useMarketDataFreshness } from "@/hooks/market/use-market-data-freshness";
import {
  getDashboardRefetchIntervalMs,
  getDashboardStaleTimeMs,
} from "@/lib/market/market-cache-policy";

export function useMarketDashboard() {
  const freshnessQuery = useMarketDataFreshness("DSE");
  const freshness = freshnessQuery.data;
  const staleTimeMs = getDashboardStaleTimeMs(freshness);
  const refetchIntervalMs = getDashboardRefetchIntervalMs(freshness);

  const marketUniverse = useMarketUniverse({
    stockLimit: 500,
    priceWindowLimit: 90,
    staleTimeMs,
    refetchIntervalMs,
    loadStockMasterList: false,
  });
  const marketSummariesQuery = useQuery({
    queryKey: ["market-summaries", "dashboard", "DSE"],
    queryFn: () => listMarketSummaries({ exchange: "DSE", limit: 280 }),
    staleTime: staleTimeMs,
    refetchInterval: refetchIntervalMs,
  });
  const dsexSnapshotQuery = useQuery({
    queryKey: ["market-index", "dsex", "DSE"],
    queryFn: () => getDsexIndexSnapshot("DSE"),
    staleTime: staleTimeMs,
    refetchInterval: refetchIntervalMs,
    retry: 1,
  });

  const model = useMemo(
    () =>
      buildMarketDashboardModel(
        marketSummariesQuery.data ?? [],
        marketUniverse.stocks,
        marketUniverse.universe,
        dsexSnapshotQuery.data ?? null,
        freshness ?? null,
      ),
    [
      marketSummariesQuery.data,
      marketUniverse.stocks,
      marketUniverse.universe,
      dsexSnapshotQuery.data,
      freshness,
    ],
  );

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
