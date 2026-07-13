import { describe, expect, it } from "vitest";

import type { BackendDailyMarketSummaryDto, BackendDsexIndexSnapshotDto } from "@/lib/api/backend-api-types";
import { getDashboardLanguage } from "@/features/market-dashboard/dashboard-language";
import {
  buildMarketDashboardModel,
  resolveMarketNarrativeKey,
} from "@/features/market-dashboard/view-models/market-dashboard-view-model";
import { mapUniverseRowsToSignalFeed } from "@/features/market-dashboard/view-models/dashboard-sections-mapper";
import {
  getDashboardGuideDialogs,
  getGuideControls,
  getGuideNudgeCopy,
  getMobileIntroDialogs,
  getSidebarGuideDialogs,
} from "@/features/guide/dialogs/dashboard-dialogs";
import { getDashboardMobileGuideSteps } from "@/features/guide/config/mobile-intro-guide";
import { getDashboardSidebarGuideSteps } from "@/features/guide/config/dashboard-sidebar-guide";
import { DEFAULT_LOCALE, LOCALE_COOKIE_NAME, parseAppLocale } from "@/lib/locale/app-locale";

describe("app locale", () => {
  it("defaults to bn for missing or invalid cookie values", () => {
    expect(parseAppLocale(undefined)).toBe("bn");
    expect(parseAppLocale("fr")).toBe("bn");
    expect(DEFAULT_LOCALE).toBe("bn");
    expect(LOCALE_COOKIE_NAME).toBe("smart-stock-locale");
  });

  it("parses supported locales", () => {
    expect(parseAppLocale("bn")).toBe("bn");
    expect(parseAppLocale("en")).toBe("en");
  });
});

describe("dashboard language", () => {
  it("returns bn narratives with english digits", () => {
    const language = getDashboardLanguage("bn");
    const text = language.breadthSummary(120, 80, 45);
    expect(text).toContain("120");
    expect(text).toContain("80");
    expect(text).not.toMatch(/[০-৯]/);
  });

  it("keeps en model pulse insights from metrics path", () => {
    const model = buildMarketDashboardModel([], null, null, { locale: "en" });
    expect(model.pulse.turnoverContext.insight).toBeTruthy();
  });
});

describe("market narrative keys", () => {
  it("resolves the same key regardless of display locale", () => {
    const key = resolveMarketNarrativeKey({
      direction: "buyers",
      indexChangePercent: 0.5,
      advancing: 120,
      declining: 80,
    });

    expect(key).toBe("early_recovery");
    expect(getDashboardLanguage("en").narratives[key]).toMatch(/strength/i);
    expect(getDashboardLanguage("bn").narratives[key]).toContain("বাজার");
  });

  it("applies resolveMarketNarrativeKey to rendered bn breadth insight", () => {
    const summaries = [
      {
        trade_date: "2026-07-09",
        exchange: "DSE",
        index_name: "DSEX",
        index_close: "6250.12",
        index_change: "77.5",
        index_change_percent: "1.25",
        total_turnover: "1250000000",
        total_volume: 95000000,
        total_trades: 12000,
        advancing_issues: 120,
        declining_issues: 80,
        unchanged_issues: 45,
        data_quality_flag: "VALIDATED",
      },
    ] as unknown as BackendDailyMarketSummaryDto[];

    const dsex = {
      trade_date: "2026-07-09",
      index_name: "DSEX",
      market_status: "OPEN",
      index_close: "6250.12",
      index_change: "77.5",
      index_change_percent: "1.25",
      day_open: "6200",
      day_high: "6260",
      day_low: "6190",
      range_52w_low: "5000",
      range_52w_high: "7000",
      range_position_percent: "62.5",
      return_1m_percent: "2.1",
      return_6m_percent: "8.4",
      return_1y_percent: "12.0",
      total_turnover: "1250000000",
      total_volume: 95000000,
      advancing_issues: 120,
      declining_issues: 80,
      unchanged_issues: 45,
    } as BackendDsexIndexSnapshotDto;

    const model = buildMarketDashboardModel(summaries, dsex, null, {
      locale: "bn",
      listedStockCount: 400,
      priceBackedCount: 200,
    });

    const expectedKey = resolveMarketNarrativeKey({
      direction: model.pulse.marketDirection,
      indexChangePercent: model.pulse.indexChangePercent,
      advancing: 120,
      declining: 80,
    });

    expect(model.pulse.breadthContext.insight).toBe(getDashboardLanguage("bn").narratives[expectedKey]);
    expect(model.pulse.breadthContext.insight).not.toBe("Buyers Dominating");
  });
});

describe("dashboard guide dialogs", () => {
  it("serves english mascot and sidebar copy in en mode", () => {
    expect(getDashboardGuideDialogs("en").welcome.eyebrow).toContain("Welcome");
    expect(getSidebarGuideDialogs("en").dashboard.eyebrow).toContain("Dashboard");
    expect(getGuideControls("en").next).toBe("Next");
    expect(getDashboardSidebarGuideSteps("en")[0]?.dialog.eyebrow).toContain("Welcome");
    expect(getDashboardMobileGuideSteps("en")[0]?.dialog.eyebrow).toContain("Welcome");
    expect(getGuideNudgeCopy("en").title).toMatch(/tour/i);
  });

  it("keeps unchanged bangla mascot copy in bn mode", () => {
    expect(getDashboardGuideDialogs("bn").welcome.eyebrow).toBe("👋 স্বাগতম");
    expect(getGuideControls("bn").next).toBe("তারপর");
    expect(getMobileIntroDialogs("bn").welcome.eyebrow).toBe("👋 স্বাগতম");
    expect(getGuideNudgeCopy("bn").accept).toBe("হ্যাঁ, শুরু করি");
  });
});

describe("dashboard signal localization", () => {
  it("localizes trader decision reasons in bn model output", () => {
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
      locale: "bn",
      signals,
    });

    expect(model.signals[0]?.reason).toContain("Uptrend-এ ভালো সুযোগ আছে");
    expect(model.signals[0]?.reason).toContain("Volume স্বাভাবিকের তুলনায় 1.5 গুণ");
    expect(model.signals[0]?.reason).not.toContain("acceptable reward potential");
  });
});
