import { describe, expect, it } from "vitest";

import { resolveVersionedInternalAction } from "@/lib/market/trader-decision";

describe("decision display taxonomy v2", () => {
  it("maps a comparable internal BUY through the v2 compatibility boundary", () => {
    expect(
      resolveVersionedInternalAction("BUY", "TRADER_DECISION_V2", "v2"),
    ).toBe("POTENTIAL_BUY");
  });

  it("does not reinterpret a historical v1 BUY", () => {
    expect(
      resolveVersionedInternalAction("BUY", "TRADER_RECOMMENDATION_V1", "v2"),
    ).toBeNull();
    expect(
      resolveVersionedInternalAction("BUY", "TRADER_DECISION_V2", "v1"),
    ).toBeNull();
  });
});
