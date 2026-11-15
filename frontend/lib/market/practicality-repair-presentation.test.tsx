/** @vitest-environment jsdom */
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { StockDurableSummary } from "@/features/stock-workspace/components/stock-durable-summary";
import { entryAssessmentPresentation } from "@/lib/market/entry-assessment-presentation";
import { eligibilityRestrictionLabel, decisionConditionLabel } from "@/lib/market/decision-presentation";
import { portfolioRowAction, portfolioRowComparison } from "@/features/portfolio/view-models/portfolio-view-model";
import { accountRow } from "@/test-fixtures/account-fixtures";
import avoidDetail from "@/test-fixtures/practicality-avoid-detail.json";
import sellDetail from "@/test-fixtures/practicality-sell-detail.json";
import type { StockWorkspaceDto } from "@/lib/api/stock-decision-support-types";

describe("structured audience and condition presentation", () => {
  it.each(["en", "bn"] as const)("keeps actual backend WAIT/SELL prospective AVOID accessible in %s", (locale) => {
    for (const fixture of [avoidDetail, sellDetail]) {
      expect(fixture.decision_support.decision.non_holder_action).toBe("AVOID");
      const html = renderToStaticMarkup(<StockDurableSummary workspace={fixture as unknown as StockWorkspaceDto} locale={locale} />);
      expect(html).toContain("AVOID");
      expect(html).toContain(locale === "en" ? "For a prospective entry" : "নতুন অবস্থান বিবেচনায়");
    }
    const view=entryAssessmentPresentation({ status:"AWAITING_CONFIRMATION",reason_code:"COMPLETED_PULLBACK_HOLD_REQUIRED",price_basis:"CURRENT",source_observed_at:"2026-11-15T05:00:00Z" },locale);
    expect(view?.label).toContain(locale === "en" ? "Awaiting pullback hold" : "Pullback hold-এর অপেক্ষায়");
    expect(view?.detail).toContain(locale === "en" ? "subsequent session" : "পরের অনুমোদিত session");
    expect(view?.label).not.toContain("broker");
    expect(eligibilityRestrictionLabel(["median_turnover_below_policy","category_z_review"],locale)).toContain(locale === "en" ? "Turnover/category policy" : "turnover/category নীতি");
    expect(eligibilityRestrictionLabel(["limited_valid_history"],locale)).toContain(locale === "en" ? "Missing or invalid data" : "অপর্যাপ্ত বা অবৈধ তথ্য");
    expect(eligibilityRestrictionLabel(["median_turnover_below_policy","category_z_review"],locale)).not.toBe(eligibilityRestrictionLabel(["limited_valid_history"],locale));
    expect(decisionConditionLabel("market_evidence_unknown", {status:"NOT_APPLICABLE",reason_code:"ACTION_NOT_PERMITTED"},locale)).toBe("");
    expect(decisionConditionLabel("bearish_market_regime",null,locale)).toContain(locale === "en" ? "Market" : "বাজার");
  });
  it("uses delivered watch-only AVOID without inventing a comparison or changing holder guidance",()=>{
    const watched=accountRow({ is_holding:false,action:"WAIT",non_holder_action:"AVOID" });
    expect(portfolioRowAction(watched)).toBe("AVOID");
    expect(portfolioRowAction({ ...watched,non_holder_action:undefined })).toBe("WAIT");
    expect(portfolioRowAction({ ...watched,is_holding:true,holder_action:"REVIEW" })).toBe("REVIEW");
    expect(portfolioRowComparison({ ...watched,public_comparison:{status:"UNCHANGED",current_action:"WAIT",previous_action:"WAIT",previous_session_date:"2026-11-11"} })).toBeNull();
  });
});
