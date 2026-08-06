"use client";

import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import { useDebouncedStockSearch } from "@/hooks/stocks/use-debounced-stock-search";
import type { BackendStockDto } from "@/lib/api/backend-api-types";
import {
  EXPLORER_POPULAR_STOCKS,
  loadRecentStockSearches,
  saveRecentStockSearch,
  type StockSearchPick,
} from "@/lib/stocks/stock-search-config";
import { buildStockDetailPath } from "@/lib/seo/stock-page-seo";

type UseStockSymbolSearchOptions = {
  onFilterTable?: (query: string) => void;
};

export function useStockSymbolSearch(options: UseStockSymbolSearchOptions = {}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [recentSearches, setRecentSearches] = useState<StockSearchPick[]>([]);

  useEffect(() => {
    setRecentSearches(loadRecentStockSearches());
  }, []);

  const { results, isSearching, isSearchEnabled, debouncedQuery } = useDebouncedStockSearch({
    query,
  });

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
      router.push(buildStockDetailPath(stock.exchange, stock.symbol));
      setQuery("");
    },
    [rememberStock, router],
  );

  const applyTableFilter = useCallback(
    (value: string) => {
      options.onFilterTable?.(value);
      setQuery("");
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
  }

  return {
    query,
    setQuery,
    results,
    recentSearches,
    popularStocks: EXPLORER_POPULAR_STOCKS,
    exactMatch,
    isSearching,
    isSearchEnabled,
    debouncedQuery,
    navigateToStock,
    applyTableFilter,
    submitQuery,
    reset,
  };
}
