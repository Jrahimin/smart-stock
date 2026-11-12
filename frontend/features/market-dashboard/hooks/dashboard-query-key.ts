import type { ExchangeCode } from "@/lib/api/backend-api-types";

/** Dated events may differ; explicit publication disagreement may not be joined. */
export function dashboardSectionMatchesOverview(overview: { market_sync_id?: string | null } | undefined, section: { market_sync_id?: string | null } | undefined) {
  return !overview?.market_sync_id || !section?.market_sync_id || overview.market_sync_id === section.market_sync_id;
}

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
