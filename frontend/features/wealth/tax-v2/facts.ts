import type { Coverage, Credit, Deduction, Filing, Income, Investment, Profile, Purpose, Scenario, SelectedYear, TaxRequest, Year } from "./contracts";

export type Facts = {
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
const draftSchema = 4;

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

export function hasPlanningAssumptions(facts: Facts) {
  return facts.investmentMode === "categories" && Object.values(facts.categoryAmounts ?? {}).some(hasMoney) || facts.filing === null && (
    facts.profile.new_taxpayer_floor === "unknown" ||
    Object.entries(facts.coverage).some(([key, answer]) => key !== "other_part2_donation_claims" && answer === "unknown") ||
    facts.income.some((entry) => isQuickSalary(entry) && entry.basis === "gross" && entry.benefits_valuation_complete === "unknown")
  );
}

export function buildTaxRequest(facts: Facts, selected: SelectedYear, purpose: Purpose, planningAssumptions = false): { request: TaxRequest | null; issue?: Issue } {
  const { identity } = selected;
  const conditionalAnnual = planningAssumptions && facts.filing === null;
  const err = (path: string): { request: null; issue: Issue } => ({ request: null, issue: { path } });
  for (const [i, income] of facts.income.entries()) {
    if (!validMoney(income.amount)) return err("income." + i + ".amount");
    if (income.kind === "private_employment" && !validMoney(income.excluded_group_insurance_benefit)) return err("income." + i + ".excluded_group_insurance_benefit");
    if (income.kind === "ordinary_business" && income.gross_receipts !== null && !validMoney(income.gross_receipts)) return err("income." + i + ".gross_receipts");
    if ("expenses" in income) {
      for (const [j, expense] of (income.expenses ?? []).entries()) {
        if (!validMoney(expense.amount)) return err("income." + i + ".expenses." + j + ".amount");
      }
    }
  }
  function investmentIssue(entry: Investment, path: string) {
    if (!validMoney(entry.amount)) return path + ".amount";
    if (!validDate(entry.contributed_on)) return path + ".contributed_on";
    if (entry.actual_sum_assured_excluding_bonus != null && !validMoney(entry.actual_sum_assured_excluding_bonus)) return path + ".actual_sum_assured_excluding_bonus";
    if (entry.certified_eligible_amount != null && !validMoney(entry.certified_eligible_amount)) return path + ".certified_eligible_amount";
    for (const field of ["employee_annual", "employer_annual"] as const) {
      if (entry.recognized_pf_contributions && !validMoney(entry.recognized_pf_contributions[field])) return path + ".recognized_pf_contributions." + field;
    }
    return null;
  }
  if (facts.investmentMode === "aggregate" && facts.aggregate && !validMoney(facts.aggregate)) return err("investments.amount");
  if (facts.investmentMode === "categories") {
    for (const [category, amount] of Object.entries(facts.categoryAmounts ?? {})) {
      if (amount && !validMoney(amount)) return err("planning-investments." + category);
      if (!selected.investment_policies.some((policy) => policy.category === category)) return err("planning-investments." + category);
    }
  }
  // Entered eligible totals are a planning assumption; individual categories can be checked in Detailed.
  if (facts.investmentMode === "itemized") {
    for (const [i, entry] of facts.investments.entries()) {
      const issue = investmentIssue(entry, "investments.entries." + i);
      if (issue) return err(issue);
    }
  }
  for (const [i, entry] of facts.deductions.entries()) {
    if (!validMoney(entry.amount)) return err("income_deductions." + i + ".amount");
    if (!validDate(entry.paid_on)) return err("income_deductions." + i + ".paid_on");
  }
  for (const [i, entry] of facts.credits.entries()) {
    if (!validMoney(entry.amount)) return err("credits." + i + ".amount");
    if (!validDate(entry.paid_on)) return err("credits." + i + ".paid_on");
    if (entry.kind === "withholding" && !facts.income.some(({ id }) => id === entry.income_id)) return err("credits." + i + ".income_id");
  }
  if (facts.creditStatus === "confirmed_none" && facts.credits.length) return err("credits_completeness");
  if (facts.filing && !validDate(facts.filing.filing_date)) return err("filing.filing_date");
  if (facts.scenario?.mode === "confirmed_eligible_total") {
    if (!validMoney(facts.scenario.amount)) return err("scenario.amount");
    if (!validDate(facts.scenario.contributed_on)) return err("scenario.contributed_on");
    if (!facts.scenarioConfirmed) return err("scenario.confirmed_for_year");
  }
  if (facts.scenario?.mode === "itemized") {
    const issue = investmentIssue(facts.scenario.entry, "scenario.entry");
    if (issue) return err(issue);
    if (facts.investmentMode === "aggregate" && hasMoney(facts.aggregate)) return err("scenario");
    if (facts.investmentMode === "categories" && Object.values(facts.categoryAmounts ?? {}).some(hasMoney)) return err("scenario");
  }
  return {
    request: {
      schema_version: 2, assessment_year: identity.assessment_year, expected_ruleset_revision: identity.revision_id, purpose,
      profile: conditionalAnnual && facts.profile.new_taxpayer_floor === "unknown"
        ? { ...facts.profile, new_taxpayer_floor: "no" } : facts.profile,
      coverage: conditionalAnnual ? Object.fromEntries(Object.entries(facts.coverage).map(([key, answer]) => [
        key, key !== "other_part2_donation_claims" && answer === "unknown" ? "no" : answer,
      ])) as Coverage : facts.coverage,
      income: conditionalAnnual ? facts.income.map((entry) => (
        isQuickSalary(entry) && entry.basis === "gross" && entry.benefits_valuation_complete === "unknown"
          ? { ...entry, benefits_valuation_complete: "yes" } : entry
      )) : facts.income,
      investments: facts.investmentMode === "categories"
        ? { mode: "planning_category_totals", entries: Object.entries(facts.categoryAmounts ?? {}).filter(([, amount]) => amount && hasMoney(amount)).map(([category, amount]) => ({ category, amount })) }
        : facts.investmentMode === "aggregate" && hasMoney(facts.aggregate)
        ? { mode: "confirmed_eligible_total", amount: facts.aggregate, confirmed_for_year: true }
        : { mode: "itemized", entries: facts.investmentMode === "itemized" ? facts.investments : [] },
      income_deductions: facts.deductions, credits: facts.credits, credits_completeness: facts.creditStatus,
      filing: facts.filing, scenario: facts.scenario,
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
    if ((data.schema !== 2 && data.schema !== 3 && data.schema !== draftSchema) ||
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
    if (data.schema !== draftSchema) {
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

