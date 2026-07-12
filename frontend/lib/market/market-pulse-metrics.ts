import type { BackendDailyMarketSummaryDto } from "@/lib/api/backend-api-types";
import { formatCompactNumber, formatPercent, toNumber } from "@/lib/formatters/financial-formatters";
import { filterSessionMovers } from "@/lib/market/market-movers";
import type { StockIntelligenceModel } from "@/lib/market/market-intelligence-types";
import type { BreadthModel, MarketDirection } from "@/features/market-dashboard/types/market-dashboard-types";

const TRADING_DAY_WINDOW = 30;

export type PulseTone = "positive" | "negative" | "neutral" | "warning" | "info";

export type TurnoverPulseContext = {
  insight: string;
  insightTone: PulseTone;
  primaryValue: string;
  vsYesterday: string;
  vsYesterdayTone: PulseTone;
  vs30DayAvg: string;
  activityMeterPercent: number;
  footer: string;
};

export type VolumePulseContext = {
  insight: string;
  insightTone: PulseTone;
  primaryValue: string;
  typicalVolume: string;
  ratioVsAvg: string;
  participationMeterPercent: number;
  footer: string;
};

export type BreadthPulseContext = {
  insight: string;
  insightTone: PulseTone;
  ratioLabel: string;
  ratioTone: PulseTone;
  advancing: number;
  declining: number;
  unchanged: number;
  advancingPercent: number;
  unchangedPercent: number;
  decliningPercent: number;
  footer: string;
};

export type SectorLeaderSnapshot = {
  name: string;
  changePercent: number;
  label: string;
};

export type LeaderRowKind = "top_sector" | "runner_up" | "top_stock" | "coverage";

export type LeaderHighlightRow = {
  kind: LeaderRowKind;
  label: string;
  name: string;
  nameKey?: "leadership_pending";
  performanceBadge: string;
  performanceTone: PulseTone;
};

export type LeadersPulseContext = {
  rows: LeaderHighlightRow[];
  footer: string;
  primary: SectorLeaderSnapshot | null;
};

function getIndexSummaries(summaries: BackendDailyMarketSummaryDto[]) {
  return summaries
    .filter((summary) => summary.index_name !== "SOURCE_VALIDATION" && toNumber(summary.index_close) !== null)
    .sort((left, right) => left.trade_date.localeCompare(right.trade_date));
}

function average(values: number[]) {
  if (!values.length) {
    return null;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function resolveRelativeTone(ratio: number | null): PulseTone {
  if (ratio === null) {
    return "neutral";
  }

  if (ratio >= 1.08) {
    return "positive";
  }

  if (ratio <= 0.92) {
    return "negative";
  }

  return "neutral";
}

function ratioToMeterPercent(ratio: number | null) {
  if (ratio === null) {
    return 50;
  }

  const normalized = 50 + (ratio - 1) * 42;
  return Math.max(8, Math.min(92, normalized));
}

function resolveLiquidityInsight(ratio: number | null): { insight: string; tone: PulseTone } {
  if (ratio === null) {
    return { insight: "Liquidity pending", tone: "neutral" };
  }

  if (ratio >= 1.08) {
    return { insight: "Strong Liquidity", tone: "positive" };
  }

  if (ratio <= 0.92) {
    return { insight: "Weak Liquidity", tone: "negative" };
  }

  return { insight: "Average Liquidity", tone: "neutral" };
}

function resolveParticipationInsight(ratio: number | null): { insight: string; tone: PulseTone } {
  if (ratio === null) {
    return { insight: "Participation pending", tone: "neutral" };
  }

  if (ratio >= 1.08) {
    return { insight: "Above Average", tone: "positive" };
  }

  if (ratio <= 0.92) {
    return { insight: "Below Average", tone: "negative" };
  }

  return { insight: "Near Average", tone: "neutral" };
}

function resolveBreadthInsight(direction: MarketDirection): { insight: string; tone: PulseTone } {
  if (direction === "buyers") {
    return { insight: "Buyers Dominating", tone: "positive" };
  }

  if (direction === "sellers") {
    return { insight: "Sellers Dominating", tone: "negative" };
  }

  return { insight: "Balanced Market", tone: "neutral" };
}

function deriveSectorLeaders(
  universe: StockIntelligenceModel[],
  sessionTradeDate: string | null | undefined,
): SectorLeaderSnapshot[] {
  const traded = filterSessionMovers(universe, sessionTradeDate);
  const sectorBuckets = new Map<string, number[]>();

  for (const stock of traded) {
    const sector = stock.sector?.trim() || "Unclassified";
    const changes = sectorBuckets.get(sector) ?? [];
    changes.push(stock.priceChangePercent ?? 0);
    sectorBuckets.set(sector, changes);
  }

  return [...sectorBuckets.entries()]
    .filter(([, changes]) => changes.length >= 3)
    .map(([name, changes]) => {
      const changePercent = changes.reduce((sum, value) => sum + value, 0) / changes.length;
      return {
        name,
        changePercent,
        label: `${name} ${formatPercent(changePercent)}`,
      };
    })
    .sort((left, right) => right.changePercent - left.changePercent);
}

export function buildTurnoverPulseContext(
  summaries: BackendDailyMarketSummaryDto[],
  currentTurnover: number | null,
  turnoverLabel: string,
): TurnoverPulseContext {
  const indexSummaries = getIndexSummaries(summaries);
  const recent = indexSummaries.slice(-TRADING_DAY_WINDOW);
  const previous = indexSummaries.length >= 2 ? indexSummaries.at(-2) : null;
  const avgTurnover = average(
    recent.map((summary) => toNumber(summary.total_turnover)).filter((value): value is number => value !== null),
  );

  const previousTurnover = previous ? toNumber(previous.total_turnover) : null;
  const changeVsPrevious =
    currentTurnover !== null && previousTurnover !== null && previousTurnover > 0
      ? ((currentTurnover - previousTurnover) / previousTurnover) * 100
      : null;
  const ratioVsAvg =
    currentTurnover !== null && avgTurnover !== null && avgTurnover > 0 ? currentTurnover / avgTurnover : null;
  const liquidity = resolveLiquidityInsight(ratioVsAvg);

  return {
    insight: liquidity.insight,
    insightTone: liquidity.tone,
    primaryValue: turnoverLabel,
    vsYesterday: changeVsPrevious === null ? "N/A" : formatPercent(changeVsPrevious),
    vsYesterdayTone:
      changeVsPrevious === null ? "neutral" : changeVsPrevious > 0 ? "positive" : changeVsPrevious < 0 ? "negative" : "neutral",
    vs30DayAvg: avgTurnover === null ? "N/A" : formatCompactNumber(avgTurnover),
    activityMeterPercent: ratioToMeterPercent(ratioVsAvg),
    footer: avgTurnover === null ? "Exchange turnover" : `30-session avg BDT ${formatCompactNumber(avgTurnover)}`,
  };
}

export function buildVolumePulseContext(
  summaries: BackendDailyMarketSummaryDto[],
  currentVolume: number | null,
  volumeLabel: string,
): VolumePulseContext {
  const indexSummaries = getIndexSummaries(summaries);
  const recent = indexSummaries.slice(-TRADING_DAY_WINDOW);
  const avgVolume = average(
    recent.map((summary) => summary.total_volume).filter((value): value is number => value !== null && value > 0),
  );
  const ratioVsAvg = currentVolume !== null && avgVolume !== null && avgVolume > 0 ? currentVolume / avgVolume : null;
  const participation = resolveParticipationInsight(ratioVsAvg);

  return {
    insight: participation.insight,
    insightTone: participation.tone,
    primaryValue: volumeLabel,
    typicalVolume: avgVolume === null ? "N/A" : formatCompactNumber(avgVolume),
    ratioVsAvg: ratioVsAvg === null ? "N/A" : `${ratioVsAvg.toFixed(2)}x`,
    participationMeterPercent: ratioToMeterPercent(ratioVsAvg),
    footer: avgVolume === null ? "Exchange volume" : `30-session avg ${formatCompactNumber(avgVolume)} shares`,
  };
}

export function buildBreadthPulseContext(
  breadth: BreadthModel,
  direction: MarketDirection,
): BreadthPulseContext {
  const total = Math.max(breadth.total, 1);
  const ratio = breadth.declining > 0 ? breadth.advancing / breadth.declining : breadth.advancing;
  const breadthInsight = resolveBreadthInsight(direction);

  return {
    insight: breadthInsight.insight,
    insightTone: breadthInsight.tone,
    ratioLabel: `${ratio.toFixed(2)} Adv/Decl`,
    ratioTone: direction === "buyers" ? "positive" : direction === "sellers" ? "negative" : "neutral",
    advancing: breadth.advancing,
    declining: breadth.declining,
    unchanged: breadth.unchanged,
    advancingPercent: (breadth.advancing / total) * 100,
    unchangedPercent: (breadth.unchanged / total) * 100,
    decliningPercent: (breadth.declining / total) * 100,
    footer: `${breadth.advancing} advancing · ${breadth.declining} declining · ${breadth.unchanged} unchanged`,
  };
}

export function buildLeadersPulseContext(
  universe: StockIntelligenceModel[],
  sessionTradeDate: string | null | undefined,
): LeadersPulseContext {
  const sectorLeaders = deriveSectorLeaders(universe, sessionTradeDate);
  const traded = filterSessionMovers(universe, sessionTradeDate);
  const topStock = [...traded].sort((left, right) => (right.priceChangePercent ?? 0) - (left.priceChangePercent ?? 0))[0];
  const primary = sectorLeaders[0] ?? null;
  const runnerUp = sectorLeaders[1] ?? null;
  const rows: LeaderHighlightRow[] = [];

  if (primary) {
    rows.push({
      kind: "top_sector",
      label: "Top Sector",
      name: primary.name,
      performanceBadge: formatPercent(primary.changePercent),
      performanceTone: primary.changePercent > 0 ? "positive" : primary.changePercent < 0 ? "negative" : "neutral",
    });
  }

  if (runnerUp) {
    rows.push({
      kind: "runner_up",
      label: "Runner-up",
      name: runnerUp.name,
      performanceBadge: formatPercent(runnerUp.changePercent),
      performanceTone: runnerUp.changePercent > 0 ? "positive" : runnerUp.changePercent < 0 ? "negative" : "neutral",
    });
  }

  if (topStock) {
    rows.push({
      kind: "top_stock",
      label: "Top Stock",
      name: topStock.stock.symbol,
      performanceBadge: formatPercent(topStock.priceChangePercent),
      performanceTone: (topStock.priceChangePercent ?? 0) > 0 ? "positive" : (topStock.priceChangePercent ?? 0) < 0 ? "negative" : "neutral",
    });
  }

  if (!rows.length) {
    rows.push({
      kind: "coverage",
      label: "Coverage",
      name: "Leadership pending",
      nameKey: "leadership_pending",
      performanceBadge: "—",
      performanceTone: "neutral",
    });
  }

  return {
    rows,
    footer: "Based on price change %",
    primary,
  };
}
