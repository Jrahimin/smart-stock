import type { MarketGenerationStamp } from "./market-generation";

type SectorStamp = { market_sync_id?: string | null; decision_generation_id?: string | null; decision_status?: string };

export function isDashboardSectorPayload(data: unknown): data is SectorStamp {
  return typeof data === "object" && data !== null && "sectors" in data && Array.isArray(data.sectors);
}

/** Sectors carry the quote ID in market_sync_id, not a decision-stamped alias. */
export function dashboardSectorsMatchGeneration(sectors: SectorStamp | null | undefined, token: string | null | undefined): boolean {
  const [quote, decision, status] = token?.split("|") ?? [];
  return Boolean(sectors && quote && decision && status === "CURRENT" && sectors.market_sync_id === quote
    && sectors.decision_generation_id === decision && (!sectors.decision_status || sectors.decision_status === status));
}

export function dashboardSectorGenerationToken(freshness: MarketGenerationStamp | null | undefined): string | null {
  const quote = freshness?.market_sync_id ?? freshness?.last_synced_at;
  return quote ? `${quote}|${freshness?.decision_generation_id ?? ""}|${freshness?.decision_status ?? ""}` : null;
}

export function dashboardSectorsMatchFreshness(sectors: SectorStamp | null | undefined, freshness: MarketGenerationStamp | null | undefined): boolean {
  return dashboardSectorsMatchGeneration(sectors, dashboardSectorGenerationToken(freshness));
}
