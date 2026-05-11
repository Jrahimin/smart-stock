"use client";

import { useQuery } from "@tanstack/react-query";

import { listMarketSummaries } from "@/lib/api/market-data-api";
import { buildMarketDashboardModel } from "@/features/market-dashboard/view-models/market-dashboard-view-model";
import { useMarketUniverse } from "@/features/market-dashboard/hooks/use-market-universe";
import { frontendConfig } from "@/lib/frontend-config";

export function useMarketDashboard() {
  const cacheMs = frontendConfig.cacheHours * 60 * 60 * 1000;
  const marketUniverse = useMarketUniverse({ stockLimit: 80, priceWindowLimit: 60 });
  const marketSummariesQuery = useQuery({
    queryKey: ["market-summaries", "dashboard", "DSE"],
    queryFn: () => listMarketSummaries({ exchange: "DSE", limit: 10 }),
    staleTime: cacheMs,
  });

  const model = buildMarketDashboardModel(
    marketSummariesQuery.data ?? [],
    marketUniverse.stocks,
    marketUniverse.universe,
  );

  return {
    model,
    isLoading: marketSummariesQuery.isLoading || marketUniverse.isLoading,
    isError: marketSummariesQuery.isError || marketUniverse.isError,
    loadedPriceCount: marketUniverse.loadedPriceCount,
    refetch: async () => {
      await Promise.all([marketSummariesQuery.refetch(), marketUniverse.refetch()]);
    },
  };
}
