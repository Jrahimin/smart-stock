/** @vitest-environment jsdom */

import "@testing-library/jest-dom/vitest";
import { channel } from "node:diagnostics_channel";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { setBackendAccessToken } from "@/lib/api/backend-api-client";
import { TaxPlannerV2Admin } from "./admin-workspace";
import {
  createTaxDraft, discardTaxDraft, getTaxConfig, getTaxRevision, previewTaxDraft,
  publishTaxDraft, listTaxRevisions,
} from "./api";
import type { Income, Revision, Year } from "./contracts";
import { draftKey } from "./facts";
import { TaxPlannerV2Workspace } from "./planner-workspace";

const origin = "http://127.0.0.1:8113";
const superAdminToken = "tax-planner-ui-test-super-admin";
const superAdminId = "f9b78086-e81b-44f7-b3a7-8102e88cf125";
const auth = vi.hoisted(() => ({
  user: null as { id: string; role: "SUPER_ADMIN" } | null,
  isAuthenticated: false,
  isLoading: false,
}));
vi.mock("@/features/auth/context/auth-context", () => ({ useAuth: () => auth }));
vi.mock("next/navigation", () => ({
  usePathname: () => "/wealth/tools/tax-planner",
  useRouter: () => ({ refresh() {} }),
}));

const button = (name: string | RegExp) => screen.queryByRole("button", { name }) ?? screen.getByRole("tab", { name });
const click = (name: string | RegExp) => {
  const control = screen.queryByRole("button", { name }) ?? screen.queryByRole("tab", { name }) ?? screen.queryByRole("button", { name, hidden: true }) ?? screen.queryByText(name, { selector: "summary" });
  if (!control) throw new Error("Missing control " + name);
  for (let node = control.parentElement; node; node = node.parentElement) if (node instanceof HTMLDetailsElement && !node.open) fireEvent.click(node.querySelector("summary")!);
  fireEvent.click(control);
};
const fill = (name: string | RegExp, value: string, scope: HTMLElement = document.body) => {
  const field = within(scope).getByLabelText(name);
  for (let node = field.parentElement; node; node = node.parentElement) if (node instanceof HTMLDetailsElement && !node.open) fireEvent.click(node.querySelector("summary")!);
  fireEvent.change(field, { target: { value } });
  return field;
};
const salary = "Annual salary, including bonuses";
const ordinary = "Other confirmed ordinary taxable income";
const annual = "Estimated annual Tax";
const filingBalance = "Estimated balance at filing";
const submitEstimate = () => {
  if (screen.queryByRole("button", { name: "Apply adjustments" })) { click("Apply adjustments"); return; }
  if (!screen.queryByRole("button", { name: "Calculate estimate" })) click("3. Investments");
  click("Calculate estimate");
};
const result = async () => waitFor(() => {
  const container = screen.getByRole("heading", { name: annual }).closest<HTMLElement>(".wealth-tax-results");
  expect(container).not.toBeNull();
  return container!;
});

function show(node: ReactNode) {
  const query = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(<QueryClientProvider client={query}>{node}</QueryClientProvider>);
}

async function openPlanner() {
  show(<TaxPlannerV2Workspace locale="en" />);
  expect(await screen.findByLabelText(salary)).toHaveValue("900000");
  click("Detailed planner"); click("2. Income"); click("Remove source"); click("Quick estimate");
}

const scopeQuestions = [
  /^Could wealth surcharge apply\?/,
  /^Could environmental surcharge apply\?/,
  /^Is there personal vehicle advance tax\?/,
  /^Does commercial vehicle or vessel income apply\?/,
  /^Is there foreign or treaty income\?/,
  /^Is there another exemption or special income still to review\?/,
  /^Are losses or loss offsets claimed\?/,
  /^Could turnover or special sector tax apply\?/,
  /^Could an earlier rebate be recovered\?/,
];

function confirmProfile(except?: RegExp) {
  fill(/^Eligible for the new taxpayer minimum\?/, "no");
  for (const question of scopeQuestions) {
    if (question !== except) fill(question, "no");
  }
}

function addIncome(kind: Income["kind"], heading: string) {
  fill("Source to add", kind);
  click("Add income");
  return screen.getByRole("heading", { name: heading }).closest("article")!;
}

function requestFiling(date: string) {
  fireEvent.click(screen.getByLabelText("Estimate the balance at filing"));
  const field = fill("Planned filing date", date);
  fill("Is this your first return?", "no");
  fill("Return from abroad exception applies?", "no");
  fill("Extension or another filing exception applies?", "no");
  return field;
}

function openBreakdown(section: HTMLElement, summary: string): HTMLElement {
  let scope = section;
  const launcher = within(section).queryByRole("button", { name: /Calculation details and sources/ });
  if (launcher) {
    const existing = screen.queryByRole("dialog", { name: "Calculation details and sources" });
    if (!existing) fireEvent.click(launcher);
    scope = screen.getByRole("dialog", { name: "Calculation details and sources" });
    if (summary === "Calculation details and sources") return scope;
  }
  const details = within(scope).getByText(summary).closest("details")!;
  for (let parent = details.parentElement; parent && parent !== scope; parent = parent.parentElement) {
    if (parent instanceof HTMLDetailsElement && !parent.open) fireEvent.click(parent.querySelector("summary")!);
  }
  if (!details.open) fireEvent.click(within(details).getByText(summary));
  return details;
}

function row(scope: HTMLElement, name: string, amount: string) {
  const term = within(scope).getByText(name, { selector: "dt" });
  expect(term.nextElementSibling?.textContent).toBe(amount);
  expect(term.nextElementSibling).toBeVisible();
}

async function headline(name: string, amount: string) {
  await waitFor(() => {
    const heading = screen.getByRole("heading", { name });
    expect(within(heading.parentElement!).getByText(amount)).toBeVisible();
  });
}

function useAdmin() {
  auth.user = { id: superAdminId, role: "SUPER_ADMIN" };
  auth.isAuthenticated = true;
  setBackendAccessToken(superAdminToken);
}

async function publishCopy(year: Year) {
  const previous = (await listTaxRevisions()).find(
    (revision) => revision.assessment_year === year && revision.status === "published",
  )!.id;
  const draft = await createTaxDraft(year, previous);
  try {
    const preview = await previewTaxDraft(draft.id, draft.edit_version);
    expect(preview.publishable).toBe(true);
    expect(preview.preview.requires_acknowledgement).toBe(false);
    return { previous, published: await publishTaxDraft(draft.id, preview.preview, "UI revision propagation test", false) };
  } catch (error) {
    await discardTaxDraft(draft, "Clean up unfinished UI revision test");
    throw error;
  }
}

// Node's native fetch emits these events for the real HTTP exchanges. No responses are replaced.
function watchCalculationRetry() {
  const statuses: Array<[string, number]> = [];
  const responses = channel("undici:request:headers");
  const record = (message: unknown) => {
    const { request, response } = message as {
      request: { origin: string; path: string };
      response: { statusCode: number };
    };
    const path = request.path.split("?")[0];
    const action = path === "/api/v1/wealth/tax-planner/v2/calculate" ? "calculate"
      : path === "/api/v1/wealth/tax-planner/v2/config" ? "config" : null;
    if (request.origin === origin && action) statuses.push([action, response.statusCode]);
  };
  responses.subscribe(record);
  return { statuses, stop: () => responses.unsubscribe(record) };
}

describe("tax planner UI with the loopback PostgreSQL API", () => {
  beforeAll(async () => {
    if (process.env.NEXT_PUBLIC_API_BASE_URL !== `${origin}/api/v1`) {
      throw new Error(`Set NEXT_PUBLIC_API_BASE_URL to ${origin}/api/v1 for the disposable test server`);
    }
    const response = await fetch(`${origin}/tax-planner-ui-test/ready`);
    expect(response.ok).toBe(true);
    expect(await response.json()).toEqual({ tax_planner_ui_test: true });
    const blocked = await fetch(`${origin}/api/v1/admin/tax-planner/v2/rulesets`, {
      headers: { "x-test-role": "SUPER_ADMIN" },
    });
    expect(blocked.status).toBe(401);
    // jsdom has no viewport media-query API. Keep the actual desktop guide and navigation mounted.
    vi.stubGlobal("matchMedia", (query: string) => ({
      media: query, matches: false, addEventListener() {}, removeEventListener() {},
      addListener() {}, removeListener() {},
    }));
  });

  // The current endpoint follows the latest published pack across years. These
  // settlement and dated-record cases require the disposable 2026-27 pack;
  // earlier UI revision tests can legitimately have made 2027-28 active.
  beforeEach(async () => {
    const active = await getTaxConfig();
    if (active.selected?.identity.assessment_year !== "2026-27") {
      setBackendAccessToken(superAdminToken);
      try { await publishCopy("2026-27"); } finally { setBackendAccessToken(null); }
    }
    const selected = (await getTaxConfig()).selected!;
    expect(selected.identity.assessment_year).toBe("2026-27");
    expect(selected.identity.supports_settlement).toBe(true);
  });

  afterAll(() => vi.unstubAllGlobals());

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    setBackendAccessToken(null);
    auth.user = null;
    auth.isAuthenticated = false;
    localStorage.clear();
  });

  it("calculates a DPS tile amount without extra questions and keeps the slider responsive", async () => {
    await openPlanner();
    fill(salary, "900000");
    await headline(annual, "BDT 20,000");
    click("Detailed planner");
    click("3. Investments");
    expect(screen.queryByLabelText("Contribution date")).not.toBeInTheDocument();
    click("By category · simple amounts");
    fill("Investment category to add", "dps"); click("Add category");
    fill("Deposit pension scheme contributions · Annual eligible amount", "40000");
    await headline(annual, "BDT 16,000");
    expect(screen.getByText("Could save more with eligible Investment").nextElementSibling).toHaveTextContent("BDT 11,000");
    const slider = screen.getByRole("slider", { name: "Additional tax-saving investment to simulate" });
    expect(slider).toBeEnabled();
    fireEvent.change(slider, { target: { value: "40000" } });
    const play = screen.getByRole("heading", { name: "What if I invest more?" }).closest("section")!;
    await waitFor(() => expect(within(play).getByText("Actual additional saving from this Investment").nextElementSibling).toHaveTextContent("BDT 4,000"));
    fill("Deposit pension scheme contributions · Annual eligible amount", "240000");
    await headline(annual, "BDT 8,000");
    const details = openBreakdown(await result(), "Investments, deductions and rebate");
    row(details, "Eligible investments", "BDT 120,000");
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    fill("Deposit pension scheme contributions · Annual eligible amount", "");
    await headline(annual, "BDT 20,000");
    expect(slider).toBeEnabled();
  });

  it("accepts every eligible amount tile and applies the shared securities cap", async () => {
    await openPlanner();
    fill(salary, "900000");
    await headline(annual, "BDT 20,000");
    click("Detailed planner");
    click("3. Investments");
    click("By category · simple amounts");
    const chooser = screen.getByLabelText("Investment category to add") as HTMLSelectElement;
    for (const option of [...chooser.options].filter((option) => option.value)) { fill("Investment category to add", option.value); click("Add category"); }
    const fields = screen.getAllByRole("textbox", { name: /Annual eligible amount/ });
    expect(fields).toHaveLength(14);
    for (const field of fields) fireEvent.change(field, { target: { value: "1000" } });
    await headline(annual, "BDT 18,600");
    for (const field of fields) fireEvent.change(field, { target: { value: "" } });
    fill("Government securities · Annual eligible amount", "300000");
    fill("Savings certificates · Annual eligible amount", "300000");
    await headline(annual, "BDT 5,000");
    const details = openBreakdown(await result(), "Investments, deductions and rebate");
    row(details, "Eligible investments", "BDT 500,000");
  });

  it("keeps the same current estimate and working slider across Quick and Detailed", async () => {
    await openPlanner();
    fill(salary, "900000");
    await headline(annual, "BDT 20,000");
    click("Detailed planner");
    await headline(annual, "BDT 20,000");
    expect(screen.getByLabelText(scopeQuestions[0])).toHaveValue("");
    const slider = screen.getByRole("slider", { name: "Additional tax-saving investment to simulate" });
    expect(slider).toBeEnabled();
    fireEvent.change(slider, { target: { value: "40000" } });
    const play = screen.getByRole("heading", { name: "What if I invest more?" }).closest("section")!;
    await waitFor(() => expect(within(play).getByText("Actual additional saving from this Investment").nextElementSibling).toHaveTextContent("BDT 4,000"));
    click("Quick estimate");
    await headline(annual, "BDT 20,000");
    expect(screen.getByLabelText(salary)).toHaveValue("900000");
  });

  it("applies every profile card's allowance and tax impact through the real API", async () => {
    await openPlanner();
    fill(salary, "900000");
    await headline(annual, "BDT 20,000");
    click("Detailed planner");
    for (const [name, expected] of [
      [/^Woman/, "BDT 15,000"], [/^Senior Citizen/, "BDT 15,000"],
      [/^Person with disability/, "BDT 7,500"], [/^Third gender/, "BDT 7,500"],
      [/^Gazetted war-wounded freedom fighter/, "BDT 5,000"], [/^Gazetted injured July 2024 warrior/, "BDT 5,000"],
    ] as const) {
      click(name);
      await headline(annual, expected);
      click(name);
      await headline(annual, "BDT 20,000");
    }
  }, 25000);

  it("handles a zero-tax salary and a higher salary without losing the responsive inputs", async () => {
    await openPlanner();
    fill(salary, "৩০০০০০");
    await headline(annual, "BDT 0");
    expect(screen.getByRole("slider")).toBeDisabled();
    fill(salary, "2500000");
    await headline(annual, "BDT 290,000");
    fill("Already eligible investment total", "600000");
    await headline(annual, "BDT 230,000");
    expect(screen.getByLabelText(salary)).toHaveValue("2500000");
  });

  it("withholds both totals for unknown Detailed scope and focuses the missing fact", async () => {
    await openPlanner();
    fill(/^Other confirmed ordinary taxable income/, "900000");
    submitEstimate();
    await headline(annual, "BDT 60,000");

    click("Detailed planner");
    const wealth = scopeQuestions[0];
    expect(screen.getByLabelText(wealth)).toHaveValue("");
    confirmProfile(wealth);
    click("Optional tax adjustments");
    fill("Credit information", "confirmed_none");
    requestFiling("2026-10-01");
    submitEstimate();
    expect(await screen.findByText("Annual liability needs information or review. Check the affected facts below.")).toBeVisible();
    expect(screen.getByText(/A filing balance cannot be estimated/)).toBeVisible();
    const annualCard = screen.getByRole("heading", { name: annual }).parentElement!;
    const filingCard = screen.getByRole("heading", { name: filingBalance }).parentElement!;
    expect(within(annualCard).queryByText("BDT 60,000")).not.toBeInTheDocument();
    expect(within(filingCard).queryByText("BDT 60,000")).not.toBeInTheDocument();
    click("Edit facts");
    await waitFor(() => expect(screen.getByLabelText(wealth)).toHaveFocus());
    fill(wealth, "no");
    await headline(annual, "BDT 60,000");
    await headline(filingBalance, "BDT 60,000");
  });

  it("requires a separate salary valuation confirmation in Detailed and when restoring an older Quick draft", async () => {
    useAdmin();
    await openPlanner();
    fill(salary, "900000");
    submitEstimate();
    await headline(annual, "BDT 20,000");
    click("Save on this browser");
    const activeYear = (await getTaxConfig()).selected!.identity.assessment_year;
    const key = draftKey(superAdminId, activeYear, "forward_planning");
    expect(JSON.parse(localStorage.getItem(key)!)).toMatchObject({
      schema: 5, facts: { income: [{ amount: "900000", benefits_valuation_complete: "unknown" }] },
    });

    click("Detailed planner");
    confirmProfile();
    click("Optional tax adjustments");
    fill("Credit information", "confirmed_none");
    requestFiling("2026-10-01");
    submitEstimate();
    const guidance = "Confirm that noncash employment benefits have been valued.";
    const valuation = "All noncash employment benefits valued?";
    expect(await screen.findByText(guidance, { selector: "span" })).toBeVisible();
    expect(screen.getByText(/A filing balance cannot be estimated/)).toBeVisible();
    click("2. Income");
    expect(screen.getByLabelText(valuation)).toHaveValue("unknown");
    expect(within(screen.getByRole("article", { name: "Private employment" })).getByLabelText("Gross amount before withholding")).toHaveValue("900000");
    fill(valuation, "yes");
    await headline(annual, "BDT 20,000");
    await headline(filingBalance, "BDT 20,000");
    click("Save on this browser");
    const confirmed = localStorage.getItem(key)!;

    // Old Quick rows stored an indistinguishable automatic "yes".
    localStorage.setItem(key, JSON.stringify({ ...JSON.parse(confirmed), schema: 3 }));
    click("Restore saved draft");
    click("2. Income");
    expect(screen.getByLabelText(valuation)).toHaveValue("unknown");
    expect(within(screen.getByRole("article", { name: "Private employment" })).getByLabelText("Gross amount before withholding")).toHaveValue("900000");
    submitEstimate();
    expect(await screen.findByText(guidance, { selector: "span" })).toBeVisible();
    expect(screen.getByText(/A filing balance cannot be estimated/)).toBeVisible();

    localStorage.setItem(key, confirmed);
    click("Restore saved draft");
    click("2. Income");
    expect(screen.getByLabelText(valuation)).toHaveValue("yes");
    submitEstimate();
    await headline(filingBalance, "BDT 20,000");
  });

  it("deducts financial expenses once and treats withholding as a filing credit", async () => {
    await openPlanner();
    click("Detailed planner");
    confirmProfile();
    click("2. Income");
    const bank = addIncome("bank_interest", "Bank interest");
    fill("Gross amount before withholding", "900000", bank);
    fill("Gross income and tax treatment confirmed?", "yes", bank);
    fireEvent.click(within(bank).getByRole("button", { name: "Add financial expense" }));
    fill("Expense type", "bank_or_finance_charge", bank);
    fill("Expense amount", "50000", bank);
    fill("Deductible for this source under sections 64–65?", "yes", bank);

    click("Optional tax adjustments");
    click("Add tax payment");
    const linkedSource = screen.getByRole("option", { name: "1. Bank interest" }) as HTMLOptionElement;
    fill("Linked income source", linkedSource.value);
    fill("Tax paid", "15000");
    fill("Payment date", "2026-06-30");
    fill("Claim for this assessment year confirmed?", "yes");
    fill("Credit information", "complete");
    const date = requestFiling("2026-08-10");
    expect(date).toHaveAttribute("type", "date");
    click("2. Income");
    click("Optional tax adjustments");
    expect(screen.getByLabelText("Planned filing date")).toHaveValue("2026-08-10");
    submitEstimate();

    // 900,000 − 50,000 expense − 400,000 allowance leaves 450,000 above the threshold.
    // 300,000 × 10% + 150,000 × 15% = 52,500. The 15,000 credit gives a 37,500 balance.
    // The August incentive is 5% of that balance, giving 35,625 payable.
    await headline(annual, "BDT 52,500");
    await headline(filingBalance, "BDT 35,625");
    const income = openBreakdown(await result(), "Income, allowance and tax bands");
    row(income, "Eligible financial expenses", "BDT 50,000");
    row(income, "Taxable", "BDT 850,000");
    const credits = openBreakdown(await result(), "Credits and filing adjustment");
    row(credits, "Eligible credits entered", "BDT 15,000");
    row(credits, "Balance before adjustment", "BDT 37,500");
    row(credits, "Filing adjustment", "BDT -1,875");

    // The March window adds a fixed 3,000 while the annual liability and credit stay the same.
    if (screen.queryByRole("dialog")) fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    click("Optional tax adjustments");
    fill("Planned filing date", "2027-03-03");
    click("Apply adjustments");
    await headline(filingBalance, "BDT 40,500");
    await headline(annual, "BDT 52,500");
  });

  it("caps shared DPS contributions and deducts a qualifying CZM donation from income", async () => {
    await openPlanner();
    fill(new RegExp(`^${ordinary}`), "900000");
    click("Detailed planner");
    confirmProfile();
    click("3. Investments");
    click("Checked records");
    for (const amount of ["90000", "150000"]) {
      click("Add contribution");
      const categories = screen.getAllByLabelText("Investment category");
      const contribution = categories.at(-1)!.closest("article")!;
      fill("Investment category", "dps", contribution);
      fill(/^Contribution amount/, amount, contribution);
      fill("Contribution date", "2026-06-30", contribution);
      fill("Meets the rules for this category?", "yes", contribution);
    }
    click("Add CZM donation");
    fill("Donation amount", "70000");
    fill("Paid on", "2026-06-30");
    fill("Qualifying bank transfer?", "yes");
    fill("Are there other Part 2 donation claims?", "no");
    submitEstimate();

    // 900,000 − 70,000 CZM − 400,000 allowance leaves 430,000. Bands give 49,500.
    // The 120,000 shared DPS cap gives a 12,000 rebate, below the 24,900 income limit.
    await headline(annual, "BDT 37,500");
    const investments = openBreakdown(await result(), "Investments, deductions and rebate");
    row(investments, "Rebate income base", "BDT 830,000");
    row(investments, "Eligible investments", "BDT 120,000");
    row(investments, "Statutory rebate entitlement", "BDT 12,000");
    row(within(investments).getByRole("heading", { name: "CZM deduction" }).parentElement!, "Allowed", "BDT 70,000");
  });

  it("splits domestic dividends and qualifying realized listed gains from ordinary income", async () => {
    await openPlanner();
    fill(new RegExp(`^${ordinary}`), "900000");
    click("Detailed planner");
    confirmProfile();
    click("2. Income");
    const dividend = addIncome("domestic_dividend", "Domestic dividend");
    fill("Gross amount before withholding", "150000", dividend);
    fill("Gross income and tax treatment confirmed?", "yes", dividend);
    const gain = addIncome("listed_gain", "Realized listed capital gains");
    fill("Gross amount before withholding", "6000000", gain);
    fill("Instrument sold", "listed_share", gain);
    fill("Gain realized through a sale?", "yes", gain);
    fill("Qualifying disposal confirmed?", "yes", gain);
    fill("Sponsor, director or placement holder?", "no", gain);
    submitEstimate();

    // 60,000 ordinary tax + 15% of 150,000 dividends + 15% of (6,000,000 − 5,000,000).
    await headline(annual, "BDT 232,500");
    const income = openBreakdown(await result(), "Income, allowance and tax bands");
    row(income, "Ordinary tax", "BDT 60,000");
    row(income, "Separate-rate tax", "BDT 172,500");
    const listed = within(income).getByRole("heading", { name: "Realized listed capital gains" }).parentElement!;
    row(listed, "Excluded", "BDT 5,000,000");
    row(listed, "Taxable", "BDT 1,000,000");
  });

  it("refreshes the revision after a real conflict and retries the same entered facts", async () => {
    await openPlanner();
    fill(salary, "900000");
    setBackendAccessToken(superAdminToken);
    const { published } = await publishCopy("2026-27");
    setBackendAccessToken(null);

    const requests = watchCalculationRetry();
    try {
      submitEstimate();
      // 900,000 salary less the 300,000 employment exemption and 400,000 allowance.
      await headline(annual, "BDT 20,000");
      const revision = openBreakdown(await result(), "Revision details");
      expect(revision).toHaveTextContent(published.id);
      expect(revision).toHaveTextContent(published.content_hash);
      expect(screen.getByLabelText(salary)).toHaveValue("900000");
      expect(requests.statuses).toEqual([["calculate", 409], ["config", 200], ["calculate", 200]]);
    } finally {
      requests.stop();
    }
  });

  it("compares actual saving under the active rules without changing the current Journey", async () => {
    await openPlanner(); fill(salary, "900000"); fill("Already eligible investment total", "50000");
    await headline(annual, "BDT 15,000");
    const journey = screen.getByRole("heading", { name: "How your current annual Tax was calculated" }).closest("section")!;
    const play = screen.getByRole("heading", { name: "What if I invest more?" }).closest("section")!;
    const scroll = vi.fn(); Object.defineProperty(play, "scrollIntoView", { value: scroll });
    click(/Explore Investment/); expect(play).toHaveFocus();
    const saving = () => within(play).getByText("Actual additional saving from this Investment").nextElementSibling;
    expect(saving()).toHaveTextContent("BDT 0");
    const slider = within(play).getByRole("slider");
    for (const [amount, expected] of [["10000", "BDT 1,000"], ["20000", "BDT 2,000"], ["130000", "BDT 10,000"]]) {
      fireEvent.change(slider, { target: { value: amount } });
      await waitFor(() => expect(saving()).toHaveTextContent(expected));
      expect(journey).toHaveTextContent("BDT 15,000");
      await headline(annual, "BDT 15,000");
    }
    expect(within(play).getByText("Proposed Tax").nextElementSibling).toHaveTextContent("BDT 5,000");
    click("Fine-tune comparison"); expect(screen.getByLabelText("Hypothetical contribution date")).toHaveValue("2026-06-30");
    fill("Hypothetical contribution date", "2025-06-30");
    await waitFor(() => expect(saving()).toHaveTextContent("BDT 0"));
    fill("Additional Investment", "50000");
    expect(screen.getByLabelText("Hypothetical contribution date")).toHaveValue("2025-06-30");
    await waitFor(() => expect(saving()).toHaveTextContent("BDT 0"));
    click("Reset comparison"); await waitFor(() => expect(saving()).toHaveTextContent("BDT 0"));
    expect(screen.getByLabelText(salary)).toHaveValue("900000");
  });

  it("focuses a server validation error and replaces a draft immediately after saving", async () => {
    useAdmin();
    const { previous, published } = await publishCopy("2027-28");
    const draft = await createTaxDraft("2027-28");
    let cleanupDraft: Revision | undefined = draft;
    try {
      show(<TaxPlannerV2Admin />);
      const controls = await screen.findByRole("region", { name: "Assessment year and revision" });
      const history = await within(controls).findByRole("combobox", { name: "Revision history" }) as HTMLSelectElement;
      fireEvent.change(within(controls).getByRole("combobox", { name: "Assessment year" }), { target: { value: "2027-28" } });
      fireEvent.click(await within(controls).findByRole("button", { name: "Open existing draft" }));
      const editor = await screen.findByRole("region", { name: "Selected rule revision" });
      await waitFor(() => expect(within(controls).getByRole("button", { name: "Save draft" })).toBeVisible());
      fireEvent.click(within(editor).getByRole("tab",{name:"Review & publish"}));
      const actions = within(editor).getByRole("region", { name: "Draft workflow" });

      fireEvent.click(within(editor).getByRole("tab",{name:"Investments & rebate"}));
      const eligibility = within(editor).getByRole("heading",{name:"Investment eligibility, deduction and caps"}).closest("section")!;
      const cap = within(eligibility).getByRole("textbox", { name: "Shared DPS cap (BDT)" });
      fireEvent.change(cap, { target: { value: "" } });
      fireEvent.click(within(editor).getByRole("tab",{name:"Overview"}));
      fireEvent.click(within(controls).getByRole("button", { name: "Save draft" }));
      await waitFor(() => expect(cap).toHaveFocus());
      expect(within(editor).getByRole("tab",{name:/Investments & rebate/})).toHaveAttribute("aria-selected","true");
      expect(screen.getByRole("alert")).toHaveTextContent("Request validation failed");
      expect((await getTaxRevision(draft.id)).edit_version).toBe(draft.edit_version);
      fireEvent.click(within(editor).getByRole("tab",{name:"Review & publish"}));
      fireEvent.click(within(actions).getByRole("button", { name: "Discard unsaved edits" }));
      fireEvent.click(within(screen.getByRole("dialog",{name:"Discard unsaved edits?"})).getByRole("button",{name:"Discard edits"}));
      await waitFor(()=>expect(within(controls).getByRole("button",{name:"Save draft"})).toBeDisabled());

      fireEvent.click(within(editor).getByRole("tab",{name:"Tax rules"}));
      const profile = within(editor).getByRole("heading",{name:"Profiles and minimum tax"}).closest("section")!;
      fireEvent.change(within(profile).getByRole("textbox", { name: "General taxpayer (BDT)" }), { target: { value: "410000" } });
      fireEvent.click(within(controls).getByRole("button", { name: "Save draft" }));
      expect(await within(editor).findByText("Draft saved. Preview these exact values before publishing.")).toBeVisible();
      const changed = await getTaxRevision(draft.id);
      expect(changed.edit_version).toBe(draft.edit_version + 1);
      expect(changed.content_hash).not.toBe(draft.content_hash);
      fireEvent.change(history, { target: { value: previous } });
      fireEvent.click(within(controls).getByText("Draft actions",{selector:"summary"}));
      fireEvent.click(await within(controls).findByRole("button", { name: "Replace draft with selected revision" }));
      const confirmation = within(controls).getByRole("region", { name: "Confirm draft discard" });
      const confirm = within(confirmation).getByRole("button", { name: "Discard and create replacement draft" });
      expect(confirmation).toHaveTextContent(`edit ${changed.edit_version}`);
      expect(confirm).toBeDisabled();
      const reason = "Restore verified historical rules for UI review";
      fireEvent.change(within(confirmation).getByRole("textbox", { name: "Reason for discarding this draft" }), { target: { value: reason } });
      expect(confirm).toBeDisabled();
      fireEvent.click(within(confirmation).getByRole("checkbox", { name: "I confirm this saved draft can be discarded." }));
      fireEvent.click(confirm);
      expect(await screen.findByText(/Replacement draft created/)).toBeVisible();
      await waitFor(() => {
        expect(history).toBeEnabled();
        expect(history.selectedOptions[0]).toHaveTextContent(/ · Draft$/);
        expect(history.value).not.toBe(changed.id);
      });
      const replacement = await getTaxRevision(history.value);
      cleanupDraft = replacement;
      expect(replacement).toMatchObject({ status: "draft", copied_from_revision_id: previous });
      expect(replacement.content_hash).toBe((await getTaxRevision(previous)).content_hash);
      expect((await getTaxConfig()).selected?.identity.revision_id).toBe(published.id);

      const retained = await getTaxRevision(changed.id);
      expect(retained).toMatchObject({
        status: "discarded", discard_reason: reason, content_hash: changed.content_hash,
        discarded_by_user_id: superAdminId,
      });
      expect(retained.discarded_at).toBeTruthy();
      fireEvent.change(history, { target: { value: retained.id } });
      expect(await screen.findByText(reason)).toBeVisible();
      const historyDetail = screen.getByRole("region", { name: "Selected rule revision" });
      fireEvent.click(within(historyDetail).getByRole("tab",{name:"Tax rules"}));
      expect(within(historyDetail).getByRole("tabpanel",{name:"Tax rules"})).toHaveTextContent("BDT 410,000");
      expect(within(historyDetail).queryByRole("textbox",{name:"General taxpayer (BDT)"})).not.toBeInTheDocument();
    } finally {
      if (cleanupDraft) {
        let current = await getTaxRevision(cleanupDraft.id);
        if (current.id === draft.id && current.status === "discarded") {
          // A failed assertion may precede reading the replacement ID from the UI.
          const pending = (await listTaxRevisions()).find((row) => (
            row.assessment_year === "2027-28" && row.status === "draft"
            && row.copied_from_revision_id === previous && row.created_by_user_id === superAdminId
            && row.revision_number > draft.revision_number
          ));
          if (pending) current = await getTaxRevision(pending.id);
        }
        if (current.status === "draft") await discardTaxDraft(current, "Clean up completed UI draft test");
      }
    }
  });

  it("discards the exact saved draft immediately after saving", async () => {
    useAdmin();
    const draft = await createTaxDraft("2027-28");
    let discarded = false;
    try {
      show(<TaxPlannerV2Admin />);
      const controls = await screen.findByRole("region", { name: "Assessment year and revision" });
      await within(controls).findByRole("combobox", { name: "Revision history" });
      fireEvent.change(within(controls).getByRole("combobox", { name: "Assessment year" }), { target: { value: "2027-28" } });
      fireEvent.click(await within(controls).findByRole("button", { name: "Open existing draft" }));
      const editor = await screen.findByRole("region", { name: "Selected rule revision" });
      await waitFor(() => expect(within(controls).getByRole("button", { name: "Save draft" })).toBeVisible());
      fireEvent.click(within(editor).getByRole("tab",{name:"Review & publish"}));
      const actions = within(editor).getByRole("region", { name: "Draft workflow" });
      fireEvent.click(within(editor).getByRole("tab",{name:"Tax rules"}));
      const profile = within(editor).getByRole("heading",{name:"Profiles and minimum tax"}).closest("section")!;
      fireEvent.change(within(profile).getByRole("textbox", { name: "General taxpayer (BDT)" }), { target: { value: "415000" } });
      fireEvent.click(within(controls).getByRole("button", { name: "Save draft" }));
      expect(await within(editor).findByText("Draft saved. Preview these exact values before publishing.")).toBeVisible();
      const savedHash = within(editor).getByText("Content hash", { selector: "dt" }).nextElementSibling?.textContent;
      expect(savedHash).toMatch(/^[a-f0-9]{64}$/);
      expect(savedHash).not.toBe(draft.content_hash);
      fireEvent.click(within(controls).getByText("Draft actions",{selector:"summary"}));
      fireEvent.click(within(controls).getByRole("button", { name: "Discard saved draft" }));
      const confirmation = within(controls).getByRole("region", { name: "Confirm draft discard" });
      expect(confirmation).toHaveTextContent(`edit ${draft.edit_version + 1}`);
      const standaloneReason = "Close the saved replacement without publishing";
      fill("Reason for discarding this draft", standaloneReason, confirmation);
      fireEvent.click(within(confirmation).getByLabelText("I confirm this saved draft can be discarded."));
      fireEvent.click(within(confirmation).getByRole("button", { name: "Confirm discard saved draft" }));
      expect(await screen.findByText(/Draft discarded and retained in history/)).toBeVisible();
      discarded = true;
      expect(await getTaxRevision(draft.id)).toMatchObject({
        status: "discarded", discard_reason: standaloneReason, content_hash: savedHash,
        rules: { thresholds: { general: "415000" } },
      });
    } finally {
      if (!discarded) {
        const current = await getTaxRevision(draft.id);
        if (current.status === "draft") await discardTaxDraft(current, "Clean up completed UI draft test");
      }
    }
  });
});
