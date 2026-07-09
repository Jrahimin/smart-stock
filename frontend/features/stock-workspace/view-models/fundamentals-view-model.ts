import type { SectorContextDto } from "@/lib/api/stock-details-api";
import type { FundamentalsSnapshotDto } from "@/lib/api/stock-decision-support-types";
import type { StockDecisionViewModel } from "@/features/stock-workspace/view-models/stock-decision-view-model";
import { formatValuationMetric } from "@/features/stock-workspace/view-models/stock-decision-view-model";
import { formatComparativeMetricValue } from "@/features/stock-workspace/view-models/sector-context-view-model";
import { formatCompactNumber, formatFinancialDisplay, formatNumber } from "@/lib/formatters/financial-formatters";

export type FundamentalsMetricCell = {
  key: string;
  label: string;
  stock: string;
  sector: string;
  market: string;
  helper?: string;
};

export type FundamentalsViewModel = {
  fiscalPeriodNote: string | null;
  metrics: FundamentalsMetricCell[];
};

const PERFORMANCE_METRIC_ORDER = ["EPS", "NAV_PER_SHARE", "REVENUE", "NET_PROFIT_AFTER_TAX"] as const;

function formatPerformanceMetricValue(metricCode: string, value: number | null | undefined) {
  if (metricCode === "EPS" || metricCode === "NAV_PER_SHARE") {
    return formatFinancialDisplay(value, (parsed) => formatNumber(parsed));
  }

  return formatFinancialDisplay(value, (parsed) => formatCompactNumber(parsed));
}

function formatPerformanceHelper(
  fiscalYear: number | null | undefined,
  asOfDate: string | null | undefined,
) {
  if (!fiscalYear && !asOfDate) {
    return undefined;
  }

  if (fiscalYear && asOfDate) {
    return `FY ${fiscalYear}`;
  }

  if (fiscalYear) {
    return `FY ${fiscalYear}`;
  }

  return `As of ${asOfDate}`;
}

function formatDividendYield(value: number | null | undefined) {
  return formatFinancialDisplay(value, (parsed) => `${formatNumber(parsed)}%`, { allowZero: true });
}

function formatEarningsYield(value: number | null | undefined) {
  return formatFinancialDisplay(value, (parsed) => `${formatNumber(parsed)}%`);
}

function formatValuationHelper(valuationDate: string | null | undefined, performanceAsOf: string | null | undefined) {
  if (!valuationDate) {
    return undefined;
  }

  if (performanceAsOf && valuationDate === performanceAsOf) {
    return undefined;
  }

  return `As of ${valuationDate}`;
}

function lookupPerformanceMetric(snapshot: FundamentalsSnapshotDto | null | undefined, metricCode: string) {
  return snapshot?.metrics.find((metric) => metric.metric_code === metricCode);
}

function findComparativeMetric(sectorContext: SectorContextDto | null | undefined, key: string) {
  return sectorContext?.comparative_snapshot.find((metric) => metric.key === key);
}

function buildComparisonColumns(
  sectorContext: SectorContextDto | null | undefined,
  comparativeKey: string | undefined,
): Pick<FundamentalsMetricCell, "sector" | "market"> {
  if (!comparativeKey) {
    return { sector: "—", market: "—" };
  }

  const metric = findComparativeMetric(sectorContext, comparativeKey);
  if (!metric) {
    return { sector: "—", market: "—" };
  }

  return {
    sector: formatComparativeMetricValue(metric.key, metric.sector_median),
    market: formatComparativeMetricValue(metric.key, metric.market_median),
  };
}

function hasMeaningfulValue(value: string) {
  return value !== "—";
}

function resolveLivePeRatio(
  currentPrice: number | null | undefined,
  eps: number | null | undefined,
  valuationPe: number | null | undefined,
  valuationClose: number | null | undefined,
) {
  if (currentPrice != null && currentPrice > 0 && eps != null && eps > 0) {
    return currentPrice / eps;
  }

  if (
    currentPrice != null &&
    currentPrice > 0 &&
    valuationPe != null &&
    valuationPe > 0 &&
    valuationClose != null &&
    valuationClose > 0
  ) {
    return valuationPe * (currentPrice / valuationClose);
  }

  return valuationPe ?? null;
}

function resolveLiveEarningsYield(
  currentPrice: number | null | undefined,
  eps: number | null | undefined,
  valuationEarningsYield: number | null | undefined,
  valuationClose: number | null | undefined,
) {
  if (currentPrice != null && currentPrice > 0 && eps != null && eps > 0) {
    return (eps / currentPrice) * 100;
  }

  if (
    currentPrice != null &&
    currentPrice > 0 &&
    valuationEarningsYield != null &&
    valuationClose != null &&
    valuationClose > 0
  ) {
    return valuationEarningsYield * (valuationClose / currentPrice);
  }

  return valuationEarningsYield ?? null;
}

function resolveLivePbRatio(
  currentPrice: number | null | undefined,
  nav: number | null | undefined,
  valuationPb: number | null | undefined,
  valuationClose: number | null | undefined,
) {
  if (currentPrice != null && currentPrice > 0 && nav != null && nav > 0) {
    return currentPrice / nav;
  }

  if (
    currentPrice != null &&
    currentPrice > 0 &&
    valuationPb != null &&
    valuationPb > 0 &&
    valuationClose != null &&
    valuationClose > 0
  ) {
    return valuationPb * (currentPrice / valuationClose);
  }

  return valuationPb ?? null;
}

export function buildFundamentalsViewModel(
  decision: StockDecisionViewModel,
  snapshot: FundamentalsSnapshotDto | null | undefined,
  sectorContext?: SectorContextDto | null,
  currentPrice?: number | null,
): FundamentalsViewModel {
  const performanceAsOf = snapshot?.latest_as_of_date ?? null;
  const fiscalPeriodNote =
    snapshot?.latest_fiscal_year && snapshot.latest_as_of_date
      ? `Latest fiscal data: FY ${snapshot.latest_fiscal_year} (as of ${snapshot.latest_as_of_date})`
      : snapshot?.latest_fiscal_year
        ? `Latest fiscal data: FY ${snapshot.latest_fiscal_year}`
        : null;

  const valuation = decision.valuation;
  const eps = lookupPerformanceMetric(snapshot, "EPS")?.value ?? null;
  const nav = lookupPerformanceMetric(snapshot, "NAV_PER_SHARE")?.value ?? null;
  const livePrice = currentPrice ?? valuation?.close_price ?? null;
  const livePe = resolveLivePeRatio(livePrice, eps, valuation?.pe_ratio, valuation?.close_price);
  const livePb = resolveLivePbRatio(livePrice, nav, valuation?.pb_ratio, valuation?.close_price);
  const liveEarningsYield = resolveLiveEarningsYield(
    livePrice,
    eps,
    valuation?.earnings_yield,
    valuation?.close_price,
  );
  const valuationHelper =
    livePrice != null && valuation?.close_price != null && livePrice !== valuation.close_price
      ? "Marked to latest price"
      : formatValuationHelper(valuation?.valuation_date, performanceAsOf);

  const performanceMetrics: FundamentalsMetricCell[] = PERFORMANCE_METRIC_ORDER.map((metricCode) => {
    const metric = lookupPerformanceMetric(snapshot, metricCode);
    const label =
      metricCode === "EPS"
        ? "EPS"
        : metricCode === "NAV_PER_SHARE"
          ? "NAV"
          : metricCode === "REVENUE"
            ? "Revenue"
            : "Net Profit";

    return {
      key: metricCode,
      label,
      stock: formatPerformanceMetricValue(metricCode, metric?.value),
      ...buildComparisonColumns(sectorContext, undefined),
      helper: formatPerformanceHelper(metric?.fiscal_year, metric?.as_of_date),
    };
  });

  const valuationMetrics: FundamentalsMetricCell[] = [
    {
      key: "pe",
      label: "P/E",
      stock: formatValuationMetric(livePe),
      ...buildComparisonColumns(sectorContext, "pe"),
      helper: valuationHelper,
    },
    {
      key: "pb",
      label: "P/B",
      stock: formatValuationMetric(livePb),
      ...buildComparisonColumns(sectorContext, "pb"),
      helper: valuationHelper,
    },
    {
      key: "dividend-yield",
      label: "Dividend Yield",
      stock: formatDividendYield(valuation?.dividend_yield),
      ...buildComparisonColumns(sectorContext, "dividend_yield"),
      helper: formatValuationHelper(valuation?.valuation_date, performanceAsOf),
    },
    {
      key: "earnings-yield",
      label: "Earnings Yield",
      stock: formatEarningsYield(liveEarningsYield),
      ...buildComparisonColumns(sectorContext, undefined),
      helper: valuationHelper,
    },
  ];

  const epsGrowth = findComparativeMetric(sectorContext, "eps_growth");
  const growthMetric: FundamentalsMetricCell | null = epsGrowth
    ? {
        key: "eps-growth",
        label: "EPS Growth",
        stock: formatComparativeMetricValue("eps_growth", epsGrowth.stock_value),
        sector: formatComparativeMetricValue("eps_growth", epsGrowth.sector_median),
        market: formatComparativeMetricValue("eps_growth", epsGrowth.market_median),
      }
    : null;

  const metrics = [...performanceMetrics, ...valuationMetrics, ...(growthMetric ? [growthMetric] : [])].filter((metric) =>
    hasMeaningfulValue(metric.stock),
  );

  return {
    fiscalPeriodNote,
    metrics,
  };
}
