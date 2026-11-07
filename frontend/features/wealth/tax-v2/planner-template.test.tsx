/** @vitest-environment jsdom */

import "@testing-library/jest-dom/vitest";
import { useState } from "react";
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
    expect(screen.queryByRole("button", { name: locale === "en" ? "Add tax payment" : "কর পরিশোধ যোগ করুন" })).not.toBeInTheDocument();
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
    expect(screen.queryByRole("button", { name: "Add tax payment" })).not.toBeInTheDocument();
    expect(change).not.toHaveBeenCalled();
    view.rerender(<CreditsStep facts={facts} change={change} selected={config("2026-27").selected!} locale="en" />);
    expect(screen.getByRole("button", { name: "Add tax payment" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Add tax payment" }));
    expect(change.mock.lastCall![0].credits).toHaveLength(2);
    expect(change.mock.lastCall![0].credits[0]).toEqual(facts.credits[0]);
  });
});

const cases = [
  { eligible: "50000", entitlement: "5000", post: "15000", topUp: "0", liability: "15000", remaining: "100000", saving: "10000" },
  { eligible: "149999", entitlement: "14999.90", post: "5000.10", topUp: "0", liability: "5000.10", remaining: "1", saving: "0.10" },
  { eligible: "150000", entitlement: "15000", post: "5000", topUp: "0", liability: "5000", remaining: null, saving: "0" },
  { eligible: "180000", entitlement: "18000", post: "2000", topUp: "3000", liability: "5000", remaining: null, saving: "0" },
] as const;
function checkpoint(item: typeof cases[number]): TaxBreakdown {
  return { ...baseline.base, eligible_investment: item.eligible, post_rebate_tax: item.post, minimum_tax_binding: item.topUp !== "0", minimum_tax_top_up: item.topUp, annual_liability: item.liability,
    rebate: { ...baseline.base.rebate, entitlement: item.entitlement, investment_limit: item.entitlement, effective_tax_reduction: item.liability === "15000" ? "5000" : item.liability === "5000.10" ? "14999.90" : "15000", additional_eligible_investment_for_lowest_usable_liability: item.remaining, potential_additional_tax_saving: item.saving } };
}
afterEach(cleanup);
describe("annual estimate and current-facts Journey", () => {
  it("keeps artwork out of entry and gives the annual amount one primary home", () => {
    const view = render(<><TaxHero locale="en" identity={selected.identity} /><TaxSnapshot locale="en" result={baseline} presentation={{ provenance: "example" }} /></>);
    expect(screen.queryByRole("complementary", { name: "Savings preview" })).not.toBeInTheDocument();
    expect(screen.getByText("Example · based on BDT 900,000 annual salary")).toBeVisible();
    expect(screen.getByRole("heading", { name: "Estimated annual Tax" }).parentElement).toHaveTextContent("BDT 20,000");
    expect(screen.getByText("Tax reduction already applied").nextElementSibling).toHaveTextContent("BDT 0");
    expect(screen.getByText("Could save more with eligible Investment").nextElementSibling).toHaveTextContent("BDT 15,000");
    expect(view.container.querySelectorAll("svg")).toHaveLength(0);
  });
  it.each(cases)("explains returned rebate and floor values at $eligible", (item) => {
    render(<TaxJourney result={{ ...baseline, base: checkpoint(item) }} locale="en" />);
    fireEvent.click(screen.getByText("2 · Tax calculation"));
    const amount = (label: string) => Number(screen.getByText(label, { selector: "dt" }).nextElementSibling!.textContent!.replace(/[^\d.]/g, ""));
    expect(amount("Tax before rebate")).toBe(20000);
    expect(amount("Rebate before minimum-tax check")).toBeCloseTo(Number(item.entitlement), 2);
    expect(amount("Tax after rebate") + amount("Minimum-tax top-up")).toBeCloseTo(Number(item.liability), 2);
    expect(screen.getByRole("heading", { name: "3 · Final result" }).parentElement).toHaveTextContent("BDT " + Number(item.liability).toLocaleString("en-BD"));
    expect(screen.queryByText("Smart Insights")).not.toBeInTheDocument();
  });
  it("explains current base when a hypothetical has a different liability", () => {
    render(<TaxJourney result={{ ...baseline, scenario: { breakdown: checkpoint(cases[3]), eligible_increment: "180000", annual_saving: "15000", settlement_saving: null, limiting_reason: null, is_historical: false } }} locale="en" />);
    expect(screen.getByRole("heading", { name: "3 · Final result" }).parentElement).toHaveTextContent("BDT 20,000");
    expect(screen.queryByText("Your scenario tax journey")).not.toBeInTheDocument();
  });
  it.each(["needs_review", "unsupported"] as const)("withholds %s and does not invent zero savings", (annual_status) => {
    const base = { ...baseline.base, annual_status, annual_liability: null, rebate: { ...baseline.base.rebate, potential_additional_tax_saving: null } };
    render(<><TaxSnapshot result={{ ...baseline, base }} locale="en" /><ScenarioForm facts={initialFacts()} change={vi.fn()} selected={selected} locale="en" asOf="2026-11-05" calculate={vi.fn()} disabled={true} base={base} /></>);
    expect(screen.getByRole("heading", { name: "Estimated annual Tax" }).parentElement).not.toHaveTextContent("BDT 0");
    expect(screen.getByText(/Unresolved eligibility is not zero saving/)).toBeVisible();
    expect(screen.getByText("Actual additional saving from this Investment").nextElementSibling).toHaveTextContent("—");
  });
  it.each(["0", "5000"])("distinguishes zero Tax from no further usable reduction at %s", (annual_liability) => {
    const base = { ...checkpoint(cases[3]), annual_liability };
    render(<ScenarioForm facts={initialFacts()} change={vi.fn()} selected={selected} locale="en" asOf="2026-11-05" calculate={vi.fn()} disabled={false} base={base} />);
    expect(screen.getByText(annual_liability === "0" ? /Your estimated annual Tax is zero/ : /No further usable reduction/)).toBeVisible();
    expect(screen.getByText("Actual additional saving from this Investment").nextElementSibling).toHaveTextContent("BDT 0");
  });
  it("shows entered and counted DPS with engine reasons", () => {
    render(<PlannerResults result={{ ...baseline, base: { ...baseline.base, investments: [{ id: "dps", category: "dps", entered_amount: "240000", eligible_amount: "120000", excluded_amount: "120000", cap_group: "dps", reason_codes: ["investment_shared_cap"] }] } }} rules={selected.rules} locale="bn" onEdit={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /হিসাবের বিবরণ ও উৎস/ }));
    fireEvent.click(screen.getByText("বিনিয়োগ, বিয়োজন ও রেয়াত", { selector: "summary" }));
    expect(screen.getByText("আপনার দেওয়া DPS-এর অঙ্ক").nextElementSibling).toHaveTextContent("৳২,৪০,০০০");
    expect(screen.getByText("রেয়াতের হিসাবে ধরা হয়েছে").nextElementSibling).toHaveTextContent("৳১,২০,০০০");
    expect(screen.getByText("শ্রেণির সম্মিলিত সীমায় যোগ্য অঙ্ক কমেছে।")).toBeVisible();
  });
  it("keeps missing facts actionable and official evidence expandable", () => {
    const rules = { ...selected.rules, sources: [{ id: "official", edition: "Evidence", public_url: "https://nbr.gov.bd/source.pdf", sha256: "x".repeat(64) }], rule_references: [{ id: "scope.individual", effective_basis: "assessment_year" as const, policy_id: "scope.individual", supported_facts: ["scope"], golden_cases: [], references: [{ document_id: "official", pdf_pages: [61], provision: "Relevant provision" }] }] };
    const edit = vi.fn();
    render(<PlannerResults locale="en" rules={rules} onEdit={edit} result={{ ...baseline, base: { ...baseline.base, annual_status: "needs_review", annual_liability: null, missing_facts: [{ message_id: "resident_individual_scope_needed", rule_id: "scope.individual", field_path: "profile.residence", values: [] }] } }} />);
    fireEvent.click(screen.getByRole("button", { name: "Edit facts" })); expect(edit).toHaveBeenCalledWith("profile.residence");
    expect(screen.getByText("Relevant provision")).not.toBeVisible(); fireEvent.click(screen.getByText("Official source", { selector: "summary" }));
    expect(screen.getByText("Relevant provision")).toHaveAttribute("href", "https://nbr.gov.bd/source.pdf");
  });
});


describe("reviewed public presentation regressions", () => {
  it.each([
    ["12345.67", "12345.66"], ["9999999999", "9999999998.99"],
  ])("preserves entered %s in the actual HTML range without step normalization", (amount, previousCent) => {
    const facts = initialFacts(), change = vi.fn();
    facts.scenario = { mode: "confirmed_eligible_total", amount, contributed_on: "2026-11-05", confirmed_for_year: true };
    facts.scenarioConfirmed = true;
    render(<ScenarioForm facts={facts} selected={selected} change={change} locale="en" asOf="2026-11-05" calculate={vi.fn()} disabled={false} base={baseline.base} />);
    const slider = screen.getByRole("slider") as HTMLInputElement;
    expect(screen.getByLabelText("Additional Investment")).toHaveValue(amount);
    expect(slider.value).toBe(amount);
    expect(slider.valueAsNumber).toBe(Number(amount));
    expect(slider.validity.stepMismatch).toBe(false);
    expect(slider.checkValidity()).toBe(true);
    // Exercise the native HTML stepping algorithm, not a mocked change handler.
    slider.stepDown();
    expect(slider.value).toBe(previousCent);
    expect(slider.validity.stepMismatch).toBe(false);
    fireEvent.change(slider, { target: { value: previousCent } });
    expect(change.mock.lastCall![0].scenario.amount).toBe(previousCent);
    fireEvent.click(screen.getByRole("button", { name: "+BDT 10,000" }));
    expect(change.mock.lastCall![0].scenario.amount).toBe("10000");
  });

  it("disables the slider at zero tax even with a positive statutory investment limit", () => {
    render(<ScenarioForm facts={initialFacts()} selected={selected} change={vi.fn()} locale="en" asOf="2026-11-05" calculate={vi.fn()} disabled={false} base={{ ...baseline.base, annual_liability: "0", rebate: { ...baseline.base.rebate, potential_additional_tax_saving: "0", additional_eligible_investment_for_statutory_limit: "60000" } }} />);
    expect(screen.getByRole("slider")).toBeDisabled();
    expect(screen.getByText("Your estimated annual Tax is zero. There is no further Tax to reduce.")).toBeVisible();
  });

  it.each(["en", "bn"] as const)("shows the actual assumptions without inventing defaults in %s", (locale) => {
    const response = { ...baseline, base: { ...baseline.base, assumptions: [{ message_id: "user_confirmed_eligible_investment_total", field_path: "investments", rule_id: "rebate.general", values: [] as [string, string][] }] } };
    const view = render(<TaxSnapshot result={response} locale={locale} presentation={{ defaults: [] }} />);
    expect(view.container).toHaveTextContent(locale === "en" ? "Treats your entered eligible total as a planning assumption." : "আপনার দেওয়া যোগ্য মোট ধরে পরিকল্পনার হিসাব হয়েছে।");
    expect(view.container).not.toHaveTextContent(/regular taxpayer minimum|সাধারণ করদাতার ন্যূনতম|salary benefits|বেতন সুবিধা/);
    view.rerender(<TaxSnapshot result={{ ...response, base: { ...response.base, assumptions: [{ ...response.base.assumptions[0], message_id: "planning_category_eligible_amount" }] } }} locale={locale} presentation={{ defaults: ["coverage.wealth_surcharge"] }} />);
    expect(view.container).toHaveTextContent(locale === "en" ? "Shared caps are applied" : "সম্মিলিত সীমা পরিকল্পক প্রয়োগ করেছে");
    expect(view.container).toHaveTextContent(locale === "en" ? "Unanswered special cases" : "উত্তর না দেওয়া বিশেষ পরিস্থিতি");
    expect(view.container).not.toHaveTextContent(/regular taxpayer minimum|সাধারণ করদাতার ন্যূনতম|salary benefits|বেতন সুবিধা/);
  });
  it.each(["pending", "unavailable", "restored"] as const)("does not label an uncalculated %s snapshot as a completed or review result", (state) => {
    const view = render(<TaxSnapshot locale="en" state={state} />);
    expect(view.container).toHaveTextContent(state === "pending" ? "Calculating estimate" : state === "restored" ? "Restored entries" : "Estimate unavailable");
    expect(view.container).not.toHaveTextContent(/Your current facts|Needs information or review/);
  });
  it("lets a retired category remain inactive without removing supported amounts", () => {
    const initial = initialFacts(); initial.investmentMode = "categories"; initial.categoryAmounts = { dps: "40000", retired: "5000" };
    function Editor() { const [facts, setFacts] = useState(initial); return <InvestmentsStep facts={facts} selected={selected} locale="en" change={(patch) => setFacts((current) => ({ ...current, ...patch }))} />; }
    render(<Editor />);
    const retained = screen.getByRole("article", { name: "retired (retained entry)" });
    fireEvent.click(within(retained).getByRole("button", { name: "Keep inactive" }));
    expect(within(retained).getByRole("textbox")).toHaveValue("5000"); expect(within(retained).getByRole("textbox")).toBeDisabled();
    expect(screen.getByLabelText("DPS · Annual eligible amount")).toHaveValue("40000");
    fireEvent.click(within(retained).getByRole("button", { name: "Use this category" }));
    expect(within(retained).getByRole("textbox")).toBeEnabled();
    expect(within(retained).getByRole("textbox")).toHaveValue("5000");
  });
  it.each(["", "2026-11-01"])("keeps an inactive retained filing date accessible (%s)", (date) => {
    const facts = initialFacts(); facts.filing = { filing_date: date, return_from_abroad_exception: "yes", extension_or_other_exception: "unknown" };
    const view = render(<CreditsStep facts={facts} change={vi.fn()} selected={selected} locale="en" />);
    expect(screen.getByLabelText("Planned filing date")).toHaveValue(date);
    expect(screen.getByLabelText("Return from abroad exception applies?")).toHaveValue("yes");
    expect(view.container).toHaveTextContent("inactive and excluded");
    view.rerender(<CreditsStep facts={facts} change={vi.fn()} selected={config("2026-27").selected!} locale="en" />);
    expect(screen.getByLabelText("Planned filing date")).toHaveValue(date);
    expect(view.container).not.toHaveTextContent("inactive and excluded");
  });
  it("renders distinct hypothetical reasons with actionable field paths", () => {
    const facts = initialFacts(); facts.scenario = { mode: "itemized", entry: { id: "scenario", category: "dps", amount: "10000", contributed_on: "2026-11-01", qualification: "unknown", new_investment: "unknown" } };
    const onReviewFact = vi.fn();
    const response = { ...baseline, scenario: { breakdown: { ...baseline.base, annual_status: "needs_review" as const, annual_liability: null, missing_facts: [
      { message_id: "investment_qualification_needed", field_path: "scenario.entry.qualification", rule_id: "investment.dps", values: [] as [string, string][] },
      { message_id: "new_investment_confirmation_needed", field_path: "scenario.entry.new_investment", rule_id: "investment.dps", values: [] as [string, string][] },
    ] }, eligible_increment: "0", annual_saving: null, settlement_saving: null, limiting_reason: null, is_historical: false } };
    render(<ScenarioForm facts={facts} selected={selected} change={vi.fn()} locale="en" asOf="2026-11-05" calculate={vi.fn()} disabled={false} base={baseline.base} result={response} onReviewFact={onReviewFact} />);
    expect(screen.getByText("Confirm the investment meets its category rules.")).toBeVisible();
    expect(screen.getByText("Confirm that this is a new investment in the selected period.")).toBeVisible();
    screen.getAllByRole("button", { name: "Review comparison fact" }).forEach((button) => fireEvent.click(button));
    expect(onReviewFact.mock.calls.map(([path]) => path)).toEqual(["scenario.entry.qualification", "scenario.entry.new_investment"]);
  });
});
