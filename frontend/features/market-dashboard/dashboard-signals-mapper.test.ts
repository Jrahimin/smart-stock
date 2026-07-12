import { describe, expect, it } from "vitest";

import { mapUniverseRowsToSignalFeed } from "@/features/market-dashboard/view-models/dashboard-sections-mapper";
import type { BackendScoredUniverseRowDto } from "@/lib/api/backend-api-types";

function buildRow(symbol: string, rsi: number, opportunity: number): BackendScoredUniverseRowDto {
  return {
    stock: {
      id: `${symbol}-id`,
      symbol,
      name: symbol,
      exchange: "DSE",
      sector: "Bank",
      category: null,
      isin: null,
      listing_date: null,
      lot_size: null,
      paid_up_capital: null,
      market_cap: null,
      is_active: true,
      created_at: "2026-07-12T00:00:00Z",
      updated_at: "2026-07-12T00:00:00Z",
    },
    technical_snapshot: {
      latest_price: 100,
      previous_close: 98,
      price_change: 2,
      price_change_percent: 2,
      volume: 120_000,
      average_volume: 80_000,
      turnover: 1_000_000,
      rsi,
      sma20: 95,
      ema20: 96,
      volatility: 1.2,
      support: 90,
      resistance: 110,
      trend: "UPTREND",
      data_quality: "OK",
      latest_trade_date: "2026-07-12",
      ohlcv_row_count: 90,
      sparkline_closes: [95, 96, 97, 98, 100],
    },
    decision: {
      recommendation: "BUY",
      confidence: 79,
      reason: "Uptrend with favorable opportunity and acceptable reward potential.",
      opportunity_score: opportunity,
      risk_label: "LOW",
    },
    session: {
      latest_trade_date: "2026-07-12",
      close_price: 100,
      open_price: 99,
      volume: 120_000,
      turnover: 1_000_000,
      change_percent: 2,
      data_quality_flag: "OK",
      updated_at: "2026-07-12T00:00:00Z",
    },
  };
}

describe("mapUniverseRowsToSignalFeed", () => {
  it("differentiates cards with stock-specific technical context", () => {
    const feed = mapUniverseRowsToSignalFeed([
      buildRow("DELTALIFE", 61.2, 78),
      buildRow("EIL", 54.4, 76),
    ]);

    expect(feed).toHaveLength(2);
    expect(feed[0]?.reason).not.toBe(feed[1]?.reason);
    expect(feed[0]?.reason).toContain("RSI");
    expect(feed[0]?.supportingContext[0]).toContain("RSI 61.2");
    expect(feed[1]?.supportingContext[0]).toContain("RSI 54.4");
  });
});
