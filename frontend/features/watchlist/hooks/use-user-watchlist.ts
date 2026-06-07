"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";

import { useAuth } from "@/features/auth/context/auth-context";
import type { BackendUserWatchlistDto } from "@/lib/api/backend-api-types";
import { getWatchlistSummary, listWatchlistItems } from "@/lib/api/watchlist-api";

export function useUserWatchlist() {
  const { user, isAuthenticated } = useAuth();
  const userId = user?.id ?? "anonymous";

  const itemsQuery = useQuery({
    queryKey: ["watchlist", "items", userId],
    queryFn: () => listWatchlistItems({ limit: 500 }),
    enabled: isAuthenticated,
    staleTime: 30_000,
  });

  const summaryQuery = useQuery({
    queryKey: ["watchlist", "summary", userId],
    queryFn: getWatchlistSummary,
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
