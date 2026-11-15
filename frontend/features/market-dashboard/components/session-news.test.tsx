// @vitest-environment jsdom
import React from "react";
import "@testing-library/jest-dom/vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { render, screen, fireEvent } from "@testing-library/react";
import { expect, it } from "vitest";
import { MarketTimeline } from "./market-timeline";
import { getTerminalCopy } from "../terminal-copy";

it.each(["en","bn"] as const)("published and generated content keep separate types and dates (%s)",locale=>{
  const html=renderToStaticMarkup(<MarketTimeline copy={getTerminalCopy(locale)} loading={false} items={[
    {id:"news1",kind:"DISCLOSURE",time:"2026-11-13",publicationDate:"2026-11-13",effectiveDate:"2026-11-17",title:"Suspension announced",description:"Source details",source:"Exchange",href:"/stocks/DSE/S"},
    {id:"move1",kind:"HIGHLIGHT",time:"2026-11-12",title:"S +2%",description:"Measured change"}
  ]}/>);
  expect(html).toContain("2026-11-13");expect(html).toContain("2026-11-17");expect(html).toContain("Disclosure");expect(html).not.toContain('class="session-news-kind">Session highlight');
  expect(html).toContain(locale==="en"?"Generated from session data":"বাজারের তথ্য থেকে");
  expect(html).toContain('tabindex="0"');expect(html).toContain('href="/stocks/DSE/S"');expect(html).not.toContain("Today");
});

it("keeps stable keyed items when refreshing a scrolled feed",()=>{
  const items=[{id:"stable",kind:"NEWS" as const,time:"2026-11-13",title:"Stable article",description:"Source text",href:"/stocks/DSE/S"}];
  const view=render(<MarketTimeline copy={getTerminalCopy("en")} items={items} loading={false}/>);
  const region=screen.getByRole("list");fireEvent.scroll(region);const article=screen.getByText("Stable article");
  view.rerender(<MarketTimeline copy={getTerminalCopy("en")} items={[{...items[0],id:"new",title:"New article"},...items]} loading={false}/>);
  expect(screen.getByText("Stable article")).toBe(article);expect(region).toHaveAttribute("tabindex","0");
});
