/** @vitest-environment jsdom */
import { shortTradeDate } from "@/lib/formatters/trader-formatters";
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { order4SurfaceFixture } from "@/test-fixtures/order4-surface-fixtures";
import { mapUniverseRowToListRow } from "./universe-row-mapper";
import { resolveTraderDecision } from "./trader-decision";
import { breadthCoverageLabel, breadthDefinition } from "./breadth-presentation";
import { SignalCenterView } from "@/features/signals/signal-center-view";
import { ScannerWorkspaceView } from "@/features/scanner/scanner-workspace-view";
import { SmartSignalFeed } from "@/features/market-dashboard/components/smart-signal-feed";
import { mapUniverseRowsToSignalFeed, mapDashboardSectorsToLeadersContext, mapDashboardSentimentDto } from "@/features/market-dashboard/view-models/dashboard-sections-mapper";
import { buildStockDecisionViewModel, withStockHolderInstruction } from "@/features/stock-workspace/view-models/stock-decision-view-model";
import { StockDurableSummary } from "@/features/stock-workspace/components/stock-durable-summary";
import { StockWorkspaceHeader } from "@/features/stock-workspace/components/stock-workspace-header";
import { buildStockWorkspaceModel } from "@/features/stock-workspace/view-models/stock-workspace-view-model";
import type { StockWorkspaceDto } from "@/lib/api/stock-decision-support-types";
import { TraderDecisionCard } from "@/features/stock-workspace/components/trader-decision-card";
import { getStockWorkspaceLanguage } from "@/features/stock-workspace/stock-workspace-language";
import { buildMarketPulseViewModel } from "@/features/market-pulse/view-models/market-pulse-view-model";
import { FocusStockCard } from "@/features/market-pulse/components/stocks-in-focus-section";
import { getMarketPulseLanguage } from "@/features/market-pulse/market-pulse-language";
import { controllingReasonLabel } from "./decision-presentation";

const state = vi.hoisted(() => ({ universe: [] as unknown[] }));
vi.mock("@/features/market-dashboard/hooks/use-market-universe", () => ({ useMarketUniverse: () => ({ ...state, decisionDate: "2026-11-10" }) }));
vi.mock("@/features/watchlist/hooks/use-user-watchlist", () => ({ useUserWatchlist: () => ({ watchedStockIds: new Set(), holdingStockIds: new Set() }) }));
vi.mock("@/features/watchlist/components/watchlist-star-toggle", () => ({ WatchlistStarToggle: () => null }));
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams(), useRouter: () => ({}), usePathname: () => "/signals" }));
vi.mock("@/features/auth/context/auth-context", () => ({ useAuth: () => ({ isAuthenticated: false }) }));
afterEach(cleanup);

describe("increment2 common-fixture journey", () => {
  it.each(["en", "bn"] as const)("keeps action and current limiter ahead of selection evidence across all surfaces (%s)", (locale) => {
    const fixture = order4SurfaceFixture(); state.universe = [mapUniverseRowToListRow(fixture.row)];
    const client = new QueryClient(); const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
    const signals = render(<SignalCenterView locale={locale} />, { wrapper }).container.innerHTML;
    const scanner = render(<ScannerWorkspaceView locale={locale} />, { wrapper }).container.innerHTML;
    expect(scanner).toContain(locale === "bn" ? 'placeholder="শেয়ার খুঁজুন…"' : 'placeholder="Search any stock…"');
    expect(scanner).toContain(locale === "bn" ? 'aria-label="শেয়ার খুঁজুন"' : 'aria-label="Global stock search"');
    const dashboard = renderToStaticMarkup(<SmartSignalFeed locale={locale} signals={mapUniverseRowsToSignalFeed([fixture.row])} />);
    const detail = renderToStaticMarkup(<TraderDecisionCard decision={buildStockDecisionViewModel(fixture.support, locale)} copy={getStockWorkspaceLanguage(locale).decision} />);
    const pulse = buildMarketPulseViewModel(fixture.pulse, locale); const copy = getMarketPulseLanguage(locale);
    const focus = renderToStaticMarkup(<FocusStockCard stock={pulse.focusStocks[0]} copy={copy.focus} scoreCopy={copy.score} />);
    const monitor = renderToStaticMarkup(<FocusStockCard stock={pulse.monitorCandidates[0]} copy={copy.focus} scoreCopy={copy.score} />);
    const outside = locale === "bn" ? "Entry zone-এর উপরে" : "Above entry zone";
    for (const html of [signals, scanner, dashboard, detail, focus, monitor]) {
      expect(html).toContain(outside);
      if (html !== detail) expect(html).toContain("/stocks/DSE/TEST");
      expect(html).not.toContain("Do not treat this legacy trigger");
    }
    expect(signals.indexOf(outside)).toBeLessThan(signals.indexOf(locale === "bn" ? "সবচেয়ে শক্ত দিক" : "Strongest factor"));
    const genericPlan = controllingReasonLabel("bullish_setup_breakout", "", locale);
    expect(signals).not.toContain(genericPlan);
    expect(dashboard).not.toContain(genericPlan);
    expect(dashboard).toContain(locale === "bn" ? "সবচেয়ে শক্ত দিক" : "Strongest factor");
    expect(scanner.indexOf(outside)).toBeLessThan(scanner.indexOf(locale === "bn" ? "খোঁজের কারণ" : "Discovery"));
    expect(focus.indexOf(outside)).toBeLessThan(focus.indexOf("pulse-focus-evidence"));
    expect(pulse.focusStocks[0].latestPrice).toBe("103"); expect(focus).toContain(shortTradeDate("2026-11-11", locale));
    expect(pulse.hero.sessionLabel).toContain(locale === "bn" ? "লেনদেন শুরুর আগে" : "Pre-open"); expect(pulse.hero.sessionLabel).toContain(shortTradeDate("2026-11-10", locale));
    expect(pulse.sessionDisablesRefresh).toBe(false);
  });
  it("filters true WAIT separately from missing action and keeps SPECULATIVE/UNKNOWN risk distinct", () => {
    const { row } = order4SurfaceFixture();
    const wait = { ...row, stock: { ...row.stock, id: "wait", symbol: "WAITNAME" }, decision: { ...row.decision!, display_action: "WAIT" as const } };
    const absent = { ...row, stock: { ...row.stock, id: "absent", symbol: "ABSENT" }, decision: null };
    state.universe = [row, wait, absent].map((row) => mapUniverseRowToListRow(row));
    const client = new QueryClient(); const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
    const rendered = render(<SignalCenterView locale="en" />, { wrapper });
    fireEvent.change(rendered.container.querySelectorAll("select")[0], { target: { value: "WAIT" } });
    expect(rendered.container.textContent).toContain("WAITNAME"); expect(rendered.container.textContent).not.toContain("ABSENT");
    expect(resolveTraderDecision(mapUniverseRowToListRow(absent)).riskLabel).toBe("UNKNOWN");
    expect(resolveTraderDecision(mapUniverseRowToListRow(row)).riskLabel).toBe("SPECULATIVE");
  });
  it("shows 32 ranked stocks, expands in place, and resets the window after filtering", () => {
    const { row } = order4SurfaceFixture();
    state.universe = Array.from({ length: 65 }, (_, index) => mapUniverseRowToListRow({ ...row,
      stock: { ...row.stock, id: `stock-${index}`, symbol: `STOCK${index}`, name: `Full company name ${index} Limited` },
      decision: { ...row.decision!, display_action: index < 40 ? "WAIT" : "POTENTIAL_BUY" },
    }));
    const client = new QueryClient();
    const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
    const view = render(<SignalCenterView locale="en" />, { wrapper });
    expect(view.container.querySelectorAll(".signal-center-item")).toHaveLength(32);
    fireEvent.click(view.getByRole("button", { name: "Show 32 more" }));
    expect(view.container.querySelectorAll(".signal-center-item")).toHaveLength(64);
    fireEvent.change(view.container.querySelectorAll("select")[0], { target: { value: "WAIT" } });
    expect(view.container.querySelectorAll(".signal-center-item")).toHaveLength(32);
    fireEvent.click(view.getByRole("button", { name: "Show 32 more" }));
    expect(view.container.querySelectorAll(".signal-center-item")).toHaveLength(40);
    expect(view.queryByRole("button", { name: "Show 32 more" })).toBeNull();
    expect(view.container.textContent).toContain("Full company name 39 Limited");
  });
  it.each(["en", "bn"] as const)("uses backend measured facts once on the compact Dashboard card (%s)", locale => {
    const { row } = order4SurfaceFixture();
    row.measured_facts = { rsi: 58.4, trend: "UPTREND", opportunity_score: 72, trigger_price: 110, resistance: 112,
      volume_ratio: 1.8, volume_baseline: "PRIOR_20_SESSION_MEDIAN", volume_sample_count: 20 };
    const html = renderToStaticMarkup(<SmartSignalFeed locale={locale} signals={mapUniverseRowsToSignalFeed([row])} />);
    expect(html.match(/RSI 58.4/g)).toHaveLength(1);
    expect(html).toContain(locale === "bn" ? "1.8 গুণ" : "1.8×"); expect(html).toContain(locale === "bn" ? "20 কার্যদিবস" : "20-session median");
    expect(html).not.toContain("RSI 55"); expect(html).not.toContain("average");
  });
  it.each(["en", "bn"].flatMap(locale => [true, false].map(hasLevel => ({ locale: locale as "en" | "bn", hasLevel }))))("retains one precise published trigger condition across the full journey ($locale, level=$hasLevel)", ({ locale, hasLevel }) => {
    const fixture = order4SurfaceFixture();
    const facts = { rsi: 58, trend: "UPTREND", opportunity_score: 70, trigger_price: hasLevel ? 96.54 : null, resistance: null,
      volume_ratio: 1.6, volume_baseline: "PRIOR_20_SESSION_MEDIAN" as const, volume_sample_count: 20 };
    fixture.row.measured_facts = fixture.support.measured_facts = facts;
    for (const stock of [...fixture.pulse.focus_stocks, ...fixture.pulse.monitor_candidates]) { stock.measured_facts = facts; stock.controlling_reason_code = "bullish_setup_breakout"; }
    state.universe = [mapUniverseRowToListRow(fixture.row)];
    const client = new QueryClient(); const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
    const signals = render(<SignalCenterView locale={locale} />, { wrapper }).container.innerHTML;
    const scanner = render(<ScannerWorkspaceView locale={locale} />, { wrapper }).container.innerHTML;
    const dashboard = renderToStaticMarkup(<SmartSignalFeed locale={locale} signals={mapUniverseRowsToSignalFeed([fixture.row])} />);
    const model = buildStockDecisionViewModel(fixture.support, locale);
    const detail = renderToStaticMarkup(<TraderDecisionCard decision={model} copy={getStockWorkspaceLanguage(locale).decision} />);
    const pulse = buildMarketPulseViewModel(fixture.pulse, locale), copy = getMarketPulseLanguage(locale);
    const focus = renderToStaticMarkup(<FocusStockCard stock={pulse.focusStocks[0]} copy={copy.focus} scoreCopy={copy.score} />);
    for (const html of [signals, scanner, dashboard, detail, focus]) {
      expect(html.includes("96.54")).toBe(hasLevel);
      if (hasLevel) expect(html).toContain(locale === "en" ? "Trade Plan: close above 96.54 with volume confirmation" : "Trade Plan: দিনশেষে 96.54-এর ওপরে দর ও পর্যাপ্ত লেনদেনের নিশ্চয়তা প্রয়োজন");
      expect(html).not.toContain("Inside entry zone");
    }
    if (hasLevel) { expect(detail).toContain("Trigger 96.54"); expect(model.controllingReason).not.toContain("breakout"); }
    expect(focus).toContain("Attention"); expect(focus).toContain(locale === "bn" ? "সম্ভাবনার স্কোর 70/100" : "Opportunity 70/100");
  });
  it("shows measured breadth populations and does not turn absent sector moves or one-bar mood into observations", () => {
    const facts = order4SurfaceFixture().pulse.coverage!.breadth!;
    expect(breadthCoverageLabel(facts, "en")).toContain("1 of 2");
    expect(breadthCoverageLabel(facts, "en")).toContain("1 not reported");
    expect(breadthDefinition(facts, "bn")).toContain("0.05%");
    const sectors = mapDashboardSectorsToLeadersContext({ sectors: [{ name: "Unknown", change_percent: null }, { name: "Known", change_percent: "2" }], top_gainer: null } as never);
    expect(sectors.primary?.name).toBe("Known");
    const sentiment = mapDashboardSentimentDto({ market_mood: "Accumulation", insights: [{ id: "market-mood" }], turnover_value: null } as never);
    expect(sentiment.marketMood).toBe("Unknown"); expect(sentiment.insights).toEqual([]);
  });
});

it.each(["en", "bn"] as const)("hides zero-known distribution and directional copy while preserving attention and measured unknown count (%s)", (locale) => {
  const fixture = order4SurfaceFixture(); const facts = { ...fixture.pulse.coverage!.breadth!, known_count: 0, unknown_count: 2, denominator: 0, advancing: 0 };
  fixture.pulse.briefing = {
    breadth: facts, story: { headline: "PRICE STRENGTH EXPANDING", explanation: "Directional breadth", tone: "positive", metrics: [{ label: "Advancing", value: "1", tone: "positive" }] },
    state: { dimensions: [{ key: "sentiment", label: "Sentiment", value: "Bullish", tone: "positive" }], overall_label: "Risk on", overall_tone: "positive" },
    money_flow: { inflows: [{ sector: "Unknown sector", change_label: "+0.00", strength: 100, tone: "positive" }], outflows: [] },
    opportunity_score: { score: 46, label: "Selective Attention Environment", history: [] }, playbook: { question: "Review", items: [] }, high_priority: null,
    leadership: { cards: [], fresh_buy_signals: ["TEST"], fresh_new_count: 1, fresh_upgraded_count: 1 },
    summary: { text: "Price strength", tone: "positive", highlights: [], trading_environment: null },
  } as never;
  const model = buildMarketPulseViewModel(fixture.pulse, locale);
  expect(model.briefing?.story.metrics).toEqual([]);
  expect(model.briefing?.story.headline).not.toContain("PRICE STRENGTH");
  expect(model.briefing?.moneyFlow.inflows).toEqual([]);
  expect(model.briefing?.breadthNote).toContain(locale === "bn" ? "0টির তথ্য আছে" : "0 of 2");
  expect(model.briefing?.opportunityScore.score).toBe(46);
  expect(model.briefing?.leadership.freshBuySignals).toEqual([]);
});

it.each(["en", "bn"] as const)("keeps the canonical decision date separate from a Nov5 quote and volume-ranks an ineligible row (%s)", (locale) => {
  const { row } = order4SurfaceFixture();
  row.stock.symbol = "APSCLBOND";
  row.technical_snapshot.latest_trade_date = "2026-11-05";
  row.display_quote = { ...row.display_quote!, as_of_trade_date: "2026-11-05", observation_session_date: "2026-11-10", observation_status: "NO_TRADE" };
  row.decision = { ...row.decision!, display_action: "WAIT", trading_risk: { label: "SPECULATIVE", score: 80, components: [] }, entry_applicability: { status: "NOT_APPLICABLE", reason_code: "ELIGIBILITY_BLOCKED" } };
  row.shortlist!.volume_rank = 1;
  state.universe = [mapUniverseRowToListRow(row)];
  const client = new QueryClient(); const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  const signals = render(<SignalCenterView locale={locale} />, { wrapper });
  const scanner = render(<ScannerWorkspaceView locale={locale} />, { wrapper });
  const signalCard = signals.container.querySelector(".signal-center-item")!;
  const scannerCard = scanner.container.querySelector(".scanner-result-card")!;
  for (const card of [signalCard, scannerCard]) {
    expect((card === signalCard ? signals.container : scanner.container).textContent).toContain(shortTradeDate("2026-11-10", locale));
    expect(card.textContent).not.toMatch(/Decision[^·<]*2026-11-05/);
  }
  expect(scannerCard.textContent).toContain(shortTradeDate("2026-11-05", locale));
  expect(scannerCard.textContent).toContain(locale === "bn" ? "নতুন ক্রেতার জন্য" : "For new buyers");
  const selects = signals.container.querySelectorAll("select");
  fireEvent.change(selects[2], { target: { value: "VOLUME_CONFIRMED" } });
  expect(selects[2].selectedOptions[0].textContent).toBe(locale === "bn" ? "লেনদেনে অংশগ্রহণের ক্রম" : "Volume participation rank");
  expect(signals.container.querySelector(".signal-center-item")!.textContent).toContain("APSCLBOND");
  expect(signalCard.textContent).toContain(locale === "bn" ? "জল্পনামূলক" : "Speculative");
  expect(signalCard.textContent).not.toContain("risk: Risk");
  const absent = mapUniverseRowToListRow({ ...row, decision: null }, "2026-11-10");
  expect(absent.decisionDate).toBeNull();
});


it.each(["en", "bn"] as const)("Detail holder instruction leads while public thesis and adding context remain distinct (%s)", (locale) => {
  const fixture = order4SurfaceFixture();
  fixture.support.decision.holder_action = "REDUCE";
  fixture.support.decision.primary_reason_code = "lower_structure";
  const publicModel = buildStockDecisionViewModel(fixture.support, locale);
  const holderModel = withStockHolderInstruction(publicModel, fixture.support, true);
  expect(holderModel.displayAction).toBe(publicModel.displayAction);
  expect(holderModel.tradePlanVisual.entryApplicability).toBe(publicModel.tradePlanVisual.entryApplicability);
  const html = renderToStaticMarkup(<TraderDecisionCard decision={holderModel} copy={getStockWorkspaceLanguage(locale).decision} />);
  expect(html.indexOf(holderModel.holderInstruction!.label)).toBeLessThan(html.indexOf(locale === "bn" ? "এই পজিশনে আরও যোগ করার ক্ষেত্রে" : "Adding to this position"));
  expect(html).toContain(locale === "bn" ? "প্রকাশিত সাধারণ অ্যাকশন" : "Dated public action");
  const workspace = { stock: fixture.row.stock, prices: [], decision_support: fixture.support } as unknown as StockWorkspaceDto;
  const durable = renderToStaticMarkup(<StockDurableSummary workspace={workspace} locale={locale} isHolding />);
  expect(durable.indexOf(holderModel.holderInstruction!.label)).toBeLessThan(durable.indexOf(locale === "bn" ? "সাধারণ অ্যাকশন" : "Public action"));
  const model = buildStockWorkspaceModel(workspace.stock, [], { decisionSupport: fixture.support });
  const header = renderToStaticMarkup(<StockWorkspaceHeader model={model} decision={holderModel} copy={getStockWorkspaceLanguage(locale).header} locale={locale} />);
  expect(header).toContain(locale === "bn" ? "সাধারণ অ্যাকশন" : "Public action");
  expect(withStockHolderInstruction(publicModel, fixture.support, false).holderInstruction).toBeUndefined();
  fixture.support.decision.holder_action = undefined;
  expect(withStockHolderInstruction(publicModel, { ...fixture.support, canonical_decision: null }, true).holderInstruction).toBeUndefined();
});

it("holder reason reuses the localized support-break code instead of a generic Bangla fallback", () => {
  const fixture = order4SurfaceFixture(); fixture.support.decision.holder_action = "REVIEW"; fixture.support.decision.primary_reason_code = "support_break";
  const model = withStockHolderInstruction(buildStockDecisionViewModel(fixture.support, "bn"), fixture.support, true);
  expect(model.holderInstruction?.reason).toBe("support ভেঙেছে। হোল্ডিংয়ের সুরক্ষা নির্দেশনা অনুসরণ করুন।");
});


it.each(["en", "bn"] as const)("labels filters and distinguishes signed-out lists from no market matches (%s)", locale => {
  state.universe = [];
  const client = new QueryClient(); const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  const signals = render(<SignalCenterView locale={locale} />, { wrapper });
  expect(signals.getByRole("combobox", {name: "Decision filter"})).toBeTruthy();
  expect(signals.getByRole("combobox", {name: "Risk filter"})).toBeTruthy();
  expect(signals.getByRole("combobox", {name: "Sort results"})).toBeTruthy();
  signals.unmount();
  const scanner = render(<ScannerWorkspaceView locale={locale} />, { wrapper });
  fireEvent.click(scanner.getByRole("button", {name: locale === "bn" ? "আমার নজরের তালিকা" : "My watchlist"}));
  expect(scanner.container.querySelector(".empty-state[role=status]")!.textContent).toContain(locale === "bn" ? "আপনার তালিকা দেখতে সাইন ইন করুন" : "Sign in to view your personal list");
  expect(scanner.container.querySelector(".scanner-category-grid")).toBeNull();
  expect(scanner.getByRole("link", {name: locale === "bn" ? "সাইন ইন করুন" : "Sign in"}).getAttribute("href")).toBe("/login?redirect=/scanner");
});


it.each(["en", "bn"] as const)("hides only the requested unverified message on the Dashboard, retaining a price-zone blocker (%s)", locale => {
  const { row } = order4SurfaceFixture();
  const outside = renderToStaticMarkup(<SmartSignalFeed locale={locale} signals={mapUniverseRowsToSignalFeed([row])} />);
  expect(outside).toContain(locale === "bn" ? "Entry zone-এর উপরে" : "Above entry zone");
  const unverified = { ...row, entry_applicability: { status: "UNVERIFIED" as const, reason_code: "QUOTE_UNUSABLE" as const },
    decision: { ...row.decision!, entry_applicability: { status: "UNVERIFIED" as const, reason_code: "QUOTE_UNUSABLE" as const } } };
  const html = renderToStaticMarkup(<SmartSignalFeed locale={locale} signals={mapUniverseRowsToSignalFeed([unverified])} />);
  expect(html).not.toContain(locale === "bn" ? "Entry-এর আগে broker-এর দাম মিলিয়ে নিন" : "Check live price before entry");
});
