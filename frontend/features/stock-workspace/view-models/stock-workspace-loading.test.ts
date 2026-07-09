import { describe, expect, it } from "vitest";

import { buildEmptyStockWorkspaceModel } from "@/features/stock-workspace/view-models/stock-workspace-view-model";
import { formatMarketCapBdt, normalizeMarketCapToAbsoluteBdt } from "@/lib/formatters/financial-formatters";
import { buildFundamentalsViewModel } from "@/features/stock-workspace/view-models/fundamentals-view-model";
import type { StockDecisionViewModel } from "@/features/stock-workspace/view-models/stock-decision-view-model";

describe("stock workspace loading state", () => {
  it("never renders not-found copy while loading", () => {
    const loadingModel = buildEmptyStockWorkspaceModel({
      symbol: "EGEN",
      exchange: "DSE",
      name: "Loading…",
    });

    expect(loadingModel.header.name).toBe("Loading…");
    expect(loadingModel.header.name).not.toBe("Stock not found");
    expect(loadingModel.header.symbol).toBe("EGEN");
    expect(loadingModel.header.symbol).not.toBe("UNKNOWN");
    expect(loadingModel.header.latestPrice).toBe("—");
    expect(loadingModel.header.marketCap).toBe("—");
    expect(loadingModel.header.signal).toBe("—");
  });
});

describe("market cap formatting", () => {
  it("treats AmarStock million-BDT caps as absolute BDT", () => {
    expect(normalizeMarketCapToAbsoluteBdt(25143.544)).toBeCloseTo(25_143_544_000, 0);
    expect(formatMarketCapBdt(25143.544)).toMatch(/B$/);
  });
});

describe("reactive fundamentals", () => {
  it("recomputes P/E from current live price and EPS", () => {
    const decision = {
      available: true,
      valuation: {
        close_price: 25.8,
        market_cap: 1400,
        pe_ratio: 34.4,
        pb_ratio: null,
        dividend_yield: null,
        earnings_yield: 2.9,
        interpretations: [],
        valuation_date: "2026-07-09",
        source: "AMARSTOCK_API",
      },
    } as unknown as StockDecisionViewModel;

    const fundamentals = buildFundamentalsViewModel(
      decision,
      {
        metrics: [
          {
            metric_code: "EPS",
            label: "EPS",
            value: 0.75,
            as_of_date: "2026-07-09",
            fiscal_year: 2026,
          },
        ],
        latest_fiscal_year: 2026,
        latest_as_of_date: "2026-07-09",
      },
      null,
      28.1,
    );

    const pe = fundamentals.metrics.find((metric) => metric.key === "pe");
    expect(pe?.stock).toBe("37.47");
  });
});
