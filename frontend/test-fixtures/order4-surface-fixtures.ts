import { entryWorkspace } from "./current-entry-fixtures";
import type { BackendMarketPulseDto, BackendScoredUniverseRowDto } from "@/lib/api/backend-api-types";
import type { StockDecisionSupportDto } from "@/lib/api/stock-decision-support-types";

export function order4SurfaceFixture() {
  const base = entryWorkspace(); base.display_metrics.current_price = 103;
  const stock = { ...base.stock, name: "Test Limited", sector: "Textile", category: "A", market_cap: null };
  const assessment = { ...base.decision_support.entry_applicability, status: "OUTSIDE_ZONE", reason_code: "ABOVE_ENTRY_ZONE" };
  const decision = { recommendation: "BUY", display_action: "POTENTIAL_BUY", decision_taxonomy_version: "v2", canonical: { stock_id: "stock-1", exchange: "DSE", as_of_date: "2026-11-10", decision_taxonomy_version: "v2", action_taxonomy: "TRADER_DECISION_V2" }, confidence: 72, evidence_status: "BULLISH", reason: "Dated bullish setup", primary_reason_code: "bullish_setup_breakout", measured_support_component: { key: "trend", label: "Trend", score: 70, weight: 0.3, explanation: "Source trend fact" }, opposing_constraint_code: "lower_structure", entry_applicability: assessment, opportunity_score: 65, risk_label: "SPECULATIVE" };
  const row = { stock, decision, entry_applicability: assessment, display_quote: base.display_metrics,
    technical_snapshot: { latest_price: 110, latest_trade_date: "2026-11-10", price_change_percent: 2, trend: "UPTREND", volume: 1000, average_volume: 900, rsi: 55, volume_behavior: "NORMAL" },
    session: { latest_trade_date: "2026-11-10", volume: 1000 },
    shortlist: { entry_rank: 2, risk_rank: 3, volume_rank: 4, holder_exit_rank: 5, version: "1" },
    scanner: { matches: [{ condition_id: "MOMENTUM_CONTINUATION", reason_code: "uptrend_positive_5d_return", rank: 2, rank_score: 60, capacity_score: 5000 }] },
  } as unknown as BackendScoredUniverseRowDto;
  const support = { ...base.decision_support, symbol: stock.symbol, stock_id: stock.id, decision_session_date: "2026-11-10", decision: { ...decision, reasoning: [] }, entry_applicability: assessment,
    opportunity: { score: 65, components: [decision.measured_support_component] }, risk: { score: 80, label: "SPECULATIVE", components: [] },
    price_position: { current_price: 110 }, trade_plan: { ...base.decision_support.trade_plan, status: "VALID_ENTRY_PLAN", entry_timing: "BREAKOUT" },
    liquidity: { label: "NORMAL", latest_volume_ratio: 1.1, explanation: "", average_volume: 900 }, warnings: [],
    data_freshness: { is_stale: false, is_sparse: false, latest_trade_date: "2026-11-10", ohlcv_row_count: 80, missing_fields: [] },
    support: 94, resistance: 112, trend: "UPTREND", patterns: [], primary_pattern: null, breakout: null, ownership: null, valuation: null, events: [],
  } as unknown as StockDecisionSupportDto;
  const focus = { stock_id: stock.id, symbol: stock.symbol, name: stock.name, exchange: "DSE", recommendation: "POTENTIAL_BUY", decision_taxonomy_version: "v2", decision_session_date: "2026-11-10", rank: 1, pulse_score: 84, score_breakdown: { trend: 25, momentum: 20, volume: 18, signal_boost: 25, risk_penalty: 4, total: 84, contributors: [], band: "Worth Watching" },
    focus_label: "Potential Buy Setup", label_tone: "positive", why_here: ["Uptrend evidence"], trigger: "Do not treat this legacy trigger as current entry", action_summary: "Dated attention", latest_price: "110.00", price_change_percent: "+2.00%", price_tone: "positive", sparkline_points: [], entry_applicability: assessment, display_quote: base.display_metrics,
    controlling_reason_code: "lower_structure", entry_risk_label: "SPECULATIVE" };
  const pulse = { market_sync_id: "decision-1", decision_generation_id: "decision-1", quote_generation_id: "quote-1", decision_status: "CURRENT", hero: { greeting: "Hello", attention_headline: "Focus", attention_subline: "", last_updated_label: null, relative_updated_label: null, session_label: "OPEN", focus_count: 1, recent_focus_count: 0 },
    since_last_visit: { visible: false, new_changes_count: 0, new_focus_count: 0, new_alerts_count: 0, summary_label: "" }, focus_stocks: [focus], monitor_candidates: [focus], briefing: null, today_insight: null, changes: [], alerts: [], empty_state: "none", empty_message: null, data_quality_note: null,
    coverage: { market_status: "PRE_OPEN", decision_session_date: "2026-11-10", session_trade_date: "2026-11-10", breadth: { cohort: "CANONICAL_ELIGIBLE_SAME_SESSION", as_of_date: "2026-11-10", source: "canonical", neutral_band_percent: 0.05, advancing: 1, declining: 0, unchanged: 0, known_count: 1, unknown_count: 1, cohort_count: 2, denominator: 1 } },
  } as unknown as BackendMarketPulseDto;
  return { row, support, pulse };
}
