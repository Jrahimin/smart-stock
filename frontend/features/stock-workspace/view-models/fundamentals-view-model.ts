import type { FundamentalsSnapshotDto } from "@/lib/api/stock-decision-support-types";
import type { StockDecisionViewModel } from "@/features/stock-workspace/view-models/stock-decision-view-model";
import { formatValuationMetric } from "@/features/stock-workspace/view-models/stock-decision-view-model";
import { formatCompactNumber, formatFinancialDisplay, formatNumber } from "@/lib/formatters/financial-formatters";

export type FundamentalsMetricCell = {
  key: string;
  label: string;
  value: string;
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

export function buildFundamentalsViewModel(
  decision: StockDecisionViewModel,
  snapshot: FundamentalsSnapshotDto | null | undefined,
): FundamentalsViewModel {
  const performanceAsOf = snapshot?.latest_as_of_date ?? null;
  const fiscalPeriodNote =
    snapshot?.latest_fiscal_year && snapshot.latest_as_of_date
      ? `Latest fiscal data: FY ${snapshot.latest_fiscal_year} (as of ${snapshot.latest_as_of_date})`
      : snapshot?.latest_fiscal_year
        ? `Latest fiscal data: FY ${snapshot.latest_fiscal_year}`
        : null;

  const valuation = decision.valuation;
  const valuationHelper = formatValuationHelper(valuation?.valuation_date, performanceAsOf);

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
      value: formatPerformanceMetricValue(metricCode, metric?.value),
      helper: formatPerformanceHelper(metric?.fiscal_year, metric?.as_of_date),
    };
  });

  const valuationMetrics: FundamentalsMetricCell[] = [
    {
      key: "pe",
      label: "P/E",
      value: formatValuationMetric(valuation?.pe_ratio),
      helper: valuationHelper,
    },
    {
      key: "pb",
      label: "P/B",
      value: formatValuationMetric(valuation?.pb_ratio),
      helper: valuationHelper,
    },
    {
      key: "dividend-yield",
      label: "Dividend Yield",
      value: formatDividendYield(valuation?.dividend_yield),
      helper: valuationHelper,
    },
    {
      key: "earnings-yield",
      label: "Earnings Yield",
      value: formatEarningsYield(valuation?.earnings_yield),
      helper: valuationHelper,
    },
  ];

  return {
    fiscalPeriodNote,
    metrics: [...performanceMetrics, ...valuationMetrics],
  };
}
