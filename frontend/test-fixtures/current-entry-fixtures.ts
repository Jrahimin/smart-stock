import type { BackendMarketFreshnessDto } from "@/lib/api/backend-api-types";

export const ENTRY_NOW = Date.parse("2026-11-11T05:00:00Z"); // 11:00 Dhaka
export function entryFreshness(overrides: Partial<BackendMarketFreshnessDto> = {}): BackendMarketFreshnessDto {
  return { exchange: "DSE", trade_date: "2026-11-11", last_synced_at: "2026-11-11T05:00:00Z", market_sync_id: "quote-1", quote_generation_id: "quote-1", decision_generation_id: "decision-1", decision_status: "CURRENT", next_sync_at: null, snapshot_interval_minutes: 15, market_sync_interval_seconds: 900, dashboard_cache_ttl_seconds: 600, expected_delay_minutes: 15, market_open_time: "10:00", market_close_time: "15:00", market_status: "OPEN", freshness_label: "Fresh", ...overrides };
}
export function entryWorkspace(source = "2026-11-11T05:00:00Z", age = 60) {
  return { quote_generation_id: "quote-1", decision_generation_id: "decision-1", decision_status: "CURRENT", stock: { id: "stock-1", symbol: "TEST", exchange: "DSE" }, display_metrics: { current_price: 100, as_of_trade_date: "2026-11-11", observation_session_date: "2026-11-11", observation_status: "PROVISIONAL", source_observed_at: source, max_age_seconds: age, data_quality: "OK" }, decision_support: { stock_id: "stock-1", symbol: "TEST", exchange: "DSE", quote_generation_id: "quote-1", decision_generation_id: "decision-1", decision_status: "CURRENT", decision_session_date: "2026-11-10", decision: { display_action: "POTENTIAL_BUY", decision_taxonomy_version: "v2" }, trade_plan: { entry_zone_low: 98, entry_zone_high: 100, stop_loss: 94, target_low: 109, target_high: 112, risk_reward_ratio: 1.5 }, entry_applicability: { status: "APPLICABLE", reason_code: "ENTRY_TERMS_MET", assessed_at: source, source_observed_at: source, publication_observed_at: "2026-11-10T05:00:00Z", quote_session_date: "2026-11-11" } } };
}
export function entryUniverse() {
  const workspace = entryWorkspace();
  return { meta: { quote_generation_id: workspace.quote_generation_id, decision_generation_id: workspace.decision_generation_id, decision_status: workspace.decision_status }, rows: [{ stock: workspace.stock, display_quote: workspace.display_metrics, entry_applicability: workspace.decision_support.entry_applicability, decision: { ...workspace.decision_support.decision, entry_applicability: workspace.decision_support.entry_applicability } }] };
}
