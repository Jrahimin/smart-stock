"use client";

import { useQuery } from "@tanstack/react-query";

import { getDashboardMovers } from "@/lib/api/market-dashboard-api";
import type { BackendDashboardMoversDto, ExchangeCode } from "@/lib/api/backend-api-types";

type UseDashboardMoversOptions = {
  exchange?: ExchangeCode;
  staleTimeMs: number;
  refetchIntervalMs?: number | false;
  enabled?: boolean;
  initialData?: BackendDashboardMoversDto;
  initialDataUpdatedAt?: number;
};

export function useDashboardMovers({
  exchange = "DSE",
  staleTimeMs,
  refetchIntervalMs = false,
  enabled = true,
  initialData,
  initialDataUpdatedAt,
}: UseDashboardMoversOptions) {
  return useQuery({
    queryKey: ["dashboard", "movers", exchange],
    queryFn: () => getDashboardMovers(exchange),
    initialData,
    initialDataUpdatedAt,
    staleTime: staleTimeMs,
    refetchInterval: refetchIntervalMs,
    enabled,
  });
}
