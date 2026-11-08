/** @vitest-environment jsdom */

import "@testing-library/jest-dom/vitest";
import * as React from "react";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { TaxBreakdown, TaxResult } from "./contracts";
import { buildTaxRequest, initialFacts, incomeEntry } from "./facts";
import { ScenarioForm } from "./planner-form";
import { ProfileStep, InvestmentsStep, CreditsStep, IncomeStep } from "./planner-form";
import { PlannerResults } from "./planner-results";
import { TaxHero, TaxJourney, TaxSnapshot } from "./planner-template";
import { focusField } from "./focus-field";
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
      breakdown: base, eligible_increment: base.eligible_investment, annual_saving: String(20000 - Number(base.annual_liability)),
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
    const { rerender } = render(<TaxHero locale="en" base={baseline.base} identity={selected.identity} provenance="example" />);
    const preview = screen.getByRole("complementary", { name: "Savings preview" });
    expect(within(preview).getByText("Annual tax")).toBeVisible();
    expect(within(preview).getByText("Could still save")).toBeVisible();
    expect([...preview.querySelectorAll("strong")].map((node) => node.textContent)).toEqual(["BDT 20,000", "BDT 15,000"]);
    expect(within(preview).getByText("Sample · BDT 900,000 yearly salary")).toBeVisible();
    rerender(<TaxHero locale="bn" base={baseline.base} identity={selected.identity} provenance="example" />);
    expect(screen.getByText("নমুনা · বছরে ৯ লাখ টাকা বেতন")).toBeVisible();
    rerender(<TaxHero locale="en" base={baseline.base} identity={selected.identity} provenance="personal" />);
    expect(screen.queryByText("Sample · BDT 900,000 yearly salary")).not.toBeInTheDocument();
  });
  it.each(cases)("reconciles the journey at eligible investment $eligible", (item) => {
    const base = checkpoint(item);
    render(<TaxJourney result={{ ...baseline, base }} locale="en" />);
    const amount = (label: string) => Number(screen.getByText(label,{exact:true}).parentElement!.querySelector("strong")!.textContent!.replace(/[^\d.]/g,""));
    expect(amount("Tax before rebate")).toBe(20000);
    expect(amount("Applied rebate")).toBe(Number(item.entitlement));
    const topUp=item.topUp==="0"?0:amount("Minimum-Tax adjustment");
    expect(20000-amount("Applied rebate")+topUp).toBeCloseTo(Number(item.liability),2);
    if(topUp) expect(amount("Tax after rebate")+topUp).toBeCloseTo(Number(item.liability),2);
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
    expect(screen.getByRole("region",{name:"Tax journey steps"}).querySelectorAll("article")).toHaveLength(3);
    expect(screen.getByText("Total income")).toBeVisible();
    expect(screen.getAllByText("Income after deductions")).toHaveLength(2);
    expect(screen.queryByText("Smart Insights")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Compare Investment/ }));
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
    "shows usable additional saving without a utilization bar at $item.eligible, scenario=$scenario",
    ({ item, scenario }) => {
      const { container } = showProgress(checkpoint(item), scenario);
      expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
      expect(screen.queryByText(/Rebate utilization/)).not.toBeInTheDocument();
      if (scenario && item.progress === 100) expect(container.querySelector(".wealth-tax-jar-full")).toBeTruthy();
      if (!scenario) {
        expect(container.querySelector("#tax-planner-play-explore .wealth-tax-jar")).toBeTruthy();
        if (item.progress === 100) expect(screen.getByRole("slider")).toBeDisabled();
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
    expect(screen.getByText("Your estimated Tax is already zero. No additional saving is needed.")).toBeVisible();
    expect(screen.getByRole("slider")).toBeDisabled();
    expect(screen.queryByText(/Rebate utilization 100%/)).not.toBeInTheDocument();
    expect(screen.getByText("Eligible Investment · No Additional Saving")).toBeVisible();
  });

  it.each(["needs_review", "unsupported"] as const)("keeps %s distinct from a completed target", (status) => {
    const { container } = showProgress({
      ...baseline.base, annual_status: status, annual_liability: null,
      rebate: { ...baseline.base.rebate, potential_additional_tax_saving: null, additional_eligible_investment_for_lowest_usable_liability: null },
    });
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
    expect(container.querySelector("#tax-planner-play-explore .wealth-tax-jar-unavailable")).toBeTruthy();
    expect(screen.queryByText("No further Tax reduction under these facts")).not.toBeInTheDocument();
  });

  it("keeps unavailable planning targets distinct even when the annual result is complete", () => {
    showProgress({
      ...baseline.base,
      rebate: { ...baseline.base.rebate, potential_additional_tax_saving: null, additional_eligible_investment_for_lowest_usable_liability: null },
    });
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
    expect(screen.queryByText("No further Tax reduction under these facts")).not.toBeInTheDocument();
  });

  it("keeps the restored Journey on current facts while comparing a scenario", () => {
    render(<TaxJourney result={{
      ...baseline, scenario: { breakdown: checkpoint(cases[4]), eligible_increment: "180000", annual_saving: "15000", settlement_saving: null, limiting_reason: null, is_historical: false },
    }} locale="en" />);
    expect(screen.getByRole("heading", { name: "From income to Tax, in three simple steps" })).toBeVisible();
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

 it("explains a binding minimum Tax without changing the restored card",()=>{
  const base={...checkpoint(cases[3]),minimum_tax_binding:true};
  const {container}=showProgress(base);
  expect(screen.getByText(/Your current Tax is at the minimum/)).toBeVisible();
  expect(screen.getByRole("slider")).toBeDisabled();
  expect(container.querySelector("#tax-planner-play-explore .wealth-tax-jar")).toBeTruthy();
 });

it("keeps the current Tax visible inside fine-tune when a proposal is invalid",()=>{
 const facts={...initialFacts(),scenario:{mode:"confirmed_eligible_total" as const,amount:"invalid",contributed_on:"2026-11-05",confirmed_for_year:true as const},scenarioConfirmed:true};
 render(<ScenarioForm facts={facts} change={vi.fn()} selected={selected} locale="en" asOf="2026-11-05" calculate={vi.fn()} disabled={false} base={baseline.base} invalid />);
 fireEvent.click(screen.getByRole("button",{name:/Date & category checks/}));
 expect(screen.getByText("Current Tax: BDT 20,000 → Proposed Tax: — · Saving from this additional Investment: —")).toBeVisible();
});


describe("approved step disclosures", () => {
  it("keeps explicit uncertainty visible without rewriting profile facts", () => {
    const facts = initialFacts(), change = vi.fn();
    facts.coverage.foreign_or_treaty_income = "unknown";
    facts.answeredPaths = ["coverage.foreign_or_treaty_income"];
    render(<ProfileStep facts={facts} change={change} selected={selected} locale="en" base={baseline.base}/>);
    expect(screen.getByLabelText("Is there foreign or treaty income?")).toBeVisible();
    expect(screen.getByLabelText("Is there foreign or treaty income?")).toHaveValue("unknown");
    expect(screen.queryByText(/allowance confirmed/)).not.toBeInTheDocument();
    expect(change).not.toHaveBeenCalled();
  });
  it("opens a collapsed source and its conditions when navigating to an invalid field", () => {
    const facts = initialFacts();
    facts.income = [incomeEntry("private_employment", "entered", "900000")];
    const { container } = render(<IncomeStep facts={facts} change={vi.fn()} selected={selected} locale="en"/>);
    const source = container.querySelector("[data-path='income.0'] details") as HTMLDetailsElement;
    source.open = false;
    expect(focusField(container, "income.0.excluded_group_insurance_benefit")).toBe(true);
    expect(source.open).toBe(true);
    expect(document.activeElement?.closest("[data-path]")?.getAttribute("data-path")).toBe("income.0.excluded_group_insurance_benefit");
  });
  it("retains category and contribution values when selecting the eligible-total method", () => {
    const facts = initialFacts(), change = vi.fn();
    facts.investmentMode = "categories"; facts.categoryAmounts = {dps:"120000"}; facts.aggregate="50000";
    render(<InvestmentsStep facts={facts} change={change} selected={selected} locale="en"/>);
    fireEvent.click(screen.getByRole("checkbox", {name:"Enter each Investment type separately"}));
    expect(change).toHaveBeenCalledWith({investmentMode:"aggregate"});
    expect(facts.categoryAmounts.dps).toBe("120000");
  });
});

it("shows the backend counted amount and cap reason without recomputing eligibility", () => {
  const base = {...baseline.base, investments:[{id:"dps-line",category:"dps",entered_amount:"200000",eligible_amount:"120000",excluded_amount:"80000",cap_group:"dps",reason_codes:["investment_shared_cap"]}]};
  render(<InvestmentsStep facts={initialFacts()} change={vi.fn()} selected={selected} locale="en" base={base}/>);
  expect(screen.getByText(/BDT 200,000 → BDT 120,000/)).toHaveTextContent("BDT 80,000");
  expect(screen.getByText(/A shared category limit reduced the eligible amount/)).toBeVisible();
});

it("shows every common income amount without a card toggle", () => {
  render(<IncomeStep facts={initialFacts()} change={vi.fn()} selected={selected} locale="bn"/>);
  expect(screen.getAllByRole("textbox",{name:"মোট বার্ষিক আয়"})).toHaveLength(4);
  expect(screen.getAllByRole("textbox",{name:"মোট বার্ষিক আয়"}).every(field => field.closest("article"))).toBe(true);
});
it("offers one Investment checkbox and shows all eligible category inputs", () => {
  const facts=initialFacts();facts.investmentMode="categories";
  render(<InvestmentsStep facts={facts} change={vi.fn()} selected={selected} locale="en"/>);
  expect(screen.getByRole("checkbox",{name:"Enter each Investment type separately"})).toBeChecked();
  expect(screen.queryByRole("button",{name:"Checked contributions"})).not.toBeInTheDocument();
  expect(screen.getByRole("textbox",{name:/DPS · Annual eligible amount/})).toBeVisible();
});

it("opens optional source fields with the Income checkbox", () => {
  render(<IncomeStep facts={initialFacts()} change={vi.fn()} selected={selected} locale="en"/>);
  const card=screen.getByRole("article",{name:"Private employment"});
  const check=within(card).getByRole("checkbox",{name:"Add source details"});
  fireEvent.click(check);
  expect(check).toBeChecked();
  expect(within(card).getByLabelText("Income date (optional for annual totals)")).toBeVisible();
  fireEvent.click(check);
  expect(check).not.toBeChecked();
});


describe("Investment simulator comparison", () => {
  const scenarioResult: TaxResult = {...baseline, scenario:{breakdown:{...baseline.base,annual_liability:"17000"},eligible_increment:"30000",annual_saving:"3000",settlement_saving:null,limiting_reason:null,is_historical:false}};
  const proposal = {...initialFacts(),scenario:{mode:"confirmed_eligible_total" as const,amount:"30000",contributed_on:"2026-11-05",confirmed_for_year:true as const},scenarioConfirmed:true};
  it("keeps selected saving separate from maximum saving and preserves modal feedback", () => {
    render(<ScenarioForm facts={proposal} change={vi.fn()} selected={selected} locale="en" asOf="2026-11-05" calculate={vi.fn()} disabled={false} base={baseline.base} result={scenarioResult}/>);
    expect(screen.getByText("Additional Tax saving").parentElement).toHaveTextContent("3,000");
    expect(screen.getByRole("status",{name:"With this extra Investment"})).toHaveTextContent("17,000");
    expect(screen.getByText("Maximum Tax saving").parentElement).toHaveTextContent("15,000");
    expect(screen.queryByText(/Total saved/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button",{name:/Date & category checks/}));
    expect(screen.getByText("Current Tax: BDT 20,000 → Proposed Tax: BDT 17,000 · Saving from this additional Investment: BDT 3,000")).toBeVisible();
  });
  it("uses the same dated proposal for editable amounts and resets only the comparison", () => {
    const change=vi.fn();
    render(<ScenarioForm facts={proposal} change={change} selected={selected} locale="en" asOf="2026-11-05" calculate={vi.fn()} disabled={false} base={baseline.base}/>);
    fireEvent.change(screen.getByRole("textbox",{name:"Extra eligible Investment"}),{target:{value:"40000"}});
    expect(change).toHaveBeenCalledWith({scenario:{...proposal.scenario,amount:"40000"},scenarioConfirmed:true});
    fireEvent.click(screen.getByRole("button",{name:"Reset"}));
    expect(change).toHaveBeenLastCalledWith({scenario:null,scenarioConfirmed:false});
  });
  it.each(["pending","invalid"] as const)("does not present a retained proposal as current while %s", state => {
    render(<ScenarioForm facts={proposal} change={vi.fn()} selected={selected} locale="en" asOf="2026-11-05" calculate={vi.fn()} disabled={false} base={baseline.base} result={scenarioResult} pending={state==="pending"} invalid={state==="invalid"}/>);
    const comparison=screen.getByRole("status",{name:"Investment comparison"});
    expect(comparison).toHaveTextContent("20,000");
    expect(comparison).not.toHaveTextContent("17,000");
    expect(comparison).not.toHaveTextContent("3,000");
  });
});


describe("approved savings-first simulator", () => {
  const proposal = (amount:string) => ({...initialFacts(),scenario:{mode:"confirmed_eligible_total" as const,amount,contributed_on:"2026-11-05",confirmed_for_year:true as const},scenarioConfirmed:true});
  it.each([
    {amount:"0",tax:"20000",saving:"0",remaining:"150000",potential:"15000"},
    {amount:"50000",tax:"15000",saving:"5000",remaining:"100000",potential:"10000"},
    {amount:"150000",tax:"5000",saving:"15000",remaining:null,potential:"0"},
    {amount:"180000",tax:"5000",saving:"15000",remaining:null,potential:"0"},
  ])("keeps the backend outcome and maximum distinct at $amount", c => {
    const projected={...baseline.base,annual_liability:c.tax,eligible_investment:c.amount,minimum_tax_binding:c.amount==="180000",rebate:{...baseline.base.rebate,potential_additional_tax_saving:c.potential,additional_eligible_investment_for_lowest_usable_liability:c.remaining}};
    render(<ScenarioForm facts={proposal(c.amount)} change={vi.fn()} selected={selected} locale="en" asOf="2026-11-08" calculate={vi.fn()} disabled={false} base={baseline.base} result={{...baseline,scenario:{breakdown:projected,eligible_increment:c.amount,annual_saving:c.saving,settlement_saving:null,limiting_reason:null,is_historical:false}}}/>);
    expect(screen.getAllByRole("slider")).toHaveLength(1);
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
    expect(screen.getByText("Additional Tax saving").parentElement?.querySelector("strong")).toHaveTextContent(new Intl.NumberFormat("en-BD").format(Number(c.saving)));
    expect(screen.getByText("Maximum Tax saving").parentElement).toHaveTextContent("15,000");
    if(c.amount==="180000") expect(screen.getByText(/above this extra amount adds no further Tax saving/)).toBeVisible();
  });
  it("uses the returned additional limit with existing Investments and retains the chosen date", () => {
    const base=checkpoint(cases[0]), change=vi.fn();
    render(<ScenarioForm facts={proposal("30000")} change={change} selected={selected} locale="en" asOf="2026-11-08" calculate={vi.fn()} disabled={false} base={base}/>);
    fireEvent.click(screen.getByRole("button",{name:"Set max: BDT 100,000"}));
    expect(change).toHaveBeenCalledWith({scenario:{...proposal("30000").scenario,amount:"100000"},scenarioConfirmed:true});
    fireEvent.click(screen.getByText("How this works",{selector:"summary"}));
    expect(screen.getByText("Total at saving limit").nextElementSibling).toHaveTextContent("150,000");
    expect(screen.getByText("Extra amount at saving limit").nextElementSibling).toHaveTextContent("100,000");
  });
  it("does not invent a useful limit from the statutory maximum", () => {
    render(<ScenarioForm facts={initialFacts()} change={vi.fn()} selected={selected} locale="en" asOf="2026-11-08" calculate={vi.fn()} disabled={false} base={{...baseline.base,rebate:{...baseline.base.rebate,additional_eligible_investment_for_lowest_usable_liability:null}}}/>);
    expect(screen.getByRole("button",{name:/Set max:/})).toBeDisabled();
    expect(screen.getByText(/usable saving limit is unavailable/)).toBeVisible();
  });
  it.each(["en","bn"] as const)("preserves amount replacement, pasted grouping and decimals in %s", locale => {
    function Harness(){const [facts,setFacts]=React.useState(proposal("50000"));return <ScenarioForm facts={facts} change={patch=>setFacts({...facts,...patch} as typeof facts)} selected={selected} locale={locale} asOf="2026-11-08" calculate={vi.fn()} disabled={false} base={baseline.base}/>;}
    render(<Harness/>);
    const input=screen.getByRole("textbox",{name:locale==="en"?"Extra eligible Investment":"অতিরিক্ত যোগ্য Investment"});
    fireEvent.focus(input);fireEvent.change(input,{target:{value:locale==="en"?"150,000.25":"১,৫০,০০০.২৫"}});
    expect(input).toHaveValue(locale==="en"?"150,000.25":"১,৫০,০০০.২৫");
    fireEvent.blur(input);expect(input).toHaveValue(locale==="en"?"150,000.25":"১,৫০,০০০.২৫");
    fireEvent.click(screen.getByRole("button",{name:locale==="en"?"Set max: BDT 150,000":"সর্বোচ্চ সেট করি: ৳১,৫০,০০০"}));
    expect(input).toHaveValue(locale==="en"?"150,000":"১,৫০,০০০");
  });
});

it("groups insight into three paired tiles and preserves the hero jar", () => {
  const facts=initialFacts(),base=checkpoint(cases[0]);
  const {container}=render(<ScenarioForm facts={facts} change={vi.fn()} selected={selected} locale="en" asOf="2026-11-08" calculate={vi.fn()} disabled={false} base={base}/>);
  expect(screen.getByText("Current Investment").parentElement?.parentElement?.parentElement?.children).toHaveLength(3);
  expect(screen.getByText("Saved so far").parentElement).toHaveTextContent("5,000");
  expect(screen.getByText("Lowest possible Tax").parentElement).toHaveTextContent("5,000");
  expect(screen.getByText("Total Investment for Max Savings").parentElement).toHaveTextContent("150,000");
  expect(screen.getByText("Tax with this Investment").parentElement).toHaveTextContent("15,000");
  expect(container.querySelector("#tax-planner-play-explore svg circle")).toBeTruthy();
});

it("groups live totals with added saving and suppresses stale outcomes", () => {
  const base=checkpoint(cases[0]);
  const facts={...initialFacts(),scenario:{mode:"confirmed_eligible_total" as const,amount:"50000",contributed_on:"2026-11-05",confirmed_for_year:true as const},scenarioConfirmed:true};
  const result={...baseline,scenario:{breakdown:{...base,annual_liability:"10000"},eligible_increment:"50000",annual_saving:"5000",settlement_saving:null,limiting_reason:null,is_historical:false}};
  const props={facts,change:vi.fn(),selected,locale:"en" as const,asOf:"2026-11-08",calculate:vi.fn(),disabled:false,base,result};
  const {rerender}=render(<ScenarioForm {...props}/>);
  const preview=screen.getByRole("status",{name:"With this extra Investment"});
  expect(within(preview).getByText("Total Investment").parentElement).toHaveTextContent("100,000");
  expect(within(preview).getByText("Additional Tax saving").parentElement).toHaveTextContent("5,000");
  expect(within(preview).getByText(/Total saved/)).toHaveTextContent("10,000");
  expect(within(preview).getByText("Tax with this Investment").parentElement).toHaveTextContent("10,000");
  rerender(<ScenarioForm {...props} pending/>);
  expect(preview).toHaveAttribute("aria-busy","true");
  expect(within(preview).getByText("Tax with this Investment").parentElement?.querySelector("strong")).toHaveTextContent("—");
});

it("keeps the receipt on current facts and exposes statutory versus usable rebate", () => {
 render(<TaxJourney result={{...baseline,scenario:{breakdown:{...baseline.base,annual_liability:"5000"},eligible_increment:"150000",annual_saving:"15000",settlement_saving:null,limiting_reason:null,is_historical:false}}} locale="en"/>);
 const flow=screen.getByRole("region",{name:"Tax journey steps"});
 expect(within(flow).getByText("Estimated annual Tax").parentElement).toHaveTextContent("20,000");
 fireEvent.focus(within(flow).getByRole("button",{name:"How your rebate is calculated"}));
 expect(screen.getByRole("tooltip")).toHaveTextContent("Statutory entitlement");
 expect(screen.getByRole("tooltip")).toHaveTextContent("Usable tax reduction");
});
it("shows the minimum adjustment even without the binding flag", () => {
 const base={...checkpoint(cases[3]),minimum_tax_binding:false,minimum_tax_top_up:"3000",post_rebate_tax:"2000",annual_liability:"5000"};
 render(<TaxJourney result={{...baseline,base}} locale="en"/>);
 expect(screen.getByText("Minimum-Tax adjustment").parentElement).toHaveTextContent("3,000");
 expect(screen.getByText("Estimated annual Tax").parentElement).toHaveTextContent("5,000");
});
it("keeps all artwork decorative and details and comparison actions separate", () => {
 const compare=vi.fn(),details=vi.fn();const {container}=render(<TaxJourney result={baseline} locale="en" onShowDetails={details} onExploreSavings={compare}/>);
 expect(container.querySelectorAll('img[alt=""]')).toHaveLength(4);
 fireEvent.click(screen.getByRole("button",{name:/View calculation details/}));expect(details).toHaveBeenCalledOnce();expect(compare).not.toHaveBeenCalled();
 fireEvent.click(screen.getByRole("button",{name:/Compare Investment/}));expect(compare).toHaveBeenCalledOnce();
});
it.each(["updating","last"] as const)("does not promise saving from a %s estimate",freshness=>{
 render(<TaxJourney result={baseline} locale="en" presentation={{freshness}}/>);
 expect(screen.queryByText("BDT 150,000")).not.toBeInTheDocument();
 expect(screen.getByText(/Review the current facts/)).toBeVisible();
});
it("keeps unknown results as dashes and separates special-rate income",()=>{
 const base={...baseline.base,annual_status:"needs_review" as const,annual_liability:null,special_rate_income:"100000",special_tax:"15000"};
 render(<TaxJourney result={{...baseline,base}} locale="en"/>);
 expect(screen.getByText("Estimated annual Tax").parentElement).toHaveTextContent("—");
 expect(screen.getByText("Separate-rate income").parentElement).toHaveTextContent("100,000");
 expect(screen.getByText(/Includes separate-rate Tax/)).toHaveTextContent("15,000");
});

it("shows no-saving and rounding states without inventing an opportunity",()=>{
 const base={...checkpoint(cases[4]),rebate:{...checkpoint(cases[4]).rebate,potential_additional_tax_saving:"0",liability_rounding_adjustment:"0.25"}};
 render(<TaxJourney result={{...baseline,base}} locale="en"/>);
 expect(screen.getByText("Your saving limit is reached")).toBeVisible();
 expect(screen.getByText("Rounding adjustment").parentElement).toHaveTextContent("0.25");
 expect(screen.getByText(/Further Investment brings no additional/)).toBeVisible();
});
it("keeps exemptions and source deductions separate when both exist",()=>{
 const base={...baseline.base,income:[{...baseline.base.income[0],entered_amount:"900000",excluded_amount:"50000",deductible_amount:"250000"}]};
 render(<TaxJourney result={{...baseline,base}} locale="en"/>);
 expect(screen.getByText("Exempt income").parentElement).toHaveTextContent("50,000");
 expect(screen.getByText("Allowed deductions").parentElement).toHaveTextContent("250,000");
});

it("uses the refined hero copy and leaves unavailable money unknown",()=>{
 const {container,rerender}=render(<TaxHero locale="en" identity={selected.identity}/>);
 expect(screen.getByText("Understand your Tax.")).toBeVisible();
 expect(screen.getByText("See where eligible Investment could help.")).toBeVisible();
 expect(container.querySelector('img[src="/wealth/tax-hero/tax-investment-folio.webp"]')).toHaveAttribute("alt","");
 expect(screen.getByRole("complementary",{name:"Savings preview"})).toHaveTextContent("—");
 rerender(<TaxHero locale="bn" identity={selected.identity} base={baseline.base} provenance="personal"/>);
 expect(screen.getByText("আপনার Tax বুঝে নিন।")).toBeVisible();
 expect(screen.queryByText(/নমুনা ·/)).not.toBeInTheDocument();
});
