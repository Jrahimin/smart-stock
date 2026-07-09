"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";

import type { ExchangeCode } from "@/lib/api/backend-api-types";
import type { SectorContextDto } from "@/lib/api/stock-details-api";
import type { StockWorkspaceDto } from "@/lib/api/stock-decision-support-types";
import { getStockWorkspace } from "@/lib/api/stock-details-api";
import { buildStockDecisionViewModel } from "@/features/stock-workspace/view-models/stock-decision-view-model";
import { buildFundamentalsViewModel } from "@/features/stock-workspace/view-models/fundamentals-view-model";
import {
  buildEmptyStockWorkspaceModel,
  buildStockWorkspaceModel,
  type StockWorkspaceModel,
} from "@/features/stock-workspace/view-models/stock-workspace-view-model";
import { STOCK_DETAIL_STALE_TIME_MS } from "@/lib/seo/stock-detail-cache";

export type StockWorkspaceLoadState = "loading" | "loaded" | "notFound" | "error";

type UseStockWorkspaceOptions = {
  exchange: ExchangeCode;
  symbol: string;
  sectorContext?: SectorContextDto | null;
  initialWorkspace?: StockWorkspaceDto | null;
};

export function useStockWorkspace({
  exchange,
  symbol,
  sectorContext,
  initialWorkspace = null,
}: UseStockWorkspaceOptions) {
  const workspaceQuery = useQuery({
    queryKey: ["stock-workspace", exchange, symbol],
    queryFn: () => getStockWorkspace(exchange, symbol),
    initialData: initialWorkspace ?? undefined,
    initialDataUpdatedAt: initialWorkspace ? Date.now() : undefined,
    staleTime: STOCK_DETAIL_STALE_TIME_MS,
    retry: false,
  });

  const loadState: StockWorkspaceLoadState = useMemo(() => {
    if (workspaceQuery.isLoading && !workspaceQuery.data) {
      return "loading";
    }
    if (workspaceQuery.isError && !workspaceQuery.data) {
      return "error";
    }
    if (!workspaceQuery.data?.stock) {
      return "notFound";
    }
    return "loaded";
  }, [workspaceQuery.data, workspaceQuery.isError, workspaceQuery.isLoading]);

  const model: StockWorkspaceModel = useMemo(() => {
    if (loadState === "loading") {
      return buildEmptyStockWorkspaceModel({
        symbol,
        exchange,
        name: "Loading…",
      });
    }

    if (loadState === "notFound" || !workspaceQuery.data?.stock) {
      return buildEmptyStockWorkspaceModel({
        symbol,
        exchange,
        name: "Stock not found",
      });
    }

    return buildStockWorkspaceModel(workspaceQuery.data.stock, workspaceQuery.data.prices ?? [], {
      decisionSupport: workspaceQuery.data.decision_support,
    });
  }, [exchange, loadState, symbol, workspaceQuery.data]);

  const decisionModel = useMemo(
    () => buildStockDecisionViewModel(workspaceQuery.data?.decision_support),
    [workspaceQuery.data?.decision_support],
  );

  const fundamentalsModel = useMemo(
    () =>
      buildFundamentalsViewModel(
        decisionModel,
        workspaceQuery.data?.fundamentals_snapshot ?? null,
        sectorContext,
        model.intelligence?.latestPrice ?? null,
      ),
    [decisionModel, model.intelligence?.latestPrice, sectorContext, workspaceQuery.data?.fundamentals_snapshot],
  );

  return {
    model,
    decisionModel,
    fundamentalsModel,
    decisionRaw: workspaceQuery.data?.decision_support ?? null,
    loadState,
    isLoading: loadState === "loading",
    isDecisionLoading: loadState === "loading",
    isError: loadState === "error",
    isDecisionError: loadState === "error",
    isNotFound: loadState === "notFound",
  };
}
