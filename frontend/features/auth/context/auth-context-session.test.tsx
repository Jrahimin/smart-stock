/** @vitest-environment jsdom */
import React, { useEffect, type ReactNode } from "react";
import { act, cleanup, render, renderHook, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { AuthProvider, useAuth } from "./auth-context";
import { clearStoredAuthTokens, getBackendAccessToken, getBackendAuthSessionVersion, getStoredRefreshToken, backendApiGetFresh, AUTH_SESSION_STORAGE_KEY, setBackendAccessToken, setStoredRefreshToken } from "@/lib/api/backend-api-client";
const navigation = vi.hoisted(() => ({ replace: vi.fn(), push: vi.fn() }));
vi.mock("next/navigation", () => ({ usePathname: () => "/portfolio", useRouter: () => navigation }));
function reply(data: unknown) { return new Response(JSON.stringify({ success: true, data }), { status: 200, headers: { "Content-Type": "application/json" } }); }
const pair = (user: string) => ({ access_token: user, refresh_token: "refresh-" + user, token_type: "bearer", expires_in: 100 });
const wrapper = ({ children }: { children: ReactNode }) => <AuthProvider>{children}</AuthProvider>;
afterEach(() => { cleanup(); clearStoredAuthTokens(); vi.unstubAllGlobals(); vi.clearAllMocks(); });
it("a delayed bootstrap refresh cannot replace or clear an account installed by login", async () => {
  setBackendAccessToken("A"); setStoredRefreshToken("refresh-A"); let finish!: (value: Response) => void;
  const fetcher = vi.fn().mockImplementation((url: string) => {
    if (url.endsWith("/auth/refresh")) return new Promise(resolve => { finish = resolve; });
    if (url.endsWith("/auth/login")) return Promise.resolve(reply(pair("B")));
    return Promise.resolve(reply({ id: "B", display_name: "Account B" }));
  }); vi.stubGlobal("fetch", fetcher);
  const hook = renderHook(() => useAuth(), { wrapper }); await waitFor(() => expect(finish).toBeTypeOf("function"));
  await act(async () => { await hook.result.current.login("fixture@example.test", "fixture"); });
  expect(hook.result.current.user?.id).toBe("B");
  await act(async () => { finish(reply(pair("A2"))); });
  await waitFor(() => expect(hook.result.current.isLoading).toBe(false));
  expect(hook.result.current.user?.id).toBe("B"); expect(getBackendAccessToken()).toBe("B");
});
it("a late old /auth/me result cannot restore the previous user after a new login", async () => {
  setBackendAccessToken("A"); setStoredRefreshToken("refresh-A"); let finish!: (value: Response) => void;
  const fetcher = vi.fn().mockImplementation((url: string, init: RequestInit) => {
    if (url.endsWith("/auth/refresh")) return Promise.resolve(reply(pair("A2")));
    if (url.endsWith("/auth/login")) return Promise.resolve(reply(pair("B")));
    if (new Headers(init.headers).get("Authorization") === "Bearer A2") return new Promise(resolve => { finish = resolve; });
    return Promise.resolve(reply({ id: "B", display_name: "Account B" }));
  }); vi.stubGlobal("fetch", fetcher);
  const hook = renderHook(() => useAuth(), { wrapper }); await waitFor(() => expect(finish).toBeTypeOf("function"));
  await act(async () => { await hook.result.current.login("fixture@example.test", "fixture"); });
  expect(hook.result.current.user?.id).toBe("B");
  await act(async () => { finish(reply({ id: "A", display_name: "Account A" })); });
  await waitFor(() => expect(hook.result.current.isLoading).toBe(false));
  expect(hook.result.current.user?.id).toBe("B"); expect(getBackendAccessToken()).toBe("B");
});

it("ordinary guest bootstrap preserves a newly mounted child's public 200 read", async () => {
  clearStoredAuthTokens(); let finish!: (value: Response) => void; let outcome: string | undefined;
  vi.stubGlobal("fetch", vi.fn(() => new Promise(resolve => { finish = resolve; })));
  function PublicChild() { useEffect(() => { void backendApiGetFresh<string>("/market/freshness").then(value => { outcome = value; }, error => { outcome = error.code; }); }, []); return null; }
  const version = getBackendAuthSessionVersion(); render(<AuthProvider><PublicChild /></AuthProvider>);
  await waitFor(() => expect(finish).toBeTypeOf("function")); await act(async () => { finish(reply("ok")); });
  await waitFor(() => expect(outcome).toBe("ok")); expect(getBackendAuthSessionVersion()).toBe(version);
});
it("explicit same-session refresh preserves the authenticated user while auth/me is pending", async () => {
  setBackendAccessToken("A"); setStoredRefreshToken("refresh-A"); let finish!: (value: Response) => void; let reads = 0;
  const fetcher = vi.fn().mockImplementation((url: string) => {
    if (url.endsWith("/auth/refresh")) return Promise.resolve(reply(pair("A2")));
    if (++reads === 1) return Promise.resolve(reply({ id: "A", display_name: "Account A" }));
    return new Promise(resolve => { finish = resolve; });
  }); vi.stubGlobal("fetch", fetcher);
  const hook = renderHook(() => useAuth(), { wrapper }); await waitFor(() => expect(hook.result.current.user?.id).toBe("A"));
  const version = getBackendAuthSessionVersion(); let pending!: Promise<void>;
  act(() => { pending = hook.result.current.refreshCurrentSession(); }); await waitFor(() => expect(finish).toBeTypeOf("function"));
  expect(hook.result.current.isAuthenticated).toBe(true); expect(hook.result.current.user?.id).toBe("A"); expect(getBackendAuthSessionVersion()).toBe(version);
  await act(async () => { finish(reply({ id: "A", display_name: "Account A" })); await pending; }); expect(hook.result.current.user?.id).toBe("A");
});
it("an external tab identity change clears only this tab's audience and preserves the new stored credentials", async () => {
  setBackendAccessToken("A"); setStoredRefreshToken("refresh-A");
  vi.stubGlobal("fetch", vi.fn((url: string) => Promise.resolve(reply(url.endsWith("/auth/refresh") ? pair("A2") : { id: "A" }))));
  const hook = renderHook(() => useAuth(), { wrapper }); await waitFor(() => expect(hook.result.current.user?.id).toBe("A"));
  await act(async () => { window.localStorage.setItem("smart-stock-refresh-token", "refresh-B"); window.localStorage.setItem(AUTH_SESSION_STORAGE_KEY, "B-session"); window.dispatchEvent(new StorageEvent("storage", { key: AUTH_SESSION_STORAGE_KEY, newValue: "B-session" })); });
  expect(hook.result.current.user).toBeNull(); expect(getBackendAccessToken()).toBeNull(); expect(window.localStorage.getItem("smart-stock-refresh-token")).toBe("refresh-B");
});

it.each([false, true])("bootstrap discards a superseded same-marker refresh completion (success=%s)", async (success) => {
  setBackendAccessToken("A"); setStoredRefreshToken("refresh-A"); let finish!: (value: Response) => void;
  const fetcher = vi.fn(() => new Promise<Response>(resolve => { finish = resolve; })); vi.stubGlobal("fetch", fetcher);
  const hook = renderHook(() => useAuth(), { wrapper }); await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
  window.localStorage.setItem("smart-stock-refresh-token", "refresh-A2");
  await act(async () => { finish(success ? reply(pair("obsolete")) : new Response("{}", { status: 401 })); });
  await waitFor(() => expect(hook.result.current.isLoading).toBe(false));
  expect(getStoredRefreshToken()).toBe("refresh-A2"); expect(getBackendAccessToken()).toBe("A"); expect(fetcher).toHaveBeenCalledTimes(1);
});

it("a stale auth/me failure cannot clear a newer same-marker rotation", async () => {
  setBackendAccessToken("A"); setStoredRefreshToken("refresh-A"); let finish!: (value: Response) => void;
  const fetcher = vi.fn((url: string) => url.endsWith("/auth/refresh") ? Promise.resolve(reply(pair("A2"))) : new Promise<Response>(resolve => { finish = resolve; })); vi.stubGlobal("fetch", fetcher);
  const hook = renderHook(() => useAuth(), { wrapper }); await waitFor(() => expect(finish).toBeTypeOf("function"));
  window.localStorage.setItem("smart-stock-refresh-token", "refresh-A3");
  await act(async () => { finish(new Response("{}", { status: 500 })); });
  await waitFor(() => expect(hook.result.current.isLoading).toBe(false));
  expect(getStoredRefreshToken()).toBe("refresh-A3"); expect(getBackendAccessToken()).toBe("A2");
});
