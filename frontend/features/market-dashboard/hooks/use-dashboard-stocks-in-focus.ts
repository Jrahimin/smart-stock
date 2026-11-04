"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";

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
  const universeQuery = useQuery({
    queryKey: ["market-universe-rows", exchange, UNIVERSE_ROWS_QUERY_KEY_LIMIT, generation],
    queryFn: () => listUniverseRows(exchange, generation),
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
      decisionPublication: universeQuery.data.meta,
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
