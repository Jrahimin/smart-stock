/** @vitest-environment jsdom */

import "@testing-library/jest-dom/vitest";

import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import type { ReactNode } from "react";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { BackendApiError } from "@/lib/api/backend-api-client";

import type { TaxRequest, TaxResult, Year } from "./contracts";

import { draftKey } from "./facts";

import { config, previewFixture, result, revision } from "./test-fixtures";

import { TaxPlannerV2Admin } from "./admin-workspace";

import { TaxPlannerV2Workspace } from "./planner-workspace";

import { getTaxPlannerDesktopGuideSteps, getTaxPlannerMobileGuideSteps } from "@/features/guide/config/tax-planner-guide";

const mocks = vi.hoisted(() => ({

  auth: { user: { id: "account-a", role: "SUPER_ADMIN" }, isAuthenticated: true, isLoading: false },

  getConfig: vi.fn(), calculate: vi.fn(), revisions: vi.fn(), getRevision: vi.fn(),

  save: vi.fn(), create: vi.fn(), preview: vi.fn(), publish: vi.fn(),

  guideStep: null as ((state: { active: boolean; stepId: string | null }) => void) | null,

}));

vi.mock("@/features/auth/context/auth-context", () => ({ useAuth: () => mocks.auth }));

vi.mock("@/features/wealth/components/wealth-sub-nav", () => ({ WealthSubNav: () => null }));

vi.mock("@/features/guide/components/tax-planner-guide", () => ({

  TaxPlannerGuide: ({ onGuideStepChange }: { onGuideStepChange: typeof mocks.guideStep }) => {

    mocks.guideStep = onGuideStepChange;

    return null;

  },

}));

vi.mock("@/features/guide/components/tax-planner-guide-launcher", () => ({ openTaxPlannerGuide: vi.fn() }));

vi.mock("./api", async (importOriginal) => ({

  ...await importOriginal<typeof import("./api")>(),

  getTaxConfig: mocks.getConfig, calculateWithRevisionRefresh: mocks.calculate,

  listTaxRevisions: mocks.revisions, getTaxRevision: mocks.getRevision, createTaxDraft: mocks.create,

  saveTaxDraft: mocks.save, previewTaxDraft: mocks.preview, publishTaxDraft: mocks.publish,

}));

function setup(children: ReactNode) {

  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });

  const app = (node: ReactNode) => <QueryClientProvider client={client}>{node}</QueryClientProvider>;

  const view = render(app(children));

  return { ...view, queryClient: client, rerender: (node: ReactNode) => view.rerender(app(node)) };

}

const button = (name: string | RegExp) => screen.queryByRole("button", { name }) ?? screen.getByRole("tab", { name });

const salaryLabel = "Gross private salary, including bonuses";

beforeEach(() => {

  vi.resetAllMocks();

  mocks.auth.user = { id: "account-a", role: "SUPER_ADMIN" };

  mocks.getConfig.mockImplementation(async () => config());

  mocks.calculate.mockImplementation(async (req: TaxRequest) => result(req));

  mocks.revisions.mockResolvedValue([revision()]);

  mocks.getRevision.mockResolvedValue(revision());

  mocks.preview.mockResolvedValue(previewFixture);

});

afterEach(() => { cleanup(); localStorage.clear(); });

describe("public planner", () => {
  it.each(["en", "bn"] as const)("keeps three steps and simple tiles through CZM and verification in %s", async (locale) => {
    setup(<TaxPlannerV2Workspace locale={locale} />);
    const bn = locale === "bn";
    fireEvent.click(await screen.findByRole("tab", { name: bn ? "বিস্তারিত হিসাব" : "Detailed planner" }));
    const steps = screen.getByRole("list", { name: bn ? "বিস্তারিত হিসাবের ধাপ" : "Detailed planner steps" });
    expect(within(steps).getAllByRole("button")).toHaveLength(3);
    fireEvent.click(button(bn ? "3. বিনিয়োগ" : "3. Investments"));
    const field = bn ? "ডিপিএস · বার্ষিক যোগ্য অঙ্ক" : "DPS · Annual eligible amount";
    fireEvent.change(screen.getByLabelText(field), { target: { value: "40000" } });
    const add = button(bn ? "সিজেডএম অনুদান যোগ করুন" : "Add CZM donation");
    fireEvent.click(add);
    expect(add).toBeDisabled();
    expect(screen.getByText(bn ? "হিসাব ও সিমুলেটর হালনাগাদ করতে অনুদানের অঙ্ক ও পরিশোধের তারিখ দিন, অথবা এই অনুদান সরান।" : "Complete the donation amount and payment date, or remove this entry, to refresh your estimate and simulator.")).toBeVisible();
    expect(screen.getAllByLabelText(bn ? "অনুদানের অঙ্ক" : "Donation amount")).toHaveLength(1);
    await waitFor(() => expect(screen.getByLabelText(bn ? "অনুদানের অঙ্ক" : "Donation amount")).toHaveFocus());
    fireEvent.click(button(bn ? "অনুদান সরান" : "Remove donation"));
    expect(add).toBeEnabled();
    expect(screen.queryByText(/Complete the donation amount|হিসাব ও সিমুলেটর হালনাগাদ করতে/)).not.toBeInTheDocument();
    expect(screen.getByLabelText(field)).toHaveValue("40000");
    fireEvent.click(button(bn ? "রিটার্নের জন্য পৃথক জমা যাচাই করুন" : "Verify individual contributions for filing"));
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(screen.getByLabelText(field)).toHaveValue("40000");
    await waitFor(() => expect(mocks.calculate.mock.lastCall![0].investments.mode).toBe("planning_category_totals"));
  });
  it("accepts DPS directly in its tile and keeps category and total methods separate", async () => {
    setup(<TaxPlannerV2Workspace locale="en" />);
    await screen.findByLabelText(salaryLabel);
    fireEvent.click(button("Detailed planner"));
    fireEvent.click(button("3. Investments"));
    expect(screen.queryByLabelText("How to enter investments")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Contribution date")).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("DPS · Annual eligible amount"), { target: { value: "40000" } });
    await waitFor(() => expect(mocks.calculate.mock.lastCall![0].investments).toEqual({ mode: "planning_category_totals", entries: [{ category: "dps", amount: "40000" }] }));
    expect(screen.getByRole("slider")).toBeEnabled();
    fireEvent.click(button("One eligible total"));
    fireEvent.change(screen.getByLabelText("Already eligible investment total"), { target: { value: "80000" } });
    await waitFor(() => expect(mocks.calculate.mock.lastCall![0].investments).toEqual({ mode: "confirmed_eligible_total", amount: "80000", confirmed_for_year: true }));
    fireEvent.click(button("By category · simple amounts"));
    expect(screen.getByLabelText("DPS · Annual eligible amount")).toHaveValue("40000");
    await waitFor(() => expect(mocks.calculate.mock.lastCall![0].investments.mode).toBe("planning_category_totals"));
    fireEvent.click(button("Quick estimate"));
    fireEvent.click(button(/Review category amounts/));
    expect(screen.getByRole("heading", { name: "Investments and deductions" })).toBeVisible();
  });

  it("can add a payment after confirming no credits without retaining a contradictory zero-credit answer", async () => {
    setup(<TaxPlannerV2Workspace locale="en" />);
    await screen.findByLabelText(salaryLabel);
    fireEvent.click(button("Detailed planner"));
    fireEvent.click(button("Optional tax adjustments"));
    fireEvent.change(screen.getByLabelText("Credit information"), { target: { value: "confirmed_none" } });
    fireEvent.click(button("Add tax payment"));
    expect(screen.getByLabelText("Credit information")).toHaveValue("unknown");
    expect(screen.getByLabelText("Tax paid")).toBeVisible();
  });
  it("preserves the estimate and usable slider when switching layouts and exposes common income fields", async () => {
    setup(<TaxPlannerV2Workspace locale="en" />);
    await screen.findByLabelText(salaryLabel);
    await waitFor(() => expect(mocks.calculate).toHaveBeenCalledOnce());
    fireEvent.click(button("Detailed planner"));
    expect(screen.getByRole("heading", { name: "Estimated annual liability" }).parentElement).toHaveTextContent("BDT 20,000");
    expect(screen.getByRole("slider")).toBeEnabled();
    expect(screen.queryByRole("button", { name: /Not sure about age/ })).not.toBeInTheDocument();
    fireEvent.click(button("2. Income"));
    for (const name of ["Private employment", "Business or professional income", "Bank interest", "Other ordinary taxable income"]) {
      const card = screen.getByRole("article", { name });
      expect(within(card).getByRole("button", { expanded: true })).toBeVisible();
      expect(within(card).getAllByRole("textbox").length).toBeGreaterThan(0);
    }
    expect(mocks.calculate).toHaveBeenCalledOnce();
    expect(mocks.calculate.mock.lastCall![0].income).toHaveLength(1);
  });

  it("debounces rapid edits, keeps labelled previous values, and calculates only the final amount", async () => {
    setup(<TaxPlannerV2Workspace locale="en" />);
    const field = await screen.findByLabelText(salaryLabel);
    await waitFor(() => expect(mocks.calculate).toHaveBeenCalledOnce());
    vi.useFakeTimers();
    try {
      for (const value of ["1", "12", "1200000"]) fireEvent.change(field, { target: { value } });
      await act(async () => { await vi.advanceTimersByTimeAsync(499); });
      expect(mocks.calculate).toHaveBeenCalledOnce();
      expect(screen.getByRole("heading", { name: "Estimated annual liability" }).parentElement).toHaveTextContent("BDT 20,000");
      expect(screen.getByText(/Updating estimate/)).toBeVisible();
      await act(async () => { await vi.advanceTimersByTimeAsync(1); });
      expect(mocks.calculate).toHaveBeenCalledTimes(2);
      expect(mocks.calculate.mock.lastCall![0].income[0].amount).toBe("1200000");
    } finally { vi.useRealTimers(); }
  });

  it("opens the rule-driven eligible investment guide and restores focus on close", async () => {
    setup(<TaxPlannerV2Workspace locale="en" />);
    const trigger = await screen.findByRole("button", { name: /What investments qualify/ });
    fireEvent.click(trigger);
    expect(screen.getByRole("dialog")).toHaveTextContent("DPS");
    expect(screen.getByRole("dialog")).toHaveTextContent("BDT 120,000");
    expect(screen.getByRole("dialog")).toHaveTextContent("Maximum statutory rebate");
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(trigger).toHaveFocus();
  });

  it("starts with an editable example and calculates eligible totals and slider changes without opt-in", async () => {
    setup(<TaxPlannerV2Workspace locale="en" />);
    expect(await screen.findByLabelText(salaryLabel)).toHaveValue("900000");
    await waitFor(() => expect(mocks.calculate).toHaveBeenCalledOnce());
    fireEvent.change(screen.getByLabelText("Already eligible investment total"), { target: { value: "10000" } });
    await waitFor(() => expect(mocks.calculate.mock.lastCall![0].investments).toMatchObject({ amount: "10000", confirmed_for_year: true }));
    expect(screen.queryByLabelText(/I have verified eligibility/)).not.toBeInTheDocument();
    const slider = screen.getByRole("slider");
    expect(slider).toBeEnabled();
    fireEvent.change(slider, { target: { value: "20000" } });
    await waitFor(() => expect(mocks.calculate.mock.lastCall![0].scenario).toMatchObject({ amount: "20000", confirmed_for_year: true, contributed_on: "2026-06-30" }));
    fireEvent.click(screen.getByRole("button", { name: /Calculation details and sources/ }));
    expect(screen.getByRole("dialog", { name: "Calculation details and sources" })).toHaveTextContent("Your tax, one step at a time");
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("keeps entered amounts when the administrator activates a new year's rules", async () => {
    const { queryClient } = setup(<TaxPlannerV2Workspace locale="en" />);
    fireEvent.change(await screen.findByLabelText(salaryLabel), { target: { value: "980000" } });
    await waitFor(() => expect(mocks.calculate).toHaveBeenCalledOnce());
    act(() => queryClient.setQueryData(["tax-planner-v2", "config", "current"], config("2027-28", "published-next")));
    expect(screen.getByLabelText(salaryLabel)).toHaveValue("980000");
    expect(screen.queryByLabelText("Assessment year")).not.toBeInTheDocument();
    await waitFor(() => expect(mocks.calculate.mock.lastCall![0]).toMatchObject({ assessment_year: "2027-28", expected_ruleset_revision: "published-next", income: [{ amount: "980000" }] }));
  });

  it("keeps a conditional annual estimate in Detailed without persisting assumptions", async () => {

    mocks.calculate.mockImplementation(async (req: TaxRequest) => result(req, {

      allowance: "450000", annual_liability: "15000",

    }));

    const view = setup(<TaxPlannerV2Workspace locale="en" />);

    await screen.findByLabelText(salaryLabel);

    fireEvent.click(button("Detailed planner"));

    fireEvent.click(screen.getByRole("button", { name: /^Woman/ }));

    await waitFor(() => expect(mocks.calculate).toHaveBeenCalledOnce());

    await waitFor(() => expect(view.container.querySelector(".wealth-tax-about-allowance-insight")).toHaveTextContent("BDT 450,000"));

    expect(mocks.calculate.mock.lastCall![0]).toMatchObject({ profile: { woman: true, new_taxpayer_floor: "no" }, coverage: { wealth_surcharge: "no" }, credits_completeness: "unknown" });

    expect(screen.getByText("Conditional planning estimate")).toBeVisible();

    expect(screen.getByRole("heading", { name: "Estimated annual liability" }).parentElement).not.toHaveTextContent("BDT 20,000");

    fireEvent.click(button("2. Income"));

    fireEvent.change(within(screen.getByRole("article", { name: "Private employment" })).getByLabelText("Gross amount before withholding"), { target: { value: "950000" } });

    await waitFor(() => expect(mocks.calculate).toHaveBeenCalledTimes(2));

    expect(mocks.calculate.mock.lastCall![0]).toMatchObject({ income: [{ kind: "private_employment", amount: "950000", benefits_valuation_complete: "yes" }], coverage: { wealth_surcharge: "no" }, credits_completeness: "unknown" });

    expect(screen.getByText("Conditional planning estimate")).toBeVisible();
    fireEvent.click(button("Save on this browser"));
    expect(JSON.parse(localStorage.getItem(draftKey("account-a", "2026-27", "forward_planning"))!).facts).toMatchObject({ profile: { woman: true, new_taxpayer_floor: "unknown" }, coverage: { wealth_surcharge: "unknown" }, income: [{ benefits_valuation_complete: "unknown" }] });

  });

  it("retains a same-revision base during incomplete scenario entry and hides it when the published revision changes", async () => {

    mocks.calculate.mockImplementation(async (req: TaxRequest) => ({

      ...result(req, { annual_liability: req.expected_ruleset_revision === "published-2" ? "17000" : "20000" }),

      content_hash: req.expected_ruleset_revision === "published-2" ? "hash-2" : "hash",

    }));

    const { queryClient } = setup(<TaxPlannerV2Workspace locale="en" />);

    fireEvent.change(await screen.findByLabelText(salaryLabel), { target: { value: "900000" } });

    const play = screen.getByRole("heading", { name: "What If I Invest More?" }).closest("section")!;

    const currentTax = () => within(play).getByText("Current Tax").nextElementSibling;

    await waitFor(() => expect(currentTax()).toHaveTextContent("BDT 20,000"));

    fireEvent.click(within(play).getByRole("button", { name: /Fine-tune comparison/ }));
    fireEvent.click(screen.getByRole("button", { name: "Customize comparison" }));
    fireEvent.change(screen.getByLabelText("Hypothetical eligible amount"), { target: { value: "" } });

    expect(screen.getByLabelText("Hypothetical eligible amount")).toHaveValue("");

    expect(currentTax()).toHaveTextContent("BDT 20,000");

    expect(within(play).getByText("Further Eligible Investment Needed").nextElementSibling).toHaveTextContent("BDT 150,000");

    const refreshed = config("2026-27", "published-2");

    refreshed.selected!.identity.content_hash = "hash-2";

    refreshed.selected!.rules.rebate.investment_rate = "11";

    act(() => queryClient.setQueryData(["tax-planner-v2", "config", "current"], refreshed));

    await waitFor(() => expect(currentTax()).toHaveTextContent("—"));

    expect(within(play).queryByText("BDT 20,000")).not.toBeInTheDocument();

    expect(within(play).queryByText("BDT 150,000")).not.toBeInTheDocument();

    expect(within(play).queryByRole("button", { name: "How your rebate is calculated" })).not.toBeInTheDocument();

    expect(within(play).getByRole("progressbar")).not.toHaveAttribute("aria-valuenow");

    expect(mocks.calculate).toHaveBeenCalledOnce();

    fireEvent.change(screen.getByLabelText("Hypothetical eligible amount"), { target: { value: "1000" } });

    fireEvent.click(screen.getByRole("button", { name: /^Close/ }));

    await waitFor(() => expect(currentTax()).toHaveTextContent("BDT 17,000"));

    expect(mocks.calculate.mock.lastCall![0]).toMatchObject({ expected_ruleset_revision: "published-2" });

    fireEvent.click(within(play).getByRole("button", { name: "How your rebate is calculated" }));

    expect(screen.getByRole("tooltip")).toHaveTextContent("Investment limit · 11%");

  });

  it("keeps restored facts behind explicit calculation even after a Detailed edit", async () => {

    setup(<TaxPlannerV2Workspace locale="en" />);

    fireEvent.change(await screen.findByLabelText(salaryLabel), { target: { value: "900000" } });

    await waitFor(() => expect(mocks.calculate).toHaveBeenCalledOnce());

    fireEvent.click(button("Save on this browser"));

    fireEvent.click(button("Restore saved draft"));

    expect(screen.getByText("Draft restored. Review the entries before calculating.")).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: /^Woman/ }));

    // Waiting beyond the calculation debounce proves restore did not submit these edits.

    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 400)); });

    expect(mocks.calculate).toHaveBeenCalledOnce();

    fireEvent.click(button("Optional tax adjustments"));

    fireEvent.click(button("Apply adjustments"));

    await waitFor(() => expect(mocks.calculate).toHaveBeenCalledTimes(2));

    expect(mocks.calculate.mock.lastCall![0]).toMatchObject({ profile: { woman: true }, income: [{ amount: "900000", benefits_valuation_complete: "yes" }], coverage: { wealth_surcharge: "no" } });

  });

  it("shares income between modes and keeps the filing and planning facts separate", async () => {

    setup(<TaxPlannerV2Workspace locale="en" />);

    fireEvent.change(await screen.findByLabelText(salaryLabel), { target: { value: "900000" } });

    fireEvent.click(button("Calculate estimate"));

    const headline = await screen.findByRole("heading", { name: "Estimated annual liability" });

    expect(within(headline.parentElement!).getByText("BDT 20,000")).toBeVisible();

    expect(screen.getByText(/annual estimate does not include the filing balance/)).toBeVisible();

    expect(mocks.calculate.mock.calls[0][0]).toMatchObject({ income: [{ amount: "900000", basis: "gross" }], credits_completeness: "unknown", filing: null });

    fireEvent.click(button("Detailed planner"));

    fireEvent.click(button("2. Income"));

    expect(within(screen.getByRole("article", { name: "Private employment" })).getByLabelText("Gross amount before withholding")).toHaveValue("900000");

    fireEvent.click(button("Quick estimate"));

    expect(screen.getByLabelText(salaryLabel)).toHaveValue("900000");

    expect(screen.queryByLabelText("Assessment year")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Purpose")).not.toBeInTheDocument();
    expect(screen.getByLabelText(salaryLabel)).toHaveValue("900000");

  });

  it("ignores an old response after account change and never restores another owner's draft", async () => {

    let complete!: (value: TaxResult) => void;

    mocks.calculate.mockReturnValue(new Promise<TaxResult>((resolve) => { complete = resolve; }));

    const view = setup(<TaxPlannerV2Workspace locale="en" />);

    fireEvent.change(await screen.findByLabelText(salaryLabel), { target: { value: "980000" } });

    fireEvent.click(button("Save on this browser"));

    expect(localStorage.getItem(draftKey("account-a", "2026-27", "forward_planning"))).toContain("980000");

    fireEvent.click(button("Calculate estimate"));

    await waitFor(() => expect(mocks.calculate).toHaveBeenCalledOnce());

    const [req, signal] = mocks.calculate.mock.calls[0];

    mocks.auth.user = { id: "account-b", role: "SUPER_ADMIN" };

    view.rerender(<TaxPlannerV2Workspace locale="en" />);

    expect(signal.aborted).toBe(true);

    await act(async () => { complete(result(req)); });

    fireEvent.click(button("Restore saved draft"));

    expect(screen.getByText("No saved draft for the active rules.")).toBeVisible();

    expect(screen.getByLabelText(salaryLabel)).toHaveValue("900000");

    expect(screen.queryByText("BDT 20,000")).toBeNull();

  });

  it("shows incomplete scope instead of a liability and leads back to the relevant fact", async () => {

    mocks.calculate.mockImplementation(async (req: TaxRequest) => result(req, {

      annual_status: "needs_review", annual_liability: null, settlement_status: "needs_review",

      missing_facts: [{ message_id: "coverage_wealth_surcharge_unknown", rule_id: "scope.wealth_and_vehicle", field_path: "coverage.wealth_surcharge", values: [] }],

    }));

    setup(<TaxPlannerV2Workspace locale="en" />);

    await screen.findByLabelText(salaryLabel);

    fireEvent.click(button("Calculate estimate"));

    expect(await screen.findByText(/Annual liability is incomplete/)).toBeVisible();

    const headline = screen.getByRole("heading", { name: "Estimated annual liability" });

    expect(within(headline.parentElement!).queryByText("BDT 20,000")).toBeNull();

    fireEvent.click(button("Edit facts"));

    const question = await screen.findByLabelText("Could wealth surcharge apply?");

    await waitFor(() => expect(question).toHaveFocus());

  });

  it("retains visible tour anchors and opens a collapsed income card before focusing a missing fact", async () => {

    mocks.calculate.mockImplementation(async (req: TaxRequest) => result(req, {

      annual_status: "needs_review", annual_liability: null,

      missing_facts: [{ message_id: "employment_benefit_valuation_needed", rule_id: "income.employment", field_path: "income.0.benefits_valuation_complete", values: [] }],

    }));

    setup(<TaxPlannerV2Workspace locale="en" />);

    fireEvent.change(await screen.findByLabelText(salaryLabel), { target: { value: "900000" } });

    expect(await screen.findByText(/Annual liability is incomplete/)).toBeVisible();

    for (const step of [...getTaxPlannerDesktopGuideSteps("en"), ...getTaxPlannerMobileGuideSteps("en")]) {

      if (step.target) expect(document.querySelector(step.target)).toBeVisible();

    }

    act(() => mocks.guideStep?.({ active: true, stepId: "finish" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    act(() => mocks.guideStep?.({ active: false, stepId: null }));

    expect(screen.getByRole("heading", { name: "Tax planner guide" })).toBeVisible();

    fireEvent.click(button("Detailed planner"));

    fireEvent.click(button("2. Income"));

    const card = screen.getByRole("heading", { name: "Private employment" }).closest("article")!;

    fireEvent.click(within(card).getByRole("button", { expanded: true }));

    fireEvent.click(await screen.findByRole("button", { name: "Edit facts" }));

    const valuation = screen.getByLabelText("All noncash employment benefits valued?");

    await waitFor(() => expect(valuation).toHaveFocus());

    expect(within(card).getByRole("button", { expanded: true })).toBeVisible();

  });

  it("preserves keyboard modes, original help popovers and review Edit actions", async () => {

    setup(<TaxPlannerV2Workspace locale="en" />);

    await screen.findByLabelText(salaryLabel);

    fireEvent.click(screen.getByRole("button", { name: "More about eligible investments" }));

    expect(screen.getByRole("tooltip")).toHaveTextContent("we assume your entered total is eligible");

    fireEvent.keyDown(document, { key: "Escape" });

    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();

    const quick = screen.getByRole("tab", { name: /Quick estimate/ });

    quick.focus();

    fireEvent.keyDown(quick, { key: "ArrowRight" });

    const detailed = screen.getByRole("tab", { name: /Detailed planner/ });

    await waitFor(() => expect(detailed).toHaveFocus());

    expect(detailed).toHaveAttribute("aria-selected", "true");

    expect(screen.getByRole("tabpanel")).toHaveAttribute("aria-labelledby", detailed.id);

    fireEvent.click(screen.getByRole("button", { name: /^Senior Citizen/ }));

    fireEvent.change(screen.getByLabelText("Eligible disabled dependents"), { target: { value: "1" } });

    fireEvent.click(button("3. Investments"));

    const dpsAmount = screen.getByLabelText("DPS · Annual eligible amount");
    expect(dpsAmount).toBeVisible();
    expect(screen.queryByLabelText("Contribution date")).not.toBeInTheDocument();
    fireEvent.change(dpsAmount, { target: { value: "10000" } });

    fireEvent.click(button("Optional tax adjustments"));

    expect(screen.getByText("Tax Saving Investments").closest("article")).toHaveTextContent("BDT 10,000");

    const profileReview = screen.getByText("Tax Profile").closest("article")!;

    expect(profileReview).toHaveTextContent("Senior Citizen");

    expect(profileReview).toHaveTextContent("1 dependent claims");

    fireEvent.click(button("Edit Income Sources"));

    expect(screen.getByRole("heading", { name: "How do you earn money?" })).toBeVisible();

    fireEvent.click(button("Optional tax adjustments"));

    fireEvent.click(button("Edit Tax Profile"));

    expect(screen.getByRole("heading", { name: "Profile and coverage" })).toBeVisible();

    fireEvent.click(button("Optional tax adjustments"));

    fireEvent.click(button("Edit Tax Saving Investments"));

    fireEvent.change(screen.getByLabelText("DPS · Annual eligible amount"), { target: { value: "" } });
    expect(screen.getByLabelText("DPS · Annual eligible amount")).toHaveValue("");

  });

  it("keeps snapshot explanations and the original savings CTA active", async () => {

    mocks.calculate.mockImplementation(async (req: TaxRequest) => result(req, { income: [

      { id: req.income[0].id, kind: "private_employment", classification: "ordinary", entered_amount: "900000", excluded_amount: "0", deductible_amount: "300000", taxable_amount: "600000", special_tax: "0", reason_codes: [] },

    ] }));

    setup(<TaxPlannerV2Workspace locale="en" />);

    fireEvent.change(await screen.findByLabelText(salaryLabel), { target: { value: "900000" } });

    const headline = await screen.findByRole("heading", { name: "Estimated annual liability" });

    const snapshot = headline.closest("section")!;

    fireEvent.click(within(snapshot).getByRole("button", { name: "How effective tax rate is calculated" }));

    expect(screen.getByRole("tooltip")).toHaveTextContent("Annual liability divided");

    fireEvent.keyDown(document, { key: "Escape" });

    fireEvent.click(within(snapshot).getByRole("button", { name: "What income before allowance means" }));

    expect(screen.getByRole("tooltip")).toHaveTextContent("Ordinary income BDT 600,000");

    fireEvent.keyDown(document, { key: "Escape" });

    fireEvent.click(within(snapshot).getByRole("button", { name: "How your rebate is calculated" }));

    expect(screen.getByRole("tooltip")).toHaveTextContent("Investment limit");

    fireEvent.keyDown(document, { key: "Escape" });

    const simulator = document.getElementById("tax-planner-play-explore")!;

    const scroll = vi.fn();

    Object.defineProperty(simulator, "scrollIntoView", { value: scroll });

    fireEvent.click(button(/Explore More Savings/));

    expect(scroll).toHaveBeenCalledWith({ behavior: "smooth", block: "start" });

    expect(simulator).toHaveFocus();

  });

});

describe("admin planner", () => {

  it("gates publication on preview, reason and acknowledgement", async () => {

    mocks.publish.mockResolvedValue(revision("published"));

    mocks.getConfig.mockResolvedValue(config("2026-27", "draft-1"));

    setup(<TaxPlannerV2Admin />);

    fireEvent.click(await screen.findByRole("button", { name: "Validate and preview" }));

    const publish = await screen.findByRole("button", { name: "Publish revision for AY 2026-27 · make active" });

    expect(publish).toBeDisabled();

    fireEvent.change(screen.getByLabelText("Publication reason"), { target: { value: "Reviewed official sources" } });

    expect(publish).toBeDisabled();

    fireEvent.click(screen.getByLabelText("I reviewed and acknowledge the changed example results."));

    fireEvent.click(publish);

    expect(await screen.findByText(/published and confirmed through the public API/)).toBeVisible();

    expect(mocks.publish).toHaveBeenCalledWith("draft-1", previewFixture.preview, "Reviewed official sources", true);

  });

  it("preserves draft edits after a competing save and offers explicit reload", async () => {

    const remote = { ...revision(), edit_version: 4, content_hash: "remote-hash" };

    mocks.getRevision.mockResolvedValueOnce(revision()).mockResolvedValue(remote);

    mocks.save.mockRejectedValue(new BackendApiError("Another admin saved this draft.", 409, "DRAFT_CONFLICT"));

    setup(<TaxPlannerV2Admin />);

    const general = await screen.findByLabelText("General taxpayer (BDT)");

    fireEvent.change(general, { target: { value: "410000" } });

    fireEvent.click(button("Save draft"));

    expect(await screen.findByText(/Your changes are preserved/)).toBeVisible();

    expect(general).toHaveValue("410000");

    expect(button("Save draft")).toBeDisabled();

    fireEvent.click(button("Reload server revision and discard local edits"));

    const detail = screen.getByRole("region", { name: "Selected rule revision" });

    expect(await within(detail).findByText(/Local edits were discarded/)).toBeVisible();

    expect(screen.getByLabelText("General taxpayer (BDT)")).toHaveValue("400000");

  });
});
