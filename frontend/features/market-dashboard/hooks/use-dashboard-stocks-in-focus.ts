"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";

import { mapUniverseRowsToSignalFeed } from "@/features/market-dashboard/view-models/dashboard-sections-mapper";
import { listUniverseRows } from "@/lib/api/market-universe-api";
import type { ExchangeCode } from "@/lib/api/backend-api-types";
import type { SignalFeedItemModel } from "@/features/market-dashboard/types/market-dashboard-types";
import {
  isUniverseCacheWarming,
  shouldRetryUniverseCache,
  UNIVERSE_CACHE_WARM_RETRY_DELAY_MS,
} from "@/lib/market/universe-cache-retry";

type UseDashboardSectionOptions = {
  exchange?: ExchangeCode;
  staleTimeMs: number;
  refetchIntervalMs?: number | false;
  enabled?: boolean;
};

export type DashboardStocksInFocusQueryData = {
  signals: SignalFeedItemModel[];
  evaluatedCount: number;
};

const UNIVERSE_ROWS_QUERY_KEY_LIMIT = 500;

export function useDashboardStocksInFocus({
  exchange = "DSE",
  staleTimeMs,
  refetchIntervalMs = false,
  enabled = true,
}: UseDashboardSectionOptions) {
  const universeQuery = useQuery({
    queryKey: ["market-universe-rows", exchange, UNIVERSE_ROWS_QUERY_KEY_LIMIT],
    queryFn: () => listUniverseRows(exchange),
    staleTime: staleTimeMs,
    refetchInterval: refetchIntervalMs,
    enabled,
    retry: shouldRetryUniverseCache,
    retryDelay: () => UNIVERSE_CACHE_WARM_RETRY_DELAY_MS,
  });

  const data = useMemo((): DashboardStocksInFocusQueryData | undefined => {
    if (!universeQuery.data?.rows) {
      return undefined;
    }

    return {
      signals: mapUniverseRowsToSignalFeed(universeQuery.data.rows),
      evaluatedCount: universeQuery.data.rows.filter((row) => row.decision !== null).length,
    };
  }, [universeQuery.data]);

  return {
    ...universeQuery,
    data,
    isWarmingUp: isUniverseCacheWarming(
      universeQuery.error ?? universeQuery.failureReason,
    ),
  };
}
