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
import { useMarketDataFreshness } from "@/hooks/market/use-market-data-freshness";
import { getMarketStaleTimeMs } from "@/lib/market/market-cache-policy";
import { STOCK_DETAIL_STALE_TIME_MS } from "@/lib/seo/stock-detail-cache";
import type { AppLocale } from "@/lib/locale/app-locale";
import { DEFAULT_LOCALE } from "@/lib/locale/app-locale";

export type StockWorkspaceLoadState = "loading" | "loaded" | "notFound" | "error";

type UseStockWorkspaceOptions = {
  exchange: ExchangeCode;
  symbol: string;
  sectorContext?: SectorContextDto | null;
  initialWorkspace?: StockWorkspaceDto | null;
  locale?: AppLocale;
};

export function useStockWorkspace({
  exchange,
  symbol,
  sectorContext,
  initialWorkspace = null,
  locale = DEFAULT_LOCALE,
}: UseStockWorkspaceOptions) {
  const freshnessQuery = useMarketDataFreshness(exchange);
  const staleTimeMs = freshnessQuery.data
    ? getMarketStaleTimeMs(freshnessQuery.data)
    : STOCK_DETAIL_STALE_TIME_MS;

  const workspaceQuery = useQuery({
    queryKey: ["stock-workspace", exchange, symbol],
    queryFn: () => getStockWorkspace(exchange, symbol),
    initialData: initialWorkspace ?? undefined,
    initialDataUpdatedAt: initialWorkspace ? 0 : undefined,
    staleTime: staleTimeMs,
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

  const displayMetrics = workspaceQuery.data?.display_metrics ?? null;

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
      displayMetrics: workspaceQuery.data.display_metrics,
    });
  }, [exchange, loadState, symbol, workspaceQuery.data]);

  const decisionModel = useMemo(
    () => buildStockDecisionViewModel(workspaceQuery.data?.decision_support, locale),
    [locale, workspaceQuery.data?.decision_support],
  );

  const fundamentalsModel = useMemo(
    () =>
      buildFundamentalsViewModel(
        decisionModel,
        workspaceQuery.data?.fundamentals_snapshot ?? null,
        sectorContext,
        displayMetrics?.current_price ?? model.intelligence?.latestPrice ?? null,
        displayMetrics,
      ),
    [
      decisionModel,
      displayMetrics,
      model.intelligence?.latestPrice,
      sectorContext,
      workspaceQuery.data?.fundamentals_snapshot,
    ],
  );

  return {
    model,
    decisionModel,
    fundamentalsModel,
    decisionRaw: workspaceQuery.data?.decision_support ?? null,
    displayMetrics,
    workspace: workspaceQuery.data ?? null,
    loadState,
    isLoading: loadState === "loading",
    isDecisionLoading: loadState === "loading",
    isError: loadState === "error",
    isDecisionError: loadState === "error",
    isNotFound: loadState === "notFound",
  };
}
