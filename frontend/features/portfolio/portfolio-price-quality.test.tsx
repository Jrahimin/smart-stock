/** @vitest-environment jsdom */
import React from "react";
import { cleanup,render } from "@testing-library/react";
import { afterEach,expect,it } from "vitest";
import { AccountMarketCell } from "./components/account-row-context";
import { WatchlistToReview } from "./portfolio-workspace-view";
import { portfolioLanguage } from "./portfolio-language";
import { portfolioPriceStatusLabel } from "./view-models/portfolio-view-model";
import { accountWorkspace } from "@/test-fixtures/account-fixtures";
import cases from "@/test-fixtures/practicality-portfolio-quality.json";
import type { BackendPortfolioHoldingDto,BackendPortfolioWatchlistSuggestionDto } from "@/lib/api/backend-api-types";

afterEach(cleanup);
const expected={absent:"UNAVAILABLE",suspicious:"SUSPICIOUS",suspended:"SUSPENDED",stale:"STALE_LAST_KNOWN",recorded:"RECORDED",finalized:"FINALIZED"} as const;
it.each((["en","bn"] as const).flatMap(locale=>Object.entries(cases.cases).map(([state,value])=>({locale,state:state as keyof typeof expected,value}))))("both actual consumers preserve $state quality/authority in $locale",({locale,state,value})=>{
  const holding=value.holding as BackendPortfolioHoldingDto;
  const workspace=accountWorkspace(holding);
  workspace.watchlist_to_review=[value.suggestion as BackendPortfolioWatchlistSuggestionDto];
  const {container}=render(<><AccountMarketCell item={holding} locale={locale}/><WatchlistToReview data={workspace} locale={locale}/></>);
  const copy=portfolioLanguage[locale];
  const label=state==="suspicious"||state==="suspended"?copy.priceStatus[expected[state]]:"";
  expect(container.querySelector(".portfolio-market-cell")?.textContent).toContain(label);
  expect(container.querySelector(".portfolio-idea")?.textContent).toContain(label);
  expect(container.textContent).not.toContain(copy.recordedPrice);
  expect(container.textContent).not.toContain(copy.priceStatus.STALE_LAST_KNOWN);
  expect(container.querySelector("details")).toBeNull();
  if(state==="absent")expect(holding.current_price).toBeNull();
  else {expect(holding.current_value).toBe("1030.00");expect(holding.unrealized_gain_amount).toBe("130.00");}
});

it.each(["en","bn"] as const)("keeps compatible missing-field fallback without hiding quality in %s",locale=>{
  for(const state of ["absent","suspicious","suspended","stale","finalized"] as const){
    const item=cases.cases[state].holding as BackendPortfolioHoldingDto;
    const legacy={...item,mark_authority:undefined,display_quote:undefined};
    expect(portfolioPriceStatusLabel(legacy,locale)).toBe(state==="suspicious"||state==="suspended"?portfolioLanguage[locale].priceStatus[expected[state]]:"");
  }
  const recorded=cases.cases.recorded.holding as BackendPortfolioHoldingDto;
  expect(portfolioPriceStatusLabel({...recorded,mark_authority:undefined},locale)).toBe("");
  expect(portfolioPriceStatusLabel({...recorded,display_quote:undefined},locale)).toBe("");
});

it.each(["en","bn"] as const)("shows explicit no-trade activity with a numeric mark and preserves quality precedence (%s)",locale=>{
  const value=cases.cases.recorded;
  const holding={...value.holding,display_quote:{...value.holding.display_quote,observation_status:"NO_TRADE"}} as BackendPortfolioHoldingDto;
  const data=accountWorkspace(holding);
  data.watchlist_to_review=[{...value.suggestion,display_quote:holding.display_quote} as BackendPortfolioWatchlistSuggestionDto];
  const {container}=render(<><AccountMarketCell item={holding} locale={locale}/><WatchlistToReview data={data} locale={locale}/></>);
  expect(container.querySelector(".portfolio-market-cell")?.textContent).toContain(portfolioLanguage[locale].priceStatus.NON_TRADED);
  expect(container.querySelector(".portfolio-idea")?.textContent).toContain(portfolioLanguage[locale].priceStatus.NON_TRADED);
  expect(container.textContent).toContain("103");
  expect(container.textContent).not.toContain(portfolioLanguage[locale].recordedPrice);
  expect(portfolioPriceStatusLabel({...holding,price_status:"SUSPENDED"},locale)).toBe(portfolioLanguage[locale].priceStatus.SUSPENDED);
});
