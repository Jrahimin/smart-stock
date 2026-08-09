"use client";

import { useQuery } from "@tanstack/react-query";

import { getDashboardMarketSentiment } from "@/lib/api/market-dashboard-api";
import type { ExchangeCode } from "@/lib/api/backend-api-types";
import { dashboardQueryKey } from "./dashboard-query-key";

type UseDashboardSectionOptions = {
  exchange?: ExchangeCode;
  generation: string;
  staleTimeMs: number;
  refetchIntervalMs?: number | false;
  enabled?: boolean;
};

export function useDashboardMarketSentiment({
  exchange = "DSE",
  generation,
  staleTimeMs,
  refetchIntervalMs = false,
  enabled = true,
}: UseDashboardSectionOptions) {
  return useQuery({
    queryKey: dashboardQueryKey("market-sentiment", exchange, generation),
    queryFn: () => getDashboardMarketSentiment(exchange, generation),
    staleTime: staleTimeMs,
    refetchInterval: refetchIntervalMs,
    enabled,
  });
}
