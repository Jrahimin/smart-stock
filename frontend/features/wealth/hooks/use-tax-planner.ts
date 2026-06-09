"use client";

import { useQuery } from "@tanstack/react-query";

import { calculateTaxPlanner } from "@/lib/api/wealth-api";
import type { TaxPlannerCalculateRequest } from "@/features/wealth/types/tax-planner-types";

const TAX_PLANNER_DRAFT_KEY = "wealth.taxPlanner.v1";

export function useTaxPlanner(payload: TaxPlannerCalculateRequest) {
  const query = useQuery({
    queryKey: ["wealth", "tax-planner", payload],
    queryFn: () => calculateTaxPlanner(payload),
    staleTime: 15_000,
  });

  return {
    result: query.data,
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
  };
}

export function readTaxPlannerDraft<T>() {
  if (typeof window === "undefined") {
    return null;
  }
  const rawDraft = window.localStorage.getItem(TAX_PLANNER_DRAFT_KEY);
  if (!rawDraft) {
    return null;
  }
  try {
    return JSON.parse(rawDraft) as T;
  } catch {
    window.localStorage.removeItem(TAX_PLANNER_DRAFT_KEY);
    return null;
  }
}

export function saveTaxPlannerDraft(value: unknown) {
  if (typeof window !== "undefined") {
    window.localStorage.setItem(TAX_PLANNER_DRAFT_KEY, JSON.stringify(value));
  }
}
