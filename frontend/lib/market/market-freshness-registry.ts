let marketFreshnessLastSyncedAt: string | null | undefined;

/** `undefined` means freshness has not been observed yet — generation checks are deferred. */
export function getMarketFreshnessGeneration(): string | null | undefined {
  return marketFreshnessLastSyncedAt;
}

export function setMarketFreshnessGeneration(lastSyncedAt: string | null) {
  marketFreshnessLastSyncedAt = lastSyncedAt;
}

export function resetMarketFreshnessGenerationForTests() {
  marketFreshnessLastSyncedAt = undefined;
}
