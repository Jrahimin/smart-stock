"use client";

import { useQuery } from "@tanstack/react-query";

import { getDashboardOverview } from "@/lib/api/market-dashboard-api";
import type { BackendDashboardOverviewDto, ExchangeCode } from "@/lib/api/backend-api-types";

type UseDashboardOverviewOptions = {
  exchange?: ExchangeCode;
  staleTimeMs: number;
  refetchIntervalMs?: number | false;
  initialData?: BackendDashboardOverviewDto;
  initialDataUpdatedAt?: number;
};

export function useDashboardOverview({
  exchange = "DSE",
  staleTimeMs,
  refetchIntervalMs = false,
  initialData,
  initialDataUpdatedAt,
}: UseDashboardOverviewOptions) {
  return useQuery({
    queryKey: ["dashboard", "overview", exchange],
    queryFn: () => getDashboardOverview(exchange),
    initialData,
    initialDataUpdatedAt,
    staleTime: staleTimeMs,
    refetchInterval: refetchIntervalMs,
  });
}
