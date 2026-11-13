import { afterEach, describe, expect, it, vi } from "vitest";
import { earliestCurrentEntryDeadline, expiredCurrentEntryKeys, fenceCurrentEntryPayload, hasUnusablePositiveEntry } from "./current-entry-contract";
import { evaluateMarketIndexedDbEntry, MARKET_INDEXEDDB_SCHEMA_VERSION } from "./market-indexeddb-cache";
import { resetMarketFreshnessGenerationForTests, setCurrentMarketFreshness } from "./market-freshness-registry";
import { ENTRY_NOW, entryFreshness, entryUniverse, entryWorkspace } from "@/test-fixtures/current-entry-fixtures";

afterEach(() => { vi.useRealTimers(); resetMarketFreshnessGenerationForTests(); });

describe("source-bounded current entry contract", () => {
  it("accepts the deployed freshness contract where market_sync_id owns the quote generation", () => {
    expect(fenceCurrentEntryPayload(entryWorkspace(), entryFreshness({ quote_generation_id: undefined }), ENTRY_NOW).decision_support.entry_applicability?.status).toBe("APPLICABLE");
  });
  it("retains the immutable dated thesis while a positive ages out with identical IDs", () => {
    vi.useFakeTimers(); vi.setSystemTime(ENTRY_NOW);
    const data = entryWorkspace();
    expect(fenceCurrentEntryPayload(data, entryFreshness()).decision_support.entry_applicability?.status).toBe("APPLICABLE");
    vi.advanceTimersByTime(60_000);
    const expired = fenceCurrentEntryPayload(data, entryFreshness());
    expect(expired.decision_support.entry_applicability).toBeNull();
    expect(expired.decision_support.trade_plan).toEqual(data.decision_support.trade_plan);
    expect(expired.decision_support.decision.display_action).toBe("POTENTIAL_BUY");
    expect(data.decision_support.entry_applicability.status).toBe("APPLICABLE");
  });
  it("uses configured exchange close even when source max age extends past it", () => {
    const data = entryWorkspace("2026-11-11T08:59:30Z", 1800);
    expect(earliestCurrentEntryDeadline(data, entryFreshness(), ENTRY_NOW)).toBe(Date.parse("2026-11-11T09:00:00Z"));
    expect(hasUnusablePositiveEntry(data, entryFreshness(), Date.parse("2026-11-11T09:00:00Z"))).toBe(true);
  });
  it.each(["missing freshness", "missing quote stamp", "updating", "unavailable", "wrong exchange", "wrong symbol", "missing source", "future assessment", "date-only assessment", "wrong session", "unknown taxonomy", "non-entry action"])("suppresses %s instead of inventing server UNVERIFIED", (caseName) => {
    const data = entryWorkspace(); const freshness = entryFreshness();
    if (caseName === "missing quote stamp") data.quote_generation_id = "";
    if (caseName === "updating") freshness.decision_status = "UPDATING";
    if (caseName === "unavailable") freshness.decision_status = "UNAVAILABLE";
    if (caseName === "wrong exchange") freshness.exchange = "CSE";
    if (caseName === "wrong symbol") data.decision_support.symbol = "OTHER";
    if (caseName === "missing source") data.display_metrics.source_observed_at = "";
    if (caseName === "future assessment") data.decision_support.entry_applicability.assessed_at = "2026-11-11T05:01:00Z";
    if (caseName === "date-only assessment") data.decision_support.entry_applicability.assessed_at = "2026-11-11";
    if (caseName === "wrong session") data.decision_support.entry_applicability.quote_session_date = "2026-11-10";
    if (caseName === "unknown taxonomy") data.decision_support.decision.decision_taxonomy_version = "future";
    if (caseName === "non-entry action") data.decision_support.decision.display_action = "WAIT";
    expect(fenceCurrentEntryPayload(data, caseName === "missing freshness" ? undefined : freshness, ENTRY_NOW).decision_support.entry_applicability).toBeNull();
  });
  it("keeps server UNVERIFIED distinct from a client display fallback", () => {
    const data = entryWorkspace(); data.decision_support.entry_applicability.status = "UNVERIFIED";
    data.decision_support.entry_applicability.reason_code = "PATH_INCOMPLETE";
    expect(fenceCurrentEntryPayload(data, entryFreshness(), ENTRY_NOW).decision_support.entry_applicability?.reason_code).toBe("PATH_INCOMPLETE");
    expect(fenceCurrentEntryPayload(data, undefined, ENTRY_NOW).decision_support.entry_applicability).toBeNull();
  });
  it("bounds a shared list by the earliest positive and sanitizes both row and summary", () => {
    const data = entryUniverse(); const second = structuredClone(data.rows[0]);
    second.display_quote.max_age_seconds = 30; data.rows.push(second);
    expect(earliestCurrentEntryDeadline(data, entryFreshness(), ENTRY_NOW)).toBe(ENTRY_NOW + 30_000);
    const fenced = fenceCurrentEntryPayload(data, entryFreshness(), ENTRY_NOW + 30_000);
    expect(fenced.rows[0].entry_applicability?.status).toBe("APPLICABLE");
    expect(fenced.rows[1].entry_applicability).toBeNull();
    expect(fenced.rows[1].decision.entry_applicability).toBeNull();
  });
  it("rejects a warm IDB positive across age and close despite unchanged generation and long cache TTL", () => {
    vi.useFakeTimers(); vi.setSystemTime(ENTRY_NOW); setCurrentMarketFreshness(entryFreshness());
    const entry = { cacheKey: "/stock-details/DSE/TEST/workspace", expiresAt: ENTRY_NOW + 3600_000, scope: "market" as const, marketSchemaVersion: MARKET_INDEXEDDB_SCHEMA_VERSION, data: entryWorkspace() };
    const options = { expectedScope: "market" as const, freshnessLastSyncedAt: "quote-1|decision-1|CURRENT", requireGeneration: true };
    expect(evaluateMarketIndexedDbEntry(entry, options).status).toBe("hit");
    vi.advanceTimersByTime(60_000);
    expect(evaluateMarketIndexedDbEntry(entry, options)).toEqual({ status: "miss", reason: "expired" });
    const late = { ...entry, data: entryWorkspace("2026-11-11T08:59:30Z", 1800), expiresAt: Date.parse("2026-11-11T10:00:00Z") };
    vi.setSystemTime(Date.parse("2026-11-11T09:00:00Z"));
    expect(evaluateMarketIndexedDbEntry(late, options)).toEqual({ status: "miss", reason: "expired" });
  });
});


describe("contradiction and withdrawn-publication fencing", () => {
  it.each(["canonical stock", "canonical exchange", "requested symbol", "observation session", "nested generation"])("rejects a contradicted %s while preserving the dated plan", (contradiction) => {
    const data = entryWorkspace() as ReturnType<typeof entryWorkspace> & { decision_support: { decision: { canonical?: Record<string, string> } } };
    if (contradiction === "canonical stock") data.decision_support.decision.canonical = { stock_id: "OTHER", exchange: "DSE" };
    if (contradiction === "canonical exchange") data.decision_support.decision.canonical = { stock_id: "stock-1", exchange: "CSE" };
    if (contradiction === "observation session") data.display_metrics.observation_session_date = "2026-11-10";
    if (contradiction === "nested generation") data.decision_support.decision_generation_id = "other-plan";
    const result = fenceCurrentEntryPayload(data, entryFreshness(), ENTRY_NOW, { symbol: contradiction === "requested symbol" ? "OTHER" : "TEST", exchange: "DSE" });
    expect(result.decision_support.entry_applicability).toBeNull();
    expect(result.decision_support.trade_plan).toEqual(data.decision_support.trade_plan);
  });
  it("retains only an identified dated withdrawal when freshness has no current decision ID", () => {
    const data = entryWorkspace(); data.decision_status = data.decision_support.decision_status = "UPDATING";
    data.decision_support.entry_applicability.status = "INVALIDATED";
    data.decision_support.entry_applicability.reason_code = "PUBLICATION_INVALIDATED";
    const freshness = entryFreshness({ decision_status: "UNAVAILABLE", decision_generation_id: null });
    expect(fenceCurrentEntryPayload(data, freshness, ENTRY_NOW).decision_support.entry_applicability?.reason_code).toBe("PUBLICATION_INVALIDATED");
    data.decision_support.decision_generation_id = "unrelated-plan";
    expect(fenceCurrentEntryPayload(data, freshness, ENTRY_NOW).decision_support.entry_applicability).toBeNull();
    data.decision_support.decision_generation_id = data.decision_generation_id;
    data.decision_support.entry_applicability.reason_code = "STOP_BREACHED";
    expect(fenceCurrentEntryPayload(data, freshness, ENTRY_NOW).decision_support.entry_applicability).toBeNull();
  });
});


describe("exact-generation withdrawn publication", () => {
  it("retains CURRENT workspace withdrawal against UNAVAILABLE freshness with null decision ID", () => {
    const data = entryWorkspace();
    data.decision_support.entry_applicability.status = "INVALIDATED";
    data.decision_support.entry_applicability.reason_code = "PUBLICATION_INVALIDATED";
    const freshness = entryFreshness({ decision_status: "UNAVAILABLE", decision_generation_id: null });
    const result = fenceCurrentEntryPayload(data, freshness, ENTRY_NOW, { symbol: "TEST", exchange: "DSE" });
    expect(result.decision_support.entry_applicability?.reason_code).toBe("PUBLICATION_INVALIDATED");
    expect(result.decision_support.decision.display_action).toBe("POTENTIAL_BUY");
    expect(result.decision_support.trade_plan).toEqual(data.decision_support.trade_plan);
    data.decision_support.decision_generation_id = "unrelated-plan";
    expect(fenceCurrentEntryPayload(data, freshness, ENTRY_NOW).decision_support.entry_applicability).toBeNull();
    data.decision_support.decision_generation_id = data.decision_generation_id;
    data.decision_support.entry_applicability.reason_code = "STOP_BREACHED";
    expect(fenceCurrentEntryPayload(data, freshness, ENTRY_NOW).decision_support.entry_applicability).toBeNull();
  });
  it("retains CURRENT list withdrawal only with the matching dated instrument and quote envelope", () => {
    const universe = entryUniverse();
    const data = { ...universe, meta: { ...universe.meta, decision_session_date: "2026-11-10" } };
    data.rows[0].entry_applicability.status = "INVALIDATED";
    data.rows[0].entry_applicability.reason_code = "PUBLICATION_INVALIDATED";
    const freshness = entryFreshness({ decision_status: "UNAVAILABLE", decision_generation_id: null });
    const result = fenceCurrentEntryPayload(data, freshness, ENTRY_NOW);
    expect(result.rows[0].entry_applicability?.reason_code).toBe("PUBLICATION_INVALIDATED");
    expect(result.rows[0].decision.entry_applicability?.reason_code).toBe("PUBLICATION_INVALIDATED");
    data.meta.quote_generation_id = "unrelated-quote";
    expect(fenceCurrentEntryPayload(data, freshness, ENTRY_NOW).rows[0].entry_applicability).toBeNull();
    data.meta.quote_generation_id = "quote-1";
    data.rows[0].entry_applicability.reason_code = "STOP_BREACHED";
    expect(fenceCurrentEntryPayload(data, freshness, ENTRY_NOW).rows[0].entry_applicability).toBeNull();
    data.rows[0].entry_applicability.status = "APPLICABLE";
    data.rows[0].entry_applicability.reason_code = "ENTRY_TERMS_MET";
    expect(fenceCurrentEntryPayload(data, freshness, ENTRY_NOW).rows[0].entry_applicability).toBeNull();
  });
});


describe("Pulse current-entry ownership", () => {
  it("bounds focus and monitor independently using quote_generation_id rather than decision-stamped market_sync_id", async () => {
    const { order4SurfaceFixture } = await import("@/test-fixtures/order4-surface-fixtures");
    const pulse = order4SurfaceFixture().pulse;
    for (const stock of [...pulse.focus_stocks, ...pulse.monitor_candidates]) {
      stock.entry_applicability = { ...entryWorkspace().decision_support.entry_applicability } as never;
    }
    pulse.monitor_candidates = [structuredClone(pulse.monitor_candidates[0])];
    pulse.monitor_candidates[0].display_quote!.max_age_seconds = 120;
    const fresh = entryFreshness();
    expect(fenceCurrentEntryPayload(pulse, fresh, ENTRY_NOW).focus_stocks[0].entry_applicability?.status).toBe("APPLICABLE");
    const aged = fenceCurrentEntryPayload(pulse, fresh, ENTRY_NOW + 70_000);
    expect(aged.focus_stocks[0].entry_applicability).toBeNull();
    expect(aged.monitor_candidates[0].entry_applicability?.status).toBe("APPLICABLE");
    pulse.quote_generation_id = undefined;
    expect(fenceCurrentEntryPayload(pulse, fresh, ENTRY_NOW).monitor_candidates[0].entry_applicability).toBeNull();
  });
});


it("retains an eligible closing assessment overnight and expires it at opening", () => {
  const data = entryWorkspace("2026-11-11T08:59:00Z",1800);
  data.display_metrics.observation_status = "FINALIZED";
  const now = Date.parse("2026-11-11T16:00:00Z");
  const deadline = Date.parse("2026-11-12T04:00:00Z");
  Object.assign(data.decision_support.entry_applicability, { price_basis:"LAST_CLOSE", assessed_at:new Date(now).toISOString(),recheck_at:new Date(deadline).toISOString() });
  const closed = entryFreshness({market_status:"POST_CLOSE"});
  expect(fenceCurrentEntryPayload(data,closed,now).decision_support.entry_applicability?.status).toBe("APPLICABLE");
  expect(earliestCurrentEntryDeadline(data,closed,now)).toBe(deadline);
  expect(expiredCurrentEntryKeys(data,closed,deadline)).toHaveLength(1);
  expect(fenceCurrentEntryPayload(data,closed,deadline).decision_support.entry_applicability).toBeNull();
  expect(fenceCurrentEntryPayload(data,entryFreshness(),now).decision_support.entry_applicability).toBeNull();
});


it("requires an observation from the opened session, including an override", () => {
  const data = entryWorkspace("2026-11-11T05:00:00Z", 1800);
  const time = Date.parse("2026-11-11T05:00:00Z");
  expect(fenceCurrentEntryPayload(data, entryFreshness({market_open_time:"11:00"}), time).decision_support.entry_applicability?.status).toBe("APPLICABLE");
  expect(fenceCurrentEntryPayload(data, entryFreshness({market_open_time:"11:01"}), time).decision_support.entry_applicability).toBeNull();
});


it.each(["OUTSIDE_ZONE", "AWAITING_CONFIRMATION", "UNVERIFIED"])("retires closing %s evidence at opening", status => {
  const now = Date.parse("2026-11-11T10:00:00Z");
  const data = entryWorkspace("2026-11-11T08:59:00Z", 1800); const deadline = Date.parse("2026-11-12T04:00:00Z");
  data.display_metrics.observation_status = "FINALIZED";
  Object.assign(data.decision_support.entry_applicability, {status,price_basis:"LAST_CLOSE",assessed_at:new Date(now).toISOString(),recheck_at:new Date(deadline).toISOString()});
  const closed = entryFreshness({market_status:"POST_CLOSE"});
  expect(fenceCurrentEntryPayload(data,closed,now).decision_support.entry_applicability?.status).toBe(status);
  expect(earliestCurrentEntryDeadline(data,closed,now)).toBe(deadline);
  expect(fenceCurrentEntryPayload(data,closed,deadline).decision_support.entry_applicability).toBeNull();
  expect(fenceCurrentEntryPayload(data,entryFreshness(),now).decision_support.entry_applicability).toBeNull();
});

it("rejects a closing approval paired with a morning quote", () => {
  const data = entryWorkspace();
  Object.assign(data.decision_support.entry_applicability,{price_basis:"LAST_CLOSE",recheck_at:new Date(ENTRY_NOW+120_000).toISOString()});
  expect(fenceCurrentEntryPayload(data,entryFreshness({market_status:"POST_CLOSE"}),ENTRY_NOW).decision_support.entry_applicability).toBeNull();
});
