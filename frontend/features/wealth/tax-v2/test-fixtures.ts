import type { Preview, PublicConfig, Revision, RulePack, TaxBreakdown, TaxRequest, TaxResult, Year } from "./contracts";

export function config(year: Year = "2026-27", revision = "published-1"): PublicConfig {
  const identity = (assessment_year: Year, revision_id: string) => ({
    assessment_year, revision_id, content_hash: "hash", engine_policy_version: "bd-individual-v1",
    income_period_start: assessment_year === "2026-27" ? "2025-07-01" : "2026-07-01",
    income_period_end: assessment_year === "2026-27" ? "2026-06-30" : "2027-06-30",
    income_period_status: assessment_year === "2026-27" ? "closed" as const : "open" as const,
    supports_annual: true as const, supports_settlement: assessment_year === "2026-27", reviewed_on: "2026-11-05",
  });
  const selected = identity(year, revision);
  const rules: RulePack = {
    schema_version: 2, engine_policy_version: "bd-individual-v1", country_code: "BD",
    assessment_year: year, income_period_start: selected.income_period_start, income_period_end: selected.income_period_end, reviewed_on: selected.reviewed_on,
    thresholds: { general: "400000", woman_or_senior: "450000", disability_or_third_gender: "525000", gazetted_war_wounded_or_injured_july_warrior: "550000", disabled_dependent_addition: "50000" },
    taxable_bands: [{ width: "300000", rate: "10" }, { width: null, rate: "30" }],
    employment_exemption_cap: "500000", rebate: { income_rate: "3", investment_rate: "10", statutory_cap: "750000" },
    minimum_tax: { ordinary: "5000", eligible_new_taxpayer: "1000" },
    dps_cap: "120000", government_securities_cap: "500000", life_insurance_sum_assured_rate: "10",
    dividend_rate: "15", listed_gain_exemption: "5000000", listed_gain_rate: "15", part2_donation_limit_rate: "10",
    ordinary_turnover_zero_rate_ceiling: "20000000", filing_windows: [],
    investment_presentation: [{ category: "dps", label_en: "DPS", label_bn: "ডিপিএস", visible: true, order: 1 }, { category: "government_security", label_en: "Government securities", label_bn: "সরকারি সিকিউরিটিজ", visible: false, order: 2 }],
    donation_approvals: [], sources: [], rule_references: [],
  };
  return { as_of: "2026-11-05", calculations_suspended: false, default_assessment_year: "2026-27",
    supported_years: [identity("2026-27", year === "2026-27" ? revision : "published-1"), identity("2027-28", year === "2027-28" ? revision : "planning-1")],
    selected: { identity: selected, rules, investment_policies: [{ category: "dps", policy: "qualified_payment", cap_group: "dps", rule_id: "investment.dps" }] } };
}

export function result(request: TaxRequest, changes?: Partial<TaxBreakdown>): TaxResult {
  const { identity } = config(request.assessment_year, request.expected_ruleset_revision).selected!;
  return {
    ...identity, schema_version: 2, as_of: "2026-11-05", rules_reviewed_on: identity.reviewed_on,
    purpose: request.purpose, scenario: null,
    base: {
      annual_status: "complete", settlement_status: identity.supports_settlement ? "not_requested" : "not_available_for_year",
      missing_facts: [], exclusions: [], assumptions: [], guidance: [], income: [], income_deductions: [],
      ordinary_income: "600000", special_rate_income: "0", rebate_income_base: "600000", applied_profile: "general",
      dependent_allowance: "0", allowance: "400000", ordinary_income_above_allowance: "200000", slabs: [],
      ordinary_tax: "20000", special_tax: "0", gross_tax: "20000", post_rebate_tax: "20000",
      investments: [], eligible_investment: "0", minimum_tax_amount: "5000", minimum_tax_triggered: true,
      minimum_tax_binding: false, minimum_tax_top_up: "0", minimum_tax_policy: "ordinary", annual_liability: "20000",
      credits: [], allowed_credits: "0", restricted_credits: "0", section_173_balance: null, filing_adjustment: null,
      filing_adjustment_code: null, estimated_payable: null, excess_credits: null,
      rebate: { income_limit: "18000", investment_limit: "0", statutory_cap: "750000", entitlement: "0", effective_tax_reduction: "0", liability_rounding_adjustment: "0", unused_entitlement: "0", unused_due_to_floor: "0", additional_eligible_investment_for_statutory_limit: "180000", additional_eligible_investment_for_lowest_usable_liability: "150000", potential_additional_tax_saving: "15000" },
      ...changes,
    },
  };
}
export function revision(status: Revision["status"] = "draft"): Revision {
  const rules = config().selected!.rules;
  return {
    id: "draft-1", country_code: "BD", assessment_year: rules.assessment_year,
    income_period_start: rules.income_period_start, income_period_end: rules.income_period_end,
    revision_number: 1, status, payload_schema_version: 2, engine_policy_version: rules.engine_policy_version,
    content_hash: "draft-hash", edit_version: 3, created_at: "2026-11-05", updated_at: "2026-11-05", published_at: null,
    created_by_user_id: "admin", updated_by_user_id: "admin", published_by_user_id: null,
    copied_from_revision_id: null, change_reason: null, compatible: true, sources: [], rules,
    legacy_snapshot: null, preview: null,
  };
}
export const previewFixture: Preview = {
  draft_id: "draft-1", publishable: true, config_changes: [], cases: [],
  preview: { content_hash: "draft-hash", edit_version: 3, engine_policy_version: "bd-individual-v1",
    against_published_revision_id: null, previewed_at: "2026-11-05", comparison_hash: "comparison",
    requires_acknowledgement: true, missing_source_rules: [], invariant_issues: [] },
};

