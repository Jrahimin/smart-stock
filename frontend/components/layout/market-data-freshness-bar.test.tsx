/** @vitest-environment jsdom */
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { MarketDataFreshnessBar } from "./market-data-freshness-bar";
import { entryFreshness } from "@/test-fixtures/current-entry-fixtures";
const state = vi.hoisted(() => ({ status: "PRE_OPEN", refresh: vi.fn(async () => {}) }));
vi.mock("@/hooks/market/use-market-cache-coordinator", () => ({ useMarketCacheRefresh: () => state.refresh }));
vi.mock("@/hooks/market/use-market-data-freshness", async (original) => ({
  ...await original<typeof import("@/hooks/market/use-market-data-freshness")>(),
  useMarketDataFreshness: () => ({ data: { ...entryFreshness(), market_status: state.status }, isLoading: false, isError: false }),
}));
afterEach(() => { cleanup(); vi.clearAllMocks(); });
it.each(["PRE_OPEN", "HOLIDAY", "POST_CLOSE"])("permits a client-cache refresh during %s without ingesting provider data", (status) => {
  state.status = status;
  const view = render(<MarketDataFreshnessBar locale="en" />);
  const button = view.getByRole("button", { name: "Refresh market data" }) as HTMLButtonElement;
  expect(button.disabled).toBe(false);
  fireEvent.click(button);
  expect(state.refresh).toHaveBeenCalledOnce();
});
