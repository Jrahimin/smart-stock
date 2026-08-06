"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

import { useDebouncedValue } from "@/features/wealth/hooks/use-debounced-value";
import type { BackendStockSearchResultDto, ExchangeCode } from "@/lib/api/backend-api-types";
import { searchStocks } from "@/lib/api/stocks-api";

const EMPTY_SEARCH_RESULTS: BackendStockSearchResultDto[] = [];

/** Standard autocomplete debounce — responsive without hammering the API. */
export const STOCK_SEARCH_DEBOUNCE_MS = 200;

/** Stock master rarely changes mid-session; reuse results across typing. */
export const STOCK_SEARCH_STALE_TIME_MS = 60_000;

export type UseDebouncedStockSearchOptions = {
  query: string;
  enabled?: boolean;
  exchange?: ExchangeCode;
  limit?: number;
  debounceMs?: number;
};

export function useDebouncedStockSearch({
  query,
  enabled = true,
  exchange,
  limit = 12,
  debounceMs = STOCK_SEARCH_DEBOUNCE_MS,
}: UseDebouncedStockSearchOptions) {
  const trimmedQuery = query.trim();
  const debouncedQuery = useDebouncedValue(trimmedQuery, debounceMs);
  const isSearchEnabled = enabled && debouncedQuery.length >= 1;

  const searchQuery = useQuery({
    queryKey: ["stocks", "search", exchange ?? "ALL", debouncedQuery, limit],
    queryFn: ({ signal }) => searchStocks(debouncedQuery, exchange, limit, { signal }),
    enabled: isSearchEnabled,
    staleTime: STOCK_SEARCH_STALE_TIME_MS,
    gcTime: 5 * 60_000,
    placeholderData: keepPreviousData,
    refetchOnWindowFocus: false,
  });

  const results = useMemo(
    () => searchQuery.data ?? EMPTY_SEARCH_RESULTS,
    [searchQuery.data],
  );

  return {
    debouncedQuery,
    results,
    isSearching: isSearchEnabled && searchQuery.isFetching,
    isSearchEnabled,
    isError: searchQuery.isError,
  };
}
