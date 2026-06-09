export type TaxPlannerInvestmentTip = {
  id: string;
  icon: string;
  summary: string;
  detail: string;
};

/** Mirrors backend `bangladesh_tax_config.py` FY 2025-2026 investment rebate rules. */
export const TAX_PLANNER_INVESTMENT_RULES = {
  fiscalYear: "2025-2026",
  maxIncomePercent: 20,
  maxAmount: 1_000_000,
  rebateRate: 15,
} as const;

export function formatTaxPlannerAmount(amount: number) {
  return new Intl.NumberFormat("en-BD", {
    style: "currency",
    currency: "BDT",
    maximumFractionDigits: 0,
  }).format(amount);
}

export function estimateMaxEligibleInvestment(totalIncome: number) {
  const incomeCap = totalIncome * (TAX_PLANNER_INVESTMENT_RULES.maxIncomePercent / 100);
  return Math.min(incomeCap, TAX_PLANNER_INVESTMENT_RULES.maxAmount);
}

export function buildInvestmentTips(totalIncome: number): TaxPlannerInvestmentTip[] {
  const maxEligible = estimateMaxEligibleInvestment(totalIncome);
  const hasIncome = totalIncome > 0;

  return [
    {
      id: "income-cap",
      icon: "📊",
      summary: `Up to ${TAX_PLANNER_INVESTMENT_RULES.maxIncomePercent}% of your yearly income can count`,
      detail: `Eligible tax-saving investments are limited to ${TAX_PLANNER_INVESTMENT_RULES.maxIncomePercent}% of your total income in a year, with an overall cap of ${formatTaxPlannerAmount(TAX_PLANNER_INVESTMENT_RULES.maxAmount)}. Amounts above that won't increase your rebate.`,
    },
    {
      id: "rebate-rate",
      icon: "🌱",
      summary: `${TAX_PLANNER_INVESTMENT_RULES.rebateRate}% rebate on what qualifies`,
      detail: `Bangladesh offers a ${TAX_PLANNER_INVESTMENT_RULES.rebateRate}% investment rebate on eligible amounts. That rebate is subtracted from your gross tax — it's a direct reduction, not a refund on its own.`,
    },
    {
      id: "mix-types",
      icon: "🧩",
      summary: "You can mix PF, insurance, stocks, funds & savings",
      detail: "You don't need to pick just one instrument. Provident fund, life insurance, stocks, mutual funds, DPS, and Sanchayapatra can all count together toward your yearly eligible total.",
    },
    ...(hasIncome
      ? [
          {
            id: "your-room",
            icon: "🎯",
            summary: `Your income suggests ~${formatTaxPlannerAmount(maxEligible)} room this year`,
            detail: `Based on the income you've entered so far, your estimated maximum eligible investment is about ${formatTaxPlannerAmount(maxEligible)}. Add amounts below — we'll refine this as you complete the wizard.`,
          } satisfies TaxPlannerInvestmentTip,
        ]
      : []),
  ];
}
