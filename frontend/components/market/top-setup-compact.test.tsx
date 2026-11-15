// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, within } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { TopSetupSummary } from "./top-setup-summary";
import { topSetupFixture } from "@/test-fixtures/top-setup-fixture";
import type { EntryApplicabilityDto } from "@/lib/api/stock-decision-support-types";

afterEach(cleanup);

it.each(["en","bn"] as const)("compact Dashboard keeps levels visible and full guidance accessible (%s)",locale=>{
  const setup=topSetupFixture({readiness:"CONDITIONAL_SETUP",condition:"Enter only after a completed close above 98 with confirming volume.",counterargument_code:"volatility_gap",risk_label:"MEDIUM"});
  const view=render(<TopSetupSummary setup={setup} compact symbol="TEST" locale={locale}/>);
  expect(view.container.textContent).toContain("WAIT");expect(view.container.textContent).toContain(locale === "en" ? "Close above ৳98.00" : "Close ৳98.00-এর ওপরে");
  expect(view.container.textContent).toContain("98.00 – 100.00");expect(view.container.textContent).toContain("94.00");
  expect(view.container.textContent).not.toContain("Opportunity");
  const button=view.getByRole("button",{name:locale==="en"?"TEST setup details":"TEST setup-এর বিস্তারিত"});
  fireEvent.click(button);
  const panel=view.getByRole("dialog");
  expect(panel.textContent).toContain("98");expect(panel.textContent).toContain("Opportunity");expect(panel.textContent).toContain("Volatility");
  expect(panel.textContent).toContain(locale==="en"?"Existing holders":"আগে থেকেই শেয়ার থাকলে");
  fireEvent.click(within(panel).getByRole("button",{name:locale==="en"?"Close":"বন্ধ করুন"}));
  expect(view.queryByRole("dialog")).toBeNull();
});

it("compact positive close keeps its basis, date and next-open warning on the face",()=>{
  const setup=topSetupFixture({readiness:"CONDITIONS_MET",price_basis:"LAST_CLOSE",price_session_date:"2026-11-12",assessed_at:"2026-11-12T10:00:00Z"});
  const assessment={status:"APPLICABLE",reason_code:"ENTRY_TERMS_MET",assessed_at:setup.assessed_at,price_basis:"LAST_CLOSE"} as EntryApplicabilityDto;
  const view=render(<TopSetupSummary setup={setup} assessment={assessment} compact/>);
  expect(view.container.textContent).toContain("Conditions met at the latest observation");
  expect(view.container.textContent).toContain("Closing price · 2026-11-12");
  expect(view.container.textContent).toContain("Reassess the next opening price");
});

it.each(["INVALIDATED","EXPIRED"] as const)("a read-time terminal blocker is visible even with a cached compact setup (%s)",status=>{
  const view=render(<TopSetupSummary setup={topSetupFixture()} compact assessment={{status} as EntryApplicabilityDto}/>);
  expect(view.container.textContent).toContain(status==="EXPIRED"?"Plan expired":"Plan invalidated");
  expect(view.container.textContent).not.toContain("Conditions met");
});
