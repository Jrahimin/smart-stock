export const MARKET_GENERATION_FIELD = "last_synced_at" as const;

export type MarketGenerationStamp = {
  last_synced_at?: string | null;
};

/** True when the payload exposes a generation identity field (value may still be null). */
export function hasMarketGenerationField(data: unknown): data is MarketGenerationStamp {
  return typeof data === "object" && data !== null && MARKET_GENERATION_FIELD in data;
}

/** Returns `undefined` when the response has no generation field to validate. */
export function readMarketGenerationValue(data: unknown): string | null | undefined {
  if (!hasMarketGenerationField(data)) {
    return undefined;
  }

  const value = data.last_synced_at;
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
  return responseMatchesMarketFreshness(summary, freshness?.last_synced_at);
}
