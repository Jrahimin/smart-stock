/** @vitest-environment jsdom */
import { onlineManager, QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { act, cleanup, renderHook } from "@testing-library/react";
import { type ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useCurrentEntryBoundary } from "./use-current-entry-boundary";
import { ENTRY_NOW, entryFreshness, entryWorkspace, entryUniverse } from "@/test-fixtures/current-entry-fixtures";

afterEach(() => { cleanup(); onlineManager.setOnline(true); vi.useRealTimers(); vi.restoreAllMocks(); });
function setup(data = entryWorkspace()) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  const network = vi.fn(async () => { throw new Error("Offline"); });
  const key = ["stock-workspace", "DSE", "TEST", "same-ids"];
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  const hook = renderHook(({ payload }) => {
    useQuery({ queryKey: key, queryFn: network, initialData: data, staleTime: Infinity });
    const freshness = useQuery({ queryKey: ["market-freshness", "DSE"], queryFn: async () => entryFreshness(), initialData: entryFreshness(), staleTime: Infinity });
    return useCurrentEntryBoundary(payload, freshness.data, key);
  }, { wrapper, initialProps: { payload: data } });
  return { ...hook, network, client };
}

describe("mounted current-entry deadline", () => {
  it("expires a mounted negative SNAPSHOT and keeps it suppressed on resume", async () => {
    vi.useFakeTimers(); vi.setSystemTime(ENTRY_NOW);
    const data = entryWorkspace();
    const quote = data.display_metrics as Record<string, unknown>;
    const check = data.decision_support.entry_applicability as Record<string, unknown>;
    delete quote.source_observed_at; delete check.source_observed_at;
    Object.assign(quote, { session_date_verified: true, batch_fetched_at: "2026-11-11T05:00:00Z" });
    Object.assign(check, { status: "OUTSIDE_ZONE", reason_code: "ABOVE_ENTRY_ZONE", price_basis: "SNAPSHOT", batch_fetched_at: quote.batch_fetched_at });
    const hook = setup(data);
    expect(hook.result.current.decision_support.entry_applicability?.status).toBe("OUTSIDE_ZONE");
    await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
    expect(hook.result.current.decision_support.entry_applicability).toBeNull();
    await act(async () => { window.dispatchEvent(new Event("focus")); });
    expect(hook.result.current.decision_support.entry_applicability).toBeNull();
    expect(hook.result.current.decision_support.trade_plan.stop_loss).toBe(94);
  });
  it("suppresses at source-age boundary and refreshes the owning active query once", async () => {
    vi.useFakeTimers(); vi.setSystemTime(ENTRY_NOW);
    const hook = setup();
    expect(hook.result.current.decision_support.entry_applicability?.status).toBe("APPLICABLE");
    await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
    expect(hook.result.current.decision_support.entry_applicability).toBeNull();
    expect(hook.network).toHaveBeenCalledTimes(1);
    await act(async () => { window.dispatchEvent(new Event("focus")); });
    expect(hook.result.current.decision_support.entry_applicability).toBeNull();
    expect(hook.result.current.decision_support.trade_plan.entry_zone_low).toBe(98);
    expect(hook.network).toHaveBeenCalledTimes(2);
  });
  it("suppresses a suspended tab on offline resume after configured close", async () => {
    vi.useFakeTimers(); vi.setSystemTime("2026-11-11T08:59:30Z");
    const hook = setup(entryWorkspace("2026-11-11T08:59:30Z", 1800));
    expect(hook.result.current.decision_support.entry_applicability?.status).toBe("APPLICABLE");
    vi.setSystemTime("2026-11-11T09:01:00Z");
    await act(async () => { document.dispatchEvent(new Event("visibilitychange")); });
    expect(hook.result.current.decision_support.entry_applicability).toBeNull();
    expect(hook.network).toHaveBeenCalledTimes(1);
  });
  it("rejects an older response delivered last even inside its age bound", () => {
    vi.useFakeTimers(); vi.setSystemTime(ENTRY_NOW + 20_000);
    const newer = entryWorkspace("2026-11-11T05:00:10Z", 120);
    const hook = setup(newer);
    expect(hook.result.current.decision_support.entry_applicability?.status).toBe("APPLICABLE");
    hook.rerender({ payload: entryWorkspace("2026-11-11T05:00:00Z", 120) });
    expect(hook.result.current.decision_support.entry_applicability).toBeNull();
  });
  it("hydrates an old date-only response as dated context", () => {
    vi.useFakeTimers(); vi.setSystemTime(ENTRY_NOW);
    const old = entryWorkspace(); old.decision_support.entry_applicability.assessed_at = "2026-11-11";
    const hook = setup(old);
    expect(hook.result.current.decision_support.entry_applicability).toBeNull();
    expect(hook.result.current.decision_support.decision_session_date).toBe("2026-11-10");
  });
});


describe("real TanStack paused/recovery and shared list owner", () => {
  it("does not release a within-age resume fence when offline invalidation resolves paused", async () => {
    vi.useFakeTimers(); vi.setSystemTime(ENTRY_NOW);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
    const owner = vi.fn(async () => entryWorkspace());
    const fresh = vi.fn(async () => entryFreshness());
    const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
    const key = ["stock-workspace", "DSE", "TEST", "same-ids"];
    const hook = renderHook(() => {
      const query = useQuery({ queryKey: key, queryFn: owner, initialData: entryWorkspace(), staleTime: Infinity });
      const freshness = useQuery({ queryKey: ["market-freshness", "DSE"], queryFn: fresh, initialData: entryFreshness(), staleTime: Infinity });
      return useCurrentEntryBoundary(query.data, freshness.data, key);
    }, { wrapper });
    expect(hook.result.current.decision_support.entry_applicability?.status).toBe("APPLICABLE");
    await act(async () => { onlineManager.setOnline(false); window.dispatchEvent(new Event("focus")); await vi.advanceTimersByTimeAsync(5); });
    expect(client.getQueryState(key)?.fetchStatus).toBe("paused");
    expect(hook.result.current.decision_support.entry_applicability).toBeNull();
    expect(owner).not.toHaveBeenCalled(); expect(fresh).not.toHaveBeenCalled();
    await act(async () => { onlineManager.setOnline(true); await vi.advanceTimersByTimeAsync(5); });
    expect(owner).toHaveBeenCalledTimes(1); expect(fresh).toHaveBeenCalledTimes(1);
    expect(hook.result.current.decision_support.entry_applicability?.status).toBe("APPLICABLE");
  });
  it.each([0, 70_000])("expires both list rows from a mounted or mixed-age restored payload (+%sms)", async (offset) => {
    vi.useFakeTimers(); vi.setSystemTime(ENTRY_NOW + offset);
    const data = entryUniverse(); const second = structuredClone(data.rows[0]); second.stock.id = "stock-2"; second.display_quote.max_age_seconds = 120; data.rows.push(second);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
    const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
    const key = ["market-universe-rows", "DSE", 500, "same-ids"];
    const owner = vi.fn(async () => data);
    const hook = renderHook(() => {
      const query = useQuery({ queryKey: key, queryFn: owner, initialData: data, staleTime: Infinity });
      const fresh = useQuery({ queryKey: ["market-freshness", "DSE"], queryFn: async () => entryFreshness(), initialData: entryFreshness(), staleTime: Infinity });
      return useCurrentEntryBoundary(query.data, fresh.data, key);
    }, { wrapper });
    await act(async () => { await vi.advanceTimersByTimeAsync(offset ? 5 : 70_000); });
    expect(hook.result.current.rows[0].entry_applicability).toBeNull();
    expect(hook.result.current.rows[1].entry_applicability?.status).toBe("APPLICABLE");
    await act(async () => { await vi.advanceTimersByTimeAsync(offset ? 50_000 : 50_000); });
    expect(hook.result.current.rows[1].entry_applicability).toBeNull();
    expect(owner.mock.calls.length).toBeLessThanOrEqual(2);
  });
});
