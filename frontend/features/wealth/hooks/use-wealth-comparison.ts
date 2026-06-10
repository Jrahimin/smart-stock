"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";

import { evaluateWealthComparison } from "@/lib/api/wealth-api";
import type { WealthComparisonSlug } from "@/features/wealth/types/wealth-types";

export function useWealthComparison(
  comparisonSlug: WealthComparisonSlug,
  leftInputs: Record<string, number>,
  rightInputs: Record<string, number>,
  assumptions?: Record<string, unknown>,
) {
  const resolvedAssumptions = assumptions ?? { country_code: "BD", inflation_rate: 8 };

  const query = useQuery({
    queryKey: ["wealth", "comparison", comparisonSlug, leftInputs, rightInputs, resolvedAssumptions],
    queryFn: () => evaluateWealthComparison(comparisonSlug, leftInputs, rightInputs, resolvedAssumptions),
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });

  return {
    isError: query.isError,
    isFetching: query.isFetching,
    isLoading: query.isLoading,
    refetch: query.refetch,
    result: query.data,
  };
}
