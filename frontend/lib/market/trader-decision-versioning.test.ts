import { describe, expect, it } from "vitest";

import type {
  BackendCanonicalDecisionResultDto,
  BackendScoredUniverseRowDto,
  BackendTradingSignalDto,
  TraderRecommendation,
} from "@/lib/api/backend-api-types";
import { buildStockIntelligenceFromUniverseRow } from "@/lib/market/universe-intelligence";
import {
  getPreviousSessionRecommendation,
  isTraderDecisionChangedThisSession,
  resolveTraderDecision,
  resolveWatchlistAction,
} from "@/lib/market/trader-decision";

const STRATEGY_VERSION = "trading-intelligence-v1";
const THRESHOLD_VERSION = "trading-thresholds-v1";
const ACTION_TAXONOMY = "TRADER_DECISION_V2";

function canonical(recommendation: TraderRecommendation): BackendCanonicalDecisionResultDto {
  return {
    stock_id: "stock-1",
    exchange: "DSE",
    strategy_version: STRATEGY_VERSION,
    threshold_version: THRESHOLD_VERSION,
    action_taxonomy: ACTION_TAXONOMY,
    decision_taxonomy_version: "v2",
    as_of_date: "2026-07-14",
    previous_session_date: "2026-07-13",
    calculated_at: "2026-07-14T10:00:00Z",
    shared_decision_id: "decision-current",
    result_semantics: {
      recommendation: "DETERMINISTIC_CONTEXTUAL_ACTION",
      evidence_strength: "HEURISTIC_DIRECTIONAL_EVIDENCE",
    },
    recommendation,
    internal_action: recommendation,
    display_action:
      recommendation === "BUY"
        ? "POTENTIAL_BUY"
        : recommendation === "SELL"
          ? "SELL"
          : "WAIT",
    evidence_strength: 72,
    opportunity_score: 66,
    risk_label: "LOW",
    trade_plan_status: "VALID_ENTRY_PLAN",
    eligibility_status: "ELIGIBLE",
    primary_reason: "Canonical reason",
    primary_reason_code: "canonical_reason",
    stance: recommendation === "SELL" ? "BEARISH" : "BULLISH",
    non_holder_action: recommendation === "BUY" ? "BUY" : "AVOID",
    holder_action: recommendation === "SELL" ? "SELL" : "HOLD",
  };
}

function universeRow(recommendation: TraderRecommendation = "BUY"): BackendScoredUniverseRowDto {
  const identity = canonical(recommendation);
  return {
    stock: {
      id: "stock-1",
      symbol: "TEST",
      name: "Test Limited",
      exchange: "DSE",
      sector: "Bank",
      category: "A",
      isin: null,
      listing_date: null,
      lot_size: null,
      paid_up_capital: null,
      market_cap: null,
      is_active: true,
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-07-14T10:00:00Z",
    },
    technical_snapshot: {
      latest_price: 100,
      previous_close: 99,
      price_change: 1,
      price_change_percent: 1.01,
      volume: 100_000,
      average_volume: 80_000,
      turnover: 10_000_000,
      rsi: 58,
      sma20: 96,
      ema20: 97,
      volatility: 1.2,
      support: 92,
      resistance: 110,
      trend: "UPTREND",
      data_quality: "OK",
      latest_trade_date: "2026-07-14",
      ohlcv_row_count: 90,
    },
    decision: {
      recommendation,
      internal_action: recommendation,
      display_action: identity.display_action,
      decision_taxonomy_version: "v2",
      confidence: 72,
      reason: "Canonical reason",
      opportunity_score: 66,
      risk_label: "LOW",
      non_holder_action: identity.non_holder_action,
      holder_action: identity.holder_action,
      canonical: identity,
    },
    session: {
      latest_trade_date: "2026-07-14",
      close_price: 100,
      open_price: 99,
      volume: 100_000,
      turnover: 10_000_000,
      change_percent: 1.01,
      data_quality_flag: "OK",
      updated_at: "2026-07-14T10:00:00Z",
    },
  };
}

function persistedSignal(overrides: Partial<BackendTradingSignalDto> = {}): BackendTradingSignalDto {
  return {
    stock_id: "stock-1",
    trade_date: "2026-07-13",
    signal_type: "SELL",
    confidence: 0.7,
    momentum_score: null,
    trend_score: null,
    volume_score: null,
    risk_score: null,
    reason: "Prior canonical action",
    strategy_name: "canonical_trader",
    strategy_version: STRATEGY_VERSION,
    threshold_version: THRESHOLD_VERSION,
    action_taxonomy: ACTION_TAXONOMY,
    canonical_recommendation: "SELL",
    signal_as_of: "2026-07-13",
    calculated_at: "2026-07-13T10:00:00Z",
    shared_decision_id: "decision-prior",
    components: {},
    metadata: {},
    is_active: true,
    id: "signal-1",
    created_at: "2026-07-13T10:00:00Z",
    updated_at: "2026-07-13T10:00:00Z",
    ...overrides,
  };
}

describe("canonical decision and persisted signal versioning", () => {
  it("accepts only the matching immediately prior strategy snapshot for NEW", () => {
    const model = buildStockIntelligenceFromUniverseRow(
      universeRow("BUY"),
      persistedSignal(),
    );

    expect(getPreviousSessionRecommendation(model)).toBe("SELL");
    expect(isTraderDecisionChangedThisSession(model)).toBe(true);
    expect(resolveTraderDecision(model).recommendation).toBe("POTENTIAL_BUY");
  });

  it("ignores mismatched and legacy persisted signals", () => {
    const mismatched = buildStockIntelligenceFromUniverseRow(
      universeRow("BUY"),
      persistedSignal({ strategy_version: "other-v2" }),
    );
    expect(getPreviousSessionRecommendation(mismatched)).toBeNull();
    expect(isTraderDecisionChangedThisSession(mismatched)).toBe(false);

    const legacy = buildStockIntelligenceFromUniverseRow(
      universeRow("BUY"),
      persistedSignal({
        strategy_version: null,
        threshold_version: null,
        action_taxonomy: null,
        canonical_recommendation: null,
        signal_as_of: null,
      }),
    );
    expect(getPreviousSessionRecommendation(legacy)).toBeNull();
    expect(resolveTraderDecision(legacy).recommendation).toBe("POTENTIAL_BUY");
  });

  it("fails closed to WAIT and uses holder context without client formulas", () => {
    const unavailable = buildStockIntelligenceFromUniverseRow(universeRow());
    unavailable.traderDecision = null;
    unavailable.signal = { ...unavailable.signal, signal: "BUY", confidence: 99 };
    expect(resolveTraderDecision(unavailable).recommendation).toBe("WAIT");

    const bearish = buildStockIntelligenceFromUniverseRow(universeRow("SELL"));
    expect(resolveWatchlistAction(bearish, true)).toBe("SELL");
    expect(resolveWatchlistAction(bearish, false)).toBe("SELL");
  });
});
