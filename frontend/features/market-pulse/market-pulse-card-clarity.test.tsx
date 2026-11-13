/** @vitest-environment jsdom */
import { renderToStaticMarkup } from "react-dom/server";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { order4SurfaceFixture } from "@/test-fixtures/order4-surface-fixtures";
import { buildMarketPulseViewModel } from "./view-models/market-pulse-view-model";
import { FocusStockCard } from "./components/stocks-in-focus-section";
import { MarketBriefingFooter } from "./components/market-briefing-section";
import { getMarketPulseLanguage } from "./market-pulse-language";
import type { MarketLeadershipModel, MarketSummaryModel } from "./types/market-pulse-types";
afterEach(cleanup);

describe("increment2 repair card clarity", () => {
  it.each(["en", "bn"] as const)("drops unverified legacy upgrades and presents structured measured facts on both lists (%s)", (locale) => {
    const { pulse } = order4SurfaceFixture();
    for (const stock of [...pulse.focus_stocks, ...pulse.monitor_candidates]) {
      stock.focus_label = "Signal Upgrade";
      stock.why_here = ["Trader decision upgraded to POTENTIAL_BUY", "Volume 2.0x prior-session median", "Price above moving-average context"];
      stock.measured_facts = { rsi: 58, trend: "UPTREND", opportunity_score: 72, trigger_price: 110, resistance: 112,
        volume_ratio: 2, volume_baseline: "PRIOR_20_SESSION_MEDIAN", volume_sample_count: 20 };
      delete stock.public_comparison;
    }
    let model = buildMarketPulseViewModel(pulse, locale);
    for (const stock of [...model.focusStocks, ...model.monitorCandidates]) {
      expect(stock.focusLabel).toBe("Potential Buy Setup");
      expect(stock.whyHere).toHaveLength(1);
      expect(stock.whyHere.join(" ")).not.toContain("upgraded");
      expect(stock.whyHere.join(" ")).not.toContain("উন্নীত");
      expect(stock.measuredFacts?.volume_ratio).toBe(2);
      const copy = getMarketPulseLanguage(locale);
      const html = renderToStaticMarkup(<FocusStockCard stock={stock} copy={copy.focus} scoreCopy={copy.score} />);
      expect(html).toContain("Volume 2×"); expect(html).toContain("20-session median");
    }
    for (const stock of [...pulse.focus_stocks, ...pulse.monitor_candidates]) stock.public_comparison = { status: "CHANGED", previous_action: "WAIT", current_action: "POTENTIAL_BUY", previous_session_date: "2026-11-09" };
    model = buildMarketPulseViewModel(pulse, locale);
    for (const stock of [...model.focusStocks, ...model.monitorCandidates]) {
      expect(stock.focusLabel).toBe("Signal Upgrade"); expect(stock.whyHere).toHaveLength(2);
      expect(stock.whyHere[0]).toContain(locale === "bn" ? "উন্নত" : "improved");
      expect(stock.whyHere[0]).not.toContain("আজ");
    }
    const copy = getMarketPulseLanguage(locale);
    expect(copy.leadership.upgradedToday(1, "2026-11-10")).toContain("2026-11-10");
    expect(copy.leadership.newToday(1, "2026-11-10")).not.toMatch(/Today|আজ/);
  });
  it.each(["en", "bn"] as const)("puts action/limiter before score and makes help independently operable on focus and monitor (%s)", (locale) => {
    const model = buildMarketPulseViewModel(order4SurfaceFixture().pulse, locale); const copy = getMarketPulseLanguage(locale);
    const stocks = [model.focusStocks[0], model.monitorCandidates[0]];
    const view = render(<>{stocks.map((stock, index) => <FocusStockCard stock={stock} copy={copy.focus} scoreCopy={copy.score} key={index} />)}</>);
    for (const card of view.container.querySelectorAll(".pulse-focus-card")) {
      expect(card.innerHTML.indexOf("signal-badge")).toBeLessThan(card.innerHTML.indexOf("pulse-score-header-cluster"));
      const controls = card.querySelectorAll("button, a"); const button = controls[0] as HTMLButtonElement; const link = controls[1] as HTMLAnchorElement;
      expect(button.tagName).toBe("BUTTON"); expect(button.closest("a")).toBeNull();
      expect(link.getAttribute("href")).toBe("/stocks/DSE/TEST");
      button.focus(); expect(document.activeElement).toBe(button);
      fireEvent.click(button, { detail: 0 }); // Native keyboard activation dispatches a zero-detail click.
      expect(button.getAttribute("aria-expanded")).toBe("true");
      const panel = document.getElementById(button.getAttribute("aria-controls")!)!;
      expect(panel.hidden).toBe(false);
      fireEvent.keyDown(button, { key: "Escape" }); expect(panel.hidden).toBe(true);
      fireEvent.click(button, { detail: 1 }); expect(panel.hidden).toBe(false); // Touch/pointer activation.
      fireEvent.blur(button, { relatedTarget: link }); expect(panel.hidden).toBe(true);
      expect(card.textContent).toContain(locale === "bn" ? "জল্পনামূলক" : "Speculative");
      expect(card.textContent).not.toContain("SPECULATIVE");
      if (locale === "bn") expect(card.textContent).toContain("কেনার সম্ভাব্য সেটআপ");
    }
  });
  it.each(["en", "bn"] as const)("distinguishes two stocks with the same focus category from structured facts (%s)", locale => {
    const { pulse } = order4SurfaceFixture();
    pulse.focus_stocks = [1.6, 0.7].map((ratio, index) => ({ ...pulse.focus_stocks[0], stock_id: `stock-${index}`, symbol: `STOCK${index}`,
      measured_facts: { rsi: index ? 42 : 58, trend: index ? "DOWNTREND" : "UPTREND", opportunity_score: 70, trigger_price: null, resistance: null,
        volume_ratio: ratio, volume_baseline: "PRIOR_20_SESSION_MEDIAN", volume_sample_count: 20 } }));
    const stocks = buildMarketPulseViewModel(pulse, locale).focusStocks;
    const copy = getMarketPulseLanguage(locale);
    const html = stocks.map(stock => renderToStaticMarkup(<FocusStockCard stock={stock} copy={copy.focus} scoreCopy={copy.score} />));
    expect(html[0]).toContain("1.6×"); expect(html[1]).toContain("0.7×");
    expect(html[0]).toContain("uptrend"); expect(html[1]).toContain("downtrend");
    for (const markup of html) expect(markup).not.toContain("pulse-focus-why-block");
    expect(html[0].match(/Volume 1.6×/g)).toHaveLength(1);
  });
  it("renders leadership by kind when only independently measured volume survives", () => {
    const copy = getMarketPulseLanguage("en");
    const leadership = { decisionDate: "2026-11-10", cards: [{ kind: "accumulation", title: "Relative-volume leader", name: "VOLUME", detail: "2.0x", subtitle: null, tone: "info", href: null, sparklinePoints: [] }], freshBuySignals: [], narrative: "", freshNewCount: 0, freshUpgradedCount: 0 } as MarketLeadershipModel;
    const summary = { text: "Coverage incomplete", tone: "info", highlights: [], tradingEnvironment: null } as MarketSummaryModel;
    const markup = renderToStaticMarkup(<MarketBriefingFooter leadership={leadership} summary={summary} copy={{ leadership: copy.leadership, summary: copy.summary }} />);
    expect(markup).toContain("pulse-leadership-widget-accumulation");
    expect(markup).not.toContain("pulse-leadership-widget-stock");
    expect(markup).not.toContain("pulse-leadership-widget-sector");
    expect(markup).toContain("VOLUME"); expect(markup).toContain("2026-11-10");
  });
});
