/** @vitest-environment jsdom */
import { afterEach, expect, it, vi } from "vitest";
import { backendApiPatch, backendApiGet, getBackendAccessToken, setBackendAccessToken, setStoredRefreshToken, clearStoredAuthTokens, getStoredRefreshToken, getBackendAuthSessionVersion, setBackendAuthFailureHandler, AUTH_SESSION_STORAGE_KEY } from "@/lib/api/backend-api-client";
function reply(data: unknown, status = 200) { return new Response(JSON.stringify({ success: status === 200, data }), { status, headers: { "Content-Type": "application/json" } }); }
function captureError(request: Promise<unknown>) { return request.then(() => ({ code: undefined, status: undefined }), error => ({ code: error.code as string, status: error.status as number })); }
function session(user: string) { setBackendAccessToken(user); setStoredRefreshToken("refresh-" + user); }
afterEach(() => { setBackendAuthFailureHandler(null); clearStoredAuthTokens(); vi.unstubAllGlobals(); });
it("never replays an old account PATCH with a newer account token after delayed 401", async () => {
  session("A"); let finish!: (value: Response) => void;
  const fetcher = vi.fn().mockImplementationOnce(() => new Promise(resolve => { finish = resolve; })).mockResolvedValueOnce(reply({ access_token: "B-rotated", refresh_token: "refresh-B-rotated" })).mockResolvedValue(reply({ user: "B" })); vi.stubGlobal("fetch", fetcher);
  const request = backendApiPatch("/watchlist/items/stock", { quantity: 20 }).then(value => value, error => error);
  session("B"); finish(reply(null, 401)); const result = await request;
  expect(result.code).toBe("AUTH_SESSION_CHANGED"); expect(fetcher).toHaveBeenCalledTimes(1); expect(getBackendAccessToken()).toBe("B");
});
it("an old in-flight refresh cannot overwrite a newly signed-in account", async () => {
  session("A"); let finish!: (value: Response) => void;
  const fetcher = vi.fn().mockResolvedValueOnce(reply(null, 401)).mockImplementationOnce(() => new Promise(resolve => { finish = resolve; })).mockResolvedValue(reply({ user: "old" })); vi.stubGlobal("fetch", fetcher);
  const request = backendApiGet("/portfolio/workspace", undefined, { cache: "no-store" }).then(value => value, error => error);
  await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2)); session("B"); finish(reply({ access_token: "A-rotated", refresh_token: "refresh-A-rotated" }));
  const result = await request; expect(result.code).toBe("AUTH_SESSION_CHANGED"); expect(getBackendAccessToken()).toBe("B"); expect(fetcher).toHaveBeenCalledTimes(2);
});

it("shares concurrent same-session refresh, rotates in place, and retries with the rotated token", async () => {
  session("A"); const version = getBackendAuthSessionVersion(); let finish!: (value: Response) => void;
  const fetcher = vi.fn().mockImplementation((url: string, init: RequestInit) => {
    if (url.endsWith("/auth/refresh")) return new Promise(resolve => { finish = resolve; });
    return Promise.resolve(new Headers(init.headers).get("Authorization") === "Bearer A2" ? reply({ user: "A" }) : reply(null, 401));
  }); vi.stubGlobal("fetch", fetcher);
  const one = backendApiPatch("/watchlist/items/one", { quantity: 20 });
  const two = backendApiGet("/portfolio/workspace", undefined, { cache: "no-store" });
  await vi.waitFor(() => expect(fetcher.mock.calls.filter(call => call[0].endsWith("/auth/refresh"))).toHaveLength(1));
  finish(reply({ access_token: "A2", refresh_token: "refresh-A2" }));
  expect(await Promise.all([one, two])).toEqual([{ user: "A" }, { user: "A" }]);
  expect(getBackendAccessToken()).toBe("A2"); expect(getStoredRefreshToken()).toBe("refresh-A2"); expect(getBackendAuthSessionVersion()).toBe(version);
});
it("an obsolete failed refresh cannot clear the new account or report an auth failure", async () => {
  session("A"); let finish!: (value: Response) => void; const failure = vi.fn(); setBackendAuthFailureHandler(failure);
  const fetcher = vi.fn().mockResolvedValueOnce(reply(null, 401)).mockImplementationOnce(() => new Promise(resolve => { finish = resolve; })); vi.stubGlobal("fetch", fetcher);
  const request = captureError(backendApiPatch("/watchlist/items/one", {}));
  await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2)); session("B"); finish(reply(null, 401));
  expect((await request).code).toBe("AUTH_SESSION_CHANGED"); expect(getBackendAccessToken()).toBe("B"); expect(getStoredRefreshToken()).toBe("refresh-B"); expect(failure).not.toHaveBeenCalled();
});
it("logout rejects a late successful account response", async () => {
  session("A"); let finish!: (value: Response) => void; vi.stubGlobal("fetch", vi.fn().mockImplementation(() => new Promise(resolve => { finish = resolve; })));
  const request = captureError(backendApiGet("/portfolio/workspace", undefined, { cache: "no-store" }));
  await vi.waitFor(() => expect(finish).toBeTypeOf("function")); clearStoredAuthTokens(); finish(reply({ user: "A" }));
  expect((await request).code).toBe("AUTH_SESSION_CHANGED");
});
it("rejects a session switch while the successful account body is still being read", async () => {
  session("A"); let finish!: (value: unknown) => void; const json = vi.fn().mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200, json }));
  const request = captureError(backendApiPatch("/watchlist/items/one", {}));
  await vi.waitFor(() => expect(json).toHaveBeenCalled()); session("B"); finish({ success: true, data: { user: "A" } });
  expect((await request).code).toBe("AUTH_SESSION_CHANGED");
});
it("a current-session refresh failure still clears tokens and invokes the existing failure handler", async () => {
  session("A"); const failure = vi.fn(); setBackendAuthFailureHandler(failure);
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(reply(null, 401)));
  const result = await captureError(backendApiPatch("/watchlist/items/one", {}));
  expect(result.status).toBe(401); expect(failure).toHaveBeenCalledTimes(1); expect(getBackendAccessToken()).toBeNull(); expect(getStoredRefreshToken()).toBeNull();
});
it("settling an old refresh cannot remove a newer session's shared in-flight refresh", async () => {
  session("A"); let finishA!: (value: Response) => void; let finishB!: (value: Response) => void;
  const fetcher = vi.fn().mockImplementation((url: string, init: RequestInit) => {
    if (url.endsWith("/auth/refresh")) return new Promise(resolve => { if (JSON.parse(String(init.body)).refresh_token === "refresh-A") finishA = resolve; else finishB = resolve; });
    return Promise.resolve(new Headers(init.headers).get("Authorization") === "Bearer B2" ? reply({ user: "B" }) : reply(null, 401));
  }); vi.stubGlobal("fetch", fetcher);
  const old = captureError(backendApiPatch("/watchlist/items/old", {}));
  await vi.waitFor(() => expect(finishA).toBeTypeOf("function")); session("B");
  const one = backendApiPatch("/watchlist/items/new", {});
  await vi.waitFor(() => expect(finishB).toBeTypeOf("function")); finishA(reply({ access_token: "A2", refresh_token: "refresh-A2" }));
  expect((await old).code).toBe("AUTH_SESSION_CHANGED");
  const two = backendApiGet("/portfolio/workspace", undefined, { cache: "no-store" });
  await vi.waitFor(() => expect(fetcher.mock.calls.filter(call => !call[0].endsWith("/auth/refresh"))).toHaveLength(3));
  expect(fetcher.mock.calls.filter(call => call[0].endsWith("/auth/refresh"))).toHaveLength(2);
  finishB(reply({ access_token: "B2", refresh_token: "refresh-B2" })); expect(await Promise.all([one, two])).toEqual([{ user: "B" }, { user: "B" }]);
});

it("blocks an old request before it can read another tab's refresh credentials", async () => {
  session("A"); let finish!: (value: Response) => void;
  const fetcher = vi.fn().mockImplementationOnce(() => new Promise(resolve => { finish = resolve; })); vi.stubGlobal("fetch", fetcher);
  const request = captureError(backendApiPatch("/watchlist/items/old", {}));
  window.localStorage.setItem("smart-stock-refresh-token", "refresh-B"); window.localStorage.setItem(AUTH_SESSION_STORAGE_KEY, "B-session"); finish(reply(null, 401));
  expect((await request).code).toBe("AUTH_SESSION_CHANGED"); expect(fetcher).toHaveBeenCalledTimes(1); expect(getStoredRefreshToken()).toBe("refresh-B");
});
it("another tab's same-session token rotation can supply the next refresh token", async () => {
  session("A"); const marker = window.localStorage.getItem(AUTH_SESSION_STORAGE_KEY); let finish!: (value: Response) => void;
  const fetcher = vi.fn().mockImplementationOnce(() => new Promise(resolve => { finish = resolve; })).mockResolvedValueOnce(reply({ access_token: "A3", refresh_token: "refresh-A3" })).mockResolvedValue(reply({ user: "A" })); vi.stubGlobal("fetch", fetcher);
  const request = backendApiPatch("/watchlist/items/current", {});
  window.localStorage.setItem("smart-stock-refresh-token", "refresh-A2"); finish(reply(null, 401)); expect(await request).toEqual({ user: "A" });
  expect(JSON.parse(fetcher.mock.calls[1][1].body).refresh_token).toBe("refresh-A2"); expect(window.localStorage.getItem(AUTH_SESSION_STORAGE_KEY)).toBe(marker);
});

it.each(["401", "network", "success", "invalid"])("a superseded same-marker refresh cannot clear or overwrite newer credentials (%s)", async (outcome) => {
  session("A"); let finish!: (value: Response) => void; let fail!: (reason: Error) => void;
  const failure = vi.fn(); setBackendAuthFailureHandler(failure);
  const fetcher = vi.fn().mockResolvedValueOnce(reply(null, 401)).mockImplementationOnce(() => new Promise((resolve, reject) => { finish = resolve; fail = reject; })); vi.stubGlobal("fetch", fetcher);
  const request = captureError(backendApiPatch("/watchlist/items/current", {}));
  await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
  window.localStorage.setItem("smart-stock-refresh-token", "refresh-A2");
  if (outcome === "network") fail(new Error("fixture network failure"));
  else finish(outcome === "401" ? reply(null, 401) : outcome === "invalid" ? reply(null) : reply({ access_token: "obsolete", refresh_token: "obsolete" }));
  expect((await request).code).toBe("AUTH_SESSION_CHANGED");
  expect(getStoredRefreshToken()).toBe("refresh-A2"); expect(getBackendAccessToken()).toBe("A");
  expect(fetcher).toHaveBeenCalledTimes(2); expect(failure).not.toHaveBeenCalled();
});
