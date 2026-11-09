/** @vitest-environment jsdom */

import "@testing-library/jest-dom/vitest";

import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import type { ReactNode } from "react";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { BackendApiError } from "@/lib/api/backend-api-client";

import type { TaxRequest, TaxResult, Year } from "./contracts";

import { draftKey } from "./facts";
import { coverageNames } from "./labels";

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

const salaryLabel = "Annual salary, including bonuses";

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

const reveal = (label: string | RegExp) => {
  const summary = screen.getByText(label, { selector: "summary" });
  if (!summary.closest("details")!.open) fireEvent.click(summary);
};
const annualCard = () => screen.getByRole("heading", { name: "Estimated annual Tax" }).parentElement!;
const journey = () => screen.getByRole("heading", { name: "How your current annual Tax was calculated" }).closest("section")!;
const play = () => screen.getByRole("heading", { name: "What if I invest more?" }).closest("section")!;
const metric = (label: string) => within(play()).getByText(label).nextElementSibling!;
function comparisonResult(req: TaxRequest) {
  const response = result(req);
  if (req.scenario) response.scenario = { breakdown: { ...response.base, annual_liability: "19000" }, eligible_increment: "10000", annual_saving: "1000", settlement_saving: null, limiting_reason: null, is_historical: false };
  return response;
}

describe("public planner", () => {
  it.each(["en", "bn"] as const)("shows actual aggregate assumptions with a verified new-taxpayer profile in %s", async (locale) => {
    mocks.calculate.mockImplementation(async (req: TaxRequest) => result(req, { assumptions: req.investments.mode === "confirmed_eligible_total" ? [
      { message_id: "user_confirmed_eligible_investment_total", rule_id: "rebate.general", field_path: "investments", values: [] },
    ] : [] }));
    setup(<TaxPlannerV2Workspace locale={locale} />);
    await waitFor(() => expect(mocks.calculate).toHaveBeenCalledOnce());
    const bn = locale === "bn";
    fireEvent.click(button(bn ? "বিস্তারিত হিসাব" : "Detailed planner"));
    reveal(bn ? "করমুক্ত সীমা, নির্ভরশীল ও ন্যূনতম Tax · বদলান" : "Allowance, dependents and minimum Tax · edit");
    fireEvent.change(screen.getByLabelText(bn ? "নতুন করদাতার ন্যূনতম করের যোগ্য?" : "Eligible for the new taxpayer minimum?"), { target: { value: "yes" } });
    reveal(bn ? "ব্যতিক্রম যাচাই করুন" : "Check exceptions");
    for (const [key, names] of Object.entries(coverageNames)) if (key !== "other_part2_donation_claims") fireEvent.change(screen.getByLabelText(names[bn ? 1 : 0]), { target: { value: "no" } });
    fireEvent.click(button(bn ? "2. আয়" : "2. Income"));
    fireEvent.change(screen.getByLabelText(bn ? "চাকরির নগদবহির্ভূত সুবিধার মূল্য নির্ধারণ হয়েছে?" : "All noncash employment benefits valued?"), { target: { value: "yes" } });
    fireEvent.click(button(bn ? "3. বিনিয়োগ" : "3. Investments"));
    fireEvent.change(screen.getByLabelText(bn ? "যোগ্য বিনিয়োগের নিশ্চিত মোট" : "Already eligible investment total"), { target: { value: "40000" } });
    await waitFor(() => expect(mocks.calculate.mock.lastCall![0].investments).toMatchObject({ mode: "confirmed_eligible_total", amount: "40000" }));
    const card = screen.getByRole("heading", { name: bn ? "আনুমানিক বার্ষিক কর" : "Estimated annual Tax" }).closest("section")!;
    expect(card).toHaveTextContent(bn ? "আপনার দেওয়া যোগ্য মোট ধরে পরিকল্পনার হিসাব হয়েছে।" : "Treats your entered eligible total as a planning assumption.");
    expect(card).not.toHaveTextContent(/regular taxpayer minimum|সাধারণ করদাতার ন্যূনতম|salary benefits|বেতন সুবিধা/);
    expect(mocks.calculate.mock.lastCall![0].profile.new_taxpayer_floor).toBe("yes");
  });

  it("keeps the refreshed base comparable after one successful revision retry", async () => {
    const next = config("2026-27", "rules-B");
    mocks.calculate.mockImplementation(async (req: TaxRequest, _signal: AbortSignal, refresh: (nextConfig: ReturnType<typeof config>) => void, invalidate: () => void) => {
      if (!req.scenario) return result(req);
      invalidate(); refresh(next);
      return comparisonResult({ ...req, expected_ruleset_revision: "rules-B" });
    });
    const view = setup(<TaxPlannerV2Workspace locale="en" />);
    await waitFor(() => expect(metric("Current Tax")).toHaveTextContent("BDT 20,000"));
    fireEvent.click(button("+BDT 10,000"));
    await waitFor(() => expect(metric("Proposed Tax")).toHaveTextContent("BDT 19,000"));
    expect(mocks.calculate).toHaveBeenCalledTimes(2);
    expect(view.queryClient.getQueryData(["tax-planner-v2", "config", "current"])).toEqual(next);
    expect(metric("Current Tax")).toHaveTextContent("BDT 20,000"); expect(screen.getByRole("slider")).toBeEnabled();
  });

  it("keeps a normalized base comparable after an explicit default confirmation and an empty category tile", async () => {
    setup(<TaxPlannerV2Workspace locale="en" />);
    await waitFor(() => expect(mocks.calculate).toHaveBeenCalledOnce());
    fireEvent.click(button("Detailed planner")); reveal("Check exceptions");
    fireEvent.change(screen.getByLabelText("Is there foreign or treaty income?"), { target: { value: "no" } });
    expect(metric("Current Tax")).toHaveTextContent("BDT 20,000"); expect(screen.getByRole("slider")).toBeEnabled();
    fireEvent.click(button("3. Investments")); fireEvent.click(button("By category · simple amounts")); fireEvent.click(button("Add category"));
    fireEvent.change(screen.getByLabelText("DPS · Annual eligible amount"), { target: { value: "40000" } });
    await waitFor(() => expect(mocks.calculate.mock.lastCall![0].investments).toMatchObject({ entries: [{ category: "dps", amount: "40000" }] }));
    const counts = mocks.calculate.mock.calls.length;
    fireEvent.click(button("Quick estimate"));
    fireEvent.change(screen.getByLabelText("Additional Investment"), { target: { value: "bad" } });
    expect(metric("Current Tax")).toHaveTextContent("BDT 20,000"); expect(screen.getByRole("slider")).toBeEnabled();
    expect(annualCard()).not.toHaveTextContent("Last calculated");
    expect(mocks.calculate.mock.calls.length).toBe(counts);
  });

  it("preserves the simulator for an empty supported category alongside a counted category", async () => {
    const available = config(); available.selected!.investment_policies.push({ category: "life_insurance", policy: "insurance", cap_group: null, rule_id: "investment.life_insurance" });
    available.selected!.rules.investment_presentation.push({ category: "life_insurance", label_en: "Life insurance", label_bn: "জীবন বীমা", visible: true, order: 2 });
    mocks.getConfig.mockResolvedValue(available);
    setup(<TaxPlannerV2Workspace locale="en" />);
    await waitFor(() => expect(mocks.calculate).toHaveBeenCalledOnce());
    fireEvent.click(button("Detailed planner")); fireEvent.click(button("3. Investments")); fireEvent.click(button("By category · simple amounts")); fireEvent.click(button("Add category"));
    fireEvent.change(screen.getByLabelText("DPS · Annual eligible amount"), { target: { value: "40000" } });
    await waitFor(() => expect(mocks.calculate.mock.lastCall![0].investments).toMatchObject({ entries: [{ category: "dps", amount: "40000" }] }));
    fireEvent.change(screen.getByLabelText("Investment category to add"), { target: { value: "life_insurance" } }); fireEvent.click(button("Add category"));
    expect(screen.getByLabelText("Life insurance · Annual eligible amount")).toHaveValue("");
    expect(metric("Current Tax")).toHaveTextContent("BDT 20,000"); expect(screen.getByRole("slider")).toBeEnabled();
    fireEvent.change(screen.getByLabelText("Additional Investment"), { target: { value: "bad" } });
    expect(metric("Current Tax")).toHaveTextContent("BDT 20,000"); expect(annualCard()).not.toHaveTextContent("Last calculated");
  });

  it.each(["TAX_CALCULATIONS_SUSPENDED", "TAX_RULES_UNAVAILABLE", "RULESET_CHANGED"])("hides the old current estimate when a comparison discovers %s", async (code) => {
    mocks.calculate.mockImplementation(async (req: TaxRequest) => { if (req.scenario) throw new BackendApiError("Unavailable", 503, code); return result(req); });
    setup(<TaxPlannerV2Workspace locale="en" />);
    await waitFor(() => expect(metric("Current Tax")).toHaveTextContent("BDT 20,000"));
    fireEvent.click(button("+BDT 10,000"));
    await waitFor(() => expect(annualCard()).not.toHaveTextContent("BDT 20,000"));
    expect(screen.queryByRole("heading", { name: "How your current annual Tax was calculated" })).not.toBeInTheDocument();
    expect(metric("Current Tax")).toHaveTextContent("—");
    expect(screen.getByLabelText(salaryLabel)).toHaveValue("900000");
    expect(screen.queryByRole("button", { name: /Calculation details and sources/ })).not.toBeInTheDocument();
  });

  it.each(["suspended", "unselected", "retry-failed"])("installs an authoritative rules refresh and drops A on %s", async (mode) => {
    const next = config("2027-28", "rules-B");
    if (mode === "suspended") next.calculations_suspended = true;
    if (mode === "unselected") next.selected = null;
    mocks.calculate.mockImplementation(async (req: TaxRequest, _signal: AbortSignal, refresh: (nextConfig: ReturnType<typeof config>) => void, invalidate: () => void) => {
      if (!req.scenario) return result(req);
      if (req.expected_ruleset_revision === "published-1") { invalidate(); refresh(next); }
      throw new Error("retry unavailable");
    });
    const view = setup(<TaxPlannerV2Workspace locale="en" />);
    await waitFor(() => expect(metric("Current Tax")).toHaveTextContent("BDT 20,000"));
    fireEvent.click(button("+BDT 10,000"));
    await waitFor(() => expect(view.queryClient.getQueryData(["tax-planner-v2", "config", "current"])).toEqual(next));
    expect(screen.queryByRole("heading", { name: "How your current annual Tax was calculated" })).not.toBeInTheDocument();
    if (mode !== "unselected") expect(annualCard()).not.toHaveTextContent("BDT 20,000");
  });

  it("keeps explicit exception uncertainty on the wire without requesting a filing balance", async () => {
    setup(<TaxPlannerV2Workspace locale="en" />);
    await waitFor(() => expect(mocks.calculate).toHaveBeenCalledOnce());
    fireEvent.click(button("Detailed planner")); reveal("Check exceptions");
    const field = screen.getByLabelText("Is there foreign or treaty income?");
    expect(field).toHaveValue(""); // Untouched assumption can be changed directly to Not sure.
    fireEvent.change(field, { target: { value: "unknown" } });
    await waitFor(() => expect(mocks.calculate.mock.lastCall![0].coverage.foreign_or_treaty_income).toBe("unknown"));
    expect(mocks.calculate.mock.lastCall![0].filing).toBeNull();
  });

  it.each(["local", "api"])("provides separate actionable links for simultaneous %s issues", async (source) => {
    if (source === "api") mocks.calculate.mockImplementation(async (req: TaxRequest) => { if (req.income[0].amount !== "900000") throw new BackendApiError("Invalid", 422, "VALIDATION_ERROR", { errors: [
      { loc: ["body", "income", 0, "private_employment", "amount"], msg: "bad amount" },
      { loc: ["body", "income", 0, "private_employment", "excluded_group_insurance_benefit"], msg: "bad excluded amount" },
    ] }); return result(req); });
    setup(<TaxPlannerV2Workspace locale="en" />);
    await waitFor(() => expect(mocks.calculate).toHaveBeenCalledOnce());
    fireEvent.click(button("Detailed planner")); fireEvent.click(button("2. Income"));
    fireEvent.change(screen.getByLabelText("Gross amount before withholding"), { target: { value: source === "local" ? "bad" : "950000" } });
    if (source === "local") fireEvent.change(screen.getByLabelText("Verified exempt group insurance included above"), { target: { value: "bad" } });
    fireEvent.click(screen.getByRole("button", { name: /Private employment/ }));
    await waitFor(() => expect(screen.getAllByRole("button", { name: "Go to the affected field" })).toHaveLength(2));
    const issues = screen.getByRole("alert");
    expect(issues).toHaveTextContent("Income source 1 · Amount");
    expect(issues).toHaveTextContent("Income source 1 · Exempt group insurance");
    fireEvent.click(screen.getAllByRole("button", { name: "Go to the affected field" })[0]);
    await waitFor(() => expect(screen.getByLabelText("Gross amount before withholding")).toHaveFocus());
    fireEvent.click(screen.getAllByRole("button", { name: "Go to the affected field" })[1]);
    await waitFor(() => expect(screen.getByLabelText("Verified exempt group insurance included above")).toHaveFocus());
  });

  it("uses base retry wording when no hypothetical exists", async () => {
    setup(<TaxPlannerV2Workspace locale="en" />);
    await waitFor(() => expect(mocks.calculate).toHaveBeenCalledOnce());
    mocks.calculate.mockRejectedValue(new Error("offline"));
    fireEvent.click(button("Calculate estimate"));
    await waitFor(() => expect(screen.getByText("The estimate could not update. Your entries are preserved.")).toBeVisible());
    expect(screen.queryByText("The proposed comparison is unavailable. Your current estimate is preserved.")).not.toBeInTheDocument();
  });

  it("isolates entered facts and pending results when the signed-in account changes", async () => {
    const view = setup(<TaxPlannerV2Workspace locale="en" />);
    await waitFor(() => expect(mocks.calculate).toHaveBeenCalledOnce());
    let finish!: (value: TaxResult) => void;
    mocks.calculate.mockImplementationOnce(() => new Promise<TaxResult>((resolve) => { finish = resolve; }));
    fireEvent.change(screen.getByLabelText(salaryLabel), { target: { value: "1800000" } });
    await waitFor(() => expect(mocks.calculate).toHaveBeenCalledTimes(2));
    const [oldRequest, oldSignal] = mocks.calculate.mock.calls[1];
    mocks.auth.user = { id: "account-b", role: "SUPER_ADMIN" }; view.rerender(<TaxPlannerV2Workspace locale="en" />);
    expect(oldSignal.aborted).toBe(true); expect(screen.getByLabelText(salaryLabel)).toHaveValue("900000");
    await act(async () => finish(result(oldRequest, { annual_liability: "999" })));
    await waitFor(() => expect(mocks.calculate).toHaveBeenCalledTimes(3));
    expect(annualCard()).not.toHaveTextContent("BDT 999");
    expect(annualCard()).toHaveTextContent("Example · based on BDT 900,000 annual salary");
    expect(localStorage.length).toBe(0);
  });

  it.each(["en", "bn"] as const)("keeps example identity across mode, locale and comparison in %s", async (locale) => {
    mocks.calculate.mockImplementation(async (req: TaxRequest) => comparisonResult(req));
    const view = setup(<TaxPlannerV2Workspace locale={locale} />);
    await waitFor(() => expect(mocks.calculate).toHaveBeenCalledOnce());
    const bn = locale === "bn";
    expect(screen.getAllByText(/Example · based|নমুনা · বছরে/)).toHaveLength(2);
    fireEvent.click(button(bn ? "বিস্তারিত হিসাব" : "Detailed planner"));
    const steps = screen.getByRole("list", { name: bn ? "বিস্তারিত হিসাবের ধাপ" : "Detailed planner steps" });
    fireEvent.click(within(steps).getAllByRole("button")[2]);
    expect(steps).not.toHaveTextContent("✓");
    expect(within(steps).getAllByRole("button")[1]).not.toHaveAttribute("aria-current");
    fireEvent.change(screen.getByRole("slider"), { target: { value: "10000" } });
    await waitFor(() => expect(mocks.calculate).toHaveBeenCalledTimes(2));
    expect(screen.getAllByText(/Example · based|নমুনা · বছরে/)).toHaveLength(2);
    view.rerender(<TaxPlannerV2Workspace locale={bn ? "en" : "bn"} />);
    expect(screen.getAllByText(/Example · based|নমুনা · বছরে/)).toHaveLength(2);
    expect(mocks.calculate).toHaveBeenCalledTimes(2);
  });

  it("personalizes the base from actual amounts and retains the same calculation across layouts", async () => {
    setup(<TaxPlannerV2Workspace locale="en" />);
    const field = await screen.findByLabelText(salaryLabel);
    await waitFor(() => expect(mocks.calculate).toHaveBeenCalledOnce());
    fireEvent.change(field, { target: { value: "980000" } });
    await waitFor(() => expect(mocks.calculate).toHaveBeenCalledTimes(2));
    expect(annualCard()).toHaveTextContent("Your current facts");
    expect(annualCard()).toHaveTextContent("BDT 20,000");
    fireEvent.click(button("Detailed planner"));
    fireEvent.click(button("2. Income"));
    expect(screen.getAllByRole("article")).toHaveLength(2); // selected salary and Journey endpoint
    expect(screen.queryByRole("article", { name: "Business or professional income" })).not.toBeInTheDocument();
    expect(within(screen.getByRole("article", { name: "Private employment" })).getByLabelText("Gross amount before withholding")).toHaveValue("980000");
    fireEvent.click(button("Quick estimate"));
    expect(screen.getByLabelText(salaryLabel)).toHaveValue("980000");
    expect(mocks.calculate).toHaveBeenCalledTimes(2);
  });

  it("keeps all three Investment representations exclusive and preserves inactive amounts and dated zero records", async () => {
    setup(<TaxPlannerV2Workspace locale="en" />);
    await screen.findByLabelText(salaryLabel);
    fireEvent.click(button("Detailed planner")); fireEvent.click(button("3. Investments"));
    fireEvent.change(screen.getByLabelText("Already eligible investment total"), { target: { value: "80000" } });
    await waitFor(() => expect(mocks.calculate.mock.lastCall![0].investments).toMatchObject({ mode: "confirmed_eligible_total", amount: "80000" }));
    fireEvent.click(button("By category · simple amounts"));
    expect(screen.queryByLabelText("DPS · Annual eligible amount")).not.toBeInTheDocument();
    fireEvent.click(button("Add category"));
    fireEvent.change(screen.getByLabelText("DPS · Annual eligible amount"), { target: { value: "40000" } });
    await waitFor(() => expect(mocks.calculate.mock.lastCall![0].investments).toEqual({ mode: "planning_category_totals", entries: [{ category: "dps", amount: "40000" }] }));
    fireEvent.click(button("Checked records")); fireEvent.click(button("Add contribution"));
    fireEvent.change(screen.getByLabelText("Contribution amount"), { target: { value: "0" } });
    fireEvent.change(screen.getByLabelText("Contribution date"), { target: { value: "2026-01-10" } });
    await waitFor(() => expect(mocks.calculate.mock.lastCall![0].investments).toMatchObject({ mode: "itemized", entries: [{ amount: "0", contributed_on: "2026-01-10", qualification: "unknown" }] }));
    fireEvent.click(button("One eligible total"));
    expect(screen.getByLabelText("Already eligible investment total")).toHaveValue("80000");
    await waitFor(() => expect(mocks.calculate.mock.lastCall![0].investments.mode).toBe("confirmed_eligible_total"));
    fireEvent.click(button("By category · simple amounts"));
    expect(screen.getByLabelText("DPS · Annual eligible amount")).toHaveValue("40000");
    fireEvent.click(button("Checked records"));
    expect(screen.getByLabelText("Contribution date")).toHaveValue("2026-01-10");
    expect(screen.getByLabelText("Contribution amount")).toHaveValue("0");
    expect(screen.getByText(/Counts in this estimate:/)).toHaveTextContent("checked individual records");
  });

  it("keeps current Tax and Journey on the base and resets only the hypothetical", async () => {
    mocks.calculate.mockImplementation(async (req: TaxRequest) => comparisonResult(req));
    setup(<TaxPlannerV2Workspace locale="en" />);
    await waitFor(() => expect(mocks.calculate).toHaveBeenCalledOnce());
    expect(metric("Actual additional saving from this Investment")).toHaveTextContent("BDT 0");
    fireEvent.click(button("+BDT 10,000"));
    await waitFor(() => expect(metric("Proposed Tax")).toHaveTextContent("BDT 19,000"));
    expect(metric("Actual additional saving from this Investment")).toHaveTextContent("BDT 1,000");
    expect(annualCard()).toHaveTextContent("BDT 20,000");
    expect(journey()).toHaveTextContent("BDT 20,000");
    expect(journey()).not.toHaveTextContent("BDT 19,000");
    fireEvent.click(button("Reset comparison"));
    await waitFor(() => expect(metric("Actual additional saving from this Investment")).toHaveTextContent("BDT 0"));
    expect(screen.getByLabelText(salaryLabel)).toHaveValue("900000");
    await waitFor(() => expect(mocks.calculate.mock.lastCall![0].scenario).toBeNull());
  });

  it.each(["amount", "date", "api-field", "api-network"])("preserves valid current results across a failing hypothetical: %s", async (failure) => {
    mocks.calculate.mockImplementation(async (req: TaxRequest) => {
      if (req.scenario && failure === "api-field") throw new BackendApiError("Invalid hypothetical date", 422, "VALIDATION_ERROR", { field: "scenario.contributed_on" });
      if (req.scenario && failure === "api-network") throw new Error("offline");
      return comparisonResult(req);
    });
    setup(<TaxPlannerV2Workspace locale="en" />);
    await waitFor(() => expect(mocks.calculate).toHaveBeenCalledOnce());
    fireEvent.change(screen.getByLabelText("Additional Investment"), { target: { value: failure === "amount" ? "-1" : "10000" } });
    if (failure === "date") { reveal("Fine-tune comparison"); fireEvent.change(screen.getByLabelText("Hypothetical contribution date"), { target: { value: "" } }); }
    if (failure.startsWith("api")) await waitFor(() => expect(mocks.calculate).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(metric("Proposed Tax")).toHaveTextContent("—"));
    expect(metric("Actual additional saving from this Investment")).toHaveTextContent("—");
    expect(annualCard()).toHaveTextContent("BDT 20,000");
    expect(annualCard()).not.toHaveTextContent("Last calculated");
    expect(journey()).toHaveTextContent("BDT 20,000");
    fireEvent.click(button(/Calculation details and sources/));
    const help = screen.getByRole("dialog");
    expect(help).toHaveTextContent("BDT 20,000");
    expect(help).not.toHaveTextContent("BDT 19,000");
    expect(help).not.toHaveTextContent("Scenario comparison");
  });

  it("preserves a fine-tuned date through numeric, shortcut and slider edits", async () => {
    setup(<TaxPlannerV2Workspace locale="en" />);
    await waitFor(() => expect(mocks.calculate).toHaveBeenCalledOnce());
    reveal("Fine-tune comparison"); fireEvent.click(button("Customize comparison"));
    fireEvent.change(screen.getByLabelText("Hypothetical contribution date"), { target: { value: "2025-06-01" } });
    fireEvent.change(screen.getByLabelText("Additional Investment"), { target: { value: "50000" } });
    expect(screen.getByLabelText("Hypothetical contribution date")).toHaveValue("2025-06-01");
    fireEvent.click(button("+BDT 10,000"));
    expect(screen.getByLabelText("Hypothetical contribution date")).toHaveValue("2025-06-01");
    fireEvent.change(screen.getByRole("slider"), { target: { value: "20000" } });
    await waitFor(() => expect(mocks.calculate.mock.lastCall![0].scenario).toMatchObject({ amount: "20000", contributed_on: "2025-06-01" }));
  });

  it("clears an incompatible category hypothetical when changing the counted Investment method", async () => {
    setup(<TaxPlannerV2Workspace locale="en" />);
    await waitFor(() => expect(mocks.calculate).toHaveBeenCalledOnce());
    fireEvent.click(button("Detailed planner")); fireEvent.click(button("3. Investments")); fireEvent.click(button("Checked records"));
    reveal("Fine-tune comparison"); fireEvent.click(button("Customize comparison"));
    fireEvent.change(screen.getByLabelText("Scenario basis"), { target: { value: "itemized" } });
    expect(screen.getByLabelText("Contribution date")).toHaveValue("2026-06-30");
    fireEvent.click(button("One eligible total"));
    expect(screen.getByText(/Category comparison reset/)).toBeVisible();
    expect(screen.getByLabelText("Additional Investment")).toHaveValue("0");
    await waitFor(() => expect(mocks.calculate.mock.lastCall![0].scenario).toBeNull());
  });

  it.each(["needs_review", "unsupported"] as const)("does not resolve a returned %s hypothetical to the current Tax", async (annual_status) => {
    mocks.calculate.mockImplementation(async (req: TaxRequest) => {
      const response = comparisonResult(req);
      if (response.scenario) response.scenario = { ...response.scenario, annual_saving: null, breakdown: { ...response.scenario.breakdown, annual_status, annual_liability: null } };
      return response;
    });
    setup(<TaxPlannerV2Workspace locale="en" />);
    await waitFor(() => expect(mocks.calculate).toHaveBeenCalledOnce());
    fireEvent.click(button("+BDT 10,000"));
    await waitFor(() => expect(mocks.calculate).toHaveBeenCalledTimes(2));
    expect(metric("Proposed Tax")).toHaveTextContent("—");
    expect(metric("Actual additional saving from this Investment")).toHaveTextContent("—");
    expect(annualCard()).toHaveTextContent("BDT 20,000"); expect(journey()).toHaveTextContent("BDT 20,000");
  });

  it("labels retained base values while updating, cancels old requests and hides different-rule results", async () => {
    const view = setup(<TaxPlannerV2Workspace locale="en" />);
    const field = await screen.findByLabelText(salaryLabel);
    await waitFor(() => expect(mocks.calculate).toHaveBeenCalledOnce());
    let finish!: (response: TaxResult) => void;
    mocks.calculate.mockImplementationOnce(() => new Promise<TaxResult>((resolve) => { finish = resolve; }));
    fireEvent.change(field, { target: { value: "1200000" } });
    expect(annualCard()).toHaveTextContent("Previous estimate · updating");
    expect(journey()).toHaveTextContent("Previous estimate · updating");
    await waitFor(() => expect(mocks.calculate).toHaveBeenCalledTimes(2));
    const [old, signal] = mocks.calculate.mock.calls[1];
    fireEvent.change(field, { target: { value: "1300000" } });
    expect(signal.aborted).toBe(true);
    await act(async () => finish({ ...result(old), base: { ...result(old).base, annual_liability: "999" } }));
    expect(annualCard()).not.toHaveTextContent("BDT 999");
    act(() => view.queryClient.setQueryData(["tax-planner-v2", "config", "current"], config("2027-28", "next")));
    await waitFor(() => expect(annualCard()).not.toHaveTextContent("BDT 20,000"));
    expect(screen.getByLabelText(salaryLabel)).toHaveValue("1300000");
  });

  it.each(["needs_review", "unsupported"] as const)("withholds a %s result and navigates to a collapsed exception without false completion", async (status) => {
    mocks.calculate.mockImplementation(async (req: TaxRequest) => result(req, { annual_status: status, annual_liability: null,
      missing_facts: [{ message_id: "coverage_wealth_surcharge_unknown", rule_id: "scope.wealth_and_vehicle", field_path: "coverage.wealth_surcharge", values: [] }, { message_id: "employment_benefit_valuation_needed", rule_id: "income.employment", field_path: "income.0.benefits_valuation_complete", values: [] }] }));
    setup(<TaxPlannerV2Workspace locale="en" />);
    await waitFor(() => expect(screen.getAllByRole("button", { name: "Edit facts" })).toHaveLength(2));
    expect(annualCard()).not.toHaveTextContent("BDT 20,000");
    fireEvent.click(screen.getAllByRole("button", { name: "Edit facts" })[0]);
    const question = screen.getByLabelText("Could wealth surcharge apply?");
    await waitFor(() => expect(question).toHaveFocus());
    expect(question).toBeVisible();
    fireEvent.click(screen.getAllByRole("button", { name: "Edit facts" })[1]);
    await waitFor(() => expect(screen.getByLabelText("All noncash employment benefits valued?")).toHaveFocus());
    expect(screen.getByRole("list", { name: "Detailed planner steps" })).not.toHaveTextContent("✓");
  });

  it("preserves a dated zero income and opens its date when an issue targets it", async () => {
    setup(<TaxPlannerV2Workspace locale="en" />);
    await screen.findByLabelText(salaryLabel);
    fireEvent.click(button("Detailed planner")); fireEvent.click(button("2. Income"));
    reveal("Specific receipt date (optional)");
    fireEvent.change(screen.getByLabelText("Income date (optional for annual totals)"), { target: { value: "2025-07-01" } });
    fireEvent.change(screen.getByLabelText("Gross amount before withholding"), { target: { value: "0" } });
    fireEvent.click(button("Quick estimate"));
    expect(screen.getByLabelText(salaryLabel)).toHaveValue("0");
    fireEvent.click(button("Detailed planner")); fireEvent.click(button("2. Income"));
    expect(screen.getByLabelText("Income date (optional for annual totals)")).toHaveValue("2025-07-01");
    await waitFor(() => expect(mocks.calculate.mock.lastCall![0].income[0]).toMatchObject({ amount: "0", earned_on: "2025-07-01" }));
  });

  it("restores with uncertain provenance and requires an explicit calculation", async () => {
    setup(<TaxPlannerV2Workspace locale="en" />);
    await waitFor(() => expect(mocks.calculate).toHaveBeenCalledOnce());
    fireEvent.click(button("Save on this browser")); fireEvent.click(button("Restore saved draft"));
    expect(screen.getByText("Draft restored. Review the entries before calculating.")).toBeVisible();
    reveal(/Allowance, dependents/); fireEvent.click(button("Woman"));
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 550)); });
    expect(mocks.calculate).toHaveBeenCalledOnce();
    fireEvent.click(button("3. Investments")); fireEvent.click(button("Calculate estimate"));
    await waitFor(() => expect(mocks.calculate).toHaveBeenCalledTimes(2));
    expect(annualCard()).toHaveTextContent("Restored estimate");
    const saved = JSON.parse(localStorage.getItem(draftKey("account-a", "2026-27", "forward_planning"))!).facts;
    expect(saved.coverage.wealth_surcharge).toBe("unknown");
    expect(saved.profile.new_taxpayer_floor).toBe("unknown");
  });

  it("removes unavailable new settlement actions while preserving previously entered payments", async () => {
    const view = setup(<TaxPlannerV2Workspace locale="en" />);
    await screen.findByLabelText(salaryLabel);
    fireEvent.click(button("Optional tax adjustments"));
    fireEvent.change(screen.getByLabelText("Credit information"), { target: { value: "confirmed_none" } });
    fireEvent.click(button("Add tax payment"));
    expect(screen.getByLabelText("Credit information")).toHaveValue("unknown");
    fireEvent.change(screen.getByLabelText("Tax paid"), { target: { value: "5000" } });
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    act(() => view.queryClient.setQueryData(["tax-planner-v2", "config", "current"], config("2027-28")));
    await waitFor(() => expect(screen.queryByRole("button", { name: "Optional tax adjustments" })).not.toBeInTheDocument());
    fireEvent.click(button("Previously entered payment records"));
    expect(screen.getByLabelText("Tax paid")).toHaveValue("5000");
    expect(screen.queryByRole("button", { name: "Add tax payment" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Estimate the balance at filing")).not.toBeInTheDocument();
  });

  it("retains keyboard mode control, guide targets, help dismissal and direct simulator focus", async () => {
    const view = setup(<TaxPlannerV2Workspace locale="en" />);
    await waitFor(() => expect(mocks.calculate).toHaveBeenCalledOnce());
    const quick = screen.getByRole("tab", { name: /Quick estimate/ });
    fireEvent.keyDown(quick, { key: "ArrowRight" });
    await waitFor(() => expect(screen.getByRole("tab", { name: /Detailed planner/ })).toHaveFocus());
    for (const step of [...getTaxPlannerDesktopGuideSteps("en"), ...getTaxPlannerMobileGuideSteps("en")]) if (step.target) expect(view.container.querySelector(step.target)).toBeVisible();
    fireEvent.click(button(/Explore Investment/)); expect(play()).toHaveFocus();
    const help = button(/What investments qualify/); fireEvent.click(help);
    expect(screen.getByRole("dialog")).toHaveTextContent("BDT 120,000");
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" }); expect(help).toHaveFocus();
    act(() => mocks.guideStep?.({ active: true, stepId: "finish" }));
    act(() => mocks.guideStep?.({ active: false, stepId: null }));
    expect(screen.getByRole("heading", { name: "Tax planner guide" })).toBeVisible();
  });
});

describe("admin planner", () => {

  it("gates publication on preview, reason and acknowledgement", async () => {

    mocks.publish.mockResolvedValue(revision("published"));

    mocks.getConfig.mockResolvedValue(config("2026-27", "draft-1"));

    setup(<TaxPlannerV2Admin />);

    fireEvent.click(await screen.findByRole("tab", {name:"Review & publish"}));
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

    fireEvent.click(await screen.findByRole("tab", {name:"Tax rules"}));
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
  it("keeps edits across tabs, warns on selection changes, and saves the full draft", async () => {
    mocks.save.mockImplementation(async (_id,_version,rules) => ({...revision(),rules,edit_version:2}));
    setup(<TaxPlannerV2Admin/>);
    fireEvent.click(await screen.findByRole("tab",{name:"Tax rules"}));
    fireEvent.change(screen.getByLabelText("General taxpayer (BDT)"),{target:{value:"410000"}});
    fireEvent.click(screen.getByRole("tab",{name:"Labels & visibility"}));
    fireEvent.change(screen.getByLabelText("dps English label"),{target:{value:"Monthly savings"}});
    fireEvent.click(screen.getByRole("tab",{name:/Tax rules/}));
    expect(screen.getByLabelText("General taxpayer (BDT)")).toHaveValue("410000");
    expect(screen.getByRole("tab",{name:/Labels & visibility/})).toHaveTextContent("•");
    fireEvent.change(screen.getByLabelText("Assessment year"),{target:{value:"2027-28"}});
    expect(screen.getByRole("dialog",{name:"Discard unsaved edits?"})).toBeVisible();
    fireEvent.click(screen.getByRole("button",{name:"Keep editing"}));
    expect(screen.getByLabelText("Assessment year")).toHaveValue("2026-27");
    fireEvent.click(screen.getByRole("button",{name:"Save draft"}));
    await screen.findByText("Draft saved. Preview these exact values before publishing.");
    expect(mocks.save.mock.calls[0][2]).toMatchObject({thresholds:{general:"410000"},investment_presentation:[expect.objectContaining({label_en:"Monthly savings"}),expect.anything()]});
    expect(screen.getByRole("button",{name:"Save draft"})).toBeDisabled();
  });
  it("routes save errors back to their tab and field without losing edits", async () => {
    mocks.save.mockRejectedValue(new BackendApiError("Request validation failed",422,"VALIDATION_ERROR",{errors:[{loc:["body","rules","dps_cap"],msg:"Required amount"}]}));
    setup(<TaxPlannerV2Admin/>);
    fireEvent.click(await screen.findByRole("tab",{name:"Investments & rebate"}));
    fireEvent.change(screen.getByLabelText("Shared DPS cap (BDT)"),{target:{value:""}});
    fireEvent.click(screen.getByRole("tab",{name:"Overview"}));
    fireEvent.click(screen.getByRole("button",{name:"Save draft"}));
    await waitFor(()=>expect(screen.getByLabelText("Shared DPS cap (BDT)")).toHaveFocus());
    expect(screen.getByRole("tab",{name:/Investments & rebate/})).toHaveAttribute("aria-selected","true");
    expect(screen.getByRole("alert")).toHaveTextContent("Required amount");
    expect(screen.getByLabelText("Shared DPS cap (BDT)")).toHaveAttribute("aria-invalid","true");
    expect(screen.getByLabelText("Shared DPS cap (BDT)")).toHaveAccessibleDescription(/Required amount/);
    fireEvent.change(screen.getByLabelText("Shared DPS cap (BDT)"),{target:{value:"120000"}});
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
  it("shows published values, searchable hidden categories, and keyboard tabs", async () => {
    mocks.revisions.mockResolvedValue([revision("published")]);mocks.getRevision.mockResolvedValue(revision("published"));
    setup(<TaxPlannerV2Admin/>);
    const overview=await screen.findByRole("tab",{name:"Overview"});
    fireEvent.keyDown(overview,{key:"ArrowRight"});
    expect(screen.getByRole("tab",{name:"Tax rules"})).toHaveFocus();
    expect(screen.getByRole("tabpanel",{name:"Tax rules"})).toHaveTextContent("BDT 400,000");
    expect(screen.queryByRole("textbox",{name:"General taxpayer (BDT)"})).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab",{name:"Labels & visibility"}));
    fireEvent.change(screen.getByLabelText("Category visibility"),{target:{value:"hidden"}});
    expect(screen.getByRole("table")).toHaveTextContent("Government securities");
    fireEvent.change(screen.getByLabelText("Search categories"),{target:{value:"no match"}});
    expect(screen.getByText("No categories match these filters.")).toBeVisible();
    expect(screen.queryByRole("button",{name:"Save draft"})).not.toBeInTheDocument();
  });

  it("keeps admins read-only even when the selected revision is a draft",async()=>{
    mocks.auth.user={id:"viewer",role:"ADMIN"};
    setup(<TaxPlannerV2Admin/>);
    fireEvent.click(await screen.findByRole("tab",{name:"Tax rules"}));
    expect(screen.queryByRole("button",{name:"Save draft"})).not.toBeInTheDocument();
    expect(screen.queryByRole("button",{name:"Create draft"})).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox",{name:"General taxpayer (BDT)"})).not.toBeInTheDocument();
    expect(screen.getByRole("tabpanel",{name:"Tax rules"})).toHaveTextContent("BDT 400,000");
  });

});
