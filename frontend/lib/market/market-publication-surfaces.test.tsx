/** @vitest-environment jsdom */

import { cleanup, render } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";

import { SmartSignalFeed } from "@/features/market-dashboard/components/smart-signal-feed";
import { getDashboardLanguage } from "@/features/market-dashboard/dashboard-language";
import { WatchlistToReview } from "@/features/portfolio/portfolio-workspace-view";
import { ScannerWorkspaceView } from "@/features/scanner/scanner-workspace-view";
import { StockDurableSummary } from "@/features/stock-workspace/components/stock-durable-summary";
import { StockWorkspaceHeader } from "@/features/stock-workspace/components/stock-workspace-header";
import { StockExplorerView } from "@/features/stock-workspace/stock-explorer-view";
import { getStockWorkspaceLanguage } from "@/features/stock-workspace/stock-workspace-language";
import { buildStockWorkspaceModel } from "@/features/stock-workspace/view-models/stock-workspace-view-model";
import type { BackendPortfolioWorkspaceDto, BackendScoredUniverseRowDto } from "@/lib/api/backend-api-types";
import type { StockWorkspaceDto } from "@/lib/api/stock-decision-support-types";
import { mapUniverseRowToListRow } from "./universe-row-mapper";

const state = vi.hoisted(() => ({ universe: [] as unknown[], decisionPublication: {} }));
vi.mock("@/features/market-dashboard/hooks/use-market-universe", () => ({
  useMarketUniverse: () => ({ ...state, listedStockCount: 1, loadedPriceCount: 1 }),
}));
vi.mock("@/features/watchlist/hooks/use-user-watchlist", () => ({
  useUserWatchlist: () => ({ watchedStockIds: new Set(), holdingStockIds: new Set() }),
}));
vi.mock("@/features/watchlist/components/watchlist-star-toggle", () => ({ WatchlistStarToggle: () => null }));
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(), useRouter: () => ({}), usePathname: () => "/stocks",
}));
vi.mock("@tanstack/react-virtual", () => ({
  useVirtualizer: ({ count }: { count: number }) => ({
    getVirtualItems: () => Array.from({ length: count }, (_, index) => ({ index, start: index * 54 })),
    getTotalSize: () => count * 54,
  }),
}));

const liveDate = "2026-11-04";
const priorQuoteDate = "2026-11-03";
const stock = { id: "1", symbol: "TEST", name: "Test stock", exchange: "DSE", sector: "Textile" } as const;

afterEach(cleanup);

it.each([
  ["en", "PROVISIONAL", "Provisional quote", "Finalized decision", "CURRENT"],
  ["bn", "PROVISIONAL", "সাময়িক দাম", "চূড়ান্ত সিদ্ধান্ত", "CURRENT"],
  ["en", "NO_TRADE", "No trade", "Previous finalized decision", "UPDATING"],
  ["bn", "NO_TRADE", "লেনদেন হয়নি", "আগের চূড়ান্ত সিদ্ধান্ত", "UPDATING"],
] as const)("renders %s quote %s and finalized decision publication on existing surfaces", (
  locale, quoteStatus, quoteCopy, decisionCopy, decisionStatus,
) => {
  Object.defineProperty(HTMLElement.prototype, "scrollTo", { configurable: true, value: () => {} });
  const finalDate = quoteStatus === "NO_TRADE" ? "2026-11-02" : priorQuoteDate;
  const quoteDate = quoteStatus === "NO_TRADE" ? priorQuoteDate : liveDate;
  const display = { current_price: 110, price_change_percent: 10, as_of_trade_date: quoteDate,
    observation_session_date: liveDate, observation_status: quoteStatus };
  const decision = { decision_status: decisionStatus, decision_session_date: finalDate };
  const workspace = {
    stock,
    display_metrics: display,
    decision_support: { ...decision, decision: { recommendation: "WAIT" }, risk: { label: "LOW" },
      data_freshness: { latest_trade_date: finalDate, missing_fields: [] } },
  } as unknown as StockWorkspaceDto;
  const row = {
    stock, display_quote: display, session: { latest_trade_date: finalDate, volume: 100 },
    technical_snapshot: { latest_price: 100, price_change_percent: 1, latest_trade_date: finalDate, trend: "UPTREND" },
    scanner: { matches: [{ condition_id: "PRICE_VOLUME_BREAKOUT", rank: 1, rank_score: 100, capacity_score: 100 }] },
  } as unknown as BackendScoredUniverseRowDto;
  const portfolio = { meta: decision, watchlist_to_review: [{
    stock_id: stock.id, symbol: stock.symbol, name: stock.name, exchange: stock.exchange,
    action: "WAIT", reason_code: "IMPORTANT_EVENT", display_quote: display,
    current_price: "100", price_change_percent: "1",
  }] } as unknown as BackendPortfolioWorkspaceDto;
  state.universe = [mapUniverseRowToListRow(row)];
  state.decisionPublication = decision;

  const model = buildStockWorkspaceModel(workspace.stock, [], {
    decisionSupport: workspace.decision_support, displayMetrics: workspace.display_metrics,
  });
  const client = new QueryClient();
  const wrapper = ({ children }: { children: React.ReactNode }) =>
    <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  const summaries = [
    renderToStaticMarkup(<StockDurableSummary locale={locale} workspace={workspace} />),
    renderToStaticMarkup(<StockWorkspaceHeader copy={getStockWorkspaceLanguage(locale).header} locale={locale} model={model} />),
    render(<StockExplorerView locale={locale} />, { wrapper }).container.innerHTML,
    render(<ScannerWorkspaceView locale={locale} />, { wrapper }).container.innerHTML,
    renderToStaticMarkup(<WatchlistToReview data={portfolio} locale={locale} />),
  ];
  for (const markup of summaries) {
    expect(markup).toContain(`data-quote-status="${quoteStatus}"`);
    expect(markup).toContain(quoteCopy);
    expect(markup).toContain(quoteDate);
    expect(markup).toContain(liveDate);
    expect(markup).toContain(`data-decision-status="${decisionStatus}"`);
    expect(markup).toContain(decisionCopy);
    expect(markup).toContain(finalDate);
    expect(markup).toContain("110");
  }
  const smartSignals = renderToStaticMarkup(<SmartSignalFeed
    copy={getDashboardLanguage(locale).signals} decision={decision} locale={locale} signals={[]}
  />);
  expect(smartSignals).toContain(decisionCopy);
  expect(smartSignals).toContain(finalDate);
});
