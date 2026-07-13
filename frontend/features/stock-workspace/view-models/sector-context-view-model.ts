import type { SectorContextDto } from "@/lib/api/stock-details-api";
import { formatFinancialDisplay, formatNumber, formatPercent } from "@/lib/formatters/financial-formatters";

export type SectorKpiTone = "positive" | "negative" | "neutral" | "info";
export type SectorRelationKey =
  | "discount"
  | "premium"
  | "near_average"
  | "above_median"
  | "below_median"
  | "near_median";
export type SectorAchievementKey =
  | "largest_company"
  | "top_market_cap"
  | "highest_dividend_yield"
  | "top_dividend_yield"
  | "best_value"
  | "top_value_opportunity";
export type SectorHeadlineFact =
  | "below_sector_valuation"
  | "above_sector_valuation"
  | "sector_leader"
  | "relative_value"
  | "positive_sector_momentum"
  | "soft_sector_backdrop";

export type SectorAchievement = {
  key: SectorAchievementKey;
  rank?: number;
  label: string;
};

export type SectorKpiCell = {
  key: string;
  label: string;
  value: string;
  helper: string | null;
  tone: SectorKpiTone;
  helperKind?: "trend" | "comparison";
  helperValue?: string;
  helperRelation?: SectorRelationKey;
};

export type SectorPerformerHighlight = {
  symbol: string;
  changePercent: string;
  tone: "positive" | "negative";
};

export type SectorIntelligenceViewModel = {
  sectorName: string;
  stockCount: string;
  headline: string;
  kpis: SectorKpiCell[];
  achievements: SectorAchievement[];
  headlineFacts: SectorHeadlineFact[];
  topPerformer: SectorPerformerHighlight | null;
  worstPerformer: SectorPerformerHighlight | null;
};


export function formatComparativeMetricValue(key: string, value: number | null | undefined) {
  if (key === "dividend_yield" || key === "eps_growth") {
    return formatFinancialDisplay(value, (parsed) => `${formatNumber(parsed)}%`, { allowZero: true });
  }
  return formatFinancialDisplay(value, (parsed) => formatNumber(parsed));
}

function formatMetricValue(key: string, value: number | null | undefined) {
  return formatComparativeMetricValue(key, value);
}

function findComparativeMetric(
  sectorContext: SectorContextDto,
  key: string,
): SectorContextDto["comparative_snapshot"][number] | undefined {
  return sectorContext.comparative_snapshot.find((metric) => metric.key === key);
}

function relativeValuationLabel(stockValue: number, sectorMedian: number): SectorRelationKey {
  if (sectorMedian <= 0) {
    return "near_average";
  }
  const ratio = stockValue / sectorMedian;
  if (ratio <= 0.85) {
    return "discount";
  }
  if (ratio >= 1.15) {
    return "premium";
  }
  return "near_average";
}

function relativeYieldLabel(stockValue: number, sectorMedian: number): SectorRelationKey {
  if (stockValue > sectorMedian * 1.1) {
    return "above_median";
  }
  if (stockValue < sectorMedian * 0.9) {
    return "below_median";
  }
  return "near_median";
}

function valuationTone(label: SectorRelationKey): SectorKpiTone {
  if (label === "discount") {
    return "positive";
  }
  if (label === "premium") {
    return "negative";
  }
  return "neutral";
}

function yieldTone(label: SectorRelationKey): SectorKpiTone {
  if (label === "above_median") {
    return "positive";
  }
  if (label === "below_median") {
    return "negative";
  }
  return "neutral";
}

export function resolveSectorTrendLabel(percent: number | null | undefined): "Bullish" | "Neutral" | "Weak" | null {
  if (percent == null) {
    return null;
  }
  if (percent >= 0.5) {
    return "Bullish";
  }
  if (percent <= -0.5) {
    return "Weak";
  }
  return "Neutral";
}

function resolveSectorTrendTone(label: "Bullish" | "Neutral" | "Weak"): SectorKpiTone {
  if (label === "Bullish") {
    return "positive";
  }
  if (label === "Weak") {
    return "negative";
  }
  return "neutral";
}

export function formatRankAchievement(rank: SectorContextDto["ranks"][number]): SectorAchievement | null {
  switch (rank.key) {
    case "market_cap":
      if (rank.rank === 1) {
        return { key: "largest_company", rank: rank.rank, label: "Largest Company in Sector" };
      }
      if (rank.rank <= 3) {
        return { key: "top_market_cap", rank: rank.rank, label: `Top ${rank.rank} by Market Cap` };
      }
      return null;
    case "dividend_yield":
      if (rank.rank === 1) {
        return { key: "highest_dividend_yield", rank: rank.rank, label: "Highest Dividend Yield" };
      }
      if (rank.rank <= 3) {
        return { key: "top_dividend_yield", rank: rank.rank, label: `Top ${rank.rank} Dividend Yield` };
      }
      if (rank.rank <= 5) {
        return { key: "top_dividend_yield", rank: rank.rank, label: `Top ${rank.rank} Dividend Yield` };
      }
      return null;
    case "valuation":
      if (rank.rank === 1) {
        return { key: "best_value", rank: rank.rank, label: "Best Value in Sector" };
      }
      if (rank.rank <= 3) {
        return { key: "top_value_opportunity", rank: rank.rank, label: `Top ${rank.rank} Value Opportunity` };
      }
      if (rank.rank <= 5) {
        return { key: "top_value_opportunity", rank: rank.rank, label: `Top ${rank.rank} Value Opportunity` };
      }
      return null;
    default:
      return null;
  }
}

function buildSectorKpis(sectorContext: SectorContextDto): SectorKpiCell[] {
  const kpis: SectorKpiCell[] = [];

  const trendLabel = resolveSectorTrendLabel(sectorContext.sector_trend_percent);
  if (trendLabel) {
    const windowLabel = sectorContext.sector_trend_window?.toUpperCase() ?? "5D";
    kpis.push({
      key: "sector-trend",
      label: `${windowLabel} Sector Trend`,
      value: trendLabel,
      helper: formatFinancialDisplay(sectorContext.sector_trend_percent, (parsed) => formatPercent(parsed)),
      tone: resolveSectorTrendTone(trendLabel),
      helperKind: "trend",
      helperValue: formatFinancialDisplay(sectorContext.sector_trend_percent, (parsed) => formatPercent(parsed)),
    });
  }

  const pe = findComparativeMetric(sectorContext, "pe");
  if (pe?.stock_value != null && pe.sector_median != null && pe.stock_value > 0 && pe.sector_median > 0) {
    const helper = relativeValuationLabel(pe.stock_value, pe.sector_median);
    kpis.push({
      key: "pe",
      label: "P/E vs Sector",
      value: formatMetricValue("pe", pe.stock_value),
      helper: `Sector ${formatMetricValue("pe", pe.sector_median)} · ${helper}`,
      tone: valuationTone(helper),
      helperKind: "comparison",
      helperValue: formatMetricValue("pe", pe.sector_median),
      helperRelation: helper,
    });
  }

  const dividendYield = findComparativeMetric(sectorContext, "dividend_yield");
  if (
    dividendYield?.stock_value != null &&
    dividendYield.sector_median != null &&
    dividendYield.stock_value >= 0 &&
    dividendYield.sector_median >= 0
  ) {
    const helper = relativeYieldLabel(dividendYield.stock_value, dividendYield.sector_median);
    kpis.push({
      key: "dividend_yield",
      label: "Yield vs Sector",
      value: formatMetricValue("dividend_yield", dividendYield.stock_value),
      helper: `Sector ${formatMetricValue("dividend_yield", dividendYield.sector_median)} · ${helper}`,
      tone: yieldTone(helper),
      helperKind: "comparison",
      helperValue: formatMetricValue("dividend_yield", dividendYield.sector_median),
      helperRelation: helper,
    });
  }

  return kpis.slice(0, 3);
}

function buildHeadline(
  sectorContext: SectorContextDto,
  achievements: SectorAchievement[],
): { text: string; facts: SectorHeadlineFact[] } {
  const pe = findComparativeMetric(sectorContext, "pe");
  const fragments: string[] = [];
  const facts: SectorHeadlineFact[] = [];

  if (pe?.stock_value != null && pe.sector_median != null && pe.stock_value > 0 && pe.sector_median > 0) {
    const relative = relativeValuationLabel(pe.stock_value, pe.sector_median);
    if (relative === "discount") {
      fragments.push("trades below sector valuation");
      facts.push("below_sector_valuation");
    } else if (relative === "premium") {
      fragments.push("trades above sector valuation");
      facts.push("above_sector_valuation");
    }
  }

  if (achievements.some((item) => item.key === "largest_company" || item.key === "top_market_cap")) {
    fragments.push("stands among sector leaders");
    facts.push("sector_leader");
  } else if (achievements.some((item) => item.key === "best_value" || item.key === "top_value_opportunity")) {
    fragments.push("offers relative value in its sector");
    facts.push("relative_value");
  }

  const trend = resolveSectorTrendLabel(sectorContext.sector_trend_percent);
  if (trend === "Bullish" && fragments.length < 2) {
    fragments.push("benefits from positive sector momentum");
    facts.push("positive_sector_momentum");
  } else if (trend === "Weak" && fragments.length < 2) {
    fragments.push("faces a soft sector backdrop");
    facts.push("soft_sector_backdrop");
  }

  if (!fragments.length) {
    return { text: `Positioned within ${sectorContext.stock_count} ${sectorContext.sector_name} peers.`, facts };
  }

  return { text: `This stock ${fragments.slice(0, 2).join(" and ")}.`, facts };
}

export function buildSectorIntelligenceViewModel(
  sectorContext: SectorContextDto | null | undefined,
): SectorIntelligenceViewModel | null {
  if (!sectorContext) {
    return null;
  }

  const achievements = sectorContext.ranks
    .map((rank) => formatRankAchievement(rank))
    .filter((achievement): achievement is SectorAchievement => Boolean(achievement));
  const headline = buildHeadline(sectorContext, achievements);

  return {
    sectorName: sectorContext.sector_name,
    stockCount: String(sectorContext.stock_count),
    headline: headline.text,
    headlineFacts: headline.facts,
    kpis: buildSectorKpis(sectorContext),
    achievements,
    topPerformer: sectorContext.top_performer
      ? {
          symbol: sectorContext.top_performer.symbol,
          changePercent: formatPercent(sectorContext.top_performer.change_percent),
          tone: "positive",
        }
      : null,
    worstPerformer: sectorContext.worst_performer
      ? {
          symbol: sectorContext.worst_performer.symbol,
          changePercent: formatPercent(sectorContext.worst_performer.change_percent),
          tone: "negative",
        }
      : null,
  };
}
