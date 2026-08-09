import type { ExchangeCode } from "@/lib/api/backend-api-types";

export type DashboardSection =
  | "overview"
  | "movers"
  | "sectors"
  | "market-alerts"
  | "heatmap"
  | "market-sentiment";

/** Generation belongs in every dashboard market-data identity. */
export function dashboardQueryKey(
  section: DashboardSection,
  exchange: ExchangeCode,
  generation: string,
) {
  return ["dashboard", section, exchange, generation] as const;
}

export function shouldUseDashboardInitialData(
  initialGeneration: string | null,
  generation: string | null,
): boolean {
  return initialGeneration !== null && initialGeneration === generation;
}
