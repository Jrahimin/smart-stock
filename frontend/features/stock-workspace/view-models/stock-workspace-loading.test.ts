import { describe, expect, it } from "vitest";

import { buildEmptyStockWorkspaceModel, buildStockWorkspaceModel } from "@/features/stock-workspace/view-models/stock-workspace-view-model";
import { resolveDisplayedMarketCap } from "@/features/stock-workspace/view-models/market-cap-view-model";
import { buildStockSemanticSummary } from "@/features/stock-workspace/view-models/stock-semantic-summary-view-model";
import { buildStockDecisionViewModel } from "@/features/stock-workspace/view-models/stock-decision-view-model";
import { formatMarketCapBdt, normalizeMarketCapToAbsoluteBdt } from "@/lib/formatters/financial-formatters";
import { buildFundamentalsViewModel } from "@/features/stock-workspace/view-models/fundamentals-view-model";
import type { StockDecisionViewModel } from "@/features/stock-workspace/view-models/stock-decision-view-model";
import type { BackendDailyPriceDto, BackendStockDto } from "@/lib/api/backend-api-types";
import type { StockDecisionSupportDto } from "@/lib/api/stock-decision-support-types";

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
    expect(loadingModel.header.chartContextSignal).toBe("—");
  });

  it("prefers backend display_metrics for market cap and price", () => {
    const stock = {
      symbol: "BSC",
      name: "BSC",
      exchange: "DSE",
      market_cap: 6000,
    } as BackendStockDto;
    const prices = [
      { trade_date: "2026-07-08", close_price: 100, open_price: 99, high_price: 101, low_price: 98, volume: 1000 },
      { trade_date: "2026-07-09", close_price: 120, open_price: 118, high_price: 121, low_price: 117, volume: 1100 },
    ] as BackendDailyPriceDto[];
    const decisionSupport = {
      valuation: {
        close_price: 100,
        market_cap: 6600,
        pe_ratio: 12,
        pb_ratio: 1.2,
        dividend_yield: 2,
        earnings_yield: 8,
        interpretations: [],
        valuation_date: "2026-07-08",
        source: "AMARSTOCK_API",
      },
    } as unknown as StockDecisionSupportDto;

    const model = buildStockWorkspaceModel(stock, prices, {
      decisionSupport,
      displayMetrics: {
        current_price: 120,
        pe_ratio: 14.4,
        pb_ratio: 1.44,
        earnings_yield: 6.67,
        market_cap: 7920,
        marked_to_latest_price: true,
        pe_helper: "Marked to latest price",
        as_of_trade_date: "2026-07-09",
      },
    });

    expect(model.header.marketCap).toBe(formatMarketCapBdt(7920));
    expect(model.header.latestPrice).toBe("120");
    expect(model.header.chartContextSignal).not.toBe("BUY");
  });
});

describe("market cap formatting", () => {
  it("treats AmarStock million-BDT caps as absolute BDT", () => {
    expect(normalizeMarketCapToAbsoluteBdt(25143.544)).toBeCloseTo(25_143_544_000, 0);
    expect(formatMarketCapBdt(25143.544)).toMatch(/B$/);
  });

  it("scales metadata and body market cap from the same inputs", () => {
    const stock = {
      symbol: "BSC",
      name: "BSC",
      exchange: "DSE",
      market_cap: 6000,
    } as BackendStockDto;
    const prices = [
      { trade_date: "2026-07-08", close_price: 118, open_price: 117, high_price: 119, low_price: 116, volume: 1000 },
      { trade_date: "2026-07-09", close_price: 120, open_price: 118, high_price: 121, low_price: 117, volume: 1100 },
    ] as BackendDailyPriceDto[];
    const decisionSupport = {
      valuation: {
        close_price: 100,
        market_cap: 6600,
        pe_ratio: 12,
        pb_ratio: 1.2,
        dividend_yield: 2,
        earnings_yield: 8,
        interpretations: [],
        valuation_date: "2026-07-08",
        source: "AMARSTOCK_API",
      },
    } as unknown as StockDecisionSupportDto;

    const model = buildStockWorkspaceModel(stock, prices, { decisionSupport });
    const decisionModel = buildStockDecisionViewModel({
      ...decisionSupport,
      stock_id: "test",
      symbol: "BSC",
      exchange: "DSE",
      opportunity: { score: 50, components: [] },
      risk: { score: 40, label: "MEDIUM", components: [] },
      price_position: { current_price: 120, distance_to_support_percent: null, distance_to_resistance_percent: null, above_sma20_percent: null, above_ema20_percent: null },
      trade_plan: { entry_zone_low: null, entry_zone_high: null, stop_loss: null, target_low: null, target_high: null, risk_reward_ratio: null, explanation: "" },
      liquidity: { label: "NORMAL", average_volume: null, latest_volume_ratio: null, volume_consistency_score: 0, average_turnover: null, explanation: "" },
      warnings: [],
      data_freshness: { latest_trade_date: "2026-07-09", ohlcv_row_count: 2, is_stale: false, is_sparse: false, missing_fields: [], data_quality: "OK", source_summary: "" },
      support: null,
      resistance: null,
      trend: "UPTREND",
      patterns: [],
      primary_pattern: null,
      breakout: null,
      ownership: null,
      events: [],
      decision: { recommendation: "WAIT", confidence: 50, reasoning: [] },
    } as StockDecisionSupportDto);
    const summary = buildStockSemanticSummary(model, decisionModel);

    expect(model.header.marketCap).toBe(resolveDisplayedMarketCap(stock, model.intelligence, decisionSupport));
    expect(summary).toContain(`Current market cap is BDT ${model.header.marketCap}`);
  });
});

describe("reactive fundamentals", () => {
  it("uses backend display_metrics P/E when present (Rule #1)", () => {
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
      {
        current_price: 28.1,
        pe_ratio: 37.47,
        pb_ratio: null,
        earnings_yield: 2.67,
        market_cap: 1525,
        marked_to_latest_price: true,
        pe_helper: "Marked to latest price",
        as_of_trade_date: "2026-07-09",
      },
    );

    const pe = fundamentals.metrics.find((metric) => metric.key === "pe");
    expect(pe?.stock).toBe("37.47");
    expect(pe?.helper).toBe("Marked to latest price");
  });

  it("shows P/E row with EPS unavailable helper when EPS is missing", () => {
    const decision = {
      available: true,
      valuation: {
        close_price: 180,
        market_cap: 7900,
        pe_ratio: null,
        pb_ratio: 2.1,
        dividend_yield: 1.2,
        earnings_yield: null,
        interpretations: [],
        valuation_date: "2026-07-09",
        source: "AMARSTOCK_API",
      },
    } as unknown as StockDecisionViewModel;

    const fundamentals = buildFundamentalsViewModel(decision, { metrics: [], latest_fiscal_year: null, latest_as_of_date: null }, null, 180);
    const pe = fundamentals.metrics.find((metric) => metric.key === "pe");

    expect(pe?.stock).toBe("—");
    expect(pe?.helper).toBe("EPS unavailable");
  });
});
