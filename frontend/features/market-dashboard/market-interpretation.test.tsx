/** @vitest-environment jsdom */
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { mapDashboardSentimentDto } from "./view-models/dashboard-sections-mapper";
import { localizeDashboardInsights } from "./view-models/dashboard-insights-localization";
import { getDashboardLanguage } from "./dashboard-language";
import { InsightSidebar } from "./components/insight-sidebar";
import { getTerminalCopy } from "./terminal-copy";
import { buildMarketDashboardModel } from "./view-models/market-dashboard-view-model";
import { MarketOverview } from "./components/market-overview";
import { formatMarketInterpretation } from "@/lib/market/market-interpretation-presentation";
import { evaluateMarketIndexedDbEntry, MARKET_INDEXEDDB_SCHEMA_VERSION } from "@/lib/market/market-indexeddb-cache";
import type { BackendDailyMarketSummaryDto, BackendDashboardMarketSentimentDto, BackendMarketInterpretationDto, BackendDsexIndexSnapshotDto } from "@/lib/api/backend-api-types";

const facts: BackendMarketInterpretationDto = { code: "ALIGNED_UP", as_of_date: "2026-11-10", index_change_percent: "0.2", volume_vs_average: "1.2", volume_average_sessions: 9,
  breadth: { cohort: "ACTIVE_VALID_OHLC", source: "daily_prices", as_of_date: "2026-11-10", neutral_band_percent: 0, advancing: 290, declining: 63, unchanged: 46, known_count: 399, unknown_count: 27, cohort_count: 426, denominator: 399 } };
const old = { exchange: "DSE", market_mood: "Accumulation", signal_count: 0, price_backed_count: 426, turnover_value: null,
  insights: [{ id: "market-mood", title: "Accumulation", description: "Unsupported historic claim", tone: "positive", category: "momentum", source: "DETERMINISTIC" }] } as BackendDashboardMarketSentimentDto;
it.each(["en", "bn"] as const)("routes typed backend interpretation through mapper, locale and existing card (%s)", (locale) => {
  const mapped = mapDashboardSentimentDto({ ...old, interpretation: facts });
  expect(mapped.marketMood).toBe("Unknown"); expect(mapped.insights).toHaveLength(1);
  const language = getDashboardLanguage(locale);
  const insights = localizeDashboardInsights(mapped.insights, language.insights, language.narratives, { locale, marketMood: "Unknown", signalCount: 0,
    turnover: { turnoverLabel: "N/A", vsYesterday: "N/A", vs30DayAvg: "N/A", liquidityKey: "average_liquidity" } });
  const html = renderToStaticMarkup(<InsightSidebar insights={insights} copy={getTerminalCopy(locale)} locale={locale} />);
  expect(html).toContain(locale === "en" ? "Index and breadth advance" : "সূচক ও শেয়ারের বিস্তার ঊর্ধ্বমুখী");
  expect(html).toContain("DSEX +0.20%"); expect(html).toContain("399"); expect(html).toContain("426"); expect(html).toContain(locale === "bn" ? "10 নভেম্বর" : "10 Nov");
  expect(html).not.toContain("Accumulation"); expect(html).not.toContain("Unsupported historic claim");
});
it("keeps old unsupported mood absent and zero-known breadth explicitly unknown", () => {
  expect(mapDashboardSentimentDto(old).insights).toHaveLength(0);
  const copy = formatMarketInterpretation({ ...facts, code: "UNAVAILABLE", index_change_percent: null, volume_vs_average: null, volume_average_sessions: 0,
    breadth: { ...facts.breadth, known_count: 0, advancing: 0, declining: 0, unchanged: 0, unknown_count: 426 } }, "en");
  expect(copy.description).toContain("No comparable stock changes are known"); expect(copy.description).not.toContain("0 rose");
});
it("invalidates only old sentiment IndexedDB payloads, including optional null, in the same generation", () => {
  const options = { expectedScope: "market" as const, cacheKey: "http://localhost/api/v1/dashboard/market-sentiment?exchange=DSE" };
  const payload = { cacheKey: options.cacheKey, expiresAt: Date.now() + 60000, marketSchemaVersion: MARKET_INDEXEDDB_SCHEMA_VERSION, data: old };
  expect(evaluateMarketIndexedDbEntry(payload, options).status).toBe("miss");
  expect(evaluateMarketIndexedDbEntry({ ...payload, data: { ...old, interpretation: null } }, options).status).toBe("miss");
  expect(evaluateMarketIndexedDbEntry({ ...payload, data: { ...old, interpretation: facts } }, options).status).toBe("hit");
  expect(evaluateMarketIndexedDbEntry(payload, { ...options, cacheKey: "/dashboard/movers" }).status).toBe("hit");
});

const volumeSummaries = Array.from({ length: 30 }, (_, offset) => ({
  trade_date: new Date(Date.UTC(2026, 9, 12 + offset)).toISOString().slice(0, 10), exchange: "DSE", index_name: "DSEX",
  index_close: "5000", index_change: "10", index_change_percent: "0.2", total_volume: offset === 29 ? 215_900_000 : 183_000_000,
  total_turnover: null, advancing_issues: 290, declining_issues: 63, unchanged_issues: 46, data_quality_flag: "OK",
})) as BackendDailyMarketSummaryDto[];
const priorVolumeFacts = { ...facts, volume_vs_average: "1.1797814207650273", volume_average_sessions: 29 };

it.each(["en", "bn"] as const)("uses one delivered prior-session participation reading in the actual hero and card (%s)", (locale) => {
  const legacy = buildMarketDashboardModel(volumeSummaries, null, null, { locale });
  expect(legacy.pulse.volumeContext.ratioVsAvg).toBe("1.17x");
  const mapped = mapDashboardSentimentDto({ ...old, interpretation: priorVolumeFacts });
  const model = buildMarketDashboardModel(volumeSummaries, null, null, { locale, insights: mapped.insights });
  const hero = renderToStaticMarkup(<MarketOverview model={model} copy={getTerminalCopy(locale)} locale={locale} loading={false} leadersLoading={false} />);
  const card = renderToStaticMarkup(<InsightSidebar model={model} insights={model.insights} copy={getTerminalCopy(locale)} locale={locale} />);
  expect(model.pulse.volumeContext.ratioVsAvg).toBe("1.18x");
  expect(hero).toContain("215.9M"); expect(hero).toContain("1.18×"); expect(card).toContain("1.18×");
  expect(hero).not.toContain("1.17");
  expect(hero).toContain(locale === "en" ? "prior 29-session avg" : "আগের 29 সেশনের গড়");
  expect(card).toContain(locale === "en" ? "prior 29-session average" : "আগের 29 সেশনের গড়");
});

it("delivered unknown participation does not fall back to a conflicting legacy ratio, while older APIs keep their hero", () => {
  const unknown = mapDashboardSentimentDto({ ...old, interpretation: { ...priorVolumeFacts, volume_vs_average: null } });
  const model = buildMarketDashboardModel(volumeSummaries, null, null, { insights: unknown.insights });
  expect(model.pulse.volumeContext.ratioVsAvg).toBe("N/A");
  const legacy = buildMarketDashboardModel(volumeSummaries, null, null, { insights: mapDashboardSentimentDto(old).insights });
  expect(legacy.pulse.volumeContext.ratioVsAvg).toBe("1.17x"); expect(legacy.insights).toHaveLength(0);
  const differentDate = mapDashboardSentimentDto({ ...old, interpretation: { ...priorVolumeFacts, as_of_date: "2026-11-09" } });
  expect(buildMarketDashboardModel(volumeSummaries, null, null, { insights: differentDate.insights }).pulse.volumeContext.priorAverageSessions).toBeUndefined();
});

function overviewIndex(): BackendDsexIndexSnapshotDto {
  return { index_name: "DSEX", trade_date: "2026-11-10", market_status: "CLOSED", index_close: "5000", index_change: "0", index_change_percent: "0",
    total_volume: 215_900_000, total_turnover: null, total_trades: null, day_open: "5000", day_high: "5000", day_low: "5000", range_52w_low: "4500", range_52w_high: "5500", range_position_percent: "50",
    return_1m_percent: null, return_6m_percent: null, return_1y_percent: null, advancing_issues: 290, declining_issues: 63, unchanged_issues: 46, source: "FIXTURE" };
}

it.each([["en", null], ["bn", null], ["en", "0"], ["bn", "0"]] as const)("renders known index level with typed %s move=%s, distinguishing missing from zero", (locale, move) => {
  const recorded = volumeSummaries.map(row => row.trade_date === "2026-11-10" ? { ...row, index_change: move, index_change_percent: move } : row);
  // Production overview defaults absent movement to zero; typed facts retain null.
  const mapped = mapDashboardSentimentDto({ ...old, interpretation: { ...facts, code: move === null ? "BREADTH_ONLY" : "MIXED", index_change_percent: move } });
  const model = buildMarketDashboardModel(recorded, overviewIndex(), null, { locale, insights: mapped.insights, breadth: facts.breadth });
  const hero = document.createElement("div"); hero.innerHTML = renderToStaticMarkup(<MarketOverview model={model} copy={getTerminalCopy(locale)} locale={locale} loading={false} leadersLoading={false} />);
  const card = renderToStaticMarkup(<InsightSidebar model={model} insights={model.insights} copy={getTerminalCopy(locale)} locale={locale} />);
  expect(hero.querySelector(".sw-index-value")?.textContent).toBe("5,000.00");
  if (move === null) {
    expect(hero.querySelector(".sw-index > b")).toBeNull();
    expect(card).toContain(locale === "en" ? "Index change is unavailable" : "সূচকের পরিবর্তন জানা নেই");
  } else {
    expect(hero.querySelector(".sw-index > b")?.textContent).toContain("0%"); expect(card).toContain("DSEX 0.00%");
  }
});

it.each([["en", "2026-11-09"], ["bn", "2026-11-09"], ["en", "2026-11-11"], ["bn", "2026-11-11"]] as const)("does not let the %s interpretation from %s direct another session's rendered hero or counts", (locale, otherDate) => {
  const breadth = { ...facts.breadth, advancing: 1, declining: 3, unchanged: 0, known_count: 4, denominator: 4, cohort_count: 4, unknown_count: 0 };
  const opposite = { ...facts, as_of_date: otherDate, breadth: { ...breadth, as_of_date: otherDate, advancing: 3, declining: 1 } };
  const mapped = mapDashboardSentimentDto({ ...old, interpretation: opposite });
  const model = buildMarketDashboardModel(volumeSummaries, overviewIndex(), null, { locale, insights: mapped.insights, breadth });
  const hero = document.createElement("div"); hero.innerHTML = renderToStaticMarkup(<MarketOverview model={model} copy={getTerminalCopy(locale)} locale={locale} loading={false} leadersLoading={false} />);
  const card = document.createElement("div"); card.innerHTML = renderToStaticMarkup(<InsightSidebar model={model} insights={model.insights} copy={getTerminalCopy(locale)} locale={locale} />);
  expect(hero.querySelector("h1")?.textContent).toBe(locale === "en" ? "The session at a glance" : "সেশনের বাজারচিত্র");
  expect(hero.querySelector(".sw-breadth-labels .sw-positive b")?.textContent).toBe("1");
  expect(hero.querySelector(".sw-breadth-labels .sw-negative b")?.textContent).toBe("3");
  expect(hero.querySelector("time")?.getAttribute("datetime")).toBe("2026-11-10");
  expect(card.querySelector(".sw-insight-market-mood")).toBeNull();
});

it.each(["en", "bn"] as const)("restores the original illustrated two-card navigation with accessible action text (%s)", (locale) => {
  const model = buildMarketDashboardModel(volumeSummaries, overviewIndex(), null, { locale });
  const hero = document.createElement("div"); hero.innerHTML = renderToStaticMarkup(<MarketOverview model={model} copy={getTerminalCopy(locale)} locale={locale} loading={false} leadersLoading={false} />);
  const section = hero.querySelector(".sw-hero-actions")!;
  expect(section.querySelectorAll(":scope > a")).toHaveLength(2); expect(section.querySelector(".sw-hero-quicklink")).toBeNull();
  expect(section.querySelector('.sw-pulse-entry')?.getAttribute("href")).toBe("/market-pulse");
  expect(section.querySelector('.sw-wealth-card')?.getAttribute("href")).toBe("/wealth");
  expect(section.querySelector(".sw-pulse-art")?.getAttribute("src")).toContain("market-pulse-ceramic.webp");
  expect(section.querySelector(".sw-wealth-card-art")?.getAttribute("src")).toContain("wealth-workspace-trio-v2.webp");
  expect(section.querySelector(".sw-destination-eyebrow")?.textContent).toBe(locale === "en" ? "Inside the market" : "বাজারের গভীরে");
  expect(section.querySelector("#sw-pulse-description")?.textContent?.length).toBeGreaterThan(15);
  expect(section.querySelector("#sw-wealth-title")?.textContent).toContain(locale === "en" ? "Plan savings. Estimate tax." : "সঞ্চয় ও সম্পদের পরিকল্পনা করুন");
});
