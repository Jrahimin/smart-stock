"use client";

import { useQueries, useQuery } from "@tanstack/react-query";

import type { BackendDailyPriceDto, BackendStockDto } from "@/lib/api/backend-api-types";
import { listDailyPrices } from "@/lib/api/market-data-api";
import { listStocks } from "@/lib/api/stocks-api";
import { buildStockIntelligence } from "@/lib/market/market-intelligence";
import type { StockIntelligenceModel } from "@/lib/market/market-intelligence-types";

const MARKET_UNIVERSE_LIMIT = 160;

export function useMarketUniverse() {
  const stocksQuery = useQuery({
    queryKey: ["stocks", "market-universe", "DSE", MARKET_UNIVERSE_LIMIT],
    queryFn: () => listStocks({ exchange: "DSE", is_active: true, limit: MARKET_UNIVERSE_LIMIT }),
  });

  const stocks = stocksQuery.data ?? [];
  const priceQueries = useQueries({
    queries: stocks.map((stock: BackendStockDto) => ({
      queryKey: ["daily-prices", "latest-window", stock.id],
      queryFn: () => listDailyPrices(stock.id, { limit: 260 }),
      enabled: stocksQuery.isSuccess,
      staleTime: 1000 * 60 * 10,
    })),
  });

  const priceMap = new Map<string, BackendDailyPriceDto[]>();
  priceQueries.forEach((query, index) => {
    priceMap.set(stocks[index]?.id ?? "", query.data ?? []);
  });

  const universe = stocks
    .map((stock) => buildStockIntelligence(stock, priceMap.get(stock.id) ?? []))
    .filter((stock): stock is StockIntelligenceModel => stock !== null);

  return {
    stocks,
    universe,
    isLoading: stocksQuery.isLoading || priceQueries.some((query) => query.isLoading),
    isError: stocksQuery.isError || priceQueries.some((query) => query.isError),
    loadedPriceCount: priceQueries.filter((query) => query.isSuccess).length,
  };
}
