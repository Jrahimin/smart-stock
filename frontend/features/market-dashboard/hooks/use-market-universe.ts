"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";

import { listMarketPriceWindows } from "@/lib/api/market-data-api";
import { clearBackendApiCache } from "@/lib/api/backend-api-client";
import { listStocks } from "@/lib/api/stocks-api";
import { frontendConfig } from "@/lib/frontend-config";
import { buildStockIntelligence } from "@/lib/market/market-intelligence";

const DEFAULT_MARKET_UNIVERSE_LIMIT = 80;
const DEFAULT_PRICE_WINDOW_LIMIT = 90;

type UseMarketUniverseOptions = {
  stockLimit?: number;
  priceWindowLimit?: number;
};

export function useMarketUniverse(options: UseMarketUniverseOptions = {}) {
  const stockLimit = options.stockLimit ?? DEFAULT_MARKET_UNIVERSE_LIMIT;
  const priceWindowLimit = options.priceWindowLimit ?? DEFAULT_PRICE_WINDOW_LIMIT;
  const cacheMs = frontendConfig.cacheHours * 60 * 60 * 1000;
  const stocksQuery = useQuery({
    queryKey: ["stocks", "market-universe-count", "DSE"],
    queryFn: () => listStocks({ exchange: "DSE", is_active: true, limit: 500 }),
    staleTime: cacheMs,
  });
  const priceWindowsQuery = useQuery({
    queryKey: ["market-price-windows", "DSE", stockLimit, priceWindowLimit, "decision-v2"],
    queryFn: () => listMarketPriceWindows({ exchange: "DSE", limit: stockLimit, price_window_limit: priceWindowLimit }),
    staleTime: cacheMs,
  });

  const priceWindows = priceWindowsQuery.data ?? [];
  const stocks = stocksQuery.data ?? priceWindows.map((item) => item.stock);

  const universe = useMemo(
    () =>
      priceWindows
        .map((item) => {
          const intelligence = buildStockIntelligence(item.stock, item.prices);
          if (!intelligence) {
            return null;
          }
          return { ...intelligence, traderDecision: item.trader_decision ?? null };
        })
        .filter((stock) => stock !== null),
    [priceWindows],
  );

  return {
    stocks,
    universe,
    isLoading: stocksQuery.isLoading || priceWindowsQuery.isLoading,
    isError: stocksQuery.isError || priceWindowsQuery.isError,
    loadedPriceCount: priceWindows.length,
    refetch: async () => {
      await clearBackendApiCache();
      await Promise.all([stocksQuery.refetch(), priceWindowsQuery.refetch()]);
    },
  };
}
