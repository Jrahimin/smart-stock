import type { BackendDailyMarketSummaryDto, BackendDsexIndexSnapshotDto } from "@/lib/api/backend-api-types";
import { formatCompactNumber, formatNumber, formatPercent, toNumber } from "@/lib/formatters/financial-formatters";

const TRADING_DAYS_1M = 21;
const TRADING_DAYS_6M = 126;
const TRADING_DAYS_1Y = 252;

export type IndexHistoryPoint = {
  tradeDate: string;
  close: number;
};

export type IndexDayStats = {
  open: string;
  high: string;
  low: string;
};

export type IndexRangeContext = {
  low: number;
  high: number;
  lowLabel: string;
  highLabel: string;
  positionPercent: number;
};

export type IndexPerformanceSnapshot = {
  oneMonth: string;
  sixMonth: string;
  oneYear: string;
};

export type MarketIndexContext = {
  indexAvailable: boolean;
  indexName: string;
  indexValue: string;
  indexChangePercent: number | null;
  indexChangeLabel: string;
  indexTone: "positive" | "negative" | "neutral" | "warning";
  marketStatus: string | null;
  dayStats: IndexDayStats | null;
  range: IndexRangeContext | null;
  performance: IndexPerformanceSnapshot;
};

function isIndexSummary(summary: BackendDailyMarketSummaryDto) {
  return summary.index_name !== "SOURCE_VALIDATION" && toNumber(summary.index_close) !== null;
}

export function formatIndexMovement(change: number | null, changePercent: number | null) {
  if (change === null && changePercent === null) {
    return "—";
  }

  const points =
    change === null
      ? "—"
      : `${change > 0 ? "+" : ""}${formatNumber(change, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const percent = formatPercent(changePercent);
  return `${points} (${percent})`;
}

export function getIndexHistory(summaries: BackendDailyMarketSummaryDto[]): IndexHistoryPoint[] {
  return summaries
    .filter(isIndexSummary)
    .sort((left, right) => left.trade_date.localeCompare(right.trade_date))
    .map((summary) => ({
      tradeDate: summary.trade_date,
      close: toNumber(summary.index_close)!,
    }));
}

function pickHistoricalClose(history: IndexHistoryPoint[], tradingDaysBack: number) {
  if (!history.length) {
    return null;
  }

  const requiredIndex = history.length - 1 - tradingDaysBack;
  if (requiredIndex < 0) {
    return null;
  }

  return history[requiredIndex]?.close ?? null;
}

function computeReturnLabel(current: number, past: number | null) {
  if (past === null || past === 0) {
    return "N/A";
  }

  return formatPercent(((current - past) / past) * 100);
}

function deriveDayStats(summary: BackendDailyMarketSummaryDto | null): IndexDayStats | null {
  const close = toNumber(summary?.index_close);
  const change = toNumber(summary?.index_change);

  if (close === null || change === null) {
    return null;
  }

  const open = close - change;
  const high = Math.max(close, open);
  const low = Math.min(close, open);

  return {
    open: formatNumber(open, { maximumFractionDigits: 2 }),
    high: formatNumber(high, { maximumFractionDigits: 2 }),
    low: formatNumber(low, { maximumFractionDigits: 2 }),
  };
}

function deriveRangeContext(history: IndexHistoryPoint[], currentClose: number): IndexRangeContext | null {
  const window = history.slice(-TRADING_DAYS_1Y);
  if (window.length < 2) {
    return null;
  }

  const low = Math.min(...window.map((point) => point.close));
  const high = Math.max(...window.map((point) => point.close));
  if (high <= low) {
    return null;
  }

  const positionPercent = Math.max(0, Math.min(100, ((currentClose - low) / (high - low)) * 100));

  return {
    low,
    high,
    lowLabel: formatCompactNumber(low),
    highLabel: formatCompactNumber(high),
    positionPercent,
  };
}

function derivePerformanceSnapshot(history: IndexHistoryPoint[], currentClose: number): IndexPerformanceSnapshot {
  return {
    oneMonth: computeReturnLabel(currentClose, pickHistoricalClose(history, TRADING_DAYS_1M)),
    sixMonth: computeReturnLabel(currentClose, pickHistoricalClose(history, TRADING_DAYS_6M)),
    oneYear: computeReturnLabel(currentClose, pickHistoricalClose(history, TRADING_DAYS_1Y)),
  };
}

function resolveIndexTone(changePercent: number | null, available: boolean): MarketIndexContext["indexTone"] {
  if (changePercent !== null && changePercent > 0) {
    return "positive";
  }

  if (changePercent !== null && changePercent < 0) {
    return "negative";
  }

  return available ? "neutral" : "warning";
}

export function buildMarketIndexContextFromSnapshot(
  snapshot: BackendDsexIndexSnapshotDto,
): MarketIndexContext {
  const currentClose = toNumber(snapshot.index_close)!;
  const indexChange = toNumber(snapshot.index_change);
  const indexChangePercent = toNumber(snapshot.index_change_percent);
  const rangeLow = toNumber(snapshot.range_52w_low);
  const rangeHigh = toNumber(snapshot.range_52w_high);
  const positionPercent = toNumber(snapshot.range_position_percent) ?? 50;

  return {
    indexAvailable: true,
    indexName: snapshot.index_name,
    indexValue: formatNumber(currentClose, { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
    indexChangePercent,
    indexChangeLabel: formatIndexMovement(indexChange, indexChangePercent),
    indexTone: resolveIndexTone(indexChangePercent, true),
    marketStatus: snapshot.market_status,
    dayStats: {
      open: formatNumber(snapshot.day_open, { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
      high: formatNumber(snapshot.day_high, { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
      low: formatNumber(snapshot.day_low, { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
    },
    range:
      rangeLow !== null && rangeHigh !== null
        ? {
            low: rangeLow,
            high: rangeHigh,
            lowLabel: formatCompactNumber(rangeLow),
            highLabel: formatCompactNumber(rangeHigh),
            positionPercent,
          }
        : null,
    performance: {
      oneMonth: formatPercent(snapshot.return_1m_percent),
      sixMonth: formatPercent(snapshot.return_6m_percent),
      oneYear: formatPercent(snapshot.return_1y_percent),
    },
  };
}

export function buildMarketIndexContext(
  summaries: BackendDailyMarketSummaryDto[],
  latestSummary: BackendDailyMarketSummaryDto | null,
  liveSnapshot: BackendDsexIndexSnapshotDto | null = null,
): MarketIndexContext {
  if (liveSnapshot) {
    return buildMarketIndexContextFromSnapshot(liveSnapshot);
  }

  const history = getIndexHistory(summaries);
  const latestPoint = history[history.length - 1] ?? null;
  const hasRealIndexSummary =
    latestSummary !== null && latestSummary.index_name !== "SOURCE_VALIDATION" && latestSummary.index_close !== null;
  const indexName =
    latestSummary?.index_name === "SOURCE_VALIDATION" ? "DSEX" : (latestSummary?.index_name ?? latestPoint ? "DSEX" : "DSEX");
  const currentClose = latestPoint?.close ?? null;
  const indexChangePercent = toNumber(latestSummary?.index_change_percent);
  const indexChange = toNumber(latestSummary?.index_change);

  return {
    indexAvailable: hasRealIndexSummary,
    indexName,
    indexValue: hasRealIndexSummary
      ? formatNumber(latestSummary.index_close, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
      : "Awaiting index data",
    indexChangePercent,
    indexChangeLabel: hasRealIndexSummary ? formatIndexMovement(indexChange, indexChangePercent) : "—",
    indexTone: resolveIndexTone(indexChangePercent, hasRealIndexSummary),
    marketStatus: null,
    dayStats: hasRealIndexSummary ? deriveDayStats(latestSummary) : null,
    range: currentClose !== null ? deriveRangeContext(history, currentClose) : null,
    performance:
      currentClose !== null
        ? derivePerformanceSnapshot(history, currentClose)
        : {
            oneMonth: "N/A",
            sixMonth: "N/A",
            oneYear: "N/A",
          },
  };
}
