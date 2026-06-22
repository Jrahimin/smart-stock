import { getSanchayapatraConfig } from "@/features/wealth/catalog/sanchayapatra-catalog";
import {
  ensureAssetPlanningDates,
  formatDateLabel,
  metadataValue,
  resolveAssetEndDate,
  resolveAssetStartDate,
  type SnapshotDraftAsset,
  type SnapshotDraftLiability,
} from "@/features/wealth/lib/snapshot-entry-helpers";
import { futureValueAnnuity, lumpSumGrowth } from "@/features/wealth/lib/wealth-comparison-math";
import { formatWealthCurrency } from "@/features/wealth/view-models/wealth-view-model";

export type SnapshotCompletenessItem = {
  id: "assets" | "rates" | "dates" | "savings";
  label: string;
  complete: boolean;
};

export type SnapshotCompleteness = {
  percent: number;
  items: SnapshotCompletenessItem[];
};

export type AssetAllocationSlice = {
  key: string;
  label: string;
  value: number;
  percent: number;
  color: string;
};

export type MoneyEventKind = "profit" | "maturity" | "emi" | "payoff";

export type UpcomingMoneyEvent = {
  date: Date;
  dateLabel: string;
  label: string;
  value: string;
  kind: MoneyEventKind;
};

export type UpcomingMoneyEventGroup = {
  id: "30-days" | "12-months";
  label: string;
  events: UpcomingMoneyEvent[];
};

const ALLOCATION_COLORS: Record<string, string> = {
  cash: "#4bd6a4",
  fdr: "#7bb7ff",
  dps: "#9d8cff",
  sanchayapatra: "#f0c36a",
  stocks: "#ff9b8f",
  gold: "#ffd166",
  property: "#6ecfcf",
  other: "#a8b3cf",
};

const EVENT_KIND_PRIORITY: Record<MoneyEventKind, number> = {
  profit: 0,
  maturity: 1,
  payoff: 2,
  emi: 3,
};

export function computeSnapshotCompleteness(
  assets: SnapshotDraftAsset[],
  liabilities: SnapshotDraftLiability[],
  monthlySavings: string,
): SnapshotCompleteness {
  const valuedAssets = assets.filter((asset) => Number(asset.value) > 0);
  const hasRates =
    valuedAssets.some((asset) => Boolean(metadataValue(asset.metadata, "interest_rate"))) ||
    liabilities.some((liability) => Boolean(liability.interest_rate));
  const hasDates =
    valuedAssets.some((asset) => {
      const metadata = ensureAssetPlanningDates(asset);
      return Boolean(
        resolveAssetStartDate(metadata) ||
          resolveAssetEndDate(metadata) ||
          metadataValue(metadata, "payment_count"),
      );
    }) ||
    liabilities.some(
      (liability) => Boolean(liability.remaining_months) || Boolean(metadataValue(liability.metadata, "start_date")),
    );

  const items: SnapshotCompletenessItem[] = [
    { id: "assets", label: "Assets Added", complete: valuedAssets.length > 0 },
    { id: "rates", label: "Rates Added", complete: hasRates },
    { id: "dates", label: "Dates Added", complete: hasDates },
    { id: "savings", label: "Monthly Savings", complete: Boolean(monthlySavings && Number(monthlySavings) > 0) },
  ];

  const completeCount = items.filter((item) => item.complete).length;

  return {
    percent: Math.round((completeCount / items.length) * 100),
    items,
  };
}

export function buildAssetAllocation(assets: SnapshotDraftAsset[]): AssetAllocationSlice[] {
  const totals = new Map<string, { label: string; value: number }>();

  for (const asset of assets) {
    const amount = Number(asset.value);
    if (!amount) {
      continue;
    }
    const key = allocationKeyForAsset(asset);
    const label = allocationLabelForAsset(asset);
    const current = totals.get(key) ?? { label, value: 0 };
    totals.set(key, { label, value: current.value + amount });
  }

  const totalValue = [...totals.values()].reduce((sum, item) => sum + item.value, 0);
  if (!totalValue) {
    return [];
  }

  return [...totals.entries()]
    .map(([key, item]) => ({
      key,
      label: item.label,
      value: item.value,
      percent: Math.round((item.value / totalValue) * 100),
      color: ALLOCATION_COLORS[key] ?? ALLOCATION_COLORS.other,
    }))
    .sort((left, right) => right.value - left.value);
}

export function buildUpcomingMoneyEventGroups(
  assets: SnapshotDraftAsset[],
  liabilities: SnapshotDraftLiability[],
  today = startOfDay(new Date()),
): UpcomingMoneyEventGroup[] {
  const events = buildUpcomingMoneyEvents(assets, liabilities, today);
  const in30Days = addDays(today, 30);
  const in12Months = addMonths(today, 12);

  const next30Days = events.filter((event) => event.date <= in30Days);
  const next12Months = events.filter((event) => event.date > in30Days && event.date <= in12Months);

  const groups: UpcomingMoneyEventGroup[] = [];
  if (next30Days.length) {
    groups.push({ id: "30-days", label: "Next 30 Days", events: next30Days });
  }
  if (next12Months.length) {
    groups.push({ id: "12-months", label: "Next 12 Months", events: next12Months });
  }
  return groups;
}

export function estimateAssetExpectedValue(asset: SnapshotDraftAsset): { expectedValue: number; growth: number } | null {
  const metadata = ensureAssetPlanningDates(asset);
  const principal = Number(asset.value);
  if (!principal) {
    return null;
  }

  const storedMaturity = metadataValue(metadata, "projected_maturity");
  if (storedMaturity) {
    const expectedValue = Number(storedMaturity);
    if (expectedValue > 0) {
      return { expectedValue, growth: Math.max(0, expectedValue - principal) };
    }
  }

  if (asset.category !== "DEPOSIT" && asset.category !== "SANCHAYAPATRA") {
    return null;
  }

  const depositType = metadataValue(metadata, "deposit_type");
  const certificateType = metadataValue(metadata, "certificate_type") || "family-savings";
  const certificateConfig = getSanchayapatraConfig(certificateType);
  const rate = Number(
    metadataValue(metadata, "interest_rate") ||
      (asset.category === "SANCHAYAPATRA" ? certificateConfig.defaultRate : 9),
  );

  if (depositType === "dps") {
    const paymentCount = Number(metadataValue(metadata, "payment_count"));
    if (rate && paymentCount) {
      const expectedValue = futureValueAnnuity(principal, rate, paymentCount / 12);
      if (expectedValue > principal) {
        return { expectedValue, growth: expectedValue - principal };
      }
    }
    return null;
  }

  const startDate = resolveAssetStartDate(metadata);
  const endDate = resolveAssetEndDate(metadata);
  if (rate && startDate && endDate) {
    const years = yearsBetweenDates(startDate, endDate);
    if (years > 0) {
      const expectedValue = lumpSumGrowth(principal, rate, years);
      if (expectedValue > principal) {
        return { expectedValue, growth: expectedValue - principal };
      }
    }
  }

  if (asset.category === "SANCHAYAPATRA" && rate && metadataValue(metadata, "purchase_date")) {
    const years = certificateConfig.durationYears;
    const expectedValue = lumpSumGrowth(principal, rate, years);
    if (expectedValue > principal) {
      return { expectedValue, growth: expectedValue - principal };
    }
  }

  return null;
}

export function formatAssetProjectionLine(asset: SnapshotDraftAsset) {
  const projection = estimateAssetExpectedValue(asset);
  if (!projection) {
    return null;
  }
  if (projection.growth > 0) {
    return `Expected: ${formatWealthCurrency(projection.expectedValue)} (+${formatWealthCurrency(projection.growth)})`;
  }
  return `Expected: ${formatWealthCurrency(projection.expectedValue)}`;
}

function buildUpcomingMoneyEvents(
  assets: SnapshotDraftAsset[],
  liabilities: SnapshotDraftLiability[],
  today: Date,
): UpcomingMoneyEvent[] {
  const events: UpcomingMoneyEvent[] = [];

  for (const asset of assets) {
    const metadata = ensureAssetPlanningDates(asset);
    const maturityDateValue = resolveAssetEndDate(metadata);
    const maturityDate = maturityDateValue ? parseDate(maturityDateValue) : null;
    appendProfitEvents(asset, metadata, today, maturityDate, events);

    if (maturityDate && maturityDate >= today) {
      events.push({
        date: maturityDate,
        dateLabel: formatDateLabel(maturityDateValue),
        label: `${asset.label} matures`,
        value: formatWealthCurrency(asset.value),
        kind: "maturity",
      });
    }
  }

  for (const liability of liabilities) {
    if (liability.monthly_emi && Number(liability.monthly_emi) > 0) {
      const paymentDate = addMonths(today, 1);
      events.push({
        date: paymentDate,
        dateLabel: formatDateLabel(toDateInput(paymentDate)),
        label: `${liability.label} EMI`,
        value: formatWealthCurrency(liability.monthly_emi),
        kind: "emi",
      });
    }

    if (liability.remaining_months && Number(liability.remaining_months) > 0) {
      const payoffDate = addMonths(today, Number(liability.remaining_months));
      if (payoffDate >= today) {
        events.push({
          date: payoffDate,
          dateLabel: formatDateLabel(toDateInput(payoffDate)),
          label: `${liability.label} completed`,
          value: "Debt free",
          kind: "payoff",
        });
      }
    }
  }

  return events
    .filter((event) => event.date >= today)
    .sort((left, right) => {
      const dateDiff = left.date.getTime() - right.date.getTime();
      if (dateDiff !== 0) {
        return dateDiff;
      }
      return EVENT_KIND_PRIORITY[left.kind] - EVENT_KIND_PRIORITY[right.kind];
    })
    .slice(0, 12);
}

function appendProfitEvents(
  asset: SnapshotDraftAsset,
  metadata: Record<string, unknown>,
  today: Date,
  maturityDate: Date | null,
  events: UpcomingMoneyEvent[],
) {
  if (asset.category !== "DEPOSIT" && asset.category !== "SANCHAYAPATRA") {
    return;
  }

  const periodicProfit = estimatePeriodicProfitValue({ ...asset, metadata });
  if (!periodicProfit) {
    return;
  }

  const interval = payoutMonths(metadata, asset.category);
  let payoutDate = addMonths(today, interval);
  let added = 0;

  while (added < 3) {
    if (payoutDate < today) {
      payoutDate = addMonths(payoutDate, interval);
      continue;
    }
    if (maturityDate && payoutDate > maturityDate) {
      break;
    }

    events.push({
      date: payoutDate,
      dateLabel: formatDateLabel(toDateInput(payoutDate)),
      label: `${asset.label} profit`,
      value: formatWealthCurrency(periodicProfit),
      kind: "profit",
    });
    payoutDate = addMonths(payoutDate, interval);
    added += 1;
  }
}

export function estimatePeriodicProfitValue(asset: SnapshotDraftAsset) {
  const distribution =
    metadataValue(asset.metadata, "profit_distribution") ||
    (asset.category === "SANCHAYAPATRA" ? getSanchayapatraConfig(metadataValue(asset.metadata, "certificate_type") || "family-savings").profitDistribution : "monthly");
  const months = distribution === "quarterly" ? 3 : distribution === "yearly" ? 12 : distribution === "maturity" ? 0 : 1;
  if (!months) {
    return null;
  }
  const amount = Number(asset.value);
  const certificateType = metadataValue(asset.metadata, "certificate_type") || "family-savings";
  const rate = Number(
    asset.metadata.interest_rate ||
      (asset.category === "SANCHAYAPATRA" ? getSanchayapatraConfig(certificateType).defaultRate : undefined) ||
      9,
  );
  if (!amount || !rate) {
    return null;
  }
  return Math.round((amount * rate * months) / 1200);
}

function payoutMonths(metadata: Record<string, unknown>, category: string) {
  const distribution =
    metadataValue(metadata, "profit_distribution") ||
    (category === "SANCHAYAPATRA" ? getSanchayapatraConfig(metadataValue(metadata, "certificate_type") || "family-savings").profitDistribution : "monthly");
  if (distribution === "quarterly") {
    return 3;
  }
  if (distribution === "yearly") {
    return 12;
  }
  return 1;
}

function allocationKeyForAsset(asset: SnapshotDraftAsset) {
  const depositType = metadataValue(asset.metadata, "deposit_type");
  if (depositType === "fdr") {
    return "fdr";
  }
  if (depositType === "dps") {
    return "dps";
  }
  if (asset.category === "SANCHAYAPATRA") {
    return "sanchayapatra";
  }
  if (asset.category === "CASH") {
    return "cash";
  }
  if (asset.category === "STOCK") {
    return "stocks";
  }
  if (asset.category === "GOLD") {
    return "gold";
  }
  if (asset.category === "PROPERTY") {
    return "property";
  }
  return "other";
}

function allocationLabelForAsset(asset: SnapshotDraftAsset) {
  const labels: Record<string, string> = {
    cash: "Cash",
    fdr: "FDR",
    dps: "DPS",
    sanchayapatra: "Sanchayapatra",
    stocks: "Stocks",
    gold: "Gold",
    property: "Property",
    other: "Other",
  };
  return labels[allocationKeyForAsset(asset)] ?? "Other";
}

function startOfDay(date: Date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function parseDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? startOfDay(new Date()) : startOfDay(date);
}

function toDateInput(date: Date) {
  return date.toISOString().slice(0, 10);
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return startOfDay(next);
}

function addMonths(date: Date, months: number) {
  const next = new Date(date);
  next.setMonth(next.getMonth() + months);
  return startOfDay(next);
}

function yearsBetweenDates(startDate: string, endDate: string) {
  const start = parseDate(startDate);
  const end = parseDate(endDate);
  const diffMs = end.getTime() - start.getTime();
  if (diffMs <= 0) {
    return 0;
  }
  return diffMs / (1000 * 60 * 60 * 24 * 365.25);
}
