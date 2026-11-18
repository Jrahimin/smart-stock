/** @vitest-environment jsdom */
import React from "react";
import { cleanup, render } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, expect, it, vi } from "vitest";
import { order4SurfaceFixture } from "@/test-fixtures/order4-surface-fixtures";
import { accountRow, accountWatchItem, accountWorkspace } from "@/test-fixtures/account-fixtures";
import { mapUniverseRowToListRow } from "./universe-row-mapper";
import { StockExplorerView } from "@/features/stock-workspace/stock-explorer-view";
import { SignalCenterView } from "@/features/signals/signal-center-view";
import { ScannerWorkspaceView } from "@/features/scanner/scanner-workspace-view";
import { WatchlistView } from "@/features/watchlist/watchlist-view";
import { SmartSignalFeed } from "@/features/market-dashboard/components/smart-signal-feed";
import { mapUniverseRowsToSignalFeed } from "@/features/market-dashboard/view-models/dashboard-sections-mapper";
import { StockWorkspaceHeader } from "@/features/stock-workspace/components/stock-workspace-header";
import { StockDurableSummary } from "@/features/stock-workspace/components/stock-durable-summary";
import { buildStockWorkspaceModel } from "@/features/stock-workspace/view-models/stock-workspace-view-model";
import { buildStockDecisionViewModel } from "@/features/stock-workspace/view-models/stock-decision-view-model";
import { TraderDecisionCard } from "@/features/stock-workspace/components/trader-decision-card";
import { SmartWarningsPanel } from "@/features/stock-workspace/components/smart-warnings-panel";
import { DataFreshnessIndicator } from "@/features/stock-workspace/components/event-timeline-panel";
import { getStockWorkspaceLanguage } from "@/features/stock-workspace/stock-workspace-language";
import { MarketPulseHero } from "@/features/market-pulse/components/market-pulse-hero";
import { FocusStockCard } from "@/features/market-pulse/components/stocks-in-focus-section";
import { buildMarketPulseViewModel } from "@/features/market-pulse/view-models/market-pulse-view-model";
import { getMarketPulseLanguage } from "@/features/market-pulse/market-pulse-language";
import { AccountMarketCell } from "@/features/portfolio/components/account-row-context";
import { WatchlistToReview } from "@/features/portfolio/portfolio-workspace-view";
import { EntryApplicabilityLabel } from "@/components/market/entry-applicability-label";
import { getPortfolioWhatNextCopy, visiblePortfolioAttention } from "@/features/portfolio/view-models/portfolio-view-model";
import { portfolioLanguage } from "@/features/portfolio/portfolio-language";
import type { StockWorkspaceDto } from "@/lib/api/stock-decision-support-types";

const state = vi.hoisted(() => ({ universe: [] as ReturnType<typeof mapUniverseRowToListRow>[] }));
vi.mock("@/features/market-dashboard/hooks/use-market-universe", () => ({ useMarketUniverse: () => ({ ...state, listedStockCount: 1, loadedPriceCount: 1, decisionDate: "2026-11-10" }) }));
vi.mock("@/hooks/market/use-enriched-universe-intelligence", () => ({ useEnrichedUniverseIntelligence: () => ({ intelligenceByStockId: new Map(state.universe.map(row=>[row.stock.id,row])) }) }));
vi.mock("@/features/watchlist/hooks/use-user-watchlist", () => ({ useUserWatchlist: () => ({ items: [accountWatchItem()], watchedStockIds: new Set(), holdingStockIds: new Set() }) }));
vi.mock("@/features/watchlist/hooks/use-watchlist-item-update", () => ({ useWatchlistItemUpdate: () => ({ mutate: vi.fn() }) }));
vi.mock("@/features/watchlist/components/watchlist-star-toggle", () => ({ WatchlistStarToggle: () => null }));
vi.mock("@/features/watchlist/components/watchlist-row-actions", () => ({ WatchlistRowActions: () => null }));
vi.mock("@/features/auth/context/auth-context", () => ({ useAuth: () => ({ isAuthenticated: false }) }));
vi.mock("@/hooks/market/use-market-data-freshness", async (original) => ({
  ...await original<typeof import("@/hooks/market/use-market-data-freshness")>(),
  useMarketDataFreshness: () => ({ data: { exchange: "DSE", market_status: "OPEN", data_state: "STALE", last_synced_at: "2026-11-10T08:00:00Z" } }),
}));
vi.mock("@/hooks/market/use-market-cache-coordinator", () => ({ useMarketCacheRefresh: () => vi.fn() }));
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams(), useRouter: () => ({}), usePathname: () => "/stocks" }));
vi.mock("@tanstack/react-virtual", () => ({ useVirtualizer: ({ count }: { count: number }) => ({ getVirtualItems: () => Array.from({length:count},(_,index)=>({index,start:index*54})), getTotalSize: ()=>count*54 }) }));
afterEach(cleanup);

it.each(["en","bn"] as const)("keeps market age in header controls and avoids freshness noise in decisions (%s)", locale => {
  HTMLElement.prototype.scrollTo=vi.fn();
  const fixture=order4SurfaceFixture();
  const assessment={...fixture.row.entry_applicability!,status:"UNVERIFIED",reason_code:"QUOTE_UNUSABLE",price_basis:null,source_observed_at:null} as const;
  fixture.row.entry_applicability=assessment;
  fixture.row.decision={...fixture.row.decision!,primary_reason_code:"stale_sparse_data",entry_applicability:assessment};
  fixture.support.entry_applicability=assessment;
  fixture.support.decision={...fixture.support.decision,primary_reason_code:"stale_sparse_data"};
  fixture.support.data_freshness.is_stale=true;
  fixture.support.warnings=[{code:"stale_data",title:"Freshness warning sentinel",message:"Freshness warning sentinel",severity:"WARNING"}];
  for(const stock of [...fixture.pulse.focus_stocks,...fixture.pulse.monitor_candidates])stock.entry_applicability=assessment;
  state.universe=[mapUniverseRowToListRow(fixture.row)];
  const before=JSON.stringify(fixture);
  const client=new QueryClient({defaultOptions:{queries:{retry:false}}});
  const decision=buildStockDecisionViewModel(fixture.support,locale);
  const workspace={stock:fixture.row.stock,prices:[],decision_support:fixture.support,display_metrics:fixture.row.display_quote} as unknown as StockWorkspaceDto;
  const model=buildStockWorkspaceModel(workspace.stock,[],{decisionSupport:fixture.support,displayMetrics:workspace.display_metrics});
  const pulse=buildMarketPulseViewModel(fixture.pulse,locale),copy=getStockWorkspaceLanguage(locale),pulseCopy=getMarketPulseLanguage(locale);
  const account=accountRow({price_status:"STALE_LAST_KNOWN",mark_authority:"RECORDED",what_next_code:"PRICE_STALE_OR_SUSPENDED"});
  const data=accountWorkspace(account);
  data.watchlist_to_review=[{stock_id:account.stock_id,symbol:account.symbol,name:account.name,exchange:account.exchange,action:"WAIT",reason_code:"IMPORTANT_EVENT",current_price:account.current_price,price_status:account.price_status,display_quote:account.display_quote} as typeof data.watchlist_to_review[number]];
  const nodes=[
    <StockExplorerView locale={locale}/>,<SignalCenterView locale={locale}/>,<ScannerWorkspaceView locale={locale}/>,<WatchlistView locale={locale}/>,
    <SmartSignalFeed locale={locale} signals={mapUniverseRowsToSignalFeed([fixture.row])}/>,
    <StockWorkspaceHeader locale={locale} model={model} decision={decision} copy={copy.header}/>,<StockDurableSummary locale={locale} workspace={workspace}/>,
    <TraderDecisionCard decision={decision} copy={copy.decision}/>,<SmartWarningsPanel decision={decision} copy={copy.panels}/>,<DataFreshnessIndicator decision={decision}/>,
    <MarketPulseHero hero={pulse.hero} briefingChips={pulse.briefingChips} copy={pulseCopy} locale={locale}/>,
    <FocusStockCard stock={pulse.focusStocks[0]} copy={pulseCopy.focus} scoreCopy={pulseCopy.score}/>,
    <AccountMarketCell item={account} locale={locale}/>,<WatchlistToReview data={data} locale={locale}/>,
  ];
  for(const node of nodes){
    const view=render(<QueryClientProvider client={client}>{node}</QueryClientProvider>);
    const age = view.container.querySelector(".market-freshness-age");
    if (age) expect(age.getAttribute("datetime")).toBe("2026-11-10T08:00:00Z");
    const decisions = view.container.cloneNode(true) as HTMLElement;
    decisions.querySelector(".market-freshness-age")?.remove();
    expect(decisions.textContent).not.toMatch(/recorded price|entry unverified|last valid price|last updated|snapshot price|check live price|broker|stale|freshness warning sentinel|নথিভুক্ত দাম|Entry যাচাই হয়নি|পুরোনো দাম|শেষ সংরক্ষিত দাম|আগের কার্যদিবসের দাম/i);
    expect(view.container.querySelector(".watchlist-updated-header,.watchlist-updated-cell,.quote-observation-times,.data-freshness-indicator")).toBeNull();
    for(const disclosure of view.container.querySelectorAll("details"))expect(disclosure.textContent?.trim()).toBeTruthy();
    view.unmount();
  }
  expect(decision.topWarnings).toEqual([]);
  expect(getPortfolioWhatNextCopy(account,portfolioLanguage[locale],locale)).toBe("");
  expect(JSON.stringify(fixture)).toBe(before);
  expect(fixture.support.entry_applicability.status).toBe("UNVERIFIED");
  client.clear();
});

it.each(["en","bn"] as const)("preserves actual zone, confirmation, expiry and invalidation blockers (%s)",locale=>{
  for(const [status,reason] of [["OUTSIDE_ZONE","ABOVE_ENTRY_ZONE"],["AWAITING_CONFIRMATION","COMPLETED_BREAKOUT_REQUIRED"],["EXPIRED","PLAN_EXPIRED"],["INVALIDATED","STOP_BREACHED"]] as const){
    const view=render(<EntryApplicabilityLabel locale={locale} assessment={{status,reason_code:reason,price_basis:"SNAPSHOT"}}/>);
    expect(view.container.textContent?.trim()).toBeTruthy();
    expect(view.container.textContent).not.toMatch(/snapshot|broker|unverified/i);
    view.unmount();
  }
});

it("omits freshness-only attention while preserving genuine quality restrictions and source inventory",()=>{
  const rows=[accountRow({stock_id:"stale",symbol:"OLD",price_status:"STALE_LAST_KNOWN"}),accountRow({stock_id:"suspended",symbol:"HALT",price_status:"SUSPENDED"}),accountRow({stock_id:"suspicious",symbol:"CHECK",price_status:"SUSPICIOUS"})];
  const data=accountWorkspace(rows[0]);data.watchlist_items=rows;
  data.attention=[{code:"PRICE_QUALITY",severity:"HIGH",stock_ids:rows.map(row=>row.stock_id),symbols:rows.map(row=>row.symbol),count:3}];
  expect(visiblePortfolioAttention(data)).toEqual([{...data.attention[0],stock_ids:["suspended","suspicious"],symbols:["HALT","CHECK"],count:2}]);
  expect(data.attention[0].count).toBe(3);
});
