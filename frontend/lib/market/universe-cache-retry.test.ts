import { describe, expect, it } from "vitest";

import { BackendApiError } from "@/lib/api/backend-api-client";
import {
  isUniverseCacheWarming,
  shouldRetryUniverseCache,
  UNIVERSE_CACHE_WARM_RETRY_DELAY_MS,
} from "@/lib/market/universe-cache-retry";

describe("universe cache retry policy", () => {
  it("retries a 503 once after the cache warm delay", () => {
    const error = new BackendApiError("Scored universe cache is unavailable", 503);

    expect(isUniverseCacheWarming(error)).toBe(true);
    expect(shouldRetryUniverseCache(0, error)).toBe(true);
    expect(shouldRetryUniverseCache(1, error)).toBe(false);
    expect(UNIVERSE_CACHE_WARM_RETRY_DELAY_MS).toBe(20_000);
  });

  it("does not retry unrelated failures", () => {
    expect(shouldRetryUniverseCache(0, new BackendApiError("Unauthorized", 401))).toBe(false);
    expect(isUniverseCacheWarming(new Error("network"))).toBe(false);
  });
});
