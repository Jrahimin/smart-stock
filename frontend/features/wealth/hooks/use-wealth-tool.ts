"use client";

import { useQuery } from "@tanstack/react-query";

import { calculateWealthTool } from "@/lib/api/wealth-api";
import type { WealthToolSlug } from "@/features/wealth/types/wealth-types";

export function useWealthTool(
  toolSlug: WealthToolSlug,
  inputs: Record<string, string>,
  assumptions: Record<string, unknown>,
) {
  const numericInputs = Object.fromEntries(
    Object.entries(inputs)
      .filter(([, value]) => value !== "")
      .map(([key, value]) => {
        const numericValue = Number(value);
        return [key, Number.isNaN(numericValue) ? value : numericValue];
      }),
  );

  const query = useQuery({
    queryKey: ["wealth", "tool", toolSlug, numericInputs, assumptions],
    queryFn: () => calculateWealthTool(toolSlug, numericInputs, assumptions),
    staleTime: 30_000,
  });

  return {
    result: query.data,
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
  };
}
