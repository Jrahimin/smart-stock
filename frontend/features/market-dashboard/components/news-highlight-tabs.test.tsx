// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, within } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { MarketTimeline } from "./market-timeline";
import { getTerminalCopy } from "../terminal-copy";
import type { MarketTimelineItemModel } from "../types/market-dashboard-types";

afterEach(cleanup);
const highlights:MarketTimelineItemModel[]=Array.from({length:3},(_,index)=>({id:`h${index}`,kind:"HIGHLIGHT",time:"2026-11-10",title:`Measured highlight ${index}`,description:`Actual market detail ${index}`,href:`/stocks/DSE/H${index}`}));
const news:MarketTimelineItemModel[]=[
  {id:"n0",kind:"DISCLOSURE",time:"2026-11-13",publicationDate:"2026-11-13",effectiveDate:"2026-11-17",title:"Published disclosure",description:"Full original announcement. ".repeat(20),source:"Exchange",sourceUrl:"https://example.com/first"},
  {id:"n1",kind:"NEWS",time:"2026-11-15",publicationDate:"2026-11-15",title:"Weekend publication",description:"Actual published news body",source:"Issuer",sourceUrl:"https://example.com/second"},
];

it.each(["en","bn"] as const)("defaults to honest empty News without silently displaying Highlights (%s)",locale=>{
  const view=render(<MarketTimeline items={highlights} copy={getTerminalCopy(locale)} sessionDate="2026-11-10" loading={false}/>);
  const panel=view.getByRole("tabpanel");
  expect(view.getByRole("tab",{name:/News/}).getAttribute("aria-selected")).toBe("true");
  expect(within(panel).getByRole("status").textContent).toContain(locale==="en"?"No news available in this feed":"এই সময়সীমার খবর");
  expect(within(panel).queryByRole("progressbar")).toBeNull();expect(within(panel).queryByRole("link")).toBeNull();
  fireEvent.click(view.getByRole("tab",{name:/Highlights/}));
  const generated=view.getByRole("tabpanel");
  expect(within(generated).getByText("Actual market detail 0")).toBeTruthy();
  expect(within(generated).queryByText("Session highlight")).toBeNull();expect(generated.querySelector("details")).toBeNull();
  expect(generated.querySelectorAll("time")).toHaveLength(1);
  expect(generated.querySelectorAll(".session-news-meta")).toHaveLength(0);
});

it("keeps active item, full source disclosure, footer and pause state separate across keyboard tabs and refresh",()=>{
  const view=render(<MarketTimeline items={[...news,...highlights]} copy={getTerminalCopy("en")} sessionDate="2026-11-10" loading={false}/>);
  const newsTab=view.getByRole("tab",{name:/News/}),highlightTab=view.getByRole("tab",{name:/Highlights/});
  const newsPanel=view.getByRole("tabpanel");
  expect(newsPanel.getAttribute("aria-labelledby")).toBe(newsTab.id);expect(newsTab.getAttribute("aria-controls")).toBe(newsPanel.id);
  const ids=Array.from(view.container.querySelectorAll("[id]")).map(node=>node.id);
  expect(new Set(ids).size).toBe(ids.length);
  expect(view.getAllByRole("tabpanel",{hidden:true}).filter(node=>node.hasAttribute("hidden"))).toHaveLength(1);
  expect(newsPanel.querySelectorAll("time")).toHaveLength(3); // Both real publication dates plus the effective date, not the session date.
  fireEvent.click(within(newsPanel).getByRole("button",{name:"… Read more"}));
  expect(within(newsPanel).getByRole("button",{name:"Show less"}).getAttribute("aria-expanded")).toBe("true");
  fireEvent.click(within(newsPanel).getByText("Weekend publication"));
  expect(within(newsPanel).getByRole("link").getAttribute("href")).toBe("https://example.com/second");
  fireEvent.keyDown(newsTab,{key:"ArrowRight"});
  expect(document.activeElement).toBe(highlightTab);expect(highlightTab.getAttribute("aria-selected")).toBe("true");
  const highlightPanel=view.getByRole("tabpanel");
  expect(within(highlightPanel).getByRole("progressbar").getAttribute("aria-valuenow")).toBe("1");
  fireEvent.click(within(highlightPanel).getByText("Measured highlight 1"));
  expect(within(highlightPanel).getByRole("link").getAttribute("href")).toBe("/stocks/DSE/H1");
  fireEvent.keyDown(highlightTab,{key:"Home"});
  expect(view.getByRole("tabpanel")).toBe(newsPanel);
  expect(within(newsPanel).getByRole("progressbar").getAttribute("aria-valuenow")).toBe("2");
  expect(within(newsPanel).getByRole("button",{name:"Show less"}).getAttribute("aria-expanded")).toBe("true");
  expect(within(newsPanel).getByRole("link").getAttribute("href")).toBe("https://example.com/second");
  view.rerender(<MarketTimeline items={[{...news[0]!,id:"new",title:"New disclosure"},...news,...highlights]} copy={getTerminalCopy("en")} sessionDate="2026-11-10" loading={false}/>);
  expect(within(newsPanel).getByRole("progressbar").getAttribute("aria-valuenow")).toBe("3");
  fireEvent.keyDown(newsTab,{key:"End"});
  expect(view.getByRole("tabpanel")).toBe(highlightPanel);
  expect(within(highlightPanel).getByRole("progressbar").getAttribute("aria-valuenow")).toBe("2");
  expect(within(highlightPanel).queryByRole("button",{name:/automatic scrolling/})).toBeNull();
});

it("does not turn an untyped legacy item into published news",()=>{
  const view=render(<MarketTimeline items={[{kind:"alert",time:"2026-11-15",title:"Unknown provenance",description:"No typed publication evidence"}]} copy={getTerminalCopy("en")} loading={false}/>);
  expect(view.getByRole("tabpanel").textContent).not.toContain("Unknown provenance");
  expect(view.getByRole("tab",{name:/News/}).textContent).toContain("0");
});

it.each(["en","bn"] as const)("shows a recorded date and friendly publisher without a publication or Today claim (%s)",locale=>{
  const view=render(<MarketTimeline items={[{id:"legacy",kind:"NEWS",time:"2026-11-10",dateBasis:"RECORDED_DATE",dateLabel:"RECORDED_DATE",dateLabelAsOf:"2026-11-15",source:"AMARSTOCK_NEWS_API",title:"Legacy announcement",description:"Original text"}]} copy={getTerminalCopy(locale)} loading={false}/>);
  const panel=view.getByRole("tabpanel");
  expect(panel.textContent).toContain(locale==="en"?"Recorded":"রেকর্ড");
  expect(panel.textContent).not.toContain("AmarStock");expect(panel.textContent).not.toContain("AMARSTOCK_NEWS_API");
  expect(panel.textContent).not.toContain(locale==="en"?"Published news":"প্রকাশিত খবর");
  expect(within(panel).getByRole("list",{name:locale==="en"?"News; scroll for more":"খবর; আরও দেখতে স্ক্রল করুন"})).toBeTruthy();
  expect(within(panel).queryByRole("list",{name:/Published news|প্রকাশিত খবর/})).toBeNull();
  expect(panel.textContent).not.toContain(locale==="en"?"Today":"আজ");
  expect(panel.querySelector("time")?.getAttribute("datetime")).toBe("2026-11-10");
});

it("keeps a long recorded feed compact with one continuous position track and no repeated kind captions",()=>{
  const items=Array.from({length:30},(_,index)=>({id:`record-${index}`,kind:"NEWS" as const,time:"2026-11-10",dateBasis:"RECORDED_DATE" as const,title:`Announcement ${index}`,description:"Original source text",href:`/stocks/DSE/S${index}`}));
  const view=render(<MarketTimeline items={items} copy={getTerminalCopy("en")} loading={false}/>);
  const panel=view.getByRole("tabpanel"),progress=within(panel).getByRole("progressbar");
  expect(progress.querySelectorAll(".news-progress-track")).toHaveLength(1);
  expect(progress.querySelectorAll("span")).toHaveLength(0);
  expect(panel.querySelectorAll(".session-news-kind")).toHaveLength(0);
  fireEvent.click(within(panel).getByText("Announcement 1"));
  expect(progress.getAttribute("aria-valuenow")).toBe("2");expect(progress.textContent).toContain("2 / 30");
});
