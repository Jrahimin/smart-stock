"use client";

import { useQuery } from "@tanstack/react-query";

import type { ExchangeCode } from "@/lib/api/backend-api-types";
import { listDailyPrices } from "@/lib/api/market-data-api";
import { getStockByLookup } from "@/lib/api/stocks-api";
import { buildStockWorkspaceModel } from "@/features/stock-workspace/view-models/stock-workspace-view-model";

export function useStockWorkspace(exchange: ExchangeCode, symbol: string) {
  const stockQuery = useQuery({
    queryKey: ["stock-lookup", exchange, symbol],
    queryFn: () => getStockByLookup(exchange, symbol),
  });

  const pricesQuery = useQuery({
    queryKey: ["daily-prices", "workspace", stockQuery.data?.id],
    queryFn: () => listDailyPrices(stockQuery.data?.id ?? "", { limit: 260 }),
    enabled: Boolean(stockQuery.data?.id),
  });

  return {
    model: buildStockWorkspaceModel(stockQuery.data ?? null, pricesQuery.data ?? []),
    isLoading: stockQuery.isLoading || pricesQuery.isLoading,
    isError: stockQuery.isError || pricesQuery.isError,
  };
}
