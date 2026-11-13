/** @vitest-environment jsdom */
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { selectedDecisionExplanation, controllingReasonLabel } from "./decision-presentation";
import { PricePositionPanel } from "@/features/stock-workspace/components/price-position-panel";
import { buildStockDecisionViewModel } from "@/features/stock-workspace/view-models/stock-decision-view-model";
import { order4SurfaceFixture } from "@/test-fixtures/order4-surface-fixtures";
import { getStockWorkspaceLanguage } from "@/features/stock-workspace/stock-workspace-language";

describe("QA provenance and explanations", () => {
  it.each(["en", "bn"] as const)("keeps the marked price dated even when quote authority is missing (%s)", locale => {
    const decision = buildStockDecisionViewModel(order4SurfaceFixture().support, locale);
    decision.tradePlanVisual.asOfDate = "2026-11-10";
    const html = renderToStaticMarkup(<PricePositionPanel decision={decision} copy={getStockWorkspaceLanguage(locale).panels} locale={locale} />);
    expect(html).toContain(locale === "bn" ? "সিদ্ধান্তের ভিত্তিদর" : "Decision reference");
    expect(html).toContain(locale === "bn" ? "10 নভেম্বর" : "10 Nov");
    expect(html).not.toContain(locale === "bn" ? "এখন 103" : "Current 103");
  });
  it.each(["en", "bn"] as const)("uses the published opposing factor and level without inventing a blocker (%s)", locale => {
    const decision = {opposing_component:{key:"price_position",label:"Price position",score:32,weight:0.2,explanation:""}};
    const a = selectedDecisionExplanation(decision, locale, {resistance:16.9});
    const b = selectedDecisionExplanation(decision, locale, {resistance:38.7});
    expect(a.limitation).toContain("32/100"); expect(a.limitation).toContain("16.90");
    expect(b.limitation).toContain("38.70"); expect(a.limitation).not.toEqual(b.limitation);
    expect(selectedDecisionExplanation(decision,locale).limitation).not.toContain("resistance");
    expect(controllingReasonLabel("lower_structure","",locale)).toContain(locale === "bn" ? "আলাদাভাবে" : "separately");
  });
});
