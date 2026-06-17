"use client";

import { useQuery } from "@tanstack/react-query";

import { getDashboardSectors } from "@/lib/api/market-dashboard-api";
import type { ExchangeCode } from "@/lib/api/backend-api-types";

type UseDashboardSectionOptions = {
  exchange?: ExchangeCode;
  staleTimeMs: number;
  refetchIntervalMs?: number | false;
  enabled?: boolean;
};

export function useDashboardSectors({
  exchange = "DSE",
  staleTimeMs,
  refetchIntervalMs = false,
  enabled = true,
}: UseDashboardSectionOptions) {
  return useQuery({
    queryKey: ["dashboard", "sectors", exchange],
    queryFn: () => getDashboardSectors(exchange),
    staleTime: staleTimeMs,
    refetchInterval: refetchIntervalMs,
    enabled,
  });
}
