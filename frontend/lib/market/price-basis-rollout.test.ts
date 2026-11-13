import { afterEach, describe, expect, it, vi } from "vitest";
import { ENTRY_NOW, entryFreshness, entryWorkspace } from "@/test-fixtures/current-entry-fixtures";
import { earliestCurrentEntryDeadline, expiredCurrentEntryKeys, fenceCurrentEntryPayload } from "./current-entry-contract";
import { evaluateMarketIndexedDbEntry, MARKET_INDEXEDDB_SCHEMA_VERSION } from "./market-indexeddb-cache";
import { resetMarketFreshnessGenerationForTests, setCurrentMarketFreshness } from "./market-freshness-registry";
import { backendApiGet, clearStoredAuthTokens } from "@/lib/api/backend-api-client";
import { fetchServerMarketApiNoStore } from "@/lib/api/server-market-api";
import { loadStockWorkspace } from "@/lib/api/stock-detail-server";
import { entryContractParams, PRICE_BASIS_CONTRACT } from "./entry-contract-capability";

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); clearStoredAuthTokens(); resetMarketFreshnessGenerationForTests(); });

function snapshot(status = "APPLICABLE") {
  const data = entryWorkspace();
  const quote = data.display_metrics as Record<string, unknown>;
  const check = data.decision_support.entry_applicability as Record<string, unknown>;
  delete quote.source_observed_at; delete check.source_observed_at;
  Object.assign(quote, { batch_fetched_at: "2026-11-11T05:00:00Z", session_date_verified: true });
  Object.assign(check, { price_basis: "SNAPSHOT", batch_fetched_at: quote.batch_fetched_at, status,
    reason_code: status === "APPLICABLE" ? "ENTRY_TERMS_MET" : "ABOVE_ENTRY_ZONE" });
  return data;
}

describe("price basis rollout evidence fences", () => {
  it.each(["APPLICABLE", "OUTSIDE_ZONE", "AWAITING_CONFIRMATION"])("expires %s SNAPSHOT by receipt age and rejects warm IDB reuse", status => {
    vi.useFakeTimers(); vi.setSystemTime(ENTRY_NOW);
    const data = snapshot(status), freshness = entryFreshness(); setCurrentMarketFreshness(freshness);
    expect(fenceCurrentEntryPayload(data, freshness).decision_support.entry_applicability?.status).toBe(status);
    expect(earliestCurrentEntryDeadline(data, freshness)).toBe(ENTRY_NOW + 60_000);
    const cached = { cacheKey: "/stock-details/DSE/TEST/workspace?entry_contract=price-basis-v2", data, scope: "market" as const,
      marketSchemaVersion: MARKET_INDEXEDDB_SCHEMA_VERSION, expiresAt: ENTRY_NOW + 600_000 };
    expect(evaluateMarketIndexedDbEntry(cached).status).toBe("hit");
    vi.advanceTimersByTime(60_000);
    expect(fenceCurrentEntryPayload(data, freshness).decision_support.entry_applicability).toBeNull();
    expect(evaluateMarketIndexedDbEntry(cached)).toEqual({ status: "miss", reason: "expired" });
    expect(expiredCurrentEntryKeys(data, freshness)).toHaveLength(1);
    expect(data.decision_support.trade_plan.stop_loss).toBe(94);
  });
  it.each(["missing basis", "unknown basis", "missing session proof", "bad source", "previous session receipt"])("fails closed for %s", kind => {
    const data = snapshot(), check = data.decision_support.entry_applicability as Record<string, unknown>;
    const quote = data.display_metrics as Record<string, unknown>;
    if (kind === "missing basis") delete check.price_basis;
    if (kind === "unknown basis") check.price_basis = "FUTURE";
    if (kind === "missing session proof") delete quote.session_date_verified;
    if (kind === "bad source") quote.source_observed_at = "bad-clock";
    if (kind === "previous session receipt") quote.batch_fetched_at = check.batch_fetched_at = "2026-11-10T05:00:00Z";
    expect(fenceCurrentEntryPayload(data, entryFreshness(), ENTRY_NOW).decision_support.entry_applicability).toBeNull();
  });
  it.each(["APPLICABLE", "OUTSIDE_ZONE"])("retains clock-free finalized LAST_CLOSE %s through the weekend, then fences reopening", status => {
    const data = entryWorkspace(), check = data.decision_support.entry_applicability as Record<string, unknown>;
    const quote = data.display_metrics as Record<string, unknown>;
    delete quote.source_observed_at; delete check.source_observed_at;
    Object.assign(quote, { observation_status: "FINALIZED" });
    Object.assign(check, { status, price_basis: "LAST_CLOSE", assessed_at: "2026-11-11T10:00:00Z", recheck_at: "2026-11-15T04:00:00Z" });
    const freshness = entryFreshness({ market_status: "HOLIDAY" });
    expect(fenceCurrentEntryPayload(data, freshness, Date.parse("2026-11-13T10:00:00Z")).decision_support.entry_applicability?.status).toBe(status);
    expect(fenceCurrentEntryPayload(data, freshness, Date.parse("2026-11-15T04:00:00Z")).decision_support.entry_applicability).toBeNull();
    expect(fenceCurrentEntryPayload(data, entryFreshness({ market_status: "OPEN" }), Date.parse("2026-11-15T04:00:00Z")).decision_support.entry_applicability).toBeNull();
  });
});

describe("normal browser and server opt-in entrypoints", () => {
  it.each(["/market/universe-rows", "/market/pulse", "/market/pulse/summary", "/market/pulse/briefing", "/stock-details/DSE/TEST/workspace"])("opts in %s before building its browser cache URL", async path => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ success: true, data: { marker: path } }), { status: 200 })); vi.stubGlobal("fetch", fetcher);
    await backendApiGet(path, { exchange: "DSE" }, undefined, "off");
    const url = new URL(fetcher.mock.calls[0][0]);
    expect(url.searchParams.get("entry_contract")).toBe(PRICE_BASIS_CONTRACT);
    expect(entryContractParams("/market/freshness", { exchange: "DSE" })).toEqual({ exchange: "DSE" });
  });
  it("uses the same capability in server market URLs", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ success: true, data: { marker: "summary" } }), { status: 200 })); vi.stubGlobal("fetch", fetcher);
    await fetchServerMarketApiNoStore("/market/pulse/summary", { params: { exchange: "DSE" } });
    expect(new URL(fetcher.mock.calls[0][0]).searchParams.get("entry_contract")).toBe(PRICE_BASIS_CONTRACT);
    expect(fetcher.mock.calls[0][1]).toMatchObject({ cache: "no-store" });
  });
  it("fences a stale server-rendered workspace while keeping the dated plan", async () => {
    vi.useFakeTimers(); vi.setSystemTime(ENTRY_NOW + 61_000);
    const data = snapshot(); const fetcher = vi.fn((url: string) => Promise.resolve(new Response(JSON.stringify({ success: true,
      data: new URL(url).pathname.endsWith("/freshness") ? entryFreshness() : data }), { status: 200 }))); vi.stubGlobal("fetch", fetcher);
    const result = await loadStockWorkspace("DSE", "test");
    expect(new URL(fetcher.mock.calls[0][0]).searchParams.get("entry_contract")).toBe(PRICE_BASIS_CONTRACT);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(result.status).toBe("ok");
    if (result.status === "ok") { expect(result.data.decision_support.entry_applicability).toBeNull(); expect(result.data.decision_support.trade_plan.stop_loss).toBe(94); }
  });
});
