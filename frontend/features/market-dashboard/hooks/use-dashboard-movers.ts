"use client";

import { useQuery } from "@tanstack/react-query";

import { getDashboardMovers } from "@/lib/api/market-dashboard-api";
import type { ExchangeCode } from "@/lib/api/backend-api-types";

type UseDashboardMoversOptions = {
  exchange?: ExchangeCode;
  staleTimeMs: number;
  refetchIntervalMs?: number | false;
};

export function useDashboardMovers({
  exchange = "DSE",
  staleTimeMs,
  refetchIntervalMs = false,
}: UseDashboardMoversOptions) {
  return useQuery({
    queryKey: ["dashboard", "movers", exchange],
    queryFn: () => getDashboardMovers(exchange),
    staleTime: staleTimeMs,
    refetchInterval: refetchIntervalMs,
  });
}
