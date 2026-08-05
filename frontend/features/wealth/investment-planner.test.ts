import { describe, expect, it } from "vitest";

import { getInvestmentPlannerLanguage } from "@/features/wealth/investment-planner-language";
import {
  buildCompoundIncomePotential,
  buildHigherMonthlyInvestmentInputs,
  buildInvestmentEvaluationStory,
  buildInvestmentPlannerStory,
  buildLowerIncomeInputs,
} from "@/features/wealth/view-models/investment-planner-view-model";
import type { WealthToolCalculateResponse } from "@/features/wealth/types/wealth-types";
import {
  buildWealthToolPath,
  listWealthSitemapPaths,
} from "@/lib/seo/wealth-page-seo";

const result: WealthToolCalculateResponse = {
  tool_slug: "compound-growth",
  headline_value: "1480000",
  headline_label: "Projected value",
  summary: "Projection",
  metrics: [],
  timeline: [
    { label: "Today", value: "105000", real_value: "105000" },
    { label: "In 10 years", value: "1480000", real_value: "686000" },
  ],
  insights: [],
  next_steps: [],
  assumptions_used: { annual_rate: "12", inflation_rate: "8" },
  disclaimer: "Educational scenario analysis only.",
};

describe("investment planner", () => {
  it("keeps contribution, growth, and today's value aligned with the API result", () => {
    const story = buildInvestmentPlannerStory(
      {
        principal: "100000",
        monthly_contribution: "5000",
        annual_rate: "12",
        tenure_value: "10",
        tenure_unit: "years",
      },
      result,
    );

    expect(story).toMatchObject({
      futureValue: 1_480_000,
      todayValue: 686_000,
      totalContribution: 700_000,
      estimatedGrowth: 780_000,
      years: 10,
    });
    expect(Math.round(story.contributionPercent)).toBe(47);
    expect(Math.round(story.growthPercent)).toBe(53);
  });

  it("builds the practical scenario by adding exactly BDT 2,000 monthly", () => {
    const inputs = buildHigherMonthlyInvestmentInputs({
      principal: "100000",
      monthly_contribution: "5000",
      tenure_value: "10",
      tenure_unit: "years",
    });

    expect(inputs.monthly_contribution).toBe("7000");
  });

  it("renders the localized growth story in casual Bangla", () => {
    const copy = getInvestmentPlannerLanguage("bn");
    const insight = copy.growthInsight("BDT 7,80,000", "53", true);

    expect(copy.title).toContain("plan");
    expect(copy.modes.grow.label).toContain("টাকা");
    expect(insight).toContain("BDT 7,80,000");
    expect(insight).toContain("contribution");
    expect(Object.keys(copy.modes)).toEqual(["grow", "evaluate"]);
  });

  it("uses the calculator's stable assumptions output for the evaluation result", () => {
    const evaluation = buildInvestmentEvaluationStory({
      ...result,
      tool_slug: "investment-evaluation",
      assumptions_used: {
        total_capital: "550000.00",
        monthly_net_income: "12500.00",
        total_income: "255000.00",
        net_profit: "-195000.00",
        roi_percent: "-35.45",
        break_even_months: "44",
        annualized_return_percent: null,
      },
    });

    expect(evaluation).toMatchObject({
      totalCapital: 550_000,
      monthlyNetIncome: 12_500,
      totalIncome: 255_000,
      netProfit: -195_000,
      roiPercent: -35.45,
      breakEvenMonths: 44,
      annualizedReturnPercent: null,
    });
  });

  it("keeps income potential and its inverse calculation in API-owned values", () => {
    const potential = buildCompoundIncomePotential({
      ...result,
      assumptions_used: {
        projected_monthly_income: "4933.33",
        projected_annual_income: "59200.00",
        monthly_income_today_value: "2286.67",
        capital_outlook: "growing",
        required_capital: "3000000",
        capital_gap: "1520000",
        additional_monthly_investment: "5135.21",
      },
    });
    const stressInputs = buildLowerIncomeInputs({ monthly_income: "40000" });

    expect(potential).toMatchObject({ monthlyIncome: 4933.33, capitalOutlook: "growing", capitalGap: 1_520_000 });
    expect(stressInputs.monthly_income).toBe("32000");
  });

  it("uses the new public route and leaves the legacy route out of the sitemap", () => {
    expect(buildWealthToolPath("compound-growth")).toBe("/tools/invest");
    expect(listWealthSitemapPaths()).toContain("/tools/invest");
    expect(listWealthSitemapPaths()).not.toContain("/wealth/tools/compound-growth");
  });
});
