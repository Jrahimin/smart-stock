/** @vitest-environment jsdom */
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { MarketDataFreshnessBar } from "./market-data-freshness-bar";
import { entryFreshness } from "@/test-fixtures/current-entry-fixtures";
const state = vi.hoisted(() => ({ status: "PRE_OPEN", timestamp: "2026-11-12T08:05:00Z" as string | null, refresh: vi.fn(async () => {}) }));
vi.mock("@/hooks/market/use-market-cache-coordinator", () => ({ useMarketCacheRefresh: () => state.refresh }));
vi.mock("@/hooks/market/use-market-data-freshness", async (original) => ({
  ...await original<typeof import("@/hooks/market/use-market-data-freshness")>(),
  useMarketDataFreshness: () => ({ data: { ...entryFreshness(), market_status: state.status, last_synced_at: state.timestamp }, isLoading: false, isError: false }),
}));
afterEach(() => { cleanup(); vi.useRealTimers(); vi.clearAllMocks(); });
it.each(["PRE_OPEN", "HOLIDAY", "POST_CLOSE"])("permits a client-cache refresh during %s without ingesting provider data", (status) => {
  state.status = status;
  const view = render(<MarketDataFreshnessBar locale="en" />);
  const button = view.getByRole("button", { name: "Refresh market data" }) as HTMLButtonElement;
  expect(button.disabled).toBe(false);
  fireEvent.click(button);
  expect(state.refresh).toHaveBeenCalledOnce();
});
it("shows the age of the market publication alongside refresh", () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-12T08:12:00Z"));
  const view = render(<MarketDataFreshnessBar locale="en" />);
  expect(view.getByText("Last updated 7 minutes ago").getAttribute("datetime")).toBe(state.timestamp);
  expect(view.getByRole("button", { name: "Refresh market data" })).toBeTruthy();
});
it("keeps recovery available when no valid publication time is available", () => {
  state.status = "HOLIDAY";
  state.timestamp = null;
  const view = render(<MarketDataFreshnessBar locale="en" />);
  expect(view.queryByRole("status")).toBeNull();
  expect(view.getByRole("button",{name:"Refresh market data"})).toBeTruthy();
  expect(view.container.textContent).toBe("");
  state.timestamp = "2026-11-12T08:05:00Z";
});
