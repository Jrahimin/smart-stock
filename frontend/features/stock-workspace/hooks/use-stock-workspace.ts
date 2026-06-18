"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";

import type { ExchangeCode } from "@/lib/api/backend-api-types";
import { getStockWorkspace } from "@/lib/api/stock-details-api";
import { buildStockDecisionViewModel } from "@/features/stock-workspace/view-models/stock-decision-view-model";
import { buildFundamentalsViewModel } from "@/features/stock-workspace/view-models/fundamentals-view-model";
import { buildStockWorkspaceModel } from "@/features/stock-workspace/view-models/stock-workspace-view-model";
import { useMarketDataFreshness } from "@/hooks/market/use-market-data-freshness";
import { getMarketStaleTimeMs } from "@/lib/market/market-cache-policy";

export function useStockWorkspace(exchange: ExchangeCode, symbol: string) {
  const freshnessQuery = useMarketDataFreshness(exchange);
  const staleTimeMs = getMarketStaleTimeMs(freshnessQuery.data);

  const workspaceQuery = useQuery({
    queryKey: ["stock-workspace", exchange, symbol],
    queryFn: () => getStockWorkspace(exchange, symbol),
    staleTime: staleTimeMs,
    retry: false,
  });

  const model = useMemo(
    () => buildStockWorkspaceModel(workspaceQuery.data?.stock ?? null, workspaceQuery.data?.prices ?? []),
    [workspaceQuery.data],
  );
  const decisionModel = useMemo(
    () => buildStockDecisionViewModel(workspaceQuery.data?.decision_support),
    [workspaceQuery.data?.decision_support],
  );
  const fundamentalsModel = useMemo(
    () => buildFundamentalsViewModel(decisionModel, workspaceQuery.data?.fundamentals_snapshot ?? null),
    [decisionModel, workspaceQuery.data?.fundamentals_snapshot],
  );

  return {
    model,
    decisionModel,
    fundamentalsModel,
    decisionRaw: workspaceQuery.data?.decision_support ?? null,
    isLoading: workspaceQuery.isLoading,
    isDecisionLoading: workspaceQuery.isLoading,
    isError: workspaceQuery.isError,
    isDecisionError: workspaceQuery.isError,
  };
}
