import { dashboardSectorsMatchGeneration, isDashboardSectorPayload } from "./dashboard-sector-generation";

export const MARKET_GENERATION_FIELD = "market_sync_id" as const;

export type MarketGenerationStamp = {
  last_synced_at?: string | null;
  market_sync_id?: string | null;
  decision_generation_id?: string | null;
  decision_status?: string;
  quote_generation_id?: string | null;
};

function directGenerationStamp(data: unknown): MarketGenerationStamp | null {
  if (Array.isArray(data) && data.length && data[0]?.decision_generation_id) {
    const id = data[0].decision_generation_id;
    return { market_sync_id: id, decision_generation_id: data.every((row) => row.decision_generation_id === id) ? id : null };
  }
  if (typeof data !== "object" || data === null) {
    return null;
  }
  if (!(MARKET_GENERATION_FIELD in data) && !("last_synced_at" in data) && !("decision_generation_id" in data)) {
    return null;
  }
  return data as MarketGenerationStamp;
}

function nestedObject(data: unknown, key: "meta" | "data"): unknown {
  return typeof data === "object" && data !== null && key in data
    ? (data as Record<string, unknown>)[key]
    : undefined;
}

/** True when the payload exposes a generation identity field (value may still be null). */
export function hasMarketGenerationField(data: unknown): data is MarketGenerationStamp {
  return readMarketGenerationValue(data) !== undefined;
}

/** Returns `undefined` when the response has no generation field to validate. */
export function readMarketGenerationValue(data: unknown): string | null | undefined {
  const candidates = [
    data,
    nestedObject(data, "meta"),
    nestedObject(data, "data"),
    nestedObject(nestedObject(data, "data"), "meta"),
  ];
  const stamp = candidates.map(directGenerationStamp).find((candidate) => candidate !== null);
  if (!stamp) {
    return undefined;
  }

  // New API responses use an immutable publication id.  Keep timestamp fallback
  // while older backend nodes are draining during a rolling deployment.
  const value = stamp.market_sync_id ?? stamp.last_synced_at ?? stamp.decision_generation_id;
  if (value === null || value === undefined) {
    return null;
  }

  return typeof value === "string" ? value : null;
}

/**
 * Generation-aware market cache validation.
 * Responses without a generation field pass through (no generation metadata to compare).
 */
export function responseMatchesMarketFreshness(
  data: unknown,
  freshnessLastSyncedAt: string | null | undefined,
): boolean {
  if (isDashboardSectorPayload(data)) return dashboardSectorsMatchGeneration(data, freshnessLastSyncedAt);
  const generationValue = readMarketGenerationValue(data);
  if (generationValue === undefined) {
    return true;
  }

  if (!freshnessLastSyncedAt || !generationValue) {
    return false;
  }

  const [quoteId, decisionId, decisionStatus] = freshnessLastSyncedAt.split("|");
  const candidates = [data, nestedObject(data, "meta"), nestedObject(data, "data"), nestedObject(nestedObject(data, "data"), "meta")];
  const stamp = candidates.map(directGenerationStamp).find((candidate) => candidate !== null);
  const looksLikeDecision = candidates.some((candidate) => typeof candidate === "object" && candidate !== null &&
    ("decision_support" in candidate || "focus_stocks" in candidate || "decision_session_date" in candidate || "story" in candidate));
  if (decisionId !== undefined && looksLikeDecision && stamp?.decision_generation_id === undefined) return false;
  if (stamp?.decision_generation_id !== undefined) {
    return !!decisionId && stamp.decision_generation_id === decisionId &&
      (!stamp.quote_generation_id || stamp.quote_generation_id === quoteId) &&
      (!decisionStatus || !stamp.decision_status || stamp.decision_status === decisionStatus);
  }
  return generationValue === quoteId;
}

/** @deprecated Prefer `responseMatchesMarketFreshness` — kept for pulse SSR helpers. */
export function summaryMatchesFreshness(
  summary: MarketGenerationStamp | null | undefined,
  freshness: MarketGenerationStamp | null | undefined,
): boolean {
  return responseMatchesMarketFreshness(
    summary,
    freshnessGenerationToken(freshness),
  );
}

export function freshnessGenerationToken(freshness: MarketGenerationStamp | null | undefined): string | null {
  const quote = freshness?.market_sync_id ?? freshness?.last_synced_at;
  if (!quote) return null;
  return freshness?.decision_generation_id !== undefined
    ? `${quote}|${freshness.decision_generation_id ?? ""}${freshness.decision_status ? `|${freshness.decision_status}` : ""}` : quote;
}
