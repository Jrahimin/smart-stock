/** @vitest-environment jsdom */

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { TaxBreakdown, TaxResult } from "./contracts";
import { buildTaxRequest, initialFacts, incomeEntry } from "./facts";
import { ScenarioForm } from "./planner-form";
import { ProfileStep, InvestmentsStep, CreditsStep, IncomeStep } from "./planner-form";
import { PlannerResults } from "./planner-results";
import { TaxHero, TaxJourney, TaxSnapshot } from "./planner-template";
import { config, result } from "./test-fixtures";

const selected = config("2027-28").selected!;
const request = buildTaxRequest(initialFacts(), selected, "forward_planning", true).request!;
const baseline = result(request);

describe("QA repair guardrails", () => {
  it.each(["en", "bn"] as const)("explains excluded donation dates and unavailable settlement in %s", (locale) => {
    const facts = initialFacts(), change = vi.fn();
    facts.deductions = [{ id: "outside", kind: "czm_donation", amount: "10000", paid_on: "2026-06-30", qualified_bank_transfer: "yes" }];
    const view = render(<InvestmentsStep facts={facts} change={change} selected={selected} locale={locale} />);
    expect(screen.getByText(/Excluded from this estimate|এই হিসাব থেকে বাদ/)).toHaveTextContent(selected.identity.income_period_start);
    view.unmount();
    render(<CreditsStep facts={facts} change={change} selected={selected} locale={locale} />);
    expect(screen.getByRole("button", { name: locale === "en" ? "Add tax payment" : "কর পরিশোধ যোগ করুন" })).toBeDisabled();
    expect(screen.getByText(/Annual planning only|শুধু বার্ষিক কর পরিকল্পনা/)).toBeVisible();
  });

  it("warns before adding a review-only source and preserves expense qualification on amount edits", () => {
    const facts = initialFacts(), change = vi.fn();
    const bank = incomeEntry("bank_interest", "bank", "100000");
    if (bank.kind !== "bank_interest") throw new Error("Expected financial income");
    bank.expenses = [{ id: "expense", kind: "bank_or_finance_charge", amount: "1000", qualification: "yes" }];
    facts.income = [bank];
    render(<IncomeStep facts={facts} change={change} selected={selected} locale="en" />);
    fireEvent.change(screen.getByRole("combobox", { name: "Source to add" }), { target: { value: "foreign" } });
    expect(screen.getByText(/Separate review required:/)).toBeVisible();
    fireEvent.change(screen.getByRole("textbox", { name: "Expense amount" }), { target: { value: "2000" } });
    expect(change.mock.lastCall![0].income[0].expenses[0]).toMatchObject({ amount: "2000", qualification: "yes" });
    fireEvent.change(screen.getByRole("combobox", { name: "Expense type" }), { target: { value: "borrowing_interest" } });
    expect(change.mock.lastCall![0].income[0].expenses[0]).toMatchObject({ kind: "borrowing_interest", qualification: "unknown" });
  });

  it.each(["en", "bn"] as const)("discloses all eight review-only sources before entry in %s", (locale) => {
    render(<IncomeStep facts={initialFacts()} change={vi.fn()} selected={selected} locale={locale} />);
    const source = screen.getByRole("combobox", { name: locale === "en" ? "Source to add" : "যোগ করার উৎস" });
    for (const kind of ["foreign", "conditional_exemption", "property_gain", "precious_metal_gain", "partnership_or_aop", "final_tax", "restricted_tax", "unclassified"]) {
      fireEvent.change(source, { target: { value: kind } });
      expect(screen.getByText(/Separate review required:|আলাদা পর্যালোচনা প্রয়োজন:/)).toBeVisible();
    }
    fireEvent.change(source, { target: { value: "private_employment" } });
    expect(screen.queryByText(/Separate review required:|আলাদা পর্যালোচনা প্রয়োজন:/)).not.toBeInTheDocument();
  });

  it.each(["2026-07-01", "2027-06-30", "2027-07-01"])("explains only CZM dates outside the inclusive period: %s", (date) => {
    const facts = initialFacts();
    facts.deductions = [{ id: "donation", kind: "czm_donation", amount: "10000", paid_on: date, qualified_bank_transfer: "yes" }];
    render(<InvestmentsStep facts={facts} change={vi.fn()} selected={selected} locale="en" />);
    expect(!!screen.queryByText(/Excluded from this estimate:/)).toBe(date === "2027-07-01");
  });

  it("retains existing payments without settlement and enables entry when settlement is supported", () => {
    const facts = initialFacts(), change = vi.fn();
    facts.credits = [{ id: "saved", kind: "ordinary_advance", amount: "5000", paid_on: "2026-11-01", assessment_year: "2027-28", qualifying_claim_confirmed: "yes" }];
    const view = render(<CreditsStep facts={facts} change={change} selected={selected} locale="en" />);
    expect(screen.getByRole("textbox", { name: "Tax paid" })).toHaveValue("5000");
    expect(screen.getByRole("button", { name: "Add tax payment" })).toBeDisabled();
    expect(change).not.toHaveBeenCalled();
    view.rerender(<CreditsStep facts={facts} change={change} selected={config("2026-27").selected!} locale="en" />);
    expect(screen.getByRole("button", { name: "Add tax payment" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Add tax payment" }));
    expect(change.mock.lastCall![0].credits).toHaveLength(2);
    expect(change.mock.lastCall![0].credits[0]).toEqual(facts.credits[0]);
  });
});

// Checkpoints for 900,000 gross salary, 600,000 taxable income and a 5,000 minimum.
const cases = [
  { eligible: "50000", entitlement: "5000", post: "15000", topUp: "0", liability: "15000", remaining: "100000", saving: "10000", progress: 33 },
  { eligible: "149999", entitlement: "14999.90", post: "5000.10", topUp: "0", liability: "5000.10", remaining: "1", saving: "0.10", progress: 99 },
  { eligible: "150000", entitlement: "15000", post: "5000", topUp: "0", liability: "5000", remaining: null, saving: "0", progress: 100 },
  { eligible: "150001", entitlement: "15000.10", post: "4999.90", topUp: "0.10", liability: "5000", remaining: null, saving: "0", progress: 100 },
  { eligible: "180000", entitlement: "18000", post: "2000", topUp: "3000", liability: "5000", remaining: null, saving: "0", progress: 100 },
] as const;

function checkpoint(item: typeof cases[number]): TaxBreakdown {
  return {
    ...baseline.base, eligible_investment: item.eligible, post_rebate_tax: item.post,
    minimum_tax_binding: item.topUp !== "0", minimum_tax_top_up: item.topUp, annual_liability: item.liability,
    rebate: {
      ...baseline.base.rebate, entitlement: item.entitlement, investment_limit: item.entitlement, effective_tax_reduction: item.liability === "15000" ? "5000" : item.liability === "5000.10" ? "14999.90" : "15000",
      additional_eligible_investment_for_lowest_usable_liability: item.remaining,
      potential_additional_tax_saving: item.saving,
    },
  };
}

function showProgress(base: TaxBreakdown, scenario = false) {
  const response: TaxResult = scenario ? {
    ...baseline, scenario: {
      breakdown: base, eligible_increment: base.eligible_investment, annual_saving: "0",
      settlement_saving: null, limiting_reason: null, is_historical: false,
    },
  } : { ...baseline, base };
  return render(<>
    <TaxSnapshot result={response} locale="en" />
    <ScenarioForm facts={initialFacts()} change={vi.fn()} selected={selected} locale="en"
      asOf="2026-11-05" calculate={vi.fn()} disabled={false}
      base={scenario ? baseline.base : base} result={response} />
  </>);
}

afterEach(cleanup);

describe("restored tax presentation", () => {
  it("shows annual tax before potential saving in the hero without subtracting savings twice", () => {
    render(<TaxHero locale="en" base={baseline.base} identity={selected.identity} />);
    const preview = screen.getByRole("complementary", { name: "Savings preview" });
    expect(within(preview).getByText("Annual tax")).toBeVisible();
    expect(within(preview).getByText("Could still save")).toBeVisible();
    expect([...preview.querySelectorAll("strong")].map((node) => node.textContent)).toEqual(["BDT 20,000", "BDT 15,000"]);
  });
  it.each(cases)("reconciles the journey at eligible investment $eligible", (item) => {
    const base = checkpoint(item);
    render(<TaxJourney result={{ ...baseline, base }} locale="en" />);
    const amount = (label: string) => {
      const card = screen.getByText(label, { selector: ".wealth-tax-journey-label" }).closest("article")!;
      return Number(card.querySelector("strong")!.textContent!.replace(/[^\d.]/g, ""));
    };
    expect(amount("Tax Before Rebate")).toBe(20000);
    expect(amount("Rebate Before Minimum Tax")).toBe(Number(item.entitlement));
    const topUp = item.topUp === "0" ? 0 : amount("Minimum Tax Top-up");
    expect(20000 - amount("Rebate Before Minimum Tax") + topUp).toBeCloseTo(Number(item.liability), 2);
    if (topUp) {
      expect(amount("Tax After Rebate")).toBe(Number(item.post));
      expect(amount("Tax After Rebate") + topUp).toBeCloseTo(amount("Annual Liability"), 2);
    } else expect(screen.queryByText("Tax After Rebate", { selector: ".wealth-tax-journey-label" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "How your rebate is calculated" }));
    expect(within(screen.getByRole("tooltip")).getByText("Statutory entitlement")).toBeVisible();
  });

  it("keeps the ordinary salary journey at eight contextual steps even with an entered zero other source", () => {
    const facts = [
      { id: "salary", kind: "private_employment", basis: "gross", amount: "900000", excluded_group_insurance_benefit: "0", benefits_valuation_complete: "yes" },
      { id: "other", kind: "ordinary_other", basis: "precomputed_taxable", amount: "0", ordinary_treatment_confirmed: "yes" },
    ] as const;
    const base = { ...baseline.base, income: [
      { id: "salary", kind: "private_employment", classification: "ordinary", entered_amount: "900000", excluded_amount: "0", deductible_amount: "300000", taxable_amount: "600000", special_tax: "0", reason_codes: [] },
      { id: "other", kind: "ordinary_other", classification: "ordinary", entered_amount: "0", excluded_amount: "0", deductible_amount: "0", taxable_amount: "0", special_tax: "0", reason_codes: [] },
    ] };
    const action = vi.fn();
    const { container } = render(<TaxJourney result={{ ...baseline, base }} locale="en" incomeFacts={[...facts]} onExploreSavings={action} />);
    expect(container.querySelectorAll(".wealth-tax-journey-item")).toHaveLength(8);
    expect(screen.getByText("Gross Salary", { selector: ".wealth-tax-journey-label" })).toBeVisible();
    expect(screen.getByText("Taxable Salary", { selector: ".wealth-tax-journey-label" })).toBeVisible();
    expect(container.querySelectorAll(".wealth-tax-journey-metric")).toHaveLength(4);
    expect(container.querySelectorAll(".wealth-tax-journey-insight-card")).toHaveLength(3);
    fireEvent.click(screen.getByRole("button", { name: /Explore More Savings/ }));
    expect(action).toHaveBeenCalledOnce();
  });

  it("shows the allowance and uses the compact senior card without an extra age action", () => {
    const change = vi.fn(), facts = initialFacts();
    const base: TaxBreakdown = { ...baseline.base, annual_status: "needs_review", annual_liability: null,
      missing_facts: [{ message_id: "coverage_wealth_surcharge_unknown", rule_id: "scope.wealth_and_vehicle", field_path: "coverage.wealth_surcharge", values: [] }] };
    const { container } = render(<ProfileStep facts={facts} change={change} selected={selected} locale="en" base={base} />);
    expect(container.querySelector(".wealth-tax-about-allowance-insight")).toHaveTextContent("BDT 400,000");
    expect(screen.queryByRole("combobox", { name: "Qualifies for age 65+ threshold this year?" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Not sure about age qualification" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /^Senior Citizen/ }));
    expect(change).toHaveBeenCalledWith({ profile: { ...facts.profile, senior_qualified_for_year: "yes" }, answeredPaths: ["profile.senior_qualified_for_year"] });
  });

  it.each(cases.flatMap((item) => [false, true].map((scenario) => ({ item, scenario }))))(
    "keeps actual/scenario progress consistent at $item.eligible, scenario=$scenario",
    ({ item, scenario }) => {
      const { container } = showProgress(checkpoint(item), scenario);
      const progress = screen.getByRole("progressbar", { name: "Usable tax saving progress" });
      expect(progress).toHaveAttribute("aria-valuenow", String(item.progress));
      if (item.progress === 100) {
        expect(screen.getByText("No further annual tax saving")).toBeVisible();
        expect(container.querySelector(".wealth-tax-play-aside .wealth-tax-jar-full")).toBeTruthy();
        const needed = screen.getByText("Further Eligible Investment Needed").nextElementSibling;
        expect(needed).toHaveTextContent("BDT 0");
        expect(screen.queryByText("Rebate utilization 0%")).not.toBeInTheDocument();
      }
    },
  );

  it("presents a complete zero-tax case as needing no additional saving", () => {
    const base: TaxBreakdown = {
      ...baseline.base, gross_tax: "0", ordinary_tax: "0", ordinary_income: "0",
      annual_liability: "0", post_rebate_tax: "0", minimum_tax_triggered: false,
      rebate: {
        ...baseline.base.rebate, income_limit: "0", potential_additional_tax_saving: "0",
        additional_eligible_investment_for_lowest_usable_liability: null,
      },
    };
    showProgress(base);
    expect(screen.getByText(/No tax saving needed — your estimated annual tax is zero/)).toBeVisible();
    expect(screen.getByText("No further annual tax saving")).toBeVisible();
    expect(screen.queryByText(/Rebate utilization 100%/)).not.toBeInTheDocument();
    expect(screen.getByText("Eligible Investment · No Additional Saving")).toBeVisible();
  });

  it.each(["needs_review", "unsupported"] as const)("keeps %s distinct from a completed target", (status) => {
    const { container } = showProgress({
      ...baseline.base, annual_status: status, annual_liability: null,
      rebate: { ...baseline.base.rebate, potential_additional_tax_saving: null, additional_eligible_investment_for_lowest_usable_liability: null },
    });
    expect(screen.getByRole("progressbar")).not.toHaveAttribute("aria-valuenow");
    expect(container.querySelector(".wealth-tax-play-aside .wealth-tax-jar-unavailable")).toBeTruthy();
    expect(screen.queryByText("No further annual tax saving")).not.toBeInTheDocument();
  });

  it("keeps unavailable planning targets distinct even when the annual result is complete", () => {
    showProgress({
      ...baseline.base,
      rebate: { ...baseline.base.rebate, potential_additional_tax_saving: null, additional_eligible_investment_for_lowest_usable_liability: null },
    });
    expect(screen.getByRole("progressbar")).not.toHaveAttribute("aria-valuenow");
    expect(screen.queryByText("No further annual tax saving")).not.toBeInTheDocument();
  });

  it("keeps the restored Journey on current facts while comparing a scenario", () => {
    render(<TaxJourney result={{
      ...baseline, scenario: { breakdown: checkpoint(cases[4]), eligible_increment: "180000", annual_saving: "15000", settlement_saving: null, limiting_reason: null, is_historical: false },
    }} locale="en" />);
    expect(screen.getByRole("heading", { name: "Your tax journey, simplified" })).toBeVisible();
    expect(screen.getAllByText("BDT 20,000").length).toBeGreaterThan(0);
  });

  it.each(["en", "bn"] as const)("keeps missing facts actionable while collapsing evidence in %s", (locale) => {
    const rules = {
      ...selected.rules,
      sources: [{ id: "official", edition: "Long evidence edition metadata", public_url: "https://nbr.gov.bd/source.pdf", sha256: "x".repeat(64) }],
      rule_references: [{
        id: "scope.individual", effective_basis: "assessment_year" as const, policy_id: "scope.individual",
        supported_facts: ["scope"], golden_cases: [], references: [{ document_id: "official", pdf_pages: [61], provision: "Relevant provision" }],
      }],
    };
    const edit = vi.fn();
    render(<PlannerResults locale={locale} rules={rules} onEdit={edit} result={{
      ...baseline, base: { ...baseline.base, annual_status: "needs_review", annual_liability: null,
        missing_facts: [{ message_id: "resident_individual_scope_needed", rule_id: "scope.individual", field_path: "profile.residence", values: [] }] },
    }} />);
    fireEvent.click(screen.getByRole("button", { name: locale === "en" ? "Edit facts" : "তথ্য বদলান" }));
    expect(edit).toHaveBeenCalledWith("profile.residence");
    const summary = screen.getByText(locale === "en" ? "Official source" : "সরকারি উৎস", { selector: "summary" });
    const source = within(summary.parentElement!).getByText("Relevant provision");
    expect(source).not.toBeVisible();
    fireEvent.click(summary);
    expect(source).toBeVisible();
    expect(source).toHaveAttribute("href", "https://nbr.gov.bd/source.pdf");
  });
});
