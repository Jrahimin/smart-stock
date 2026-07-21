export const MARKET_GENERATION_FIELD = "market_sync_id" as const;

export type MarketGenerationStamp = {
  last_synced_at?: string | null;
  market_sync_id?: string | null;
};

/** True when the payload exposes a generation identity field (value may still be null). */
export function hasMarketGenerationField(data: unknown): data is MarketGenerationStamp {
  return (
    typeof data === "object" &&
    data !== null &&
    (MARKET_GENERATION_FIELD in data || "last_synced_at" in data)
  );
}

/** Returns `undefined` when the response has no generation field to validate. */
export function readMarketGenerationValue(data: unknown): string | null | undefined {
  if (!hasMarketGenerationField(data)) {
    return undefined;
  }

  // New API responses use an immutable publication id.  Keep timestamp fallback
  // while older backend nodes are draining during a rolling deployment.
  const value = data.market_sync_id ?? data.last_synced_at;
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
  const generationValue = readMarketGenerationValue(data);
  if (generationValue === undefined) {
    return true;
  }

  if (!freshnessLastSyncedAt || !generationValue) {
    return false;
  }

  return generationValue === freshnessLastSyncedAt;
}

/** @deprecated Prefer `responseMatchesMarketFreshness` — kept for pulse SSR helpers. */
export function summaryMatchesFreshness(
  summary: MarketGenerationStamp | null | undefined,
  freshness: MarketGenerationStamp | null | undefined,
): boolean {
  return responseMatchesMarketFreshness(
    summary,
    freshness?.market_sync_id ?? freshness?.last_synced_at,
  );
}
