"use client";

import { freshnessGenerationToken, marketUniverseQueryKey } from "@/lib/market/market-generation";
import { useCurrentEntryBoundary } from "@/hooks/market/use-current-entry-boundary";

import { useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import type { ExchangeCode } from "@/lib/api/backend-api-types";
import { listUniverseRows } from "@/lib/api/market-universe-api";
import {
  buildRelatedStocksGroups,
  hasRelatedStockResults,
  resolveRelatedStocksCta,
} from "@/features/stock-workspace/view-models/related-stocks-view-model";
import { useMarketDataFreshness } from "@/hooks/market/use-market-data-freshness";
import { getMarketStaleTimeMs } from "@/lib/market/market-cache-policy";
import { mapUniverseRowToListRow } from "@/lib/market/universe-row-mapper";
import type { StockIntelligenceModel } from "@/lib/market/market-intelligence-types";
import {
  isUniverseCacheWarming,
  shouldRetryUniverseCache,
  UNIVERSE_CACHE_WARM_RETRY_DELAY_MS,
} from "@/lib/market/universe-cache-retry";

type UseRelatedStocksOptions = {
  exchange: ExchangeCode;
  currentStock: StockIntelligenceModel | null;
  sectorLabel: string;
  enabled: boolean;
};

export function useRelatedStocks({ exchange, currentStock, sectorLabel, enabled }: UseRelatedStocksOptions) {
  const freshnessQuery = useMarketDataFreshness(exchange);
  const queryClient = useQueryClient();
  const staleTimeMs = getMarketStaleTimeMs(freshnessQuery.data);
  const generation = freshnessGenerationToken(freshnessQuery.data);
  const queryKey = marketUniverseQueryKey(exchange, generation);
  const active = enabled && currentStock !== null;

  const universeQuery = useQuery({
    queryKey,
    queryFn: () => listUniverseRows(exchange, generation, queryClient.getQueryData(queryKey) !== undefined),
    enabled: active,
    staleTime: staleTimeMs,
    refetchOnMount: false,
    retry: shouldRetryUniverseCache,
    retryDelay: () => UNIVERSE_CACHE_WARM_RETRY_DELAY_MS,
  });
  const isWarmingUp = isUniverseCacheWarming(
    universeQuery.error ?? universeQuery.failureReason,
  );

  const boundedData = useCurrentEntryBoundary(universeQuery.data, freshnessQuery.isError ? undefined : freshnessQuery.data, queryKey, undefined, active);
  const groups = useMemo(() => {
    const rows = boundedData?.rows;
    if (!currentStock || !rows?.length) {
      return [];
    }

    const universe = rows.map((row) => mapUniverseRowToListRow(row));
    return buildRelatedStocksGroups(currentStock, universe);
  }, [currentStock, boundedData?.rows]);

  const cta = useMemo(() => resolveRelatedStocksCta(sectorLabel, groups), [groups, sectorLabel]);

  return {
    groups,
    cta,
    hasResults: hasRelatedStockResults(groups),
    isLoading: enabled && universeQuery.isLoading,
    isError: enabled && universeQuery.isError && !isWarmingUp,
    isWarmingUp: enabled && isWarmingUp,
  };
}
