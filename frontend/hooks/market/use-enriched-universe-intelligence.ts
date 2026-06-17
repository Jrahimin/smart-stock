"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";

import { useMarketUniverse } from "@/features/market-dashboard/hooks/use-market-universe";
import { useMarketDataFreshness } from "@/hooks/market/use-market-data-freshness";
import { listLatestSignals } from "@/lib/api/signals-api";
import { getMarketStaleTimeMs } from "@/lib/market/market-cache-policy";
import { buildEnrichedIntelligenceMap } from "@/lib/market/universe-intelligence";

type UseEnrichedUniverseIntelligenceOptions = {
  stockLimit?: number;
};

export function useEnrichedUniverseIntelligence(options: UseEnrichedUniverseIntelligenceOptions = {}) {
  const freshnessQuery = useMarketDataFreshness("DSE");
  const staleTimeMs = getMarketStaleTimeMs(freshnessQuery.data);
  const universeQuery = useMarketUniverse({
    stockLimit: options.stockLimit,
    staleTimeMs,
  });

  const persistedSignalsQuery = useQuery({
    queryKey: ["signals", "latest", "persisted"],
    queryFn: () => listLatestSignals(500),
    staleTime: staleTimeMs,
  });

  const intelligenceByStockId = useMemo(
    () => buildEnrichedIntelligenceMap(universeQuery.rows, persistedSignalsQuery.data ?? []),
    [persistedSignalsQuery.data, universeQuery.rows],
  );

  return {
    universe: universeQuery.universe,
    intelligenceByStockId,
    listedStockCount: universeQuery.listedStockCount,
    loadedPriceCount: universeQuery.loadedPriceCount,
    isLoading: universeQuery.isLoading || persistedSignalsQuery.isLoading,
    isError: universeQuery.isError || persistedSignalsQuery.isError,
    refetch: universeQuery.refetch,
  };
}
