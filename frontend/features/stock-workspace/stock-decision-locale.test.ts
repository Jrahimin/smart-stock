import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { StockDurableSummary } from "@/features/stock-workspace/components/stock-durable-summary";
import { StockWorkspaceHeader } from "@/features/stock-workspace/components/stock-workspace-header";
import { buildStockWorkspaceModel } from "@/features/stock-workspace/view-models/stock-workspace-view-model";
import type { StockWorkspaceDto } from "@/lib/api/stock-decision-support-types";
import { TraderDecisionCard } from "@/features/stock-workspace/components/trader-decision-card";
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
        evidence_status: "MIXED", display_action: "WAIT", reasoning: [],
        measured_support_component: { key: "volume", label: "Volume", score: 42, weight: 0.2, explanation: "Weak" },
        opposing_constraint_code: "near_resistance" },
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

    expect(model.decisionSignals.map((signal) => signal.key)).toEqual(["selected_limitation", "selected_support"]);
    expect(model.decisionSignals[1].text).toContain("8.4");
    expect(model.decisionSignals[0].text).toContain("resistance");
    expect(model.warnings[0]?.title).toBe("Resistance-এর কাছে");
    expect(model.warnings[0]?.message).toContain("breakout");
    expect(model.opportunityComponents[0]?.label).toBe("Trend");
    expect(model.riskLabel).toBe("মাঝারি");
    expect(model.liquidity.label).toBe("কম");
    expect(model.liquidity.volumeRatio).toBe("গড়ের 0.6x");
    expect(model.freshness.label).toBe("বাদ পড়া কার্যদিবস শনাক্ত হয়নি");
    expect(model.confidenceLabel).toBe("মিশ্র সংকেত");
  });

  it("localizes rsi overheated warning using a typed measured value", () => {
    const localized = localizeSmartWarning(
      {
        code: "rsi_overheated",
        title: "RSI overheated",
        message: "RSI at 99.9 suggests extended momentum.",
        parameters: { rsi: 78.5 },
        severity: "warning",
      },
      "bn",
    );

    expect(localized.title).toBe("RSI বেশি উঁচু");
    expect(localized.message).toContain("78.5");
  });

  it("keeps en decision copy unchanged", () => {
    const model = buildStockDecisionViewModel(buildDecisionFixture(), "en");
    expect(model.decisionSignals[1]?.text).toBe("Volume contributes 8.4 setup points.");
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
      "প্রকাশিত শর্ত: দাম উপরের range ভেঙে উঠে সেখানে টিকে থাকলে entry ভাবতে পারেন। তবে কেনাবেচা দুর্বল হলে বা দাম আবার নিচে নেমে গেলে একটু অপেক্ষা করুন।",
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
    const rendered = renderToStaticMarkup(createElement(TraderDecisionCard, { decision: model, copy: getStockWorkspaceLanguage("en").decision }));
    expect(rendered).toContain("Current entry unverified");
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
    const rendered = renderToStaticMarkup(createElement(TraderDecisionCard, { decision: model, copy: getStockWorkspaceLanguage("en").decision }));
    expect(rendered).toContain("Plan invalidated");
    expect(rendered).toContain("price recovery does not restore");
    const bn = renderToStaticMarkup(createElement(TraderDecisionCard, { decision: buildStockDecisionViewModel(old, "bn"), copy: getStockWorkspaceLanguage("bn").decision }));
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


describe("fixed price-scale trade plan", () => {
  it("keeps preferred entry 98–100, stop94 and target109–112 separate from reference110 and mark103", () => {
    const dto = buildDecisionFixture();
    dto.decision.display_action = "POTENTIAL_BUY";
    dto.price_position.current_price = 110;
    dto.trade_plan = { ...dto.trade_plan, status: "VALID_ENTRY_PLAN", entry_zone_low: 97, entry_zone_high: 101, preferred_entry_zone_low: 98, preferred_entry_zone_high: 100, stop_loss: 94, target_low: 109, target_high: 112, risk_reward_ratio: 1.5 };
    dto.entry_applicability = { status: "OUTSIDE_ZONE", reason_code: "ABOVE_ENTRY_ZONE" };
    const metrics = { current_price: 103 } as Parameters<typeof buildStockDecisionViewModel>[2];
    const model = buildStockDecisionViewModel(dto, "en", metrics);
    expect(model.tradePlanVisual).toMatchObject({ entryLow: 98, entryHigh: 100, reference: 110, current: 103, stopLoss: 94, targetLow: 109, targetHigh: 112, riskReward: 1.5 });
    const html = renderToStaticMarkup(createElement(TradePlanPanel, { decision: model, copy: getStockWorkspaceLanguage("en").panels }));
    expect(html).toContain("1.50×"); expect(html).toContain("98 – 100"); expect(html).toContain("109 – 112");
    expect(html).toContain("Decision reference 110");
    expect(html).not.toContain("trade-plan-rr-good");
    const moved = buildStockDecisionViewModel(dto, "en", { ...metrics!, current_price: 104 });
    const next = renderToStaticMarkup(createElement(TradePlanPanel, { decision: moved, copy: getStockWorkspaceLanguage("en").panels }));
    expect(html.match(/class="trade-plan-zone " style="[^"]+"/)?.[0]).toBe(next.match(/class="trade-plan-zone " style="[^"]+"/)?.[0]);
    const action = renderToStaticMarkup(createElement(TraderDecisionCard, { decision: model, copy: getStockWorkspaceLanguage("en").decision }));
    expect(action.indexOf("Outside entry terms")).toBeLessThan(action.indexOf("trader-decision-metrics"));
    expect(action).toContain("Current price is above the entry zone");
  });
  it("draws equal bounds as a tick and never draws missing quote, stop or target markers", () => {
    const dto = buildDecisionFixture();
    dto.trade_plan = { ...dto.trade_plan, entry_zone_low: 100, entry_zone_high: 100, stop_loss: null, target_low: null, target_high: null, management_mode: "TRAILING", trailing_rule: "Trail below completed-session structure.", status: "VALID_ENTRY_PLAN" };
    const model = buildStockDecisionViewModel(dto, "en");
    const html = renderToStaticMarkup(createElement(TradePlanPanel, { decision: model, copy: getStockWorkspaceLanguage("en").panels }));
    expect(html).toContain("trade-plan-tick");
    expect(html).not.toContain('class="trade-plan-dot ');
    expect(html).not.toContain('class="trade-plan-marker ');
    expect(html).not.toContain('class="trade-plan-zone ');
    expect(html).toContain("Trail below completed-session structure.");
  });
  it("uses pullback support-hold language without claiming that duration was measured", () => {
    const dto = buildDecisionFixture(); dto.decision.display_action = "POTENTIAL_BUY";
    dto.trade_plan.entry_timing = "PULLBACK";
    dto.entry_applicability = { status: "APPLICABLE", reason_code: "ENTRY_TERMS_MET", assessed_at: "2026-11-11T05:00:00Z", source_observed_at: "2026-11-11T05:00:00Z" };
    expect(buildStockDecisionViewModel(dto, "en").entryCondition).toBe("Quote is in the pullback zone; watch whether support holds.");
    expect(buildStockDecisionViewModel(dto, "bn").entryCondition).toContain("support টিকে থাকে কি না");
  });
  it("keeps missing and unknown actions unavailable instead of using chart or WAIT defaults", () => {
    const dto = buildDecisionFixture(); delete dto.decision.display_action;
    expect(buildStockDecisionViewModel(dto, "en").displayAction).toBeNull();
    dto.decision.display_action = "POTENTIAL_BUY"; dto.decision.decision_taxonomy_version = "future-v9";
    expect(buildStockDecisionViewModel(dto, "en").recommendation).toBe("Decision unavailable");
  });
});


describe("repair1 publication reading order and measured basis", () => {
  it.each(["en", "bn"] as const)("renders satisfied vs pending BREAKOUT and localized trailing management (%s)", (locale) => {
    const dto = buildDecisionFixture(); dto.decision.display_action = "POTENTIAL_BUY";
    dto.trade_plan.entry_timing = "BREAKOUT";
    dto.decision.entry_condition = "Enter only after a completed-session close confirms the trigger with acceptable participation.";
    dto.entry_applicability = { status: "APPLICABLE", reason_code: "ENTRY_TERMS_MET", assessed_at: "2026-11-11T05:00:00Z", source_observed_at: "2026-11-11T05:00:00Z" };
    const model = buildStockDecisionViewModel(dto, locale);
    const confirmed = renderToStaticMarkup(createElement(TraderDecisionCard, { decision: model, copy: getStockWorkspaceLanguage(locale).decision }));
    expect(confirmed).toContain(locale === "bn" ? "close ও volume নিশ্চিত হয়েছে" : "close and volume are confirmed");
    expect(confirmed).not.toContain("Enter only after a completed-session close");
    dto.entry_applicability = { status: "AWAITING_CONFIRMATION", reason_code: "COMPLETED_BREAKOUT_REQUIRED" };
    const pendingClose = renderToStaticMarkup(createElement(TraderDecisionCard, { decision: buildStockDecisionViewModel(dto, locale), copy: getStockWorkspaceLanguage(locale).decision }));
    expect(pendingClose).toContain(getStockWorkspaceLanguage(locale).panels.entryReason.COMPLETED_BREAKOUT_REQUIRED);
    expect(pendingClose).not.toContain(locale === "bn" ? "close ও volume নিশ্চিত হয়েছে" : "close and volume are confirmed");
    dto.entry_applicability.reason_code = "ENTRY_SESSION_PENDING";
    const pendingSession = renderToStaticMarkup(createElement(TraderDecisionCard, { decision: buildStockDecisionViewModel(dto, locale), copy: getStockWorkspaceLanguage(locale).decision }));
    expect(pendingSession).toContain(getStockWorkspaceLanguage(locale).panels.entryReason.ENTRY_SESSION_PENDING);
    dto.trade_plan.management_mode = "TRAILING"; dto.trade_plan.trailing_rule = "Trail below the latest completed-session structure or 2.0 ATR, whichever is higher.";
    dto.trade_plan.target_low = dto.trade_plan.target_high = null;
    const trail = renderToStaticMarkup(createElement(TradePlanPanel, { decision: buildStockDecisionViewModel(dto, locale), copy: getStockWorkspaceLanguage(locale).panels }));
    expect(trail).toContain(locale === "bn" ? "প্রকাশিত ATR-ভিত্তিক সীমা" : "2.0 ATR");
    if (locale === "bn") expect(trail).not.toContain("Trail below");
  });
  it.each(["en", "bn"] as const)("keeps elevated legacy-composite warning separate from LOW entry risk (%s)", (locale) => {
    const dto = buildDecisionFixture(); dto.risk.label = "HIGH";
    dto.trading_risk = { label: "LOW", score: 15, components: [] };
    dto.warnings = [{ code: "elevated_risk", title: "Elevated risk profile", message: "Risk level is HIGH; use conservative sizing.", severity: "WARNING" }];
    const model = buildStockDecisionViewModel(dto, locale);
    expect(model.riskLabel).toBe(locale === "bn" ? "কম" : "LOW");
    expect(model.warnings[0].message).toContain("HIGH");
    expect(model.warnings[0].message).toContain("composite");
    expect(model.warnings[0].message).not.toContain("LOW");
  });
  for (const locale of ["en", "bn"] as const) for (const status of ["CURRENT", "UPDATING"] as const) {
    it.each(["missing", "unknown"])(`agrees across composed header, durable summary and card (${locale}, ${status}, %s action)`, (actionKind) => {
      const dto = buildDecisionFixture(); dto.decision_session_date = "2026-11-10"; dto.decision_status = status;
      if (actionKind === "missing") delete dto.decision.display_action;
      else dto.decision.decision_taxonomy_version = "unknown-v99";
      const workspace = { stock: { id: "1", symbol: "TEST", name: "Test stock", exchange: "DSE", sector: "Textile" }, prices: [], decision_support: dto, display_metrics: { current_price: 103, observation_status: "NO_TRADE", observation_session_date: "2026-11-11", as_of_trade_date: "2026-11-10" } } as unknown as StockWorkspaceDto;
      const decision = buildStockDecisionViewModel(dto, locale);
      const model = buildStockWorkspaceModel(workspace.stock, [], { decisionSupport: dto, displayMetrics: workspace.display_metrics });
      const language = getStockWorkspaceLanguage(locale);
      const durable = renderToStaticMarkup(createElement(StockDurableSummary, { workspace, locale }));
      const header = renderToStaticMarkup(createElement(StockWorkspaceHeader, { model, decision, locale, copy: language.header }));
      const card = renderToStaticMarkup(createElement(TraderDecisionCard, { decision, copy: language.decision }));
      expect(durable).not.toContain("WAIT"); expect(card).not.toContain("WAIT");
      expect(header).toContain(`data-decision-status="${status}"`);
      expect(header).toContain("2026-11-10"); expect(header).toContain("2026-11-11");
      const current = durable.indexOf(language.panels.currentEntryUnverified);
      expect(current).toBeGreaterThan(0);
      expect(current).toBeLessThan(durable.indexOf(decision.confidenceLabel));
      expect(durable).toContain(locale === "bn" ? "সিদ্ধান্ত অনুপলব্ধ" : "Decision unavailable");
      expect(card).toContain(locale === "bn" ? "সিদ্ধান্ত অনুপলব্ধ" : "Decision unavailable");
    });
  }
});
