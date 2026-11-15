/** @vitest-environment jsdom */
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";
import StockDetailPage, { generateMetadata } from "@/app/stocks/[exchange]/[symbol]/page";
import { order4SurfaceFixture } from "@/test-fixtures/order4-surface-fixtures";
import { buildStockDecisionViewModel } from "./view-models/stock-decision-view-model";
import { buildStockWorkspaceModel } from "./view-models/stock-workspace-view-model";
import { buildStockSemanticSummary } from "./view-models/stock-semantic-summary-view-model";
import { DecisionPublicationLabel } from "@/components/ui/market-publication-label";
import { entryFreshness } from "@/test-fixtures/current-entry-fixtures";
import type { StockWorkspaceDto } from "@/lib/api/stock-decision-support-types";
const state=vi.hoisted(()=>({locale:"en"}));
vi.mock("next/headers",()=>({cookies:async()=>({get:()=>({value:state.locale})})}));
vi.mock("next/navigation",()=>({notFound:()=>{throw new Error("NOT_FOUND");}}));
vi.mock("@/components/layout/terminal-app-shell",()=>({TerminalAppShell:({children}:{children:React.ReactNode})=><main>{children}</main>}));
vi.mock("@/features/stock-workspace/stock-detail-workspace-view",()=>({StockDetailWorkspaceView:()=>null}));
afterEach(()=>vi.unstubAllGlobals());
const params=Promise.resolve({exchange:"DSE" as const,symbol:"TEST"});

it.each(["en","bn"] as const)("actual503 workspace loader and route return meaningful unavailable status (%s)",async locale=>{
  state.locale=locale;
  const fetcher=vi.fn(async()=>new Response(JSON.stringify({success:false,message:"CONTROLLED503"}),{status:503}));
  vi.stubGlobal("fetch",fetcher);
  const html=renderToStaticMarkup(await StockDetailPage({params}));
  const node=document.createElement("div");node.innerHTML=html;
  expect(node.querySelector('[role="status"]')?.textContent).toBe(locale==="en"?"Decision unavailable":"সিদ্ধান্ত অনুপলব্ধ");
  expect(node.querySelector("h1")?.textContent).toBe("TEST");
  expect(html).not.toMatch(/freshness|unverified|stale|broker|POTENTIAL BUY|>WAIT</i);
  expect(fetcher).toHaveBeenCalledTimes(1);
  const unavailable=renderToStaticMarkup(<DecisionPublicationLabel decision={{decision_status:"UNAVAILABLE"}} locale={locale}/>);
  expect(unavailable).toContain(locale==="en"?"Decision unavailable":"সিদ্ধান্ত অনুপলব্ধ");
  expect(renderToStaticMarkup(<DecisionPublicationLabel decision={{decision_status:"UPDATING"}} locale={locale}/>)).toBe("");
});

function workspace(state:"withheld"|"unverified"|"stale"|"recent"|"expired"){
  const {row,support}=order4SurfaceFixture();
  support.data_freshness.is_stale=state==="stale";support.data_freshness.is_sparse=state==="stale";
  support.entry_applicability=state==="withheld"?null:state==="unverified"?{status:"UNVERIFIED",reason_code:"QUOTE_UNUSABLE"}:
    state==="expired"?{status:"EXPIRED",reason_code:"PLAN_EXPIRED"}:{...support.entry_applicability!,price_basis:"SNAPSHOT"};
  return {stock:row.stock,prices:[],decision_support:support,display_metrics:row.display_quote} as unknown as StockWorkspaceDto;
}

it.each(["withheld","unverified","stale","recent","expired"] as const)("actual route metadata hides freshness for%s and shares the same description/OG/Twitter",async mode=>{
  const data=workspace(mode);
  // Only the terminal-case control supplies matching source ownership. Other
  // cases deliberately retain the real loader's missing-freshness fence.
  if(mode==="expired")Object.assign(data,{decision_generation_id:"decision-1",quote_generation_id:"quote-1",decision_status:"CURRENT"});
  vi.stubGlobal("fetch",vi.fn(async(url:string)=>new Response(JSON.stringify({success:true,data:url.includes("/market/freshness")?mode==="expired"?entryFreshness():null:data}),{status:200})));
  const metadata=await generateMetadata({params});
  expect(metadata.description).toBeTruthy();
  expect(metadata.openGraph?.description).toBe(metadata.description);
  expect(metadata.twitter?.description).toBe(metadata.description);
  expect(metadata.description).not.toMatch(/Current entry unverified|Decision data:|Stale|Sparse|No missed sessions flagged|candles|broker|snapshot price|source observed|Entry যাচাই হয়নি|পুরোনো|শেষ সংরক্ষিত/i);
  expect(metadata.description).toContain("TEST");
  expect(metadata.description).toContain("10");
  expect(metadata.description).toContain("POTENTIAL BUY");
  // The real SSR loader withholds unbound transient assessments; a permanent
  // expiry still reaches the semantic summary through its existing fence.
  if(mode==="expired")expect(metadata.description).toMatch(/expired|মেয়াদ শেষ/i);
});

it.each((["en","bn"] as const).flatMap(locale=>["withheld","unverified","stale","recent","expired"].map(mode=>({locale,mode:mode as "withheld"|"unverified"|"stale"|"recent"|"expired"}))))("shared semantic summary keeps dated thesis and real conditions without freshness suffix ($locale/$mode)",({locale,mode})=>{
  const data=workspace(mode),decision=buildStockDecisionViewModel(data.decision_support,locale);
  const model=buildStockWorkspaceModel(data.stock,[],{decisionSupport:data.decision_support,displayMetrics:data.display_metrics});
  const text=buildStockSemanticSummary(model,decision);
  expect(text).toContain(decision.datedActionLabel);
  expect(text).not.toMatch(/Current entry unverified|Decision data:|No missed sessions flagged|candles|broker|Entry যাচাই হয়নি|শেষ সংরক্ষিত/i);
  expect(text).toContain("POTENTIAL BUY");
  if(mode==="recent")expect(text).toContain(locale==="en"?"Above entry zone":"Entry zone-এর উপরে");
  if(mode==="expired")expect(text).toContain(locale==="en"?"Trade Plan expired":"Trade Plan-এর মেয়াদ শেষ");
});
