"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";

import type { ExchangeCode } from "@/lib/api/backend-api-types";
import { listDailyPrices } from "@/lib/api/market-data-api";
import { getStockDecisionSupport } from "@/lib/api/stock-details-api";
import { getStockByLookup } from "@/lib/api/stocks-api";
import { buildStockDecisionViewModel } from "@/features/stock-workspace/view-models/stock-decision-view-model";
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

  const decisionQuery = useQuery({
    queryKey: ["stock-decision-support", exchange, symbol],
    queryFn: () => getStockDecisionSupport(exchange, symbol),
    enabled: Boolean(stockQuery.data?.id),
    retry: false,
  });

  const model = useMemo(
    () => buildStockWorkspaceModel(stockQuery.data ?? null, pricesQuery.data ?? []),
    [pricesQuery.data, stockQuery.data],
  );
  const decisionModel = useMemo(
    () => buildStockDecisionViewModel(decisionQuery.data),
    [decisionQuery.data],
  );

  return {
    model,
    decisionModel,
    decisionRaw: decisionQuery.data ?? null,
    isLoading: stockQuery.isLoading || pricesQuery.isLoading,
    isDecisionLoading: decisionQuery.isLoading,
    isError: stockQuery.isError || pricesQuery.isError,
    isDecisionError: decisionQuery.isError,
  };
}
