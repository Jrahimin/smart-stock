import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { TradePlanPanel } from "@/features/stock-workspace/components/trade-plan-panel";
import { getStockWorkspaceLanguage } from "@/features/stock-workspace/stock-workspace-language";

import type { StockDecisionSupportDto } from "@/lib/api/stock-decision-support-types";
import { buildStockDecisionViewModel } from "@/features/stock-workspace/view-models/stock-decision-view-model";
import { localizeEntryCondition, localizeSmartWarning } from "@/features/stock-workspace/stock-decision-language";

function buildDecisionFixture(overrides: Partial<StockDecisionSupportDto> = {}): StockDecisionSupportDto {
  return {
    stock_id: "1",
    symbol: "TEST",
    exchange: "DSE",
    decision: { recommendation: "BUY", confidence: 72,
        evidence_status: "MIXED", reasoning: [] },
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
  it("uses one risk owner for the headline and its explanation", () => {
    const tradingRisk = { score: 81, label: "HIGH" as const, components: [
      { key: "extension", label: "Extension", score: 88, weight: 1, explanation: "Trading risk only" },
    ] };
    const decision = buildDecisionFixture({ trading_risk: tradingRisk });
    const canonical = buildStockDecisionViewModel(decision, "en");
    expect(canonical).toMatchObject({ riskScore: 81, riskLabel: "HIGH",
      riskComponents: [{ key: "extension", explanation: "Trading risk only" }] });
    const legacy = buildStockDecisionViewModel({ ...decision, trading_risk: null }, "en");
    expect(legacy).toMatchObject({ riskScore: 35, riskLabel: "MEDIUM",
      riskComponents: [{ key: "volatility", explanation: "Elevated" }] });
  });
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
    expect(model.freshness.label).toBe("বাদ পড়া কার্যদিবস শনাক্ত হয়নি");
    expect(model.confidenceLabel).toBe("মিশ্র সংকেত");
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

  it("localizes entry condition prose in bn", () => {
    const model = buildStockDecisionViewModel(
      buildDecisionFixture({
        entry_applicability: { status: "APPLICABLE", reason_code: "ENTRY_TERMS_MET" },
        decision: {
          recommendation: "BUY",
          confidence: 83,
          reasoning: [],
          display_action: "POTENTIAL_BUY",
          entry_condition:
            "Enter only while the completed breakout holds above the preferred zone; reassess if participation fades or the invalidation is breached.",
        },
      }),
      "bn",
    );

    expect(model.entryCondition).toBe(
      "দাম উপরের range ভেঙে উঠে সেখানে টিকে থাকলে entry ভাবতে পারেন। তবে কেনাবেচা দুর্বল হলে বা দাম আবার নিচে নেমে গেলে একটু অপেক্ষা করুন।",
    );
    expect(model.entryCondition).not.toContain("Enter only while");
  });

  it("localizes priced entry condition in bn", () => {
    const localized = localizeEntryCondition(
      "Enter only after a completed close above 126.50 with confirming volume.",
      "bn",
    );

    expect(localized).toBe("126.50-এর উপরে দিন শেষ হলে এবং কেনার চাপ ভালো থাকলে entry ভাবতে পারেন।");
  });
});


describe("dated plan current-entry projection", () => {
  it("shows the dated plan for old responses and suppresses unverified entry guidance", () => {
    const old = buildDecisionFixture();
    old.trade_plan.status = "VALID_ENTRY_PLAN";
    old.decision.display_action = "POTENTIAL_BUY";
    old.decision.entry_condition = "Enter only after confirmation.";
    const model = buildStockDecisionViewModel(old, "en");
    expect(model.entryCondition).toBeNull();
    const rendered = renderToStaticMarkup(createElement(TradePlanPanel, { decision: model, copy: getStockWorkspaceLanguage("en").panels }));
    expect(rendered).toContain("Current entry not verified");
    expect(rendered).toContain("2026-07-10");
  });
  it("changes panel guidance after a recorded breach without replacing the dated action", () => {
    const old = buildDecisionFixture({ entry_applicability: { status: "INVALIDATED", reason_code: "STOP_BREACHED" } });
    old.trade_plan.status = "VALID_ENTRY_PLAN";
    old.decision.display_action = "POTENTIAL_BUY";
    old.decision.entry_condition = "Enter only after confirmation.";
    const model = buildStockDecisionViewModel(old, "en");
    expect(model.entryCondition).toBeNull();
    expect(model.recommendation).toBe("POTENTIAL BUY");
    const rendered = renderToStaticMarkup(createElement(TradePlanPanel, { decision: model, copy: getStockWorkspaceLanguage("en").panels }));
    expect(rendered).toContain("Plan invalidated");
    expect(rendered).toContain("price recovery does not restore");
    const bn = renderToStaticMarkup(createElement(TradePlanPanel, { decision: buildStockDecisionViewModel(old, "bn"), copy: getStockWorkspaceLanguage("bn").panels }));
    expect(bn).toContain("পরিকল্পনা বাতিল");
  });
});


describe("volume fact presentation", () => {
  it("does not infer above-average volume from a blended opportunity score", () => {
    const fixture = buildDecisionFixture();
    fixture.opportunity.components.find(c => c.key === "volume")!.score = 75;
    fixture.liquidity.latest_volume_ratio = 0.9;
    expect(buildStockDecisionViewModel(fixture, "en").decisionSignals.some(s => s.key === "volume_above_average")).toBe(false);
    fixture.liquidity.latest_volume_ratio = null;
    expect(buildStockDecisionViewModel(fixture, "en").decisionSignals.some(s => s.key === "volume_above_average" || s.key === "weak_volume_confirmation")).toBe(false);
  });
});
