/** @vitest-environment jsdom */
import { afterEach, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { getStockDecisionSupport, getStockWorkspace } from "@/lib/api/stock-details-api";
import { listLatestTraderDecisions } from "@/lib/api/signals-api";
import { listWatchlistItems } from "@/lib/api/watchlist-api";
import { getPortfolioWorkspace } from "@/lib/api/portfolio-api";
import { clearStoredAuthTokens } from "@/lib/api/backend-api-client";
import { EntryApplicabilityLabel } from "@/components/market/entry-applicability-label";
import { ENTRY_NOW, entryFreshness, entryWorkspace } from "@/test-fixtures/current-entry-fixtures";
import { resetMarketFreshnessGenerationForTests, setCurrentMarketFreshness } from "./market-freshness-registry";
import { MARKET_INDEXEDDB_SCHEMA_VERSION } from "./market-indexeddb-cache";
import { frontendConfig } from "@/lib/frontend-config";
import { fenceCurrentEntryPayload } from "./current-entry-contract";
import type { EntryApplicabilityDto } from "@/lib/api/stock-decision-support-types";

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); clearStoredAuthTokens(); resetMarketFreshnessGenerationForTests(); delete (window as unknown as { indexedDB?: unknown }).indexedDB; });

function idb(records: Map<string, unknown>) {
  const database = { close() {}, transaction() {
    const transaction = {} as IDBTransaction;
    const complete = () => queueMicrotask(() => transaction.oncomplete?.call(transaction, new Event("complete")));
    Object.assign(transaction, { objectStore: () => ({
      get(key: string) { const request = { result: records.get(key) } as IDBRequest; queueMicrotask(() => { request.onsuccess?.call(request, new Event("success")); complete(); }); return request; },
      put(payload: { cacheKey: string }) { records.set(payload.cacheKey, payload); complete(); },
      delete(key: string) { records.delete(key); complete(); },
    }) }); return transaction;
  } } as unknown as IDBDatabase;
  Object.defineProperty(window, "indexedDB", { configurable: true, value: { open() { const request = { result: database } as IDBOpenDBRequest; queueMicrotask(() => request.onsuccess?.call(request, new Event("success"))); return request; } } });
}

it.each(["APPLICABLE", "OUTSIDE_ZONE"])("normal workspace API rejects a persisted expired %s SNAPSHOT before reusing a long-lived cache", async status => {
  vi.useFakeTimers(); vi.setSystemTime(ENTRY_NOW + 61_000); setCurrentMarketFreshness(entryFreshness());
  const data = entryWorkspace();
  const quote = data.display_metrics as Record<string, unknown>, check = data.decision_support.entry_applicability as Record<string, unknown>;
  delete quote.source_observed_at; delete check.source_observed_at;
  Object.assign(quote, { batch_fetched_at: "2026-11-11T05:00:00Z", session_date_verified: true });
  Object.assign(check, { price_basis: "SNAPSHOT", batch_fetched_at: quote.batch_fetched_at, status, reason_code: status === "APPLICABLE" ? "ENTRY_TERMS_MET" : "ABOVE_ENTRY_ZONE" });
  const url = `${frontendConfig.apiBaseUrl}/stock-details/DSE/TEST/workspace?entry_contract=price-basis-v2`;
  const records = new Map([[url, { cacheKey: url, data: JSON.parse(JSON.stringify(data)), scope: "market", marketSchemaVersion: MARKET_INDEXEDDB_SCHEMA_VERSION, expiresAt: ENTRY_NOW + 600_000 }]]); idb(records);
  const fresh = structuredClone(data); fresh.decision_support.entry_applicability.status = "UNVERIFIED";
  const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ success: true, data: fresh }), { status: 200 })); vi.stubGlobal("fetch", fetcher);
  const result = await getStockWorkspace("DSE", "TEST");
  expect(fetcher).toHaveBeenCalledTimes(1); expect(fetcher.mock.calls[0][0]).toBe(url);
  expect(result.decision_support.entry_applicability?.status).toBe("UNVERIFIED");
  expect(fenceCurrentEntryPayload(result, entryFreshness()).decision_support.entry_applicability).toBeNull();
});

it.each(["APPLICABLE", "OUTSIDE_ZONE"])("bare support/private list clients retain legacy requests and cannot reuse a v2 %s cache", async status => {
  const check = { ...entryWorkspace().decision_support.entry_applicability, price_basis: "SNAPSHOT", status, batch_fetched_at: "2026-11-11T04:00:00Z" };
  const records = new Map<string, unknown>();
  const legacy = { status: "UNVERIFIED", reason_code: "QUOTE_UNUSABLE" };
  const fixtures = [
    { path: "/stock-details/DSE/TEST/decision-support", query: "", call: () => getStockDecisionSupport("DSE", "TEST"), shape: (assessment: unknown) => ({ stock_id: "stock-1", entry_applicability: assessment }) },
    { path: "/signals/decisions/latest", query: "exchange=DSE&limit=500&offset=0&", call: () => listLatestTraderDecisions(), shape: (assessment: unknown) => [{ stock_id: "stock-1", entry_applicability: assessment }] },
    { path: "/watchlist/items", query: "holding_only=false&limit=500&offset=0&", call: () => listWatchlistItems(), shape: (assessment: unknown) => [{ stock: { id: "stock-1" }, trader_decision: { entry_applicability: assessment } }] },
    { path: "/portfolio/workspace", query: "exchange=DSE&", call: () => getPortfolioWorkspace(), shape: (assessment: unknown) => ({ holdings: [{ trader_decision: { entry_applicability: assessment } }] }) },
  ];
  for (const fixture of fixtures) { const cacheKey = `${frontendConfig.apiBaseUrl}${fixture.path}?${fixture.query}entry_contract=price-basis-v2`; records.set(cacheKey, { cacheKey, scope: "market", marketSchemaVersion: MARKET_INDEXEDDB_SCHEMA_VERSION, expiresAt: Date.now() + 600_000, data: fixture.shape(check) }); }
  idb(records);
  const fetcher = vi.fn((url: string) => { const fixture = fixtures.find(item => new URL(url).pathname.endsWith(item.path))!; return Promise.resolve(new Response(JSON.stringify({ success: true, data: fixture.shape(legacy) }), { status: 200 })); }); vi.stubGlobal("fetch", fetcher);
  for (const fixture of fixtures) expect(await fixture.call()).toEqual(fixture.shape(legacy));
  expect(fetcher).toHaveBeenCalledTimes(4);
  for (const [url] of fetcher.mock.calls) expect(new URL(url).searchParams.has("entry_contract")).toBe(false);
});

it.each(["en", "bn"] as const)("keeps stale/null evidence neutral and distinguishes legacy market close from missing time (%s)", locale => {
  const label = (assessment: Parameters<typeof EntryApplicabilityLabel>[0]["assessment"]) => renderToStaticMarkup(<EntryApplicabilityLabel assessment={assessment} locale={locale} />);
  const stale = entryWorkspace(); Object.assign(stale.decision_support.entry_applicability, { status: "UNVERIFIED", reason_code: "QUOTE_UNUSABLE", price_basis: "SNAPSHOT", batch_fetched_at: "2026-11-11T04:59:00Z" });
  const fenced = fenceCurrentEntryPayload(stale, entryFreshness(), ENTRY_NOW).decision_support.entry_applicability as EntryApplicabilityDto | null;
  expect(fenced).toBeNull();
  expect(label(fenced)).toContain(locale === "en" ? "current entry check is unavailable" : "বর্তমান entry যাচাই করা যাচ্ছে না");
  expect(label(fenced)).not.toContain(locale === "en" ? "time of this price is unknown" : "দামটি কখনের");
  expect(label({ status: "UNVERIFIED", reason_code: "MARKET_CLOSED" })).toContain(locale === "en" ? "market is closed" : "বাজার বন্ধ");
  expect(label({ status: "UNVERIFIED", reason_code: "QUOTE_UNUSABLE" })).toContain(locale === "en" ? "time of this price is unknown" : "দামটি কখনের");
  expect(label({ status: "UNVERIFIED", reason_code: "SESSION_SETTLING" })).toContain(locale === "en" ? "Closing price pending" : "Closing price-এর অপেক্ষায়");
});
