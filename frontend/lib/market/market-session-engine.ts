import type { DataQualityFlag } from "@/lib/api/backend-api-types";

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
};

export type MarketSessionModel = {
  state: MarketSessionState;
  label: string;
  description: string;
  shouldPoll: boolean;
  pollingIntervalMs: number | false;
  disablesFreshDataActions: boolean;
};

const DHAKA_TIME_ZONE = "Asia/Dhaka";

function getDhakaParts(now: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: DHAKA_TIME_ZONE,
    weekday: "short",
    hour: "numeric",
    minute: "numeric",
    hour12: false,
  }).formatToParts(now);

  const byType = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    weekday: byType.weekday,
    hour: Number(byType.hour),
    minute: Number(byType.minute),
  };
}

function isLikelyStale(latestTradeDate: string | null | undefined, now: Date) {
  if (!latestTradeDate) {
    return true;
  }

  const latest = new Date(`${latestTradeDate}T00:00:00+06:00`);
  const ageMs = now.getTime() - latest.getTime();
  return ageMs > 1000 * 60 * 60 * 24 * 5;
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

  const { weekday, hour, minute } = getDhakaParts(now);
  const minutes = hour * 60 + minute;
  const isWeekend = weekday === "Fri" || weekday === "Sat";

  if (isWeekend) {
    return {
      state: "HOLIDAY",
      label: "Closed",
      description: "Bangladesh market is outside the regular trading week.",
      shouldPoll: false,
      pollingIntervalMs: false,
      disablesFreshDataActions: true,
    };
  }

  if (minutes < 10 * 60) {
    return {
      state: "PRE_OPEN",
      label: "Pre-open",
      description: "Market workspace is preparing for the trading session.",
      shouldPoll: true,
      pollingIntervalMs: 120_000,
      disablesFreshDataActions: true,
    };
  }

  if (minutes <= 14 * 60 + 30) {
    return {
      state: "OPEN",
      label: "Open",
      description: "Polling cadence is ready for live-capable data sources.",
      shouldPoll: true,
      pollingIntervalMs: 30_000,
      disablesFreshDataActions: false,
    };
  }

  return {
    state: "POST_CLOSE",
    label: "Post-close",
    description: "Daily market data should be treated as end-of-day intelligence.",
    shouldPoll: false,
    pollingIntervalMs: false,
    disablesFreshDataActions: false,
  };
}
