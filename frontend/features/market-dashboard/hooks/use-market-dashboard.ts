"use client";

import { useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { buildMarketDashboardModel } from "@/features/market-dashboard/view-models/market-dashboard-view-model";
import { mapDashboardMoversDto } from "@/features/market-dashboard/view-models/dashboard-movers-mapper";
import { useDashboardMovers } from "@/features/market-dashboard/hooks/use-dashboard-movers";
import { useDashboardOverview } from "@/features/market-dashboard/hooks/use-dashboard-overview";
import { useMarketUniverse } from "@/features/market-dashboard/hooks/use-market-universe";
import { useMarketDataFreshness } from "@/hooks/market/use-market-data-freshness";
import {
  getDashboardRefetchIntervalMs,
  getDashboardStaleTimeMs,
} from "@/lib/market/market-cache-policy";

export function useMarketDashboard() {
  const queryClient = useQueryClient();
  const freshnessQuery = useMarketDataFreshness("DSE");
  const freshness = freshnessQuery.data;
  const staleTimeMs = getDashboardStaleTimeMs(freshness);
  const refetchIntervalMs = getDashboardRefetchIntervalMs(freshness);

  const overviewQuery = useDashboardOverview({
    staleTimeMs,
    refetchIntervalMs,
  });
  const moversQuery = useDashboardMovers({
    staleTimeMs,
    refetchIntervalMs,
  });
  const marketUniverse = useMarketUniverse({
    stockLimit: 500,
    priceWindowLimit: 90,
    staleTimeMs,
    refetchIntervalMs,
    loadStockMasterList: false,
  });

  const mappedMovers = useMemo(
    () => (moversQuery.data ? mapDashboardMoversDto(moversQuery.data) : undefined),
    [moversQuery.data],
  );

  const model = useMemo(
    () =>
      buildMarketDashboardModel(
        overviewQuery.data?.summaries ?? [],
        marketUniverse.stocks,
        marketUniverse.universe,
        overviewQuery.data?.dsex_index ?? null,
        freshness ?? null,
        {
          listedStockCount: overviewQuery.data?.listed_stock_count,
          movers: mappedMovers,
        },
      ),
    [
      overviewQuery.data,
      marketUniverse.stocks,
      marketUniverse.universe,
      freshness,
      mappedMovers,
    ],
  );

  return {
    model,
    isLoading: overviewQuery.isLoading || moversQuery.isLoading || marketUniverse.isLoading,
    isError: overviewQuery.isError || moversQuery.isError || marketUniverse.isError,
    loadedPriceCount: marketUniverse.loadedPriceCount,
    refetch: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["dashboard", "overview", "DSE"] }),
        queryClient.invalidateQueries({ queryKey: ["dashboard", "movers", "DSE"] }),
        freshnessQuery.refetch(),
        marketUniverse.refetch(),
      ]);
    },
  };
}
