"use client";

import { useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

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
import { useCurrentEntryBoundary } from "@/hooks/market/use-current-entry-boundary";
import { getMarketStaleTimeMs, getMarketRefetchIntervalMs } from "@/lib/market/market-cache-policy";
import { STOCK_DETAIL_STALE_TIME_MS } from "@/lib/seo/stock-detail-cache";
import { freshnessGenerationToken, responseMatchesMarketFreshness } from "@/lib/market/market-generation";
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
  const queryClient = useQueryClient();
  const freshnessQuery = useMarketDataFreshness(exchange);
  const staleTimeMs = freshnessQuery.data
    ? getMarketStaleTimeMs(freshnessQuery.data)
    : STOCK_DETAIL_STALE_TIME_MS;
  const generation = freshnessGenerationToken(freshnessQuery.data);
  const alignedInitialWorkspace = initialWorkspace && (
    generation === null || responseMatchesMarketFreshness(initialWorkspace, generation)
  ) ? initialWorkspace : null;

  const workspaceQuery = useQuery({
    queryKey: ["stock-workspace", exchange, symbol, generation ?? "unknown"],
    queryFn: ({ queryKey }) => getStockWorkspace(exchange, symbol, generation, queryClient.getQueryData(queryKey) !== undefined),
    initialData: alignedInitialWorkspace ?? undefined,
    initialDataUpdatedAt: alignedInitialWorkspace ? 0 : undefined,
    staleTime: staleTimeMs,
    refetchInterval: getMarketRefetchIntervalMs(freshnessQuery.data),
    retry: false,
  });
  const workspace = useCurrentEntryBoundary(workspaceQuery.data, freshnessQuery.isError ? undefined : freshnessQuery.data, ["stock-workspace", exchange, symbol, generation ?? "unknown"], { symbol, exchange });

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

  const displayMetrics = workspace?.display_metrics ?? null;

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
      decisionSupport: workspace?.decision_support,
      displayMetrics: workspace?.display_metrics,
    });
  }, [exchange, loadState, symbol, workspaceQuery.data, workspace]);

  const decisionModel = useMemo(
    () => buildStockDecisionViewModel(workspace?.decision_support, locale, displayMetrics),
    [locale, workspace?.decision_support, displayMetrics],
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
    decisionRaw: workspace?.decision_support ?? null,
    displayMetrics,
    workspace: workspace ?? null,
    loadState,
    isLoading: loadState === "loading",
    isDecisionLoading: loadState === "loading",
    isError: loadState === "error",
    isDecisionError: loadState === "error",
    isNotFound: loadState === "notFound",
  };
}
