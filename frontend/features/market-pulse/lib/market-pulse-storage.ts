import type { MarketPulseStoredSnapshot } from "@/features/market-pulse/types/market-pulse-types";

const STORAGE_KEY = "smart-stock-market-pulse-snapshot-v1";

const EMPTY_SNAPSHOT: MarketPulseStoredSnapshot = {
  lastSyncedAt: null,
  focusStockIds: [],
  scores: {},
  recommendations: {},
  alertIds: [],
};

export function readMarketPulseSnapshot(): MarketPulseStoredSnapshot {
  if (typeof window === "undefined") {
    return EMPTY_SNAPSHOT;
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return EMPTY_SNAPSHOT;
    }

    const parsed = JSON.parse(raw) as MarketPulseStoredSnapshot;
    return {
      ...EMPTY_SNAPSHOT,
      ...parsed,
    };
  } catch {
    return EMPTY_SNAPSHOT;
  }
}

export function writeMarketPulseSnapshot(snapshot: MarketPulseStoredSnapshot) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
}
