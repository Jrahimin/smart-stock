"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef } from "react";

import { useMarketDataFreshness } from "@/hooks/market/use-market-data-freshness";
import type { ExchangeCode } from "@/lib/api/backend-api-types";
import {
  invalidateMarketTanStackQueries,
  refreshMarketClientCaches,
} from "@/lib/market/market-cache-coordinator";

/** Watches `/market/freshness` and busts client caches when `last_synced_at` advances. */
export function useMarketCacheSyncCoordinator(exchange: ExchangeCode = "DSE") {
  const queryClient = useQueryClient();
  const previousLastSyncedAtRef = useRef<string | null>(null);
  const { data } = useMarketDataFreshness(exchange);

  useEffect(() => {
    const current = data?.last_synced_at ?? null;
    if (!current) {
      return;
    }

    const previous = previousLastSyncedAtRef.current;
    if (previous && previous !== current) {
      void invalidateMarketTanStackQueries(queryClient);
    }

    previousLastSyncedAtRef.current = current;
  }, [data?.last_synced_at, queryClient]);
}

export function useMarketCacheRefresh() {
  const queryClient = useQueryClient();

  return useCallback(() => refreshMarketClientCaches(queryClient), [queryClient]);
}
