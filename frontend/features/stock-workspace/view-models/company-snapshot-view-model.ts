import type { DisplayMetricsDto } from "@/lib/api/stock-decision-support-types";
import type { StockDecisionViewModel } from "@/features/stock-workspace/view-models/stock-decision-view-model";
import type { StockWorkspaceModel } from "@/features/stock-workspace/view-models/stock-workspace-view-model";
import { formatFinancialDisplay, formatNumber } from "@/lib/formatters/financial-formatters";
import { formatOwnershipPercent, formatValuationMetric } from "@/features/stock-workspace/view-models/stock-decision-view-model";
import { resolveLivePeRatio } from "@/features/stock-workspace/view-models/mark-to-market-helpers";

export type CompanySnapshotCell = {
  key: string;
  label: string;
  value: string;
  href?: string;
};

const EMPTY_LABEL = "—";

function formatTextValue(value: string | null | undefined, options: { invalid?: string[] } = {}) {
  const trimmed = value?.trim();
  if (!trimmed) {
    return EMPTY_LABEL;
  }

  if (options.invalid?.includes(trimmed)) {
    return EMPTY_LABEL;
  }

  return trimmed;
}

function formatListingYear(listingDate: string | null | undefined) {
  if (!listingDate) {
    return EMPTY_LABEL;
  }

  const year = listingDate.slice(0, 4);
  return /^\d{4}$/.test(year) ? year : EMPTY_LABEL;
}

function formatDividendYield(value: number | null | undefined) {
  return formatFinancialDisplay(value, (parsed) => `${formatNumber(parsed)}%`, { allowZero: true });
}

function resolvePeDisplay(
  model: StockWorkspaceModel,
  decision: StockDecisionViewModel,
  displayMetrics?: DisplayMetricsDto | null,
) {
  if (displayMetrics && displayMetrics.pe_ratio !== undefined) {
    return formatValuationMetric(displayMetrics.pe_ratio);
  }

  const currentPrice = model.intelligence?.latestPrice ?? null;
  const valuation = decision.valuation;
  return formatValuationMetric(
    resolveLivePeRatio(currentPrice, null, valuation?.pe_ratio, valuation?.close_price),
  );
}

export function buildCompanySnapshotStrip(
  model: StockWorkspaceModel,
  decision: StockDecisionViewModel,
  displayMetrics?: DisplayMetricsDto | null,
): CompanySnapshotCell[] {
  const sector = formatTextValue(model.header.sector, { invalid: ["Unclassified"] });
  const sectorSearch = sector !== EMPTY_LABEL ? sector : null;

  return [
    {
      key: "sector",
      label: "Sector",
      value: sector,
      href: sectorSearch ? `/stocks?search=${encodeURIComponent(sectorSearch)}` : undefined,
    },
    {
      key: "category",
      label: "Category",
      value: formatTextValue(model.header.category, { invalid: ["N/A"] }),
    },
    {
      key: "listing-year",
      label: "Listing Year",
      value: formatListingYear(model.header.listingDate),
    },
    {
      key: "market-cap",
      label: "Market Cap",
      value: model.header.marketCap,
    },
    {
      key: "pe",
      label: "P/E",
      value: resolvePeDisplay(model, decision, displayMetrics),
    },
    {
      key: "dividend-yield",
      label: "Dividend Yield",
      value: formatDividendYield(decision.valuation?.dividend_yield),
    },
    {
      key: "free-float",
      label: "Free Float",
      value: decision.ownership ? formatOwnershipPercent(decision.ownership.free_float_percent) : EMPTY_LABEL,
    },
  ];
}
