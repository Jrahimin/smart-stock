/** @vitest-environment jsdom */
import { render, cleanup } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { order4SurfaceFixture } from "@/test-fixtures/order4-surface-fixtures";
import { buildMarketPulseViewModel } from "./view-models/market-pulse-view-model";
import { MarketPulseHero } from "./components/market-pulse-hero";
import { getMarketPulseLanguage } from "./market-pulse-language";

vi.mock("@/components/command/workspace-command-search", () => ({ WorkspaceCommandSearch: () => null }));
vi.mock("@/components/layout/market-data-freshness-bar", () => ({ MarketDataFreshnessBar: () => <span>OPEN</span> }));
vi.mock("@/features/market-dashboard/components/dashboard-locale-switcher", () => ({ DashboardLocaleSwitcher: () => null }));
afterEach(() => { cleanup(); vi.useRealTimers(); });

it.each(["en", "bn"] as const)("renders the earlier quote session beside today's open market (%s)", locale => {
  vi.useFakeTimers(); vi.setSystemTime(new Date("2026-11-12T05:00:00Z"));
  const { pulse } = order4SurfaceFixture();
  pulse.coverage!.market_status = "OPEN";
  pulse.coverage!.quote_session_date = "2026-11-10";
  const model = buildMarketPulseViewModel(pulse, locale);
  const view = render(<MarketPulseHero hero={model.hero} briefingChips={model.briefingChips} copy={getMarketPulseLanguage(locale)} locale={locale} />);
  const line = view.getByRole("status");
  expect(line.textContent).toContain(locale === "en" ? "today's prices are not in yet" : "আজকের দাম আসেনি");
  expect(line.textContent).toContain(locale === "en" ? "Analysis 10 Nov" : "বিশ্লেষণ 10 নভেম্বর");
  expect(view.container.querySelector(".explorer-hero-status-row")?.textContent).toContain("OPEN");
});

it.each(["en", "bn"] as const)("does not mistake yesterday's finalized decision for a missing current quote (%s)", locale => {
  vi.useFakeTimers(); vi.setSystemTime(new Date("2026-11-12T05:00:00Z"));
  const { pulse } = order4SurfaceFixture();
  pulse.coverage!.market_status = "OPEN";
  pulse.coverage!.quote_session_date = "2026-11-12";
  const model = buildMarketPulseViewModel(pulse, locale);
  const view = render(<MarketPulseHero hero={model.hero} briefingChips={model.briefingChips} copy={getMarketPulseLanguage(locale)} locale={locale} />);
  expect(view.getByRole("status").textContent).toContain(locale === "en" ? "Market open · Analysis 10 Nov" : "লেনদেন চলছে · বিশ্লেষণ 10 নভেম্বর");
  expect(view.container.textContent).not.toContain(locale === "en" ? "prices are not in" : "দাম আসেনি");
});

it("uses delivered quote dates for legacy coverage and never infers a missing quote from analysis date alone", () => {
  vi.useFakeTimers(); vi.setSystemTime(new Date("2026-11-12T05:00:00Z"));
  const { pulse } = order4SurfaceFixture(); pulse.coverage!.market_status = "OPEN";
  for (const stock of [...pulse.focus_stocks, ...pulse.monitor_candidates]) {
    stock.display_quote = { ...stock.display_quote!, observation_session_date: "2026-11-12", as_of_trade_date: "2026-11-12" };
  }
  expect(buildMarketPulseViewModel(pulse, "en").hero.sessionLabel).not.toContain("prices are not in");
  for (const stock of [...pulse.focus_stocks, ...pulse.monitor_candidates]) delete stock.display_quote;
  expect(buildMarketPulseViewModel(pulse, "en").hero.sessionLabel).not.toContain("prices are not in");
});


it.each(["en", "bn"] as const)("explains legacy exact-basis unavailability without changing stock breadth (%s)", locale => {
  const { pulse } = order4SurfaceFixture();
  pulse.data_quality_note = "Some sector comparisons lack an exact source price-change basis.";
  const model = buildMarketPulseViewModel(pulse, locale);
  expect(model.dataQualityNote).toContain(locale === "en" ? "Some prices need review" : "কিছু দামের তথ্য যাচাই করা দরকার");
  expect(model.briefing?.breadth ?? pulse.coverage?.breadth).toEqual(pulse.coverage?.breadth);
});
