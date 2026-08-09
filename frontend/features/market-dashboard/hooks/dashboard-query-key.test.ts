import { describe, expect, it } from "vitest";

import {
  dashboardQueryKey,
  shouldUseDashboardInitialData,
} from "./dashboard-query-key";

describe("dashboard generation query identity", () => {
  it("does not seed G124 from an SSR payload published for G123", () => {
    expect(shouldUseDashboardInitialData("G123", "G124")).toBe(false);
    expect(dashboardQueryKey("movers", "DSE", "G124")).toEqual([
      "dashboard",
      "movers",
      "DSE",
      "G124",
    ]);
  });

  it("keeps matching SSR data under its exact generation key", () => {
    expect(shouldUseDashboardInitialData("G124", "G124")).toBe(true);
    expect(dashboardQueryKey("market-sentiment", "DSE", "G124")).toEqual([
      "dashboard",
      "market-sentiment",
      "DSE",
      "G124",
    ]);
  });
});
