import type { TaxPlannerCalculateResponse, TaxPlannerProfileInput, TaxPlannerSlabBreakdown } from "@/features/wealth/types/tax-planner-types";
import type { TaxPlannerConfigResponse, TaxPlannerInvestmentRebateConfig } from "@/features/wealth/types/tax-planner-config-types";

export type RebateLimiter = "income" | "investment" | "cap" | "gross_tax";

export type RebateBreakdown = {
  taxableIncome: number;
  currentInvestment: number;
  incomeLimitPct: number;
  investmentRebatePct: number;
  incomeLimitedRebate: number;
  investmentLimitedRebate: number;
  capLimitedRebate: number;
  maximumAvailableRebate: number;
  appliedRebate: number;
  grossTax: number;
  appliedLimiter: RebateLimiter;
  maxAvailableLimiter: RebateLimiter;
};

const LIMITER_LABELS: Record<RebateLimiter, string> = {
  income: "Limited by Income Rule",
  investment: "Limited by Investment Amount",
  cap: "Limited by Rebate Cap",
  gross_tax: "Limited by Tax Payable",
};

const LIMITER_CHIP_LABELS: Record<RebateLimiter, string> = {
  income: "Income-Limited Rebate",
  investment: "Investment-Limited Rebate",
  cap: "Rebate Cap Applied",
  gross_tax: "Tax Payable Limit",
};

const LIMITING_FACTOR_LABELS: Record<RebateLimiter, string> = {
  income: "Income Rule",
  investment: "Investment Amount",
  cap: "Rebate Cap",
  gross_tax: "Tax Payable",
};

const ACTIVE_LIMITER_BADGE_LABELS: Record<RebateLimiter, string> = {
  income: "Income Rule",
  investment: "Investment Rule",
  cap: "Rebate Cap",
  gross_tax: "Tax Payable",
};

export function toTaxNumber(value: string | number | null | undefined): number {
  const numericValue = Number(value ?? 0);
  return Number.isFinite(numericValue) ? numericValue : 0;
}

export function resolveAllowanceLabel(profile: TaxPlannerProfileInput): string {
  if (profile.freedom_fighter) {
    return "Freedom fighter allowance";
  }
  if (profile.person_with_disability) {
    return "Person with disability allowance";
  }
  if (profile.senior_citizen || profile.gender === "FEMALE") {
    return "Woman or senior citizen allowance";
  }
  return "General taxpayer allowance";
}

export function getRebateConfig(
  result: TaxPlannerCalculateResponse,
  plannerConfig?: TaxPlannerConfigResponse | null,
): TaxPlannerInvestmentRebateConfig {
  return (
    plannerConfig?.investment_rebate ?? {
      taxable_income_limit_pct: toTaxNumber(result.assumptions_used.taxable_income_limit_pct) || 3,
      investment_rebate_pct: toTaxNumber(result.assumptions_used.investment_rebate_pct) || 15,
      maximum_rebate_amount: toTaxNumber(result.assumptions_used.maximum_rebate_amount) || 1_000_000,
    }
  );
}

function detectAppliedLimiter(
  rebate: number,
  incomeLimited: number,
  investmentLimited: number,
  capLimited: number,
  grossTax: number,
): RebateLimiter {
  const candidates: Array<[RebateLimiter, number]> = [
    ["income", incomeLimited],
    ["investment", investmentLimited],
    ["cap", capLimited],
    ["gross_tax", grossTax],
  ];
  const minValue = Math.min(...candidates.map(([, value]) => value));
  const epsilon = 0.01;

  if (Math.abs(rebate - minValue) > epsilon) {
    return "income";
  }

  const priority: RebateLimiter[] = ["income", "investment", "cap", "gross_tax"];
  for (const key of priority) {
    const value = candidates.find(([candidate]) => candidate === key)?.[1] ?? 0;
    if (Math.abs(value - minValue) <= epsilon) {
      return key;
    }
  }

  return "income";
}

export function buildRebateBreakdown(
  result: TaxPlannerCalculateResponse,
  plannerConfig?: TaxPlannerConfigResponse | null,
): RebateBreakdown {
  const config = getRebateConfig(result, plannerConfig);
  const taxableIncome = toTaxNumber(result.taxable_income);
  const currentInvestment = toTaxNumber(result.current_investment);
  const incomeLimitPct = toTaxNumber(config.taxable_income_limit_pct);
  const investmentRebatePct = toTaxNumber(config.investment_rebate_pct);
  const incomeLimitedRebate = toTaxNumber(result.income_limited_rebate);
  const investmentLimitedRebate = (currentInvestment * investmentRebatePct) / 100;
  const capLimitedRebate = toTaxNumber(result.cap_limited_rebate);
  const maximumAvailableRebate = toTaxNumber(result.maximum_available_rebate);
  const appliedRebate = toTaxNumber(result.rebate);
  const grossTax = toTaxNumber(result.gross_tax);

  const appliedLimiter = detectAppliedLimiter(
    appliedRebate,
    incomeLimitedRebate,
    investmentLimitedRebate,
    capLimitedRebate,
    grossTax,
  );

  const maxAvailableLimiter: RebateLimiter =
    Math.abs(incomeLimitedRebate - capLimitedRebate) < 0.01
      ? "income"
      : incomeLimitedRebate <= capLimitedRebate
        ? "income"
        : "cap";

  return {
    taxableIncome,
    currentInvestment,
    incomeLimitPct,
    investmentRebatePct,
    incomeLimitedRebate,
    investmentLimitedRebate,
    capLimitedRebate,
    maximumAvailableRebate,
    appliedRebate,
    grossTax,
    appliedLimiter,
    maxAvailableLimiter,
  };
}

export function getLimiterLabel(limiter: RebateLimiter): string {
  return LIMITER_LABELS[limiter];
}

export function getLimiterChipLabel(limiter: RebateLimiter): string {
  return LIMITER_CHIP_LABELS[limiter];
}

export function getLimitingFactorLabel(limiter: RebateLimiter): string {
  return LIMITING_FACTOR_LABELS[limiter];
}

export function getActiveLimiterBadgeLabel(limiter: RebateLimiter): string {
  return ACTIVE_LIMITER_BADGE_LABELS[limiter];
}

export function formatPct(value: number): string {
  if (Number.isInteger(value)) {
    return String(value);
  }
  return String(parseFloat(value.toFixed(2)));
}

export function findLargestTaxSlab(slabs: TaxPlannerSlabBreakdown[]): TaxPlannerSlabBreakdown | null {
  const taxableSlabs = slabs.filter((slab) => toTaxNumber(slab.rate) > 0 && toTaxNumber(slab.tax) > 0);
  if (!taxableSlabs.length) {
    return null;
  }
  return taxableSlabs.reduce((largest, slab) =>
    toTaxNumber(slab.tax) > toTaxNumber(largest.tax) ? slab : largest,
  );
}

export function getMinimumTaxLocationLabel(
  ruleCode: string | null | undefined,
  plannerConfig?: TaxPlannerConfigResponse | null,
): string {
  if (!ruleCode) {
    return "Applicable minimum tax";
  }
  if (ruleCode === "NATIONAL_DEFAULT") {
    return "National default minimum tax";
  }

  const tiers = plannerConfig?.minimum_tax?.location_tiers ?? plannerConfig?.location_tiers ?? [];
  const tier = tiers.find((entry) => entry.location_code && ruleCode.includes(entry.location_code));
  if (tier) {
    return tier.label;
  }

  if (ruleCode.includes("DHAKA") || ruleCode.includes("CTG")) {
    return "Dhaka / Chattogram minimum tax";
  }
  if (ruleCode.includes("RURAL") || ruleCode.includes("OUTSIDE")) {
    return "Outside city corporation minimum tax";
  }
  if (ruleCode.includes("CITY")) {
    return "Other city corporation minimum tax";
  }

  return "Applicable minimum tax";
}

export function buildJourneyMicroInsights(
  result: TaxPlannerCalculateResponse,
  breakdown: RebateBreakdown,
): string[] {
  const insights: string[] = [];
  const allowance = toTaxNumber(result.tax_free_allowance);
  const rebate = toTaxNumber(result.rebate);
  const utilization = Math.round(toTaxNumber(result.rebate_utilization_pct));
  const additionalNeeded = toTaxNumber(result.additional_investment_needed);

  if (allowance > 0) {
    insights.push(`Your tax-free allowance reduced taxable income by BDT ${formatPlainAmount(allowance)}.`);
  }

  if (rebate > 0) {
    insights.push(`Your investments reduced tax by BDT ${formatPlainAmount(rebate)}.`);
  }

  if (utilization >= 100 || additionalNeeded <= 0) {
    insights.push("You have already unlocked 100% of your available rebate.");
  } else if (breakdown.appliedLimiter === "income") {
    insights.push("Income-based rebate limit is currently the restricting factor.");
  } else if (breakdown.appliedLimiter === "investment") {
    insights.push("Investment amount is currently the restricting factor for your rebate.");
  } else if (breakdown.appliedLimiter === "cap") {
    insights.push("The maximum rebate cap is currently the restricting factor.");
  }

  return insights.slice(0, 3);
}

export function formatPlainAmount(value: number): string {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(Math.round(value));
}

export type JourneyNodeExtra = {
  detailLines: string[];
  chips: string[];
};

export function buildJourneyNodeExtras(
  stepKey: string,
  result: TaxPlannerCalculateResponse,
  profile: TaxPlannerProfileInput,
  breakdown: RebateBreakdown,
  plannerConfig?: TaxPlannerConfigResponse | null,
): JourneyNodeExtra {
  const totalIncome = toTaxNumber(result.total_income);
  const allowance = toTaxNumber(result.tax_free_allowance);
  const taxableIncome = toTaxNumber(result.taxable_income);
  const grossTax = toTaxNumber(result.gross_tax);
  const rebate = toTaxNumber(result.rebate);
  const minimumTax = toTaxNumber(result.minimum_tax_applied ?? 0);
  const finalTax = toTaxNumber(result.final_tax);
  const taxAfterRebate = Math.max(0, grossTax - rebate);

  switch (stepKey) {
    case "total_income":
      return { detailLines: [], chips: [] };
    case "tax_free_allowance": {
      const allowanceLabel = resolveAllowanceLabel(profile);
      return {
        detailLines: [
          allowanceLabel,
          `BDT ${formatPlainAmount(allowance)} deducted from total income`,
        ],
        chips: allowance > 0 ? ["✓ Tax-Free Income"] : [],
      };
    }
    case "taxable_income":
      return {
        detailLines: [
          `BDT ${formatPlainAmount(totalIncome)} − BDT ${formatPlainAmount(allowance)}`,
          `= BDT ${formatPlainAmount(taxableIncome)}`,
        ],
        chips: [],
      };
    case "gross_tax": {
      const slabs = result.slab_breakdown ?? [];
      const largestSlab = findLargestTaxSlab(slabs);
      const slabLines = slabs
        .filter((slab) => toTaxNumber(slab.rate) > 0 && toTaxNumber(slab.tax) > 0)
        .map((slab) => `${formatPct(toTaxNumber(slab.rate))}% band → BDT ${formatPlainAmount(toTaxNumber(slab.tax))}`);
      const detailLines = [
        ...slabLines,
        `Gross Tax → BDT ${formatPlainAmount(grossTax)}`,
      ];
      const chips: string[] = [];
      if (largestSlab && toTaxNumber(largestSlab.tax) > 0) {
        chips.push("✓ Largest Tax Saving");
      }
      return { detailLines, chips };
    }
    case "rebate": {
      const detailLines = [
        "Income Limit",
        `${formatPct(breakdown.incomeLimitPct)}% × ${formatPlainAmount(breakdown.taxableIncome)} = ${formatPlainAmount(breakdown.incomeLimitedRebate)}`,
        "Investment Limit",
        `${formatPct(breakdown.investmentRebatePct)}% × ${formatPlainAmount(breakdown.currentInvestment)} = ${formatPlainAmount(breakdown.investmentLimitedRebate)}`,
        `Maximum Rebate Cap ${formatPlainAmount(breakdown.capLimitedRebate)}`,
        `Applied Rebate ${formatPlainAmount(rebate)}`,
        `Active Limiter ${getLimiterChipLabel(breakdown.appliedLimiter)}`,
      ];
      const chips = rebate > 0 ? [`✓ ${getLimiterChipLabel(breakdown.appliedLimiter)}`] : [];
      return { detailLines, chips };
    }
    case "minimum_tax_applied": {
      const label = getMinimumTaxLocationLabel(result.minimum_tax_rule_code, plannerConfig);
      return {
        detailLines: [`${label}: BDT ${formatPlainAmount(minimumTax)}`],
        chips: [],
      };
    }
    case "final_tax": {
      const detailLines = [
        `Gross Tax ${formatPlainAmount(grossTax)}`,
        `Less Rebate ${formatPlainAmount(rebate)}`,
      ];
      if (minimumTax > 0 && taxAfterRebate < minimumTax) {
        detailLines.push(`Minimum Tax Floor ${formatPlainAmount(minimumTax)}`);
      }
      detailLines.push(`Final Tax ${formatPlainAmount(finalTax)}`);
      return { detailLines, chips: [] };
    }
    default:
      return { detailLines: [], chips: [] };
  }
}

export type AdditionalInvestmentSliderMarker = {
  value: number;
  percent: number;
  label: string;
  isMax: boolean;
  position: "start" | "mid" | "end";
};

const SLIDER_MARKER_COUNT = 4;

/** Matches browser range thumb inset used for overlay labels and tick marks. */
export const RANGE_THUMB_INSET_PERCENT = 3.25;

export function getRangeInputThumbPercent(
  value: number,
  max: number,
  thumbInsetPercent = RANGE_THUMB_INSET_PERCENT,
): number {
  if (max <= 0) {
    return thumbInsetPercent;
  }

  const ratio = Math.max(0, Math.min(1, value / max));
  return ratio * (100 - thumbInsetPercent * 2) + thumbInsetPercent;
}

function roundToDisplayThousand(value: number): number {
  if (value <= 0) {
    return 0;
  }

  const step = value >= 100000 ? 25000 : value >= 50000 ? 10000 : 5000;
  return Math.round(value / step) * step;
}

export function buildAdditionalInvestmentMarkers(maxAmount: number): AdditionalInvestmentSliderMarker[] {
  if (maxAmount <= 0) {
    return [{ value: 0, percent: 0, label: "0", isMax: false, position: "start" }];
  }

  return Array.from({ length: SLIDER_MARKER_COUNT }, (_, index) => {
    const rawValue = (maxAmount * index) / (SLIDER_MARKER_COUNT - 1);
    const isStart = index === 0;
    const isMax = index === SLIDER_MARKER_COUNT - 1;
    const value = isStart ? 0 : isMax ? maxAmount : roundToDisplayThousand(rawValue);

    let label: string;
    if (isStart) {
      label = "0";
    } else if (isMax) {
      label = formatPlainAmount(maxAmount);
    } else {
      label = formatPlainAmount(value);
    }

    const percent = (value / maxAmount) * 100;

    return {
      value,
      percent,
      label,
      isMax,
      position: isStart ? "start" : isMax ? "end" : "mid",
    };
  });
}

export function getAdditionalInvestmentSliderStep(maxAmount: number): number {
  if (maxAmount <= 0) {
    return 1;
  }

  const roundedMax = Math.round(maxAmount);
  const candidates = [1000, 500, 250, 100, 50, 25, 10, 5, 1];

  for (const step of candidates) {
    if (roundedMax % step === 0 && roundedMax / step >= 20 && roundedMax / step <= 500) {
      return step;
    }
  }

  return 1;
}

export function normalizeAdditionalInvestment(value: number, maxAmount: number, step: number): number {
  if (maxAmount <= 0) {
    return 0;
  }

  const clamped = Math.max(0, Math.min(maxAmount, value));
  const rounded = Math.round(clamped / step) * step;

  if (rounded >= maxAmount - step / 2) {
    return maxAmount;
  }

  return Math.min(maxAmount, rounded);
}

export function buildRebateTooltipSummary(breakdown: RebateBreakdown): string {
  return `Your rebate is ${formatPlainAmount(breakdown.appliedRebate)} BDT. The limiting factor is ${getLimitingFactorLabel(breakdown.appliedLimiter).toLowerCase()}.`;
}
