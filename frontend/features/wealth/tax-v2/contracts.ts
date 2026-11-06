export type Year = `${number}-${number}`;
export type Purpose = "filing" | "forward_planning" | "historical_comparison";
export type Answer = "yes" | "no" | "unknown";
export type Money = string;
export type Profile = {
  residence: "resident" | "non_resident" | "unknown";
  entity: "individual" | "huf" | "company" | "other";
  woman: boolean; senior_qualified_for_year: Answer; disability: boolean; third_gender: boolean;
  gazetted_war_wounded_freedom_fighter: boolean; gazetted_injured_july_2024_warrior: boolean;
  eligible_disabled_dependents: number; no_duplicate_dependent_claim: Answer;
  new_taxpayer_floor: Answer; first_return: Answer;
};
export type Coverage = Record<
  "wealth_surcharge" | "environmental_surcharge" | "personal_vehicle_advance_tax" |
  "commercial_vehicle_or_vessel" | "foreign_or_treaty_income" | "unresolved_special_income" |
  "losses_or_setoff" | "turnover_or_special_sector" | "prior_rebate_recovery" |
  "other_part2_donation_claims", Answer
>;
type IncomeBase = { id: string; amount: Money; earned_on?: string | null };
export type Income = IncomeBase & (
  | { kind: "private_employment"; basis: "gross" | "precomputed_taxable"; excluded_group_insurance_benefit: Money; benefits_valuation_complete: Answer }
  | { kind: "government_employment" | "ordinary_rent" | "ordinary_other"; basis: "precomputed_taxable"; ordinary_treatment_confirmed: Answer }
  | { kind: "ordinary_business"; basis: "precomputed_taxable"; gross_receipts: Money | null; business_type: "ordinary" | "special_sector" | "unknown"; ordinary_treatment_confirmed: Answer }
  | { kind: "bank_interest" | "fdr_profit" | "dps_profit" | "savings_certificate_profit" | "domestic_dividend"; basis: "gross"; eligible_treatment_confirmed: Answer; expenses?: FinancialExpense[] }
  | { kind: "listed_gain"; basis: "gross"; instrument: "listed_share" | "eligible_listed_fund" | "other" | "unknown"; realized: Answer; qualifying_disposal_confirmed: Answer; sponsor_director_or_placement_holder: Answer; fund_excess_special_rate_confirmed: Answer }
  | { kind: "foreign" | "conditional_exemption" | "property_gain" | "precious_metal_gain" | "partnership_or_aop" | "final_tax" | "restricted_tax" | "unclassified"; basis: "gross" | "precomputed_taxable" }
);
export type Investment = {
  id: string; category: string; amount: Money; contributed_on: string; qualification: Answer;
  new_investment?: Answer; premature_encashment?: Answer; actual_sum_assured_excluding_bonus?: Money | null;
  insurance_policy_id?: string | null; insured_relationship?: "self" | "spouse" | "minor_child" | "other" | "unknown";
  paid_and_payable_in_bangladesh?: Answer; certified_eligible_amount?: Money | null;
  recognized_pf_contributions?: { fund_id: string; employee_annual: Money; employer_annual: Money } | null;
  approval_id?: string | null;
};
export type Deduction = { id: string; kind: "czm_donation"; amount: Money; paid_on: string; qualified_bank_transfer: Answer };
export type Credit = { id: string; kind: "withholding" | "ordinary_advance" | "final_or_restricted" | "unclassified"; amount: Money; assessment_year: Year; paid_on: string; income_id?: string | null; qualifying_claim_confirmed: Answer };
export type Filing = { filing_date: string; return_from_abroad_exception: Answer; extension_or_other_exception: Answer };
export type EligibleTotal = { mode: "confirmed_eligible_total"; amount: Money; confirmed_for_year: true };
export type PlanningCategories = { mode: "planning_category_totals"; entries: { category: string; amount: Money }[] };
export type Scenario = (EligibleTotal & { contributed_on: string }) | { mode: "itemized"; entry: Investment };
export type TaxRequest = {
  schema_version: 2; assessment_year: Year; expected_ruleset_revision: string; purpose: Purpose;
  profile: Profile; coverage: Coverage; income: Income[];
  investments: EligibleTotal | PlanningCategories | { mode: "itemized"; entries: Investment[] };
  income_deductions: Deduction[]; credits: Credit[];
  credits_completeness: "unknown" | "confirmed_none" | "complete";
  filing: Filing | null; scenario: Scenario | null;
};

export type FinancialExpense = { id: string; kind: "bank_or_finance_charge" | "borrowing_interest" | "direct_expense"; amount: string; qualification: Answer };
export type SourceDocument = { id: string; edition: string; public_url: string; public_edition?: string | null; sha256: string };
export type SourceReference = { document_id: string; pdf_pages: number[]; public_pdf_pages?: number[] | null; provision: string };
export type RuleReference = {
  id: string; effective_basis: "assessment_year" | "income_period" | "contribution_date" | "filing_date";
  policy_id: string; supported_facts: string[]; references: SourceReference[]; golden_cases: string[];
};
export type Presentation = { category: string; label_en: string; label_bn: string; visible: boolean; order: number };
export type Policy = { category: string; policy: string; cap_group: string | null; rule_id: string };
export type FilingWindow = { start: string; end: string; policy: "incentive" | "neutral" | "additional_tax"; rate: Money; limit: Money };
export type Approval = { id: string; category: "approved_donation" | "zakat"; label_en: string; label_bn: string; effective_from: string; expires_on: string | null; reference: SourceReference };
export type RulePack = {
  schema_version: 2; engine_policy_version: "bd-individual-v1"; country_code: "BD";
  assessment_year: Year; income_period_start: string; income_period_end: string; reviewed_on: string;
  thresholds: Record<"general" | "woman_or_senior" | "disability_or_third_gender" | "gazetted_war_wounded_or_injured_july_warrior" | "disabled_dependent_addition", Money>;
  taxable_bands: { width: Money | null; rate: Money }[];
  employment_exemption_cap: Money;
  rebate: { income_rate: Money; investment_rate: Money; statutory_cap: Money };
  minimum_tax: { ordinary: Money; eligible_new_taxpayer: Money };
  dps_cap: Money; government_securities_cap: Money; life_insurance_sum_assured_rate: Money;
  dividend_rate: Money; listed_gain_exemption: Money; listed_gain_rate: Money;
  part2_donation_limit_rate: Money; ordinary_turnover_zero_rate_ceiling: Money;
  investment_presentation: Presentation[]; donation_approvals: Approval[]; filing_windows: FilingWindow[];
  sources: SourceDocument[]; rule_references: RuleReference[];
};
export type YearSummary = {
  assessment_year: Year; income_period_start: string; income_period_end: string;
  income_period_status: "open" | "closed" | "future"; revision_id: string; content_hash: string;
  engine_policy_version: string; reviewed_on: string; supports_annual: true; supports_settlement: boolean;
};
export type SelectedYear = { identity: YearSummary; rules: RulePack; investment_policies: Policy[] };
export type PublicConfig = { as_of: string; supported_years: YearSummary[]; default_assessment_year: Year | null; selected: SelectedYear | null; calculations_suspended: boolean };
export type Guidance = { message_id: string; rule_id: string; field_path: string | null; values: [string, string][] };
export type TaxBreakdown = {
  annual_status: "complete" | "needs_review" | "unsupported";
  settlement_status: "complete" | "not_requested" | "needs_review" | "not_available_for_year";
  missing_facts: Guidance[]; exclusions: Guidance[]; assumptions: Guidance[]; guidance: Guidance[];
  income: (Pick<IncomeBase, "id"> & { kind: string; classification: string; entered_amount: Money; excluded_amount: Money; deductible_amount: Money; taxable_amount: Money; special_tax: Money; reason_codes: string[] })[];
  income_deductions: { id: string; entered_amount: Money; allowed_amount: Money; reason_codes: string[] }[];
  ordinary_income: Money; special_rate_income: Money; rebate_income_base: Money;
  applied_profile: string; dependent_allowance: Money; allowance: Money; ordinary_income_above_allowance: Money;
  slabs: { band: number; taxable_amount: Money; rate: Money; tax: Money }[];
  ordinary_tax: Money; special_tax: Money; gross_tax: Money; post_rebate_tax: Money | null;
  investments: { id: string; category: string; entered_amount: Money; eligible_amount: Money; excluded_amount: Money; cap_group: string | null; reason_codes: string[] }[];
  eligible_investment: Money;
  rebate: {
    income_limit: Money; investment_limit: Money; statutory_cap: Money; entitlement: Money;
    effective_tax_reduction: Money | null; liability_rounding_adjustment: Money | null;
    unused_entitlement: Money | null; unused_due_to_floor: Money | null;
    additional_eligible_investment_for_statutory_limit: Money | null;
    additional_eligible_investment_for_lowest_usable_liability: Money | null;
    potential_additional_tax_saving: Money | null;
  };
  minimum_tax_amount: Money | null; minimum_tax_triggered: boolean | null; minimum_tax_binding: boolean | null;
  minimum_tax_top_up: Money | null; minimum_tax_policy: string; annual_liability: Money | null;
  credits: { id: string; kind: Credit["kind"]; income_id: string | null; entered_amount: Money; allowed_amount: Money; restricted_amount: Money; reason_codes: string[] }[];
  allowed_credits: Money; restricted_credits: Money; section_173_balance: Money | null; filing_adjustment: Money | null;
  filing_adjustment_code: string | null; estimated_payable: Money | null; excess_credits: Money | null;
};
export type TaxResult = {
  schema_version: 2; assessment_year: Year; income_period_start: string; income_period_end: string;
  income_period_status: YearSummary["income_period_status"]; revision_id: string; content_hash: string;
  engine_policy_version: string; rules_reviewed_on: string; as_of: string; purpose: Purpose;
  base: TaxBreakdown;
  scenario: { breakdown: TaxBreakdown; eligible_increment: Money; annual_saving: Money | null; settlement_saving: Money | null; limiting_reason: string | null; is_historical: boolean } | null;
};
export type RevisionSummary = {
  id: string; country_code: string; assessment_year: Year | null; income_period_start: string | null;
  income_period_end: string | null; revision_number: number; status: "draft" | "published" | "superseded" | "discarded" | "archived_legacy";
  payload_schema_version: number; engine_policy_version: string; content_hash: string; edit_version: number;
  created_at: string; updated_at: string; published_at: string | null; created_by_user_id: string | null;
  updated_by_user_id: string | null; published_by_user_id: string | null; copied_from_revision_id: string | null;
  change_reason: string | null; compatible: boolean; sources: SourceDocument[];
  discarded_at?: string | null; discarded_by_user_id?: string | null; discard_reason?: string | null;
};
export type PreviewStamp = {
  content_hash: string; edit_version: number; engine_policy_version: string; against_published_revision_id: string | null;
  previewed_at: string; comparison_hash: string; requires_acknowledgement: boolean; missing_source_rules: string[]; invariant_issues: string[];
};
export type Revision = RevisionSummary & { rules: RulePack | null; legacy_snapshot: Record<string, unknown> | null; preview: PreviewStamp | null };
type Checkpoint = string | boolean | null;
export type Preview = {
  draft_id: string; preview: PreviewStamp; publishable: boolean;
  config_changes: { field: string; previous: unknown; proposed: unknown }[];
  cases: { case_id: string; source: string; source_expected: Record<string, Checkpoint>; previous: Record<string, Checkpoint>; proposed: Record<string, Checkpoint>; changed_checkpoints: string[]; differing_from_source: string[] }[];
};

