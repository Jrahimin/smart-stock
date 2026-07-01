"use client";

import { useQuery } from "@tanstack/react-query";

import { getDashboardMovers } from "@/lib/api/market-dashboard-api";
import type { ExchangeCode } from "@/lib/api/backend-api-types";

type UseDashboardMoversOptions = {
  exchange?: ExchangeCode;
  staleTimeMs: number;
  refetchIntervalMs?: number | false;
  enabled?: boolean;
};

export function useDashboardMovers({
  exchange = "DSE",
  staleTimeMs,
  refetchIntervalMs = false,
  enabled = true,
}: UseDashboardMoversOptions) {
  return useQuery({
    queryKey: ["dashboard", "movers", exchange],
    queryFn: () => getDashboardMovers(exchange),
    staleTime: staleTimeMs,
    refetchInterval: refetchIntervalMs,
    enabled,
  });
}
