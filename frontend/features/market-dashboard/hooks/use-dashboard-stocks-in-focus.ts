"use client";

import { useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMarketDataFreshness } from "@/hooks/market/use-market-data-freshness";
import { useCurrentEntryBoundary } from "@/hooks/market/use-current-entry-boundary";

import { mapUniverseRowsToSignalFeed } from "@/features/market-dashboard/view-models/dashboard-sections-mapper";
import { listUniverseRows } from "@/lib/api/market-universe-api";
import type { ExchangeCode } from "@/lib/api/backend-api-types";
import type { SignalFeedItemModel } from "@/features/market-dashboard/types/market-dashboard-types";
import type { DecisionPublication } from "@/components/ui/market-publication-label";
import {
  isUniverseCacheWarming,
  shouldRetryUniverseCache,
  UNIVERSE_CACHE_WARM_RETRY_DELAY_MS,
} from "@/lib/market/universe-cache-retry";

type UseDashboardSectionOptions = {
  exchange?: ExchangeCode;
  generation: string;
  staleTimeMs: number;
  refetchIntervalMs?: number | false;
  enabled?: boolean;
};

export type DashboardStocksInFocusQueryData = {
  signals: SignalFeedItemModel[];
  evaluatedCount: number;
  decisionPublication: DecisionPublication;
};

const UNIVERSE_ROWS_QUERY_KEY_LIMIT = 500;

export function useDashboardStocksInFocus({
  exchange = "DSE",
  generation,
  staleTimeMs,
  refetchIntervalMs = false,
  enabled = true,
}: UseDashboardSectionOptions) {
  const client = useQueryClient();
  const freshness = useMarketDataFreshness(exchange);
  const universeQuery = useQuery({
    queryKey: ["market-universe-rows", exchange, UNIVERSE_ROWS_QUERY_KEY_LIMIT, generation],
    queryFn: ({ queryKey }) => listUniverseRows(exchange, generation, client.getQueryData(queryKey) !== undefined),
    staleTime: staleTimeMs,
    refetchInterval: refetchIntervalMs,
    enabled,
    retry: shouldRetryUniverseCache,
    retryDelay: () => UNIVERSE_CACHE_WARM_RETRY_DELAY_MS,
  });
  const boundedData = useCurrentEntryBoundary(universeQuery.data, freshness.isError ? undefined : freshness.data, ["market-universe-rows", exchange, UNIVERSE_ROWS_QUERY_KEY_LIMIT, generation]);

  const data = useMemo((): DashboardStocksInFocusQueryData | undefined => {
    if (!boundedData?.rows) {
      return undefined;
    }

    return {
      signals: mapUniverseRowsToSignalFeed(boundedData.rows),
      evaluatedCount: boundedData.rows.filter((row) => row.decision !== null).length,
      decisionPublication: boundedData.meta,
    };
  }, [boundedData]);

  return {
    ...universeQuery,
    data,
    isWarmingUp: isUniverseCacheWarming(
      universeQuery.error ?? universeQuery.failureReason,
    ),
  };
}
