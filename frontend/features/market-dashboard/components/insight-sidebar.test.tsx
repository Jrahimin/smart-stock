import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { InsightSidebar } from "./insight-sidebar";
import { getTerminalCopy } from "../terminal-copy";
import type { MarketDashboardModel } from "../types/market-dashboard-types";
import type { InsightBlockModel } from "@/lib/insights/insight-types";

const insight: InsightBlockModel = { id: "turnover-context", title: "Activity", description: "Recorded turnover context", tone: "neutral", category: "valuation", source: "DETERMINISTIC" };
function render(current: number | null, average: number | null, intraday = false) {
  const model = { pulse: { turnoverContext: { currentValue: current, averageValue: average, averageSessions: 9, primaryValue: "BDT 3B", vs30DayAvg: "2B" }, volumeContext: { ratioVsAvg: "N/A" } }, breadth: { total: 0 } } as MarketDashboardModel;
  return renderToStaticMarkup(<InsightSidebar copy={getTerminalCopy("en")} insights={[insight]} model={model} intraday={intraday} />);
}
describe("turnover comparison", () => {
  it("uses raw values and scales both bars to the same maximum", () => {
    const html = render(3_000_000_000, 2_000_000_000);
    expect(html).toContain("150%");
    expect(html).toContain('width:100%');
    expect(html).toContain('width:66.66666666666666%');
    expect(html).toContain("9-session average");
  });
  it("labels partial sessions without suggesting a closing forecast", () => {
    const html = render(1, 2, true);
    expect(html).toContain("So far · partial session");
    expect(html).toContain("not a closing projection");
  });
  it("distinguishes zero turnover from missing or unusable comparisons", () => {
    expect(render(0, 2)).toContain('width:0%');
    for (const [current, average] of [[null, 2], [2, null], [2, 0], [NaN, 2]]) {
      const html = render(current, average);
      expect(html).toContain("Comparison unavailable");
      expect(html).not.toContain("sw-comparison-track");
    }
  });
  it("keeps loading, empty and error states distinct", () => {
    const copy = getTerminalCopy("en");
    const view = (loading: boolean, error: boolean) => renderToStaticMarkup(<InsightSidebar copy={copy} insights={[]} loading={loading} error={error} />);
    expect(view(true, false)).toContain(copy.loading);
    expect(view(false, true)).toContain(copy.insightsError);
    expect(view(false, true)).not.toContain(copy.insightsEmpty);
    expect(view(false, false)).toContain(copy.insightsEmpty);
  });
});
