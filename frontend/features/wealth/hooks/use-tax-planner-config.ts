"use client";

import { useQuery } from "@tanstack/react-query";

import { fetchTaxPlannerConfig } from "@/lib/api/wealth-api";

export function useTaxPlannerConfig() {
  return useQuery({
    queryKey: ["wealth", "tax-planner", "config"],
    queryFn: () => fetchTaxPlannerConfig(),
    staleTime: 60_000,
  });
}
