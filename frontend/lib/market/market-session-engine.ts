import type { BackendMarketFreshnessDto, DataQualityFlag, MarketSessionStatus } from "@/lib/api/backend-api-types";

export type MarketSessionState =
  | "PRE_OPEN"
  | "OPEN"
  | "POST_CLOSE"
  | "HOLIDAY"
  | "STALE"
  | "PARTIAL"
  | "SYNCING";

export type MarketSessionInput = {
  now?: Date;
  latestTradeDate?: string | null;
  dataQualityFlag?: DataQualityFlag | null;
  isSyncing?: boolean;
  freshness?: BackendMarketFreshnessDto | null;
};

export type MarketSessionModel = {
  state: MarketSessionState;
  label: string;
  description: string;
  shouldPoll: boolean;
  pollingIntervalMs: number | false;
  disablesFreshDataActions: boolean;
};

const SESSION_LABELS: Record<MarketSessionStatus, string> = {
  PRE_OPEN: "Pre-open",
  OPEN: "Open",
  POST_CLOSE: "Post-close",
  HOLIDAY: "Closed",
};

const SESSION_DESCRIPTIONS: Record<MarketSessionStatus, string> = {
  PRE_OPEN: "Waiting for the next scheduled market snapshot.",
  OPEN: "Snapshot prices refresh on the configured interval.",
  POST_CLOSE: "Session closed; showing the latest stored snapshot.",
  HOLIDAY: "Bangladesh market is outside the regular trading week.",
};

function isLikelyStale(latestTradeDate: string | null | undefined, now: Date) {
  if (!latestTradeDate) {
    return true;
  }

  const latest = new Date(`${latestTradeDate}T00:00:00+06:00`);
  const ageMs = now.getTime() - latest.getTime();
  return ageMs > 1000 * 60 * 60 * 24 * 5;
}

function sessionFromFreshness(freshness: BackendMarketFreshnessDto): MarketSessionModel {
  const status = freshness.market_status;
  const pollingMs = freshness.snapshot_interval_minutes * 60 * 1000;
  const shouldPoll = status === "OPEN" || status === "PRE_OPEN";

  return {
    state: status,
    label: SESSION_LABELS[status],
    description: freshness.freshness_label || SESSION_DESCRIPTIONS[status],
    shouldPoll,
    pollingIntervalMs: shouldPoll ? pollingMs : false,
    disablesFreshDataActions: status === "PRE_OPEN" || status === "HOLIDAY",
  };
}

export function getMarketSession(input: MarketSessionInput = {}): MarketSessionModel {
  const now = input.now ?? new Date();

  if (input.isSyncing) {
    return {
      state: "SYNCING",
      label: "Syncing",
      description: "Market data ingestion is in progress.",
      shouldPoll: true,
      pollingIntervalMs: 15_000,
      disablesFreshDataActions: true,
    };
  }

  if (input.dataQualityFlag === "PARTIAL" || input.dataQualityFlag === "SUSPICIOUS") {
    return {
      state: "PARTIAL",
      label: input.dataQualityFlag === "SUSPICIOUS" ? "Source Check" : "Partial",
      description: "Latest market data needs cautious interpretation.",
      shouldPoll: false,
      pollingIntervalMs: false,
      disablesFreshDataActions: true,
    };
  }

  if (input.freshness) {
    const fromApi = sessionFromFreshness(input.freshness);
    if (!isLikelyStale(input.latestTradeDate ?? input.freshness.trade_date, now)) {
      return fromApi;
    }
  }

  if (isLikelyStale(input.latestTradeDate, now)) {
    return {
      state: "STALE",
      label: "Stale",
      description: "No recent complete market session is available.",
      shouldPoll: false,
      pollingIntervalMs: false,
      disablesFreshDataActions: true,
    };
  }

  if (input.freshness) {
    return sessionFromFreshness(input.freshness);
  }

  return {
    state: "POST_CLOSE",
    label: "Post-close",
    description: "Market freshness metadata is unavailable.",
    shouldPoll: false,
    pollingIntervalMs: false,
    disablesFreshDataActions: false,
  };
}
