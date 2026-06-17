"use client";

import { useQuery } from "@tanstack/react-query";

import { getDashboardOverview } from "@/lib/api/market-dashboard-api";
import type { ExchangeCode } from "@/lib/api/backend-api-types";

type UseDashboardOverviewOptions = {
  exchange?: ExchangeCode;
  staleTimeMs: number;
  refetchIntervalMs?: number | false;
};

export function useDashboardOverview({
  exchange = "DSE",
  staleTimeMs,
  refetchIntervalMs = false,
}: UseDashboardOverviewOptions) {
  return useQuery({
    queryKey: ["dashboard", "overview", exchange],
    queryFn: () => getDashboardOverview(exchange),
    staleTime: staleTimeMs,
    refetchInterval: refetchIntervalMs,
  });
}
