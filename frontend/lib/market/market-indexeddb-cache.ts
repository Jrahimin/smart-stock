import { isMarketApiCacheUrl } from "@/lib/market/market-cache-url-registry";
import { hasUnusablePositiveEntry } from "@/lib/market/current-entry-contract";
import { getCurrentMarketFreshness } from "@/lib/market/market-freshness-registry";
import {
  hasMarketGenerationField,
  responseMatchesMarketFreshness,
} from "@/lib/market/market-generation";

/** Bump when market IndexedDB payload shape or validation rules change. */
export const MARKET_INDEXEDDB_SCHEMA_VERSION = 7;

/** Local presentation revision; HTTP identity and other cache populations stay intact. */
export function marketPresentationCacheKey(url: string): string {
  const path = url.split("?")[0];
  if (path.endsWith("/dashboard/heatmap")) return `${url}#heatmap-measured-v3`;
  return path.endsWith("/market/pulse") || path.endsWith("/market/pulse/briefing") ? `${url}#pulse-sector-exact-v5` : url;
}

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
  requireGeneration?: boolean;
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

  if (isMarketEntry && options.cacheKey?.split("?")[0].endsWith("/dashboard/overview") &&
      (!payload.data || typeof payload.data !== "object" || !("index_snapshot_version" in payload.data) || payload.data.index_snapshot_version !== 2)) {
    return { status: "miss", reason: "schema" };
  }

  if (isMarketEntry && options.cacheKey?.split("?")[0].endsWith("/dashboard/market-sentiment") &&
      (!payload.data || typeof payload.data !== "object" || !("interpretation" in payload.data) || !payload.data.interpretation)) {
    return { status: "miss", reason: "schema" };
  }

  if (isMarketEntry && hasUnusablePositiveEntry(payload.data, getCurrentMarketFreshness(), now)) {
    return { status: "miss", reason: "expired" };
  }

  if (isMarketEntry && payload.marketSchemaVersion !== MARKET_INDEXEDDB_SCHEMA_VERSION) {
    return { status: "miss", reason: "schema" };
  }

  if (
    isMarketEntry &&
    options.freshnessLastSyncedAt !== undefined &&
    options.requireGeneration &&
    !hasMarketGenerationField(payload.data)
  ) {
    return { status: "miss", reason: "generation" };
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
