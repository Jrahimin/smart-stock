import { isMarketApiCacheUrl } from "@/lib/market/market-cache-url-registry";
import { responseMatchesMarketFreshness } from "@/lib/market/market-generation";

/** Bump when market IndexedDB payload shape or validation rules change. */
export const MARKET_INDEXEDDB_SCHEMA_VERSION = 2;

export type MarketIndexedDbCacheScope = "default" | "market" | "off";

export type MarketIndexedDbPayload<T> = {
  cacheKey: string;
  expiresAt: number;
  data: T;
  scope?: MarketIndexedDbCacheScope;
  marketSchemaVersion?: number;
};

export type MarketIndexedDbReadVerdict =
  | { status: "hit"; data: unknown }
  | { status: "miss"; reason: "absent" | "expired" | "schema" | "generation" };

export type MarketIndexedDbEvaluateOptions = {
  expectedScope?: Exclude<MarketIndexedDbCacheScope, "off">;
  freshnessLastSyncedAt?: string | null | undefined;
  cacheKey?: string;
};

function isMarketIndexedDbPayload(
  payload: MarketIndexedDbPayload<unknown>,
  options: MarketIndexedDbEvaluateOptions,
): boolean {
  if (options.expectedScope === "market") {
    return true;
  }
  if (payload.scope === "market") {
    return true;
  }
  if (options.cacheKey && isMarketApiCacheUrl(options.cacheKey)) {
    return true;
  }
  return false;
}

/** Pure validation used by IndexedDB reads and unit tests. */
export function evaluateMarketIndexedDbEntry(
  payload: MarketIndexedDbPayload<unknown> | undefined,
  options: MarketIndexedDbEvaluateOptions = {},
  now = Date.now(),
): MarketIndexedDbReadVerdict {
  if (!payload) {
    return { status: "miss", reason: "absent" };
  }

  if (payload.expiresAt <= now) {
    return { status: "miss", reason: "expired" };
  }

  const isMarketEntry = isMarketIndexedDbPayload(payload, options);

  if (isMarketEntry && payload.marketSchemaVersion !== MARKET_INDEXEDDB_SCHEMA_VERSION) {
    return { status: "miss", reason: "schema" };
  }

  if (
    isMarketEntry &&
    options.freshnessLastSyncedAt !== undefined &&
    !responseMatchesMarketFreshness(payload.data, options.freshnessLastSyncedAt)
  ) {
    return { status: "miss", reason: "generation" };
  }

  return { status: "hit", data: payload.data };
}
