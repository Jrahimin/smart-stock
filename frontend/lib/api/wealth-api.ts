import { backendApiGet, backendApiPatch, backendApiPost } from "@/lib/api/backend-api-client";
import type {
  MoneySnapshot,
  WealthComparisonEvaluateResponse,
  WealthDashboard,
  WealthSeasonalContext,
  WealthToolCalculateResponse,
} from "@/features/wealth/types/wealth-types";
import type {
  TaxPlannerCalculateRequest,
  TaxPlannerCalculateResponse,
} from "@/features/wealth/types/tax-planner-types";
import type { TaxPlannerConfigResponse } from "@/features/wealth/types/tax-planner-config-types";

const NO_STORE = { cache: "no-store" } as RequestInit;

export function calculateWealthTool(
  toolSlug: string,
  inputs: Record<string, unknown>,
  assumptions?: Record<string, unknown>,
) {
  return backendApiPost<WealthToolCalculateResponse>(`/wealth/tools/${toolSlug}/calculate`, {
    inputs,
    assumptions: assumptions ?? { country_code: "BD" },
  });
}

export function calculateTaxPlanner(payload: TaxPlannerCalculateRequest) {
  return backendApiPost<TaxPlannerCalculateResponse>("/wealth/tax-planner/calculate", payload);
}

export function fetchTaxPlannerConfig(countryCode = "BD") {
  return backendApiGet<TaxPlannerConfigResponse>("/wealth/tax-planner/config", {
    country_code: countryCode,
  });
}

export function evaluateWealthComparison(
  comparisonSlug: string,
  leftInputs: Record<string, unknown>,
  rightInputs: Record<string, unknown>,
  assumptions?: Record<string, unknown>,
) {
  return backendApiPost<WealthComparisonEvaluateResponse>(`/wealth/comparisons/${comparisonSlug}/evaluate`, {
    left_inputs: leftInputs,
    right_inputs: rightInputs,
    assumptions: assumptions ?? { country_code: "BD" },
  });
}

export function getWealthSeasonalContext() {
  return backendApiGet<WealthSeasonalContext>("/wealth/seasonal-context");
}

export function getMoneySnapshot() {
  return backendApiGet<MoneySnapshot>("/wealth/snapshot", undefined, NO_STORE);
}

export function patchMoneySnapshot(payload: Record<string, unknown>) {
  return backendApiPatch<MoneySnapshot>("/wealth/snapshot", payload);
}

export function getWealthDashboard() {
  return backendApiGet<WealthDashboard>("/wealth/dashboard", undefined, NO_STORE);
}

export function saveWealthScenario(payload: Record<string, unknown>) {
  return backendApiPost<Record<string, unknown>>("/wealth/scenarios", payload);
}
