"use client";

import { useQuery } from "@tanstack/react-query";

import { evaluateWealthComparison } from "@/lib/api/wealth-api";
import type { WealthComparisonSlug } from "@/features/wealth/types/wealth-types";

export function useWealthComparison(
  comparisonSlug: WealthComparisonSlug,
  leftInputs: Record<string, number>,
  rightInputs: Record<string, number>,
) {
  const query = useQuery({
    queryKey: ["wealth", "comparison", comparisonSlug, leftInputs, rightInputs],
    queryFn: () => evaluateWealthComparison(comparisonSlug, leftInputs, rightInputs),
    staleTime: 30_000,
  });

  return {
    result: query.data,
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
  };
}
