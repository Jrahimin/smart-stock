"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";

import { listUniverseRows } from "@/lib/api/market-universe-api";
import { useMarketCacheRefresh } from "@/hooks/market/use-market-cache-coordinator";
import { useMarketDataFreshness } from "@/hooks/market/use-market-data-freshness";
import { getMarketRefetchIntervalMs, getMarketStaleTimeMs } from "@/lib/market/market-cache-policy";
import { mapUniverseRowToListRow } from "@/lib/market/universe-row-mapper";

const DEFAULT_MARKET_UNIVERSE_LIMIT = 500;

type UseMarketUniverseOptions = {
  stockLimit?: number;
  staleTimeMs?: number;
  refetchIntervalMs?: number | false;
};

/** Loads `ScoredUniverseRow` list via GET /market/universe-rows (shared foundation cache). */
export function useScoredUniverseRows(options: UseMarketUniverseOptions = {}) {
  return useMarketUniverse(options);
}

export function useMarketUniverse(options: UseMarketUniverseOptions = {}) {
  const stockLimit = options.stockLimit ?? DEFAULT_MARKET_UNIVERSE_LIMIT;
  const refreshMarketCaches = useMarketCacheRefresh();
  const freshnessQuery = useMarketDataFreshness("DSE");
  const cacheMs = options.staleTimeMs ?? getMarketStaleTimeMs(freshnessQuery.data);
  const refetchInterval = options.refetchIntervalMs ?? getMarketRefetchIntervalMs(freshnessQuery.data);

  const universeQuery = useQuery({
    queryKey: ["market-universe-rows", "DSE", stockLimit],
    queryFn: () => listUniverseRows("DSE"),
    staleTime: cacheMs,
    refetchInterval,
  });

  const rows = universeQuery.data?.rows ?? [];
  const stocks = useMemo(() => rows.map((row) => row.stock), [rows]);

  const universe = useMemo(
    () => rows.slice(0, stockLimit).map((row) => mapUniverseRowToListRow(row)),
    [rows, stockLimit],
  );

  return {
    stocks,
    rows,
    listedStockCount: universeQuery.data?.meta.listed_stock_count ?? stocks.length,
    universe,
    isLoading: universeQuery.isLoading,
    isError: universeQuery.isError,
    loadedPriceCount: rows.length,
    refetch: refreshMarketCaches,
  };
}
