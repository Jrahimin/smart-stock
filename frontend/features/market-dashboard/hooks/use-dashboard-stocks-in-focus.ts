"use client";

import { useQuery } from "@tanstack/react-query";

import { mapUniverseRowsToSignalFeed } from "@/features/market-dashboard/view-models/dashboard-sections-mapper";
import { BackendApiError } from "@/lib/api/backend-api-client";
import { listUniverseRows } from "@/lib/api/market-universe-api";
import type { ExchangeCode } from "@/lib/api/backend-api-types";
import type { SignalFeedItemModel } from "@/features/market-dashboard/types/market-dashboard-types";

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

const UNIVERSE_CACHE_WARM_MAX_RETRIES = 20;
const UNIVERSE_CACHE_WARM_RETRY_DELAY_MS = 2000;

function shouldRetryTraderSignals(failureCount: number, error: Error): boolean {
  if (error instanceof BackendApiError && error.status === 503) {
    return failureCount < UNIVERSE_CACHE_WARM_MAX_RETRIES;
  }
  return failureCount < 1;
}

export function useDashboardStocksInFocus({
  exchange = "DSE",
  staleTimeMs,
  refetchIntervalMs = false,
  enabled = true,
}: UseDashboardSectionOptions) {
  return useQuery({
    queryKey: ["dashboard", "trader-signals", exchange],
    queryFn: async (): Promise<DashboardStocksInFocusQueryData> => {
      const payload = await listUniverseRows(exchange);
      return {
        signals: mapUniverseRowsToSignalFeed(payload.rows),
        evaluatedCount: payload.rows.filter((row) => row.decision !== null).length,
      };
    },
    staleTime: staleTimeMs,
    refetchInterval: refetchIntervalMs,
    enabled,
    retry: shouldRetryTraderSignals,
    retryDelay: () => UNIVERSE_CACHE_WARM_RETRY_DELAY_MS,
  });
}
