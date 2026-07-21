"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef } from "react";

import { useMarketDataFreshness } from "@/hooks/market/use-market-data-freshness";
import type { ExchangeCode } from "@/lib/api/backend-api-types";
import {
  reconcileGenerationAwareMarketQueries,
  refreshMarketClientCaches,
  registerMarketCacheQueryClient,
  setMarketFreshnessGeneration,
  syncMarketClientCachesOnBackendUpdate,
  unregisterMarketCacheQueryClient,
} from "@/lib/market/market-cache-coordinator";

/** Watches `/market/freshness` and busts client caches when a dataset is published. */
export function useMarketCacheSyncCoordinator(exchange: ExchangeCode = "DSE") {
  const queryClient = useQueryClient();
  const previousLastSyncedAtRef = useRef<string | null>(null);
  const { data } = useMarketDataFreshness(exchange);

  useEffect(() => {
    registerMarketCacheQueryClient(queryClient);
    return () => unregisterMarketCacheQueryClient(queryClient);
  }, [queryClient]);

  useEffect(() => {
    const current = data?.market_sync_id ?? data?.last_synced_at ?? null;
    if (!current) {
      return;
    }

    setMarketFreshnessGeneration(current);

    const previous = previousLastSyncedAtRef.current;
    if (previous && previous !== current) {
      void syncMarketClientCachesOnBackendUpdate(queryClient);
    } else {
      void reconcileGenerationAwareMarketQueries(queryClient, current);
    }

    previousLastSyncedAtRef.current = current;
  }, [data?.market_sync_id, data?.last_synced_at, queryClient]);
}

export function useMarketCacheRefresh() {
  const queryClient = useQueryClient();

  return useCallback(() => refreshMarketClientCaches(queryClient), [queryClient]);
}
