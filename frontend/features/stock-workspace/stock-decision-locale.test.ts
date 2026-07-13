import { describe, expect, it } from "vitest";

import type { StockDecisionSupportDto } from "@/lib/api/stock-decision-support-types";
import { buildStockDecisionViewModel } from "@/features/stock-workspace/view-models/stock-decision-view-model";
import { localizeSmartWarning } from "@/features/stock-workspace/stock-decision-language";

function buildDecisionFixture(overrides: Partial<StockDecisionSupportDto> = {}): StockDecisionSupportDto {
  return {
    stock_id: "1",
    symbol: "TEST",
    exchange: "DSE",
    decision: { recommendation: "BUY", confidence: 72, reasoning: [] },
    opportunity: {
      score: 68,
      components: [
        { key: "trend", label: "Trend", score: 72, weight: 0.3, explanation: "Uptrend" },
        { key: "momentum", label: "Momentum", score: 58, weight: 0.25, explanation: "Healthy" },
        { key: "volume", label: "Volume", score: 42, weight: 0.2, explanation: "Weak" },
      ],
    },
    risk: {
      score: 35,
      label: "MEDIUM",
      components: [{ key: "volatility", label: "Volatility", score: 40, weight: 0.3, explanation: "Elevated" }],
    },
    price_position: {
      current_price: 100,
      distance_to_support_percent: 2,
      distance_to_resistance_percent: 1,
      above_sma20_percent: 3,
      above_ema20_percent: 2,
    },
    trade_plan: {
      entry_zone_low: 98,
      entry_zone_high: 101,
      stop_loss: 94,
      target_low: 105,
      target_high: 110,
      risk_reward_ratio: 2.5,
      explanation: "Plan",
    },
    liquidity: {
      label: "THIN",
      average_volume: 1000,
      latest_volume_ratio: 0.6,
      volume_consistency_score: 0.5,
      average_turnover: 50000,
      explanation: "Average daily value traded is low.",
    },
    warnings: [
      {
        code: "near_resistance",
        title: "Near resistance",
        message: "Price is close to recent resistance; upside may need a breakout.",
        severity: "WARNING",
      },
    ],
    data_freshness: {
      is_stale: false,
      is_sparse: false,
      ohlcv_row_count: 120,
      latest_trade_date: "2026-07-10",
      missing_fields: [],
      data_quality: "good",
      source_summary: "DSE",
    },
    patterns: [],
    primary_pattern: null,
    breakout: null,
    ownership: null,
    valuation: null,
    events: [],
    support: 95,
    resistance: 102,
    trend: "UPTREND",
    ...overrides,
  };
}

describe("stock decision localization", () => {
  it("localizes decision signals and warnings in bn", () => {
    const model = buildStockDecisionViewModel(buildDecisionFixture(), "bn");

    expect(model.decisionSignals.some((signal) => signal.text === "Uptrend ঠিক আছে")).toBe(true);
    expect(model.decisionSignals.some((signal) => signal.text === "Resistance-এর কাছে")).toBe(true);
    expect(model.warnings[0]?.title).toBe("Resistance-এর কাছে");
    expect(model.warnings[0]?.message).toContain("breakout");
    expect(model.opportunityComponents[0]?.label).toBe("Trend");
    expect(model.riskLabel).toBe("মাঝারি");
    expect(model.liquidity.label).toBe("কম");
    expect(model.liquidity.volumeRatio).toBe("গড়ের 0.6x");
    expect(model.freshness.label).toBe("তাজা");
  });

  it("localizes rsi overheated warning with parsed value", () => {
    const localized = localizeSmartWarning(
      {
        code: "rsi_overheated",
        title: "RSI overheated",
        message: "RSI at 78.5 suggests extended momentum.",
        severity: "warning",
      },
      "bn",
    );

    expect(localized.title).toBe("RSI বেশি উঁচু");
    expect(localized.message).toContain("78.5");
  });

  it("keeps en decision copy unchanged", () => {
    const model = buildStockDecisionViewModel(buildDecisionFixture(), "en");
    expect(model.decisionSignals[0]?.text).toBe("Uptrend intact");
    expect(model.warnings[0]?.title).toBe("Near resistance");
  });
});
