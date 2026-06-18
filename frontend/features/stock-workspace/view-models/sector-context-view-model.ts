import type { SectorContextDto } from "@/lib/api/stock-details-api";
import { formatFinancialDisplay, formatNumber, formatPercent } from "@/lib/formatters/financial-formatters";

export type SectorKpiTone = "positive" | "negative" | "neutral" | "info";

export type SectorKpiCell = {
  key: string;
  label: string;
  value: string;
  helper: string | null;
  tone: SectorKpiTone;
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
  achievements: string[];
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

function relativeValuationLabel(stockValue: number, sectorMedian: number) {
  if (sectorMedian <= 0) {
    return "Near Sector Average";
  }
  const ratio = stockValue / sectorMedian;
  if (ratio <= 0.85) {
    return "Discount to Sector";
  }
  if (ratio >= 1.15) {
    return "Premium to Sector";
  }
  return "Near Sector Average";
}

function relativeYieldLabel(stockValue: number, sectorMedian: number) {
  if (stockValue > sectorMedian * 1.1) {
    return "Above Sector Median";
  }
  if (stockValue < sectorMedian * 0.9) {
    return "Below Sector Median";
  }
  return "Near Sector Median";
}

function valuationTone(label: string): SectorKpiTone {
  if (label === "Discount to Sector") {
    return "positive";
  }
  if (label === "Premium to Sector") {
    return "negative";
  }
  return "neutral";
}

function yieldTone(label: string): SectorKpiTone {
  if (label === "Above Sector Median") {
    return "positive";
  }
  if (label === "Below Sector Median") {
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

export function formatRankAchievement(rank: SectorContextDto["ranks"][number]): string | null {
  switch (rank.key) {
    case "market_cap":
      if (rank.rank === 1) {
        return "Largest Company in Sector";
      }
      if (rank.rank <= 3) {
        return `Top ${rank.rank} by Market Cap`;
      }
      return null;
    case "dividend_yield":
      if (rank.rank === 1) {
        return "Highest Dividend Yield";
      }
      if (rank.rank <= 3) {
        return "Top 3 Dividend Yield";
      }
      if (rank.rank <= 5) {
        return "Top 5 Dividend Yield";
      }
      return null;
    case "valuation":
      if (rank.rank === 1) {
        return "Best Value in Sector";
      }
      if (rank.rank <= 3) {
        return "Top 3 Value Opportunity";
      }
      if (rank.rank <= 5) {
        return "Top 5 Value Opportunity";
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
    });
  }

  return kpis.slice(0, 3);
}

function buildHeadline(sectorContext: SectorContextDto, achievements: string[]): string {
  const pe = findComparativeMetric(sectorContext, "pe");
  const fragments: string[] = [];

  if (pe?.stock_value != null && pe.sector_median != null && pe.stock_value > 0 && pe.sector_median > 0) {
    const relative = relativeValuationLabel(pe.stock_value, pe.sector_median);
    if (relative === "Discount to Sector") {
      fragments.push("trades below sector valuation");
    } else if (relative === "Premium to Sector") {
      fragments.push("trades above sector valuation");
    }
  }

  if (achievements.some((item) => item.includes("Largest") || item.includes("Top 1") || item.includes("Top 2 by Market Cap"))) {
    fragments.push("stands among sector leaders");
  } else if (achievements.some((item) => item.includes("Value"))) {
    fragments.push("offers relative value in its sector");
  }

  const trend = resolveSectorTrendLabel(sectorContext.sector_trend_percent);
  if (trend === "Bullish" && fragments.length < 2) {
    fragments.push("benefits from positive sector momentum");
  } else if (trend === "Weak" && fragments.length < 2) {
    fragments.push("faces a soft sector backdrop");
  }

  if (!fragments.length) {
    return `Positioned within ${sectorContext.stock_count} ${sectorContext.sector_name} peers.`;
  }

  return `This stock ${fragments.slice(0, 2).join(" and ")}.`;
}

export function buildSectorIntelligenceViewModel(
  sectorContext: SectorContextDto | null | undefined,
): SectorIntelligenceViewModel | null {
  if (!sectorContext) {
    return null;
  }

  const achievements = sectorContext.ranks
    .map((rank) => formatRankAchievement(rank))
    .filter((label): label is string => Boolean(label));

  return {
    sectorName: sectorContext.sector_name,
    stockCount: String(sectorContext.stock_count),
    headline: buildHeadline(sectorContext, achievements),
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
