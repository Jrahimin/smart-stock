"use client";

import { useQuery } from "@tanstack/react-query";

import { getDashboardMarketSentiment } from "@/lib/api/market-dashboard-api";
import type { ExchangeCode } from "@/lib/api/backend-api-types";

type UseDashboardSectionOptions = {
  exchange?: ExchangeCode;
  staleTimeMs: number;
  refetchIntervalMs?: number | false;
  enabled?: boolean;
};

export function useDashboardMarketSentiment({
  exchange = "DSE",
  staleTimeMs,
  refetchIntervalMs = false,
  enabled = true,
}: UseDashboardSectionOptions) {
  return useQuery({
    queryKey: ["dashboard", "market-sentiment", exchange],
    queryFn: () => getDashboardMarketSentiment(exchange),
    staleTime: staleTimeMs,
    refetchInterval: refetchIntervalMs,
    enabled,
  });
}
