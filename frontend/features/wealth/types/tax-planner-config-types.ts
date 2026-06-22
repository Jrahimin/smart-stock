export type TaxPlannerInvestmentRebateConfig = {
  max_income_percentage: string | number;
  max_amount: string | number;
  rebate_rate: string | number;
  max_rebate_amount?: string | number | null;
};

export type TaxPlannerInvestmentCategoryConfig = {
  category_key: string;
  display_label: string;
  icon: string;
  sort_order: number;
};

export type TaxPlannerLocationTierConfig = {
  location_code: string;
  label: string;
  minimum_amount?: string | number | null;
};

export type TaxPlannerConfigResponse = {
  tax_year_label: string;
  display_name: string;
  disclaimer: string;
  minimum_tax_note: string;
  investment_rebate: TaxPlannerInvestmentRebateConfig;
  investment_categories: TaxPlannerInvestmentCategoryConfig[];
  location_tiers: TaxPlannerLocationTierConfig[];
  minimum_tax: {
    national_minimum_amount?: string | number | null;
    location_tiers: TaxPlannerLocationTierConfig[];
  };
  config_source: string;
};
