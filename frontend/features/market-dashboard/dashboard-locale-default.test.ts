import { describe, expect, it } from "vitest";

import { buildMarketDashboardModel } from "@/features/market-dashboard/view-models/market-dashboard-view-model";
import { mapUniverseRowsToSignalFeed } from "@/features/market-dashboard/view-models/dashboard-sections-mapper";
import { DEFAULT_LOCALE } from "@/lib/locale/app-locale";

describe("useMarketDashboard locale alignment", () => {
  it("localizes signals when locale is omitted and defaults to bn", () => {
    const signals = mapUniverseRowsToSignalFeed([
      {
        stock: {
          id: "walton-id",
          symbol: "WALTONHIL",
          name: "WALTONHIL",
          exchange: "DSE",
          sector: "Engineering",
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
          rsi: 65.2,
          sma20: 95,
          ema20: 96,
          volatility: 1.2,
          support: 90,
          resistance: 110,
          trend: "UPTREND",
          data_quality: "OK",
          latest_trade_date: "2026-07-12",
          ohlcv_row_count: 90,
        },
        decision: {
          recommendation: "BUY",
          confidence: 79,
          reason: "Uptrend with favorable opportunity and acceptable reward potential.",
          opportunity_score: 78,
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
      },
    ]);

    const model = buildMarketDashboardModel([], null, null, {
      locale: DEFAULT_LOCALE,
      signals,
    });

    expect(model.signals[0]?.reason).toContain("Uptrend-এ ভালো সুযোগ আছে");
    expect(model.signals[0]?.reason).not.toContain("acceptable reward potential");
  });
});
