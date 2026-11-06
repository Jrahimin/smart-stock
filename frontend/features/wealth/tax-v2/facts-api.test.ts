import { afterEach, describe, expect, it, vi } from "vitest";
import { BackendApiError } from "@/lib/api/backend-api-client";
import { calculateWithRevisionRefresh, issueFromError, publishTaxDraft } from "./api";
import { buildTaxRequest, draftKey, incomeEntry, initialFacts, investmentEntry, normalizeMoneyInput, quickSalary, readDraft, writeDraft } from "./facts";
import { config, previewFixture } from "./test-fixtures";
import { sourceHref } from "./rule-sources";

const year = config().selected!;
const request = () => buildTaxRequest(initialFacts(), year, "filing").request!;
const json = (status: number, body: object) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

afterEach(() => vi.unstubAllGlobals());
describe("tax facts", () => {
  it("sends category amounts without fabricated payment dates and uses only the selected method", () => {
    const facts = initialFacts();
    facts.investmentMode = "categories";
    facts.categoryAmounts = { dps: "240000", government_security: "300000", savings_certificate: "300000", life_insurance: "40000" };
    facts.aggregate = "999999";
    const planningYear = config().selected!;
    planningYear.investment_policies.push(
      { category: "government_security", policy: "annual_capped", cap_group: "government_securities", rule_id: "investment.gov_securities" },
      { category: "savings_certificate", policy: "annual_capped", cap_group: "government_securities", rule_id: "investment.gov_securities" },
      { category: "life_insurance", policy: "insurance", cap_group: null, rule_id: "investment.life_insurance" },
    );
    const built = buildTaxRequest(facts, planningYear, "forward_planning", true);
    expect(built.issue).toBeUndefined();
    expect(built.request!.investments).toEqual({ mode: "planning_category_totals", entries: Object.entries(facts.categoryAmounts).map(([category, amount]) => ({ category, amount })) });
    expect(JSON.stringify(built.request!.investments)).not.toContain("contributed_on");
    facts.investmentMode = "aggregate";
    expect(buildTaxRequest(facts, year, "forward_planning", true).request!.investments).toEqual({ mode: "confirmed_eligible_total", amount: "999999", confirmed_for_year: true });
    expect(facts.categoryAmounts.dps).toBe("240000");
  });
  it("preserves decimal precision and accepts Bangla numerals", () => {
    expect(normalizeMoneyInput("৯৯৯,৯৯৯,৯৯৯,৯৯৯,৯৯৯.৯৯")).toBe("999999999999999.99");
    const facts = initialFacts();
    facts.income.push(incomeEntry("domestic_dividend", "dividend", "999999999999999.99"));
    expect(buildTaxRequest(facts, year, "filing").request?.income[0]).toMatchObject({
      kind: "domestic_dividend", amount: "999999999999999.99", basis: "gross",
    });
  });
  it("uses only the selected investment representation and keeps what-if separate", () => {
    const facts = initialFacts();
    facts.aggregate = "40000";
    facts.investments = [investmentEntry("government_security", "hidden-valid", "25000", "2026-05-05")];
    expect(buildTaxRequest(facts, year, "filing").issue).toBeUndefined();
    facts.aggregateConfirmed = true;
    expect(buildTaxRequest(facts, year, "filing").request?.investments).toEqual({ mode: "confirmed_eligible_total", amount: "40000", confirmed_for_year: true });
    facts.investmentMode = "itemized";
    facts.scenario = { mode: "itemized", entry: investmentEntry("dps", "scenario", "5000", "2026-05-05") };
    const built = buildTaxRequest(facts, year, "filing").request!;
    expect(built.investments).toEqual({ mode: "itemized", entries: facts.investments });
    expect(built.scenario).toEqual(facts.scenario);
    expect(facts.investments[0].id).toBe("hidden-valid");
  });
  it("leaves unowned drafts untouched and scopes opted-in drafts to owner, year and purpose", () => {
    const data = new Map([["wealth.taxPlanner.v1", '{"dividends":"50000"}']]);
    const storage = { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value); } };
    expect(readDraft(storage, "owner", "2026-27", "filing")).toBeNull();
    const facts = initialFacts();
    facts.income.push(incomeEntry("domestic_dividend", "dividend", "50000"));
    writeDraft(storage, "owner", "2026-27", "filing", "old-revision", facts);
    expect(readDraft(storage, "owner", "2026-27", "filing")?.facts.income[0].kind).toBe("domestic_dividend");
    expect(readDraft(storage, "owner", "2026-27", "historical_comparison")).toBeNull();
    expect(readDraft(storage, "owner", "2027-28", "forward_planning")).toBeNull();
    expect(readDraft(storage, "other", "2026-27", "filing")).toBeNull();
    expect(data.get("wealth.taxPlanner.v1")).toBe('{"dividends":"50000"}');
    expect(data.get(draftKey("owner", "2026-27", "filing"))).not.toContain("annual_liability");
  });
  it("does not persist Quick assumptions or trust unverified no answers in schema 2", () => {
    const facts = initialFacts();
    const quick = buildTaxRequest(facts, year, "filing", true).request!;
    const detailed = buildTaxRequest(facts, year, "filing").request!;
    expect(quick.coverage.wealth_surcharge).toBe("no");
    expect(quick.profile.new_taxpayer_floor).toBe("no");
    expect(detailed.coverage.wealth_surcharge).toBe("unknown");
    expect(detailed.profile.new_taxpayer_floor).toBe("unknown");
    expect(facts.coverage).toEqual(detailed.coverage);
    const filing = { filing_date: "2026-08-10", return_from_abroad_exception: "no", extension_or_other_exception: "no" } as const;
    expect(buildTaxRequest({ ...facts, filing }, year, "filing", true).request?.coverage).toEqual(detailed.coverage);
    facts.coverage.wealth_surcharge = "no";
    facts.coverage.personal_vehicle_advance_tax = "yes";
    facts.profile.new_taxpayer_floor = "no";
    facts.income.push(incomeEntry("bank_interest", "interest", "20000"));
    const data = { schema: 2, owner: "owner", year: "2026-27", purpose: "filing", revision: "old", facts };
    const previous = readDraft({ getItem: () => JSON.stringify(data) }, "owner", "2026-27", "filing");
    expect(previous?.facts.coverage.wealth_surcharge).toBe("unknown");
    expect(previous?.facts.coverage.personal_vehicle_advance_tax).toBe("yes");
    expect(previous?.facts.profile.new_taxpayer_floor).toBe("unknown");
    expect(previous?.facts.income).toEqual(facts.income);
    const current = readDraft({ getItem: () => JSON.stringify({ ...data, schema: 3 }) }, "owner", "2026-27", "filing");
    expect(current?.facts.coverage).toEqual(facts.coverage);
  });
  it("links to verified public PDF pages only", () => {
    const doc = { id: "guide", edition: "audit PDF", public_edition: "public PDF", public_url: "https://nbr.gov.bd/test.pdf#page=9", sha256: "unused" };
    const ref = { document_id: doc.id, pdf_pages: [53], provision: "Financial expenses" };
    expect(sourceHref(doc, ref)).toBe("https://nbr.gov.bd/test.pdf");
    expect(sourceHref(doc, { ...ref, public_pdf_pages: [61] })).toBe("https://nbr.gov.bd/test.pdf#page=61");
  });
  it.each([2, 3])("reconfirms only ambiguous Quick salary valuations in draft schema %i", (schema) => {
    const facts = initialFacts();
    facts.income = [[quickSalary, "900000"], ["detailed-salary", "20000"]].map(([id, amount]) => ({
      id, amount, kind: "private_employment", basis: "gross",
      excluded_group_insurance_benefit: "0", benefits_valuation_complete: "yes",
    }));
    const data = { schema, owner: "owner", year: "2026-27", purpose: "filing", revision: "old", facts };
    const restore = () => readDraft({ getItem: () => JSON.stringify(data) }, "owner", "2026-27", "filing")?.facts;
    const restored = restore()!;
    expect(restored.income).toMatchObject([
      { id: quickSalary, amount: "900000", benefits_valuation_complete: "unknown" },
      { id: "detailed-salary", benefits_valuation_complete: "yes" },
    ]);
    expect(buildTaxRequest(restored, year, "filing", true).request?.income[0]).toMatchObject({ benefits_valuation_complete: "yes" });
    expect(buildTaxRequest(restored, year, "filing").request?.income[0]).toMatchObject({ benefits_valuation_complete: "unknown" });
    const [first] = facts.income;
    if (first.kind === "private_employment") first.benefits_valuation_complete = "no";
    expect(restore()?.income[0]).toMatchObject({ benefits_valuation_complete: "no" });
  });
});
describe("revision API", () => {
  it("refetches once and retries identical facts with the new revision", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(json(409, { message: "Rules changed", error_code: "RULESET_CHANGED" }))
      .mockResolvedValueOnce(json(200, { success: true, data: config("2026-27", "published-2") }))
      .mockResolvedValueOnce(json(200, { success: true, data: { revision_id: "published-2" } }));
    vi.stubGlobal("fetch", fetchMock);
    const refresh = vi.fn();
    const original = request();
    await expect(calculateWithRevisionRefresh(original, new AbortController().signal, refresh)).resolves.toMatchObject({ revision_id: "published-2" });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[1][0]).not.toContain("assessment_year=");
    const { assessment_year, purpose, ...facts } = original;
    expect(JSON.parse(fetchMock.mock.calls[2][1].body)).toEqual({ ...facts, expected_ruleset_revision: "published-2" });
    expect(fetchMock.mock.calls.every(([, init]) => init.cache === "no-store")).toBe(true);
    expect(refresh).toHaveBeenCalledOnce();
  });
  it("does not loop after a second conflict", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(json(409, { message: "Rules changed", error_code: "RULESET_CHANGED" }))
      .mockResolvedValueOnce(json(200, { success: true, data: config("2026-27", "published-2") }))
      .mockResolvedValueOnce(json(409, { message: "Rules changed again", error_code: "RULESET_CHANGED" }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(calculateWithRevisionRefresh(request(), new AbortController().signal, vi.fn())).rejects.toMatchObject({ code: "RULESET_CHANGED" });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
  it("publishes only the exact preview version with the acknowledgment", async () => {
    const fetchMock = vi.fn().mockResolvedValue(json(200, { success: true, data: {} }));
    vi.stubGlobal("fetch", fetchMock);
    await publishTaxDraft("draft-1", previewFixture.preview, "  reviewed fixture outputs  ", true);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      edit_version: 3, content_hash: "draft-hash", expected_published_revision_id: null,
      change_reason: "reviewed fixture outputs", acknowledge_fixture_deltas: true,
    });
    expect(issueFromError(new BackendApiError("Invalid", 422, "VALIDATION_ERROR", {
      errors: [{ loc: ["body", "income", 0, "private_employment", "amount"], msg: "Invalid amount" }],
    }))).toEqual({ path: "income.0.amount", message: "Invalid amount" });
    expect(issueFromError(new BackendApiError("Invalid", 422, "VALIDATION_ERROR", {
      errors: [{ loc: ["body", "income", 0, "expenses", 0], type: "tax_payment_duplicate", msg: "A payment cannot be entered more than once" }],
    }))).toEqual({ path: "income.0.expenses.0", code: "tax_payment_duplicate", message: "A payment cannot be entered more than once" });
  });
});

