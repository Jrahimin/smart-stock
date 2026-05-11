"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";

import { listMarketPriceWindows } from "@/lib/api/market-data-api";
import { clearBackendApiCache } from "@/lib/api/backend-api-client";
import { listLatestSignals } from "@/lib/api/signals-api";
import { listStocks } from "@/lib/api/stocks-api";
import { frontendConfig } from "@/lib/frontend-config";
import { applyPersistedSignalEnrichment, buildStockIntelligence } from "@/lib/market/market-intelligence";

const DEFAULT_MARKET_UNIVERSE_LIMIT = 80;
const DEFAULT_PRICE_WINDOW_LIMIT = 30;
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
    queryKey: ["market-price-windows", "DSE", stockLimit, priceWindowLimit],
    queryFn: () => listMarketPriceWindows({ exchange: "DSE", limit: stockLimit, price_window_limit: priceWindowLimit }),
    staleTime: cacheMs,
  });
  const latestSignalsQuery = useQuery({
    enabled: frontendConfig.features.backendSignalEnrichment,
    queryKey: ["signals", "latest", "market-universe", stockLimit],
    queryFn: () => listLatestSignals(stockLimit),
    staleTime: cacheMs,
  });

  const priceWindows = priceWindowsQuery.data ?? [];
  const stocks = stocksQuery.data ?? priceWindows.map((item) => item.stock);
  const persistedSignalsByStockId = useMemo(
    () => new Map((latestSignalsQuery.data ?? []).map((signal) => [signal.stock_id, signal])),
    [latestSignalsQuery.data],
  );

  const universe = useMemo(
    () =>
      priceWindows
        .map((item) => buildStockIntelligence(item.stock, item.prices))
        .filter((stock) => stock !== null)
        .map((stock) => applyPersistedSignalEnrichment(stock, persistedSignalsByStockId.get(stock.stock.id))),
    [persistedSignalsByStockId, priceWindows],
  );

  return {
    stocks,
    universe,
    isLoading: stocksQuery.isLoading || priceWindowsQuery.isLoading || latestSignalsQuery.isLoading,
    isError: stocksQuery.isError || priceWindowsQuery.isError,
    loadedPriceCount: priceWindows.length,
    refetch: async () => {
      await clearBackendApiCache();
      await Promise.all([
        stocksQuery.refetch(),
        priceWindowsQuery.refetch(),
        frontendConfig.features.backendSignalEnrichment ? latestSignalsQuery.refetch() : Promise.resolve(),
      ]);
    },
  };
}
