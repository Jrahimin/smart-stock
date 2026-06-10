"use client";

import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import type { BackendStockDto } from "@/lib/api/backend-api-types";
import { searchStocks } from "@/lib/api/stocks-api";
import {
  EXPLORER_POPULAR_STOCKS,
  loadRecentStockSearches,
  saveRecentStockSearch,
  type StockSearchPick,
} from "@/lib/stocks/stock-search-config";

function buildStockDetailPath(stock: Pick<BackendStockDto, "exchange" | "symbol">) {
  return `/stocks/${stock.exchange}/${stock.symbol}`;
}

type UseStockSymbolSearchOptions = {
  onFilterTable?: (query: string) => void;
};

export function useStockSymbolSearch(options: UseStockSymbolSearchOptions = {}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [recentSearches, setRecentSearches] = useState<StockSearchPick[]>([]);

  useEffect(() => {
    setRecentSearches(loadRecentStockSearches());
  }, []);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => setDebouncedQuery(query.trim()), 220);
    return () => window.clearTimeout(timeoutId);
  }, [query]);

  const searchQuery = useQuery({
    queryKey: ["stock-symbol-search", debouncedQuery],
    queryFn: () => searchStocks(debouncedQuery, undefined, 12),
    enabled: debouncedQuery.length >= 1,
  });

  const results = searchQuery.data ?? [];

  const exactMatch = useMemo(() => {
    const normalizedQuery = query.trim().toUpperCase();
    if (!normalizedQuery) {
      return null;
    }

    return results.find((stock) => stock.symbol.toUpperCase() === normalizedQuery) ?? null;
  }, [query, results]);

  const rememberStock = useCallback((stock: StockSearchPick) => {
    saveRecentStockSearch(stock);
    setRecentSearches(loadRecentStockSearches());
  }, []);

  const navigateToStock = useCallback(
    (stock: Pick<BackendStockDto, "exchange" | "symbol" | "name">) => {
      rememberStock({ symbol: stock.symbol, exchange: stock.exchange, name: stock.name });
      router.push(buildStockDetailPath(stock));
      setQuery("");
      setDebouncedQuery("");
    },
    [rememberStock, router],
  );

  const applyTableFilter = useCallback(
    (value: string) => {
      options.onFilterTable?.(value);
      setQuery("");
      setDebouncedQuery("");
    },
    [options],
  );

  function submitQuery() {
    const normalizedQuery = query.trim();
    if (!normalizedQuery) {
      return false;
    }

    if (exactMatch) {
      navigateToStock(exactMatch);
      return true;
    }

    if (results.length === 1) {
      navigateToStock(results[0]);
      return true;
    }

    if (options.onFilterTable) {
      applyTableFilter(normalizedQuery);
      return true;
    }

    return false;
  }

  function reset() {
    setQuery("");
    setDebouncedQuery("");
  }

  return {
    query,
    setQuery,
    results,
    recentSearches,
    popularStocks: EXPLORER_POPULAR_STOCKS,
    exactMatch,
    isSearching: searchQuery.isFetching,
    isSearchEnabled: debouncedQuery.length >= 1,
    navigateToStock,
    applyTableFilter,
    submitQuery,
    reset,
  };
}
