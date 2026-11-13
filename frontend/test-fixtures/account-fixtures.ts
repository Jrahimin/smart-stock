import type { BackendPortfolioHoldingDto, BackendPortfolioWorkspaceDto, BackendUserWatchlistDto } from "@/lib/api/backend-api-types";

export function accountRow(overrides: Partial<BackendPortfolioHoldingDto> = {}): BackendPortfolioHoldingDto {
  return { watchlist_item_id: "watch-1", stock_id: "stock-1", is_holding: true, symbol: "TEST", name: "Test Limited", exchange: "DSE", sector: null,
    quantity: "10", average_buy_price: "100", note: null, current_price: "103", previous_close: "101", price_change: "2", price_change_percent: "1.98", price_status: "FINALIZED", latest_trade_date: "2026-11-10",
    display_quote: { current_price: 103, previous_close: 101, price_change: 2, price_change_percent: 1.98, as_of_trade_date: "2026-11-10", observation_session_date: "2026-11-10", observation_status: "FINALIZED", source: "fixture", source_observed_at: "2026-11-10T08:00:00Z" },
    decision_session_date: "2026-11-10", decision_taxonomy_version: "v2", primary_reason_code: "constructive_watch",
    invested_amount: "1000", current_value: "1030", unrealized_gain_amount: "30", unrealized_gain_percent: "3.00", portfolio_weight: "100", estimated_daily_change_amount: "20", estimated_daily_contribution_percent: "1.98",
    action: "SELL", holder_action: "REDUCE", trend: "UPTREND", risk: "MEDIUM", rsi: null, support: null, resistance: null, scanner_conditions: [], relevant_event: null, decision_reason: null, what_next_code: "REVIEW_SELL_OR_REDUCE", requires_attention: true, ...overrides };
}

export function accountWorkspace(row = accountRow()): BackendPortfolioWorkspaceDto {
  return { meta: { exchange: "DSE", market_sync_id: "q1", quote_generation_id: "q1", decision_generation_id: "d1", decision_session_date: "2026-11-10", decision_status: "CURRENT", published_market_date: "2026-11-10", live_data_as_of: null, data_state: "FINALIZED", is_provisional: false, total_watchlisted: 1, holding_count: 1, valued_holding_count: 1, costed_holding_count: 1 },
    pulse: { known_current_value: "1030", current_value_is_complete: true, known_invested_amount: "1000", invested_amount_is_complete: true, known_unrealized_gain_amount: "30", known_unrealized_gain_percent: "3.00", unrealized_gain_is_complete: true, estimated_daily_change_amount: "20", estimated_daily_change_percent: "1.98", daily_change_is_complete: true, holding_count: 1, valued_holding_count: 1 }, holdings: [row], watchlist_items: [row], attention: [],
    shape: { position_exposure: [], sector_exposure: [], action_groups: [], largest_holding: null, strongest_position: null, weakest_position: null, best_daily_contributor: null, worst_daily_contributor: null }, watchlist_to_review: [] };
}

export function accountWatchItem(userId = "user-a"): BackendUserWatchlistDto {
  return { id: "watch-1", user_id: userId, stock_id: "stock-1", stock_symbol: "TEST", is_holding: true, quantity: 10, buy_price: 100, note: null, created_at: "2026-11-10T00:00:00Z", updated_at: "2026-11-10T00:00:00Z", unrealized_gain_percent: 3, has_note: false, watching_days: 0, watching_label: "Added today", current_price: 103, display_quote: accountRow().display_quote, trader_decision: null, technical_snapshot: null };
}
