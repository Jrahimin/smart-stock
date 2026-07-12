"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";

import type { ExchangeCode } from "@/lib/api/backend-api-types";
import { listUniverseRows } from "@/lib/api/market-universe-api";
import {
  buildRelatedStocksGroups,
  hasRelatedStockResults,
  resolveRelatedStocksCta,
} from "@/features/stock-workspace/view-models/related-stocks-view-model";
import { useMarketDataFreshness } from "@/hooks/market/use-market-data-freshness";
import { getMarketStaleTimeMs } from "@/lib/market/market-cache-policy";
import { mapUniverseRowToListRow } from "@/lib/market/universe-row-mapper";
import type { StockIntelligenceModel } from "@/lib/market/market-intelligence-types";

type UseRelatedStocksOptions = {
  exchange: ExchangeCode;
  currentStock: StockIntelligenceModel | null;
  sectorLabel: string;
  enabled: boolean;
};

export function useRelatedStocks({ exchange, currentStock, sectorLabel, enabled }: UseRelatedStocksOptions) {
  const freshnessQuery = useMarketDataFreshness(exchange);
  const staleTimeMs = getMarketStaleTimeMs(freshnessQuery.data);

  const universeQuery = useQuery({
    queryKey: ["market-universe-rows", exchange, 500],
    queryFn: () => listUniverseRows(exchange),
    enabled: enabled && currentStock !== null,
    staleTime: staleTimeMs,
    refetchOnMount: false,
  });

  const groups = useMemo(() => {
    const rows = universeQuery.data?.rows;
    if (!currentStock || !rows?.length) {
      return [];
    }

    const universe = rows.map((row) => mapUniverseRowToListRow(row));
    return buildRelatedStocksGroups(currentStock, universe);
  }, [currentStock, universeQuery.data?.rows]);

  const cta = useMemo(() => resolveRelatedStocksCta(sectorLabel, groups), [groups, sectorLabel]);

  return {
    groups,
    cta,
    hasResults: hasRelatedStockResults(groups),
    isLoading: enabled && universeQuery.isLoading,
    isError: enabled && universeQuery.isError,
  };
}
