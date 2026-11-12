"use client";

import { freshnessGenerationToken } from "@/lib/market/market-generation";
import { setCurrentMarketFreshness } from "@/lib/market/market-freshness-registry";
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
  const previousToken = useRef<string | null>(null);
  const { data } = useMarketDataFreshness(exchange);
  const current = freshnessGenerationToken(data);

  useEffect(() => { setCurrentMarketFreshness(data); }, [data]);

  useEffect(() => {
    registerMarketCacheQueryClient(queryClient);
    return () => unregisterMarketCacheQueryClient(queryClient);
  }, [queryClient]);

  useEffect(() => {
    if (!current) {
      return;
    }

    setMarketFreshnessGeneration(current);

    const previous = previousToken.current;
    if (previous && previous !== current) {
      void syncMarketClientCachesOnBackendUpdate(queryClient);
    } else {
      void reconcileGenerationAwareMarketQueries(queryClient, current);
    }

    previousToken.current = current;
  }, [current, queryClient]);
}

export function useMarketCacheRefresh() {
  const queryClient = useQueryClient();

  return useCallback(() => refreshMarketClientCaches(queryClient), [queryClient]);
}
