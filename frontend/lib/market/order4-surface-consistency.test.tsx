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
import { breadthCoverageLabel } from "./breadth-presentation";
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
    const outside = getStockWorkspaceLanguage(locale).panels.entryStatus.OUTSIDE_ZONE;
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
    expect(focus.indexOf(outside)).toBeLessThan(focus.indexOf("pulse-focus-why-block"));
    expect(focus).toContain("110.00"); expect(focus).toContain(locale === "bn" ? "সেশনের সমাপনী দর" : "Session close");
    expect(pulse.hero.sessionLabel).toContain(locale === "bn" ? "লেনদেন শুরুর আগে" : "PRE_OPEN"); expect(pulse.hero.sessionLabel).toContain(shortTradeDate("2026-11-10", locale));
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
  it("shows measured breadth populations and does not turn absent sector moves or one-bar mood into observations", () => {
    const facts = order4SurfaceFixture().pulse.coverage!.breadth!;
    expect(breadthCoverageLabel(facts, "en")).toContain("1 of 2");
    expect(breadthCoverageLabel(facts, "en")).toContain("1 not reported");
    expect(breadthCoverageLabel(facts, "bn")).toContain("0.05%");
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
    expect(card.textContent).toContain(shortTradeDate("2026-11-10", locale));
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
  expect(model.holderInstruction?.reason).toBe("সাপোর্ট ভেঙেছে। হোল্ডিংয়ের সুরক্ষা নির্দেশনা অনুসরণ করুন।");
});
