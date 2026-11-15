import type { ExchangeCode } from "@/lib/api/backend-api-types";
import { NEWS_DATE_CONTRACT } from "@/lib/market/entry-contract-capability";

type DashboardSectionStamp = {
  market_sync_id?: string | null;
  session_trade_date?: string | null;
};

/** Match the section envelope. Individual news and index dates can differ. */
export function dashboardSectionMatchesOverview(
  overview: DashboardSectionStamp | null | undefined,
  section: DashboardSectionStamp | null | undefined,
) {
  if (!overview || !section) return false;
  if (overview.market_sync_id && section.market_sync_id && overview.market_sync_id !== section.market_sync_id) return false;
  return !overview.session_trade_date || !section.session_trade_date || overview.session_trade_date === section.session_trade_date;
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
  return section === "market-alerts" ? ["dashboard", section, exchange, generation, NEWS_DATE_CONTRACT] as const : ["dashboard", section, exchange, generation] as const;
}

export function shouldUseDashboardInitialData(
  initialGeneration: string | null,
  generation: string | null,
): boolean {
  return initialGeneration !== null && initialGeneration === generation;
}
