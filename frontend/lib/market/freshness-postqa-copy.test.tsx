/** @vitest-environment jsdom */
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { order4SurfaceFixture } from "@/test-fixtures/order4-surface-fixtures";
import { buildMarketPulseViewModel } from "@/features/market-pulse/view-models/market-pulse-view-model";
import { MarketAlertsSection } from "@/features/market-pulse/components/market-alerts-section";
import { getMarketPulseLanguage } from "@/features/market-pulse/market-pulse-language";
import { StockDurableSummary } from "@/features/stock-workspace/components/stock-durable-summary";
import { TradePlanPanel } from "@/features/stock-workspace/components/trade-plan-panel";
import { buildStockDecisionViewModel } from "@/features/stock-workspace/view-models/stock-decision-view-model";
import { getStockWorkspaceLanguage } from "@/features/stock-workspace/stock-workspace-language";
import { mapDashboardAlertsDto } from "@/features/market-dashboard/view-models/dashboard-sections-mapper";
import { localizeTimelineItems } from "@/features/market-dashboard/view-models/dashboard-timeline-localization";
import { getDashboardLanguage } from "@/features/market-dashboard/dashboard-language";
import { getTerminalCopy } from "@/features/market-dashboard/terminal-copy";
import { MarketTimeline } from "@/features/market-dashboard/components/market-timeline";
import type { BackendMarketPulseDto, MarketAlertType } from "@/lib/api/backend-api-types";
import type { DisplayMetricsDto, StockWorkspaceDto } from "@/lib/api/stock-decision-support-types";

const alertTypes: MarketAlertType[]=["unusual-volume","momentum-reversal","liquidity-surge","sector-rotation","pulse-score-jump"];
it.each((["en","bn"] as const).flatMap(locale=>alertTypes.map(type=>({locale,type}))))("real Pulse model/render keeps $type facts without generic quote advice or sync clocks ($locale)",({locale,type})=>{
  const {pulse}=order4SurfaceFixture();
  pulse.alerts=[{id:`alert-${type}`,alert_type:type,event_title:"Delivered event",event_explanation:"Delivered measured context",
    why_it_matters:"Delivered business explanation",metric_label:"2.5×",significance:"HIGH",time_label:"2:15 PM",
    symbol:"TEST",exchange:"DSE",latest_price:"96",price_change_percent:"+0.42%",price_tone:"positive"} as BackendMarketPulseDto["alerts"][number]];
  const before=JSON.stringify(pulse);
  const model=buildMarketPulseViewModel(pulse,locale);
  const html=renderToStaticMarkup(<MarketAlertsSection alerts={model.alerts} copy={getMarketPulseLanguage(locale).alerts}/>);
  expect(html).toContain("TEST");expect(html).toContain("2.5×");expect(html).toContain("+0.42%");
  expect(html).toContain('href="/stocks/DSE/TEST"');
  expect(html).not.toMatch(/current price check|before entry|Entry-এর আগে বর্তমান দাম|2:15 PM|pulse-alert-footline|pulse-alert-why|pulse-alert-time/i);
  expect(model.alerts[0].timeLabel).toBe("2:15 PM");
  expect(model.alerts[0].metricLabel).toBe("2.5×");
  if(type==="momentum-reversal")expect(html).toContain(locale==="en"?"Trend confirmation is pending":"ঊর্ধ্বমুখী ধারা এখনও নিশ্চিত হয়নি");
  expect(JSON.stringify(pulse)).toBe(before);
});

it.each(["en","bn"] as const)("Details keeps neutral price96, dated plan geometry and informational disclaimer (%s)",locale=>{
  const {row,support}=order4SurfaceFixture();
  const display: DisplayMetricsDto={...row.display_quote!,current_price:96,as_of_trade_date:row.display_quote!.as_of_trade_date ?? null,
    pe_ratio:null,pb_ratio:null,earnings_yield:null,market_cap:null,marked_to_latest_price:false,pe_helper:null};
  const workspace={stock:row.stock,prices:[],decision_support:support,display_metrics:display} as unknown as StockWorkspaceDto;
  const decision=buildStockDecisionViewModel(support,locale,display);
  const copy=getStockWorkspaceLanguage(locale);
  const node=document.createElement("div");
  node.innerHTML=renderToStaticMarkup(<><StockDurableSummary workspace={workspace} locale={locale}/><TradePlanPanel decision={decision} copy={copy.panels}/></>);
  expect(node.querySelector(".trade-plan-current > span")?.textContent).toBe(locale==="en"?"Price":"দাম");
  expect(node.querySelector(".trade-plan-current > strong")?.textContent).toBe("96");
  expect(node.querySelector(".trade-plan-entry > strong")?.textContent).toBeTruthy();
  expect(node.querySelector(".trade-plan-date")?.textContent).toContain("10");
  expect(decision.tradePlanVisual.entryApplicability).toBe(support.entry_applicability);
  const disclaimer=node.querySelector(".stock-durable-summary-disclaimer")?.textContent;
  expect(disclaimer).not.toMatch(/snapshot-based|latest available|সর্বশেষ পাওয়া|not live quotes|live price নয়/i);
  expect(disclaimer).toContain(locale==="en"?"not investment advice":"বিনিয়োগ পরামর্শ নয়");
  expect(node.textContent).not.toMatch(/latest observed price|marked quote|সর্বশেষ পর্যবেক্ষিত দর/i);
});

it.each(["en","bn"] as const)("timeline normalizes legacy snapshot mover copy while retaining its dated mover provenance (%s)",locale=>{
  const input={session_trade_date:"2026-11-10",items:[{time:"2026-11-10",title:"WONDERTOYS +9.96%",description:"Top session mover in the latest snapshot (Wonderland Toys Ltd.)."}]};
  const before=JSON.stringify(input),copy=getTerminalCopy(locale);
  const items=localizeTimelineItems(mapDashboardAlertsDto(input),locale,getDashboardLanguage(locale));
  const html=renderToStaticMarkup(<MarketTimeline items={items} copy={copy} loading={false}/>);
  expect(items[0].kind).toBe("mover");expect(items[0].time).toBe("2026-11-10");
  expect(html).toContain('dateTime="2026-11-10"');expect(html).not.toContain('class="session-news-kind">Session highlight'); expect(html).toContain(locale === "en" ? "Generated from session data" : "বাজারের তথ্য থেকে");
  expect(html).toContain("WONDERTOYS");expect(html).toContain("+9.96%");expect(html).toContain("Wonderland Toys Ltd.");
  expect(items[0].description).toBe(locale==="en"?"Session’s leading price mover (Wonderland Toys Ltd.).":"এই কার্যদিবসে দামের পরিবর্তনে শীর্ষে ছিল Wonderland Toys Ltd.।");
  expect(html).not.toContain("latest snapshot");expect(html).not.toContain(copy.marketAlert);
  expect(JSON.stringify(input)).toBe(before);
});
