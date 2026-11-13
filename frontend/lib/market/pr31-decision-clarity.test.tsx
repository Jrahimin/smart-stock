/** @vitest-environment jsdom */
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { EntryApplicabilityLabel } from "@/components/market/entry-applicability-label";
import { MarketOverview } from "@/features/market-dashboard/components/market-overview";
import { buildMarketDashboardModel } from "@/features/market-dashboard/view-models/market-dashboard-view-model";
import { mapDashboardSentimentDto } from "@/features/market-dashboard/view-models/dashboard-sections-mapper";
import { getTerminalCopy } from "@/features/market-dashboard/terminal-copy";
import { evaluateMarketIndexedDbEntry, MARKET_INDEXEDDB_SCHEMA_VERSION } from "./market-indexeddb-cache";
import { holderReasonLabel } from "./decision-presentation";
import { dashboardSectionMatchesOverview } from "@/features/market-dashboard/hooks/dashboard-query-key";
import type { EntryApplicabilityDto } from "@/lib/api/stock-decision-support-types";
import type { BackendDailyMarketSummaryDto, BackendDsexIndexSnapshotDto, BackendDashboardMarketSentimentDto } from "@/lib/api/backend-api-types";

afterEach(cleanup);
const summaries = [{ trade_date: "2026-11-10", exchange: "DSE", index_name: "DSEX", index_close: "5000", index_change: null, index_change_percent: null,
  total_volume: 100, total_turnover: null, advancing_issues: 3, declining_issues: 1, unchanged_issues: 0, data_quality_flag: "OK" }] as BackendDailyMarketSummaryDto[];
const legacy = { trade_date: "2026-11-10", index_name: "DSEX", market_status: "OPEN", index_close: "5000", index_change: "0", index_change_percent: "0", day_open: "5000", day_high: "5000", day_low: "5000", total_volume: 100,
  range_52w_low: "4500", range_52w_high: "5500", range_position_percent: "50", advancing_issues: 3, declining_issues: 1, unchanged_issues: 0 } as BackendDsexIndexSnapshotDto;
const sentiment = { exchange: "DSE", market_sync_id: "gA", session_trade_date: "2026-11-10", has_partial_data: false, market_mood: "Unknown", signal_count: 0, price_backed_count: 4, turnover_value: null, insights: [],
  interpretation: { code: "BREADTH_ONLY", as_of_date: "2026-11-10", index_change_percent: null, volume_vs_average: null, volume_average_sessions: 0,
    breadth: { cohort: "ACTIVE_VALID_OHLC", as_of_date: "2026-11-10", source: "daily_prices", neutral_band_percent: 0, advancing: 3, declining: 1, unchanged: 0, known_count: 4, unknown_count: 0, cohort_count: 4, denominator: 4 } } } as BackendDashboardMarketSentimentDto;

it.each(["matching", "not-loaded", "mismatch-withheld", "failed", "legacy", "next-matching"].flatMap(order => ["en", "bn"].map(locale => ({ order, locale: locale as "en" | "bn" }))))("SSR/root boundary never invents flat movement: $order ($locale)", ({ order, locale }) => {
  const mapped = order === "matching" || order === "next-matching" ? mapDashboardSentimentDto(sentiment) : order === "legacy" ? mapDashboardSentimentDto({ ...sentiment, interpretation: null }) : undefined;
  const model = buildMarketDashboardModel(summaries, legacy, null, { locale, insights: mapped?.insights });
  const node = document.createElement("div"); node.innerHTML = renderToStaticMarkup(<MarketOverview model={model} copy={getTerminalCopy(locale)} locale={locale} loading={false} leadersLoading={false} />);
  expect(node.querySelector(".sw-index-value")?.textContent).toBe("5,000.00"); expect(node.querySelector(".sw-index > b")).toBeNull();
  expect(model.pulse.indexDayStats).toBeNull(); expect(model.pulse.indexChangePercent).toBeNull();
  expect(node.querySelector("h1")?.textContent).not.toMatch(/flat|সমতল/);
});
it("distinguishes a recorded measured zero from a legacy fabricated zero", () => {
  const measured = summaries.map(row => ({ ...row, index_change: "0", index_change_percent: "0" }));
  const model = buildMarketDashboardModel(measured, { ...legacy, day_open: null, day_high: null, day_low: null });
  expect(model.pulse.indexChangeLabel).toBe("0.00 (0%)"); expect(model.pulse.indexDayStats).toBeNull();
  expect(buildMarketDashboardModel(measured, null).pulse.indexDayStats).toBeNull();
});
it("rejects old persisted overview shape but keeps other sections and upgraded overview", () => {
  const payload = { cacheKey: "/dashboard/overview", expiresAt: Date.now()+60000, marketSchemaVersion: MARKET_INDEXEDDB_SCHEMA_VERSION, data: { dsex_index: legacy, summaries } };
  expect(evaluateMarketIndexedDbEntry(payload, { expectedScope: "market", cacheKey: "/dashboard/overview" })).toMatchObject({ status: "miss", reason: "schema" });
  expect(evaluateMarketIndexedDbEntry({ ...payload, data: { ...payload.data, index_snapshot_version: 2 } }, { expectedScope: "market", cacheKey: "/dashboard/overview" }).status).toBe("hit");
  expect(evaluateMarketIndexedDbEntry(payload, { expectedScope: "market", cacheKey: "/dashboard/movers" }).status).toBe("hit");
});
it.each(["en", "bn"] as const)("keeps no-check neutral/disclosed and uses the controlling cause (%s)", locale => {
  const assessment = { status: "UNVERIFIED", reason_code: "QUOTE_UNUSABLE", quote_timing_status: "FETCH_ONLY", quote_session_date: "2026-11-10", assessed_at: "2026-11-12T05:00:00Z" } as EntryApplicabilityDto;
  const { container, rerender } = render(<EntryApplicabilityLabel assessment={assessment} locale={locale} />);
  const disclosure = container.querySelector("details")!; expect(disclosure.open).toBe(false); expect(disclosure.closest("a")).toBeNull(); expect(container.querySelector(".entry-check-alert")).toBeNull();
  const trigger = screen.getByText(locale === "en" ? "Check live price before entry" : "Entry-এর আগে broker-এর দাম মিলিয়ে নিন"); fireEvent.click(trigger);
  expect(container.textContent).toContain(locale === "en" ? "Last saved price: 10 Nov" : "শেষ সংরক্ষিত দাম: 10 নভেম্বর");
  rerender(<EntryApplicabilityLabel assessment={{ ...assessment, reason_code: "COVERAGE_UNKNOWN" }} locale={locale} />);
  expect(container.textContent).not.toContain(locale === "en" ? "Last saved price:" : "শেষ সংরক্ষিত দাম:");
  rerender(<EntryApplicabilityLabel assessment={{ ...assessment, source_observed_at: "2026-11-10T08:15:00Z", quote_timing_status: null }} locale={locale} />);
  expect(container.textContent).not.toContain(locale === "en" ? "The time of this price is unknown." : "দামটি কখনের, তা নিশ্চিত নয়।");
});
it.each(["NOT_APPLICABLE", "INVALIDATED", "EXPIRED"] as const)("keeps only actionable rare negative statuses in a warning box (%s)", status => {
  const { container } = render(<EntryApplicabilityLabel assessment={{ status, reason_code: status === "EXPIRED" ? "PLAN_EXPIRED" : status === "INVALIDATED" ? "STOP_BREACHED" : "ACTION_NOT_PERMITTED" }} />);
  if (status === "NOT_APPLICABLE") expect(container.textContent).toBe(""); else expect(container.querySelector(".entry-check-alert")).not.toBeNull();
});
it.each(["en", "bn"] as const)("gives holders extension and neutral fallback wording (%s)", locale => {
  expect(holderReasonLabel("overextended_price", "Price too extended for fresh entry", locale)).toContain(locale === "en" ? "Protect gains" : "লাভ সুরক্ষিত");
  expect(holderReasonLabel("future_code", "fresh entry forbidden", locale)).not.toContain("fresh entry");
});
it("joins explicit section identities but preserves independently dated timeline entries and legacy sections", () => {
  expect(dashboardSectionMatchesOverview({ market_sync_id: "gA" }, { market_sync_id: "gB" })).toBe(false);
  expect(dashboardSectionMatchesOverview({ market_sync_id: "gB" }, { market_sync_id: "gB" })).toBe(true);
  expect(dashboardSectionMatchesOverview({ market_sync_id: "gA" }, {})).toBe(true);
});


it.each(["en", "bn"] as const)("renders closing eligibility with a dated basis and no pause instruction (%s)", locale => {
  const {container} = render(<EntryApplicabilityLabel locale={locale} assessment={{status:"APPLICABLE",reason_code:"ENTRY_TERMS_MET",price_basis:"LAST_CLOSE",quote_session_date:"2026-11-12",assessed_at:"2026-11-12T20:00:00+06:00"}} />);
  expect(container.textContent).toContain(locale === "en" ? "12 Nov close" : "12 নভেম্বর close");
  expect(container.textContent).not.toContain("recheck at opening");
  expect(container.textContent).not.toContain("খুললে আবার");
});
