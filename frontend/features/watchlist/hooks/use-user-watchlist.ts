"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";

import { useMarketDataFreshness } from "@/hooks/market/use-market-data-freshness";
import { freshnessGenerationToken } from "@/lib/market/market-generation";
import { assertBackendAuthSession, getBackendAuthSessionVersion } from "@/lib/api/backend-api-client";
import { useAuth } from "@/features/auth/context/auth-context";
import type { BackendUserWatchlistDto } from "@/lib/api/backend-api-types";
import { getWatchlistSummary, listWatchlistItems } from "@/lib/api/watchlist-api";

export function useUserWatchlist() {
  const { user, isAuthenticated } = useAuth();
  const userId = user?.id ?? "anonymous";
  const sessionVersion = getBackendAuthSessionVersion();
  const freshness = useMarketDataFreshness("DSE");
  const generation = freshnessGenerationToken(freshness.data) ?? "unknown";

  const itemsQuery = useQuery({
    queryKey: ["watchlist", "items", userId, generation],
    queryFn: () => { assertBackendAuthSession(sessionVersion); return listWatchlistItems({ limit: 500 }); },
    placeholderData: (previous, previousQuery) => previousQuery?.queryKey[2] === userId ? previous : undefined,
    refetchInterval: Math.max(30_000, (freshness.data?.dashboard_cache_ttl_seconds ?? 120) * 1000),
    enabled: isAuthenticated,
    staleTime: 30_000,
  });

  const summaryQuery = useQuery({
    queryKey: ["watchlist", "summary", userId],
    queryFn: () => { assertBackendAuthSession(sessionVersion); return getWatchlistSummary(); },
    enabled: isAuthenticated,
    staleTime: 30_000,
  });

  const watchedStockIds = useMemo(
    () => new Set((itemsQuery.data ?? []).map((item) => item.stock_id)),
    [itemsQuery.data],
  );

  const holdingStockIds = useMemo(
    () => new Set((itemsQuery.data ?? []).filter((item) => item.is_holding).map((item) => item.stock_id)),
    [itemsQuery.data],
  );

  const itemsByStockId = useMemo(() => {
    const map = new Map<string, BackendUserWatchlistDto>();
    for (const item of itemsQuery.data ?? []) {
      map.set(item.stock_id, item);
    }
    return map;
  }, [itemsQuery.data]);

  return {
    membershipReady: itemsQuery.data !== undefined,
    membershipIsLoading: itemsQuery.isLoading,
    membershipIsError: itemsQuery.isError,
    items: itemsQuery.data ?? [],
    summary: summaryQuery.data,
    watchedStockIds,
    holdingStockIds,
    itemsByStockId,
    isLoading: itemsQuery.isLoading || summaryQuery.isLoading,
    isError: itemsQuery.isError || summaryQuery.isError,
    refetch: async () => {
      await Promise.all([itemsQuery.refetch(), summaryQuery.refetch()]);
    },
  };
}
