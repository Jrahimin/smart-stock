"use client";

import { useQuery } from "@tanstack/react-query";

import { mapTraderDecisionsToSignalFeed } from "@/features/market-dashboard/view-models/dashboard-sections-mapper";
import { fetchDashboardTraderSignals } from "@/lib/api/signals-api";
import type { ExchangeCode } from "@/lib/api/backend-api-types";
import type { SignalFeedItemModel } from "@/features/market-dashboard/types/market-dashboard-types";

type UseDashboardSectionOptions = {
  exchange?: ExchangeCode;
  staleTimeMs: number;
  refetchIntervalMs?: number | false;
  enabled?: boolean;
};

export type DashboardStocksInFocusQueryData = {
  signals: SignalFeedItemModel[];
  evaluatedCount: number;
};

export function useDashboardStocksInFocus({
  exchange = "DSE",
  staleTimeMs,
  refetchIntervalMs = false,
  enabled = true,
}: UseDashboardSectionOptions) {
  return useQuery({
    queryKey: ["dashboard", "trader-signals", exchange],
    queryFn: async (): Promise<DashboardStocksInFocusQueryData> => {
      const payload = await fetchDashboardTraderSignals(exchange);
      return {
        signals: mapTraderDecisionsToSignalFeed(payload.signals),
        evaluatedCount: payload.evaluatedCount,
      };
    },
    staleTime: staleTimeMs,
    refetchInterval: refetchIntervalMs,
    enabled,
  });
}
