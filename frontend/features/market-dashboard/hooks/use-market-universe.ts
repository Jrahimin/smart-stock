"use client";

import { PRICE_BASIS_CONTRACT } from "@/lib/market/entry-contract-capability";

import { freshnessGenerationToken } from "@/lib/market/market-generation";
import { useCurrentEntryBoundary } from "@/hooks/market/use-current-entry-boundary";
import { useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { listUniverseRows } from "@/lib/api/market-universe-api";
import { useMarketCacheRefresh } from "@/hooks/market/use-market-cache-coordinator";
import { useMarketDataFreshness } from "@/hooks/market/use-market-data-freshness";
import { getMarketRefetchIntervalMs, getMarketStaleTimeMs } from "@/lib/market/market-cache-policy";
import { mapUniverseRowToListRow } from "@/lib/market/universe-row-mapper";
import type { BackendScoredUniverseRowDto } from "@/lib/api/backend-api-types";
import {
  isUniverseCacheWarming,
  shouldRetryUniverseCache,
  UNIVERSE_CACHE_WARM_RETRY_DELAY_MS,
} from "@/lib/market/universe-cache-retry";

const DEFAULT_MARKET_UNIVERSE_LIMIT = 500;
const EMPTY_UNIVERSE_ROWS: BackendScoredUniverseRowDto[] = [];

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
  const queryClient = useQueryClient();
  const stockLimit = options.stockLimit ?? DEFAULT_MARKET_UNIVERSE_LIMIT;
  const refreshMarketCaches = useMarketCacheRefresh();
  const freshnessQuery = useMarketDataFreshness("DSE");
  const cacheMs = options.staleTimeMs ?? getMarketStaleTimeMs(freshnessQuery.data);
  const refetchInterval = options.refetchIntervalMs ?? getMarketRefetchIntervalMs(freshnessQuery.data);
  const generation = freshnessGenerationToken(freshnessQuery.data) ?? "unavailable";

  const universeQuery = useQuery({
    queryKey: ["market-universe-rows", PRICE_BASIS_CONTRACT, "DSE", stockLimit, generation],
    queryFn: ({ queryKey }) => listUniverseRows("DSE", freshnessGenerationToken(freshnessQuery.data), queryClient.getQueryData(queryKey) !== undefined),
    staleTime: cacheMs,
    refetchInterval,
    retry: shouldRetryUniverseCache,
    retryDelay: () => UNIVERSE_CACHE_WARM_RETRY_DELAY_MS,
  });
  const isWarmingUp = isUniverseCacheWarming(
    universeQuery.error ?? universeQuery.failureReason,
  );

  const currentData = useCurrentEntryBoundary(universeQuery.data, freshnessQuery.isError ? undefined : freshnessQuery.data, ["market-universe-rows", PRICE_BASIS_CONTRACT, "DSE", stockLimit, generation]);
  const rows = currentData?.rows ?? EMPTY_UNIVERSE_ROWS;
  const stocks = useMemo(() => rows.map((row) => row.stock), [rows]);

  const universe = useMemo(
    () => rows.slice(0, stockLimit).map((row) => mapUniverseRowToListRow(row, currentData?.meta.decision_session_date ?? currentData?.meta.session_trade_date)),
    [rows, stockLimit, currentData?.meta.decision_session_date, currentData?.meta.session_trade_date],
  );

  return {
    stocks,
    rows,
    listedStockCount: universeQuery.data?.meta.listed_stock_count ?? stocks.length,
    universe,
    isLoading: universeQuery.isLoading,
    isError: universeQuery.isError && !isWarmingUp,
    isWarmingUp,
    isUpdating: universeQuery.data?.meta.decision_status === "UPDATING",
    decisionDate: universeQuery.data?.meta.decision_session_date,
    decisionPublication: universeQuery.data?.meta ?? (freshnessQuery.data?.decision_status === "UNAVAILABLE" ? freshnessQuery.data : undefined),
    loadedPriceCount: rows.length,
    refetch: refreshMarketCaches,
  };
}
