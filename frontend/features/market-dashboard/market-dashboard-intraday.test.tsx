/** @vitest-environment jsdom */
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";
import { MarketDashboardView } from "./market-dashboard-view";
import { buildMarketDashboardModel } from "./view-models/market-dashboard-view-model";
import { mapDashboardSentimentDto } from "./view-models/dashboard-sections-mapper";
import { getPremiumCopy } from "./premium-copy";
import { getTerminalCopy } from "./terminal-copy";
import { isCurrentIntradaySession } from "@/lib/market/market-session-engine";
import type { BackendDailyMarketSummaryDto, BackendMarketFreshnessDto, BackendDashboardMarketSentimentDto } from "@/lib/api/backend-api-types";

const state = vi.hoisted(() => ({ model: {} as unknown, freshness: {} as unknown }));
vi.mock("./hooks/use-market-dashboard", () => ({ useMarketDashboard: () => ({ model: state.model, freshness: state.freshness, freshnessLoading: false, isError: false,
  sectionLoading: { pulseCore: false, leaders: false, insights: false, heatmap: false, movers: false, signals: false, timeline: false } }) }));
vi.mock("./components/market-pulse-header", () => ({ MarketDashboardHeader: () => null }));
vi.mock("./components/institutional-heatmap", () => ({ InstitutionalHeatmap: () => null }));
vi.mock("./components/market-timeline", () => ({ MarketTimeline: () => null }));
vi.mock("./components/smart-signal-feed", () => ({ SmartSignalFeed: () => null }));
vi.mock("./components/terminal-movers", () => ({ TerminalMovers: () => null }));
afterEach(() => { vi.useRealTimers(); });

const cases = [
  { label: "today OPEN", now: "2026-11-12T05:00:00Z", date: "2026-11-12", status: "OPEN", intraday: true },
  { label: "historical facts under current OPEN", now: "2026-11-12T05:00:00Z", date: "2026-11-10", status: "OPEN", intraday: false },
  { label: "today closed", now: "2026-11-12T10:00:00Z", date: "2026-11-12", status: "POST_CLOSE", intraday: false },
  { label: "one second before Dhaka midnight", now: "2026-11-11T17:59:59Z", date: "2026-11-11", status: "OPEN", intraday: true },
  { label: "old date at Dhaka midnight", now: "2026-11-11T18:00:00Z", date: "2026-11-11", status: "OPEN", intraday: false },
  { label: "new date at Dhaka midnight", now: "2026-11-11T18:00:00Z", date: "2026-11-12", status: "OPEN", intraday: true },
] as const;

it.each(cases.flatMap(testCase => ["en", "bn"].map(locale => ({ ...testCase, locale: locale as "en" | "bn" }))))("shares dated partial-session copy across model and actual view: $label ($locale)", ({ now, date, status, intraday, locale }) => {
  vi.useFakeTimers(); vi.setSystemTime(new Date(now));
  const freshness = { exchange: "DSE", trade_date: date, market_sync_id: "gA", market_status: status, data_state: "LIVE", snapshot_interval_minutes: 15, freshness_label: "Recorded snapshot" } as BackendMarketFreshnessDto;
  const breadth = { cohort: "ACTIVE_VALID_OHLC", source: "daily_prices", as_of_date: date, neutral_band_percent: 0, advancing: 2, declining: 1, unchanged: 0,
    known_count: 3, denominator: 3, cohort_count: 3, unknown_count: 0 };
  const summaries = [{ trade_date: date, exchange: "DSE", index_name: "DSEX", index_close: "5000", index_change: "10", index_change_percent: "0.2", total_volume: 110,
    total_turnover: "1000000000", advancing_issues: 2, declining_issues: 1, unchanged_issues: 0, data_quality_flag: "OK" }] as BackendDailyMarketSummaryDto[];
  const sentiment = { exchange: "DSE", session_trade_date: date, market_sync_id: "gA", market_mood: "Unknown", signal_count: 0, price_backed_count: 3, turnover_value: "1000000000",
    interpretation: { code: "ALIGNED_UP", as_of_date: date, index_change_percent: "0.2", volume_vs_average: "1.1", volume_average_sessions: 29, breadth },
    insights: [{ id: "turnover-context", title: "Turnover context", description: "", tone: "neutral", category: "valuation", source: "DETERMINISTIC" }] } as BackendDashboardMarketSentimentDto;
  const mapped = mapDashboardSentimentDto(sentiment);
  const model = buildMarketDashboardModel(summaries, null, freshness, { locale, breadth, insights: mapped.insights });
  expect(model.session.state).toBe(status); expect(model.isIntraday).toBe(intraday);
  const description = model.insights.find(insight => insight.id === "turnover-context")!.description;
  expect(description).toContain(intraday
    ? locale === "en" ? "comparisons with completed sessions are provisional" : "তুলনা এখনও সাময়িক"
    : locale === "en" ? "Recorded session turnover" : "দেখানো কার্যদিবসে লেনদেনের মূল্য");
  state.model = model; state.freshness = freshness;
  const view = document.createElement("div"); view.innerHTML = renderToStaticMarkup(<MarketDashboardView locale={locale} />);
  const copy = getTerminalCopy(locale), premium = getPremiumCopy(locale), insightText = view.querySelector(".sw-insights")!.textContent!;
  if (status === "OPEN") expect(view.querySelector(".sw-session-state")?.textContent).toContain(copy.open);
  if (intraday) {
    expect(insightText).toContain(copy.intradayInterpretation); expect(insightText).toContain(premium.partial); expect(insightText).toContain(premium.partialNote);
  } else {
    expect(insightText).not.toContain(copy.intradayInterpretation); expect(insightText).not.toContain(premium.partial); expect(insightText).not.toContain(premium.partialNote);
    expect(insightText).toContain(premium.current);
  }
});

it("does not label missing or invalid dated facts as intraday", () => {
  const now = new Date("2026-11-12T05:00:00Z");
  expect(isCurrentIntradaySession("OPEN", undefined, now)).toBe(false);
  expect(isCurrentIntradaySession("OPEN", "not-a-date", now)).toBe(false);
});
