import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import type { BackendMarketBriefingDto } from "@/lib/api/backend-api-types";
import { order4SurfaceFixture } from "@/test-fixtures/order4-surface-fixtures";
import { buildMarketPulseViewModel } from "./view-models/market-pulse-view-model";
import { MarketBriefingFooter, MarketBriefingSection } from "./components/market-briefing-section";
import { getMarketPulseLanguage } from "./market-pulse-language";
import { mapDashboardSectorsToLeadersContext } from "@/features/market-dashboard/view-models/dashboard-sections-mapper";
import { buildMarketDashboardModel } from "@/features/market-dashboard/view-models/market-dashboard-view-model";
import { MarketOverview } from "@/features/market-dashboard/components/market-overview";
import { getTerminalCopy } from "@/features/market-dashboard/terminal-copy";

function leadershipFixture(kind: string, legacy: boolean) {
  const { pulse } = order4SurfaceFixture(); const positive = kind === "positive", available = kind !== "unavailable";
  const breadth = { ...pulse.coverage!.breadth!, known_count: available ? 3 : 0, unknown_count: available ? 0 : 3, denominator: available ? 3 : 0, cohort_count: 3, advancing: positive ? 3 : 0, declining: kind === "declining" ? 3 : 0, unchanged: kind === "flat" ? 3 : 0 };
  pulse.coverage!.breadth = breadth;
  pulse.briefing = { breadth,
    story: { headline: "Session", explanation: "Recorded price participation.\nLeadership remains concentrated in N/A.", tone: "neutral", metrics: [] },
    state: { dimensions: [{ key: "leadership", label: "Leadership", value: positive ? "Narrow" : legacy ? "Narrow" : available ? "No positive leader" : "Unavailable", tone: "neutral" }], overall_label: "Selective Attention", overall_tone: "info" },
    money_flow: { semantics: "SECTOR_PRICE_CHANGE", inflows: positive ? [{ sector: "Bank", change_label: "+1.00%", strength: 100, tone: "positive" }] : [], outflows: kind === "declining" ? [{ sector: "Bank", change_label: "-1.00%", strength: 100, tone: "negative" }] : [] },
    opportunity_score: { score: 60, label: "Selective", history: [], previous_session: null, weekly_average: null, trend_label: null },
    playbook: { question: "Next", items: [] }, high_priority: null,
    leadership: { cards: [{ kind: "sector", title: "Leading Sector", name: positive ? "Bank" : "N/A", detail: positive ? "+1.00%" : null, tone: positive ? "positive" : "neutral", subtitle: null, href: null, sparkline_points: [] }], fresh_buy_signals: [], narrative: "Leadership remains concentrated in N/A.", fresh_new_count: 0, fresh_upgraded_count: 0 },
    summary: { text: "Recorded session.\nLeadership remains concentrated in N/A.", tone: "neutral", highlights: [{ label: "Leadership", value: "Concentrated", tone: "warning" }], trading_environment: { signals: [{ text: "Leadership remains concentrated", tone: "warning" }], overall_label: "Selective Attention", overall_tone: "info" } },
  } as BackendMarketBriefingDto;
  return pulse;
}

it.each(["en", "bn"].flatMap(locale => ["positive", "declining", "flat", "unavailable"].map(kind => ({ locale: locale as "en" | "bn", kind }))))("joins no-advancing/unavailable sector status and excluded counts on Dashboard and Pulse ($locale, $kind)", ({ locale, kind }) => {
  const status = kind === "positive" ? "MEASURED" : kind === "unavailable" ? "UNAVAILABLE" : "NO_ADVANCING_SECTOR";
  const change = kind === "positive" ? "1.2" : kind === "flat" ? "0" : "-1.2";
  const leaders = mapDashboardSectorsToLeadersContext({ leadership_status: status, excluded_sector_count: 2, session_trade_date: "2026-11-10",
    sectors: kind === "unavailable" ? [] : [{ name: "Bank", change_percent: change, stock_count: 3 }], top_gainer: null });
  const dashboard = buildMarketDashboardModel([], null, null, { locale, leadersContext: leaders });
  const dashboardHtml = renderToStaticMarkup(<MarketOverview model={dashboard} copy={getTerminalCopy(locale)} locale={locale} loading={false} leadersLoading={false} />);
  expect(leaders.primary?.name ?? null).toBe(kind === "positive" ? "Bank" : null);
  if (status === "NO_ADVANCING_SECTOR") expect(dashboardHtml).toContain(locale === "en" ? "No advancing sector" : "কোনো sector-এর দাম বাড়েনি");
  if (status === "UNAVAILABLE") expect(dashboardHtml).toContain(locale === "en" ? "Sector comparison unavailable" : "Sector-এর তুলনার তথ্য নেই");
  const pulse = leadershipFixture(kind, false); pulse.briefing!.state.excluded_sector_count = 2;
  const briefing = buildMarketPulseViewModel(pulse, locale).briefing!;
  const pulseHtml = renderToStaticMarkup(<MarketBriefingSection briefing={briefing} copy={getMarketPulseLanguage(locale)} />);
  for (const html of [dashboardHtml, pulseHtml]) expect(html).toContain(locale === "en" ? "2 sectors excluded" : "2টি sector বাদ");
  expect(briefing.leadership.cards.some(card => card.kind === "sector")).toBe(kind === "positive");
});

it.each(["en", "bn"].flatMap(locale => ["declining", "flat", "unavailable", "positive"].flatMap(kind => [false, true].map(legacy => ({ locale: locale as "en" | "bn", kind, legacy })))))("renders measured sector availability consistently ($locale, $kind, legacy=$legacy)", ({ locale, kind, legacy }) => {
  const pulse = leadershipFixture(kind, legacy); const positive = kind === "positive", available = kind !== "unavailable";
  const model = buildMarketPulseViewModel(pulse, locale), briefing = model.briefing!, copy = getMarketPulseLanguage(locale);
  const html = renderToStaticMarkup(<><MarketBriefingSection briefing={briefing} copy={copy} /><MarketBriefingFooter leadership={briefing.leadership} summary={briefing.summary} copy={copy} /></>);
  expect(html).not.toContain("N/A"); expect(html).not.toContain("unknown");
  if (positive) {
    expect(briefing.leadership.cards.some(card => card.kind === "sector")).toBe(true);
    expect(briefing.leadership.narrative).toContain(locale === "en" ? "Bank" : "Bank");
  } else {
    expect(briefing.leadership.cards.some(card => card.kind === "sector")).toBe(false);
    expect(html).not.toContain("concentrated"); expect(html).not.toContain("অগ্রগতি সীমিত");
    if (available) {
      if (kind === "flat") expect(briefing.story.headline).toContain(locale === "en" ? "No positive sector leader" : "ইতিবাচক দামের অগ্রগতি নেই");
      for (const line of [briefing.story.explanation, briefing.leadership.narrative, briefing.summary.text]) expect(line).toContain(locale === "en" ? "No positive sector leader" : "ইতিবাচক দামের অগ্রগতি নেই");
      expect(briefing.summary.highlights[0].value).toBe(locale === "en" ? "No positive leader" : "ইতিবাচক অগ্রগতি নেই");
      expect(briefing.summary.tradingEnvironment?.signals[0].text).toBe(briefing.leadership.narrative);
    } else {
      expect(briefing.story.explanation).toContain(locale === "en" ? "unavailable" : "পাওয়া যায়নি");
      expect(briefing.summary.highlights).toHaveLength(0);
    }
  }
});


const headlineCases = [
  { name: "two-flat", code: "SECTOR_UNAVAILABLE", tone: "warning", known: 2, inflow: false, outflow: false, count: null },
  { name: "two-advancing", code: "STRENGTH_STOCKS", tone: "positive", known: 2, inflow: false, outflow: false, count: null },
  { name: "two-declining", code: "WEAKNESS_STOCKS", tone: "negative", known: 2, inflow: false, outflow: false, count: null },
  { name: "three-flat", code: "NO_POSITIVE_SECTOR", tone: "warning", known: 3, inflow: false, outflow: false, count: null },
  { name: "three-advancing", code: "STRENGTH_SECTORS", tone: "positive", known: 3, inflow: true, outflow: false, count: 1 },
  { name: "four-advancing", code: "STRENGTH_SECTORS", tone: "positive", known: 4, inflow: true, outflow: false, count: 1 },
  { name: "three-declining", code: "WEAKNESS_SECTORS", tone: "negative", known: 3, inflow: false, outflow: true, count: 1 },
  { name: "three-tiny-rise", code: "STRENGTH_STOCKS", tone: "positive", known: 3, inflow: true, outflow: false, count: null },
  { name: "three-tiny-fall", code: "WEAKNESS_STOCKS", tone: "negative", known: 3, inflow: false, outflow: true, count: null },
  { name: "four-sectors-preview", code: "STRENGTH_SECTORS", tone: "positive", known: 12, inflow: true, outflow: false, count: 4 },
] as const;
it.each(headlineCases.flatMap(test => ["en", "bn"].flatMap(locale => ["current", "legacy"].map(version => ({ ...test, locale: locale as "en" | "bn", version })))))("renders truthful stock vs sector headlines: $name/$locale/$version", ({ code, tone, known, inflow, outflow, count, locale, version }) => {
  const pulse = leadershipFixture("positive", false), briefing = pulse.briefing!;
  briefing.breadth = { ...briefing.breadth!, known_count: known, denominator: known, cohort_count: known, unknown_count: 0 };
  pulse.coverage!.breadth = briefing.breadth;
  briefing.story = { ...briefing.story, tone, headline: "ACROSS 999 SECTORS", ...(version === "current" ? { headline_code: code, sector_count: count } : {}) };
  briefing.state.dimensions[0].value = known < 3 ? "Unavailable" : inflow ? "Narrow" : "No positive leader";
  briefing.money_flow.inflows = inflow ? [{ sector: "Bank", change_label: "+1.00%", strength: 100, tone: "positive" }] : [];
  briefing.money_flow.outflows = outflow ? [{ sector: "Bank", change_label: "-1.00%", strength: 100, tone: "negative" }] : [];
  const model = buildMarketPulseViewModel(pulse, locale);
  const html = renderToStaticMarkup(<MarketBriefingSection briefing={model.briefing!} copy={getMarketPulseLanguage(locale)} />);
  const heading = html.slice(html.indexOf('<h2 class="pulse-story-headline">'), html.indexOf('</h2>'));
  expect(heading).not.toContain("999");
  if (version === "current" && count !== null) {
    expect(heading).toContain(locale === "en" ? `${count} ${count === 1 ? "SECTOR" : "SECTORS"}` : `${count}টি খাতে`);
    if (locale === "en" && count === 1) expect(heading).not.toContain("1 SECTORS");
  }
  else expect(heading).not.toMatch(/\d+.*(?:SECTORS|টি খাতে|টি সেক্টরে)/);
  if (known < 3 && tone === "warning") expect(heading).toContain(locale === "en" ? "Sector leadership unavailable" : "খাতের অগ্রগতির তথ্য পাওয়া যায়নি");
  if (known < 3) expect(model.briefing!.leadership.cards.some(card => card.kind === "sector")).toBe(false);
});


it.each(["en", "bn"].flatMap(locale => [true, false].map(positive => ({ locale: locale as "en" | "bn", positive }))))("preserves a signed sector bound as text ($locale, positive=$positive)", ({ locale, positive }) => {
  const pulse = leadershipFixture(positive ? "positive" : "declining", false), label = positive ? "+<0.01%" : "-<0.01%";
  const source = positive ? pulse.briefing!.money_flow.inflows : pulse.briefing!.money_flow.outflows;
  source[0].change_label = label;
  if (positive) pulse.briefing!.leadership.cards[0].detail = label;
  const model = buildMarketPulseViewModel(pulse, locale), briefing = model.briefing!, copy = getMarketPulseLanguage(locale);
  const flows = positive ? briefing.moneyFlow.inflows : briefing.moneyFlow.outflows;
  expect(flows[0].changeLabel).toBe(label); expect(flows[0].tone).toBe(positive ? "positive" : "negative");
  const html = renderToStaticMarkup(<><MarketBriefingSection briefing={briefing} copy={copy} /><MarketBriefingFooter leadership={briefing.leadership} summary={briefing.summary} copy={copy} /></>);
  expect(html).toContain(positive ? "+&lt;0.01%" : "-&lt;0.01%");
  expect(flows[0].changeLabel).not.toContain("0.00%");
  if (positive) expect(briefing.leadership.cards.find(card => card.kind === "sector")?.detail).toBe(label);
});
