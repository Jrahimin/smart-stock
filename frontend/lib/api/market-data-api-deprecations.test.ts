import { describe, expect, it } from "vitest";

import * as marketDataApi from "@/lib/api/market-data-api";

describe("market data API deprecation cleanup", () => {
  it("does not export the retired trader price-window client", () => {
    expect("listMarketPriceWindows" in marketDataApi).toBe(false);
  });
});
