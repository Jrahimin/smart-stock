import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { TopSetupSummary } from "./top-setup-summary";
import type { BackendTopSetupDto } from "@/lib/api/backend-api-types";
import type { EntryApplicabilityDto } from "@/lib/api/stock-decision-support-types";

const setup: BackendTopSetupDto = {version:"top-setups-v1",rank:1,readiness:"CONDITIONS_MET",action:"POTENTIAL_BUY",setup_type:"BREAKOUT",condition:"Defined condition",entry_low:96.5,entry_high:97.9,invalidation:92.5,target:106,opportunity_score:72,risk_label:"LOW",supporting_fact:"UPTREND",holder_guidance:"HOLD",price_basis:"LAST_CLOSE",price_session_date:"2026-11-12",assessed_at:"2026-11-12T08:15:00Z"};
const assessment = {status:"APPLICABLE",reason_code:"ENTRY_TERMS_MET",assessed_at:setup.assessed_at,price_basis:"LAST_CLOSE"} as EntryApplicabilityDto;

it.each(["en","bn"] as const)("closing conditions are dated and explicitly require opening-price reassessment (%s)",locale=>{
  const html=renderToStaticMarkup(<TopSetupSummary setup={setup} assessment={assessment} locale={locale}/>);
  expect(html).toContain(locale==="en"?"Conditions met at the latest observation":"শেষ পর্যবেক্ষণে শর্ত পূরণ হয়েছে");
  expect(html).toContain("2026-11-12"); expect(html).toContain("Closing price");
  expect(html).toContain(locale==="en"?"Reassess the next session":"opening price");
  expect(html).not.toContain("Buy now"); expect(html).toContain("৳92.50");
});

it("a fenced assessment cannot retain the positive headline or report a fresh timestamp",()=>{
  const html=renderToStaticMarkup(<TopSetupSummary setup={setup} assessment={{...assessment,status:"UNVERIFIED"}}/>);
  expect(html).not.toContain("Conditions met"); expect(html).not.toContain("Closing price"); expect(html).toContain("WAIT");
});

it("mixed-version unknown basis never authorizes the positive headline",()=>{
  const html=renderToStaticMarkup(<TopSetupSummary setup={{...setup,price_basis:"UNKNOWN"}} assessment={{...assessment,price_basis:"UNKNOWN"}}/>);
  expect(html).not.toContain("Conditions met");
});

it.each(["en","bn"] as const)("pullback uses its own confirmation, with specific holder guidance (%s)",locale=>{
  const html=renderToStaticMarkup(<TopSetupSummary setup={{...setup,readiness:"WAIT_FOR_PRICE",setup_type:"PULLBACK",confirmation_rule:"COMPLETED_PULLBACK_HOLD",confirmation_support:94,holder_guidance:"HOLD_NO_ADD"}} assessment={assessment} locale={locale}/>);
  expect(html).toContain("Pullback"); expect(html).not.toContain("completed-session close above"); expect(html).toContain("৳94.00");
  expect(html).toContain(locale==="en"?"avoid adding at this price":"নতুন করে না কিনে");
});
