export type TaxPlannerMode = "QUICK" | "DETAILED";

export type TaxPlannerGender = "MALE" | "FEMALE" | "OTHER" | "PREFER_NOT_TO_SAY";

export type TaxPlannerInsightType =
  | "UNUSED_REBATE_OPPORTUNITY"
  | "NO_ELIGIBLE_INVESTMENTS"
  | "MULTIPLE_INCOME_SOURCES"
  | "HIGH_REMAINING_INVESTMENT_CAPACITY"
  | "OUT_OF_SCOPE_PROFILE"
  | "MINIMUM_TAX_NOT_MODELED"
  | "MINIMUM_TAX_APPLIED";

export type TaxPlannerProfileInput = {
  resident_individual: boolean;
  gender: TaxPlannerGender;
  age?: number | null;
  senior_citizen: boolean;
  person_with_disability: boolean;
  freedom_fighter: boolean;
  location_code?: string | null;
};

export type TaxPlannerIncomeInput = {
  annual_salary: number;
  other_yearly_income: number;
  festival_bonus: number;
  other_employment_benefits: number;
  self_employment_income: number;
  rental_income: number;
  bank_interest: number;
  fdr_profit: number;
  dps_profit: number;
  sanchayapatra_profit: number;
  dividend_income: number;
  other_income: number;
};

export type TaxPlannerInvestmentInput = {
  tax_saving_investments?: number | null;
  life_insurance: number;
  provident_fund: number;
  dps_or_savings: number;
  sanchayapatra: number;
  stock_market: number;
  mutual_funds: number;
  approved_donations: number;
  other_eligible_investment: number;
  simulation_additional_investment: number;
};

export type TaxPlannerCalculateRequest = {
  mode: TaxPlannerMode;
  profile: TaxPlannerProfileInput;
  income: TaxPlannerIncomeInput;
  investments: TaxPlannerInvestmentInput;
};

export type TaxPlannerSlabBreakdown = {
  label: string;
  taxable_amount: string | number;
  rate: string | number;
  tax: string | number;
};

export type TaxPlannerInsight = {
  id: string;
  type: TaxPlannerInsightType;
  title: string;
  body: string;
  severity: "INFO" | "POSITIVE" | "WARNING" | "NEUTRAL";
  amount?: string | number | null;
};

export type TaxPlannerCalculateResponse = {
  tax_year_label: string;
  mode: TaxPlannerMode;
  total_income: string | number;
  tax_free_allowance: string | number;
  taxable_income: string | number;
  gross_tax: string | number;
  rebate: string | number;
  final_tax: string | number;
  current_eligible_investment: string | number;
  maximum_eligible_investment: string | number;
  remaining_eligible_investment: string | number;
  potential_additional_tax_saving: string | number;
  minimum_tax_applied?: string | number;
  minimum_tax_rule_code?: string | null;
  slab_breakdown: TaxPlannerSlabBreakdown[];
  insights: TaxPlannerInsight[];
  assumptions_used: Record<string, unknown>;
  disclaimer: string;
};
