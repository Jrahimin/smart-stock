import type { WealthToolCalculateResponse } from "@/features/wealth/types/wealth-types";

export const INVESTMENT_SCENARIO_MONTHLY_INCREASE = 2_000;

export type InvestmentPlannerStory = {
  futureValue: number;
  todayValue: number;
  totalContribution: number;
  estimatedGrowth: number;
  contributionPercent: number;
  growthPercent: number;
  years: number;
};

export type InvestmentEvaluationStory = {
  totalCapital: number;
  monthlyNetIncome: number;
  totalIncome: number;
  netProfit: number;
  roiPercent: number;
  breakEvenMonths: number | null;
  annualizedReturnPercent: number | null;
};

export type CompoundIncomePotential = {
  monthlyIncome: number;
  annualIncome: number;
  monthlyIncomeTodayValue: number;
  capitalOutlook: "growing" | "stable" | "declining";
  requiredCapital: number | null;
  capitalGap: number | null;
  additionalMonthlyInvestment: number | null;
};

export function buildInvestmentPlannerStory(
  inputs: Record<string, string>,
  result: WealthToolCalculateResponse,
): InvestmentPlannerStory {
  const principal = toNumber(inputs.principal);
  const monthlyContribution = toNumber(inputs.monthly_contribution);
  const years = resolveInvestmentYears(inputs);
  const contributionMonths = Math.max(0, Math.trunc(years * 12));
  const totalContribution = principal + monthlyContribution * contributionMonths;
  const futureValue = toNumber(result.headline_value);
  const estimatedGrowth = Math.max(0, futureValue - totalContribution);
  const contributionPercent =
    futureValue > 0 ? clamp((totalContribution / futureValue) * 100, 0, 100) : 0;
  const growthPercent =
    futureValue > 0 ? clamp((estimatedGrowth / futureValue) * 100, 0, 100) : 0;
  const todayValue = toNumber(result.timeline.at(-1)?.real_value);

  return {
    futureValue,
    todayValue,
    totalContribution,
    estimatedGrowth,
    contributionPercent,
    growthPercent,
    years,
  };
}

export function buildHigherMonthlyInvestmentInputs(
  inputs: Record<string, string>,
  increase = INVESTMENT_SCENARIO_MONTHLY_INCREASE,
) {
  return {
    ...inputs,
    monthly_contribution: String(toNumber(inputs.monthly_contribution) + increase),
  };
}

export function buildLowerIncomeInputs(inputs: Record<string, string>) {
  return {
    ...inputs,
    monthly_income: String(toNumber(inputs.monthly_income) * 0.8),
  };
}

export function buildCompoundIncomePotential(
  result: WealthToolCalculateResponse,
): CompoundIncomePotential {
  const values = result.assumptions_used;
  const capitalOutlook = values.capital_outlook;

  return {
    monthlyIncome: toNumber(values.projected_monthly_income as string | number | null | undefined),
    annualIncome: toNumber(values.projected_annual_income as string | number | null | undefined),
    monthlyIncomeTodayValue: toNumber(
      values.monthly_income_today_value as string | number | null | undefined,
    ),
    capitalOutlook:
      capitalOutlook === "growing" || capitalOutlook === "stable" || capitalOutlook === "declining"
        ? capitalOutlook
        : "declining",
    requiredCapital: toNullableNumber(values.required_capital),
    capitalGap: toNullableNumber(values.capital_gap),
    additionalMonthlyInvestment: toNullableNumber(values.additional_monthly_investment),
  };
}

export function resolveInvestmentYears(inputs: Record<string, string>) {
  const value = Math.max(0, toNumber(inputs.tenure_value));
  switch (inputs.tenure_unit) {
    case "months":
      return value / 12;
    case "quarters":
      return value / 4;
    default:
      return value;
  }
}

export function toInvestmentNumber(value: string | number | null | undefined) {
  return toNumber(value);
}

export function buildInvestmentEvaluationStory(
  result: WealthToolCalculateResponse,
): InvestmentEvaluationStory {
  const values = result.assumptions_used;
  const breakEvenValue = values.break_even_months;

  return {
    totalCapital: toNumber(values.total_capital as string | number | null | undefined),
    monthlyNetIncome: toNumber(values.monthly_net_income as string | number | null | undefined),
    totalIncome: toNumber(values.total_income as string | number | null | undefined),
    netProfit: toNumber(values.net_profit as string | number | null | undefined),
    roiPercent: toNumber(values.roi_percent as string | number | null | undefined),
    breakEvenMonths:
      breakEvenValue == null || breakEvenValue === "" ? null : toNumber(breakEvenValue as string | number),
    annualizedReturnPercent: toNullableNumber(values.annualized_return_percent),
  };
}

function toNullableNumber(value: unknown) {
  return value == null || value === "" ? null : toNumber(value as string | number);
}

function toNumber(value: string | number | null | undefined) {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : 0;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
