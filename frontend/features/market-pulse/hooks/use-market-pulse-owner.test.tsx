/** @vitest-environment jsdom */
import { type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useMarketPulse } from "./use-market-pulse";
import { buildPulseSummaryQueryKey, PULSE_ANONYMOUS_SUMMARY_QUERY_KEY } from "@/lib/market/pulse-query-keys";
import { ENTRY_NOW, entryFreshness, entryWorkspace } from "@/test-fixtures/current-entry-fixtures";
import { order4SurfaceFixture } from "@/test-fixtures/order4-surface-fixtures";
import type { BackendMarketPulseSummaryDto } from "@/lib/api/market-pulse-api";

const requests = vi.hoisted(() => ({ summary: vi.fn(), freshness: vi.fn() }));
vi.mock("@/features/auth/context/auth-context", () => ({ useAuth: () => ({ user: { display_name: "Alex" }, isAuthenticated: true }) }));
vi.mock("@/features/market-pulse/lib/market-pulse-storage", () => ({ readMarketPulseSnapshot: () => ({ lastSyncedAt: null, scoreVersion: null, decisionTaxonomyVersion: null, focusStockIds: [], scores: {}, recommendations: {}, alertIds: [] }), writeMarketPulseSnapshot: vi.fn() }));
vi.mock("@/lib/api/market-pulse-api", () => ({ getMarketPulseSummary: (...args: unknown[]) => requests.summary(...args), getMarketPulseBriefing: async () => null }));
vi.mock("@/lib/api/market-data-api", () => ({ getMarketFreshness: () => requests.freshness() }));
afterEach(() => { cleanup(); vi.useRealTimers(); vi.resetAllMocks(); });

it.each(["anonymous", "personalized"] as const)("refreshes the selected %s owner and cannot reopen on unrelated success", async (selected) => {
  vi.useFakeTimers(); vi.setSystemTime(ENTRY_NOW);
  const pulse = order4SurfaceFixture().pulse;
  for (const stock of [...pulse.focus_stocks, ...pulse.monitor_candidates]) {
    stock.entry_applicability = { ...entryWorkspace().decision_support.entry_applicability } as never;
    stock.display_quote!.current_price = 100;
  }
  const current = pulse as unknown as BackendMarketPulseSummaryDto;
  const incompatible = { ...current, decision_generation_id: "different-publication", market_sync_id: "different-publication" };
  const anonymousKey = PULSE_ANONYMOUS_SUMMARY_QUERY_KEY;
  const personalizedKey = buildPulseSummaryQueryKey({ exchange: "DSE", displayName: "Alex", previousSnapshot: null });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  client.setQueryData(["market-freshness", "DSE"], entryFreshness());
  client.setQueryData(anonymousKey, selected === "anonymous" ? current : incompatible);
  client.setQueryData(personalizedKey, selected === "personalized" ? current : incompatible);
  let finishOwner!: (value: BackendMarketPulseSummaryDto) => void;
  const pending = new Promise<BackendMarketPulseSummaryDto>((resolve) => { finishOwner = resolve; });
  requests.summary.mockImplementation((params: { displayName?: string | null }) => {
    const requested = params.displayName ? "personalized" : "anonymous";
    return requested === selected ? pending : Promise.resolve(incompatible);
  });
  requests.freshness.mockResolvedValue(entryFreshness());
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  const hook = renderHook(() => useMarketPulse({ locale: "en" }), { wrapper });
  expect(hook.result.current.model?.focusStocks[0].entryApplicability?.status).toBe("APPLICABLE");
  await act(async () => { window.dispatchEvent(new Event("focus")); await vi.advanceTimersByTimeAsync(5); });
  expect(requests.summary).toHaveBeenCalledTimes(1);
  expect(Boolean(requests.summary.mock.calls[0][0].displayName)).toBe(selected === "personalized");
  expect(hook.result.current.model?.focusStocks[0].entryApplicability).toBeNull();
  await act(async () => {
    client.setQueryData(selected === "anonymous" ? personalizedKey : anonymousKey, { ...incompatible });
    await vi.advanceTimersByTimeAsync(5);
  });
  expect(hook.result.current.model?.focusStocks[0].entryApplicability).toBeNull();
  await act(async () => { finishOwner(current); await vi.advanceTimersByTimeAsync(5); });
  expect(hook.result.current.model?.focusStocks[0].entryApplicability?.status).toBe("APPLICABLE");
  expect(requests.freshness).toHaveBeenCalledTimes(1);
});

it.each(["incompatible", "failed"] as const)("keeps a resumed claim fenced when personalized %s refresh falls back to cached anonymous", async (outcome) => {
  vi.useFakeTimers(); vi.setSystemTime(ENTRY_NOW);
  const pulse = order4SurfaceFixture().pulse;
  for (const stock of [...pulse.focus_stocks, ...pulse.monitor_candidates]) {
    stock.entry_applicability = { ...entryWorkspace().decision_support.entry_applicability } as never;
    stock.display_quote!.current_price = 100;
  }
  const current = pulse as unknown as BackendMarketPulseSummaryDto;
  const personalized = { ...current, hero: { ...current.hero, greeting: "Hello, Alex" } };
  const incompatible = { ...current, decision_generation_id: "different-publication", market_sync_id: "different-publication" };
  const anonymousKey = PULSE_ANONYMOUS_SUMMARY_QUERY_KEY;
  const personalizedKey = buildPulseSummaryQueryKey({ exchange: "DSE", displayName: "Alex", previousSnapshot: null });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  client.setQueryData(["market-freshness", "DSE"], entryFreshness());
  client.setQueryData(anonymousKey, current); client.setQueryData(personalizedKey, personalized);
  let finishPersonal!: (value: BackendMarketPulseSummaryDto) => void;
  let failPersonal!: (error: Error) => void;
  let finishAnonymous!: (value: BackendMarketPulseSummaryDto) => void;
  const pendingPersonal = new Promise<BackendMarketPulseSummaryDto>((resolve, reject) => { finishPersonal = resolve; failPersonal = reject; });
  const pendingAnonymous = new Promise<BackendMarketPulseSummaryDto>((resolve) => { finishAnonymous = resolve; });
  requests.summary.mockImplementation((params: { displayName?: string | null }) => params.displayName ? pendingPersonal : pendingAnonymous);
  requests.freshness.mockResolvedValue(entryFreshness());
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  const hook = renderHook(() => useMarketPulse({ locale: "en" }), { wrapper });
  expect(hook.result.current.model?.hero.greeting).toBe("Hello, Alex");
  expect(hook.result.current.model?.focusStocks[0].entryApplicability?.status).toBe("APPLICABLE");
  await act(async () => { window.dispatchEvent(new Event("focus")); await vi.advanceTimersByTimeAsync(5); });
  expect(requests.summary).toHaveBeenCalledTimes(1);
  await act(async () => {
    if (outcome === "incompatible") finishPersonal(incompatible); else failPersonal(new Error("Offline refresh"));
    await vi.advanceTimersByTimeAsync(15);
  });
  expect(hook.result.current.model?.hero.greeting).toBe("Hello");
  expect(requests.summary.mock.calls.filter(([params]) => !params.displayName)).toHaveLength(1);
  expect(hook.result.current.model?.focusStocks[0].entryApplicability).toBeNull();
  expect(hook.result.current.model?.monitorCandidates[0].entryApplicability).toBeNull();
  await act(async () => { client.setQueryData(personalizedKey, { ...incompatible }); await vi.advanceTimersByTimeAsync(5); });
  expect(hook.result.current.model?.focusStocks[0].entryApplicability).toBeNull();
  await act(async () => { finishAnonymous(current); await vi.advanceTimersByTimeAsync(5); });
  expect(hook.result.current.model?.focusStocks[0].entryApplicability?.status).toBe("APPLICABLE");
  expect(hook.result.current.model?.monitorCandidates[0].entryApplicability?.status).toBe("APPLICABLE");
});

it("revalidates a newly selected personalized owner when anonymous was being refreshed", async () => {
  vi.useFakeTimers(); vi.setSystemTime(ENTRY_NOW);
  const pulse = order4SurfaceFixture().pulse;
  for (const stock of [...pulse.focus_stocks, ...pulse.monitor_candidates]) {
    stock.entry_applicability = { ...entryWorkspace().decision_support.entry_applicability } as never;
    stock.display_quote!.current_price = 100;
  }
  const current = pulse as unknown as BackendMarketPulseSummaryDto;
  const incompatible = { ...current, decision_generation_id: "different-publication", market_sync_id: "different-publication" };
  const personalized = { ...current, hero: { ...current.hero, greeting: "Hello, Alex" } };
  const personalizedKey = buildPulseSummaryQueryKey({ exchange: "DSE", displayName: "Alex", previousSnapshot: null });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  client.setQueryData(["market-freshness", "DSE"], entryFreshness());
  client.setQueryData(PULSE_ANONYMOUS_SUMMARY_QUERY_KEY, current); client.setQueryData(personalizedKey, incompatible);
  let finishAnonymous!: (value: BackendMarketPulseSummaryDto) => void;
  let finishPersonal!: (value: BackendMarketPulseSummaryDto) => void;
  const anonymousPending = new Promise<BackendMarketPulseSummaryDto>((resolve) => { finishAnonymous = resolve; });
  const personalPending = new Promise<BackendMarketPulseSummaryDto>((resolve) => { finishPersonal = resolve; });
  let personalReads = 0;
  requests.summary.mockImplementation((params: { displayName?: string | null }) => {
    if (!params.displayName) return anonymousPending;
    personalReads += 1; return personalReads === 1 ? Promise.resolve(personalized) : personalPending;
  });
  requests.freshness.mockResolvedValue(entryFreshness());
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  const hook = renderHook(() => useMarketPulse({ locale: "en" }), { wrapper });
  await act(async () => { window.dispatchEvent(new Event("focus")); await vi.advanceTimersByTimeAsync(5); });
  await act(async () => { void client.refetchQueries({ queryKey: personalizedKey, exact: true }); await vi.advanceTimersByTimeAsync(15); });
  expect(hook.result.current.model?.hero.greeting).toBe("Hello, Alex");
  expect(personalReads).toBe(2);
  expect(hook.result.current.model?.focusStocks[0].entryApplicability).toBeNull();
  await act(async () => { finishPersonal(personalized); await vi.advanceTimersByTimeAsync(5); });
  expect(hook.result.current.model?.focusStocks[0].entryApplicability?.status).toBe("APPLICABLE");
  await act(async () => { finishAnonymous(incompatible); await vi.advanceTimersByTimeAsync(5); });
  expect(hook.result.current.model?.hero.greeting).toBe("Hello, Alex");
});
