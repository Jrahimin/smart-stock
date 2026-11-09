import type { Coverage, Credit, Deduction, Filing, Income, Investment, Profile, Purpose, Scenario, SelectedYear, TaxRequest, Year } from "./contracts";

export type Facts = {
  answeredPaths?: string[];
  inactiveCategories?: string[];
  profile: Profile;
  coverage: Coverage;
  income: Income[];
  investmentMode: "aggregate" | "categories" | "itemized";
  categoryAmounts?: Record<string, string>;
  aggregate: string;
  aggregateConfirmed: boolean;
  investments: Investment[];
  deductions: Deduction[];
  credits: Credit[];
  creditStatus: TaxRequest["credits_completeness"];
  filing: Filing | null;
  scenario: Scenario | null;
  scenarioConfirmed: boolean;
};
export type Issue = { path: string; message?: string; code?: string };
export const quickSalary = "quick-salary";
export const quickOther = "quick-other";
const draftSchema = 5;

function isQuickSalary(entry: Income): entry is Extract<Income, { kind: "private_employment" }> {
  return entry.kind === "private_employment" && entry.id === quickSalary;
}

export function initialFacts(): Facts {
  return {
    profile: {
      residence: "resident", entity: "individual", woman: false, senior_qualified_for_year: "no",
      disability: false, third_gender: false, gazetted_war_wounded_freedom_fighter: false,
      gazetted_injured_july_2024_warrior: false, eligible_disabled_dependents: 0,
      no_duplicate_dependent_claim: "unknown", new_taxpayer_floor: "unknown", first_return: "unknown",
    },
    coverage: {
      wealth_surcharge: "unknown", environmental_surcharge: "unknown", personal_vehicle_advance_tax: "unknown",
      commercial_vehicle_or_vessel: "unknown", foreign_or_treaty_income: "unknown", unresolved_special_income: "unknown",
      losses_or_setoff: "unknown", turnover_or_special_sector: "unknown", prior_rebate_recovery: "unknown",
      other_part2_donation_claims: "unknown",
    },
    income: [], investmentMode: "aggregate", aggregate: "", aggregateConfirmed: false, categoryAmounts: {}, investments: [],
    deductions: [], credits: [], creditStatus: "unknown", filing: null, scenario: null, scenarioConfirmed: false,
  };
}

export function incomeEntry(kind: Income["kind"], id: string, amount = ""): Income {
  const base = { id, amount };
  switch (kind) {
    case "private_employment": return { ...base, kind, basis: "gross", excluded_group_insurance_benefit: "0", benefits_valuation_complete: "unknown" };
    case "government_employment":
    case "ordinary_rent":
    case "ordinary_other": return { ...base, kind, basis: "precomputed_taxable", ordinary_treatment_confirmed: "unknown" };
    case "ordinary_business": return { ...base, kind, basis: "precomputed_taxable", gross_receipts: null, business_type: "unknown", ordinary_treatment_confirmed: "unknown" };
    case "bank_interest":
    case "fdr_profit":
    case "dps_profit":
    case "savings_certificate_profit":
    case "domestic_dividend": return { ...base, kind, basis: "gross", eligible_treatment_confirmed: "unknown" };
    case "listed_gain": return { ...base, kind, basis: "gross", instrument: "unknown", realized: "unknown", qualifying_disposal_confirmed: "unknown", sponsor_director_or_placement_holder: "unknown", fund_excess_special_rate_confirmed: "unknown" };
    default: return { ...base, kind, basis: "gross" };
  }
}
export function investmentEntry(category: string, id: string, amount = "", contributed_on = ""): Investment {
  return { category, id, amount, contributed_on, qualification: "unknown" };
}
export function normalizeMoneyInput(value: string) {
  return value.replace(/[০-৯]/g, (digit) => String(digit.charCodeAt(0) - 0x09e6)).replace(/[,\s]/g, "");
}
export function validMoney(value: string) {
  return /^\d{1,15}(?:\.\d{1,2})?$/.test(value);
}
export function hasMoney(value: string) {
  return /[1-9]/.test(value);
}
function validDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(value + "T00:00:00Z");
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value && !value.startsWith("0000");
}

export function planningDefaults(facts: Facts, selected?: SelectedYear): string[] {
  if (facts.filing && selected?.identity.supports_settlement !== false) return [];
  const untouched = (path: string) => !facts.answeredPaths?.includes(path);
  return [
    ...(facts.profile.new_taxpayer_floor === "unknown" && untouched("profile.new_taxpayer_floor") ? ["profile.new_taxpayer_floor"] : []),
    ...Object.entries(facts.coverage).filter(([key, answer]) => key !== "other_part2_donation_claims" && answer === "unknown" && untouched("coverage." + key)).map(([key]) => "coverage." + key),
    ...facts.income.flatMap((entry, i) => isQuickSalary(entry) && entry.basis === "gross" && entry.benefits_valuation_complete === "unknown" && untouched("income." + entry.id + ".benefits_valuation_complete") ? ["income." + i + ".benefits_valuation_complete"] : []),
  ];
}
export function hasPlanningAssumptions(facts: Facts, selected?: SelectedYear) {
  return planningDefaults(facts, selected).length > 0 || facts.investmentMode === "categories" && Object.entries(facts.categoryAmounts ?? {}).some(([key, amount]) => !facts.inactiveCategories?.includes(key) && hasMoney(amount));
}

export function buildTaxRequest(facts: Facts, selected: SelectedYear, purpose: Purpose, planningAssumptions = false): { request: TaxRequest | null; issue?: Issue; issues: Issue[] } {
  const { identity } = selected;
  const defaults = planningAssumptions ? planningDefaults(facts, selected) : [];
  const issues: Issue[] = [];
  const add = (path: string, code?: string) => { issues.push({ path, ...(code ? { code } : {}) }); };
  for (const [i, income] of facts.income.entries()) {
    if (!validMoney(income.amount)) add("income." + i + ".amount");
    if (income.kind === "private_employment" && !validMoney(income.excluded_group_insurance_benefit)) add("income." + i + ".excluded_group_insurance_benefit");
    if (income.kind === "ordinary_business" && income.gross_receipts !== null && !validMoney(income.gross_receipts)) add("income." + i + ".gross_receipts");
    if ("expenses" in income) {
      for (const [j, expense] of (income.expenses ?? []).entries()) if (!validMoney(expense.amount)) add("income." + i + ".expenses." + j + ".amount");
    }
  }
  function investmentIssues(entry: Investment, path: string) {
    if (!validMoney(entry.amount)) add(path + ".amount");
    if (!validDate(entry.contributed_on)) add(path + ".contributed_on");
    if (entry.actual_sum_assured_excluding_bonus != null && !validMoney(entry.actual_sum_assured_excluding_bonus)) add(path + ".actual_sum_assured_excluding_bonus");
    if (entry.certified_eligible_amount != null && !validMoney(entry.certified_eligible_amount)) add(path + ".certified_eligible_amount");
    for (const field of ["employee_annual", "employer_annual"] as const) if (entry.recognized_pf_contributions && !validMoney(entry.recognized_pf_contributions[field])) add(path + ".recognized_pf_contributions." + field);
  }
  if (facts.investmentMode === "aggregate" && facts.aggregate && !validMoney(facts.aggregate)) add("investments.amount");
  if (facts.investmentMode === "categories") for (const [category, amount] of Object.entries(facts.categoryAmounts ?? {})) {
    if (facts.inactiveCategories?.includes(category)) continue;
    if (amount && !validMoney(amount)) add("planning-investments." + category);
    if (!selected.investment_policies.some((policy) => policy.category === category)) add("planning-investments." + category, "retired_category");
  }
  if (facts.investmentMode === "itemized") for (const [i, entry] of facts.investments.entries()) investmentIssues(entry, "investments.entries." + i);
  for (const [i, entry] of facts.deductions.entries()) {
    if (!validMoney(entry.amount)) add("income_deductions." + i + ".amount");
    if (!validDate(entry.paid_on)) add("income_deductions." + i + ".paid_on");
  }
  if (identity.supports_settlement) {
    for (const [i, entry] of facts.credits.entries()) {
      if (!validMoney(entry.amount)) add("credits." + i + ".amount");
      if (!validDate(entry.paid_on)) add("credits." + i + ".paid_on");
      if (entry.kind === "withholding" && !facts.income.some(({ id }) => id === entry.income_id)) add("credits." + i + ".income_id");
    }
    if (facts.creditStatus === "confirmed_none" && facts.credits.length) add("credits_completeness");
    if (facts.filing && !validDate(facts.filing.filing_date)) add("filing.filing_date");
  }
  if (facts.scenario?.mode === "confirmed_eligible_total") {
    if (!validMoney(facts.scenario.amount)) add("scenario.amount");
    if (!validDate(facts.scenario.contributed_on)) add("scenario.contributed_on");
    if (!facts.scenarioConfirmed) add("scenario.confirmed_for_year");
  }
  if (facts.scenario?.mode === "itemized") {
    investmentIssues(facts.scenario.entry, "scenario.entry");
    if (facts.investmentMode === "aggregate" && hasMoney(facts.aggregate)) add("scenario", "scenario_method_conflict");
    if (facts.investmentMode === "categories" && Object.entries(facts.categoryAmounts ?? {}).some(([key, amount]) => !facts.inactiveCategories?.includes(key) && hasMoney(amount))) add("scenario", "scenario_method_conflict");
  }
  if (issues.length) return { request: null, issue: issues[0], issues };
  return {
    issues,
    request: {
      schema_version: 2, assessment_year: identity.assessment_year, expected_ruleset_revision: identity.revision_id, purpose,
      profile: { ...facts.profile, ...(defaults.includes("profile.new_taxpayer_floor") ? { new_taxpayer_floor: "no" as const } : {}), ...(!identity.supports_settlement ? { first_return: "unknown" as const } : {}) },
      coverage: Object.fromEntries(Object.entries(facts.coverage).map(([key, answer]) => [key, defaults.includes("coverage." + key) ? "no" : answer])) as Coverage,
      income: facts.income.map((entry, i) => defaults.includes("income." + i + ".benefits_valuation_complete") ? { ...entry, benefits_valuation_complete: "yes" as const } : entry),
      investments: facts.investmentMode === "categories"
        ? { mode: "planning_category_totals", entries: Object.entries(facts.categoryAmounts ?? {}).filter(([key, amount]) => !facts.inactiveCategories?.includes(key) && amount && hasMoney(amount)).map(([category, amount]) => ({ category, amount })) }
        : facts.investmentMode === "aggregate" && hasMoney(facts.aggregate)
        ? { mode: "confirmed_eligible_total", amount: facts.aggregate, confirmed_for_year: true }
        : { mode: "itemized", entries: facts.investmentMode === "itemized" ? facts.investments : [] },
      income_deductions: facts.deductions, credits: identity.supports_settlement ? facts.credits : [], credits_completeness: identity.supports_settlement ? facts.creditStatus : "unknown",
      filing: identity.supports_settlement ? facts.filing : null, scenario: facts.scenario,
    },
  };
}

export function draftKey(owner: string, year: Year, purpose: Purpose) {
  return "wealth.taxPlanner.v2:" + encodeURIComponent(owner) + ":" + year + ":" + purpose;
}
export function readDraft(storage: Pick<Storage, "getItem">, owner: string, year: Year, purpose: Purpose) {
  try {
    const raw = storage.getItem(draftKey(owner, year, purpose));
    if (!raw) return null;
    const data = JSON.parse(raw) as { schema?: number; owner?: string; year?: Year; purpose?: Purpose; revision?: string; facts?: Facts };
    if ((data.schema !== 2 && data.schema !== 3 && data.schema !== 4 && data.schema !== draftSchema) ||
      data.owner !== owner || data.year !== year || data.purpose !== purpose ||
      typeof data.revision !== "string" || !data.facts?.profile || !data.facts.coverage ||
      ![data.facts.income, data.facts.investments, data.facts.credits, data.facts.deductions].every(Array.isArray)) return null;
    const facts = data.facts;
    if (data.schema === 2) {
      // Older drafts did not distinguish a default "no" from a verified answer.
      facts.coverage = Object.fromEntries(Object.entries(initialFacts().coverage).map(([key, fallback]) => [
        key, facts.coverage[key as keyof Coverage] === "yes" ? "yes" : fallback,
      ])) as Coverage;
      if (facts.profile.new_taxpayer_floor === "no") facts.profile.new_taxpayer_floor = "unknown";
    }
    if (data.schema === 2 || data.schema === 3) {
      // Older Quick salary entries had no way to distinguish assumed and confirmed "yes".
      facts.income = facts.income.map((entry) => (
        isQuickSalary(entry) && entry.benefits_valuation_complete === "yes"
          ? { ...entry, benefits_valuation_complete: "unknown" } : entry
      ));
    }
    return { facts, revision: data.revision };
  } catch { return null; }
}
export function writeDraft(storage: Pick<Storage, "setItem">, owner: string, year: Year, purpose: Purpose, revision: string, facts: Facts) {
  storage.setItem(draftKey(owner, year, purpose), JSON.stringify({ schema: draftSchema, owner, year, purpose, revision, facts }));
}

export function purposeFor(period: SelectedYear["identity"]["income_period_status"], supportsSettlement: boolean): Purpose {
  return period !== "closed" ? "forward_planning" : supportsSettlement ? "filing" : "historical_comparison";
}

