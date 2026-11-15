// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { SmartSignalFeed } from "./smart-signal-feed";
import { MarketTimeline } from "./market-timeline";
import { getTerminalCopy } from "../terminal-copy";
import { mapUniverseRowsToSignalFeed } from "../view-models/dashboard-sections-mapper";
import { order4SurfaceFixture } from "@/test-fixtures/order4-surface-fixtures";

afterEach(()=>{cleanup();delete document.documentElement.dataset.theme;});

it.each(["en","bn"].flatMap(locale=>["light","dark"].map(theme=>({locale:locale as "en"|"bn",theme}))))("keeps aligned factual columns and accessible long symbols in $locale/$theme",({locale,theme})=>{
  document.documentElement.dataset.theme=theme;
  const fixture=order4SurfaceFixture().row;
  const rows=Array.from({length:5},(_,i)=>({...fixture,stock:{...fixture.stock,id:`id-${i}`,symbol:i===0?"VERYLONGSTOCKSYMBOL123456789":`STOCK${i}`},
    top_setup:{...fixture.top_setup!,rank:i+1,readiness:"CONDITIONAL_SETUP" as const,setup_type:i===1?"PULLBACK":i===2?"CONTINUATION":"BREAKOUT"}}));
  const view=render(<SmartSignalFeed signals={mapUniverseRowsToSignalFeed(rows)} locale={locale}/>);
  expect(view.getByRole("columnheader",{name:"Stock / trigger"})).toBeTruthy();
  expect(view.getByRole("columnheader",{name:"Entry zone (৳)"})).toBeTruthy();
  expect(view.getAllByRole("rowheader")).toHaveLength(5);
  const symbol=view.getByRole("link",{name:"VERYLONGSTOCKSYMBOL123456789"});
  expect(symbol.getAttribute("title")).toBe("VERYLONGSTOCKSYMBOL123456789");
  expect(view.container.textContent).not.toContain("5 awaiting breakout");
  expect(view.container.textContent).toContain("Pullback");expect(view.container.textContent).toContain("Continuation");
  fireEvent.click(view.getByRole("button",{name:locale==="en"?"VERYLONGSTOCKSYMBOL123456789 setup details":"VERYLONGSTOCKSYMBOL123456789 setup-এর বিস্তারিত"}));
  expect(view.getByRole("dialog").textContent).toContain("Opportunity");
});

it("a conditional five-breakout set is described as plans, not verified awaiting confirmation",()=>{
  const fixture=order4SurfaceFixture().row;
  const rows=Array.from({length:5},(_,i)=>({...fixture,stock:{...fixture.stock,id:`i-${i}`,symbol:`S${i}`},top_setup:{...fixture.top_setup!,rank:i+1,readiness:"CONDITIONAL_SETUP" as const}}));
  const view=render(<SmartSignalFeed signals={mapUniverseRowsToSignalFeed(rows)} locale="en"/>);
  expect(view.container.textContent).toContain("5 Breakout plans");expect(view.container.textContent).not.toContain("awaiting breakout");
});

it.each(["en","bn"] as const)("typed highlight values and manual navigation work with only three rows (%s)",locale=>{
  const view=render(<MarketTimeline copy={getTerminalCopy(locale)} sessionDate="2026-11-10" loading={false} items={[
    {id:"g",kind:"HIGHLIGHT",highlightType:"PRICE_LEADER",symbol:"GAIN",metricValue:9.84,metricUnit:"PERCENT",time:"2026-11-10",title:"Opaque source headline",description:"Source detail"},
    {id:"l",kind:"HIGHLIGHT",highlightType:"PRICE_LAGGARD",symbol:"LOSS",metricValue:-7.69,metricUnit:"PERCENT",time:"2026-11-10",title:"Another opaque headline",description:"Source detail"},
    {id:"t",kind:"HIGHLIGHT",highlightType:"TURNOVER_LEADER",symbol:"SPCL",metricValue:287000000,metricUnit:"BDT",time:"2026-11-10",title:"No numbers to parse",description:"Source detail"}
  ]}/>);
  fireEvent.click(view.getByRole("tab",{name:/Highlights/}));
  expect(view.container.textContent).toContain("+9.84%");expect(view.container.textContent).toContain("-7.69%");expect(view.container.textContent).toContain("৳287.0M");
  fireEvent.click(view.getByText(locale==="en"?"LOSS declines":"LOSS দাম কমেছে"));
  expect(view.getByRole("progressbar").getAttribute("aria-valuenow")).toBe("2");
  fireEvent.click(view.getByText(locale==="en"?"GAIN leads gains":"GAIN দাম বৃদ্ধিতে এগিয়ে"));
  expect(view.getByRole("progressbar").getAttribute("aria-valuenow")).toBe("1");
});

it.each(["en","bn"] as const)("zero/all-up/all-down labels do not invent a gain or decline (%s)",locale=>{
  const view=render(<MarketTimeline copy={getTerminalCopy(locale)} loading={false} items={[
    {id:"n",kind:"HIGHLIGHT",highlightType:"PRICE_LEADER",symbol:"DOWN",metricValue:-1,metricUnit:"PERCENT",time:"2026-11-10",title:"Down source",description:""},
    {id:"p",kind:"HIGHLIGHT",highlightType:"PRICE_LAGGARD",symbol:"UP",metricValue:1,metricUnit:"PERCENT",time:"2026-11-10",title:"Up source",description:""},
    {id:"z",kind:"HIGHLIGHT",highlightType:"PRICE_LAGGARD",symbol:"FLAT",metricValue:0,metricUnit:"PERCENT",time:"2026-11-10",title:"Flat source",description:""}
  ]}/>);
  expect(view.container.textContent).not.toContain("DOWN leads gains");expect(view.container.textContent).not.toContain("UP declines");
  expect(view.container.textContent).toContain(locale==="en"?"FLAT price unchanged":"FLAT দাম অপরিবর্তিত");
});

it("a long published headline retains its full accessible title and source association",()=>{
  const title="A lengthy issuer announcement about the upcoming extraordinary general meeting and the effective date of a published corporate action that needs careful reading";
  const view=render(<MarketTimeline copy={getTerminalCopy("en")} loading={false} items={[
    {id:"a",kind:"NEWS",symbol:"FIRST",time:"2026-11-10",title:"First",description:"",source:"First source",href:"/stocks/DSE/FIRST"},
    {id:"b",kind:"DISCLOSURE",symbol:"LONG",time:"2026-11-10",title,description:"Full source text",source:"Second source",href:"/stocks/DSE/LONG",effectiveDate:"2026-11-17"}
  ]}/>);
  expect(view.getByTitle(`LONG · ${title}`)).toBeTruthy();
  expect(view.queryByRole("button", {name: /Read more/})).toBeNull();
  fireEvent.click(view.getByText("Full source text"));
  expect(view.getByRole("progressbar").getAttribute("aria-valuenow")).toBe("2");
  expect(view.getByRole("link",{name:/Stock details/}).getAttribute("href")).toBe("/stocks/DSE/LONG");
  expect(view.container.textContent).toContain("2026-11-17");
});
