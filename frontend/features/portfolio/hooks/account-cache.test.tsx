/** @vitest-environment jsdom */
import React, { type ReactNode } from "react";
import { QueryClient, QueryClientProvider, onlineManager } from "@tanstack/react-query";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { usePortfolioEmailPreference } from "./use-portfolio-email-preference";
import { useAddHoldingModal } from "./use-add-holding-modal";
import { buildStockDecisionViewModel, withStockHolderInstruction } from "@/features/stock-workspace/view-models/stock-decision-view-model";
import { order4SurfaceFixture } from "@/test-fixtures/order4-surface-fixtures";
import { usePortfolioWorkspace } from "./use-portfolio-workspace";
import { useWatchlistItemUpdate } from "@/features/watchlist/hooks/use-watchlist-item-update";
import { useWatchlistItemRemove } from "@/features/watchlist/hooks/use-watchlist-item-remove";
import { useWatchlistToggle } from "@/features/watchlist/hooks/use-watchlist-toggle";
import { useUserWatchlist } from "@/features/watchlist/hooks/use-user-watchlist";
import { accountRow, accountWorkspace, accountWatchItem } from "@/test-fixtures/account-fixtures";
import { entryFreshness } from "@/test-fixtures/current-entry-fixtures";
import { freshnessGenerationToken } from "@/lib/market/market-generation";
import { invalidateMarketTanStackQueries } from "@/lib/market/market-cache-coordinator";
import { setBackendAccessToken, setStoredRefreshToken, clearStoredAuthTokens, getBackendAuthSessionVersion, rotateBackendAccessToken } from "@/lib/api/backend-api-client";
import type { BackendPortfolioWorkspaceDto } from "@/lib/api/backend-api-types";

const state = vi.hoisted(() => ({ user: "user-a", freshness: {} as Record<string, unknown>, get: vi.fn(), list: vi.fn(), summary: vi.fn(), preference: vi.fn(), savePreference: vi.fn(), add: vi.fn(), update: vi.fn(), remove: vi.fn(), toggle: vi.fn() }));
vi.mock("@/features/auth/context/auth-context", () => ({ useAuth: () => ({ user: { id: state.user }, isAuthenticated: true }) }));
vi.mock("@/hooks/market/use-market-data-freshness", () => ({ useMarketDataFreshness: () => ({ data: state.freshness }) }));
vi.mock("@/lib/api/portfolio-api", () => ({ getPortfolioWorkspace: () => state.get(), getPortfolioEmailPreference: () => state.preference(), savePortfolioEmailPreference: (payload: unknown) => state.savePreference(payload) }));
vi.mock("@/lib/api/watchlist-api", () => ({ listWatchlistItems: () => state.list(), getWatchlistSummary: () => state.summary(), addWatchlistItem: (...args: unknown[]) => state.add(...args), updateWatchlistItem: (...args: unknown[]) => state.update(...args), removeWatchlistItem: (...args: unknown[]) => state.remove(...args), toggleWatchlistItem: (...args: unknown[]) => state.toggle(...args) }));

vi.mock("@/hooks/stocks/use-debounced-stock-search", () => ({ useDebouncedStockSearch: () => ({ results: [], isSearching: false, isSearchEnabled: false, isError: false }) }));
vi.mock("@/lib/api/market-data-api", () => ({ listDailyPrices: async () => [] }));

function harness() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  const key = (user = state.user) => ["portfolio", "workspace", user, "DSE", freshnessGenerationToken(state.freshness)] as const;
  return { client, wrapper, key };
}
beforeEach(() => { onlineManager.setOnline(true); setBackendAccessToken("token-A"); setStoredRefreshToken("refresh-A"); state.user = "user-a"; state.freshness = entryFreshness() as unknown as Record<string, unknown>; state.get.mockResolvedValue(accountWorkspace()); state.list.mockResolvedValue([accountWatchItem()]); state.summary.mockResolvedValue({ total_watchlisted: 1, total_holdings: 1 }); state.preference.mockResolvedValue({ enabled: false, locale: "en" }); });
afterEach(() => { cleanup(); clearStoredAuthTokens(); onlineManager.setOnline(true); vi.resetAllMocks(); });

it("does not show account A as placeholder during account B's pending read", async () => {
  const { client, wrapper, key } = harness(); client.setQueryData(key(), accountWorkspace());
  let finish!: (data: BackendPortfolioWorkspaceDto) => void; state.get.mockReturnValue(new Promise(resolve => { finish = resolve; }));
  const hook = renderHook(() => usePortfolioWorkspace(), { wrapper }); expect(hook.result.current.data).toBeTruthy();
  setBackendAccessToken("token-B"); setStoredRefreshToken("refresh-B"); state.user = "user-b"; hook.rerender(); expect(hook.result.current.data).toBeUndefined();
  await act(async () => { finish(accountWorkspace(accountRow({ symbol: "B_ONLY" }))); });
  await waitFor(() => expect(hook.result.current.data?.watchlist_items[0].symbol).toBe("B_ONLY"));
});
it("keeps complete server money during edits and waits for the authoritative workspace", async () => {
  const { client, wrapper, key } = harness(); const initial = accountWorkspace(); client.setQueryData(key(), initial);
  let finishUpdate!: (data: unknown) => void; state.update.mockReturnValue(new Promise(resolve => { finishUpdate = resolve; }));
  let finishRead!: (data: BackendPortfolioWorkspaceDto) => void; state.get.mockReturnValue(new Promise(resolve => { finishRead = resolve; }));
  const hook = renderHook(() => ({ workspace: usePortfolioWorkspace(), edit: useWatchlistItemUpdate() }), { wrapper });
  act(() => hook.result.current.edit.mutate({ stockId: "stock-1", payload: { quantity: 20, buy_price: 90 } }));
  await waitFor(() => expect(state.update).toHaveBeenCalled());
  expect(client.getQueryData(key())).toEqual(initial);
  await act(async () => { finishUpdate(accountWatchItem()); });
  expect(hook.result.current.edit.isPending).toBe(true); expect(hook.result.current.workspace.data?.watchlist_items[0].quantity).toBe("10");
  const authoritative = accountWorkspace(accountRow({ quantity: "20", average_buy_price: "90", current_value: "2060", unrealized_gain_amount: "260", unrealized_gain_percent: "14.44" }));
  authoritative.pulse.known_current_value = "2060"; authoritative.pulse.known_unrealized_gain_amount = "260";
  await act(async () => { finishRead(authoritative); });
  await waitFor(() => expect(hook.result.current.edit.isSuccess).toBe(true));
  expect(hook.result.current.workspace.data).toEqual(authoritative);
});
it("a failed concurrent edit cannot restore an older snapshot over another success or patch a different account", async () => {
  const { client, wrapper, key } = harness(); const initial = accountWorkspace(); const foreign = accountWorkspace(accountRow({ symbol: "PRIVATE_B" }));
  client.setQueryData(key(), initial); client.setQueryData(key("user-b"), foreign);
  let fail!: (error: Error) => void; let succeed!: (data: unknown) => void;
  state.update.mockImplementation((stock: string) => stock === "fail" ? new Promise((_resolve, reject) => { fail = reject; }) : new Promise(resolve => { succeed = resolve; }));
  const hook = renderHook(() => ({ one: useWatchlistItemUpdate(), two: useWatchlistItemUpdate() }), { wrapper });
  act(() => { hook.result.current.one.mutate({ stockId: "fail", payload: { quantity: 99 } }); hook.result.current.two.mutate({ stockId: "success", payload: { buy_price: 80 } }); });
  await waitFor(() => expect(state.update).toHaveBeenCalledTimes(2));
  const accepted = accountWorkspace(accountRow({ average_buy_price: "80", unrealized_gain_percent: "28.75" }));
  await act(async () => { succeed(accountWatchItem()); client.setQueryData(key(), accepted); fail(new Error("fixture rejection")); });
  await waitFor(() => expect(hook.result.current.one.isError).toBe(true));
  expect(client.getQueryData(key())).toEqual(accepted); expect(client.getQueryData(key("user-b"))).toEqual(foreign);
  expect(client.getQueryState(key("user-b"))?.isInvalidated).toBe(false);
});
it.each(["update", "remove", "toggle"] as const)("settled %s refresh stays scoped to the account that started it after auth changes", async (kind) => {
  const { client, wrapper, key } = harness(); client.setQueryData(key(), accountWorkspace()); client.setQueryData(key("user-b"), accountWorkspace());
  let finish!: (data: unknown) => void; state[kind].mockReturnValue(new Promise(resolve => { finish = resolve; }));
  const hook = renderHook(() => ({ update: useWatchlistItemUpdate(), remove: useWatchlistItemRemove(), toggle: useWatchlistToggle() }), { wrapper });
  act(() => { if (kind === "update") hook.result.current.update.mutate({ stockId: "stock-1", payload: { quantity: 20 } }); else hook.result.current[kind].mutate("stock-1"); });
  await waitFor(() => expect(state[kind]).toHaveBeenCalled()); setBackendAccessToken("token-B"); setStoredRefreshToken("refresh-B"); state.user = "user-b"; hook.rerender();
  await act(async () => { finish(accountWatchItem()); });
  await waitFor(() => expect(client.getQueryState(key("user-a"))?.isInvalidated).toBe(true));
  expect(client.getQueryState(key("user-b"))?.isInvalidated).toBe(false);
});
it("active saved membership follows generations, coordinator refresh, and an isolated account switch", async () => {
  const { client, wrapper } = harness(); const hook = renderHook(() => useUserWatchlist(), { wrapper });
  await waitFor(() => expect(hook.result.current.holdingStockIds.has("stock-1")).toBe(true));
  const first = state.list.mock.calls.length;
  state.freshness = { ...state.freshness, market_sync_id: "next-quote", decision_generation_id: "next-decision" }; hook.rerender();
  await waitFor(() => expect(state.list.mock.calls.length).toBeGreaterThan(first));
  const afterGeneration = state.list.mock.calls.length; await act(async () => { await invalidateMarketTanStackQueries(client); });
  expect(state.list.mock.calls.length).toBeGreaterThan(afterGeneration);
  state.list.mockReturnValue(new Promise(() => {})); setBackendAccessToken("token-B"); setStoredRefreshToken("refresh-B"); state.user = "user-b"; hook.rerender();
  expect(hook.result.current.watchedStockIds.size).toBe(0); expect(hook.result.current.holdingStockIds.size).toBe(0);
});

it("save/remove interactions re-read membership and failure keeps the prior server state", async () => {
  const { wrapper } = harness(); let items = [accountWatchItem()]; state.list.mockImplementation(async () => items);
  state.toggle.mockImplementation(async () => { items = []; return { added: false }; });
  state.remove.mockRejectedValue(new Error("fixture rejection"));
  const hook = renderHook(() => ({ saved: useUserWatchlist(), toggle: useWatchlistToggle(), remove: useWatchlistItemRemove() }), { wrapper });
  await waitFor(() => expect(hook.result.current.saved.watchedStockIds.has("stock-1")).toBe(true));
  act(() => hook.result.current.remove.mutate("stock-1"));
  await waitFor(() => expect(hook.result.current.remove.isError).toBe(true));
  expect(hook.result.current.saved.watchedStockIds.has("stock-1")).toBe(true);
  act(() => hook.result.current.toggle.mutate("stock-1"));
  await waitFor(() => expect(hook.result.current.toggle.isSuccess).toBe(true));
  expect(hook.result.current.saved.watchedStockIds.has("stock-1")).toBe(false);
  state.toggle.mockImplementation(async () => { items = [accountWatchItem()]; return { added: true }; });
  act(() => hook.result.current.toggle.mutate("stock-1"));
  await waitFor(() => expect(hook.result.current.saved.watchedStockIds.has("stock-1")).toBe(true));
});

it.each(["update", "remove", "toggle"] as const)("an offline queued %s cannot invoke account B after reconnect", async (kind) => {
  const { client, wrapper } = harness(); onlineManager.setOnline(false);
  const hook = renderHook(() => ({ update: useWatchlistItemUpdate(), remove: useWatchlistItemRemove(), toggle: useWatchlistToggle() }), { wrapper });
  act(() => { if (kind === "update") hook.result.current.update.mutate({ stockId: "stock-1", payload: { quantity: 20 } }); else hook.result.current[kind].mutate("stock-1"); });
  await waitFor(() => expect(hook.result.current[kind].isPaused).toBe(true)); expect(state[kind]).not.toHaveBeenCalled();
  setBackendAccessToken("token-B"); setStoredRefreshToken("refresh-B"); state.user = "user-b"; hook.rerender();
  await act(async () => { onlineManager.setOnline(true); await client.resumePausedMutations(); });
  const old = client.getMutationCache().findAll({ mutationKey: ["account-watchlist", "user-a"] })[0];
  await waitFor(() => expect(old.state.status).toBe("error")); expect(state[kind]).not.toHaveBeenCalled();
  expect((old.state.error as { code?: string })?.code).toBe("AUTH_SESSION_CHANGED");
});
it("same-session token rotation preserves a queued account intent", async () => {
  const { client, wrapper } = harness(); onlineManager.setOnline(false); state.update.mockResolvedValue(accountWatchItem());
  const hook = renderHook(() => useWatchlistItemUpdate(), { wrapper });
  act(() => hook.result.current.mutate({ stockId: "stock-1", payload: { quantity: 20 } }));
  await waitFor(() => expect(hook.result.current.isPaused).toBe(true)); rotateBackendAccessToken("token-A2", getBackendAuthSessionVersion()); setStoredRefreshToken("refresh-A2");
  await act(async () => { onlineManager.setOnline(true); await client.resumePausedMutations(); });
  await waitFor(() => expect(hook.result.current.isSuccess).toBe(true)); expect(state.update).toHaveBeenCalledWith("stock-1", { quantity: 20 });
});
it("explicitly refetching an old inactive account query cannot read using the new account", async () => {
  const { client, wrapper, key } = harness(); const oldKey = key();
  const hook = renderHook(() => usePortfolioWorkspace(), { wrapper }); await waitFor(() => expect(hook.result.current.isSuccess).toBe(true));
  setBackendAccessToken("token-B"); setStoredRefreshToken("refresh-B"); state.user = "user-b"; hook.rerender(); await waitFor(() => expect(state.get).toHaveBeenCalledTimes(2));
  const reads = state.get.mock.calls.length; await act(async () => { await client.refetchQueries({ queryKey: oldKey, exact: true }); });
  expect(state.get).toHaveBeenCalledTimes(reads);
});

it("switching during TanStack's awaited onMutate cannot dispatch the queued edit", async () => {
  const { client, wrapper } = harness(); const hook = renderHook(() => useWatchlistItemUpdate(), { wrapper });
  act(() => { hook.result.current.mutate({ stockId: "stock-1", payload: { quantity: 20 } }); setBackendAccessToken("token-B"); setStoredRefreshToken("refresh-B"); state.user = "user-b"; });
  hook.rerender(); const old = client.getMutationCache().findAll({ mutationKey: ["account-watchlist", "user-a"] })[0];
  await waitFor(() => expect(old.state.status).toBe("error")); expect(state.update).not.toHaveBeenCalled();
});
it("a paused preference intent and an explicit inactive A-key refetch cannot read or write account B", async () => {
  const { client, wrapper } = harness(); const hook = renderHook(() => usePortfolioEmailPreference("en"), { wrapper });
  await waitFor(() => expect(hook.result.current.ready).toBe(true)); const aKey = ["portfolio", "email-preference", "user-a"];
  onlineManager.setOnline(false); act(() => hook.result.current.toggle(true));
  const old = client.getMutationCache().findAll({ mutationKey: ["account-watchlist", "user-a"] })[0]; await waitFor(() => expect(old.state.isPaused).toBe(true));
  setBackendAccessToken("token-B"); setStoredRefreshToken("refresh-B"); state.user = "user-b"; hook.rerender();
  await act(async () => { onlineManager.setOnline(true); await client.resumePausedMutations(); });
  await waitFor(() => expect(old.state.status).toBe("error")); expect(state.savePreference).not.toHaveBeenCalled();
  await waitFor(() => expect(hook.result.current.ready).toBe(true)); const reads = state.preference.mock.calls.length;
  await act(async () => { await client.refetchQueries({ queryKey: aKey, exact: true, type: "inactive" }); });
  expect(state.preference).toHaveBeenCalledTimes(reads); expect(client.getQueryData(aKey)).toEqual({ enabled: false, locale: "en" });
});
function selectNewHolding(hook: { result: { current: ReturnType<typeof useAddHoldingModal> } }) {
  act(() => hook.result.current.openCreate());
  act(() => { hook.result.current.selectSearchResult({ id: "new-stock", symbol: "NEW", name: "New fixture", exchange: "DSE", latest_price: "103", latest_trade_date: "2026-11-10", data_quality_flag: "OK" } as Parameters<typeof hook.result.current.selectSearchResult>[0]); hook.result.current.setQuantity("10"); hook.result.current.setAverageBuyPrice("100"); });
}
it.each(["before-first-leg", "between-legs"] as const)("addholding binds intent %s and cannot save it to account B", async (phase) => {
  const { client, wrapper } = harness(); let finish!: (value: unknown) => void;
  state.add.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  const hook = renderHook(() => useAddHoldingModal({ watchlistItems: [], publishedMarketDate: "2026-11-10", dataState: "FINALIZED" }), { wrapper }); selectNewHolding(hook);
  if (phase === "before-first-leg") onlineManager.setOnline(false);
  act(() => hook.result.current.submit()); const old = client.getMutationCache().findAll({ mutationKey: ["account-watchlist", "user-a"] })[0];
  if (phase === "before-first-leg") await waitFor(() => expect(old.state.isPaused).toBe(true)); else await waitFor(() => expect(state.add).toHaveBeenCalledWith("new-stock"));
  setBackendAccessToken("token-B"); setStoredRefreshToken("refresh-B"); state.user = "user-b"; hook.rerender();
  await act(async () => { if (phase === "before-first-leg") { onlineManager.setOnline(true); await client.resumePausedMutations(); } else finish(accountWatchItem()); });
  await waitFor(() => expect(old.state.status).toBe("error")); expect(state.update).not.toHaveBeenCalled(); if (phase === "before-first-leg") expect(state.add).not.toHaveBeenCalled();
});
it("addholding preserves its submitted form through same-account rotation before its second leg", async () => {
  const { wrapper } = harness(); let finish!: (value: unknown) => void;
  state.add.mockImplementation(() => new Promise(resolve => { finish = resolve; })); state.update.mockResolvedValue(accountWatchItem());
  const hook = renderHook(() => useAddHoldingModal({ watchlistItems: [], publishedMarketDate: "2026-11-10", dataState: "FINALIZED" }), { wrapper }); selectNewHolding(hook); act(() => hook.result.current.submit());
  await waitFor(() => expect(state.add).toHaveBeenCalled()); act(() => hook.result.current.setQuantity("99"));
  rotateBackendAccessToken("token-A2", getBackendAuthSessionVersion()); setStoredRefreshToken("refresh-A2"); await act(async () => { finish(accountWatchItem()); });
  await waitFor(() => expect(state.update).toHaveBeenCalledWith("new-stock", { is_holding: true, quantity: 10, buy_price: 100, note: null }));
});
it.each(["pending", "failed"] as const)("known membership preserves holder REDUCE beside public SELL with a %s summary", async (summary) => {
  const { wrapper } = harness(); if (summary === "pending") state.summary.mockReturnValue(new Promise(() => {})); else state.summary.mockRejectedValue(new Error("summary unavailable"));
  const hook = renderHook(() => useUserWatchlist(), { wrapper }); await waitFor(() => expect(hook.result.current.membershipReady).toBe(true));
  const fixture = order4SurfaceFixture(); fixture.support.decision.display_action = "SELL"; fixture.support.decision.holder_action = "REDUCE";
  const model = buildStockDecisionViewModel(fixture.support, "en");
  const holder = withStockHolderInstruction(model, fixture.support, hook.result.current.membershipReady && hook.result.current.holdingStockIds.has("stock-1"));
  expect(holder.displayAction).toBe("SELL"); expect(holder.holderInstruction?.action).toBe("REDUCE");
  setBackendAccessToken("token-B"); setStoredRefreshToken("refresh-B"); state.user = "user-b"; state.list.mockReturnValue(new Promise(() => {})); hook.rerender();
  expect(hook.result.current.membershipReady).toBe(false); expect(hook.result.current.holdingStockIds.size).toBe(0);
});
it("a background item error retains already known membership for that account", async () => {
  const { wrapper } = harness(); const hook = renderHook(() => useUserWatchlist(), { wrapper }); await waitFor(() => expect(hook.result.current.membershipReady).toBe(true));
  state.list.mockRejectedValue(new Error("temporary item refresh")); await act(async () => { await hook.result.current.refetch(); });
  expect(hook.result.current.membershipReady).toBe(true); expect(hook.result.current.holdingStockIds.has("stock-1")).toBe(true);
});
