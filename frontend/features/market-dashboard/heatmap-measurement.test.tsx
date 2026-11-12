import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { BackendDashboardHeatmapDto } from "@/lib/api/backend-api-types";
import { mapDashboardHeatmapDto } from "./view-models/dashboard-sections-mapper";
import { InstitutionalHeatmap } from "./components/institutional-heatmap";
import { getTerminalCopy } from "./terminal-copy";

const dto: BackendDashboardHeatmapDto = {
  session_trade_date: "2026-11-10",
  tiles: [
    { stock_id: "fresh", symbol: "FRESH", sector: "Bank", trade_date: "2026-11-10", change_percent: 3,
      weight: 1, tone: "positive", latest_price: 103, turnover: 100, turnover_value: 100, liquidity_score: 10 },
    { stock_id: "old", symbol: "OLD", sector: "Bank", trade_date: "2026-11-08", change_percent: null,
      weight: 1, tone: "neutral", latest_price: 90, turnover: 900, turnover_value: 900, liquidity_score: 100 },
  ],
  sectors: [{ name: "Bank", change_percent: 3, measured_count: 1, total_count: 2, weighting: "TURNOVER" }],
};

describe("measured heatmap contract", () => {
  it.each(["en", "bn"] as const)("renders the backend aggregate and coverage in %s", locale => {
    const tiles = mapDashboardHeatmapDto(dto);
    const html = renderToStaticMarkup(<InstitutionalHeatmap tiles={tiles} copy={getTerminalCopy(locale)} locale={locale} loading={false} />);
    expect(html).toContain("+3%");
    expect(html).not.toContain("-8.70%");
    expect(html).toContain(locale === "bn" ? "2টির মধ্যে 1টির পরিবর্তন জানা" : "1 of 2 measured");
    expect(html).toContain(locale === "bn" ? "খাতের মানচিত্র" : "Sector map");
    expect(tiles[1].changePercent).toBeNull();
    expect(tiles[1].tradeDate).toBe("2026-11-08");
  });

  it("keeps legacy and unknown returns unavailable instead of reconstructing a sector", () => {
    const legacy = mapDashboardHeatmapDto({ ...dto, sectors: undefined,
      tiles: [{ ...dto.tiles[0], trade_date: undefined }] });
    expect(legacy[0].changePercent).toBeNull();
    expect(legacy[0].sectorSummary).toBeUndefined();
    expect(legacy[0].tone).toBe("neutral");
  });

  it("preserves measured zero", () => {
    expect(mapDashboardHeatmapDto({ ...dto, tiles: [{ ...dto.tiles[0], change_percent: 0 }] })[0].changePercent).toBe(0);
  });

  it.each(["en", "bn"] as const)("keeps missing inspector prices distinct from zero turnover (%s)", locale => {
    const missing = mapDashboardHeatmapDto({ ...dto, tiles: [{ ...dto.tiles[0], change_percent: null, latest_price: null, turnover: null }] });
    const copy = getTerminalCopy(locale);
    const html = renderToStaticMarkup(<InstitutionalHeatmap tiles={missing} copy={copy} locale={locale} loading={false} />);
    expect(html).toContain(`${copy.price} ${copy.missing}`);
    expect(html).toContain(`${copy.turnover} ${copy.missing}`);
    expect(html).not.toContain("BDT 0");
    expect(mapDashboardHeatmapDto({ ...dto, tiles: [{ ...dto.tiles[0], turnover: 0 }] })[0].turnover).toBe("0");
  });
});
